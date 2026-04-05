type DraftTarget =
  | { chatType: "direct"; threadId: number }
  | { chatType: "group"; groupId: string };

const DIRECT_DRAFT_PREFIX = "draft_";
const GROUP_DRAFT_PREFIX = "draft_group_";
const MAX_DRAFT_LENGTH = 4000;

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

const normalizeDraft = (value: unknown): string => {
  if (typeof value !== "string") {
    return "";
  }

  return value.slice(0, MAX_DRAFT_LENGTH);
};

export const getDirectDraftKey = (threadId: number) => {
  const normalizedThreadId = normalizePositiveInt(threadId);
  if (!normalizedThreadId) {
    return null;
  }

  return `${DIRECT_DRAFT_PREFIX}${normalizedThreadId}`;
};

export const getGroupDraftKey = (groupId: string) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return null;
  }

  return `${GROUP_DRAFT_PREFIX}${encodeURIComponent(normalizedGroupId)}`;
};

export const resolveDraftStorageKey = (target: DraftTarget): string | null => {
  if (target.chatType === "direct") {
    return getDirectDraftKey(target.threadId);
  }

  return getGroupDraftKey(target.groupId);
};

export const readDraftForTarget = (target: DraftTarget): string => {
  if (typeof window === "undefined") {
    return "";
  }

  const key = resolveDraftStorageKey(target);
  if (!key) {
    return "";
  }

  try {
    const raw = window.localStorage.getItem(key);
    return normalizeDraft(raw);
  } catch {
    return "";
  }
};

export const writeDraftForTarget = (target: DraftTarget, value: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const key = resolveDraftStorageKey(target);
  if (!key) {
    return;
  }

  const normalized = normalizeDraft(value);
  try {
    if (normalized.length > 0) {
      window.localStorage.setItem(key, normalized);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage failures so chat remains usable.
  }
};

export const clearDraftForTarget = (target: DraftTarget) => {
  writeDraftForTarget(target, "");
};
