export type CleanIdShortClaimTier = "scarce" | "ultra";
export type CleanIdShortClaimState = "claimable" | "claimed";

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

export const FALLBACK_SHORT_ID_CLAIM: CleanIdShortClaim = {
  state: "claimable",
  tier: "ultra",
  currentLength: 0,
  isCurrentShort: false,
  minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
  minClaimLength: 1,
  maxClaimLength: 20,
  nextUnlockScore: null,
  nextUnlockLabel: null,
  pill: "CleanID open",
  title: "Choose any available CleanID",
  detail: "CleanIDs can be 1-20 characters. Availability is the only limit.",
  scarcity: "Short CleanIDs remain first-come, first-served.",
  examples: ["zen", "sky", "7"],
};

export const buildDerivedShortIdClaim = ({
  cleanId,
}: {
  cleanId: string;
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
      nextUnlockScore: null,
      nextUnlockLabel: null,
      pill: tier === "ultra" ? "Ultra claim held" : "Short claim held",
      title: tier === "ultra" ? "Ultra-short handle occupied" : "Short handle occupied",
      detail:
        tier === "ultra"
          ? "This account already holds a rare 1-2 character CleanID."
          : "This account already holds a scarce 3-4 character CleanID.",
      scarcity:
        tier === "ultra"
          ? "One and two character claims are first-come, first-served."
          : "Three and four character claims are first-come, first-served.",
      examples: tier === "ultra" ? ["7", "zi", "sky", "zen"] : ["zen", "sky", "mio"],
    };
  }

  return {
    ...FALLBACK_SHORT_ID_CLAIM,
    currentLength,
  };
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
}: {
  cleanId: string;
  currentCleanId: string;
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

  return null;
};
