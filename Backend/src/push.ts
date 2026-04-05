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

const RAW_VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY?.trim() || "";
const RAW_VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY?.trim() || "";
const RAW_VAPID_SUBJECT = process.env.VAPID_SUBJECT?.trim() || "";
const DEFAULT_VAPID_SUBJECT = "mailto:no-reply@cleanchat.local";
const IS_PUSH_CONFIGURED =
  RAW_VAPID_PUBLIC_KEY.length > 0 && RAW_VAPID_PRIVATE_KEY.length > 0;

if (IS_PUSH_CONFIGURED) {
  webpush.setVapidDetails(
    RAW_VAPID_SUBJECT || DEFAULT_VAPID_SUBJECT,
    RAW_VAPID_PUBLIC_KEY,
    RAW_VAPID_PRIVATE_KEY,
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

export const isPushConfigured = () => IS_PUSH_CONFIGURED;

export const getVapidPublicKey = () =>
  IS_PUSH_CONFIGURED ? RAW_VAPID_PUBLIC_KEY : null;

export const sendPushToUser = async (
  prisma: PrismaClient,
  userId: number,
  envelope: PushEnvelope,
) => {
  if (!IS_PUSH_CONFIGURED) {
    return;
  }

  if (!Number.isInteger(userId) || userId <= 0) {
    return;
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
    return;
  }

  const payload = buildPayload(envelope);
  const staleIds: number[] = [];

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
        );
      } catch (error) {
        if (isStaleEndpointError(error)) {
          staleIds.push(subscription.id);
          return;
        }

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
};
