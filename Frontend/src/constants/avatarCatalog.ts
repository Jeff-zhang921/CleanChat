import {
  FALLBACK_CLEAN_ID_TRUST,
  type CleanIdTrustSnapshot,
} from "../utils/cleanIdTrust";

export type AvatarKey =
  | "AVATAR_LEO"
  | "AVATAR_SOPHIE"
  | "AVATAR_MAX"
  | "AVATAR_BELLA"
  | "AVATAR_CHARLIE"
  | "AVATAR_AVERY"
  | "AVATAR_RILEY"
  | "AVATAR_JORDAN"
  | "AVATAR_SKYLER"
  | "AVATAR_MORGAN";

export type AvatarTier = "starter" | "active" | "trusted";

export type AvatarOption = {
  key: AvatarKey;
  label: string;
  family: string;
  tier: AvatarTier;
  url: string;
};

export type AvatarTierAccess = {
  unlocked: boolean;
  title: string;
  hint: string;
};

export type AvatarAccess = {
  currentTier: AvatarTier;
  availableKeys: AvatarKey[];
  tiers: Record<AvatarTier, AvatarTierAccess>;
};

const ACTIVE_UNLOCK_RECENT_MESSAGES = 8;
const ACTIVE_UNLOCK_TOTAL_MESSAGES = 12;
const TRUSTED_UNLOCK_SCORE = 64;

const buildMarbleAvatarDataUri = (seed: string, colors: [string, string, string, string]) => {
  const [base, wash, accent, glow] = colors;
  const initial = seed.trim().charAt(0).toUpperCase() || "M";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="18" y1="14" x2="142" y2="146" gradientUnits="userSpaceOnUse">
          <stop stop-color="${base}"/>
          <stop offset="1" stop-color="${wash}"/>
        </linearGradient>
        <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <g filter="url(#blur)" opacity="0.95">
        <circle cx="52" cy="52" r="34" fill="${accent}"/>
        <circle cx="118" cy="68" r="30" fill="${glow}"/>
        <circle cx="88" cy="114" r="36" fill="${wash}"/>
      </g>
      <path d="M24 98C47 74 74 77 96 90C118 103 132 127 146 122" stroke="rgba(255,255,255,0.58)" stroke-width="10" stroke-linecap="round"/>
      <path d="M18 58C38 42 58 40 78 48C98 56 116 74 142 74" stroke="rgba(255,255,255,0.34)" stroke-width="8" stroke-linecap="round"/>
      <circle cx="80" cy="80" r="58" stroke="rgba(255,255,255,0.26)" stroke-width="1.5"/>
      <text x="80" y="92" text-anchor="middle" font-size="42" font-family="Arial, sans-serif" font-weight="700" fill="rgba(255,255,255,0.78)">${initial}</text>
    </svg>
  `.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const DEFAULT_AVATAR_KEY: AvatarKey = "AVATAR_LEO";

export const AVATAR_TIER_META: Record<
  AvatarTier,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  starter: {
    eyebrow: "Starter",
    title: "DiceBear Shapes",
    description: "Clean geometric marks for new CleanIDs. Open from day one.",
  },
  active: {
    eyebrow: "Active",
    title: "Boring Avatars Marble",
    description: "Gradient marble portraits that unlock once your cadence feels lived in.",
  },
  trusted: {
    eyebrow: "Trusted",
    title: "Waifu.pics Aesthetics",
    description: "Cinematic anime crops that become a recognizable signature for trusted IDs.",
  },
};

export const AVATAR_TIER_ORDER: AvatarTier[] = ["starter", "active", "trusted"];

export const AVATAR_OPTIONS: AvatarOption[] = [
  {
    key: "AVATAR_LEO",
    label: "Drift",
    family: "DiceBear Shapes",
    tier: "starter",
    url: "https://api.dicebear.com/9.x/shapes/svg?seed=Drift",
  },
  {
    key: "AVATAR_SOPHIE",
    label: "Halo",
    family: "DiceBear Shapes",
    tier: "starter",
    url: "https://api.dicebear.com/9.x/shapes/svg?seed=Halo",
  },
  {
    key: "AVATAR_MAX",
    label: "Moss",
    family: "DiceBear Shapes",
    tier: "starter",
    url: "https://api.dicebear.com/9.x/shapes/svg?seed=Moss",
  },
  {
    key: "AVATAR_BELLA",
    label: "Echo",
    family: "DiceBear Shapes",
    tier: "starter",
    url: "https://api.dicebear.com/9.x/shapes/svg?seed=Echo",
  },
  {
    key: "AVATAR_CHARLIE",
    label: "Vale",
    family: "Boring Avatars Marble",
    tier: "active",
    url: buildMarbleAvatarDataUri("Vale", ["#0B132B", "#1C2541", "#3A506B", "#5BC0BE"]),
  },
  {
    key: "AVATAR_AVERY",
    label: "Luma",
    family: "Boring Avatars Marble",
    tier: "active",
    url: buildMarbleAvatarDataUri("Luma", ["#2F4858", "#33658A", "#86BBD8", "#F6AE2D"]),
  },
  {
    key: "AVATAR_RILEY",
    label: "Nova",
    family: "Boring Avatars Marble",
    tier: "active",
    url: buildMarbleAvatarDataUri("Nova", ["#264653", "#2A9D8F", "#E9C46A", "#F4A261"]),
  },
  {
    key: "AVATAR_JORDAN",
    label: "Aster",
    family: "Waifu.pics Aesthetics",
    tier: "trusted",
    url: "https://i.waifu.pics/P817hp4.jpg",
  },
  {
    key: "AVATAR_SKYLER",
    label: "Noir",
    family: "Waifu.pics Aesthetics",
    tier: "trusted",
    url: "https://i.waifu.pics/Lcq0Tx8.jpg",
  },
  {
    key: "AVATAR_MORGAN",
    label: "Velvet",
    family: "Waifu.pics Aesthetics",
    tier: "trusted",
    url: "https://i.waifu.pics/Tj6Wzwo.png",
  },
];

const ACTIVE_UNLOCK_HINT =
  "Unlock Marble after 24 hours of healthy activity or a steady reply pattern.";
const TRUSTED_UNLOCK_HINT =
  "Unlock Aesthetics once your Trust Score reaches the Steady band.";

const getTierAccess = (
  tier: AvatarTier,
  trust: CleanIdTrustSnapshot
): AvatarTierAccess => {
  if (tier === "starter") {
    return {
      unlocked: true,
      title: "Starter",
      hint: "Shapes are open from day one so every CleanID starts clean.",
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
      hint: unlocked ? "Marble is open. Your activity already reads steady enough." : ACTIVE_UNLOCK_HINT,
    };
  }

  const unlocked = trust.score >= TRUSTED_UNLOCK_SCORE;
  return {
    unlocked,
    title: "Trusted",
    hint: unlocked
      ? "Aesthetics are open. Your Trust Score is already in the steady range."
      : TRUSTED_UNLOCK_HINT,
  };
};

export const getAvatarOption = (avatar: AvatarKey) =>
  AVATAR_OPTIONS.find((option) => option.key === avatar) ??
  AVATAR_OPTIONS.find((option) => option.key === DEFAULT_AVATAR_KEY)!;

export const getAvatarUrl = (avatar?: AvatarKey | null) =>
  getAvatarOption(avatar ?? DEFAULT_AVATAR_KEY).url;

export const getAvatarOptionsByTier = (tier: AvatarTier) =>
  AVATAR_OPTIONS.filter((option) => option.tier === tier);

export const buildDerivedAvatarAccess = ({
  trust = FALLBACK_CLEAN_ID_TRUST,
  currentAvatar,
}: {
  trust?: CleanIdTrustSnapshot | null;
  currentAvatar?: AvatarKey | null;
}): AvatarAccess => {
  const activeTrust = trust ?? FALLBACK_CLEAN_ID_TRUST;
  const current = currentAvatar ?? DEFAULT_AVATAR_KEY;
  const tiers: Record<AvatarTier, AvatarTierAccess> = {
    starter: getTierAccess("starter", activeTrust),
    active: getTierAccess("active", activeTrust),
    trusted: getTierAccess("trusted", activeTrust),
  };

  const availableKeys = AVATAR_OPTIONS.filter((option) => {
    if (option.key === current) {
      return true;
    }
    return tiers[option.tier].unlocked;
  }).map((option) => option.key);

  return {
    currentTier: getAvatarOption(current).tier,
    availableKeys,
    tiers,
  };
};

export const isAvatarUnlocked = (avatar: AvatarKey, access: AvatarAccess) =>
  access.availableKeys.includes(avatar);
