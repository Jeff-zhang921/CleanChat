import type { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { ChatRequestStatus, PrismaClient } from "@prisma/client";
import {
  appendGroupMessage,
  deleteGroupMessage,
  getGroupById,
  isGroupMember,
  listGroupMemberIds,
  listGroupMessages,
  normalizeGroupId,
} from "../groupStore";

import { getUserIdFromToken } from "../auth";
import { sendPushToUser } from "../push";
import { isGroupMutedForUser, isThreadMutedForUser } from "../muteStore";
const prisma = new PrismaClient();

const IMAGE_MESSAGE_PREFIX = "IMG::";
const IMAGE_URL_REGEX =
  /^https:\/\/(?:utfs\.io|(?:[a-z0-9-]+\.)?ufs\.sh|[^/\s]*uploadthing\.com)\//i;
const IMAGE_EXTENSION_REGEX =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)(?:\?.*)?$/i;
const PUSH_BODY_MAX_CHARS = 160;
const RECALLED_MESSAGE_BODY = "__CLEANCHAT_RECALLED__";

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

const getImageUrlFromMessage = (body: string) => {
  const trimmed = body.trim();
  const normalized = trimmed.startsWith(IMAGE_MESSAGE_PREFIX)
    ? trimmed.slice(IMAGE_MESSAGE_PREFIX.length).trim()
    : trimmed;
  if (!normalized || !isHttpUrl(normalized)) {
    return null;
  }

  if (
    IMAGE_URL_REGEX.test(normalized) ||
    IMAGE_EXTENSION_REGEX.test(normalized)
  ) {
    return normalized;
  }

  return null;
};

const formatPushPreview = (body: string) => {
  if (body === RECALLED_MESSAGE_BODY) {
    return "A message was recalled.";
  }

  if (getImageUrlFromMessage(body)) {
    return "sent a photo";
  }

  const trimmed = body.trim();
  if (!trimmed) {
    return "You have a new message.";
  }

  return trimmed.length > PUSH_BODY_MAX_CHARS
    ? `${trimmed.slice(0, PUSH_BODY_MAX_CHARS - 1)}...`
    : trimmed;
};

const PUSH_ENTRY_QUERY = "fromPush=1";

const buildDirectChatUrl = (threadId: number) =>
  `/chat/${threadId}?${PUSH_ENTRY_QUERY}`;

const buildGroupChatUrl = (groupId: string) =>
  `/chat/group/${encodeURIComponent(groupId)}?${PUSH_ENTRY_QUERY}`;

const defaultOrigins = [
  "http://localhost:4173",
  "http://localhost:5173",
  "http://localhost:5273",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5273",
];
const envOrigins = (process.env.FRONTEND_URLS ?? process.env.FRONTEND_URL ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = [...new Set([...defaultOrigins, ...envOrigins])];

export function initSocket(server: HTTPServer) {
  //io now is the big server
  const io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      credentials: true,
    },
  });
  io.use((socket, next) => {
    const authorizationHeader = socket.handshake.headers.authorization;
    const tokenFromAuth =
      typeof socket.handshake.auth?.token === "string"
        ? socket.handshake.auth.token
        : "";
    const token =
      tokenFromAuth ||
      (authorizationHeader?.startsWith("Bearer ")
        ? authorizationHeader.slice(7).trim()
        : "");

    if (!token) {
      return next(new Error("Not authenticated"));
    }

    try {
      const userId = getUserIdFromToken(token);
      void (async () => {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, email: true, name: true, cleanId: true },
        });
        if (!user) {
          next(new Error("Not authenticated"));
          return;
        }
        socket.data.user = user;
        next();
      })().catch(() => next(new Error("Not authenticated")));
    } catch {
      next(new Error("Not authenticated"));
    }
  });
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.data.user);
    const sessionUser = socket.data.user;
    socket.join(`user:${sessionUser.id}`);
    const emitChatError = (message: string) => {
      socket.emit("chat:error", message);
      socket.emit("message:error", message);
      socket.emit("Thread:error", message);
      socket.emit("thread:error", message);
    };
    const ensureThreadValid = (raw: unknown): number | null => {
      const candidate =
        typeof raw === "object" && raw !== null && "threadId" in raw
          ? (raw as { threadId?: unknown }).threadId
          : raw;
      const parsedid =
        typeof candidate === "number" ? candidate : Number(candidate);
      if (!Number.isInteger(parsedid) || isNaN(parsedid) || parsedid <= 0) {
        console.warn("Invalid thread id:", raw);
        return null;
      }
      return parsedid;
    };
    const ensureMemberShip = async (threadId: number, userId: number) => {
      if (!threadId || !userId) {
        return null;
      }
      const thread = await prisma.chatThread.findUnique({
        where: {
          id: threadId,
        },
        select: { id: true, AID: true, BID: true },
      });
      if (!thread) {
        return null;
      }
      if (thread.AID !== userId && thread.BID !== userId) {
        return null;
      }
      return thread;
    };
    const ensureDirectMessagingAllowed = async (
      thread: { id: number; AID: number; BID: number },
      senderId: number,
    ) => {
      const recipientId = thread.AID === senderId ? thread.BID : thread.AID;

      const incomingBlock = await prisma.chatBlock.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: recipientId,
            blockedId: senderId,
          },
        },
        select: { id: true },
      });
      if (incomingBlock) {
        return "You are blocked by this user.";
      }

      const outgoingBlock = await prisma.chatBlock.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: senderId,
            blockedId: recipientId,
          },
        },
        select: { id: true },
      });
      if (outgoingBlock) {
        return "Unblock this user before sending messages.";
      }

      const acceptedRequest = await prisma.chatRequest.findFirst({
        where: {
          status: ChatRequestStatus.ACCEPTED,
          acceptedThreadId: thread.id,
          OR: [
            { requesterId: senderId, recipientId },
            { requesterId: recipientId, recipientId: senderId },
          ],
        },
        select: { id: true },
      });
      if (!acceptedRequest) {
        const existingMessage = await prisma.chatMessage.findFirst({
          where: { threadId: thread.id },
          select: { id: true },
        });
        if (!existingMessage) {
          return "Chat request has not been accepted yet.";
        }
      }

      return null;
    };
    const ensureGroupId = (raw: unknown): string | null => {
      const candidate =
        typeof raw === "object" && raw !== null && "groupId" in raw
          ? (raw as { groupId?: unknown }).groupId
          : raw;
      return normalizeGroupId(candidate);
    };
    const ensureMessageId = (raw: unknown): number | null => {
      const candidate =
        typeof raw === "object" && raw !== null && "messageId" in raw
          ? (raw as { messageId?: unknown }).messageId
          : raw;
      const parsedId =
        typeof candidate === "number" ? candidate : Number(candidate);
      if (!Number.isInteger(parsedId) || isNaN(parsedId) || parsedId <= 0) {
        console.warn("Invalid message id:", raw);
        return null;
      }
      return parsedId;
    };
    const handleJoinThread = async (threadIdRaw: unknown) => {
      const threadId = ensureThreadValid(threadIdRaw);
      if (!threadId) {
        emitChatError("Invalid thread ID");
        return;
      }
      const thread = await ensureMemberShip(threadId, sessionUser.id);
      if (!thread) {
        emitChatError("Thread not found or access denied");
        return;
      }
      socket.join(`thread:${threadId}`);
      console.log(`User ${sessionUser.id} joined thread ${threadId}`);
    };
    const handleJoinGroup = (groupIdRaw: unknown) => {
      const groupId = ensureGroupId(groupIdRaw);
      if (!groupId) {
        emitChatError("Invalid group ID");
        return;
      }
      if (!getGroupById(groupId)) {
        emitChatError("Group not found");
        return;
      }
      if (!isGroupMember(groupId, sessionUser.id)) {
        emitChatError("Join this group first");
        return;
      }
      socket.join(`group:${groupId}`);
      console.log(`User ${sessionUser.id} joined group ${groupId}`);
    };
    socket.on("thread:join", handleJoinThread);
    socket.on("Thread:join", handleJoinThread);
    socket.on("group:join", handleJoinGroup);

    socket.on("message:send", async (data: unknown) => {
      const payload =
        typeof data === "object" && data !== null
          ? (data as {
              threadId?: unknown;
              content?: unknown;
              body?: unknown;
              parentMessageId?: unknown;
              quoteSenderName?: unknown;
              quotePreview?: unknown;
            })
          : {};
      const { threadId } = payload;
      const content =
        typeof payload.content === "string"
          ? payload.content
          : typeof payload.body === "string"
            ? payload.body
            : "";
      const parentMessageIdRaw =
        typeof payload.parentMessageId === "number"
          ? payload.parentMessageId
          : Number(payload.parentMessageId);
      const parentMessageId =
        Number.isInteger(parentMessageIdRaw) && parentMessageIdRaw > 0
          ? parentMessageIdRaw
          : null;
      const quoteSenderName =
        typeof payload.quoteSenderName === "string"
          ? payload.quoteSenderName.trim().slice(0, 80)
          : "";
      const quotePreview =
        typeof payload.quotePreview === "string"
          ? payload.quotePreview.trim().slice(0, 220)
          : "";
      const validThreadId = ensureThreadValid(threadId);
      if (!validThreadId) {
        emitChatError("Invalid thread ID");
        return;
      }
      const thread = await ensureMemberShip(validThreadId, sessionUser.id);
      if (!thread) {
        emitChatError("Thread not found or access denied");
        return;
      }
      const blockMessage = await ensureDirectMessagingAllowed(
        thread,
        sessionUser.id,
      );
      if (blockMessage) {
        emitChatError(blockMessage);
        return;
      }
      if (typeof content !== "string" || content.trim() === "") {
        emitChatError("Content cannot be empty");
        return;
      }

      let resolvedParentMessageId: number | null = null;
      let resolvedQuoteSenderName = quoteSenderName || null;
      let resolvedQuotePreview = quotePreview || null;

      if (parentMessageId) {
        const parentMessage = await prisma.chatMessage.findUnique({
          where: { id: parentMessageId },
          select: {
            id: true,
            threadId: true,
            body: true,
            sender: {
              select: {
                name: true,
                cleanId: true,
              },
            },
          },
        });

        if (parentMessage && parentMessage.threadId === validThreadId) {
          resolvedParentMessageId = parentMessage.id;
          if (!resolvedQuotePreview) {
            resolvedQuotePreview =
              parentMessage.body.trim().slice(0, 220) || null;
          }
          if (!resolvedQuoteSenderName) {
            resolvedQuoteSenderName =
              parentMessage.sender?.name?.trim() ||
              parentMessage.sender?.cleanId ||
              null;
          }
        }
      }

      const message = await prisma.chatMessage.create({
        data: {
          threadId: validThreadId,
          senderId: sessionUser.id,
          body: content.trim(),
          parentMessageId: resolvedParentMessageId,
          quoteSenderName: resolvedQuoteSenderName,
          quotePreview: resolvedQuotePreview,
        },
        select: {
          id: true,
          body: true,
          senderId: true,
          createdAt: true,
        },
      });
      await prisma.chatThread.update({
        where: { id: validThreadId },
        data: { lastMessageAt: new Date() },
      });
      const messagePayload = {
        id: message.id,
        threadId: validThreadId,
        body: message.body,
        senderId: message.senderId,
        createdAt: message.createdAt,
        parentMessageId: resolvedParentMessageId,
        quoteSenderName: resolvedQuoteSenderName,
        quotePreview: resolvedQuotePreview,
        quotedContent:
          resolvedQuoteSenderName || resolvedQuotePreview
            ? {
                senderName: resolvedQuoteSenderName,
                preview: resolvedQuotePreview,
              }
            : null,
      };

      io.to(`thread:${validThreadId}`).emit("message:new", messagePayload);
      io.to(`user:${thread.AID}`).emit("inbox:new", messagePayload);
      io.to(`user:${thread.BID}`).emit("inbox:new", messagePayload);

      const recipientIds = [thread.AID, thread.BID].filter(
        (recipientId) => recipientId !== sessionUser.id,
      );
      const senderLabel = sessionUser.name?.trim() || `@${sessionUser.cleanId}`;
      const pushBody = formatPushPreview(message.body);

      recipientIds.forEach((recipientId) => {
        if (isThreadMutedForUser(recipientId, validThreadId)) {
          return;
        }

        void sendPushToUser(prisma, recipientId, {
          title: `${senderLabel} sent a message`,
          body: pushBody,
          tag: `thread-${validThreadId}`,
          data: {
            chatType: "direct",
            threadId: validThreadId,
            senderName: senderLabel,
            summary: pushBody,
            url: buildDirectChatUrl(validThreadId),
          },
        });
      });
    });
    socket.on(
      "message:delete",
      async (
        data: unknown,
        callback?: (result: { ok: boolean; message?: string }) => void,
      ) => {
        const reply = (ok: boolean, message?: string) => {
          if (typeof callback === "function") {
            callback({ ok, message });
          }
        };
        try {
          const payload =
            typeof data === "object" && data !== null
              ? (data as { threadId?: unknown; messageId?: unknown })
              : {};
          const validThreadId = ensureThreadValid(payload.threadId);
          if (!validThreadId) {
            const errorMessage = "Invalid thread ID";
            emitChatError(errorMessage);
            reply(false, errorMessage);
            return;
          }
          const messageId = ensureMessageId(payload.messageId);
          if (!messageId) {
            const errorMessage = "Invalid message ID";
            emitChatError(errorMessage);
            reply(false, errorMessage);
            return;
          }

          const thread = await ensureMemberShip(validThreadId, sessionUser.id);
          if (!thread) {
            const errorMessage = "Thread not found or access denied";
            emitChatError(errorMessage);
            reply(false, errorMessage);
            return;
          }

          const targetMessage = await prisma.chatMessage.findUnique({
            where: { id: messageId },
            select: { id: true, threadId: true, senderId: true },
          });
          if (!targetMessage || targetMessage.threadId !== validThreadId) {
            const errorMessage = "Message not found";
            emitChatError(errorMessage);
            reply(false, errorMessage);
            return;
          }
          if (targetMessage.senderId !== sessionUser.id) {
            const errorMessage = "You can only delete your own messages.";
            emitChatError(errorMessage);
            reply(false, errorMessage);
            return;
          }

          await prisma.chatMessage.update({
            where: { id: targetMessage.id },
            data: { body: RECALLED_MESSAGE_BODY },
          });

          const recalledPayload = {
            id: targetMessage.id,
            threadId: validThreadId,
            deletedBy: sessionUser.id,
          };
          io.to(`thread:${validThreadId}`).emit(
            "message:recalled",
            recalledPayload,
          );
          io.to(`thread:${validThreadId}`).emit(
            "message:deleted",
            recalledPayload,
          );
          io.to(`user:${thread.AID}`).emit("message:recalled", recalledPayload);
          io.to(`user:${thread.BID}`).emit("message:recalled", recalledPayload);
          io.to(`user:${thread.AID}`).emit("message:deleted", recalledPayload);
          io.to(`user:${thread.BID}`).emit("message:deleted", recalledPayload);
          reply(true);
        } catch {
          const errorMessage = "Failed to delete message.";
          emitChatError(errorMessage);
          reply(false, errorMessage);
        }
      },
    );

    socket.on("group:message:send", (data: unknown) => {
      const payload =
        typeof data === "object" && data !== null
          ? (data as {
              groupId?: unknown;
              content?: unknown;
              body?: unknown;
              parentMessageId?: unknown;
              quoteSenderName?: unknown;
              quotePreview?: unknown;
            })
          : {};
      const groupId = ensureGroupId(payload.groupId);
      if (!groupId) {
        emitChatError("Invalid group ID");
        return;
      }
      if (!getGroupById(groupId)) {
        emitChatError("Group not found");
        return;
      }
      if (!isGroupMember(groupId, sessionUser.id)) {
        emitChatError("Join this group first");
        return;
      }

      const content =
        typeof payload.content === "string"
          ? payload.content
          : typeof payload.body === "string"
            ? payload.body
            : "";
      const parentMessageIdRaw =
        typeof payload.parentMessageId === "number"
          ? payload.parentMessageId
          : Number(payload.parentMessageId);
      const parentMessageId =
        Number.isInteger(parentMessageIdRaw) && parentMessageIdRaw > 0
          ? parentMessageIdRaw
          : null;
      const quoteSenderName =
        typeof payload.quoteSenderName === "string"
          ? payload.quoteSenderName.trim().slice(0, 80)
          : "";
      const quotePreview =
        typeof payload.quotePreview === "string"
          ? payload.quotePreview.trim().slice(0, 220)
          : "";
      if (content.trim() === "") {
        emitChatError("Content cannot be empty");
        return;
      }

      let resolvedParentMessageId: number | null = null;
      let resolvedQuoteSenderName = quoteSenderName || null;
      let resolvedQuotePreview = quotePreview || null;

      if (parentMessageId) {
        const parentMessage = listGroupMessages(groupId).find(
          (item) => item.id === parentMessageId,
        );
        if (parentMessage) {
          resolvedParentMessageId = parentMessage.id;
          if (!resolvedQuoteSenderName) {
            resolvedQuoteSenderName = parentMessage.senderName || null;
          }
          if (!resolvedQuotePreview) {
            resolvedQuotePreview =
              parentMessage.body.trim().slice(0, 220) || null;
          }
        }
      }

      const message = appendGroupMessage(groupId, sessionUser, content.trim(), {
        parentMessageId: resolvedParentMessageId,
        quoteSenderName: resolvedQuoteSenderName,
        quotePreview: resolvedQuotePreview,
      });
      socket.join(`group:${groupId}`);
      const memberIds = listGroupMemberIds(groupId);
      memberIds.forEach((memberId) => {
        io.to(`user:${memberId}`).emit("group:message:new", message);
      });

      const group = getGroupById(groupId);
      const senderLabel = sessionUser.name?.trim() || `@${sessionUser.cleanId}`;
      const pushBody = formatPushPreview(message.body);

      memberIds
        .filter((memberId) => memberId !== sessionUser.id)
        .forEach((memberId) => {
          if (isGroupMutedForUser(memberId, groupId)) {
            return;
          }

          void sendPushToUser(prisma, memberId, {
            title: `${group?.name ?? "Group"} · ${senderLabel}`,
            body: pushBody,
            tag: `group-${groupId}`,
            data: {
              chatType: "group",
              groupId,
              senderName: senderLabel,
              summary: pushBody,
              url: buildGroupChatUrl(groupId),
            },
          });
        });
    });
    socket.on(
      "group:message:delete",
      (
        data: unknown,
        callback?: (result: { ok: boolean; message?: string }) => void,
      ) => {
        const reply = (ok: boolean, message?: string) => {
          if (typeof callback === "function") {
            callback({ ok, message });
          }
        };
        const payload =
          typeof data === "object" && data !== null
            ? (data as { groupId?: unknown; messageId?: unknown })
            : {};
        const groupId = ensureGroupId(payload.groupId);
        if (!groupId) {
          const errorMessage = "Invalid group ID";
          emitChatError(errorMessage);
          reply(false, errorMessage);
          return;
        }
        if (!getGroupById(groupId)) {
          const errorMessage = "Group not found";
          emitChatError(errorMessage);
          reply(false, errorMessage);
          return;
        }
        if (!isGroupMember(groupId, sessionUser.id)) {
          const errorMessage = "Join this group first";
          emitChatError(errorMessage);
          reply(false, errorMessage);
          return;
        }
        const messageId = ensureMessageId(payload.messageId);
        if (!messageId) {
          const errorMessage = "Invalid message ID";
          emitChatError(errorMessage);
          reply(false, errorMessage);
          return;
        }

        const deleted = deleteGroupMessage(groupId, messageId, sessionUser.id);
        if (!deleted.deleted) {
          const errorMessage =
            deleted.reason === "forbidden"
              ? "You can only delete your own group messages."
              : "Message not found";
          emitChatError(errorMessage);
          reply(false, errorMessage);
          return;
        }

        socket.join(`group:${groupId}`);
        const recalledPayload = {
          id: deleted.message.id,
          groupId,
          deletedBy: sessionUser.id,
        };
        io.to(`group:${groupId}`).emit(
          "group:message:recalled",
          recalledPayload,
        );
        io.to(`group:${groupId}`).emit(
          "group:message:deleted",
          recalledPayload,
        );
        const memberIds = listGroupMemberIds(groupId);
        memberIds.forEach((memberId) => {
          io.to(`user:${memberId}`).emit(
            "group:message:recalled",
            recalledPayload,
          );
          io.to(`user:${memberId}`).emit(
            "group:message:deleted",
            recalledPayload,
          );
        });
        reply(true);
      },
    );
  });
  return io;
}
