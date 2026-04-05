import { PrismaClient } from "@prisma/client";
import { Router } from "express";
import { getKeepAliveStatus } from "../keepAlive";
import { getPushConfigurationStatus } from "../push";
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

router.post("/runtime-state/flush", async (req, res) => {
  const headerToken =
    typeof req.headers["x-ops-token"] === "string"
      ? req.headers["x-ops-token"]
      : Array.isArray(req.headers["x-ops-token"])
        ? req.headers["x-ops-token"][0]
        : undefined;

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
