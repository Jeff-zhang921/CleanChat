import { Request, Response, Router } from "express";
import { Avatar, PrismaClient } from "@prisma/client";
import {
  DEFAULT_AVATAR,
  buildAvatarAccess,
  getAvatarUnlockError,
} from "../avatar";
import {
  buildCleanIdTrustSnapshots,
  fallbackCleanIdTrustSnapshot,
  type CleanIdTrustSnapshot,
} from "../cleanIdTrust";
import {
  buildCleanIdShortClaim,
  validateRequestedCleanId,
} from "../cleanIdClaim";
import { authMiddleware } from "../auth";
import { getVapidPublicKey } from "../push";
const router = Router();
const prisma = new PrismaClient();

router.use(authMiddleware);

const loadCurrentUser = (userId: number) =>
  prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      cleanId: true,
      avatar: true,
    },
  });

const buildProfilePayload = <T extends { id: number; cleanId: string }>(
  user: T,
  trustSnapshots: Map<number, CleanIdTrustSnapshot>,
) => {
  const trust = trustSnapshots.get(user.id) ?? fallbackCleanIdTrustSnapshot;
  const currentAvatar =
    "avatar" in user && typeof user.avatar === "string"
      ? (user.avatar as Avatar)
      : DEFAULT_AVATAR;
  return {
    ...user,
    trust,
    shortIdClaim: buildCleanIdShortClaim(user.cleanId, trust),
    avatarAccess: buildAvatarAccess(trust, currentAvatar),
  };
};

router.get("/me", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const user = await loadCurrentUser(userId);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [user.id]);
  res.json({
    user: buildProfilePayload(user, trustSnapshots),
  });
});

router.get("/push/public-key", (_req, res) => {
  const publicKey = getVapidPublicKey();
  if (!publicKey) {
    res.status(503).json({
      error: "Web push is not configured on backend.",
    });
    return;
  }

  res.json({ publicKey });
});

router.put("/push/subscription", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const endpoint =
    typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  const keysRaw = req.body?.keys;
  const p256dh =
    keysRaw &&
    typeof keysRaw === "object" &&
    typeof (keysRaw as { p256dh?: unknown }).p256dh === "string"
      ? (keysRaw as { p256dh: string }).p256dh.trim()
      : "";
  const auth =
    keysRaw &&
    typeof keysRaw === "object" &&
    typeof (keysRaw as { auth?: unknown }).auth === "string"
      ? (keysRaw as { auth: string }).auth.trim()
      : "";

  if (!endpoint || !p256dh || !auth) {
    res.status(400).json({
      error: "endpoint, keys.p256dh, and keys.auth are required.",
    });
    return;
  }

  try {
    const endpointUrl = new URL(endpoint);
    if (endpointUrl.protocol !== "https:") {
      res.status(400).json({ error: "Subscription endpoint must use https." });
      return;
    }
  } catch {
    res.status(400).json({ error: "Invalid subscription endpoint URL." });
    return;
  }

  const expirationRaw = req.body?.expirationTime;
  const expirationTime =
    typeof expirationRaw === "number" && Number.isFinite(expirationRaw)
      ? new Date(expirationRaw)
      : null;
  if (expirationTime && Number.isNaN(expirationTime.getTime())) {
    res.status(400).json({ error: "Invalid expirationTime." });
    return;
  }

  const now = new Date();

  const subscription = await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: {
      userId,
      endpoint,
      p256dh,
      auth,
      expirationTime,
      lastSeenAt: now,
    },
    update: {
      userId,
      p256dh,
      auth,
      expirationTime,
      lastSeenAt: now,
    },
    select: { id: true, endpoint: true, updatedAt: true },
  });

  res.status(201).json({
    message: "Push subscription saved.",
    subscription,
  });
});

router.delete("/push/subscription", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const endpoint =
    typeof req.body?.endpoint === "string" ? req.body.endpoint.trim() : "";
  if (!endpoint) {
    res.status(400).json({ error: "endpoint is required." });
    return;
  }

  const removed = await prisma.pushSubscription.deleteMany({
    where: {
      userId,
      endpoint,
    },
  });

  res.json({ removed: removed.count > 0 });
});

router.patch("/me", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const sessionUser = await loadCurrentUser(userId);
  if (!sessionUser) {
    return res.status(404).json({ error: "User not found" });
  }
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : null;

  const avatarRaw = req.body?.avatar;
  const avatar = Object.values(Avatar).includes(avatarRaw as Avatar)
    ? (avatarRaw as Avatar)
    : null;
  const avatarProvided = typeof avatarRaw === "string";

  if (avatarProvided && avatar === null) {
    return res.status(400).json({
      error: "Unsupported avatar value.",
      details: `Allowed values: ${Object.values(Avatar).join(", ")}`,
    });
  }

  const updates: { name?: string; avatar?: Avatar } = {};
  if (name !== null) {
    updates.name = name;
  }
  if (avatar !== null) {
    updates.avatar = avatar;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Invalid name or avatar" });
  }

  const currentAvatar =
    typeof sessionUser.avatar === "string" &&
    Object.values(Avatar).includes(sessionUser.avatar as Avatar)
      ? (sessionUser.avatar as Avatar)
      : DEFAULT_AVATAR;

  if (avatar !== null && avatar !== currentAvatar) {
    const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [
      sessionUser.id,
    ]);
    const activeTrust =
      trustSnapshots.get(sessionUser.id) ?? fallbackCleanIdTrustSnapshot;
    const unlockError = getAvatarUnlockError(
      avatar,
      activeTrust,
      currentAvatar,
    );
    if (unlockError) {
      return res.status(403).json({ error: unlockError });
    }
  }

  try {
    const updatedUser = await prisma.user.update({
      where: { id: sessionUser.id },
      data: updates,
      select: {
        id: true,
        email: true,
        name: true,
        cleanId: true,
        avatar: true,
      },
    });
    const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [
      updatedUser.id,
    ]);

    res.json({
      message: "Profile updated.",
      user: buildProfilePayload(updatedUser, trustSnapshots),
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    const enumMismatch =
      details.includes("invalid input value for enum") &&
      details.toLowerCase().includes("avatar");

    if (enumMismatch) {
      return res.status(500).json({
        error: "Avatar options are out of sync with the deployed database.",
        details:
          "Run Prisma migration/db push on your production database and redeploy backend.",
      });
    }

    return res
      .status(500)
      .json({ error: "Failed to update profile.", details });
  }
});

router.delete("/me", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionUser = await loadCurrentUser(userId);
  if (!sessionUser) {
    return res.status(404).json({ error: "User not found" });
  }

  try {
    await prisma.$transaction(async (tx) => {
      const threads = await tx.chatThread.findMany({
        where: {
          OR: [{ AID: sessionUser.id }, { BID: sessionUser.id }],
        },
        select: { id: true },
      });

      const threadIds = threads.map((item) => item.id);
      await tx.chatMessage.deleteMany({
        where: {
          OR: [{ senderId: sessionUser.id }, { threadId: { in: threadIds } }],
        },
      });

      await tx.chatThread.deleteMany({
        where: {
          OR: [{ AID: sessionUser.id }, { BID: sessionUser.id }],
        },
      });

      await tx.loginCode.deleteMany({
        where: { email: sessionUser.email },
      });

      await tx.pushSubscription.deleteMany({
        where: { userId: sessionUser.id },
      });

      await tx.refreshSession.deleteMany({
        where: { userId: sessionUser.id },
      });

      await tx.user.delete({
        where: { id: sessionUser.id },
      });
    });

    res.json({ message: "Account deleted." });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(500).json({ error: "Failed to delete account.", details });
  }
});

router.patch("/clean-id", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const sessionUser = await loadCurrentUser(userId);
  if (!sessionUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const cleanIdRaw =
    typeof req.body?.cleanId === "string"
      ? req.body.cleanId.trim().toLowerCase()
      : "";
  if (cleanIdRaw === sessionUser.cleanId) {
    return res.json({ message: "cleanId unchanged", cleanId: cleanIdRaw });
  }

  const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [
    sessionUser.id,
  ]);
  const activeTrust =
    trustSnapshots.get(sessionUser.id) ?? fallbackCleanIdTrustSnapshot;
  const cleanIdValidation = validateRequestedCleanId({
    requestedCleanId: cleanIdRaw,
    currentCleanId: sessionUser.cleanId,
    trust: activeTrust,
  });
  if (!cleanIdValidation.ok) {
    return res.status(400).json({ error: cleanIdValidation.error });
  }

  const exists = await prisma.user.findUnique({
    where: { cleanId: cleanIdRaw },
  });
  if (exists) {
    return res.status(409).json({ error: "cleanId already taken" });
  }

  const updatedUser = await prisma.user.update({
    where: { id: sessionUser.id },
    data: { cleanId: cleanIdRaw },
    select: { id: true, email: true, name: true, cleanId: true, avatar: true },
  });
  const nextTrustSnapshots = await buildCleanIdTrustSnapshots(prisma, [
    updatedUser.id,
  ]);

  res.json({
    message: "cleanId updated.",
    user: buildProfilePayload(updatedUser, nextTrustSnapshots),
  });
});

router.get("/me/overview", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  const sessionUser = await loadCurrentUser(userId);
  if (!sessionUser) {
    return res.status(404).json({ error: "User not found" });
  }
  res.json({ user: sessionUser });
});

export default router;
