import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { getKeepAliveStatus } from "../keepAlive";
import { getPushConfigurationStatus } from "../push";
import { sendPushToUser } from "../push";
import {
  flushRuntimeStatePersistence,
  getRuntimeStatePersistenceStatus,
} from "../runtimePersistence";

const router = Router();
const prisma = new PrismaClient();

const isOpsAuthorized = (rawToken: unknown) => {
  const configuredToken = process.env.OPS_TOKEN?.trim();
  if (!configuredToken) {
    return true;
  }

  return typeof rawToken === "string" && rawToken.trim() === configuredToken;
};

const parsePositiveUserId = (raw: unknown) => {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const normalizeChatType = (raw: unknown): "direct" | "group" =>
  raw === "group" ? "group" : "direct";

const getOpsTokenFromHeader = (rawHeader: unknown) =>
  typeof rawHeader === "string"
    ? rawHeader
    : Array.isArray(rawHeader)
      ? rawHeader[0]
      : undefined;

router.get("/healthz", (_req, res) => {
  const pushStatus = getPushConfigurationStatus();
  res.status(200).json({
    ok: true,
    service: "cleanchat-backend",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    push: {
      configured: pushStatus.configured,
      hasPublicKey: pushStatus.hasPublicKey,
      hasPrivateKey: pushStatus.hasPrivateKey,
      publicKeyFormatValid: pushStatus.publicKeyFormatValid,
      privateKeyFormatValid: pushStatus.privateKeyFormatValid,
      errors: pushStatus.errors,
    },
    keepalive: getKeepAliveStatus(),
    runtimePersistence: getRuntimeStatePersistenceStatus(),
  });
});

router.get("/readyz", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      ok: true,
      db: "up",
      timestamp: new Date().toISOString(),
      runtimePersistence: getRuntimeStatePersistenceStatus(),
    });
  } catch (error) {
    res.status(503).json({
      ok: false,
      db: "down",
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      runtimePersistence: getRuntimeStatePersistenceStatus(),
    });
  }
});

router.get("/keepalive", (req, res) => {
  const source =
    typeof req.query.source === "string" && req.query.source.trim()
      ? req.query.source.trim()
      : "unknown";

  res.status(200).json({
    ok: true,
    source,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
});

router.get("/push-config", (_req, res) => {
  const status = getPushConfigurationStatus();

  res.status(status.configured ? 200 : 503).json({
    ok: status.configured,
    configured: status.configured,
    hasPublicKey: status.hasPublicKey,
    hasPrivateKey: status.hasPrivateKey,
    publicKeyFormatValid: status.publicKeyFormatValid,
    privateKeyFormatValid: status.privateKeyFormatValid,
    errors: status.errors,
    timestamp: new Date().toISOString(),
  });
});

router.get("/push/subscriptions/:userId", async (req, res) => {
  const headerToken = getOpsTokenFromHeader(req.headers["x-ops-token"]);
  if (!isOpsAuthorized(headerToken)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }

  const userId = parsePositiveUserId(req.params.userId);
  if (!userId) {
    res.status(400).json({ ok: false, message: "Invalid userId" });
    return;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      id: true,
      endpoint: true,
      expirationTime: true,
      createdAt: true,
      updatedAt: true,
      lastSeenAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  res.status(200).json({
    ok: true,
    userId,
    count: subscriptions.length,
    subscriptions: subscriptions.map((item) => {
      let endpointHost = "";
      try {
        endpointHost = new URL(item.endpoint).host;
      } catch {
        endpointHost = "";
      }

      return {
        id: item.id,
        endpointHost,
        endpoint: item.endpoint,
        expirationTime: item.expirationTime,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        lastSeenAt: item.lastSeenAt,
      };
    }),
    timestamp: new Date().toISOString(),
  });
});

router.post("/push/test", async (req, res) => {
  const headerToken = getOpsTokenFromHeader(req.headers["x-ops-token"]);
  if (!isOpsAuthorized(headerToken)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }

  const userId = parsePositiveUserId(req.body?.userId);
  if (!userId) {
    res.status(400).json({ ok: false, message: "Invalid userId" });
    return;
  }

  const title =
    typeof req.body?.title === "string" && req.body.title.trim()
      ? req.body.title.trim().slice(0, 120)
      : "CleanChat test push";
  const body =
    typeof req.body?.body === "string" && req.body.body.trim()
      ? req.body.body.trim().slice(0, 240)
      : "Push delivery diagnostic message";
  const url =
    typeof req.body?.url === "string" && req.body.url.trim().startsWith("/")
      ? req.body.url.trim()
      : "/conversations?fromPush=1";
  const tag =
    typeof req.body?.tag === "string" && req.body.tag.trim()
      ? req.body.tag.trim().slice(0, 64)
      : `ops-test-${Date.now()}`;
  const chatType = normalizeChatType(req.body?.chatType);
  const threadId =
    typeof req.body?.threadId === "number" &&
    Number.isInteger(req.body.threadId)
      ? req.body.threadId
      : undefined;
  const groupId =
    typeof req.body?.groupId === "string" && req.body.groupId.trim()
      ? req.body.groupId.trim()
      : undefined;

  const subscriptionCount = await prisma.pushSubscription.count({
    where: { userId },
  });

  await sendPushToUser(prisma, userId, {
    title,
    body,
    tag,
    data: {
      url,
      chatType,
      threadId,
      groupId,
      senderName: "Ops Diagnostic",
      summary: body,
    },
  });

  res.status(200).json({
    ok: true,
    userId,
    subscriptionCount,
    sentAt: new Date().toISOString(),
    payload: {
      title,
      body,
      tag,
      url,
      chatType,
      threadId: threadId ?? null,
      groupId: groupId ?? null,
    },
  });
});

router.post("/runtime-state/flush", async (req, res) => {
  const headerToken = getOpsTokenFromHeader(req.headers["x-ops-token"]);

  if (!isOpsAuthorized(headerToken)) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
    return;
  }

  const flushed = await flushRuntimeStatePersistence();
  res.status(flushed ? 200 : 503).json({
    ok: flushed,
    timestamp: new Date().toISOString(),
    runtimePersistence: getRuntimeStatePersistenceStatus(),
  });
});

export default router;
