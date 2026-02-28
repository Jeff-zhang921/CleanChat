import { Router } from "express";
import { PrismaClient } from "@prisma/client";
import multer from "multer";
import { UTApi, UTFile } from "uploadthing/server";

const router = Router();
const prisma = new PrismaClient();
const utapi = new UTApi();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

const ensureAuth = (sessionUserId: number | undefined): sessionUserId is number =>
  typeof sessionUserId === "number" && Number.isInteger(sessionUserId) && sessionUserId > 0;

router.post("/upload-image", upload.single("image"), async (req, res) => {
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
    const uploadBytes = new Uint8Array(file.buffer);
    const uploadFile = new UTFile([uploadBytes], file.originalname || `chat-${Date.now()}.jpg`, {
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
});

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
