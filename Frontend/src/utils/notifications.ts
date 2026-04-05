import { apiClient } from "./apiClient";

export type NotificationPermissionState =
  | NotificationPermission
  | "unsupported";

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

export type NotificationRuntimeSupport = {
  permission: NotificationPermissionState;
  pushSupported: boolean;
  serviceWorkerReady: boolean;
  isIOSDevice: boolean;
  isStandalonePwa: boolean;
  requiresStandaloneForIOS: boolean;
};

const isSupported = () =>
  typeof window !== "undefined" && "Notification" in window;
const hasServiceWorker = () =>
  typeof navigator !== "undefined" && "serviceWorker" in navigator;
const hasPushManager = () =>
  typeof window !== "undefined" && "PushManager" in window;
const DEBUG_PREFIX = "[CleanChat][notifications]";
const READY_TIMEOUT_MS = 12000;
const FALLBACK_ROUTE = "/conversations";
const SW_SCRIPT_URL = "/sw.js";
const PUSH_ENTRY_QUERY_KEY = "fromPush";
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

const appendPushEntryQuery = (value: string) => {
  if (typeof window === "undefined") {
    return value;
  }

  try {
    const parsed = new URL(value, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return value;
    }

    if (!parsed.searchParams.has(PUSH_ENTRY_QUERY_KEY)) {
      parsed.searchParams.set(PUSH_ENTRY_QUERY_KEY, "1");
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return value;
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

const isLocalhost = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  );
};

export const isIOSDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return /iPad|iPhone|iPod/i.test(navigator.userAgent);
};

export const isStandalonePwa = () => {
  if (typeof window === "undefined") {
    return false;
  }

  const mediaStandalone = window.matchMedia(
    "(display-mode: standalone)",
  ).matches;
  const navigatorStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true;
  return mediaStandalone || navigatorStandalone;
};

export const requiresIOSPwaForPush = () => isIOSDevice() && !isStandalonePwa();

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

const waitForActivatedServiceWorker = async (
  registration: ServiceWorkerRegistration,
) => {
  if (registration.active?.state === "activated") {
    return registration;
  }

  const worker =
    registration.installing ?? registration.waiting ?? registration.active;
  if (!worker) {
    return registration;
  }

  if (worker.state === "activated") {
    return registration;
  }

  return new Promise<ServiceWorkerRegistration>((resolve) => {
    if (typeof window === "undefined") {
      resolve(registration);
      return;
    }

    let settled = false;
    const timerId = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      worker.removeEventListener("statechange", handleStateChange);
      resolve(registration);
    }, READY_TIMEOUT_MS);

    const handleStateChange = () => {
      if (
        worker.state === "activated" ||
        registration.active?.state === "activated"
      ) {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timerId);
        worker.removeEventListener("statechange", handleStateChange);
        resolve(registration);
      }
    };

    worker.addEventListener("statechange", handleStateChange);
    handleStateChange();
  });
};

const getKnownServiceWorkerRegistration = async () => {
  if (!hasServiceWorker()) {
    return null;
  }

  const byScript = await navigator.serviceWorker
    .getRegistration(SW_SCRIPT_URL)
    .catch(() => undefined);
  if (byScript) {
    return byScript;
  }

  const anyRegistration = await navigator.serviceWorker
    .getRegistration()
    .catch(() => undefined);
  if (anyRegistration) {
    return anyRegistration;
  }

  const registrations = await navigator.serviceWorker
    .getRegistrations()
    .catch(() => [] as ServiceWorkerRegistration[]);
  if (registrations.length === 0) {
    return null;
  }

  const preferred = registrations.find((item) => {
    const scriptUrl =
      item.active?.scriptURL ??
      item.waiting?.scriptURL ??
      item.installing?.scriptURL ??
      "";
    return scriptUrl.includes("/sw.js") || scriptUrl.includes("/dev-sw.js");
  });

  return preferred ?? registrations[0] ?? null;
};

const tryRegisterServiceWorkerFallback = async () => {
  if (!hasServiceWorker()) {
    return null;
  }

  if (typeof window === "undefined") {
    return null;
  }

  if (!window.isSecureContext && !isLocalhost()) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SW_SCRIPT_URL, {
      scope: "/",
    });
  } catch (error) {
    console.warn(
      `${DEBUG_PREFIX} manual service worker register failed`,
      error,
    );
    return null;
  }
};

const resolveServiceWorkerRegistration =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!hasServiceWorker()) {
      return null;
    }

    try {
      const registration = await getKnownServiceWorkerRegistration();
      if (registration) {
        return await waitForActivatedServiceWorker(registration);
      }

      const fallbackRegistration = await tryRegisterServiceWorkerFallback();
      if (fallbackRegistration) {
        return await waitForActivatedServiceWorker(fallbackRegistration);
      }

      const readyRegistration = await Promise.race<
        ServiceWorkerRegistration | undefined
      >([
        navigator.serviceWorker.ready.then((value) =>
          waitForActivatedServiceWorker(value),
        ),
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

export const getNotificationRuntimeSupport =
  async (): Promise<NotificationRuntimeSupport> => {
    const permission = getNotificationPermission();
    const requiresStandaloneForIOS = requiresIOSPwaForPush();
    const serviceWorkerRegistration = await resolveServiceWorkerRegistration();

    return {
      permission,
      pushSupported:
        isSupported() &&
        hasServiceWorker() &&
        hasPushManager() &&
        !requiresStandaloneForIOS,
      serviceWorkerReady: Boolean(serviceWorkerRegistration?.active),
      isIOSDevice: isIOSDevice(),
      isStandalonePwa: isStandalonePwa(),
      requiresStandaloneForIOS,
    };
  };

export const requestNotificationPermission =
  async (): Promise<NotificationPermissionState> => {
    if (!isSupported()) return "unsupported";
    if (requiresIOSPwaForPush()) return "unsupported";
    if (Notification.permission !== "default") return Notification.permission;

    const permission = await Notification.requestPermission();

    if (permission === "granted") {
      await resolveServiceWorkerRegistration();
    }

    return permission;
  };

export const showMessageNotification = async (
  title: string,
  body: string,
  tagOrOptions?: string | ShowNotificationOptions,
): Promise<boolean> => {
  if (!isSupported() || Notification.permission !== "granted") return false;

  const options = resolveShowOptions(tagOrOptions);
  const route = appendPushEntryQuery(getNotificationRoute(options.target));
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
  isSupported() && hasServiceWorker() && hasPushManager();

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
  if (requiresIOSPwaForPush()) {
    return {
      ok: false,
      permission: getNotificationPermission(),
      reason: "iOS web push requires launching from Home Screen PWA mode.",
    };
  }

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

    const isExpired =
      subscription &&
      typeof subscription.expirationTime === "number" &&
      subscription.expirationTime <= Date.now();
    if (subscription && isExpired) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Ignore unsubscribe failures; a fresh subscribe below can still proceed.
      }
      subscription = null;
    }

    if (subscription && !toBackendPushPayload(subscription)) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Ignore unsubscribe failures for malformed legacy subscription objects.
      }
      subscription = null;
    }

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
