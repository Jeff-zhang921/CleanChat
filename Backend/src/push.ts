import type { PrismaClient } from "@prisma/client";
import webpush from "web-push";

type PushChatType = "direct" | "group";

type PushEnvelope = {
  title: string;
  body: string;
  tag?: string;
  data?: {
    url?: string;
    chatType?: PushChatType;
    threadId?: number;
    groupId?: string;
    senderName?: string;
    summary?: string;
  };
};

type PushSendError = {
  statusCode?: number;
  body?: unknown;
  message?: string;
};

export type PushDeliveryFailure = {
  endpoint: string;
  statusCode?: number;
  message: string;
};

export type PushDeliveryReport = {
  configured: boolean;
  attempted: number;
  sent: number;
  stale: number;
  failed: number;
  skippedReason?: string;
  failures: PushDeliveryFailure[];
};

export type PushConfigurationStatus = {
  configured: boolean;
  hasPublicKey: boolean;
  hasPrivateKey: boolean;
  publicKeyFormatValid: boolean;
  privateKeyFormatValid: boolean;
  subject: string;
  errors: string[];
};

const RAW_VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const RAW_VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const RAW_VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "";
const DEFAULT_VAPID_SUBJECT = "mailto:no-reply@cleanchat.local";
const PUSH_DEBUG_PREFIX = "[CleanChat][push]";
const BASE64_URL_REGEX = /^[A-Za-z0-9_-]+$/;
const VAPID_PUBLIC_KEY_BYTES = 65;
const VAPID_PRIVATE_KEY_BYTES = 32;

const decodeBase64Url = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!BASE64_URL_REGEX.test(normalized)) {
    return null;
  }

  const base64 = normalized
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  try {
    const decoded = Buffer.from(base64, "base64");
    if (decoded.length === 0) {
      return null;
    }
    return new Uint8Array(decoded);
  } catch {
    return null;
  }
};

const validatePushConfiguration = (): PushConfigurationStatus => {
  const errors: string[] = [];

  const hasPublicKey = RAW_VAPID_PUBLIC_KEY.length > 0;
  const hasPrivateKey = RAW_VAPID_PRIVATE_KEY.length > 0;

  if (!hasPublicKey) {
    errors.push("VAPID_PUBLIC_KEY is missing.");
  }
  if (!hasPrivateKey) {
    errors.push("VAPID_PRIVATE_KEY is missing.");
  }

  const decodedPublicKey = hasPublicKey
    ? decodeBase64Url(RAW_VAPID_PUBLIC_KEY)
    : null;
  const decodedPrivateKey = hasPrivateKey
    ? decodeBase64Url(RAW_VAPID_PRIVATE_KEY)
    : null;

  const publicKeyFormatValid =
    decodedPublicKey !== null &&
    decodedPublicKey.length === VAPID_PUBLIC_KEY_BYTES &&
    decodedPublicKey[0] === 0x04;
  const privateKeyFormatValid =
    decodedPrivateKey !== null &&
    decodedPrivateKey.length === VAPID_PRIVATE_KEY_BYTES;

  if (hasPublicKey && !publicKeyFormatValid) {
    errors.push(
      "VAPID_PUBLIC_KEY is not a valid uncompressed P-256 key (base64url, 65 bytes).",
    );
  }
  if (hasPrivateKey && !privateKeyFormatValid) {
    errors.push(
      "VAPID_PRIVATE_KEY is not a valid P-256 private key (base64url, 32 bytes).",
    );
  }

  const subject = RAW_VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT;

  let configured = errors.length === 0;
  if (configured) {
    try {
      webpush.setVapidDetails(
        subject,
        RAW_VAPID_PUBLIC_KEY,
        RAW_VAPID_PRIVATE_KEY,
      );
    } catch (error) {
      configured = false;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Failed to initialize VAPID details: ${message}`);
    }
  }

  return {
    configured,
    hasPublicKey,
    hasPrivateKey,
    publicKeyFormatValid,
    privateKeyFormatValid,
    subject,
    errors,
  };
};

const PUSH_CONFIGURATION_STATUS = validatePushConfiguration();

if (!PUSH_CONFIGURATION_STATUS.configured) {
  console.warn(
    `${PUSH_DEBUG_PREFIX} Web push is disabled. ${PUSH_CONFIGURATION_STATUS.errors.join(" ")}`,
  );
}

const isStaleEndpointError = (error: unknown) => {
  const candidate = error as PushSendError;
  return candidate?.statusCode === 404 || candidate?.statusCode === 410;
};

const buildPayload = (envelope: PushEnvelope) => {
  const title = envelope.title.trim() || "CleanChat";
  const body = envelope.body.trim() || "You have a new message.";
  const data = envelope.data ?? {};

  return JSON.stringify({
    title,
    body,
    tag: envelope.tag,
    data: {
      chatType:
        data.chatType === "group"
          ? "group"
          : data.chatType === "direct"
            ? "direct"
            : undefined,
      threadId:
        typeof data.threadId === "number" && Number.isInteger(data.threadId)
          ? data.threadId
          : undefined,
      groupId:
        typeof data.groupId === "string" && data.groupId.trim()
          ? data.groupId.trim()
          : undefined,
      senderName:
        typeof data.senderName === "string" && data.senderName.trim()
          ? data.senderName.trim().slice(0, 120)
          : undefined,
      summary:
        typeof data.summary === "string" && data.summary.trim()
          ? data.summary.trim().slice(0, 260)
          : undefined,
      url:
        typeof data.url === "string" && data.url.trim().startsWith("/")
          ? data.url.trim()
          : undefined,
    },
  });
};

const buildPushDeliveryOptions = (tag?: string) => {
  const normalizedTopic =
    typeof tag === "string"
      ? tag
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "")
          .slice(0, 32)
      : "";

  return {
    TTL: 60,
    urgency: "high" as const,
    ...(normalizedTopic ? { topic: normalizedTopic } : {}),
  };
};

export const isPushConfigured = () => PUSH_CONFIGURATION_STATUS.configured;

export const getVapidPublicKey = () =>
  PUSH_CONFIGURATION_STATUS.configured ? RAW_VAPID_PUBLIC_KEY : null;

export const getPushConfigurationStatus = (): PushConfigurationStatus => ({
  ...PUSH_CONFIGURATION_STATUS,
  errors: [...PUSH_CONFIGURATION_STATUS.errors],
});

export const sendPushToUser = async (
  prisma: PrismaClient,
  userId: number,
  envelope: PushEnvelope,
) => {
  if (!PUSH_CONFIGURATION_STATUS.configured) {
    return {
      configured: false,
      attempted: 0,
      sent: 0,
      stale: 0,
      failed: 0,
      skippedReason: "Push is not configured on backend.",
      failures: [],
    } as PushDeliveryReport;
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    return {
      configured: true,
      attempted: 0,
      sent: 0,
      stale: 0,
      failed: 0,
      skippedReason: "Invalid user id.",
      failures: [],
    } as PushDeliveryReport;
  }

  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true,
    },
  });

  if (subscriptions.length === 0) {
    return {
      configured: true,
      attempted: 0,
      sent: 0,
      stale: 0,
      failed: 0,
      skippedReason: "No push subscriptions for user.",
      failures: [],
    } as PushDeliveryReport;
  }

  const payload = buildPayload(envelope);
  const staleIds: number[] = [];
  let sentCount = 0;
  let staleCount = 0;
  let failedCount = 0;
  const failures: PushDeliveryFailure[] = [];

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth,
            },
          },
          payload,
          buildPushDeliveryOptions(envelope.tag),
        );
        sentCount += 1;
      } catch (error) {
        if (isStaleEndpointError(error)) {
          staleIds.push(subscription.id);
          staleCount += 1;
          return;
        }

        failedCount += 1;
        const candidate = error as PushSendError;
        failures.push({
          endpoint: subscription.endpoint,
          statusCode: candidate?.statusCode,
          message:
            typeof candidate?.message === "string" && candidate.message.trim()
              ? candidate.message
              : "Failed to send notification.",
        });

        console.warn("Failed to send web push notification", {
          userId,
          endpoint: subscription.endpoint,
          error,
        });
      }
    }),
  );

  if (staleIds.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { id: { in: staleIds } },
    });
  }

  return {
    configured: true,
    attempted: subscriptions.length,
    sent: sentCount,
    stale: staleCount,
    failed: failedCount,
    failures,
  } as PushDeliveryReport;
};
