const directMutedByUser = new Map<number, Set<number>>();
const groupMutedByUser = new Map<number, Set<string>>();

const normalizeGroupId = (value: string) => value.trim();

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
    mutedThreads.add(threadId);
    return true;
  }

  const mutedThreads = directMutedByUser.get(userId);
  if (!mutedThreads) {
    return false;
  }

  mutedThreads.delete(threadId);
  cleanupDirectSetIfEmpty(userId, mutedThreads);
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
    mutedGroups.add(normalizedGroupId);
    return true;
  }

  const mutedGroups = groupMutedByUser.get(userId);
  if (!mutedGroups) {
    return false;
  }

  mutedGroups.delete(normalizedGroupId);
  cleanupGroupSetIfEmpty(userId, mutedGroups);
  return false;
};

export const clearThreadMuteForUser = (userId: number, threadId: number) => {
  const mutedThreads = directMutedByUser.get(userId);
  if (!mutedThreads) {
    return;
  }

  mutedThreads.delete(threadId);
  cleanupDirectSetIfEmpty(userId, mutedThreads);
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

  mutedGroups.delete(normalizedGroupId);
  cleanupGroupSetIfEmpty(userId, mutedGroups);
};

export const clearThreadMuteForAllUsers = (threadId: number) => {
  directMutedByUser.forEach((mutedThreads, userId) => {
    mutedThreads.delete(threadId);
    cleanupDirectSetIfEmpty(userId, mutedThreads);
  });
};

export const clearGroupMuteForAllUsers = (groupId: string) => {
  const normalizedGroupId = normalizeGroupId(groupId);
  if (!normalizedGroupId) {
    return;
  }

  groupMutedByUser.forEach((mutedGroups, userId) => {
    mutedGroups.delete(normalizedGroupId);
    cleanupGroupSetIfEmpty(userId, mutedGroups);
  });
};
