import { apiClient } from "./apiClient";

type NotificationPermissionState = NotificationPermission | "unsupported";

type NotificationTarget =
  | {
      chatType: "direct";
      threadId: number;
    }
  | {
      chatType: "group";
      groupId: string;
    }
  | {
      url: string;
    };

type ShowNotificationOptions = {
  tag?: string;
  target?: NotificationTarget;
};

const isSupported = () =>
  typeof window !== "undefined" && "Notification" in window;
const hasServiceWorker = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator;
const DEBUG_PREFIX = "[CleanChat][notifications]";
const READY_TIMEOUT_MS = 4500;
const FALLBACK_ROUTE = "/conversations";
let cachedVapidPublicKey = "";

type PushSubscriptionResult = {
  ok: boolean;
  permission: NotificationPermissionState;
  reason?: string;
};

const normalizePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeGroupId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeRelativeUrl = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

const parseTargetFromTag = (tag?: string): NotificationTarget | undefined => {
  if (!tag) {
    return undefined;
  }

  if (tag.startsWith("thread-")) {
    const threadId = normalizePositiveInt(tag.slice("thread-".length));
    if (threadId) {
      return { chatType: "direct", threadId };
    }
  }

  if (tag.startsWith("group-")) {
    const groupId = normalizeGroupId(tag.slice("group-".length));
    if (groupId) {
      return { chatType: "group", groupId };
    }
  }

  return undefined;
};

const resolveShowOptions = (
  tagOrOptions?: string | ShowNotificationOptions,
): ShowNotificationOptions => {
  if (!tagOrOptions) {
    return {};
  }

  if (typeof tagOrOptions === "string") {
    return {
      tag: tagOrOptions,
      target: parseTargetFromTag(tagOrOptions),
    };
  }

  return {
    tag: tagOrOptions.tag,
    target: tagOrOptions.target ?? parseTargetFromTag(tagOrOptions.tag),
  };
};

const getNotificationRoute = (target?: NotificationTarget): string => {
  if (!target) {
    return FALLBACK_ROUTE;
  }

  if ("url" in target) {
    return normalizeRelativeUrl(target.url) ?? FALLBACK_ROUTE;
  }

  if (target.chatType === "direct") {
    const threadId = normalizePositiveInt(target.threadId);
    if (!threadId) {
      return FALLBACK_ROUTE;
    }

    return `/chat/${threadId}`;
  }

  const groupId = normalizeGroupId(target.groupId);
  if (!groupId) {
    return FALLBACK_ROUTE;
  }

  return `/chat/group/${encodeURIComponent(groupId)}`;
};

const readAndroidMajorVersion = (): number | null => {
  if (typeof navigator === "undefined") {
    return null;
  }

  const match = navigator.userAgent.match(/Android\s+(\d+)/i);
  if (!match) {
    return null;
  }

  const major = Number.parseInt(match[1], 10);
  return Number.isFinite(major) ? major : null;
};

export const isAndroid13Plus = () => {
  const major = readAndroidMajorVersion();
  return major !== null && major >= 13;
};

const resolveServiceWorkerRegistration =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!hasServiceWorker()) {
      return null;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        return registration;
      }

      const readyRegistration = await Promise.race<
        ServiceWorkerRegistration | undefined
      >([
        navigator.serviceWorker.ready,
        new Promise<undefined>((resolve) =>
          window.setTimeout(() => resolve(undefined), READY_TIMEOUT_MS),
        ),
      ]);

      return readyRegistration ?? null;
    } catch (error) {
      console.warn(
        `${DEBUG_PREFIX} failed to resolve service worker registration`,
        error,
      );
      return null;
    }
  };

export const ensureNotificationRegistration = async () => {
  return resolveServiceWorkerRegistration();
};

export const getNotificationPermission = (): NotificationPermissionState => {
  if (!isSupported()) return "unsupported";
  return Notification.permission;
};

export const requestNotificationPermission =
  async (): Promise<NotificationPermissionState> => {
    if (!isSupported()) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;

    // Android 13+ requires explicit runtime notification consent. Preparing the
    // service worker first avoids missing the first payload right after approval.
    await resolveServiceWorkerRegistration();
    return Notification.requestPermission();
  };

export const showMessageNotification = async (
  title: string,
  body: string,
  tagOrOptions?: string | ShowNotificationOptions,
): Promise<boolean> => {
  if (!isSupported() || Notification.permission !== "granted") return false;

  const options = resolveShowOptions(tagOrOptions);
  const route = getNotificationRoute(options.target);
  const payload = {
    url: route,
    target: options.target ?? null,
  };

  try {
    const registration = await resolveServiceWorkerRegistration();
    if (registration) {
      try {
        await registration.showNotification(title, {
          body,
          tag: options.tag,
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: payload,
        });
        return true;
      } catch (swError) {
        console.warn(
          `${DEBUG_PREFIX} service worker showNotification failed`,
          swError,
        );
      }
    }

    try {
      const notification = new Notification(title, {
        body,
        tag: options.tag,
        icon: "/icons/icon-192.png",
        data: payload,
      });
      notification.onclick = () => {
        window.focus();
        if (
          route &&
          route !==
            window.location.pathname +
              window.location.search +
              window.location.hash
        ) {
          window.location.assign(route);
        }
      };
      return true;
    } catch (domError) {
      console.warn(`${DEBUG_PREFIX} Notification constructor failed`, domError);
      return false;
    }
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} unexpected notification error`, error);
    return false;
  }
};

const isPushSupported = () =>
  isSupported() &&
  hasServiceWorker() &&
  typeof window !== "undefined" &&
  "PushManager" in window;

const readVapidPublicKeyFromEnv = () => {
  const raw =
    typeof import.meta.env.VITE_VAPID_PUBLIC_KEY === "string"
      ? import.meta.env.VITE_VAPID_PUBLIC_KEY
      : "";
  return raw.trim();
};

const decodeBase64Url = (value: string) => {
  const normalized = value.trim().replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = window.atob(padded);
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
};

const resolveVapidPublicKey = async () => {
  const envKey = readVapidPublicKeyFromEnv();
  if (envKey) {
    return envKey;
  }
  if (cachedVapidPublicKey) {
    return cachedVapidPublicKey;
  }

  try {
    const response = await apiClient.get("/profile/push/public-key");
    const key =
      typeof response.data?.publicKey === "string"
        ? response.data.publicKey.trim()
        : "";
    if (!key) {
      return "";
    }
    cachedVapidPublicKey = key;
    return key;
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} failed to load VAPID public key`, error);
    return "";
  }
};

const toBackendPushPayload = (subscription: PushSubscription) => {
  const endpoint = subscription.endpoint?.trim();
  const serialized = subscription.toJSON() as {
    expirationTime?: number | null;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
  const p256dh = serialized.keys?.p256dh?.trim() || "";
  const auth = serialized.keys?.auth?.trim() || "";

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return {
    endpoint,
    expirationTime:
      typeof serialized.expirationTime === "number"
        ? serialized.expirationTime
        : null,
    keys: {
      p256dh,
      auth,
    },
  };
};

export const ensurePushSubscriptionForCurrentUser = async (
  options: { requestPermission?: boolean } = {},
): Promise<PushSubscriptionResult> => {
  if (!isPushSupported()) {
    return {
      ok: false,
      permission: "unsupported",
      reason: "Push is not supported in this browser.",
    };
  }

  const shouldRequestPermission = options.requestPermission === true;
  let permission = getNotificationPermission();

  if (permission === "unsupported") {
    return {
      ok: false,
      permission,
      reason: "Notifications are unsupported.",
    };
  }

  if (permission !== "granted" && shouldRequestPermission) {
    permission = await requestNotificationPermission();
  }

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      reason: "Notification permission is not granted.",
    };
  }

  const registration = await resolveServiceWorkerRegistration();
  if (!registration) {
    return {
      ok: false,
      permission,
      reason: "Service worker registration is not ready.",
    };
  }

  try {
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const vapidPublicKey = await resolveVapidPublicKey();
      if (!vapidPublicKey) {
        return {
          ok: false,
          permission,
          reason: "VAPID public key is not configured.",
        };
      }

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeBase64Url(vapidPublicKey),
      });
    }

    const payload = toBackendPushPayload(subscription);
    if (!payload) {
      return {
        ok: false,
        permission,
        reason: "Push subscription payload is incomplete.",
      };
    }

    await apiClient.put("/profile/push/subscription", payload);

    return {
      ok: true,
      permission,
    };
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} failed to subscribe and sync push`, error);
    return {
      ok: false,
      permission,
      reason: "Failed to subscribe for push notifications.",
    };
  }
};
