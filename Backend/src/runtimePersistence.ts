import { Prisma, PrismaClient } from "@prisma/client";
import {
  type GroupStoreSnapshot,
  hydrateGroupStore,
  setGroupStoreStateChangeListener,
  snapshotGroupStore,
} from "./groupStore";
import {
  type MuteStoreSnapshot,
  hydrateMuteStore,
  setMuteStoreStateChangeListener,
  snapshotMuteStore,
} from "./muteStore";
import {
  type ReadCheckpointStoreSnapshot,
  hydrateReadCheckpointStore,
  setReadCheckpointStoreStateChangeListener,
  snapshotReadCheckpointStore,
} from "./readCheckpointStore";

const prisma = new PrismaClient();

const SNAPSHOT_VERSION = 1;
const RUNTIME_STATE_KEY = "chat-runtime-state-v1";

const parsePositiveInt = (value: string | undefined) => {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const RUNTIME_STATE_FLUSH_DEBOUNCE_MS =
  parsePositiveInt(process.env.RUNTIME_STATE_FLUSH_DEBOUNCE_MS) ?? 2000;

type RuntimeStatePayload = {
  version: number;
  capturedAt: string;
  groupStore: GroupStoreSnapshot;
  muteStore: MuteStoreSnapshot;
  readCheckpoints: ReadCheckpointStoreSnapshot;
};

type RuntimePersistenceStatus = {
  enabled: boolean;
  key: string;
  flushDebounceMs: number;
  initializedAt: string | null;
  hydratedAt: string | null;
  persistedAt: string | null;
  pendingFlush: boolean;
  lastError: string | null;
  disabledReason: string | null;
};

const status: RuntimePersistenceStatus = {
  enabled: true,
  key: RUNTIME_STATE_KEY,
  flushDebounceMs: RUNTIME_STATE_FLUSH_DEBOUNCE_MS,
  initializedAt: null,
  hydratedAt: null,
  persistedAt: null,
  pendingFlush: false,
  lastError: null,
  disabledReason: null,
};

let initialized = false;
let initializePromise: Promise<void> | null = null;
let pendingDirty = false;
let flushTimer: NodeJS.Timeout | null = null;
let flushPromise: Promise<void> | null = null;
let shuttingDown = false;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const disablePersistence = (reason: string) => {
  status.enabled = false;
  status.disabledReason = reason;
  status.pendingFlush = false;
  pendingDirty = false;

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  setGroupStoreStateChangeListener(null);
  setMuteStoreStateChangeListener(null);
  setReadCheckpointStoreStateChangeListener(null);
};

const maybeDisableForPrismaError = (error: unknown) => {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === "P2021" || error.code === "P2022")
  ) {
    disablePersistence(
      "RuntimeState table is missing in database. Run Prisma migration to enable runtime persistence.",
    );
    return true;
  }

  return false;
};

const buildSnapshot = (): RuntimeStatePayload => ({
  version: SNAPSHOT_VERSION,
  capturedAt: new Date().toISOString(),
  groupStore: snapshotGroupStore(),
  muteStore: snapshotMuteStore(),
  readCheckpoints: snapshotReadCheckpointStore(),
});

const applySnapshot = (payload: unknown) => {
  if (!isRecord(payload)) {
    return false;
  }

  const version = Number(payload.version);
  if (!Number.isInteger(version) || version !== SNAPSHOT_VERSION) {
    return false;
  }

  hydrateGroupStore(payload.groupStore);
  hydrateMuteStore(payload.muteStore);
  hydrateReadCheckpointStore(payload.readCheckpoints);
  return true;
};

const onStoreStateChanged = () => {
  if (!initialized || !status.enabled) {
    return;
  }

  pendingDirty = true;
  status.pendingFlush = true;

  if (flushTimer) {
    return;
  }

  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushRuntimeState();
  }, RUNTIME_STATE_FLUSH_DEBOUNCE_MS);
  flushTimer.unref?.();
};

const flushRuntimeState = async () => {
  if (!initialized || !status.enabled) {
    return;
  }

  if (flushPromise) {
    await flushPromise;
    return;
  }

  flushPromise = (async () => {
    while (pendingDirty && status.enabled) {
      pendingDirty = false;

      const payload = buildSnapshot();
      try {
        await prisma.runtimeState.upsert({
          where: { key: RUNTIME_STATE_KEY },
          update: { value: payload as Prisma.InputJsonValue },
          create: {
            key: RUNTIME_STATE_KEY,
            value: payload as Prisma.InputJsonValue,
          },
        });
        status.persistedAt = new Date().toISOString();
        status.lastError = null;
      } catch (error) {
        status.lastError = toErrorMessage(error);

        if (maybeDisableForPrismaError(error)) {
          break;
        }

        // Keep dirty=true so a later retry can persist the snapshot.
        pendingDirty = true;
        break;
      }
    }

    status.pendingFlush = pendingDirty;
  })();

  try {
    await flushPromise;
  } finally {
    flushPromise = null;

    if (pendingDirty && status.enabled && !shuttingDown && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        void flushRuntimeState();
      }, RUNTIME_STATE_FLUSH_DEBOUNCE_MS);
      flushTimer.unref?.();
    }
  }
};

export const initializeRuntimeStatePersistence = async () => {
  if (initialized) {
    return;
  }

  if (initializePromise) {
    await initializePromise;
    return;
  }

  initializePromise = (async () => {
    try {
      const persisted = await prisma.runtimeState.findUnique({
        where: { key: RUNTIME_STATE_KEY },
        select: { value: true },
      });

      if (persisted?.value && applySnapshot(persisted.value)) {
        status.hydratedAt = new Date().toISOString();
      }
    } catch (error) {
      status.lastError = toErrorMessage(error);

      if (!maybeDisableForPrismaError(error)) {
        // Keep app alive even if persistence read fails once.
        console.error("Failed to hydrate runtime state snapshot", error);
      }
    }

    if (status.enabled) {
      setGroupStoreStateChangeListener(onStoreStateChanged);
      setMuteStoreStateChangeListener(onStoreStateChanged);
      setReadCheckpointStoreStateChangeListener(onStoreStateChanged);
    }

    initialized = true;
    status.initializedAt = new Date().toISOString();
  })();

  try {
    await initializePromise;
  } finally {
    initializePromise = null;
  }
};

export const flushRuntimeStatePersistence = async () => {
  if (!initialized || !status.enabled) {
    return false;
  }

  pendingDirty = true;
  status.pendingFlush = true;
  await flushRuntimeState();
  return !status.pendingFlush;
};

export const shutdownRuntimeStatePersistence = async () => {
  if (!initialized) {
    return;
  }

  shuttingDown = true;
  setGroupStoreStateChangeListener(null);
  setMuteStoreStateChangeListener(null);
  setReadCheckpointStoreStateChangeListener(null);

  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }

  if (status.enabled && pendingDirty) {
    await flushRuntimeState();
  }
};

export const getRuntimeStatePersistenceStatus = () => ({ ...status });
