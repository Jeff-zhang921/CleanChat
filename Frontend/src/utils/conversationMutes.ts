import {
  getGroupUnreadKey,
  getThreadUnreadKey,
  type ConversationUnreadCounts,
} from "./unreadCounts";

export type ConversationMuteMap = Record<string, true>;

const STORAGE_KEY = "cleanchat:conversation-mutes";
export const CONVERSATION_MUTES_UPDATED_EVENT =
  "cleanchat:conversation-mutes-updated";

const normalizeMuteKey = (value: unknown) => {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
};

const isTruthyMuteValue = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";

export const normalizeConversationMutes = (
  value: unknown,
): ConversationMuteMap => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const next: ConversationMuteMap = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = normalizeMuteKey(rawKey);
    if (!key || !isTruthyMuteValue(rawValue)) {
      continue;
    }
    next[key] = true;
  }

  return next;
};

export const getThreadMuteKey = (threadId: number) =>
  getThreadUnreadKey(threadId);

export const getGroupMuteKey = (groupId: string) => getGroupUnreadKey(groupId);

export const readConversationMutes = (): ConversationMuteMap => {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;
    return normalizeConversationMutes(parsed);
  } catch {
    return {};
  }
};

export const persistConversationMutes = (mutes: ConversationMuteMap) => {
  if (typeof window === "undefined") {
    return;
  }

  const normalized = normalizeConversationMutes(mutes);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore localStorage write failures.
  }

  try {
    window.dispatchEvent(
      new CustomEvent<ConversationMuteMap>(CONVERSATION_MUTES_UPDATED_EVENT, {
        detail: normalized,
      }),
    );
  } catch {
    // Ignore event failures in restricted runtimes.
  }
};

export const setConversationMuted = (
  current: ConversationMuteMap,
  key: string,
  muted: boolean,
): ConversationMuteMap => {
  const normalizedKey = normalizeMuteKey(key);
  if (!normalizedKey) {
    return current;
  }

  if (muted) {
    return {
      ...current,
      [normalizedKey]: true,
    };
  }

  if (!(normalizedKey in current)) {
    return current;
  }

  const { [normalizedKey]: _removed, ...rest } = current;
  return rest;
};

export const replaceConversationMutes = (
  keys: string[],
): ConversationMuteMap => {
  const next: ConversationMuteMap = {};
  keys.forEach((rawKey) => {
    const key = normalizeMuteKey(rawKey);
    if (!key) {
      return;
    }
    next[key] = true;
  });
  return next;
};

export const isConversationMuted = (
  mutes: ConversationMuteMap,
  key: string,
) => {
  const normalizedKey = normalizeMuteKey(key);
  if (!normalizedKey) {
    return false;
  }

  return Boolean(mutes[normalizedKey]);
};

export const sumUnreadCountsExcludingMuted = (
  counts: ConversationUnreadCounts,
  mutes: ConversationMuteMap,
) =>
  Object.entries(counts).reduce((sum, [key, count]) => {
    if (isConversationMuted(mutes, key)) {
      return sum;
    }
    return sum + count;
  }, 0);
