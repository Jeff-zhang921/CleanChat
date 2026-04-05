/* eslint-disable no-restricted-globals */
import { clientsClaim } from "workbox-core";
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from "workbox-precaching";
import { NavigationRoute, registerRoute } from "workbox-routing";

self.skipWaiting();
clientsClaim();
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

const appShellHandler = createHandlerBoundToURL("/index.html");
registerRoute(
  new NavigationRoute(appShellHandler, {
    denylist: [/^\/api\//, /^\/socket\.io\//],
  })
);

const DEFAULT_TITLE = "CleanChat";
const DEFAULT_BODY = "Open CleanChat to continue the conversation.";
const DEFAULT_ICON = "/icons/icon-192.png";
const DEFAULT_BADGE = "/icons/icon-192.png";
const DEFAULT_URL = "/conversations";
const PUSH_ENTRY_QUERY_KEY = "fromPush";
const PUSH_ENTRY_STAMP_QUERY_KEY = "pushAt";
const DEFAULT_VIBRATION_PATTERN = [200, 100, 200];

const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

const normalizeRelativeUrl = (value) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed, self.location.origin);
    if (parsed.origin !== self.location.origin) {
      return null;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
};

const appendPushEntryQuery = (value) => {
  const normalized = normalizeRelativeUrl(value);
  const fallback = `${DEFAULT_URL}?${PUSH_ENTRY_QUERY_KEY}=1`;
  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = new URL(normalized, self.location.origin);
    if (parsed.origin !== self.location.origin) {
      return fallback;
    }
    if (!parsed.searchParams.has(PUSH_ENTRY_QUERY_KEY)) {
      parsed.searchParams.set(PUSH_ENTRY_QUERY_KEY, "1");
    }
    if (!parsed.searchParams.has(PUSH_ENTRY_STAMP_QUERY_KEY)) {
      parsed.searchParams.set(PUSH_ENTRY_STAMP_QUERY_KEY, String(Date.now()));
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
};

const normalizePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const normalizeString = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const buildUrlFromPayload = (payload) => {
  const explicitUrl = normalizeRelativeUrl(payload.url);
  let candidateUrl = DEFAULT_URL;

  if (explicitUrl) {
    candidateUrl = explicitUrl;
    return appendPushEntryQuery(candidateUrl);
  }

  if (payload.chatType === "group" && payload.groupId) {
    candidateUrl = `/chat/group/${encodeURIComponent(payload.groupId)}`;
    return appendPushEntryQuery(candidateUrl);
  }

  if (payload.threadId) {
    candidateUrl = `/chat/${payload.threadId}`;
    return appendPushEntryQuery(candidateUrl);
  }

  if (payload.groupId) {
    candidateUrl = `/chat/group/${encodeURIComponent(payload.groupId)}`;
    return appendPushEntryQuery(candidateUrl);
  }

  return appendPushEntryQuery(candidateUrl);
};

const parsePushPayload = (event) => {
  let rawPayload = {};

  if (event.data) {
    try {
      rawPayload = event.data.json();
    } catch {
      rawPayload = { body: event.data.text() };
    }
  }

  const payload = isRecord(rawPayload) ? rawPayload : {};
  const notification = isRecord(payload.notification) ? payload.notification : {};
  const data = isRecord(payload.data) ? payload.data : {};
  const target =
    isRecord(data.target)
      ? data.target
      : isRecord(payload.target)
        ? payload.target
        : {};

  const senderName =
    normalizeString(data.senderName) ||
    normalizeString(payload.senderName) ||
    normalizeString(target.senderName) ||
    undefined;

  const summary =
    normalizeString(data.summary) ||
    normalizeString(payload.summary) ||
    normalizeString(target.summary) ||
    undefined;

  const title =
    normalizeString(notification.title) ||
    normalizeString(payload.title) ||
    normalizeString(data.title) ||
    senderName ||
    DEFAULT_TITLE;

  const body =
    normalizeString(notification.body) ||
    normalizeString(payload.body) ||
    normalizeString(data.body) ||
    summary ||
    DEFAULT_BODY;

  const tag =
    normalizeString(payload.tag) ||
    normalizeString(data.tag) ||
    normalizeString(notification.tag) ||
    undefined;

  const chatTypeRaw =
    normalizeString(data.chatType) ||
    normalizeString(payload.chatType) ||
    normalizeString(target.chatType) ||
    undefined;

  const chatType = chatTypeRaw === "group" ? "group" : "direct";
  const threadId = normalizePositiveInt(
    data.threadId ?? payload.threadId ?? target.threadId,
  );
  const groupId = normalizeString(data.groupId ?? payload.groupId ?? target.groupId);

  const url =
    normalizeRelativeUrl(data.url) ||
    normalizeRelativeUrl(payload.url) ||
    normalizeRelativeUrl(target.url) ||
    normalizeRelativeUrl(notification.click_action) ||
    normalizeRelativeUrl(data.click_action) ||
    undefined;

  return {
    title,
    body,
    tag,
    chatType,
    threadId,
    groupId,
    url,
  };
};

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  const targetUrl = buildUrlFromPayload(payload);

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: DEFAULT_ICON,
      badge: DEFAULT_BADGE,
      vibrate: DEFAULT_VIBRATION_PATTERN,
      timestamp: Date.now(),
      tag: payload.tag,
      renotify: Boolean(payload.tag),
      data: {
        url: targetUrl,
        threadId: payload.threadId,
        groupId: payload.groupId,
        chatType: payload.chatType,
      },
    })
  );
});

const resolveNotificationClickUrl = (notificationData) => {
  if (!isRecord(notificationData)) {
    return `${self.location.origin}${DEFAULT_URL}`;
  }

  const payload = {
    chatType: notificationData.chatType === "group" ? "group" : "direct",
    threadId: normalizePositiveInt(notificationData.threadId),
    groupId: normalizeString(notificationData.groupId),
    url: normalizeRelativeUrl(notificationData.url),
  };

  const targetUrl = buildUrlFromPayload(payload);
  return new URL(targetUrl, self.location.origin).toString();
};

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = resolveNotificationClickUrl(event.notification.data);

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      for (const client of windowClients) {
        const parsed = new URL(client.url);
        if (parsed.origin !== self.location.origin) {
          continue;
        }

        await client.focus();
        if (typeof client.navigate === "function") {
          await client.navigate(targetUrl);
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
