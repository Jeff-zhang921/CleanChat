import type { Request, Response } from "express";
import { ChatRequestStatus, PrismaClient } from "@prisma/client";
import { clearThreadMuteForAllUsers } from "../muteStore";
import { clearDirectReadCheckpointForAllUsers } from "../readCheckpointStore";

const prisma = new PrismaClient();

type SocketEmitter = {
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void;
  };
};

const ensureAuth = (
  sessionUserId: number | undefined,
): sessionUserId is number =>
  typeof sessionUserId === "number" &&
  Number.isInteger(sessionUserId) &&
  sessionUserId > 0;

const parsePositiveInt = (raw: unknown): number | null => {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const resolveConversationId = (request: Request) =>
  parsePositiveInt(request.params.id ?? request.params.threadId);

export const deleteConversation = async (
  request: Request,
  response: Response,
) => {
  const userId = request.user?.userId;
  if (!ensureAuth(userId)) {
    response.status(401).json({ message: "Unauthorized" });
    return;
  }

  const conversationId = resolveConversationId(request);
  if (!conversationId) {
    response.status(400).json({ message: "Invalid conversation ID" });
    return;
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: conversationId },
    select: { id: true, AID: true, BID: true },
  });

  if (!thread || (thread.AID !== userId && thread.BID !== userId)) {
    response.status(404).json({ message: "Conversation not found" });
    return;
  }

  const deletedAt = new Date();
  const transactionResult = await prisma.$transaction(async (tx) => {
    const deletedMessages = await tx.chatMessage.deleteMany({
      where: { threadId: conversationId },
    });

    const invalidatedRequests = await tx.chatRequest.updateMany({
      where: {
        status: ChatRequestStatus.ACCEPTED,
        OR: [
          { requesterId: thread.AID, recipientId: thread.BID },
          { requesterId: thread.BID, recipientId: thread.AID },
        ],
      },
      data: {
        status: ChatRequestStatus.REJECTED,
        acceptedThreadId: null,
        resolvedAt: deletedAt,
      },
    });

    await tx.chatThread.delete({
      where: { id: conversationId },
    });

    return {
      deletedMessageCount: deletedMessages.count,
      invalidatedRequestCount: invalidatedRequests.count,
    };
  });

  clearThreadMuteForAllUsers(conversationId);
  clearDirectReadCheckpointForAllUsers(conversationId);

  const payload = {
    threadId: conversationId,
    deletedBy: userId,
    deletedAt: deletedAt.toISOString(),
  };
  const io = request.app.get("io") as SocketEmitter | undefined;
  io?.to(`user:${thread.AID}`).emit("thread:deleted", payload);
  io?.to(`user:${thread.BID}`).emit("thread:deleted", payload);

  response.status(200).json({
    conversationId,
    deletedMessages: transactionResult.deletedMessageCount,
    invalidatedRequests: transactionResult.invalidatedRequestCount,
    irreversible: true,
    message: "Conversation permanently deleted.",
  });
};
