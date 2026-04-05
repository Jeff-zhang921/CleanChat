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
const PUSH_ENTRY_STAMP_QUERY_KEY = "pushAt";
const PUSH_VAPID_STORAGE_KEY = "cleanchat:vapid-public-key";
const PUSH_VAPID_FINGERPRINT_KEY = "cleanchat:push-vapid-fingerprint";
const PUSH_EXPLICIT_ACTIVATION_PREFIX = "cleanchat:push-explicit-activation:";
const DEFAULT_NOTIFICATION_VIBRATION_PATTERN = [200, 100, 200] as const;
const VAPID_BASE64_URL_REGEX = /^[A-Za-z0-9_-]+$/;
const VAPID_PUBLIC_KEY_BYTES = 65;
let cachedVapidPublicKey = "";

type PushSubscriptionResult = {
  ok: boolean;
  permission: NotificationPermissionState;
  reason?: string;
};

type VapidResolutionResult =
  | {
      ok: true;
      key: string;
      keyBytes: Uint8Array;
      source: "env" | "storage" | "backend";
    }
  | {
      ok: false;
      reason: string;
    };

type AxiosLikeError = {
  response?: {
    status?: number;
    data?: unknown;
  };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isAxiosLikeError = (error: unknown): error is AxiosLikeError => {
  if (!isRecord(error)) {
    return false;
  }

  return "response" in error;
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

const normalizePushActivationUserKey = (
  value: number | string | null | undefined,
) => {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? String(value) : null;
  }

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
    if (!parsed.searchParams.has(PUSH_ENTRY_STAMP_QUERY_KEY)) {
      parsed.searchParams.set(PUSH_ENTRY_STAMP_QUERY_KEY, String(Date.now()));
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

  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0)
  );
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
        const serviceWorkerOptions: NotificationOptions & {
          renotify?: boolean;
          vibrate?: number[];
        } = {
          body,
          tag: options.tag,
          renotify: Boolean(options.tag),
          vibrate: [...DEFAULT_NOTIFICATION_VIBRATION_PATTERN],
          icon: "/icons/icon-192.png",
          badge: "/icons/icon-192.png",
          data: payload,
        };
        await registration.showNotification(title, serviceWorkerOptions);
        return true;
      } catch (swError) {
        console.warn(
          `${DEBUG_PREFIX} service worker showNotification failed`,
          swError,
        );
      }
    }

    try {
      const notificationOptions: NotificationOptions & {
        renotify?: boolean;
        vibrate?: number[];
      } = {
        body,
        tag: options.tag,
        renotify: Boolean(options.tag),
        vibrate: [...DEFAULT_NOTIFICATION_VIBRATION_PATTERN],
        icon: "/icons/icon-192.png",
        data: payload,
      };
      const notification = new Notification(title, notificationOptions);
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

const readStorageValue = (key: string) => {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    return window.localStorage.getItem(key)?.trim() || "";
  } catch {
    return "";
  }
};

const writeStorageValue = (key: string, value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value.trim()) {
      window.localStorage.setItem(key, value.trim());
      return;
    }
    window.localStorage.removeItem(key);
  } catch {
    // Ignore localStorage failures and continue with runtime-only values.
  }
};

const readVapidFingerprint = () => readStorageValue(PUSH_VAPID_FINGERPRINT_KEY);

const writeVapidFingerprint = (key: string) => {
  writeStorageValue(PUSH_VAPID_FINGERPRINT_KEY, key);
};

const clearVapidFingerprint = () => {
  writeStorageValue(PUSH_VAPID_FINGERPRINT_KEY, "");
};

const getPushActivationStorageKey = (
  userKey: number | string | null | undefined,
) => {
  const normalizedUserKey = normalizePushActivationUserKey(userKey);
  if (!normalizedUserKey) {
    return null;
  }

  return `${PUSH_EXPLICIT_ACTIVATION_PREFIX}${normalizedUserKey}`;
};

const writePushActivationForUser = (
  userKey: number | string | null | undefined,
  enabled: boolean,
) => {
  const storageKey = getPushActivationStorageKey(userKey);
  if (!storageKey) {
    return;
  }

  writeStorageValue(storageKey, enabled ? "1" : "");
};

export const hasPushActivationForUser = (
  userKey: number | string | null | undefined,
) => {
  const storageKey = getPushActivationStorageKey(userKey);
  if (!storageKey) {
    return false;
  }

  return readStorageValue(storageKey) === "1";
};

export const clearPushActivationForUser = (
  userKey: number | string | null | undefined,
) => {
  writePushActivationForUser(userKey, false);
};

const readVapidPublicKeyFromStorage = () =>
  readStorageValue(PUSH_VAPID_STORAGE_KEY);

const writeVapidPublicKeyToStorage = (key: string) => {
  writeStorageValue(PUSH_VAPID_STORAGE_KEY, key);
};

const clearCachedVapidPublicKey = () => {
  cachedVapidPublicKey = "";
  writeVapidPublicKeyToStorage("");
};

const decodeBase64UrlToBytes = (value: string): Uint8Array | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || !VAPID_BASE64_URL_REGEX.test(normalized)) {
    return null;
  }

  const base64 = normalized
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");

  try {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  } catch {
    return null;
  }
};

const parseVapidPublicKey = (
  rawValue: string,
  source: "env" | "storage" | "backend",
): VapidResolutionResult => {
  const key = rawValue.trim();
  if (!key) {
    return {
      ok: false,
      reason:
        source === "backend"
          ? "Backend did not return a VAPID public key."
          : "VAPID public key is empty.",
    };
  }

  if (!VAPID_BASE64_URL_REGEX.test(key)) {
    return {
      ok: false,
      reason:
        source === "env"
          ? "VITE_VAPID_PUBLIC_KEY format is invalid (expected base64url string)."
          : "VAPID public key format is invalid (expected base64url string).",
    };
  }

  const keyBytes = decodeBase64UrlToBytes(key);
  if (
    !keyBytes ||
    keyBytes.length !== VAPID_PUBLIC_KEY_BYTES ||
    keyBytes[0] !== 0x04
  ) {
    return {
      ok: false,
      reason:
        source === "env"
          ? "VITE_VAPID_PUBLIC_KEY is not a valid uncompressed P-256 public key."
          : "VAPID public key is not a valid uncompressed P-256 public key.",
    };
  }

  return {
    ok: true,
    key,
    keyBytes,
    source,
  };
};

const toApiErrorReason = (error: unknown) => {
  if (!isAxiosLikeError(error)) {
    return "Failed to fetch VAPID public key from backend.";
  }

  const status = error.response?.status;
  const payload = error.response?.data;
  if (!isRecord(payload)) {
    if (status === 401) {
      return "Not authenticated while fetching VAPID public key.";
    }

    if (status === 503) {
      return "Backend push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on backend.";
    }

    return "Failed to fetch VAPID public key from backend.";
  }

  const errorCode =
    typeof payload.errorCode === "string" ? payload.errorCode : "";
  const message = typeof payload.error === "string" ? payload.error.trim() : "";
  const details = isRecord(payload.details) ? payload.details : null;
  const detailedErrors =
    details && Array.isArray(details.errors)
      ? details.errors
          .map((item) => (typeof item === "string" ? item.trim() : ""))
          .filter(Boolean)
      : [];

  if (errorCode === "PUSH_NOT_CONFIGURED" || status === 503) {
    if (detailedErrors.length > 0) {
      return `Backend push is not configured. ${detailedErrors.join(" ")}`;
    }

    return (
      message ||
      "Backend push is not configured. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY on backend."
    );
  }

  if (status === 401) {
    return "Not authenticated while fetching VAPID public key.";
  }

  return message || "Failed to fetch VAPID public key from backend.";
};

const resolveVapidPublicKey = async (): Promise<VapidResolutionResult> => {
  const envKey = readVapidPublicKeyFromEnv();
  if (envKey) {
    const parsed = parseVapidPublicKey(envKey, "env");
    if (!parsed.ok) {
      return parsed;
    }

    cachedVapidPublicKey = parsed.key;
    writeVapidPublicKeyToStorage(parsed.key);
    return parsed;
  }

  const memoryKey = cachedVapidPublicKey.trim();
  if (memoryKey) {
    const parsed = parseVapidPublicKey(memoryKey, "storage");
    if (parsed.ok) {
      return parsed;
    }
    clearCachedVapidPublicKey();
  }

  const storedKey = readVapidPublicKeyFromStorage();
  if (storedKey) {
    const parsed = parseVapidPublicKey(storedKey, "storage");
    if (parsed.ok) {
      cachedVapidPublicKey = parsed.key;
      return parsed;
    }
    clearCachedVapidPublicKey();
  }

  try {
    const response = await apiClient.get("/profile/push/public-key");
    const key =
      typeof response.data?.publicKey === "string"
        ? response.data.publicKey.trim()
        : "";
    const parsed = parseVapidPublicKey(key, "backend");
    if (!parsed.ok) {
      return {
        ok: false,
        reason: parsed.reason,
      };
    }

    cachedVapidPublicKey = parsed.key;
    writeVapidPublicKeyToStorage(parsed.key);
    return parsed;
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} failed to load VAPID public key`, error);
    return {
      ok: false,
      reason: toApiErrorReason(error),
    };
  }
};

const readApplicationServerKey = (subscription: PushSubscription) => {
  const applicationServerKey = subscription.options.applicationServerKey;
  if (!applicationServerKey) {
    return null;
  }

  if (applicationServerKey instanceof ArrayBuffer) {
    return new Uint8Array(applicationServerKey);
  }

  return null;
};

const areEqualBytes = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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

export const hasExistingPushSubscription = async () => {
  if (requiresIOSPwaForPush() || !isPushSupported()) {
    return false;
  }

  if (getNotificationPermission() !== "granted") {
    return false;
  }

  const registration = await resolveServiceWorkerRegistration();
  if (!registration) {
    return false;
  }

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    return false;
  }

  return Boolean(toBackendPushPayload(subscription));
};

export const syncLinkedPushSubscriptionForCurrentUser = async (
  options: { activationUserKey?: number | string | null } = {},
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

  const activationUserKey = options.activationUserKey;
  const permission = getNotificationPermission();

  if (permission !== "granted") {
    return {
      ok: false,
      permission,
      reason: "Notification permission is not granted.",
    };
  }

  if (!hasPushActivationForUser(activationUserKey)) {
    return {
      ok: false,
      permission,
      reason: "Push notifications on this device still need an explicit enable action.",
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

  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    clearPushActivationForUser(activationUserKey);
    return {
      ok: false,
      permission,
      reason: "Push subscription is not active on this device.",
    };
  }

  const vapidResolution = await resolveVapidPublicKey();
  if (!vapidResolution.ok) {
    clearVapidFingerprint();
    return {
      ok: false,
      permission,
      reason: vapidResolution.reason,
    };
  }

  const currentServerKey = readApplicationServerKey(subscription);
  if (
    !currentServerKey ||
    !areEqualBytes(currentServerKey, vapidResolution.keyBytes)
  ) {
    clearPushActivationForUser(activationUserKey);
    clearVapidFingerprint();
    return {
      ok: false,
      permission,
      reason: "Push keys changed. Enable notifications again on this device.",
    };
  }

  const payload = toBackendPushPayload(subscription);
  if (!payload) {
    clearPushActivationForUser(activationUserKey);
    return {
      ok: false,
      permission,
      reason: "Push subscription payload is incomplete.",
    };
  }

  try {
    await apiClient.put("/profile/push/subscription", payload);
    writeVapidFingerprint(vapidResolution.key);
    writePushActivationForUser(activationUserKey, true);

    return {
      ok: true,
      permission,
    };
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} failed to sync existing push subscription`, error);
    return {
      ok: false,
      permission,
      reason: "Failed to sync push subscription with backend.",
    };
  }
};

export const ensurePushSubscriptionForCurrentUser = async (
  options: {
    requestPermission?: boolean;
    forceResubscribe?: boolean;
    activationUserKey?: number | string | null;
  } = {},
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
  const shouldForceResubscribe = options.forceResubscribe === true;
  const activationUserKey = options.activationUserKey;
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

  const vapidResolution = await resolveVapidPublicKey();
  if (!vapidResolution.ok) {
    clearVapidFingerprint();
    return {
      ok: false,
      permission,
      reason: vapidResolution.reason,
    };
  }

  try {
    let subscription = await registration.pushManager.getSubscription();
    let staleEndpoint: string | null = null;

    const clearCurrentSubscription = async (
      current: PushSubscription,
      options?: { removeBackendEndpoint?: boolean },
    ) => {
      const endpoint = current.endpoint?.trim() || "";
      if (options?.removeBackendEndpoint && endpoint) {
        staleEndpoint = endpoint;
      }

      try {
        await current.unsubscribe();
      } catch {
        // Ignore unsubscribe errors and continue recovery flow.
      }
    };

    if (subscription && shouldForceResubscribe) {
      await clearCurrentSubscription(subscription, {
        removeBackendEndpoint: true,
      });
      subscription = null;
    }

    const isExpired =
      subscription &&
      typeof subscription.expirationTime === "number" &&
      subscription.expirationTime <= Date.now();
    if (subscription && isExpired) {
      await clearCurrentSubscription(subscription, {
        removeBackendEndpoint: true,
      });
      subscription = null;
    }

    if (subscription && !toBackendPushPayload(subscription)) {
      await clearCurrentSubscription(subscription, {
        removeBackendEndpoint: true,
      });
      subscription = null;
    }

    const knownFingerprint = readVapidFingerprint();
    if (
      subscription &&
      knownFingerprint &&
      knownFingerprint !== vapidResolution.key
    ) {
      await clearCurrentSubscription(subscription, {
        removeBackendEndpoint: true,
      });
      subscription = null;
    }

    if (subscription) {
      const currentServerKey = readApplicationServerKey(subscription);
      if (
        !currentServerKey ||
        !areEqualBytes(currentServerKey, vapidResolution.keyBytes)
      ) {
        await clearCurrentSubscription(subscription, {
          removeBackendEndpoint: true,
        });
        subscription = null;
      }
    }

    if (!subscription) {
      const applicationServerKey = new Uint8Array(
        vapidResolution.keyBytes.length,
      );
      applicationServerKey.set(vapidResolution.keyBytes);

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
      });
    }

    if (staleEndpoint && staleEndpoint !== subscription.endpoint.trim()) {
      await apiClient
        .delete("/profile/push/subscription", {
          data: {
            endpoint: staleEndpoint,
          },
        })
        .catch(() => undefined);
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
    writeVapidFingerprint(vapidResolution.key);
    writePushActivationForUser(activationUserKey, true);

    return {
      ok: true,
      permission,
    };
  } catch (error) {
    console.warn(`${DEBUG_PREFIX} failed to subscribe and sync push`, error);

    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "NotAllowedError"
    ) {
      return {
        ok: false,
        permission,
        reason: "Push permission was denied by the browser.",
      };
    }

    if (
      typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "InvalidStateError"
    ) {
      return {
        ok: false,
        permission,
        reason:
          "Push service worker state is invalid. Please refresh and try again.",
      };
    }

    return {
      ok: false,
      permission,
      reason: "Failed to subscribe for push notifications.",
    };
  }
};
