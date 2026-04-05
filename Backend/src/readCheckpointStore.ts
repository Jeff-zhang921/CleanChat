const directReadCheckpoints = new Map<number, Map<number, number>>();
const groupReadCheckpoints = new Map<number, Map<string, number>>();

export type ReadCheckpointStoreSnapshot = {
  directByUser: Record<string, Record<string, number>>;
  groupsByUser: Record<string, Record<string, number>>;
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

let onReadCheckpointStoreStateChange: (() => void) | null = null;

const notifyReadCheckpointStoreStateChanged = () => {
  onReadCheckpointStoreStateChange?.();
};

export const setReadCheckpointStoreStateChangeListener = (
  listener: (() => void) | null,
) => {
  onReadCheckpointStoreStateChange = listener;
};

const getOrCreateDirectReadCheckpoints = (userId: number) => {
  const existing = directReadCheckpoints.get(userId);
  if (existing) {
    return existing;
  }

  const created = new Map<number, number>();
  directReadCheckpoints.set(userId, created);
  return created;
};

const getOrCreateGroupReadCheckpoints = (userId: number) => {
  const existing = groupReadCheckpoints.get(userId);
  if (existing) {
    return existing;
  }

  const created = new Map<string, number>();
  groupReadCheckpoints.set(userId, created);
  return created;
};

const cleanupDirectReadCheckpointIfEmpty = (
  userId: number,
  checkpoints: Map<number, number>,
) => {
  if (checkpoints.size === 0) {
    directReadCheckpoints.delete(userId);
  }
};

const cleanupGroupReadCheckpointIfEmpty = (
  userId: number,
  checkpoints: Map<string, number>,
) => {
  if (checkpoints.size === 0) {
    groupReadCheckpoints.delete(userId);
  }
};

export const getDirectReadCheckpoint = (userId: number, threadId: number) =>
  directReadCheckpoints.get(userId)?.get(threadId);

export const getGroupReadCheckpoint = (userId: number, groupId: string) =>
  groupReadCheckpoints.get(userId)?.get(groupId);

export const syncDirectReadCheckpoint = (
  userId: number,
  threadId: number,
  messageId: number,
) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return 0;
  }
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return 0;
  }

  const checkpoints = getOrCreateDirectReadCheckpoints(userId);
  const current = checkpoints.get(threadId) ?? 0;
  const next = Math.max(current, toPositiveInt(messageId) ?? 0);

  if (next <= 0) {
    return 0;
  }

  if (current !== next) {
    checkpoints.set(threadId, next);
    notifyReadCheckpointStoreStateChanged();
  }

  return next;
};

export const syncGroupReadCheckpoint = (
  userId: number,
  groupId: string,
  messageId: number,
) => {
  if (!Number.isInteger(userId) || userId <= 0) {
    return 0;
  }

  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return 0;
  }

  const checkpoints = getOrCreateGroupReadCheckpoints(userId);
  const current = checkpoints.get(normalizedGroupId) ?? 0;
  const next = Math.max(current, toPositiveInt(messageId) ?? 0);

  if (next <= 0) {
    return 0;
  }

  if (current !== next) {
    checkpoints.set(normalizedGroupId, next);
    notifyReadCheckpointStoreStateChanged();
  }

  return next;
};

export const ensureDirectReadCheckpoint = (
  userId: number,
  threadId: number,
  fallbackMessageId: number,
) => {
  const existing = getDirectReadCheckpoint(userId, threadId);
  if (typeof existing === "number") {
    return existing;
  }

  const candidate = toPositiveInt(fallbackMessageId) ?? 0;
  if (candidate <= 0) {
    return 0;
  }

  const checkpoints = getOrCreateDirectReadCheckpoints(userId);
  checkpoints.set(threadId, candidate);
  notifyReadCheckpointStoreStateChanged();
  return candidate;
};

export const ensureGroupReadCheckpoint = (
  userId: number,
  groupId: string,
  fallbackMessageId: number,
) => {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return 0;
  }

  const existing = getGroupReadCheckpoint(userId, normalizedGroupId);
  if (typeof existing === "number") {
    return existing;
  }

  const candidate = toPositiveInt(fallbackMessageId) ?? 0;
  if (candidate <= 0) {
    return 0;
  }

  const checkpoints = getOrCreateGroupReadCheckpoints(userId);
  checkpoints.set(normalizedGroupId, candidate);
  notifyReadCheckpointStoreStateChanged();
  return candidate;
};

export const pruneDirectReadCheckpointsForUser = (
  userId: number,
  activeThreadIds: Set<number>,
) => {
  const checkpoints = directReadCheckpoints.get(userId);
  if (!checkpoints) {
    return false;
  }

  let didMutate = false;
  [...checkpoints.keys()].forEach((trackedThreadId) => {
    if (!activeThreadIds.has(trackedThreadId)) {
      checkpoints.delete(trackedThreadId);
      didMutate = true;
    }
  });

  cleanupDirectReadCheckpointIfEmpty(userId, checkpoints);
  if (didMutate) {
    notifyReadCheckpointStoreStateChanged();
  }

  return didMutate;
};

export const pruneGroupReadCheckpointsForUser = (
  userId: number,
  activeGroupIds: Set<string>,
) => {
  const checkpoints = groupReadCheckpoints.get(userId);
  if (!checkpoints) {
    return false;
  }

  let didMutate = false;
  [...checkpoints.keys()].forEach((trackedGroupId) => {
    if (!activeGroupIds.has(trackedGroupId)) {
      checkpoints.delete(trackedGroupId);
      didMutate = true;
    }
  });

  cleanupGroupReadCheckpointIfEmpty(userId, checkpoints);
  if (didMutate) {
    notifyReadCheckpointStoreStateChanged();
  }

  return didMutate;
};

export const clearDirectReadCheckpointForAllUsers = (threadId: number) => {
  if (!Number.isInteger(threadId) || threadId <= 0) {
    return;
  }

  let didMutate = false;
  directReadCheckpoints.forEach((checkpoints, userId) => {
    if (checkpoints.delete(threadId)) {
      didMutate = true;
    }
    cleanupDirectReadCheckpointIfEmpty(userId, checkpoints);
  });

  if (didMutate) {
    notifyReadCheckpointStoreStateChanged();
  }
};

export const clearGroupReadCheckpointForAllUsers = (groupId: string) => {
  const normalizedGroupId = groupId.trim();
  if (!normalizedGroupId) {
    return;
  }

  let didMutate = false;
  groupReadCheckpoints.forEach((checkpoints, userId) => {
    if (checkpoints.delete(normalizedGroupId)) {
      didMutate = true;
    }
    cleanupGroupReadCheckpointIfEmpty(userId, checkpoints);
  });

  if (didMutate) {
    notifyReadCheckpointStoreStateChanged();
  }
};

export const snapshotReadCheckpointStore = (): ReadCheckpointStoreSnapshot => {
  const directByUser: Record<string, Record<string, number>> = {};
  [...directReadCheckpoints.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([userId, checkpoints]) => {
      const byThreadId: Record<string, number> = {};
      [...checkpoints.entries()]
        .sort(([a], [b]) => a - b)
        .forEach(([threadId, messageId]) => {
          byThreadId[String(threadId)] = messageId;
        });

      if (Object.keys(byThreadId).length > 0) {
        directByUser[String(userId)] = byThreadId;
      }
    });

  const groupsByUser: Record<string, Record<string, number>> = {};
  [...groupReadCheckpoints.entries()]
    .sort(([a], [b]) => a - b)
    .forEach(([userId, checkpoints]) => {
      const byGroupId: Record<string, number> = {};
      [...checkpoints.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([groupId, messageId]) => {
          byGroupId[groupId] = messageId;
        });

      if (Object.keys(byGroupId).length > 0) {
        groupsByUser[String(userId)] = byGroupId;
      }
    });

  return {
    directByUser,
    groupsByUser,
  };
};

export const hydrateReadCheckpointStore = (snapshot: unknown) => {
  if (!isRecord(snapshot)) {
    return;
  }

  directReadCheckpoints.clear();
  groupReadCheckpoints.clear();

  const rawDirectByUser = isRecord(snapshot.directByUser)
    ? snapshot.directByUser
    : {};
  Object.entries(rawDirectByUser).forEach(([userIdKey, value]) => {
    const userId = toPositiveInt(userIdKey);
    if (!userId || !isRecord(value)) {
      return;
    }

    const byThreadId = new Map<number, number>();
    Object.entries(value).forEach(([threadIdKey, messageId]) => {
      const threadId = toPositiveInt(threadIdKey);
      const normalizedMessageId = toPositiveInt(messageId);
      if (!threadId || !normalizedMessageId) {
        return;
      }

      byThreadId.set(threadId, normalizedMessageId);
    });

    if (byThreadId.size > 0) {
      directReadCheckpoints.set(userId, byThreadId);
    }
  });

  const rawGroupsByUser = isRecord(snapshot.groupsByUser)
    ? snapshot.groupsByUser
    : {};
  Object.entries(rawGroupsByUser).forEach(([userIdKey, value]) => {
    const userId = toPositiveInt(userIdKey);
    if (!userId || !isRecord(value)) {
      return;
    }

    const byGroupId = new Map<string, number>();
    Object.entries(value).forEach(([groupIdKey, messageId]) => {
      const groupId = groupIdKey.trim();
      const normalizedMessageId = toPositiveInt(messageId);
      if (!groupId || !normalizedMessageId) {
        return;
      }

      byGroupId.set(groupId, normalizedMessageId);
    });

    if (byGroupId.size > 0) {
      groupReadCheckpoints.set(userId, byGroupId);
    }
  });
};
