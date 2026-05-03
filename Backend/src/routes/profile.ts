import { Request, Response, Router } from "express";
import { Avatar, PrismaClient } from "@prisma/client";
import nodemailer from "nodemailer";
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
import { getPushConfigurationStatus, getVapidPublicKey } from "../push";
const router = Router();
const prisma = new PrismaClient();

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM =
  process.env.SMTP_FROM || SMTP_USER || "CleanChat <no-reply@CleanChat.local>";
const FEEDBACK_RECIPIENT =
  process.env.FEEDBACK_RECIPIENT || "charlottkgonzal@gmail.com";
const feedbackMailer =
  SMTP_USER && SMTP_PASS
    ? nodemailer.createTransport({
        service: "gmail",
        pool: true,
        maxConnections: 2,
        maxMessages: 100,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      })
    : null;

const GENDER_VALUES = ["male", "female", "non_binary", "hidden"] as const;
type GenderValue = (typeof GENDER_VALUES)[number];

const parseGender = (value: unknown): GenderValue | null => {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return (GENDER_VALUES as readonly string[]).includes(normalized)
    ? (normalized as GenderValue)
    : null;
};

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
      gender: true,
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

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const sendFeedbackEmail = async (
  user: NonNullable<Awaited<ReturnType<typeof loadCurrentUser>>>,
  message: string,
) => {
  if (!feedbackMailer) {
    throw new Error("Feedback email is not configured.");
  }

  const fromName = user.name?.trim() || user.cleanId || user.email;
  const cleanId = user.cleanId ? `@${user.cleanId}` : "No CleanID";
  const subject = `CleanChat feedback from ${fromName}`;
  const text = `Feedback from ${fromName}
Email: ${user.email}
CleanID: ${cleanId}
User ID: ${user.id}

${message}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.55;">
      <h2>CleanChat feedback</h2>
      <p><strong>From:</strong> ${escapeHtml(fromName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(user.email)}</p>
      <p><strong>CleanID:</strong> ${escapeHtml(cleanId)}</p>
      <p><strong>User ID:</strong> ${user.id}</p>
      <hr />
      <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
    </div>
  `;

  await feedbackMailer.sendMail({
    from: SMTP_FROM,
    to: FEEDBACK_RECIPIENT,
    subject,
    text,
    html,
  });
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
    const status = getPushConfigurationStatus();
    res.status(503).json({
      error: "Web push is not configured on backend.",
      errorCode: "PUSH_NOT_CONFIGURED",
      details: {
        hasPublicKey: status.hasPublicKey,
        hasPrivateKey: status.hasPrivateKey,
        publicKeyFormatValid: status.publicKeyFormatValid,
        privateKeyFormatValid: status.privateKeyFormatValid,
        errors: status.errors,
      },
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
  const genderRaw = req.body?.gender;
  const gender = parseGender(genderRaw);
  const genderProvided = typeof genderRaw === "string";

  if (avatarProvided && avatar === null) {
    return res.status(400).json({
      error: "Unsupported avatar value.",
      details: `Allowed values: ${Object.values(Avatar).join(", ")}`,
    });
  }

  if (genderProvided && gender === null) {
    return res.status(400).json({
      error: "Unsupported gender value.",
      details: `Allowed values: ${GENDER_VALUES.join(", ")}`,
    });
  }

  const updates: { name?: string; avatar?: Avatar; gender?: GenderValue } = {};
  if (name !== null) {
    updates.name = name;
  }
  if (avatar !== null) {
    updates.avatar = avatar;
  }
  if (gender !== null) {
    updates.gender = gender;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: "Invalid name, avatar, or gender" });
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
        gender: true,
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

router.post("/feedback", async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const sessionUser = await loadCurrentUser(userId);
  if (!sessionUser) {
    return res.status(404).json({ error: "User not found" });
  }

  const message =
    typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Feedback message is required." });
  }
  if (message.length > 1200) {
    return res.status(400).json({
      error: "Feedback message must be 1200 characters or fewer.",
    });
  }

  try {
    await sendFeedbackEmail(sessionUser, message);
    res.status(202).json({
      message: "Feedback sent.",
      recipient: FEEDBACK_RECIPIENT,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res.status(503).json({
      error: "Failed to send feedback email.",
      details,
    });
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
    select: {
      id: true,
      email: true,
      name: true,
      cleanId: true,
      avatar: true,
      gender: true,
    },
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
