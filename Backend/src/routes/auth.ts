import { Router, type Response } from "express";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { DEFAULT_AVATAR } from "../avatar";
import {
  buildCleanIdTrustSnapshots,
  fallbackCleanIdTrustSnapshot,
} from "../cleanIdTrust";
import { authMiddleware, signAuthToken } from "../auth";

const router = Router();
const prisma = new PrismaClient();
const Email_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_LENGTH = 6;
//LIVE TIME
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const AUTH_ERROR_CODES = {
  invalidEmail: "AUTH_INVALID_EMAIL",
  invalidCode: "AUTH_INVALID_CODE",
  invalidOrExpiredCode: "AUTH_INVALID_OR_EXPIRED_CODE",
  tooManyAttempts: "AUTH_TOO_MANY_ATTEMPTS",
  emailLoginNotConfigured: "AUTH_EMAIL_LOGIN_NOT_CONFIGURED",
  verificationFailed: "AUTH_VERIFICATION_FAILED",
} as const;

const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM =
  process.env.SMTP_FROM || SMTP_USER || "CleanChat <no-reply@CleanChat.local>";
const LOGIN_CODE_SECRET = process.env.LOGIN_CODE_SECRET?.trim() || "";

const mailer =
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

function generateLoginCode(): string {
  const max = 10 ** CODE_LENGTH;
  //padstart check the generate number
  return crypto.randomInt(0, max).toString().padStart(CODE_LENGTH, "0");
}
function hashCode(code: string): string {
  return crypto
    .createHmac("sha256", LOGIN_CODE_SECRET)
    .update(code)
    .digest("hex");
}

function normalizeEmailInput(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

function normalizeCodeInput(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sendAuthError(
  res: Response,
  status: number,
  errorCode: string,
  message: string,
  extra?: Record<string, string>,
) {
  res.status(status).json({
    errorCode,
    message,
    ...(extra ?? {}),
  });
}

function generateCleanId(): string {
  return `u_${crypto.randomBytes(6).toString("hex")}`;
}

type AuthUserRecord = {
  id: number;
  email: string;
  name: string;
  avatar: string;
  cleanId: string;
  gender: "hidden";
};

async function findAuthUserByEmail(
  email: string,
): Promise<AuthUserRecord | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      email: string;
      name: string;
      avatar: string;
      cleanId: string;
    }>
  >`
    SELECT id, email, name, avatar::text AS avatar, "cleanId"
    FROM "User"
    WHERE email = ${email}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    gender: "hidden",
  };
}

async function findAuthUserById(
  userId: number,
): Promise<AuthUserRecord | null> {
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      email: string;
      name: string;
      avatar: string;
      cleanId: string;
    }>
  >`
    SELECT id, email, name, avatar::text AS avatar, "cleanId"
    FROM "User"
    WHERE id = ${userId}
    LIMIT 1
  `;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    ...row,
    gender: "hidden",
  };
}

async function createAuthUser(email: string): Promise<AuthUserRecord> {
  const cleanId = await generateUniqueCleanId();
  const name = email.split("@")[0];
  const rows = await prisma.$queryRaw<
    Array<{
      id: number;
      email: string;
      name: string;
      avatar: string;
      cleanId: string;
    }>
  >`
    INSERT INTO "User" (email, name, avatar, "cleanId", "createdAt", "updatedAt")
    VALUES (${email}, ${name}, ${DEFAULT_AVATAR}::"Avatar", ${cleanId}, NOW(), NOW())
    RETURNING id, email, name, avatar::text AS avatar, "cleanId"
  `;

  const row = rows[0];
  if (!row) {
    throw new Error("Failed to create auth user.");
  }

  return {
    ...row,
    gender: "hidden",
  };
}

async function generateUniqueCleanId(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = generateCleanId();
    const existingRows = await prisma.$queryRaw<Array<{ id: number }>>`
      SELECT id
      FROM "User"
      WHERE "cleanId" = ${candidate}
      LIMIT 1
    `;
    if (existingRows.length === 0) {
      return candidate;
    }
  }
  throw new Error("Failed to generate unique cleanId");
}

async function sendLoginCode(name: string, email: string, code: string) {
  if (!mailer) {
    throw new Error("Email login is not configured.");
  }
  const subject = "NO REPLY Your CleanCode verification code";

  const text = `Hello ${name},

Your CleanCode verification code is: ${code}

It expires in 10 minutes.

If you didn’t request this code, you can ignore this email.`;

  const html = `
  <div style="font-family: Arial, sans-serif; line-height: 1.5;">
    <p>Hello ${name},</p>

    <p>Your CleanCode verification code is:</p>

    <div style="
      font-size: 36px;
      font-weight: 700;
      letter-spacing: 6px;
      margin: 12px 0 8px 0;
    ">
      ${code}
    </div>

    <div style="font-size: 12px; color: #666; margin-top: 6px;">
      Expires in 10 minutes. You’re receiving this email because you requested access to your CleanCode account.
    </div>

    <p style="font-size: 12px; color: #666; margin-top: 16px;">
      If you didn’t request this code, you can ignore this email.
    </p>
  </div>
`;
  await mailer.sendMail({
    from: SMTP_FROM,
    to: email,
    subject,
    text,
    html,
  });
}
//typescirpt no need force return value
function queueLoginCodeEmail(
  name: string,
  email: string,
  code: string,
  codeHash: string,
) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  //关键字 void:去后台做，不用回信
  //await :等它做完，我再动。
  void sendLoginCode(name, email, code).catch(async (error) => {
    console.error("Failed to send verification email:", error);
    try {
      // Remove only the unused code that failed to send so user can request again immediately.
      await prisma.loginCode.deleteMany({
        where: {
          email,
          codeHash,
          usedAt: null,
        },
      });
    } catch (cleanupError) {
      console.error(
        "Failed to cleanup unsent verification code:",
        cleanupError,
      );
    }
  });
}

router.post("/email/start", async (req, res) => {
  try {
    const email = normalizeEmailInput(req.body.email);
    if (!Email_REGEX.test(email)) {
      sendAuthError(res, 400, AUTH_ERROR_CODES.invalidEmail, "Invalid email.");
      return;
    }
    if (!LOGIN_CODE_SECRET || !mailer) {
      sendAuthError(
        res,
        500,
        AUTH_ERROR_CODES.emailLoginNotConfigured,
        "Email login is not configured.",
      );
      return;
    }

    const now = new Date();
    const name = email.split("@")[0] || "there";

    const activeCode = await prisma.loginCode.findFirst({
      where: {
        email,
        usedAt: null,
        expireAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
    if (activeCode) {
      res.status(429).json({
        message:
          "A verification code is already active. Please wait for it to expire.",
      });
      return;
    }

    const code = generateLoginCode();
    const hashedCode = hashCode(code);
    const expireAt = new Date(Date.now() + CODE_TTL_MS);
    //prisma function is all async
    await prisma.$transaction([
      prisma.loginCode.deleteMany({
        where: {
          email,
        },
      }),
      prisma.loginCode.create({
        data: {
          email,
          codeHash: hashedCode,
          expireAt,
        },
      }),
    ]);

    queueLoginCodeEmail(name, email, code, hashedCode);
    res.status(202).json({ message: "Verification code is being sent" });
  } catch (error) {
    //instance of Error:判断error是不是Error的实例，如果是，就用error.message；如果不是，就把error转换成字符串。
    const details = error instanceof Error ? error.message : String(error);
    console.error("Failed to start email verification:", error);
    res.status(500).json({
      error: `Failed to send verification code email: ${details}`,
    });
  }
});

router.post("/email/verify", async (req, res) => {
  try {
    const email = normalizeEmailInput(req.body.email);
    const receivedCode = normalizeCodeInput(req.body.code);

    if (!Email_REGEX.test(email)) {
      sendAuthError(res, 400, AUTH_ERROR_CODES.invalidEmail, "Invalid email.");
      return;
    }
    if (receivedCode.length !== CODE_LENGTH) {
      sendAuthError(res, 400, AUTH_ERROR_CODES.invalidCode, "Invalid code.");
      return;
    }
    if (!LOGIN_CODE_SECRET) {
      sendAuthError(
        res,
        500,
        AUTH_ERROR_CODES.emailLoginNotConfigured,
        "Email login is not configured.",
      );
      return;
    }

    const loginCode = await prisma.loginCode.findFirst({
      where: {
        email,
        usedAt: null,
        expireAt: { gt: new Date() },
      },
    });
    if (!loginCode) {
      sendAuthError(
        res,
        400,
        AUTH_ERROR_CODES.invalidOrExpiredCode,
        "Invalid or expired code.",
      );
      return;
    }
    if (loginCode.attempts >= MAX_ATTEMPTS) {
      sendAuthError(
        res,
        429,
        AUTH_ERROR_CODES.tooManyAttempts,
        "Too many failed attempts. Please request a new code.",
      );
      return;
    }

    const providedCodeHash = hashCode(receivedCode);
    const storedCode = loginCode.codeHash;
    const hashesMatch =
      providedCodeHash.length === storedCode.length &&
      crypto.timingSafeEqual(
        Buffer.from(providedCodeHash),
        Buffer.from(storedCode),
      );

    if (!hashesMatch) {
      console.log(
        "Expected:",
        storedCode,
        "Received:",
        receivedCode,
        "ReceivedHash:",
        providedCodeHash,
      );
      await prisma.loginCode.update({
        where: { id: loginCode.id },
        data: { attempts: loginCode.attempts + 1 },
      });
      sendAuthError(
        res,
        401,
        AUTH_ERROR_CODES.invalidOrExpiredCode,
        "Invalid or expired code.",
      );
      return;
    }

    await prisma.loginCode.deleteMany({ where: { email } });

    const existingUser = await findAuthUserByEmail(email);

    const isNewUser = !existingUser;
    const user = existingUser ? existingUser : await createAuthUser(email);

    const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [user.id]);
    // Single-token auth: issue only one long-lived access token.
    const token = signAuthToken(user.id);

    res.json({
      message: "Login code verified",
      token,
      user: {
        ...user,
        trust: trustSnapshots.get(user.id) ?? fallbackCleanIdTrustSnapshot,
      },
      isNewUser,
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    console.error("Failed to verify email code:", error);
    res.status(500).json({
      errorCode: AUTH_ERROR_CODES.verificationFailed,
      error: "Verification failed.",
      details,
    });
  }
});

router.get("/me", authMiddleware, async (req, res) => {
  const userId = req.user?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  try {
    const user = await findAuthUserById(userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const trustSnapshots = await buildCleanIdTrustSnapshots(prisma, [user.id]);
    res.json({
      user: {
        ...user,
        trust: trustSnapshots.get(user.id) ?? fallbackCleanIdTrustSnapshot,
      },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    res
      .status(500)
      .json({ error: "Failed to load authenticated user.", details });
  }
});
router.post("/logout", (_req, res) => {
  res.json({ message: "Logged out successfully" });
});

export default router;
