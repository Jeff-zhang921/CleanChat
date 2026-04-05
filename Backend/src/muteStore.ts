const directMutedByUser = new Map<number, Set<number>>();
const groupMutedByUser = new Map<number, Set<string>>();

export type MuteStoreSnapshot = {
  directByUser: Record<string, number[]>;
  groupsByUser: Record<string, string[]>;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

let onMuteStoreStateChange: (() => void) | null = null;

const notifyMuteStoreStateChanged = () => {
  onMuteStoreStateChange?.();
};

export const setMuteStoreStateChangeListener = (
  listener: (() => void) | null,
) => {
  onMuteStoreStateChange = listener;
};

const normalizeGroupId = (value: string) => value.trim();

export const snapshotMuteStore = (): MuteStoreSnapshot => {
  const directByUser: Record<string, number[]> = {};
  directMutedByUser.forEach((threadIds, userId) => {
    directByUser[String(userId)] = [...threadIds].sort((a, b) => a - b);
  });

  const groupsByUser: Record<string, string[]> = {};
  groupMutedByUser.forEach((groupIds, userId) => {
    groupsByUser[String(userId)] = [...groupIds].sort((a, b) =>
      a.localeCompare(b),
    );
  });

  return {
    directByUser,
    groupsByUser,
  };
};

export const hydrateMuteStore = (snapshot: unknown) => {
  if (!isRecord(snapshot)) {
    return;
  }

  directMutedByUser.clear();
  groupMutedByUser.clear();

  const rawDirectByUser = isRecord(snapshot.directByUser)
    ? snapshot.directByUser
    : {};
  Object.entries(rawDirectByUser).forEach(([userIdKey, value]) => {
    const userId = toPositiveInt(userIdKey);
    if (!userId || !Array.isArray(value)) {
      return;
    }

    const threadIds = value
      .map((threadId) => toPositiveInt(threadId))
      .filter((threadId): threadId is number => threadId !== null);
    if (threadIds.length === 0) {
      return;
    }

    directMutedByUser.set(userId, new Set(threadIds));
  });

  const rawGroupsByUser = isRecord(snapshot.groupsByUser)
    ? snapshot.groupsByUser
    : {};
  Object.entries(rawGroupsByUser).forEach(([userIdKey, value]) => {
    const userId = toPositiveInt(userIdKey);
    if (!userId || !Array.isArray(value)) {
      return;
    }

    const groupIds = value
      .map((groupId) =>
        typeof groupId === "string" ? normalizeGroupId(groupId) : "",
      )
      .filter(Boolean);
    if (groupIds.length === 0) {
      return;
    }

    groupMutedByUser.set(userId, new Set(groupIds));
  });
};

const getOrCreateDirectSet = (userId: number) => {
  const existing = directMutedByUser.get(userId);
  if (existing) {
    return existing;
  }

  const created = new Set<number>();
  directMutedByUser.set(userId, created);
  return created;
};

const getOrCreateGroupSet = (userId: number) => {
  const existing = groupMutedByUser.get(userId);
  if (existing) {
    return existing;
  }

  const created = new Set<string>();
  groupMutedByUser.set(userId, created);
  return created;
};

const cleanupDirectSetIfEmpty = (userId: number, target: Set<number>) => {
  if (target.size === 0) {
    directMutedByUser.delete(userId);
  }
};

const cleanupGroupSetIfEmpty = (userId: number, target: Set<string>) => {
  if (target.size === 0) {
    groupMutedByUser.delete(userId);
  }
};

export const listMutedThreadIdsForUser = (userId: number) => {
  const mutedThreads = directMutedByUser.get(userId);
  if (!mutedThreads || mutedThreads.size === 0) {
    return [];
  }

  return [...mutedThreads].sort((a, b) => a - b);
};

export const listMutedGroupIdsForUser = (userId: number) => {
  const mutedGroups = groupMutedByUser.get(userId);
  if (!mutedGroups || mutedGroups.size === 0) {
    return [];
  }

  return [...mutedGroups].sort((a, b) => a.localeCompare(b));
};

export const isThreadMutedForUser = (userId: number, threadId: number) => {
  const mutedThreads = directMutedByUser.get(userId);
  return Boolean(mutedThreads?.has(threadId));
};

export const isGroupMutedForUser = (userId: number, groupId: string) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return false;
  }

  const mutedGroups = groupMutedByUser.get(userId);
  return Boolean(mutedGroups?.has(normalizedGroupId));
};

export const setThreadMutedForUser = (
  userId: number,
  threadId: number,
  muted: boolean,
) => {
  if (muted) {
    const mutedThreads = getOrCreateDirectSet(userId);
    if (mutedThreads.has(threadId)) {
      return true;
    }

    mutedThreads.add(threadId);
    notifyMuteStoreStateChanged();
    return true;
  }

  const mutedThreads = directMutedByUser.get(userId);
  if (!mutedThreads) {
    return false;
  }

  const didDelete = mutedThreads.delete(threadId);
  cleanupDirectSetIfEmpty(userId, mutedThreads);
  if (didDelete) {
    notifyMuteStoreStateChanged();
  }
  return false;
};

export const setGroupMutedForUser = (
  userId: number,
  groupId: string,
  muted: boolean,
) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return false;
  }

  if (muted) {
    const mutedGroups = getOrCreateGroupSet(userId);
    if (mutedGroups.has(normalizedGroupId)) {
      return true;
    }

    mutedGroups.add(normalizedGroupId);
    notifyMuteStoreStateChanged();
    return true;
  }

  const mutedGroups = groupMutedByUser.get(userId);
  if (!mutedGroups) {
    return false;
  }

  const didDelete = mutedGroups.delete(normalizedGroupId);
  cleanupGroupSetIfEmpty(userId, mutedGroups);
  if (didDelete) {
    notifyMuteStoreStateChanged();
  }
  return false;
};

export const clearThreadMuteForUser = (userId: number, threadId: number) => {
  const mutedThreads = directMutedByUser.get(userId);
  if (!mutedThreads) {
    return;
  }

  const didDelete = mutedThreads.delete(threadId);
  cleanupDirectSetIfEmpty(userId, mutedThreads);
  if (didDelete) {
    notifyMuteStoreStateChanged();
  }
};

export const clearGroupMuteForUser = (userId: number, groupId: string) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return;
  }

  const mutedGroups = groupMutedByUser.get(userId);
  if (!mutedGroups) {
    return;
  }

  const didDelete = mutedGroups.delete(normalizedGroupId);
  cleanupGroupSetIfEmpty(userId, mutedGroups);
  if (didDelete) {
    notifyMuteStoreStateChanged();
  }
};

export const clearThreadMuteForAllUsers = (threadId: number) => {
  let didMutate = false;
  directMutedByUser.forEach((mutedThreads, userId) => {
    if (mutedThreads.delete(threadId)) {
      didMutate = true;
    }
    cleanupDirectSetIfEmpty(userId, mutedThreads);
  });

  if (didMutate) {
    notifyMuteStoreStateChanged();
  }
};

export const clearGroupMuteForAllUsers = (groupId: string) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return;
  }

  let didMutate = false;
  groupMutedByUser.forEach((mutedGroups, userId) => {
    if (mutedGroups.delete(normalizedGroupId)) {
      didMutate = true;
    }
    cleanupGroupSetIfEmpty(userId, mutedGroups);
  });

  if (didMutate) {
    notifyMuteStoreStateChanged();
  }
};
