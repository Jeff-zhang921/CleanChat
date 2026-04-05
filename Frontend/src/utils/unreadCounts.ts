export type ConversationUnreadCounts = Record<string, number>;

const STORAGE_KEY = "cleanchat:conversation-unread-counts";
const MAX_UNREAD = 999;
export const UNREAD_COUNTS_UPDATED_EVENT = "cleanchat:unread-counts-updated";

const sanitizeCount = (value: unknown) => {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 0) {
    return 0;
  }
  return Math.min(MAX_UNREAD, Math.floor(count));
};

export const normalizeUnreadCounts = (
  value: unknown,
): ConversationUnreadCounts => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const next: ConversationUnreadCounts = {};
  for (const [rawKey, rawCount] of Object.entries(value)) {
    const key = rawKey.trim();
    const count = sanitizeCount(rawCount);
    if (!key || count <= 0) {
      continue;
    }
    next[key] = count;
  }
  return next;
};

export const getThreadUnreadKey = (threadId: number) => `direct-${threadId}`;
export const getGroupUnreadKey = (groupId: string) => `group-${groupId}`;

export const readUnreadCounts = (): ConversationUnreadCounts => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as unknown;
    return normalizeUnreadCounts(parsed);
  } catch {
    return {};
  }
};

export const persistUnreadCounts = (counts: ConversationUnreadCounts) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeUnreadCounts(counts);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Storage failures should not block conversation rendering.
  }

  try {
    window.dispatchEvent(
      new CustomEvent<ConversationUnreadCounts>(UNREAD_COUNTS_UPDATED_EVENT, {
        detail: normalized,
      }),
    );
  } catch {
    // Ignore event dispatch failures in restricted environments.
  }
};

export const incrementUnreadCount = (
  counts: ConversationUnreadCounts,
  key: string,
  amount = 1,
): ConversationUnreadCounts => {
  if (!key.trim()) {
    return counts;
  }

  const base = sanitizeCount(counts[key]);
  const step = Math.max(1, Math.floor(amount));
  return {
    ...counts,
    [key]: Math.min(MAX_UNREAD, base + step),
  };
};

export const clearUnreadCount = (
  counts: ConversationUnreadCounts,
  key: string,
): ConversationUnreadCounts => {
  if (!(key in counts)) {
    return counts;
  }

  const { [key]: _removed, ...rest } = counts;
  return rest;
};

export const clearThreadUnread = (
  threadId: number,
): ConversationUnreadCounts => {
  const current = readUnreadCounts();
  const next = clearUnreadCount(current, getThreadUnreadKey(threadId));
  persistUnreadCounts(next);
  return next;
};

export const clearGroupUnread = (groupId: string): ConversationUnreadCounts => {
  const current = readUnreadCounts();
  const next = clearUnreadCount(current, getGroupUnreadKey(groupId));
  persistUnreadCounts(next);
  return next;
};
