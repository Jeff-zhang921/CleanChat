import { beforeEach, describe, expect, it } from "@jest/globals";
import {
  clearDirectReadCheckpointForAllUsers,
  clearGroupReadCheckpointForAllUsers,
  ensureDirectReadCheckpoint,
  ensureGroupReadCheckpoint,
  getDirectReadCheckpoint,
  getGroupReadCheckpoint,
  hydrateReadCheckpointStore,
  pruneDirectReadCheckpointsForUser,
  pruneGroupReadCheckpointsForUser,
  setReadCheckpointStoreStateChangeListener,
  snapshotReadCheckpointStore,
  syncDirectReadCheckpoint,
  syncGroupReadCheckpoint,
} from "../src/readCheckpointStore";

describe("readCheckpointStore", () => {
  beforeEach(() => {
    hydrateReadCheckpointStore({});
    setReadCheckpointStoreStateChangeListener(null);
  });

  it("syncs checkpoints and emits change notifications only on mutation", () => {
    let mutationCount = 0;
    setReadCheckpointStoreStateChangeListener(() => {
      mutationCount += 1;
    });

    expect(syncDirectReadCheckpoint(1, 10, 5)).toBe(5);
    expect(syncDirectReadCheckpoint(1, 10, 3)).toBe(5);
    expect(ensureDirectReadCheckpoint(1, 11, 7)).toBe(7);
    expect(ensureDirectReadCheckpoint(1, 11, 9)).toBe(7);

    expect(syncGroupReadCheckpoint(1, "alpha", 4)).toBe(4);
    expect(syncGroupReadCheckpoint(1, "alpha", 2)).toBe(4);
    expect(ensureGroupReadCheckpoint(1, "alpha", 8)).toBe(4);

    const snapshot = snapshotReadCheckpointStore();
    expect(snapshot.directByUser["1"]["10"]).toBe(5);
    expect(snapshot.directByUser["1"]["11"]).toBe(7);
    expect(snapshot.groupsByUser["1"].alpha).toBe(4);
    expect(getDirectReadCheckpoint(1, 10)).toBe(5);
    expect(getGroupReadCheckpoint(1, "alpha")).toBe(4);
    expect(mutationCount).toBe(3);
  });

  it("hydrates checkpoints and removes stale entries", () => {
    hydrateReadCheckpointStore({
      directByUser: {
        "1": {
          "10": 5,
          "20": 8,
        },
      },
      groupsByUser: {
        "1": {
          alpha: 2,
          beta: 6,
        },
      },
    });

    const prunedDirect = pruneDirectReadCheckpointsForUser(1, new Set([10]));
    const prunedGroups = pruneGroupReadCheckpointsForUser(
      1,
      new Set(["alpha"]),
    );

    expect(prunedDirect).toBe(true);
    expect(prunedGroups).toBe(true);

    clearDirectReadCheckpointForAllUsers(10);
    clearGroupReadCheckpointForAllUsers("alpha");

    const snapshot = snapshotReadCheckpointStore();
    expect(snapshot.directByUser["1"]).toBeUndefined();
    expect(snapshot.groupsByUser["1"]).toBeUndefined();
  });
});
