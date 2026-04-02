import type { CleanIdTrustSnapshot } from "./cleanIdTrust";

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

export const CLEAN_ID_INPUT_REGEX = /^[a-z0-9_]{1,20}$/;
export const STANDARD_CLEAN_ID_MIN_LENGTH = 5;
export const SHORT_ID_UNLOCK_SCORE = 64;
export const ULTRA_SHORT_ID_UNLOCK_SCORE = 82;

const RESERVED_CLEAN_IDS = new Set([
  "admin",
  "administrator",
  "cleanchat",
  "founder",
  "help",
  "mod",
  "moderator",
  "no_reply",
  "noreply",
  "null",
  "owner",
  "root",
  "support",
  "system",
  "undefined",
]);

const clampCleanId = (value: string) => value.trim().toLowerCase();

const getUnlockedTier = (trust: CleanIdTrustSnapshot): CleanIdShortClaimTier => {
  if (trust.score >= ULTRA_SHORT_ID_UNLOCK_SCORE) {
    return "ultra";
  }
  if (trust.score >= SHORT_ID_UNLOCK_SCORE) {
    return "scarce";
  }
  return "locked";
};

export const buildCleanIdShortClaim = (
  cleanId: string,
  trust: CleanIdTrustSnapshot
): CleanIdShortClaim => {
  const normalizedCleanId = clampCleanId(cleanId);
  const currentLength = normalizedCleanId.length;
  const isCurrentUltra = currentLength > 0 && currentLength <= 2;
  const isCurrentScarce = currentLength >= 3 && currentLength <= 4;
  const unlockedTier = getUnlockedTier(trust);

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
        tier === "ultra" || unlockedTier === "ultra" ? null : ULTRA_SHORT_ID_UNLOCK_SCORE,
      nextUnlockLabel:
        tier === "ultra" || unlockedTier === "ultra" ? null : "Clear signal for 1-2 chars",
      pill: tier === "ultra" ? "Ultra claim held" : "Short claim held",
      title: tier === "ultra" ? "Ultra-short handle occupied" : "Short handle occupied",
      detail:
        tier === "ultra"
          ? "This account already holds a rare 1-2 character CleanID. It reads like early-domain territory."
          : "This account already holds a scarce 3-4 character CleanID. It behaves like a social asset, not just a username.",
      scarcity:
        tier === "ultra"
          ? "One and two character claims only open at the clearest trust state."
          : "Three and four character claims stay scarce because new accounts default to longer IDs.",
      examples: tier === "ultra" ? ["7", "zi", "sky", "zen"] : ["zen", "sky", "mio"],
    };
  }

  if (unlockedTier === "ultra") {
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
      detail: "Your trust is clear enough to claim any available 1-4 character CleanID, including single-character handles.",
      scarcity: "This is the rarest handle class in the product. It is meant to be remembered and defended.",
      examples: ["7", "zi", "sky", "zen"],
    };
  }

  if (unlockedTier === "scarce") {
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
      detail: "Your signal is steady enough to claim any available 3-4 character CleanID. One and two character IDs stay locked until clear signal.",
      scarcity: "These shorter handles work like scarce domains: easy to remember, hard to replace.",
      examples: ["zen", "sky", "mio"],
    };
  }

  return {
    state: "locked",
    tier: "locked",
    currentLength,
    isCurrentShort: false,
    minStandardLength: STANDARD_CLEAN_ID_MIN_LENGTH,
    minClaimLength: null,
    maxClaimLength: null,
    nextUnlockScore: SHORT_ID_UNLOCK_SCORE,
    nextUnlockLabel: "Steady signal for 3-4 chars",
    pill: "Short claim locked",
    title: "Short claim is still sealed",
    detail: "Short CleanIDs are scarce on purpose. Build steady conversation history first, then 3-4 character claims open up.",
    scarcity: "Default CleanIDs stay 5-20 characters so the shorter handles keep real social value.",
    examples: ["zen", "sky", "7"],
  };
};

export const validateRequestedCleanId = ({
  requestedCleanId,
  currentCleanId,
  trust,
}: {
  requestedCleanId: string;
  currentCleanId: string;
  trust: CleanIdTrustSnapshot;
}) => {
  const normalizedRequested = clampCleanId(requestedCleanId);
  const normalizedCurrent = clampCleanId(currentCleanId);

  if (!CLEAN_ID_INPUT_REGEX.test(normalizedRequested)) {
    return {
      ok: false as const,
      error: "CleanID must use lowercase letters, numbers, or underscore, up to 20 characters.",
    };
  }

  if (RESERVED_CLEAN_IDS.has(normalizedRequested) && normalizedRequested !== normalizedCurrent) {
    return {
      ok: false as const,
      error: "That CleanID is reserved.",
    };
  }

  if (normalizedRequested === normalizedCurrent) {
    return { ok: true as const };
  }

  const requestedLength = normalizedRequested.length;
  const currentLength = normalizedCurrent.length;
  const currentHasUltraClaim = currentLength > 0 && currentLength <= 2;
  const currentHasScarceClaim = currentLength >= 3 && currentLength <= 4;
  if (requestedLength >= STANDARD_CLEAN_ID_MIN_LENGTH) {
    return { ok: true as const };
  }

  if (currentHasUltraClaim && requestedLength <= 4) {
    return { ok: true as const };
  }

  if (currentHasScarceClaim && requestedLength >= 3 && requestedLength <= 4) {
    return { ok: true as const };
  }

  if (requestedLength <= 2 && trust.score < ULTRA_SHORT_ID_UNLOCK_SCORE) {
    return {
      ok: false as const,
      error: "1-2 character CleanIDs unlock at Clear signal (82+ trust score).",
    };
  }

  if (requestedLength <= 4 && trust.score < SHORT_ID_UNLOCK_SCORE) {
    return {
      ok: false as const,
      error: "3-4 character CleanIDs unlock at Steady signal (64+ trust score).",
    };
  }

  return { ok: true as const };
};
