export type CleanIdShortClaimTier = "locked" | "scarce" | "ultra";
export type CleanIdShortClaimState = "locked" | "claimable" | "claimed";

export type CleanIdShortClaim = {
  state: CleanIdShortClaimState;
  tier: CleanIdShortClaimTier;
  currentLength: number;
  isCurrentShort: boolean;
  minStandardLength: number;
  minClaimLength: number | null;
  maxClaimLength: number | null;
  nextUnlockScore: number | null;
  nextUnlockLabel: string | null;
  pill: string;
  title: string;
  detail: string;
  scarcity: string;
  examples: string[];
};

export const CLEAN_ID_REGEX = /^[a-z0-9_]{1,20}$/;
export const STANDARD_CLEAN_ID_MIN_LENGTH = 5;
export const SHORT_ID_UNLOCK_SCORE = 64;
export const ULTRA_SHORT_ID_UNLOCK_SCORE = 82;

export const FALLBACK_SHORT_ID_CLAIM: CleanIdShortClaim = {
  state: "locked",
  tier: "locked",
  currentLength: 0,
  isCurrentShort: false,
  minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
  minClaimLength: null,
  maxClaimLength: null,
  nextUnlockScore: SHORT_ID_UNLOCK_SCORE,
  nextUnlockLabel: "Steady signal for 3-4 chars",
  pill: "Short claim locked",
  title: "Short claim is still sealed",
  detail: "Short CleanIDs stay scarce until the account builds steady conversation trust.",
  scarcity: "Default CleanIDs remain longer so the short ones keep real value.",
  examples: ["zen", "sky", "7"],
};

export const buildDerivedShortIdClaim = ({
  cleanId,
  trustScore,
}: {
  cleanId: string;
  trustScore: number;
}): CleanIdShortClaim => {
  const normalizedCleanId = cleanId.trim().toLowerCase();
  const currentLength = normalizedCleanId.length;
  const isCurrentUltra = currentLength > 0 && currentLength <= 2;
  const isCurrentScarce = currentLength >= 3 && currentLength <= 4;

  if (isCurrentUltra || isCurrentScarce) {
    const tier: CleanIdShortClaimTier = isCurrentUltra ? "ultra" : "scarce";
    return {
      state: "claimed",
      tier,
      currentLength,
      isCurrentShort: true,
      minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
      minClaimLength: tier === "ultra" ? 1 : 3,
      maxClaimLength: 4,
      nextUnlockScore:
        tier === "ultra" || trustScore >= ULTRA_SHORT_ID_UNLOCK_SCORE ? null : ULTRA_SHORT_ID_UNLOCK_SCORE,
      nextUnlockLabel:
        tier === "ultra" || trustScore >= ULTRA_SHORT_ID_UNLOCK_SCORE ? null : "Clear signal for 1-2 chars",
      pill: tier === "ultra" ? "Ultra claim held" : "Short claim held",
      title: tier === "ultra" ? "Ultra-short handle occupied" : "Short handle occupied",
      detail:
        tier === "ultra"
          ? "This account already holds a rare 1-2 character CleanID."
          : "This account already holds a scarce 3-4 character CleanID.",
      scarcity:
        tier === "ultra"
          ? "One and two character claims only open at the clearest trust state."
          : "Three and four character claims stay scarce because new accounts default to longer IDs.",
      examples: tier === "ultra" ? ["7", "zi", "sky", "zen"] : ["zen", "sky", "mio"],
    };
  }

  if (trustScore >= ULTRA_SHORT_ID_UNLOCK_SCORE) {
    return {
      state: "claimable",
      tier: "ultra",
      currentLength,
      isCurrentShort: false,
      minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
      minClaimLength: 1,
      maxClaimLength: 4,
      nextUnlockScore: null,
      nextUnlockLabel: null,
      pill: "Ultra claim open",
      title: "Ultra-short claim unlocked",
      detail: "Your signal is clear enough to claim any available 1-4 character CleanID.",
      scarcity: "This is the rarest handle class in the product.",
      examples: ["7", "zi", "sky", "zen"],
    };
  }

  if (trustScore >= SHORT_ID_UNLOCK_SCORE) {
    return {
      state: "claimable",
      tier: "scarce",
      currentLength,
      isCurrentShort: false,
      minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
      minClaimLength: 3,
      maxClaimLength: 4,
      nextUnlockScore: ULTRA_SHORT_ID_UNLOCK_SCORE,
      nextUnlockLabel: "Clear signal for 1-2 chars",
      pill: "Short claim open",
      title: "3-4 char claim unlocked",
      detail: "Your signal is steady enough to claim any available 3-4 character CleanID.",
      scarcity: "These shorter handles behave like scarce domains.",
      examples: ["zen", "sky", "mio"],
    };
  }

  return FALLBACK_SHORT_ID_CLAIM;
};

export const getShortClaimTierLabel = (claim: CleanIdShortClaim) => {
  if (claim.tier === "ultra") return "Ultra-short";
  if (claim.tier === "scarce") return "Short";
  return "Locked";
};

export const getShortClaimRangeLabel = (claim: CleanIdShortClaim) => {
  if (!claim.minClaimLength || !claim.maxClaimLength) {
    return `${STANDARD_CLEAN_ID_MIN_LENGTH}-20 chars`;
  }
  return `${claim.minClaimLength}-${claim.maxClaimLength} chars`;
};

export const validateShortClaimInput = ({
  cleanId,
  currentCleanId,
  claim,
}: {
  cleanId: string;
  currentCleanId: string;
  claim: CleanIdShortClaim;
}) => {
  const normalizedCleanId = cleanId.trim().toLowerCase();
  const normalizedCurrent = currentCleanId.trim().toLowerCase();

  if (!CLEAN_ID_REGEX.test(normalizedCleanId)) {
    return "CleanID must use lowercase letters, numbers, or underscore, up to 20 characters.";
  }

  if (normalizedCleanId === normalizedCurrent) {
    return null;
  }

  if (normalizedCleanId.length >= STANDARD_CLEAN_ID_MIN_LENGTH) {
    return null;
  }

  if (normalizedCleanId.length <= 2 && claim.tier !== "ultra") {
    return `1-2 character CleanIDs unlock at Clear signal (${ULTRA_SHORT_ID_UNLOCK_SCORE}+ trust score).`;
  }

  if (normalizedCleanId.length <= 4 && claim.tier === "locked") {
    return `3-4 character CleanIDs unlock at Steady signal (${SHORT_ID_UNLOCK_SCORE}+ trust score).`;
  }

  if (normalizedCleanId.length <= 4 && claim.tier === "scarce" && normalizedCleanId.length < 3) {
    return `Your current claim window is 3-4 characters. Reach ${ULTRA_SHORT_ID_UNLOCK_SCORE}+ trust score for 1-2 characters.`;
  }

  return null;
};
