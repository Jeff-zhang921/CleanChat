import { PrismaClient } from "@prisma/client";

export type CleanIdTrustBand = "clear" | "steady" | "fragile" | "blurred";

export type CleanIdTrustSnapshot = {
  score: number;
  band: CleanIdTrustBand;
  title: string;
  summary: string;
  detail: string;
  metrics: {
    accountAgeDays: number;
    directThreads: number;
    sentMessages: number;
    sustainedThreads: number;
    recentMessages: number;
    moderationPenalties: number;
  };
};

type MutableTrustStats = {
  email: string;
  accountAgeDays: number;
  directThreads: number;
  sentMessages: number;
  sustainedThreads: number;
  recentMessages: number;
  moderationPenalties: number;
  peerIds: Set<number>;
  totalThreadMessages: number;
};

type TrustSignalMetrics = Omit<MutableTrustStats, "email" | "peerIds" | "totalThreadMessages">;

const DAY_MS = 24 * 60 * 60 * 1000;
const MANUAL_MAX_TRUST_EMAILS = new Set(["zjingxiang527@gmail.com"]);

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

const roundMetric = (value: number) => Math.max(0, Math.round(value));

const pickBand = (score: number): CleanIdTrustBand => {
  if (score >= 82) return "clear";
  if (score >= 64) return "steady";
  if (score >= 42) return "fragile";
  return "blurred";
};

const pickCopy = (
  band: CleanIdTrustBand,
  stats: TrustSignalMetrics
): Pick<CleanIdTrustSnapshot, "title" | "summary" | "detail"> => {
  const needsDepth = stats.sustainedThreads < 2;
  const needsSpread = stats.directThreads < 2;
  const needsCadence = stats.recentMessages < 5;
  const needsAge = stats.accountAgeDays < 14;

  if (band === "clear") {
    return {
      title: "Clear signal",
      summary: "This CleanID reads crisp, settled, and dependable.",
      detail: "Sustained conversations across multiple threads keep your identity texture sharp.",
    };
  }

  if (band === "steady") {
    return {
      title: "Steady signal",
      summary: "This CleanID feels stable and socially grounded.",
      detail: "A mix of active threads and consistent replies is keeping the signal clean.",
    };
  }

  if (band === "fragile") {
    const nextStep = needsDepth
      ? "more depth"
      : needsSpread
        ? "more stable contacts"
        : needsCadence
          ? "more recent conversation"
          : "more time";
    return {
      title: "Forming signal",
      summary: "The identity is readable, but it still feels soft around the edges.",
      detail: `The next lift comes from ${nextStep}, not from chasing volume.`,
    };
  }

  const weakestLink = needsAge
    ? "time"
    : needsDepth
      ? "deeper conversations"
      : needsSpread
        ? "stable contacts"
        : "steady participation";

  return {
    title: "Blurred signal",
    summary: "There is not enough healthy conversation history for this ID to feel settled yet.",
    detail: `Right now the signal is held back by ${weakestLink}. Future report and block events will also affect this reading.`,
  };
};

export const fallbackCleanIdTrustSnapshot: CleanIdTrustSnapshot = {
  score: 0,
  band: "blurred",
  title: "Blurred signal",
  summary: "This CleanID has not built enough communication history yet.",
  detail: "As healthier conversations accumulate, the identity texture becomes clearer.",
  metrics: {
    accountAgeDays: 0,
    directThreads: 0,
    sentMessages: 0,
    sustainedThreads: 0,
    recentMessages: 0,
    moderationPenalties: 0,
  },
};

const buildManualMaxTrustSnapshot = (
  stats: TrustSignalMetrics
): CleanIdTrustSnapshot => ({
  score: 100,
  band: "clear",
  title: "Pristine signal",
  summary: "This CleanID is manually pinned to the strongest trust state.",
  detail: "The identity surface stays crystal clear across profile, search, and conversation views.",
  metrics: {
    accountAgeDays: stats.accountAgeDays,
    directThreads: stats.directThreads,
    sentMessages: stats.sentMessages,
    sustainedThreads: stats.sustainedThreads,
    recentMessages: stats.recentMessages,
    moderationPenalties: stats.moderationPenalties,
  },
});

export async function buildCleanIdTrustSnapshots(
  prisma: PrismaClient,
  userIds: number[]
): Promise<Map<number, CleanIdTrustSnapshot>> {
  const uniqueUserIds = [...new Set(userIds.filter((value) => Number.isInteger(value) && value > 0))];
  if (uniqueUserIds.length === 0) {
    return new Map<number, CleanIdTrustSnapshot>();
  }

  const [users, totalMessageCounts, recentMessageCounts, threads] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, email: true, createdAt: true },
    }),
    prisma.chatMessage.groupBy({
      by: ["senderId"],
      where: { senderId: { in: uniqueUserIds } },
      _count: { _all: true },
    }),
    prisma.chatMessage.groupBy({
      by: ["senderId"],
      where: {
        senderId: { in: uniqueUserIds },
        createdAt: {
          gte: new Date(Date.now() - 30 * DAY_MS),
        },
      },
      _count: { _all: true },
    }),
    prisma.chatThread.findMany({
      where: {
        OR: [{ AID: { in: uniqueUserIds } }, { BID: { in: uniqueUserIds } }],
      },
      select: { id: true, AID: true, BID: true },
    }),
  ]);

  const threadIds = threads.map((thread) => thread.id);
  const threadMessageCounts =
    threadIds.length > 0
      ? await prisma.chatMessage.groupBy({
          by: ["threadId"],
          where: { threadId: { in: threadIds } },
          _count: { _all: true },
        })
      : [];

  const statsByUser = new Map<number, MutableTrustStats>();
  const now = Date.now();

  users.forEach((user) => {
    statsByUser.set(user.id, {
      email: user.email.trim().toLowerCase(),
      accountAgeDays: Math.max(0, Math.floor((now - user.createdAt.getTime()) / DAY_MS)),
      directThreads: 0,
      sentMessages: 0,
      sustainedThreads: 0,
      recentMessages: 0,
      moderationPenalties: 0,
      peerIds: new Set<number>(),
      totalThreadMessages: 0,
    });
  });

  totalMessageCounts.forEach((entry) => {
    const target = statsByUser.get(entry.senderId);
    if (target) {
      target.sentMessages = entry._count._all;
    }
  });

  recentMessageCounts.forEach((entry) => {
    const target = statsByUser.get(entry.senderId);
    if (target) {
      target.recentMessages = entry._count._all;
    }
  });

  const messageCountByThreadId = new Map(threadMessageCounts.map((entry) => [entry.threadId, entry._count._all]));

  threads.forEach((thread) => {
    const totalMessages = messageCountByThreadId.get(thread.id) ?? 0;
    const participants = [
      [thread.AID, thread.BID],
      [thread.BID, thread.AID],
    ] as const;

    participants.forEach(([userId, peerId]) => {
      const target = statsByUser.get(userId);
      if (!target) return;
      target.directThreads += 1;
      target.peerIds.add(peerId);
      target.totalThreadMessages += totalMessages;
      if (totalMessages >= 8) {
        target.sustainedThreads += 1;
      }
    });
  });

  const snapshots = new Map<number, CleanIdTrustSnapshot>();

  statsByUser.forEach((stats, userId) => {
    if (MANUAL_MAX_TRUST_EMAILS.has(stats.email)) {
      snapshots.set(
        userId,
        buildManualMaxTrustSnapshot({
          accountAgeDays: stats.accountAgeDays,
          directThreads: stats.directThreads,
          sentMessages: stats.sentMessages,
          sustainedThreads: stats.sustainedThreads,
          recentMessages: stats.recentMessages,
          moderationPenalties: stats.moderationPenalties,
        })
      );
      return;
    }

    const averageThreadDepth =
      stats.directThreads > 0 ? stats.totalThreadMessages / stats.directThreads : 0;
    const score = roundMetric(
      8 +
        clamp01(stats.accountAgeDays / 180) * 20 +
        clamp01(stats.directThreads / 8) * 16 +
        clamp01(averageThreadDepth / 12) * 18 +
        clamp01(stats.recentMessages / 24) * 14 +
        clamp01(stats.sentMessages / 120) * 10 +
        clamp01(stats.peerIds.size / 8) * 14
    );
    const band = pickBand(score);
    const copy = pickCopy(band, {
      accountAgeDays: stats.accountAgeDays,
      directThreads: stats.directThreads,
      sentMessages: stats.sentMessages,
      sustainedThreads: stats.sustainedThreads,
      recentMessages: stats.recentMessages,
      moderationPenalties: stats.moderationPenalties,
    });

    snapshots.set(userId, {
      score,
      band,
      title: copy.title,
      summary: copy.summary,
      detail: copy.detail,
      metrics: {
        accountAgeDays: stats.accountAgeDays,
        directThreads: stats.directThreads,
        sentMessages: stats.sentMessages,
        sustainedThreads: stats.sustainedThreads,
        recentMessages: stats.recentMessages,
        moderationPenalties: stats.moderationPenalties,
      },
    });
  });

  return snapshots;
}
