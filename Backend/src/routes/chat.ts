import { Router } from "express";
import { ChatRequestStatus, PrismaClient } from "@prisma/client";
import multer from "multer";
import { UTApi, UTFile } from "uploadthing/server";
import {
  approveGroupJoinRequest,
  createGroup,
  deleteGroup,
  GROUP_AVATAR_KEYS,
  getGroupById,
  isValidGroupAvatarKey,
  listGroupJoinRequests,
  joinGroup,
  leaveGroup,
  listGroupMessages,
  listGroupsForUser,
  normalizeGroupId,
  rejectGroupJoinRequest,
  updateGroupAvatar,
  updateGroupJoinPolicy,
  isGroupMember,
} from "../groupStore";
import {
  buildCleanIdTrustSnapshots,
  fallbackCleanIdTrustSnapshot,
} from "../cleanIdTrust";
import { authMiddleware } from "../auth";
import { deleteConversation } from "../controllers/conversation";

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

  const trustSnapshots = await buildCleanIdTrustSnapshots(
    prisma,
    users.map((user) => user.id),
  );

  res.json({
    users: users.map((user) => ({
      ...user,
      trust: trustSnapshots.get(user.id) ?? fallbackCleanIdTrustSnapshot,
    })),
  });
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

  const [existingThread, acceptedRequest, latestRequest, trustSnapshots] =
    await Promise.all([
      findExistingDirectThread(sessionUserId, targetUserId),
      findAcceptedDirectRequest(sessionUserId, targetUserId),
      findLatestDirectRequest(sessionUserId, targetUserId),
      buildCleanIdTrustSnapshots(prisma, [targetUserId]),
    ]);

  res.json({
    user: {
      ...targetUser,
      trust: trustSnapshots.get(targetUser.id) ?? fallbackCleanIdTrustSnapshot,
    },
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

  const trustSnapshots = await buildCleanIdTrustSnapshots(
    prisma,
    [...pendingRequests, ...recentRequests].map((item) => item.requester.id),
  );

  res.json({
    pending: pendingRequests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: {
        ...item.requester,
        trust:
          trustSnapshots.get(item.requester.id) ?? fallbackCleanIdTrustSnapshot,
      },
    })),
    recent: recentRequests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: {
        ...item.requester,
        trust:
          trustSnapshots.get(item.requester.id) ?? fallbackCleanIdTrustSnapshot,
      },
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

  const trustSnapshots = await buildCleanIdTrustSnapshots(
    prisma,
    requests.map((item) => item.recipient.id),
  );

  res.json({
    requests: requests.map((item) => ({
      request: serializeDirectRequest(item, sessionUserId),
      user: {
        ...item.recipient,
        trust:
          trustSnapshots.get(item.recipient.id) ?? fallbackCleanIdTrustSnapshot,
      },
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

  const [
    existingThread,
    acceptedRequest,
    latestRequest,
    blocked,
    trustSnapshots,
  ] = await Promise.all([
    findExistingDirectThread(sessionUserId, targetUserId),
    findAcceptedDirectRequest(sessionUserId, targetUserId),
    findLatestDirectRequest(sessionUserId, targetUserId),
    ensurePairNotBlocked(sessionUserId, targetUserId),
    buildCleanIdTrustSnapshots(prisma, [targetUserId]),
  ]);

  res.json({
    user: {
      ...targetUser,
      trust: trustSnapshots.get(targetUser.id) ?? fallbackCleanIdTrustSnapshot,
    },
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

  const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [
    pendingRequest.requester.id,
  ]);

  res.json({
    request: serializeDirectRequest(acceptedRequest, sessionUserId),
    thread: ensured.thread,
    user: {
      ...pendingRequest.requester,
      trust:
        trustSnapshots.get(pendingRequest.requester.id) ??
        fallbackCleanIdTrustSnapshot,
    },
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

  res.json({ groups: listGroupsForUser(sessionUserId) });
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
  const requiresApproval = req.body?.requiresApproval === true;
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

  const group = createGroup(
    sessionUserId,
    name,
    description,
    requiresApproval,
    avatarKeyProvided && isValidGroupAvatarKey(rawAvatarKey)
      ? rawAvatarKey
      : undefined,
  );
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

  const joined = joinGroup(groupId, sessionUserId);
  if (!joined) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  if (joined.pendingApproval) {
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

  res.status(joined.alreadyJoined ? 200 : 201).json({
    group: joined.summary,
    pendingApproval: false,
    alreadyRequested: false,
  });
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

  const left = leaveGroup(groupId, sessionUserId);
  if (!left) {
    res.status(404).json({ message: "Group not found." });
    return;
  }

  res.status(200).json({ group: left.summary, alreadyLeft: left.alreadyLeft });
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

  res.json({ messages: listGroupMessages(groupId) });
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

  const trustSnapshots = await buildCleanIdTrustSnapshots(
    prisma,
    threads.flatMap((thread) => [thread.UserA.id, thread.UserB.id]),
  );

  res.json(
    threads.map((thread) => ({
      ...thread,
      UserA: {
        ...thread.UserA,
        trust:
          trustSnapshots.get(thread.UserA.id) ?? fallbackCleanIdTrustSnapshot,
      },
      UserB: {
        ...thread.UserB,
        trust:
          trustSnapshots.get(thread.UserB.id) ?? fallbackCleanIdTrustSnapshot,
      },
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
    include: {
      Messages: { orderBy: { createdAt: "asc" } },
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

  res.json(thread.Messages);
});

export default router;
