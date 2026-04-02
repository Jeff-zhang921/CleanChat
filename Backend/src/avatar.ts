import { Avatar } from "@prisma/client";
import type { CleanIdTrustSnapshot } from "./cleanIdTrust";

export type AvatarTier = "starter" | "active" | "trusted";

export type AvatarTierAccess = {
  unlocked: boolean;
  title: string;
  hint: string;
};

export type AvatarAccess = {
  currentTier: AvatarTier;
  availableKeys: Avatar[];
  tiers: Record<AvatarTier, AvatarTierAccess>;
};

const ACTIVE_UNLOCK_RECENT_MESSAGES = 8;
const ACTIVE_UNLOCK_TOTAL_MESSAGES = 12;
const TRUSTED_UNLOCK_SCORE = 64;

const STARTER_AVATARS = [
  Avatar.AVATAR_LEO,
  Avatar.AVATAR_SOPHIE,
  Avatar.AVATAR_MAX,
  Avatar.AVATAR_BELLA,
  Avatar.AVATAR_CHARLIE,
  Avatar.AVATAR_ALMA,
  Avatar.AVATAR_THEO,
  Avatar.AVATAR_IONA,
  Avatar.AVATAR_LARK,
  Avatar.AVATAR_MINA,
  Avatar.AVATAR_CEDAR,
  Avatar.AVATAR_ORIEL,
  Avatar.AVATAR_LINA,
  Avatar.AVATAR_REMY,
  Avatar.AVATAR_NOOR,
] as const;

const ACTIVE_AVATARS = [
  Avatar.AVATAR_AVERY,
  Avatar.AVATAR_RILEY,
  Avatar.AVATAR_JORDAN,
  Avatar.AVATAR_SKYLER,
  Avatar.AVATAR_MORGAN,
  Avatar.AVATAR_MIRO,
  Avatar.AVATAR_ELIO,
  Avatar.AVATAR_TAVI,
  Avatar.AVATAR_BRIAR,
  Avatar.AVATAR_SENA,
] as const;

const TRUSTED_AVATARS = [
  Avatar.AVATAR_AIRI,
  Avatar.AVATAR_REN,
  Avatar.AVATAR_NAMI,
  Avatar.AVATAR_KIKO,
  Avatar.AVATAR_YUTA,
  Avatar.AVATAR_HINA,
  Avatar.AVATAR_AOBA,
  Avatar.AVATAR_MEI,
  Avatar.AVATAR_SORA,
  Avatar.AVATAR_KAEDE,
  Avatar.AVATAR_YORI,
  Avatar.AVATAR_MIO,
  Avatar.AVATAR_AKARI,
  Avatar.AVATAR_RIN,
  Avatar.AVATAR_HARU,
] as const;

const AVATAR_TIER_MAP: Record<Avatar, AvatarTier> = {
  [Avatar.AVATAR_LEO]: "starter",
  [Avatar.AVATAR_SOPHIE]: "starter",
  [Avatar.AVATAR_MAX]: "starter",
  [Avatar.AVATAR_BELLA]: "starter",
  [Avatar.AVATAR_CHARLIE]: "starter",
  [Avatar.AVATAR_ALMA]: "starter",
  [Avatar.AVATAR_THEO]: "starter",
  [Avatar.AVATAR_IONA]: "starter",
  [Avatar.AVATAR_LARK]: "starter",
  [Avatar.AVATAR_MINA]: "starter",
  [Avatar.AVATAR_CEDAR]: "starter",
  [Avatar.AVATAR_ORIEL]: "starter",
  [Avatar.AVATAR_LINA]: "starter",
  [Avatar.AVATAR_REMY]: "starter",
  [Avatar.AVATAR_NOOR]: "starter",
  [Avatar.AVATAR_AVERY]: "active",
  [Avatar.AVATAR_RILEY]: "active",
  [Avatar.AVATAR_JORDAN]: "active",
  [Avatar.AVATAR_SKYLER]: "active",
  [Avatar.AVATAR_MORGAN]: "active",
  [Avatar.AVATAR_MIRO]: "active",
  [Avatar.AVATAR_ELIO]: "active",
  [Avatar.AVATAR_TAVI]: "active",
  [Avatar.AVATAR_BRIAR]: "active",
  [Avatar.AVATAR_SENA]: "active",
  [Avatar.AVATAR_AIRI]: "trusted",
  [Avatar.AVATAR_REN]: "trusted",
  [Avatar.AVATAR_NAMI]: "trusted",
  [Avatar.AVATAR_KIKO]: "trusted",
  [Avatar.AVATAR_YUTA]: "trusted",
  [Avatar.AVATAR_HINA]: "trusted",
  [Avatar.AVATAR_AOBA]: "trusted",
  [Avatar.AVATAR_MEI]: "trusted",
  [Avatar.AVATAR_SORA]: "trusted",
  [Avatar.AVATAR_KAEDE]: "trusted",
  [Avatar.AVATAR_YORI]: "trusted",
  [Avatar.AVATAR_MIO]: "trusted",
  [Avatar.AVATAR_AKARI]: "trusted",
  [Avatar.AVATAR_RIN]: "trusted",
  [Avatar.AVATAR_HARU]: "trusted",
};

export const DEFAULT_AVATAR = Avatar.AVATAR_LEO;

const ACTIVE_UNLOCK_HINT =
  "Classical Marble Portraits unlock after 24 hours of healthy activity or a steady reply rhythm.";
const TRUSTED_UNLOCK_HINT =
  "Ethereal Light Forms unlock once your Trust Score reaches the clear enough band.";

const getAvatarTierAccess = (
  tier: AvatarTier,
  trust: CleanIdTrustSnapshot
): AvatarTierAccess => {
  if (tier === "starter") {
    return {
      unlocked: true,
      title: "Starter",
      hint: "Minimalist Characters are open from day one so every CleanID starts with a calm human mark.",
    };
  }

  if (tier === "active") {
    const unlocked =
      trust.metrics.accountAgeDays >= 1 ||
      trust.metrics.recentMessages >= ACTIVE_UNLOCK_RECENT_MESSAGES ||
      trust.metrics.sentMessages >= ACTIVE_UNLOCK_TOTAL_MESSAGES;
    return {
      unlocked,
      title: "Active",
      hint: unlocked
        ? "Classical Marble Portraits are open. Your cadence already reads settled."
        : ACTIVE_UNLOCK_HINT,
    };
  }

  const unlocked = trust.score >= TRUSTED_UNLOCK_SCORE;
  return {
    unlocked,
      title: "Trusted",
      hint: unlocked
        ? "Ethereal Light Forms are open. This set stays calm, abstract, human-adjacent, and deliberately non-suggestive."
        : TRUSTED_UNLOCK_HINT,
  };
};

export function getAvatarTier(avatar: Avatar): AvatarTier {
  return AVATAR_TIER_MAP[avatar] ?? AVATAR_TIER_MAP[DEFAULT_AVATAR];
}

export function buildAvatarAccess(
  trust: CleanIdTrustSnapshot,
  currentAvatar: Avatar = DEFAULT_AVATAR
): AvatarAccess {
  const tiers: Record<AvatarTier, AvatarTierAccess> = {
    starter: getAvatarTierAccess("starter", trust),
    active: getAvatarTierAccess("active", trust),
    trusted: getAvatarTierAccess("trusted", trust),
  };

  const availableKeys = Object.values(Avatar).filter((avatar) => {
    if (avatar === currentAvatar) {
      return true;
    }
    return tiers[getAvatarTier(avatar)].unlocked;
  });

  return {
    currentTier: getAvatarTier(currentAvatar),
    availableKeys,
    tiers,
  };
}

export function canUseAvatar(
  avatar: Avatar,
  trust: CleanIdTrustSnapshot,
  currentAvatar: Avatar = DEFAULT_AVATAR
): boolean {
  const access = buildAvatarAccess(trust, currentAvatar);
  return access.availableKeys.includes(avatar);
}

export function getAvatarUnlockError(
  avatar: Avatar,
  trust: CleanIdTrustSnapshot,
  currentAvatar: Avatar = DEFAULT_AVATAR
): string | null {
  if (canUseAvatar(avatar, trust, currentAvatar)) {
    return null;
  }

  const tier = getAvatarTier(avatar);
  return buildAvatarAccess(trust, currentAvatar).tiers[tier].hint;
}

export const AVATAR_COUNTS = {
  starter: STARTER_AVATARS.length,
  active: ACTIVE_AVATARS.length,
  trusted: TRUSTED_AVATARS.length,
} as const;
