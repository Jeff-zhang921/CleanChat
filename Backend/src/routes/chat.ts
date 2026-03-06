import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import { UTApi, UTFile } from "uploadthing/server";
import {
  createGroup,
  deleteGroup,
  getGroupById,
  joinGroup,
  leaveGroup,
  listGroupMessages,
  listGroupsForUser,
  normalizeGroupId,
  isGroupMember,
} from "../groupStore";

const router = Router();
const prisma = new PrismaClient();
const utapi = new UTApi();
const MAX_IMAGE_UPLOAD_BYTES = 15 * 1024 * 1024;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_UPLOAD_BYTES },
});

const ensureAuth = (sessionUserId: number | undefined): sessionUserId is number =>
  typeof sessionUserId === "number" && Number.isInteger(sessionUserId) && sessionUserId > 0;

const GROUP_NAME_MIN_LENGTH = 2;
const GROUP_NAME_MAX_LENGTH = 48;
const GROUP_DESCRIPTION_MAX_LENGTH = 180;

router.post("/upload-image",(req, res, next) => {
    upload.single("image")(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }

      if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          error: `Image is too large. Max size is ${Math.floor(
            MAX_IMAGE_UPLOAD_BYTES / (1024 * 1024)
          )}MB.`,
        });
        return;
      }

      const details = error instanceof Error ? error.message : String(error);
      res.status(400).json({ error: "Invalid image upload request.", details });
    });
  },
  async (req, res) => {
  const sessionUserId = req.session.user?.id;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  if (!process.env.UPLOADTHING_TOKEN) {
    res.status(500).json({ error: "UPLOADTHING_TOKEN is not configured on backend." });
    return;
  }

  const file = req.file as Express.Multer.File | undefined;
  if (!file) {
    res.status(400).json({ error: "Image file is required." });
    return;
  }
  if (!file.mimetype.startsWith("image/")) {
    res.status(400).json({ error: "Only image files are allowed." });
    return;
  }

  try {
    //UTFile expects a BlobPart which can be ArrayBuffer, ArrayBufferView, Blob, or string. Buffer from multer can be treated as a BlobPart.
    const uploadFile = new UTFile([file.buffer as BlobPart], file.originalname || `chat-${Date.now()}.jpg`, {
      type: file.mimetype,
      lastModified: Date.now(),
    });

    const uploaded = await utapi.uploadFiles(uploadFile);
    const uploadedData = Array.isArray(uploaded) ? uploaded[0]?.data : uploaded.data;
    const uploadedError = Array.isArray(uploaded) ? uploaded[0]?.error : uploaded.error;

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
  }
);

router.get("/users/search", async (req, res) => {
  const sessionUserId = req.session.user?.id;
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
    },
    orderBy: { cleanId: "asc" },
    take: 20,
  });

  res.json({ users });
});

router.get("/groups", async (req, res) => {
  const sessionUserId = req.session.user?.id;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  res.json({ groups: listGroupsForUser(sessionUserId) });
});

router.post("/groups", async (req, res) => {
  const sessionUserId = req.session.user?.id;
  if (!ensureAuth(sessionUserId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const name = typeof req.body?.name === "string" ? req.body.name.trim().replace(/\s+/g, " ") : "";
  const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";

  if (name.length < GROUP_NAME_MIN_LENGTH || name.length > GROUP_NAME_MAX_LENGTH) {
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

  const group = createGroup(sessionUserId, name, description);
  res.status(201).json({ group });
});

router.post("/groups/:groupId/join", async (req, res) => {
  const sessionUserId = req.session.user?.id;
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

  res.status(joined.alreadyJoined ? 200 : 201).json({ group: joined.summary });
});

router.post("/groups/:groupId/leave", async (req, res) => {
  const sessionUserId = req.session.user?.id;
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

router.delete("/groups/:groupId", async (req, res) => {
  const sessionUserId = req.session.user?.id;
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
      res.status(403).json({ message: "Only the group creator can delete this group." });
      return;
    }
    res.status(404).json({ message: "Group not found." });
    return;
  }

  res.status(200).json({ message: "Group deleted." });
});

router.get("/groups/:groupId/messages", async (req, res) => {
  const sessionUserId = req.session.user?.id;
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
  const sessionUserId = req.session.user?.id;
  if (!ensureAuth(sessionUserId)) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const rawTargetId = req.body?.BId ?? req.body?.targetUserId ?? req.body?.userId ?? req.body?.hostId;
  const targetUserId = typeof rawTargetId === "number" ? rawTargetId : Number(rawTargetId);
  if (!Number.isInteger(targetUserId) || Number.isNaN(targetUserId) || targetUserId <= 0) {
    return res.status(400).json({ error: "Invalid target user ID" });
  }
  if (targetUserId === sessionUserId) {
    return res.status(400).json({ error: "Cannot create thread with yourself" });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true },
  });
  if (!targetUser) {
    return res.status(404).json({ error: "Target user not found" });
  }

  const existingThread = await prisma.chatThread.findFirst({
    where: {
      OR: [
        { AID: sessionUserId, BID: targetUserId },
        { AID: targetUserId, BID: sessionUserId },
      ],
    },
  });
  if (existingThread) {
    return res.json({ thread: existingThread, alreadyExists: true });
  }

  const [AID, BID] =
    sessionUserId < targetUserId ? [sessionUserId, targetUserId] : [targetUserId, sessionUserId];

  const newThread = await prisma.chatThread.create({
    data: {
      AID,
      BID,
    },
  });

  res.status(201).json({ thread: newThread, alreadyExists: false });
});

router.get("/threads", async (req, res) => {
  const userId = req.session.user?.id;

  if (!ensureAuth(userId)) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const threads = await prisma.chatThread.findMany({
    where: {
      OR: [{ AID: userId }, { BID: userId }],
    },
    include: {
      UserA: { select: { id: true, name: true, email: true, cleanId: true, avatar: true } },
      UserB: { select: { id: true, name: true, email: true, cleanId: true, avatar: true } },
      Messages: {
        take: 1,
        orderBy: { createdAt: "desc" },
        select: { id: true, body: true, createdAt: true, senderId: true },
      },
    },
    orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
  });

  res.json(threads);
});

router.get("/threads/:threadId/messages", async (req, res) => {
  const userId = req.session.user?.id;
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
