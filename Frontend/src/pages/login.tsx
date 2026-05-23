import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEventHandler,
} from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "../config";
import {
  LANGUAGE_SWITCH_OPTIONS,
  resolveSupportedLanguage,
  setPreferredLanguage,
  type SupportedLanguage,
} from "../i18n";
import { clearAuthToken, getAuthToken } from "../utils/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PENDING_EMAIL_KEY = "cleanchat:pending-email";
const AUTH_RESTORE_MAX_ATTEMPTS = 3;
const AUTH_RESTORE_RETRY_MS = 1200;

const isIOSDevice = () => {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0)
  );
};

const isStandalonePwa = () => {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
};

type PointerState = {
  x: number;
  y: number;
};

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: BeforeInstallPromptOutcome;
    platform: string;
  }>;
};

const authPalette = {
  ink: "#182018",
  inkSoft: "#2f3a30",
  muted: "#647164",
  accent: "#1f7a52",
  accentSoft: "rgba(31, 122, 82, 0.12)",
  paper: "rgba(252, 247, 239, 0.92)",
  line: "rgba(72, 84, 68, 0.14)",
  warm: "rgba(207, 123, 86, 0.16)",
  cool: "rgba(61, 140, 103, 0.18)",
} as const;

const clampUnit = (value: number) => Math.min(1, Math.max(0, value));

const cardShift = (pointer: PointerState, strength = 1) =>
  `translate3d(${(pointer.x - 0.5) * -14 * strength}px, ${(pointer.y - 0.5) * -10 * strength}px, 0)`;

export const usePretextCompact = (breakpoint = 860) => {
  const [compact, setCompact] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const mediaQuery = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const update = () => setCompact(mediaQuery.matches);
    update();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", update);
      return () => mediaQuery.removeEventListener("change", update);
    }

    mediaQuery.addListener(update);
    return () => mediaQuery.removeListener(update);
  }, [breakpoint]);

  return compact;
};

export const usePretextPointer = () => {
  const [pointer, setPointer] = useState<PointerState>({ x: 0.5, y: 0.5 });

  const onMouseMove: MouseEventHandler<HTMLElement> = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    setPointer({
      x: clampUnit((event.clientX - rect.left) / rect.width),
      y: clampUnit((event.clientY - rect.top) / rect.height),
    });
  };

  const onMouseLeave = () => {
    setPointer({ x: 0.5, y: 0.5 });
  };

  return {
    pointer,
    bindings: {
      onMouseMove,
      onMouseLeave,
    },
  };
};

export const getPretextAuthStyles = (compact: boolean, pointer: PointerState) => ({
  shell: {
    minHeight: "100svh",
    padding: compact ? "1.1rem" : "1.8rem",
    display: "grid",
    placeItems: "center",
    color: authPalette.ink,
    fontFamily: "\"Manrope\", sans-serif",
  } satisfies CSSProperties,
  frame: {
    width: "min(100%, 34rem)",
  } satisfies CSSProperties,
  card: {
    position: "relative",
    overflow: "visible",
    display: "grid",
    gap: compact ? "1.4rem" : "1.9rem",
    padding: compact ? "0.35rem" : "0.5rem",
    borderRadius: 0,
    border: "0",
    background: "transparent",
    boxShadow: "none",
    backdropFilter: "none",
    transform: compact ? "none" : cardShift(pointer, 0.35),
    transition: "transform 220ms ease",
  } satisfies CSSProperties,
  glowA: {
    display: "none",
  } satisfies CSSProperties,
  glowB: {
    display: "none",
  } satisfies CSSProperties,
  topRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "0.9rem",
  } satisfies CSSProperties,
  kicker: {
    margin: 0,
    fontSize: "0.74rem",
    fontWeight: 700,
    letterSpacing: "0.16em",
    textTransform: "uppercase",
    color: authPalette.accent,
  } satisfies CSSProperties,
  badge: {
    display: "none",
  } satisfies CSSProperties,
  utilityRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.65rem",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  languageSwitchGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.4rem",
    padding: 0,
    borderRadius: 0,
    border: "0",
    background: "transparent",
    backdropFilter: "none",
    boxShadow: "none",
  } satisfies CSSProperties,
  languageSwitch: {
    border: "0",
    borderRadius: 0,
    minWidth: "auto",
    minHeight: "auto",
    padding: "0.18rem 0",
    font: "inherit",
    fontSize: "0.74rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "rgba(47, 58, 48, 0.72)",
    background: "transparent",
    cursor: "pointer",
    transition: "color 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  languageSwitchActive: {
    color: "#204c37",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.18rem",
    textDecorationThickness: "1px",
  } satisfies CSSProperties,
  hero: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: "0.8rem",
  } satisfies CSSProperties,
  heroTitle: {
    margin: 0,
    maxWidth: "11ch",
    fontFamily: "\"Space Grotesk\", sans-serif",
    fontSize: compact ? "clamp(2.2rem, 10vw, 3.2rem)" : "clamp(2.7rem, 8vw, 3.6rem)",
    lineHeight: 0.94,
    letterSpacing: "-0.05em",
    color: authPalette.ink,
  } satisfies CSSProperties,
  heroCopy: {
    margin: 0,
    maxWidth: "34ch",
    color: authPalette.muted,
    lineHeight: 1.78,
    fontSize: compact ? "1rem" : "1.02rem",
  } satisfies CSSProperties,
  chipRow: {
    display: "none",
  } satisfies CSSProperties,
  chip: {
    display: "none",
  } satisfies CSSProperties,
  divider: {
    position: "relative",
    zIndex: 1,
    height: "1px",
    background: "linear-gradient(90deg, rgba(72, 84, 68, 0), rgba(72, 84, 68, 0.22), rgba(72, 84, 68, 0))",
  } satisfies CSSProperties,
  form: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: "1.25rem",
  } satisfies CSSProperties,
  label: {
    fontSize: "0.88rem",
    fontWeight: 700,
    letterSpacing: "0.03em",
    color: "rgba(24, 32, 24, 0.9)",
  } satisfies CSSProperties,
  input: {
    width: "100%",
    borderRadius: 0,
    border: "0",
    borderBottom: `1px solid ${authPalette.line}`,
    background: "transparent",
    boxSizing: "border-box",
    padding: "0 0 0.92rem",
    color: authPalette.ink,
    font: "inherit",
    fontSize: "1.08rem",
    outline: "none",
    boxShadow: "none",
  } satisfies CSSProperties,
  note: {
    margin: 0,
    color: authPalette.muted,
    lineHeight: 1.8,
    fontSize: "0.88rem",
  } satisfies CSSProperties,
  primaryButton: {
    border: "0",
    borderRadius: "999px",
    padding: "0.98rem 1rem",
    font: "inherit",
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "#f7fbf8",
    background: authPalette.accent,
    boxShadow: "none",
    backdropFilter: "none",
    cursor: "pointer",
    transition: "opacity 0.2s ease, transform 0.2s ease",
  } satisfies CSSProperties,
  secondaryButton: {
    justifySelf: "start",
    border: "0",
    borderRadius: 0,
    padding: "0.2rem 0",
    font: "inherit",
    fontWeight: 600,
    textDecorationLine: "underline",
    textUnderlineOffset: "0.18rem",
    textDecorationThickness: "1px",
    background: "transparent",
    color: authPalette.inkSoft,
    cursor: "pointer",
    backdropFilter: "none",
    boxShadow: "none",
    transition: "opacity 0.2s ease",
  } satisfies CSSProperties,
  installShortcut: {
    justifySelf: "start",
    border: "0",
    borderRadius: 0,
    padding: "0.1rem 0",
    marginTop: "0.15rem",
    font: "inherit",
    fontSize: "0.93rem",
    fontWeight: 500,
    letterSpacing: "0.01em",
    textDecorationLine: "underline",
    textUnderlineOffset: "0.2rem",
    textDecorationThickness: "1px",
    background: "transparent",
    color: "rgba(47, 58, 48, 0.72)",
    cursor: "pointer",
    backdropFilter: "none",
    boxShadow: "none",
    transition: "opacity 0.2s ease, color 0.2s ease",
  } satisfies CSSProperties,
  installGuide: {
    position: "fixed",
    top: compact ? "1.05rem" : "1.35rem",
    right: compact ? "1rem" : "1.45rem",
    maxWidth: compact ? "12.5rem" : "15rem",
    margin: 0,
    fontFamily: "\"Manrope\", sans-serif",
    fontSize: "0.93rem",
    fontWeight: 600,
    letterSpacing: "0.01em",
    lineHeight: 1.7,
    color: "rgba(24, 32, 24, 0.82)",
    textAlign: "right",
    background: "transparent",
    border: "0",
    boxShadow: "none",
    zIndex: 24,
    pointerEvents: "none",
  } satisfies CSSProperties,
  status: {
    position: "relative",
    zIndex: 1,
    margin: 0,
    padding: 0,
    borderRadius: 0,
    border: "0",
    background: "transparent",
    color: "rgba(33, 83, 61, 0.9)",
    lineHeight: 1.7,
    fontSize: "0.9rem",
  } satisfies CSSProperties,
}) as const;

export const AuthLanguageSwitch = ({
  currentLanguage,
  onLanguageSwitch,
  styles,
}: {
  currentLanguage: SupportedLanguage;
  onLanguageSwitch: (language: SupportedLanguage) => void;
  styles: ReturnType<typeof getPretextAuthStyles>;
}) => {
  const { t } = useTranslation();

  return (
    <span style={styles.languageSwitchGroup}>
      {LANGUAGE_SWITCH_OPTIONS.map((option) => (
        <button
          key={option.code}
          type="button"
          style={{
            ...styles.languageSwitch,
            ...(option.code === currentLanguage ? styles.languageSwitchActive : undefined),
          }}
          onClick={() => onLanguageSwitch(option.code)}
          aria-label={t("auth.languageSwitchAria", {
            language: t(option.nameKey),
          })}
          title={t("auth.languageSwitchAria", {
            language: t(option.nameKey),
          })}
        >
          {option.shortLabel}
        </button>
      ))}
    </span>
  );
};

const setPendingEmail = (email: string) => {
  if (typeof window === "undefined") {
    return;
  }

  if (email) {
    window.sessionStorage.setItem(PENDING_EMAIL_KEY, email);
    return;
  }

  window.sessionStorage.removeItem(PENDING_EMAIL_KEY);
};

const LoginPage = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPromptingInstall, setIsPromptingInstall] = useState(false);
  const [showIosInstallGuide, setShowIosInstallGuide] = useState(false);
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const currentLanguage = resolveSupportedLanguage(i18n.language);
  const styles = getPretextAuthStyles(compact, pointer);
  const showAppleInstallShortcut = isIOSDevice() && !isStandalonePwa();
  const showNativeInstallShortcut =
    !isStandalonePwa() && Boolean(deferredInstallPrompt);
  const shouldRenderInstallShortcut =
    showNativeInstallShortcut || showAppleInstallShortcut;

  useEffect(() => {
    const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
    const navigatorStandalone =
      (window.navigator as Navigator & { standalone?: boolean }).standalone ===
      true;

    if (mediaStandalone || navigatorStandalone) {
      setDeferredInstallPrompt(null);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      if (typeof promptEvent.prompt !== "function") {
        return;
      }

      event.preventDefault();
      setDeferredInstallPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!showIosInstallGuide) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setShowIosInstallGuide(false);
    }, 5600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [showIosInstallGuide]);

  useEffect(() => {
    let isMounted = true;

    const restoreSession = async () => {
      if (!isMounted) {
        return;
      }

      const currentToken = getAuthToken();
      if (!currentToken) {
        setStatus("");
        return;
      }

      setIsRestoringSession(true);
      setStatus(t("auth.restoringSession"));

      for (let attempt = 1; attempt <= AUTH_RESTORE_MAX_ATTEMPTS; attempt++) {
        try {
          const response = await fetch(`${BACKEND_URL}/auth/me`, {
            credentials: "include",
          });

          if (response.ok) {
            if (isMounted) {
              setStatus("");
              navigate("/conversations", { replace: true });
            }
            return;
          }

          if (response.status === 401 || response.status === 403) {
            if (isMounted) {
              clearAuthToken();
              setStatus("");
            }
            return;
          }
        } catch {
          // Retry while backend wakes from cold start.
        }

        if (attempt < AUTH_RESTORE_MAX_ATTEMPTS) {
          await new Promise((resolve) =>
            window.setTimeout(resolve, AUTH_RESTORE_RETRY_MS * attempt),
          );
        }
      }

      if (isMounted) {
        setStatus(t("auth.sessionWaking"));
      }
    };

    void restoreSession().finally(() => {
      if (isMounted) {
        setIsRestoringSession(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [navigate, t]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setStatus(t("auth.invalidEmail"));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("auth.sendingCode"));

    try {
      const response = await fetch(`${BACKEND_URL}/auth/email/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ email: normalizedEmail }),
      });

      const raw = await response.text();
      let data: Record<string, string> = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as Record<string, string>;
        } catch {
          data = {};
        }
      }

      if (!response.ok) {
        if (response.status === 429) {
          setPendingEmail(normalizedEmail);
          navigate("/verify", { state: { email: normalizedEmail } });
          return;
        }
        setStatus(
          data.message ||
            data.error ||
            raw ||
            t("auth.sendCodeFailedHttp", { status: response.status })
        );
        return;
      }

      setStatus("");
      setPendingEmail(normalizedEmail);
      navigate("/verify", { state: { email: normalizedEmail } });
    } catch {
      setStatus(t("common.connectionError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLanguageSwitch = (language: SupportedLanguage) => {
    if (language === currentLanguage) {
      return;
    }
    void setPreferredLanguage(language);
  };

  const handleOpenInstallPrompt = async () => {
    if (showAppleInstallShortcut) {
      setShowIosInstallGuide((current) => !current);
      return;
    }

    if (!deferredInstallPrompt || isPromptingInstall) {
      return;
    }

    setIsPromptingInstall(true);
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice.catch(() => undefined);
    } finally {
      setDeferredInstallPrompt(null);
      setIsPromptingInstall(false);
    }
  };

  return (
    <div style={styles.shell} {...(compact ? {} : bindings)}>
      <main style={styles.frame}>
        <section style={styles.card}>
          <div style={styles.topRow}>
            <p style={styles.kicker}>{t("auth.privateEntry")}</p>
            <span style={styles.utilityRow}>
              <AuthLanguageSwitch
                currentLanguage={currentLanguage}
                onLanguageSwitch={handleLanguageSwitch}
                styles={styles}
              />
            </span>
          </div>

          <div style={styles.hero}>
            <h1 style={styles.heroTitle}>{t("auth.startWithEmail")}</h1>
            <p style={styles.heroCopy}>
              {t("auth.loginHeroCopy")}
            </p>
          </div>

          <div style={styles.divider} />

          <p style={{ ...styles.note, position: "relative", zIndex: 1 }}>
            {t("auth.passwordlessNote")}
          </p>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="email">
              {t("auth.emailAddress")}
            </label>
            <input
              style={styles.input}
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
              required
            />

            <p style={styles.note}>
              {t("auth.emailUsageNote")}
            </p>

            <button
              style={{ ...styles.primaryButton, opacity: isSubmitting || isRestoringSession ? 0.72 : 1 }}
              type="submit"
              disabled={isSubmitting || isRestoringSession}
            >
              {isRestoringSession
                ? t("auth.checkingSession")
                : isSubmitting
                  ? t("auth.sendingCode")
                  : t("auth.continueToCode")}
            </button>
          </form>

          {shouldRenderInstallShortcut && (
            <button
              type="button"
              style={{
                ...styles.installShortcut,
                opacity:
                  isSubmitting || isRestoringSession || isPromptingInstall
                    ? 0.58
                    : 1,
              }}
              onClick={() => {
                void handleOpenInstallPrompt();
              }}
              disabled={isSubmitting || isRestoringSession || isPromptingInstall}
              aria-label={t("auth.installShortcutAria")}
            >
              {isPromptingInstall && !showAppleInstallShortcut
                ? t("auth.installShortcutOpening")
                : t("auth.installShortcut")}
            </button>
          )}

          {showIosInstallGuide && showAppleInstallShortcut && (
            <p style={styles.installGuide} role="status" aria-live="polite">
              {t("auth.installShortcutIosGuide")}
            </p>
          )}

          {status && (
            <p style={styles.status} role="status">
              {status}
            </p>
          )}
        </section>
      </main>
    </div>
  );
};

export default LoginPage;
