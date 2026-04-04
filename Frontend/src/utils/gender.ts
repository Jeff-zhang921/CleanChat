export const GENDER_VALUES = [
  "male",
  "female",
  "non_binary",
  "hidden",
] as const;

export type GenderValue = (typeof GENDER_VALUES)[number];

const GENDER_VALUE_SET = new Set<string>(GENDER_VALUES);

export const normalizeGender = (value: unknown): GenderValue => {
  if (typeof value !== "string") {
    return "hidden";
  }

  const normalized = value.trim().toLowerCase();
  if (!GENDER_VALUE_SET.has(normalized)) {
    return "hidden";
  }

  return normalized as GenderValue;
};

export const GENDER_ICON_MAP: Record<GenderValue, string> = {
  male: "♂️",
  female: "♀️",
  non_binary: "⚥",
  hidden: "➖",
};

export const GENDER_ARIA_KEY_MAP: Record<GenderValue, string> = {
  male: "gender.male",
  female: "gender.female",
  non_binary: "gender.nonBinary",
  hidden: "gender.hidden",
};

export const GENDER_OPTIONS: ReadonlyArray<{
  value: GenderValue;
  icon: string;
  ariaKey: string;
}> = [
  {
    value: "male",
    icon: GENDER_ICON_MAP.male,
    ariaKey: GENDER_ARIA_KEY_MAP.male,
  },
  {
    value: "female",
    icon: GENDER_ICON_MAP.female,
    ariaKey: GENDER_ARIA_KEY_MAP.female,
  },
  {
    value: "non_binary",
    icon: GENDER_ICON_MAP.non_binary,
    ariaKey: GENDER_ARIA_KEY_MAP.non_binary,
  },
  {
    value: "hidden",
    icon: GENDER_ICON_MAP.hidden,
    ariaKey: GENDER_ARIA_KEY_MAP.hidden,
  },
];

export const getGenderIcon = (gender: GenderValue): string =>
  GENDER_ICON_MAP[gender];
