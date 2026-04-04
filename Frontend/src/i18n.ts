import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";
import zhTW from "./locales/zh-TW.json";
import ko from "./locales/ko.json";
import ja from "./locales/ja.json";

export const LANGUAGE_STORAGE_KEY = "cleanchat:language";
export const I18NEXT_LANGUAGE_STORAGE_KEY = "i18nextLng";
export const SUPPORTED_LANGUAGES = ["zh-TW", "zh", "en", "ko", "ja"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

const normalizeLanguage = (value: string | null): SupportedLanguage | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("zh")) {
    if (
      normalized.includes("tw") ||
      normalized.includes("hant") ||
      normalized.includes("hk") ||
      normalized.includes("mo")
    ) {
      return "zh-TW";
    }
    return "zh";
  }

  if (normalized.startsWith("en")) {
    return "en";
  }
  if (normalized.startsWith("ko")) {
    return "ko";
  }
  if (normalized.startsWith("ja")) {
    return "ja";
  }

  return null;
};

export const resolveSupportedLanguage = (
  value: string | null | undefined,
): SupportedLanguage => normalizeLanguage(value ?? null) ?? "zh";

export const LANGUAGE_SWITCH_OPTIONS: ReadonlyArray<{
  code: SupportedLanguage;
  shortLabel: string;
  nameKey: string;
}> = [
  { code: "zh-TW", shortLabel: "繁", nameKey: "language.zhTW" },
  { code: "zh", shortLabel: "簡", nameKey: "language.zh" },
  { code: "en", shortLabel: "EN", nameKey: "language.en" },
  { code: "ko", shortLabel: "한", nameKey: "language.ko" },
  { code: "ja", shortLabel: "日", nameKey: "language.ja" },
];

const getInitialLanguage = (): SupportedLanguage => {
  if (typeof window === "undefined") {
    return "zh";
  }

  const i18nextStored = window.localStorage.getItem(
    I18NEXT_LANGUAGE_STORAGE_KEY,
  );
  const normalizedI18nextStored = normalizeLanguage(i18nextStored);
  if (normalizedI18nextStored) {
    return normalizedI18nextStored;
  }

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  const normalizedStored = normalizeLanguage(stored);
  if (normalizedStored) {
    window.localStorage.setItem(I18NEXT_LANGUAGE_STORAGE_KEY, normalizedStored);
    return normalizedStored;
  }

  return "zh";
};

export const setPreferredLanguage = async (language: SupportedLanguage) => {
  await i18n.changeLanguage(language);
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    window.localStorage.setItem(I18NEXT_LANGUAGE_STORAGE_KEY, language);
  }
};

i18n.use(initReactI18next).init({
  resources: {
    "zh-TW": { translation: zhTW },
    zh: { translation: zh },
    en: { translation: en },
    ko: { translation: ko },
    ja: { translation: ja },
  },
  lng: getInitialLanguage(),
  fallbackLng: "zh",
  supportedLngs: [...SUPPORTED_LANGUAGES],
  interpolation: {
    escapeValue: false,
  },
  returnNull: false,
});

i18n.on("languageChanged", (language) => {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeLanguage(language);
  if (normalized) {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
    window.localStorage.setItem(I18NEXT_LANGUAGE_STORAGE_KEY, normalized);
  }
});

export default i18n;
