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

    const params = new URLSearchParams({
      chatType: "direct",
      threadId: String(threadId),
    });
    return `/chat?${params.toString()}`;
  }

  const groupId = normalizeGroupId(target.groupId);
  if (!groupId) {
    return FALLBACK_ROUTE;
  }

  const params = new URLSearchParams({
    chatType: "group",
    groupId,
  });
  return `/chat?${params.toString()}`;
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
