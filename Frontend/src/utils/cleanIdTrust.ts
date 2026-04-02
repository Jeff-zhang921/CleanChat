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

export const FALLBACK_CLEAN_ID_TRUST: CleanIdTrustSnapshot = {
  score: 0,
  band: "blurred",
  title: "Blurred signal",
  summary: "This CleanID has not built enough communication history yet.",
  detail: "Healthier conversations will gradually sharpen the identity texture.",
  metrics: {
    accountAgeDays: 0,
    directThreads: 0,
    sentMessages: 0,
    sustainedThreads: 0,
    recentMessages: 0,
    moderationPenalties: 0,
  },
};

export const getTrustToneLabel = (trust: CleanIdTrustSnapshot) => {
  switch (trust.band) {
    case "clear":
      return "Clear";
    case "steady":
      return "Steady";
    case "fragile":
      return "Forming";
    case "blurred":
    default:
      return "Blurred";
  }
};

export const getTrustMetricLabel = (trust: CleanIdTrustSnapshot) => {
  if (trust.band === "clear") return "Pure identity";
  if (trust.band === "steady") return "Stable identity";
  if (trust.band === "fragile") return "Soft identity";
  return "Unsettled identity";
};
