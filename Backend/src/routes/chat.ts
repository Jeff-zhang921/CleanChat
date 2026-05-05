import { Router, type Request } from "express";
import { ChatRequestStatus, PrismaClient } from "@prisma/client";
import multer from "multer";
import { UTApi, UTFile } from "uploadthing/server";
import {
  acceptGroupInvitation,
  approveGroupJoinRequest,
  appendGroupMessage,
  COMMUNITY_CATEGORIES,
  createGroup,
  deleteGroup,
  GROUP_AVATAR_KEYS,
  getGroupById,
  inviteUserToGroup,
  isValidGroupAvatarKey,
  listGroupInvitationsForUser,
  listGroupJoinRequests,
  joinGroup,
  leaveGroup,
  listGroupMemberIds,
  listGroupMessages,
  listGroupsForUser,
  normalizeGroupId,
  rejectGroupInvitation,
  rejectGroupJoinRequest,
  removeGroupMember,
  resolveCommunityCategorySelection,
  updateGroupAvatar,
  updateGroupJoinPolicy,
  isGroupMember,
} from "../groupStore";
import { authMiddleware } from "../auth";
import { deleteConversation } from "../controllers/conversation";
import {
  clearGroupReadCheckpointForAllUsers,
  ensureDirectReadCheckpoint,
  ensureGroupReadCheckpoint,
  getDirectReadCheckpoint,
  getGroupReadCheckpoint,
  pruneDirectReadCheckpointsForUser,
  pruneGroupReadCheckpointsForUser,
  syncDirectReadCheckpoint,
  syncGroupReadCheckpoint,
} from "../readCheckpointStore";
import {
  clearGroupMuteForAllUsers,
  clearGroupMuteForUser,
  isGroupMutedForUser,
  isThreadMutedForUser,
  listMutedGroupIdsForUser,
  listMutedThreadIdsForUser,
  setGroupMutedForUser,
  setThreadMutedForUser,
} from "../muteStore";

const router = Router();
const prisma = new PrismaClient();
const utapi = new UTApi();
const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
//multer is a middleware to set up the req.file for image upload
//initalise
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
});

//is keyword: if true then type numer|undefined will be narrowed to number
const ensureAuth = (
  sessionUserId: number | undefined,
): sessionUserId is number =>
  typeof sessionUserId === "number" &&
  Number.isInteger(sessionUserId) &&
  sessionUserId > 0;

const GROUP_NAME_MIN_LENGTH = 2;
const GROUP_NAME_MAX_LENGTH = 48;
const GROUP_DESCRIPTION_MAX_LENGTH = 180;
const DIRECT_REQUEST_NOTE_MAX_LENGTH = 180;
const CHAT_REQUEST_ACCEPTED_MESSAGE_BODY =
  "__CLEANCHAT_CHAT_REQUEST_ACCEPTED__";

const directUnreadKey = (threadId: number) => `direct-${threadId}`;
const groupUnreadKey = (groupId: string) => `group-${groupId}`;

type DirectThreadRef = {
  id: number;
  AID: number;
  BID: number;
};

type SocketEmitter = {
  emit?: (event: string, payload: unknown) => void;
  to: (room: string) => {
    emit: (event: string, payload: unknown) => void;
  };
};

const GROUP_MEMBER_JOINED_MESSAGE_PREFIX = "__CLEANCHAT_GROUP_MEMBER_JOINED__:";

const resolveDisplayLabel = (user: {
  name: string | null;
  cleanId: string;
  email: string;
}) => {
  const resolvedName = user.name?.trim();
  if (resolvedName) {
    return resolvedName;
  }

  const resolvedCleanId = user.cleanId?.trim();
  if (resolvedCleanId) {
    return resolvedCleanId;
  }

  const fallback = user.email.split("@")[0]?.trim();
  return fallback || "User";
};

const buildGroupMemberJoinedBody = (senderLabel: string) =>
  `${GROUP_MEMBER_JOINED_MESSAGE_PREFIX}${encodeURIComponent(senderLabel)}`;

const buildRealtimePayload = (payload: Record<string, unknown>) => ({
  ...payload,
  updatedAt: new Date().toISOString(),
});

const emitToUser = (
  req: Request,
  userId: number | null | undefined,
  event: string,
  payload: Record<string, unknown>,
) => {
  if (!Number.isInteger(userId) || Number(userId) <= 0) {
    return;
  }

  const io = req.app.get("io") as SocketEmitter | undefined;
  if (!io) {
    return;
  }

  io.to(`user:${userId}`).emit(event, buildRealtimePayload(payload));
};

const emitToAll = (
  req: Request,
  event: string,
  payload: Record<string, unknown>,
) => {
  const io = req.app.get("io") as SocketEmitter | undefined;
  if (!io) {
    return;
  }

  if (typeof io.emit !== "function") {
    return;
  }

  io.emit(event, buildRealtimePayload(payload));
};

const emitGroupCatalogUpdated = (
  req: Request,
  groupId: string,
  payload: Record<string, unknown>,
) => {
  const group = getGroupById(groupId);
  if (group?.groupKind === "private") {
    listGroupMemberIds(groupId).forEach((memberId) => {
      emitToUser(req, memberId, "group:catalog-updated", {
        ...payload,
        groupId,
      });
    });
    return;
  }

  emitToAll(req, "group:catalog-updated", {
    ...payload,
    groupId,
  });
};

const emitGroupMessage = (req: Request, groupId: string, payload: unknown) => {
  const io = req.app.get("io") as SocketEmitter | undefined;
  if (!io) {
    return;
  }

  const memberIds = listGroupMemberIds(groupId);
  memberIds.forEach((memberId) => {
    io.to(`user:${memberId}`).emit("group:message:new", payload);
  });
};

const readLatestDirectMessageId = async (threadId: number) => {
  const latest = await prisma.chatMessage.findFirst({
    where: { threadId },
    orderBy: { id: "desc" },
    select: { id: true },
  });

  return latest?.id ?? 0;
};

const readLatestGroupMessageId = (groupId: string) => {
  const messages = listGroupMessages(groupId);
  if (messages.length === 0) {
    return 0;
  }

  return messages[messages.length - 1].id;
};

const buildUnreadCountsForUser = async (userId: number) => {
  const [directThreads, joinedGroups] = await Promise.all([
    prisma.chatThread.findMany({
      where: {
        OR: [{ AID: userId }, { BID: userId }],
      },
      select: {
        id: true,
        Messages: {
          take: 1,
          orderBy: { id: "desc" },
          select: { id: true },
        },
      },
    }),
    Promise.resolve(listGroupsForUser(userId).filter((group) => group.joined)),
  ]);

  const activeDirectIds = new Set(directThreads.map((thread) => thread.id));
  pruneDirectReadCheckpointsForUser(userId, activeDirectIds);

  directThreads.forEach((thread) => {
    ensureDirectReadCheckpoint(userId, thread.id, thread.Messages[0]?.id ?? 0);
  });

  const directUnreadEntries = await Promise.all(
    directThreads.map(async (thread) => {
      const lastReadMessageId = getDirectReadCheckpoint(userId, thread.id) ?? 0;
      const unread = await prisma.chatMessage.count({
        where: {
          threadId: thread.id,
          senderId: { not: userId },
          id: { gt: lastReadMessageId },
        },
      });

      return [directUnreadKey(thread.id), unread] as const;
    }),
  );

  const activeGroupIds = new Set(joinedGroups.map((group) => group.id));
  pruneGroupReadCheckpointsForUser(userId, activeGroupIds);

  const groupUnreadEntries = joinedGroups.map((group) => {
    ensureGroupReadCheckpoint(
      userId,
      group.id,
      readLatestGroupMessageId(group.id),
    );

    const lastReadMessageId = getGroupReadCheckpoint(userId, group.id) ?? 0;
    const unread = listGroupMessages(group.id).reduce((sum, item) => {
      if (item.senderId === userId || item.id <= lastReadMessageId) {
        return sum;
      }
      return sum + 1;
    }, 0);

    return [groupUnreadKey(group.id), unread] as const;
  });

  const counts: Record<string, number> = {};
  let directTotal = 0;
  let groupTotal = 0;

  directUnreadEntries.forEach(([key, count]) => {
    if (count > 0) {
      counts[key] = count;
      directTotal += count;
    }
  });

  groupUnreadEntries.forEach(([key, count]) => {
    if (count > 0) {
      counts[key] = count;
      groupTotal += count;
    }
  });

  return {
    counts,
    directTotal,
    groupTotal,
    total: directTotal + groupTotal,
  };
};

const parsePositiveInt = (raw: unknown): number | null => {
  const parsed = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(parsed) || Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const getThreadForUser = async (threadId: number, userId: number) => {
  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
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

const getOtherThreadUserId = (
  thread: { AID: number; BID: number },
  userId: number,
) => (thread.AID === userId ? thread.BID : thread.AID);

const mapRequestStatus = (status: ChatRequestStatus) =>
  status.toLowerCase() as "pending" | "accepted" | "rejected";

const normalizeDirectRequestNote = (raw: unknown) =>
  typeof raw === "string" ? raw.trim() : "";

const findExistingDirectThread = async (userAId: number, userBId: number) =>
  prisma.chatThread.findFirst({
    where: {
      OR: [
        { AID: userAId, BID: userBId },
        { AID: userBId, BID: userAId },
      ],
    },
    select: { id: true, AID: true, BID: true },
  });

const findAcceptedDirectRequest = async (userAId: number, userBId: number) =>
  prisma.chatRequest.findFirst({
    where: {
      status: ChatRequestStatus.ACCEPTED,
      acceptedThreadId: { not: null },
      OR: [
        { requesterId: userAId, recipientId: userBId },
        { requesterId: userBId, recipientId: userAId },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

const findLatestDirectRequest = async (userAId: number, userBId: number) =>
  prisma.chatRequest.findFirst({
    where: {
      OR: [
        { requesterId: userAId, recipientId: userBId },
        { requesterId: userBId, recipientId: userAId },
      ],
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

const ensureDirectThread = async (userAId: number, userBId: number) => {
  const existing = await findExistingDirectThread(userAId, userBId);
  if (existing) {
    return { thread: existing, alreadyExisted: true };
  }

  const [AID, BID] =
    userAId < userBId ? [userAId, userBId] : [userBId, userAId];
  const created = await prisma.chatThread.create({
    data: {
      AID,
      BID,
    },
    select: { id: true, AID: true, BID: true },
  });
  return { thread: created, alreadyExisted: false };
};

const emitDirectThreadMessage = (
  req: Request,
  thread: DirectThreadRef,
  messagePayload: {
    id: number;
    threadId: number;
    body: string;
    senderId: number;
    createdAt: Date;
  },
) => {
  const io = req.app.get("io") as SocketEmitter | undefined;
  if (!io) {
    return;
  }

  io.to(`thread:${thread.id}`).emit("message:new", messagePayload);
  io.to(`user:${thread.AID}`).emit("inbox:new", messagePayload);
  io.to(`user:${thread.BID}`).emit("inbox:new", messagePayload);
};

const createChatRequestAcceptedMessage = async (
  thread: DirectThreadRef,
  senderId: number,
  createdAt: Date,
) => {
  const message = await prisma.chatMessage.create({
    data: {
      threadId: thread.id,
      senderId,
      body: CHAT_REQUEST_ACCEPTED_MESSAGE_BODY,
      createdAt,
    },
    select: {
      id: true,
      body: true,
      senderId: true,
      createdAt: true,
    },
  });

  await prisma.chatThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: message.createdAt },
  });

  return {
    id: message.id,
    threadId: thread.id,
    body: message.body,
    senderId: message.senderId,
    createdAt: message.createdAt,
  };
};

const ensurePairNotBlocked = async (userAId: number, userBId: number) => {
  const [blockedByA, blockedByB] = await Promise.all([
    prisma.chatBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userAId,
          blockedId: userBId,
        },
      },
      select: { id: true },
    }),
    prisma.chatBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userBId,
          blockedId: userAId,
        },
      },
      select: { id: true },
    }),
  ]);

  return {
    blockedByA: Boolean(blockedByA),
    blockedByB: Boolean(blockedByB),
  };
};

const serializeDirectRequest = (
  request: {
    id: number;
    requesterId: number;
    recipientId: number;
    note: string;
    status: ChatRequestStatus;
    acceptedThreadId: number | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
  },
  sessionUserId: number,
) => ({
  id: request.id,
  requesterId: request.requesterId,
  recipientId: request.recipientId,
  note: request.note,
  status: mapRequestStatus(request.status),
  acceptedThreadId: request.acceptedThreadId,
  createdAt: request.createdAt,
  updatedAt: request.updatedAt,
  resolvedAt: request.resolvedAt,
  direction: request.requesterId === sessionUserId ? "outgoing" : "incoming",
});

router.use(authMiddleware);

router.get("/unread-count", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  try {
    const summary = await buildUnreadCountsForUser(sessionUserId);
    res.json({
      ...summary,
      updatedAt: new Date().toISOString(),
    });
  } catch {
    res.status(500).json({ message: "Failed to compute unread counts." });
  }
});

router.get("/mutes", (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const directThreadIds = listMutedThreadIdsForUser(sessionUserId);
  const groupIds = listMutedGroupIdsForUser(sessionUserId);

  res.json({
    directThreadIds,
    groupIds,
    keys: [
      ...directThreadIds.map((threadId) => directUnreadKey(threadId)),
      ...groupIds.map((groupId) => groupUnreadKey(groupId)),
    ],
  });
});

router.post("/unread/read", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const requestedChatType =
    typeof req.body?.chatType === "string"
      ? req.body.chatType.toLowerCase()
      : "";
  const requestedMessageId = parsePositiveInt(req.body?.lastMessageId);

  if (requestedChatType === "group" || typeof req.body?.groupId === "string") {
    const groupId = normalizeGroupId(req.body?.groupId);
    if (!groupId) {
      res.status(400).json({ message: "Invalid group ID." });
      return;
    }

    const group = getGroupById(groupId);
    if (!group) {
      res.status(404).json({ message: "Group not found." });
      return;
    }

    if (!isGroupMember(groupId, sessionUserId)) {
      res.status(403).json({ message: "Join the group before chatting." });
      return;
    }

    let resolvedMessageId = requestedMessageId;
    if (resolvedMessageId) {
      const matches = listGroupMessages(groupId).some(
        (message) => message.id === resolvedMessageId,
      );
      if (!matches) {
        resolvedMessageId = null;
      }
    }

    const checkpointMessageId =
      resolvedMessageId ?? readLatestGroupMessageId(groupId);
    const lastReadMessageId = syncGroupReadCheckpoint(
      sessionUserId,
      groupId,
      checkpointMessageId,
    );

    res.json({
      ok: true,
      chatType: "group",
      groupId,
      lastReadMessageId,
    });
    return;
  }

  const threadId = parsePositiveInt(req.body?.threadId);
  if (!threadId) {
    res.status(400).json({ message: "Invalid thread ID." });
    return;
  }

  const thread = await getThreadForUser(threadId, sessionUserId);
  if (!thread) {
    res.status(404).json({ message: "Thread not found." });
    return;
  }

  let resolvedMessageId = requestedMessageId;
  if (resolvedMessageId) {
    const exists = await prisma.chatMessage.findFirst({
      where: {
        id: resolvedMessageId,
        threadId,
      },
      select: { id: true },
    });
    if (!exists) {
      resolvedMessageId = null;
    }
  }

  const checkpointMessageId =
    resolvedMessageId ?? (await readLatestDirectMessageId(threadId));
  const lastReadMessageId = syncDirectReadCheckpoint(
    sessionUserId,
    threadId,
    checkpointMessageId,
  );

  res.json({
    ok: true,
    chatType: "direct",
    threadId,
    lastReadMessageId,
  });
});

router.post(
  "/upload-image",
  (req, res, next) => {
    //upload.single("image"): 这是一个由 Multer 生成的中间件函数，
    upload.single("image")(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        res.status(413).json({
          error: `Image is too large. Max size is ${Math.floor(
            MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024),
          )}MB.`,
        });
        return;
      }

      const details = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: "Invalid image upload request.", details });
    });
  },

  async (req, res) => {
    const sessionUserId = req.user?.userId;
    if (!ensureAuth(sessionUserId)) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    if (!process.env.UPLOADTHING_TOKEN) {
      res
        .status(500)
        .json({ error: "UPLOADTHING_TOKEN is not configured on backend." });
      return;
    }
    //typeof:check type
    //is:narrow type "is" is with if
    //in:check if property exists in object
    //as: type assertion, tell compiler to treat a variable as a certain type
    //instance of: check if an object is an instance of a class or constructor function
    //?.: if null stop and return undefined
    const file = req.file as Express.Multer.File | undefined;
    if (!file) {
      res.status(400).json({ error: "Image file is required." });
      return;
    }
    //mimetype is a new property in req/file it tell server what the type of this file
    if (!file.mimetype.startsWith("image/")) {
      res.status(400).json({ error: "Only image files are allowed." });
      return;
    }

    try {
      //UTFile is file format that accepted by utapi, send it to uploadthing
      //UTFile expects a BlobPart which can be ArrayBuffer, ArrayBufferView, Blob, or string. Buffer from multer can be treated as a BlobPart.
      const uploadFile = new UTFile(
        [file.buffer as BlobPart],
        file.originalname || `chat-${Date.now()}.jpg`,
        {
          type: file.mimetype,
          lastModified: Date.now(),
        },
      );
      //utapi is the use of Uploadting API
      const uploaded = await utapi.uploadFiles(uploadFile);
      const uploadedData = Array.isArray(uploaded)
        ? uploaded[0]?.data
        : uploaded.data;
      const uploadedError = Array.isArray(uploaded)
        ? uploaded[0]?.error
        : uploaded.error;

      if (uploadedError || !uploadedData) {
        res.status(502).json({
          error: "Failed to upload image to UploadThing.",
          details: uploadedError?.message ?? null,
        });
        return;
      }

      const url = uploadedData.ufsUrl ?? uploadedData.url;
      if (!url) {
        res.status(502).json({ error: "Upload completed but URL is missing." });
        return;
      }

      res.json({ url, key: uploadedData.key });
    } catch (error) {
      const details = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: "Failed to upload image.", details });
    }
  },
);

router.get("/users/search", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const rawCleanId =
    typeof req.query.cleanId === "string"
      ? req.query.cleanId
      : typeof req.query.q === "string"
        ? req.query.q
        : "";
  const cleanIdQuery = rawCleanId.trim().toLowerCase();

  if (!cleanIdQuery) {
    res.json({ users: [] });
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      id: { not: sessionUserId },
      cleanId: {
        contains: cleanIdQuery,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      email: true,
      cleanId: true,
      avatar: true,
      gender: true,
    },
    orderBy: { cleanId: "asc" },
    take: 20,
  });

  res.json({ users });
});

router.get("/users/:userId", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const targetUserId = parsePositiveInt(req.params.userId);
  if (!targetUserId) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  if (targetUserId === sessionUserId) {
    res.status(400).json({ message: "Use /profile/me for your own profile." });
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      cleanId: true,
      avatar: true,
      gender: true,
    },
  });

  if (!targetUser) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const [existingThread, acceptedRequest, latestRequest] = await Promise.all([
    findExistingDirectThread(sessionUserId, targetUserId),
    findAcceptedDirectRequest(sessionUserId, targetUserId),
    findLatestDirectRequest(sessionUserId, targetUserId),
  ]);

  res.json({
    user: targetUser,
    relationship: {
      existingThreadId: existingThread?.id ?? null,
      canDirectMessage: Boolean(existingThread || acceptedRequest),
      accepted: Boolean(acceptedRequest),
      latestRequest: latestRequest
        ? serializeDirectRequest(latestRequest, sessionUserId)
        : null,
    },
  });
});

router.get("/requests/direct/received", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const [pendingRequests, recentRequests] = await Promise.all([
    prisma.chatRequest.findMany({
      where: {
        recipientId: sessionUserId,
        status: ChatRequestStatus.PENDING,
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            cleanId: true,
            avatar: true,
            gender: true,
          },
        },
      },
    }),
    prisma.chatRequest.findMany({
      where: {
        recipientId: sessionUserId,
        status: {
          in: [ChatRequestStatus.ACCEPTED, ChatRequestStatus.REJECTED],
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 20,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            cleanId: true,
            avatar: true,
            gender: true,
          },
        },
      },
    }),
  ]);

  res.json({
    pending: pendingRequests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: item.requester,
    })),
    recent: recentRequests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: item.requester,
    })),
  });
});

router.get("/requests/direct/sent", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const requests = await prisma.chatRequest.findMany({
    where: {
      requesterId: sessionUserId,
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 60,
    include: {
      recipient: {
        select: {
          id: true,
          name: true,
          email: true,
          cleanId: true,
          avatar: true,
          gender: true,
        },
      },
    },
  });

  res.json({
    requests: requests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: item.recipient,
    })),
  });
});

router.get("/requests/direct/target/:userId", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const targetUserId = parsePositiveInt(req.params.userId);
  if (!targetUserId) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  if (targetUserId === sessionUserId) {
    res.status(400).json({ message: "Cannot request chat with yourself." });
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      cleanId: true,
      avatar: true,
      gender: true,
    },
  });

  if (!targetUser) {
    res.status(404).json({ message: "User not found." });
    return;
  }

  const [existingThread, acceptedRequest, latestRequest, blocked] =
    await Promise.all([
      findExistingDirectThread(sessionUserId, targetUserId),
      findAcceptedDirectRequest(sessionUserId, targetUserId),
      findLatestDirectRequest(sessionUserId, targetUserId),
      ensurePairNotBlocked(sessionUserId, targetUserId),
    ]);

  res.json({
    user: targetUser,
    relationship: {
      existingThreadId: existingThread?.id ?? null,
      accepted: Boolean(acceptedRequest),
      canDirectMessage: Boolean(existingThread || acceptedRequest),
      blockedByMe: blocked.blockedByA,
      blockedMe: blocked.blockedByB,
      latestRequest: latestRequest
        ? serializeDirectRequest(latestRequest, sessionUserId)
        : null,
    },
  });
});

router.post("/requests/direct", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const rawTargetId =
    req.body?.targetUserId ??
    req.body?.userId ??
    req.body?.BId ??
    req.body?.hostId;
  const targetUserId = parsePositiveInt(rawTargetId);
  if (!targetUserId) {
    res.status(400).json({ message: "Invalid target user ID." });
    return;
  }

  if (targetUserId === sessionUserId) {
    res.status(400).json({ message: "Cannot request chat with yourself." });
    return;
  }

  const note = normalizeDirectRequestNote(
    req.body?.note ?? req.body?.message ?? req.body?.verification,
  );
  if (!note) {
    res.status(400).json({ message: "Verification note is required." });
    return;
  }
  if (note.length > DIRECT_REQUEST_NOTE_MAX_LENGTH) {
    res.status(400).json({
      message: `Verification note must be at most ${DIRECT_REQUEST_NOTE_MAX_LENGTH} characters.`,
    });
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: {
      id: true,
      name: true,
      email: true,
      cleanId: true,
      avatar: true,
      gender: true,
    },
  });
  if (!targetUser) {
    res.status(404).json({ message: "Target user not found." });
    return;
  }

  const blocked = await ensurePairNotBlocked(sessionUserId, targetUserId);
  if (blocked.blockedByB) {
    res.status(403).json({ message: "You are blocked by this user." });
    return;
  }
  if (blocked.blockedByA) {
    res.status(409).json({
      message: "Unblock this user before sending a chat request.",
    });
    return;
  }

  const existingThread = await findExistingDirectThread(
    sessionUserId,
    targetUserId,
  );
  if (existingThread) {
    res.json({
      alreadyConnected: true,
      threadId: existingThread.id,
      message: "Direct chat is already available.",
    });
    return;
  }

  const acceptedRequest = await findAcceptedDirectRequest(
    sessionUserId,
    targetUserId,
  );
  if (acceptedRequest) {
    const ensured = await ensureDirectThread(sessionUserId, targetUserId);
    const request =
      acceptedRequest.acceptedThreadId === ensured.thread.id
        ? acceptedRequest
        : await prisma.chatRequest.update({
            where: { id: acceptedRequest.id },
            data: { acceptedThreadId: ensured.thread.id },
            select: {
              id: true,
              requesterId: true,
              recipientId: true,
              note: true,
              status: true,
              acceptedThreadId: true,
              createdAt: true,
              updatedAt: true,
              resolvedAt: true,
            },
          });

    res.json({
      alreadyAccepted: true,
      threadId: ensured.thread.id,
      request: serializeDirectRequest(request, sessionUserId),
    });
    return;
  }

  const pendingIncoming = await prisma.chatRequest.findFirst({
    where: {
      requesterId: targetUserId,
      recipientId: sessionUserId,
      status: ChatRequestStatus.PENDING,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  if (pendingIncoming) {
    const now = new Date();
    const ensured = await ensureDirectThread(sessionUserId, targetUserId);
    const accepted = await prisma.chatRequest.update({
      where: { id: pendingIncoming.id },
      data: {
        status: ChatRequestStatus.ACCEPTED,
        resolvedAt: now,
        acceptedThreadId: ensured.thread.id,
      },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        note: true,
        status: true,
        acceptedThreadId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });
    const acceptedMessage = await createChatRequestAcceptedMessage(
      ensured.thread,
      sessionUserId,
      now,
    );
    emitDirectThreadMessage(req, ensured.thread, acceptedMessage);
    emitToUser(req, sessionUserId, "request:direct:resolved", {
      type: "accepted",
      requestId: accepted.id,
      requesterId: accepted.requesterId,
      recipientId: accepted.recipientId,
      threadId: ensured.thread.id,
    });
    emitToUser(req, targetUserId, "request:direct:resolved", {
      type: "accepted",
      requestId: accepted.id,
      requesterId: accepted.requesterId,
      recipientId: accepted.recipientId,
      threadId: ensured.thread.id,
    });

    res.json({
      autoAccepted: true,
      threadId: ensured.thread.id,
      request: serializeDirectRequest(accepted, sessionUserId),
      message: "An incoming request was pending and has been accepted.",
    });
    return;
  }

  const pendingOutgoing = await prisma.chatRequest.findFirst({
    where: {
      requesterId: sessionUserId,
      recipientId: targetUserId,
      status: ChatRequestStatus.PENDING,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  if (pendingOutgoing) {
    const updated = await prisma.chatRequest.update({
      where: { id: pendingOutgoing.id },
      data: {
        note,
      },
      select: {
        id: true,
        requesterId: true,
        recipientId: true,
        note: true,
        status: true,
        acceptedThreadId: true,
        createdAt: true,
        updatedAt: true,
        resolvedAt: true,
      },
    });

    emitToUser(req, targetUserId, "request:direct:new", {
      type: "updated",
      requestId: updated.id,
      requesterId: sessionUserId,
      recipientId: targetUserId,
    });

    res.json({
      alreadyPending: true,
      request: serializeDirectRequest(updated, sessionUserId),
      message: "Chat request is already pending.",
    });
    return;
  }

  const created = await prisma.chatRequest.create({
    data: {
      requesterId: sessionUserId,
      recipientId: targetUserId,
      note,
      status: ChatRequestStatus.PENDING,
    },
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  emitToUser(req, targetUserId, "request:direct:new", {
    type: "created",
    requestId: created.id,
    requesterId: sessionUserId,
    recipientId: targetUserId,
    createdAt: created.createdAt,
  });

  res.status(201).json({
    request: serializeDirectRequest(created, sessionUserId),
    message: "Chat request sent.",
  });
});

router.post("/requests/direct/:requestId/accept", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const requestId = parsePositiveInt(req.params.requestId);
  if (!requestId) {
    res.status(400).json({ message: "Invalid request ID." });
    return;
  }

  const pendingRequest = await prisma.chatRequest.findFirst({
    where: {
      id: requestId,
      recipientId: sessionUserId,
      status: ChatRequestStatus.PENDING,
    },
    include: {
      requester: {
        select: {
          id: true,
          name: true,
          email: true,
          cleanId: true,
          avatar: true,
          gender: true,
        },
      },
    },
  });

  if (!pendingRequest) {
    res.status(404).json({ message: "Chat request not found." });
    return;
  }

  const now = new Date();
  const ensured = await ensureDirectThread(
    sessionUserId,
    pendingRequest.requesterId,
  );

  const acceptedRequest = await prisma.chatRequest.update({
    where: { id: pendingRequest.id },
    data: {
      status: ChatRequestStatus.ACCEPTED,
      resolvedAt: now,
      acceptedThreadId: ensured.thread.id,
    },
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  await prisma.chatRequest.updateMany({
    where: {
      id: { not: pendingRequest.id },
      status: ChatRequestStatus.PENDING,
      OR: [
        {
          requesterId: pendingRequest.requesterId,
          recipientId: sessionUserId,
        },
        {
          requesterId: sessionUserId,
          recipientId: pendingRequest.requesterId,
        },
      ],
    },
    data: {
      status: ChatRequestStatus.REJECTED,
      resolvedAt: now,
    },
  });
  const acceptedMessage = await createChatRequestAcceptedMessage(
    ensured.thread,
    sessionUserId,
    now,
  );
  emitDirectThreadMessage(req, ensured.thread, acceptedMessage);
  emitToUser(req, sessionUserId, "request:direct:resolved", {
    type: "accepted",
    requestId: acceptedRequest.id,
    requesterId: acceptedRequest.requesterId,
    recipientId: acceptedRequest.recipientId,
    threadId: ensured.thread.id,
  });
  emitToUser(req, pendingRequest.requesterId, "request:direct:resolved", {
    type: "accepted",
    requestId: acceptedRequest.id,
    requesterId: acceptedRequest.requesterId,
    recipientId: acceptedRequest.recipientId,
    threadId: ensured.thread.id,
  });

  res.json({
    request: serializeDirectRequest(acceptedRequest, sessionUserId),
    thread: ensured.thread,
    user: pendingRequest.requester,
  });
});

router.post("/requests/direct/:requestId/reject", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const requestId = parsePositiveInt(req.params.requestId);
  if (!requestId) {
    res.status(400).json({ message: "Invalid request ID." });
    return;
  }

  const pendingRequest = await prisma.chatRequest.findFirst({
    where: {
      id: requestId,
      recipientId: sessionUserId,
      status: ChatRequestStatus.PENDING,
    },
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  if (!pendingRequest) {
    res.status(404).json({ message: "Chat request not found." });
    return;
  }

  const rejected = await prisma.chatRequest.update({
    where: { id: pendingRequest.id },
    data: {
      status: ChatRequestStatus.REJECTED,
      resolvedAt: new Date(),
    },
    select: {
      id: true,
      requesterId: true,
      recipientId: true,
      note: true,
      status: true,
      acceptedThreadId: true,
      createdAt: true,
      updatedAt: true,
      resolvedAt: true,
    },
  });

  emitToUser(req, sessionUserId, "request:direct:resolved", {
    type: "rejected",
    requestId: rejected.id,
    requesterId: rejected.requesterId,
    recipientId: rejected.recipientId,
  });
  emitToUser(req, rejected.requesterId, "request:direct:resolved", {
    type: "rejected",
    requestId: rejected.id,
    requesterId: rejected.requesterId,
    recipientId: rejected.recipientId,
  });

  res.json({
    request: serializeDirectRequest(rejected, sessionUserId),
  });
});

router.get("/groups", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const requestedScope =
    typeof req.query.scope === "string" ? req.query.scope : "";
  const scope =
    requestedScope === "communities"
      ? "communities"
      : requestedScope === "joined"
        ? "joined"
        : "all";
  const groups = listGroupsForUser(sessionUserId, { scope }).map((group) => ({
    ...group,
    mutedByMe: isGroupMutedForUser(sessionUserId, group.id),
  }));

  res.json({ groups });
});

router.get("/groups/categories", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.status(200).json({ categories: COMMUNITY_CATEGORIES });
});

router.get("/groups/invitations/received", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const invitationItems = listGroupInvitationsForUser(sessionUserId);
  const inviterIds = [
    ...new Set(invitationItems.map((item) => item.invitation.inviterUserId)),
  ];
  const inviters =
    inviterIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: inviterIds } },
          select: { id: true, name: true, email: true, cleanId: true },
        })
      : [];
  const inviterMap = new Map(inviters.map((user) => [user.id, user]));

  const invitations = invitationItems
    .map((item) => {
      const inviter = inviterMap.get(item.invitation.inviterUserId);
      if (!inviter) return null;
      return {
        id: item.invitation.id,
        groupId: item.invitation.groupId,
        createdAt: item.invitation.createdAt,
        group: item.summary,
        inviter,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  res.status(200).json({ invitations });
});

router.post("/groups", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const name =
    typeof req.body?.name === "string"
      ? req.body.name.trim().replace(/\s+/g, " ")
      : "";
  const description =
    typeof req.body?.description === "string"
      ? req.body.description.trim()
      : "";
  const groupKind = req.body?.groupKind === "private" ? "private" : "community";
  const requiresApproval =
    groupKind === "community" && req.body?.requiresApproval === true;
  const categorySelection =
    groupKind === "community"
      ? resolveCommunityCategorySelection(
          req.body?.mainCategoryId,
          req.body?.subcategoryId,
        )
      : null;
  const rawAvatarKey = req.body?.avatarKey;
  const avatarKeyProvided = typeof rawAvatarKey === "string";
  if (avatarKeyProvided && !isValidGroupAvatarKey(rawAvatarKey)) {
    res.status(400).json({
      message: `avatarKey must be one of: ${GROUP_AVATAR_KEYS.join(", ")}`,
    });
    return;
  }

  if (
    name.length < GROUP_NAME_MIN_LENGTH ||
    name.length > GROUP_NAME_MAX_LENGTH
  ) {
    res.status(400).json({
      message: `Group name must be ${GROUP_NAME_MIN_LENGTH}-${GROUP_NAME_MAX_LENGTH} characters.`,
    });
    return;
  }
  if (description.length > GROUP_DESCRIPTION_MAX_LENGTH) {
    res.status(400).json({
      message: `Description must be at most ${GROUP_DESCRIPTION_MAX_LENGTH} characters.`,
    });
    return;
  }
  if (groupKind === "community" && !categorySelection) {
    res.status(400).json({
      message: "Choose a valid main category and sub-category.",
    });
    return;
  }

  const group = createGroup(
    sessionUserId,
    name,
    description,
    requiresApproval,
    avatarKeyProvided && isValidGroupAvatarKey(rawAvatarKey)
      ? rawAvatarKey
      : undefined,
    {
      groupKind,
      mainCategoryId: categorySelection?.mainCategoryId,
      subcategoryId: categorySelection?.subcategoryId,
    },
  );
  emitGroupCatalogUpdated(req, group.id, {
    type: "created",
    actorUserId: sessionUserId,
  });
  res.status(201).json({ group });
});

router.post("/groups/:groupId/join", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const targetGroup = getGroupById(groupId);
  const joined = joinGroup(groupId, sessionUserId);
  if (!joined) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (joined.inviteOnly) {
    res.status(403).json({
      group: joined.summary,
      inviteOnly: true,
      message: "Private groups are invite-only.",
    });
    return;
  }

  if (joined.pendingApproval) {
    if (!joined.alreadyRequested) {
      emitToUser(req, targetGroup?.creatorId, "group:join-request:new", {
        type: "created",
        groupId,
        requesterId: sessionUserId,
      });
    }
    res.status(joined.alreadyRequested ? 200 : 202).json({
      group: joined.summary,
      pendingApproval: true,
      alreadyRequested: joined.alreadyRequested,
      message: joined.alreadyRequested
        ? "Join request already sent. Please wait for owner approval."
        : "Join request sent. Wait for owner approval.",
    });
    return;
  }

  if (!joined.alreadyJoined) {
    const joiner = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true, name: true, cleanId: true },
    });
    if (joiner) {
      const body = buildGroupMemberJoinedBody(resolveDisplayLabel(joiner));
      const message = appendGroupMessage(groupId, joiner, body);
      emitGroupMessage(req, groupId, message);
    }
    emitGroupCatalogUpdated(req, groupId, {
      type: "member-joined",
      actorUserId: sessionUserId,
    });
  }

  res.status(joined.alreadyJoined ? 200 : 201).json({
    group: joined.summary,
    pendingApproval: false,
    alreadyRequested: false,
  });
});

router.post("/groups/:groupId/invitations", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const targetUserId = parsePositiveInt(
    req.body?.targetUserId ?? req.body?.userId,
  );
  if (!targetUserId) {
    res.status(400).json({ message: "Invalid target user ID." });
    return;
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, name: true, email: true, cleanId: true },
  });
  if (!targetUser) {
    res.status(404).json({ message: "Target user not found." });
    return;
  }

  const invited = inviteUserToGroup(groupId, sessionUserId, targetUserId);
  if (!invited.invited) {
    if (invited.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Join this group before inviting others." });
      return;
    }
    if (invited.reason === "self") {
      res.status(400).json({ message: "You cannot invite yourself." });
      return;
    }
    if (invited.reason === "already_member") {
      res.status(409).json({ message: "This user is already in the group." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (!invited.alreadyInvited) {
    emitToUser(req, targetUserId, "group:invitation:new", {
      type: "created",
      groupId,
      invitationId: invited.invitation.id,
      inviterUserId: sessionUserId,
      targetUserId,
      createdAt: invited.invitation.createdAt,
    });
  }

  res.status(invited.alreadyInvited ? 200 : 201).json({
    group: invited.summary,
    invitation: invited.invitation,
    targetUser,
    alreadyInvited: invited.alreadyInvited,
    message: invited.alreadyInvited
      ? "Invitation already sent."
      : "Invitation sent.",
  });
});

router.post("/groups/invitations/:invitationId/accept", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const invitationId = parsePositiveInt(req.params.invitationId);
  if (!invitationId) {
    res.status(400).json({ message: "Invalid invitation ID." });
    return;
  }

  const accepted = acceptGroupInvitation(invitationId, sessionUserId);
  if (!accepted.accepted) {
    if (accepted.reason === "forbidden") {
      res.status(403).json({ message: "This invitation is not for you." });
      return;
    }
    if (accepted.reason === "group_not_found") {
      res.status(404).json({ message: "Group not found." });
      return;
    }
    res.status(404).json({ message: "Invitation not found." });
    return;
  }

  if (!accepted.alreadyMember && accepted.summary) {
    const groupId = accepted.summary.id;
    const acceptedUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
      select: { id: true, email: true, name: true, cleanId: true },
    });
    if (acceptedUser) {
      const body = buildGroupMemberJoinedBody(
        resolveDisplayLabel(acceptedUser),
      );
      const message = appendGroupMessage(groupId, acceptedUser, body);
      emitGroupMessage(req, groupId, message);
    }
    emitGroupCatalogUpdated(req, groupId, {
      type: "invitation-accepted",
      actorUserId: sessionUserId,
    });
  }
  emitToUser(req, sessionUserId, "group:invitation:resolved", {
    type: "accepted",
    groupId: accepted.summary?.id ?? null,
    invitationId,
  });

  res.status(200).json({ group: accepted.summary });
});

router.post("/groups/invitations/:invitationId/reject", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const invitationId = parsePositiveInt(req.params.invitationId);
  if (!invitationId) {
    res.status(400).json({ message: "Invalid invitation ID." });
    return;
  }

  const rejected = rejectGroupInvitation(invitationId, sessionUserId);
  if (!rejected.rejected) {
    if (rejected.reason === "forbidden") {
      res.status(403).json({ message: "This invitation is not for you." });
      return;
    }
    res.status(404).json({ message: "Invitation not found." });
    return;
  }

  emitToUser(req, sessionUserId, "group:invitation:resolved", {
    type: "rejected",
    groupId: rejected.summary?.id ?? null,
    invitationId,
  });

  res.status(200).json({ group: rejected.summary });
});

router.post("/groups/:groupId/leave", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const groupBeforeLeave = getGroupById(groupId);
  const left = leaveGroup(groupId, sessionUserId);
  if (!left) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  clearGroupMuteForUser(sessionUserId, groupId);

  if (!left.alreadyLeft) {
    const payload = {
      type: "member-left",
      groupId,
      actorUserId: sessionUserId,
    };
    if (groupBeforeLeave?.groupKind === "private") {
      emitToUser(req, sessionUserId, "group:catalog-updated", payload);
      listGroupMemberIds(groupId).forEach((memberId) => {
        emitToUser(req, memberId, "group:catalog-updated", payload);
      });
    } else {
      emitToAll(req, "group:catalog-updated", payload);
    }
  }

  res.status(200).json({ group: left.summary, alreadyLeft: left.alreadyLeft });
});

router.delete("/groups/:groupId/members/:userId", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const targetUserId = parsePositiveInt(req.params.userId);
  if (!targetUserId) {
    res.status(400).json({ message: "Invalid user ID." });
    return;
  }

  const removed = removeGroupMember(groupId, sessionUserId, targetUserId);
  if (!removed.removed) {
    if (removed.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Only the owner can remove members." });
      return;
    }
    if (removed.reason === "owner") {
      res.status(409).json({ message: "The owner cannot be removed." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  clearGroupMuteForUser(targetUserId, groupId);
  emitToUser(req, targetUserId, "group:member-removed", {
    groupId,
    actorUserId: sessionUserId,
  });
  emitGroupCatalogUpdated(req, groupId, {
    type: "member-removed",
    actorUserId: sessionUserId,
    targetUserId,
  });

  res.status(200).json({
    group: removed.summary,
    alreadyRemoved: removed.alreadyRemoved,
  });
});

router.get("/groups/:groupId/settings", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const group = getGroupById(groupId);
  if (!group) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (!isGroupMember(groupId, sessionUserId)) {
    res.status(403).json({ message: "Join the group before chatting." });
    return;
  }

  const summary = listGroupsForUser(sessionUserId).find(
    (item) => item.id === groupId,
  );
  if (!summary) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  const memberIds = listGroupMemberIds(groupId);
  const members =
    memberIds.length > 0
      ? await prisma.user.findMany({
          where: {
            id: { in: memberIds },
          },
          select: {
            id: true,
            name: true,
            email: true,
            cleanId: true,
            avatar: true,
            gender: true,
          },
          orderBy: {
            cleanId: "asc",
          },
        })
      : [];

  res.status(200).json({
    group: {
      ...summary,
      mutedByMe: isGroupMutedForUser(sessionUserId, groupId),
    },
    members,
  });
});

router.patch("/groups/:groupId/mute", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  if (typeof req.body?.muted !== "boolean") {
    res.status(400).json({ message: "muted must be a boolean." });
    return;
  }

  const group = getGroupById(groupId);
  if (!group) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (!isGroupMember(groupId, sessionUserId)) {
    res.status(403).json({ message: "Join the group before chatting." });
    return;
  }

  const mutedByMe = setGroupMutedForUser(
    sessionUserId,
    groupId,
    req.body.muted,
  );

  res.status(200).json({
    groupId,
    mutedByMe,
  });
});

router.patch("/groups/:groupId/settings", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  if (typeof req.body?.requiresApproval !== "boolean") {
    res.status(400).json({ message: "requiresApproval must be a boolean." });
    return;
  }

  const updated = updateGroupJoinPolicy(
    groupId,
    sessionUserId,
    req.body.requiresApproval,
  );
  if (!updated.updated) {
    if (updated.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Only the group creator can update this setting." });
      return;
    }
    if (updated.reason === "private_group") {
      res.status(409).json({
        message: "Private groups are always invite-only.",
      });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  res.status(200).json({ group: updated.summary });
});

router.patch("/groups/:groupId/avatar", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const avatarKey = req.body?.avatarKey;
  if (!isValidGroupAvatarKey(avatarKey)) {
    res.status(400).json({
      message: `avatarKey must be one of: ${GROUP_AVATAR_KEYS.join(", ")}`,
    });
    return;
  }

  const updated = updateGroupAvatar(groupId, sessionUserId, avatarKey);
  if (!updated.updated) {
    if (updated.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Only the group creator can update group avatar." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  res.status(200).json({ group: updated.summary });
});

router.get("/groups/:groupId/join-requests", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const requestList = listGroupJoinRequests(groupId, sessionUserId);
  if (!requestList.ok) {
    if (requestList.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Only the group creator can review join requests." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  const requestedUserIds = requestList.requests.map((item) => item.userId);
  const users =
    requestedUserIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: requestedUserIds } },
          select: { id: true, name: true, email: true, cleanId: true },
        })
      : [];
  const userMap = new Map(users.map((user) => [user.id, user]));

  const requests = requestList.requests
    .map((request) => {
      const user = userMap.get(request.userId);
      if (!user) return null;
      return {
        userId: request.userId,
        requestedAt: request.requestedAt,
        name: user.name,
        email: user.email,
        cleanId: user.cleanId,
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  res.status(200).json({ group: requestList.summary, requests });
});

router.post(
  "/groups/:groupId/join-requests/:userId/approve",
  async (req, res) => {
    const sessionUserId = req.user?.userId;
    if (!ensureAuth(sessionUserId)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const groupId = normalizeGroupId(req.params.groupId);
    if (!groupId) {
      res.status(400).json({ message: "Invalid group ID." });
      return;
    }
    const targetUserId = parsePositiveInt(req.params.userId);
    if (!targetUserId) {
      res.status(400).json({ message: "Invalid user ID." });
      return;
    }

    const approved = approveGroupJoinRequest(
      groupId,
      sessionUserId,
      targetUserId,
    );
    if (!approved.approved) {
      if (approved.reason === "forbidden") {
        res.status(403).json({
          message: "Only the group creator can approve join requests.",
        });
        return;
      }
      if (approved.reason === "request_not_found") {
        res.status(404).json({ message: "Join request not found." });
        return;
      }
      res.status(404).json({ message: "Group not found." });
      return;
    }

    const approvedUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, name: true, cleanId: true },
    });
    if (approvedUser) {
      const body = buildGroupMemberJoinedBody(
        resolveDisplayLabel(approvedUser),
      );
      const message = appendGroupMessage(groupId, approvedUser, body);
      emitGroupMessage(req, groupId, message);
    }
    emitToUser(req, sessionUserId, "group:join-request:resolved", {
      type: "approved",
      groupId,
      requesterId: targetUserId,
    });
    emitToUser(req, targetUserId, "group:catalog-updated", {
      type: "join-approved",
      groupId,
      actorUserId: sessionUserId,
    });
    emitGroupCatalogUpdated(req, groupId, {
      type: "member-joined",
      actorUserId: targetUserId,
    });

    res.status(200).json({ group: approved.summary });
  },
);

router.post(
  "/groups/:groupId/join-requests/:userId/reject",
  async (req, res) => {
    const sessionUserId = req.user?.userId;
    if (!ensureAuth(sessionUserId)) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    const groupId = normalizeGroupId(req.params.groupId);
    if (!groupId) {
      res.status(400).json({ message: "Invalid group ID." });
      return;
    }
    const targetUserId = parsePositiveInt(req.params.userId);
    if (!targetUserId) {
      res.status(400).json({ message: "Invalid user ID." });
      return;
    }

    const rejected = rejectGroupJoinRequest(
      groupId,
      sessionUserId,
      targetUserId,
    );
    if (!rejected.rejected) {
      if (rejected.reason === "forbidden") {
        res.status(403).json({
          message: "Only the group creator can reject join requests.",
        });
        return;
      }
      if (rejected.reason === "request_not_found") {
        res.status(404).json({ message: "Join request not found." });
        return;
      }
      res.status(404).json({ message: "Group not found." });
      return;
    }

    emitToUser(req, sessionUserId, "group:join-request:resolved", {
      type: "rejected",
      groupId,
      requesterId: targetUserId,
    });
    emitToUser(req, targetUserId, "group:catalog-updated", {
      type: "join-rejected",
      groupId,
      actorUserId: sessionUserId,
    });

    res.status(200).json({ group: rejected.summary });
  },
);

router.delete("/groups/:groupId", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const groupBeforeDelete = getGroupById(groupId);
  const privateMemberIds =
    groupBeforeDelete?.groupKind === "private"
      ? listGroupMemberIds(groupId)
      : [];
  const deleted = deleteGroup(groupId, sessionUserId);
  if (!deleted.deleted) {
    if (deleted.reason === "forbidden") {
      res
        .status(403)
        .json({ message: "Only the group creator can delete this group." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  clearGroupMuteForAllUsers(groupId);
  clearGroupReadCheckpointForAllUsers(groupId);
  const payload = {
    type: "deleted",
    groupId,
    actorUserId: sessionUserId,
  };
  if (groupBeforeDelete?.groupKind === "private") {
    privateMemberIds.forEach((memberId) => {
      emitToUser(req, memberId, "group:catalog-updated", payload);
    });
  } else {
    emitToAll(req, "group:catalog-updated", payload);
  }

  res.status(200).json({ message: "Group deleted." });
});

router.get("/groups/:groupId/messages", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const groupId = normalizeGroupId(req.params.groupId);
  if (!groupId) {
    res.status(400).json({ message: "Invalid group ID." });
    return;
  }

  const group = getGroupById(groupId);
  if (!group) {
    res.status(404).json({ message: "Group not found." });
    return;
  }
  if (!isGroupMember(groupId, sessionUserId)) {
    res.status(403).json({ message: "Join the group before chatting." });
    return;
  }

  const messages = listGroupMessages(groupId);
  const latestMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : 0;
  syncGroupReadCheckpoint(sessionUserId, groupId, latestMessageId);

  res.json({ messages });
});

router.post("/threads", async (req, res) => {
  const sessionUserId = req.user?.userId;
  if (!ensureAuth(sessionUserId)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rawTargetId =
    req.body?.BId ??
    req.body?.targetUserId ??
    req.body?.userId ??
    req.body?.hostId;
  const targetUserId =
    typeof rawTargetId === "number" ? rawTargetId : Number(rawTargetId);
  if (
    !Number.isInteger(targetUserId) ||
    Number.isNaN(targetUserId) ||
    targetUserId <= 0
  ) {
    return res.status(400).json({ error: "Invalid target user ID" });
  }
  if (targetUserId === sessionUserId) {
    return res
      .status(400)
      .json({ error: "Cannot create thread with yourself" });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "Target user not found" });
  }

  const existingThread = await findExistingDirectThread(
    sessionUserId,
    targetUserId,
  );
  if (existingThread) {
    return res.json({ thread: existingThread, alreadyExists: true });
  }

  const acceptedRequest = await findAcceptedDirectRequest(
    sessionUserId,
    targetUserId,
  );
  if (!acceptedRequest) {
    return res.status(403).json({
      error:
        "Direct chat request has not been accepted yet. Send a chat request first.",
    });
  }

  const ensured = await ensureDirectThread(sessionUserId, targetUserId);
  if (acceptedRequest.acceptedThreadId !== ensured.thread.id) {
    await prisma.chatRequest.update({
      where: { id: acceptedRequest.id },
      data: { acceptedThreadId: ensured.thread.id },
    });
  }

  res.status(201).json({ thread: ensured.thread, alreadyExists: false });
});

router.get("/threads", async (req, res) => {
  const userId = req.user?.userId;

  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [{ AID: userId }, { BID: userId }],
    },
    include: {
      UserA: {
        select: {
          id: true,
          name: true,
          email: true,
          cleanId: true,
          avatar: true,
          gender: true,
        },
      },
      UserB: {
        select: {
          id: true,
          name: true,
          email: true,
          cleanId: true,
          avatar: true,
          gender: true,
        },
      },
      Messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true, senderId: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });

  res.json(
    threads.map((thread) => ({
      ...thread,
      mutedByMe: isThreadMutedForUser(userId, thread.id),
    })),
  );
});

router.get("/threads/:threadId/settings", async (req, res) => {
  const userId = req.user?.userId;
  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threadId = parsePositiveInt(req.params.threadId);
  if (!threadId) {
    res.status(400).json({ message: "Invalid thread ID" });
    return;
  }

  const thread = await getThreadForUser(threadId, userId);
  if (!thread) {
    res.status(404).json({ message: "Thread not found" });
    return;
  }

  const otherUserId = getOtherThreadUserId(thread, userId);
  const otherUser = await prisma.user.findUnique({
    where: { id: otherUserId },
    select: {
      id: true,
      name: true,
      cleanId: true,
      avatar: true,
      gender: true,
      country: true,
      city: true,
    },
  });

  if (!otherUser) {
    res.status(404).json({ message: "Other user not found" });
    return;
  }

  const [blockedByMe, blockedMe] = await Promise.all([
    prisma.chatBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: otherUserId,
        },
      },
      select: { id: true },
    }),
    prisma.chatBlock.findUnique({
      where: {
        blockerId_blockedId: {
          blockerId: otherUserId,
          blockedId: userId,
        },
      },
      select: { id: true },
    }),
  ]);

  res.json({
    threadId,
    otherUser,
    blockedByMe: Boolean(blockedByMe),
    blockedMe: Boolean(blockedMe),
    mutedByMe: isThreadMutedForUser(userId, threadId),
  });
});

router.patch("/threads/:threadId/mute", async (req, res) => {
  const userId = req.user?.userId;
  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threadId = parsePositiveInt(req.params.threadId);
  if (!threadId) {
    res.status(400).json({ message: "Invalid thread ID" });
    return;
  }

  if (typeof req.body?.muted !== "boolean") {
    res.status(400).json({ message: "muted must be a boolean." });
    return;
  }

  const thread = await getThreadForUser(threadId, userId);
  if (!thread) {
    res.status(404).json({ message: "Thread not found" });
    return;
  }

  const mutedByMe = setThreadMutedForUser(userId, threadId, req.body.muted);

  res.json({
    threadId,
    mutedByMe,
  });
});

router.patch("/threads/:threadId/block", async (req, res) => {
  const userId = req.user?.userId;
  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threadId = parsePositiveInt(req.params.threadId);
  if (!threadId) {
    res.status(400).json({ message: "Invalid thread ID" });
    return;
  }

  if (typeof req.body?.blocked !== "boolean") {
    res.status(400).json({ message: "blocked must be a boolean." });
    return;
  }

  const thread = await getThreadForUser(threadId, userId);
  if (!thread) {
    res.status(404).json({ message: "Thread not found" });
    return;
  }

  const otherUserId = getOtherThreadUserId(thread, userId);

  if (req.body.blocked) {
    await prisma.chatBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: userId,
          blockedId: otherUserId,
        },
      },
      update: {},
      create: {
        blockerId: userId,
        blockedId: otherUserId,
      },
    });
  } else {
    await prisma.chatBlock.deleteMany({
      where: {
        blockerId: userId,
        blockedId: otherUserId,
      },
    });
  }

  res.json({
    threadId,
    blockedByMe: req.body.blocked,
  });
});

router.delete("/threads/:threadId", deleteConversation);

router.get("/threads/:threadId/messages", async (req, res) => {
  const userId = req.user?.userId;
  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threadId = Number(req.params.threadId);
  if (!Number.isInteger(threadId) || Number.isNaN(threadId) || threadId <= 0) {
    res.status(400).json({ message: "Invalid thread ID" });
    return;
  }

  const thread = await prisma.chatThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      AID: true,
      BID: true,
    },
  });
  if (!thread) {
    res.status(404).json({ message: "Thread not found" });
    return;
  }

  if (thread.AID !== userId && thread.BID !== userId) {
    res.status(403).json({ message: "Forbidden" });
    return;
  }

  const messages = await prisma.chatMessage.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      threadId: true,
      senderId: true,
      body: true,
      createdAt: true,
      parentMessageId: true,
      quoteSenderName: true,
      quotePreview: true,
      parentMessage: {
        select: {
          body: true,
          sender: {
            select: {
              name: true,
              cleanId: true,
            },
          },
        },
      },
    },
  });

  const latestMessageId =
    messages.length > 0 ? messages[messages.length - 1].id : 0;
  syncDirectReadCheckpoint(userId, threadId, latestMessageId);

  res.json(
    messages.map((message) => {
      const quoteSenderName =
        message.quoteSenderName?.trim() ||
        message.parentMessage?.sender?.name?.trim() ||
        message.parentMessage?.sender?.cleanId ||
        null;
      const quotePreview =
        message.quotePreview?.trim() ||
        message.parentMessage?.body?.trim().slice(0, 220) ||
        null;

      return {
        id: message.id,
        threadId: message.threadId,
        senderId: message.senderId,
        body: message.body,
        createdAt: message.createdAt,
        parentMessageId: message.parentMessageId,
        quoteSenderName,
        quotePreview,
        quotedContent:
          quoteSenderName || quotePreview
            ? {
                senderName: quoteSenderName,
                preview: quotePreview,
              }
            : null,
      };
    }),
  );
});

export default router;
