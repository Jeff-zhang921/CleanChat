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

type PointerState = {
  x: number;
  y: number;
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
    padding: compact ? "1rem" : "1.5rem",
    display: "grid",
    placeItems: "center",
    color: authPalette.ink,
    fontFamily: "\"Manrope\", sans-serif",
  } satisfies CSSProperties,
  frame: {
    width: "min(100%, 40rem)",
  } satisfies CSSProperties,
  card: {
    position: "relative",
    overflow: "hidden",
    display: "grid",
    gap: compact ? "1rem" : "1.15rem",
    padding: compact ? "1.15rem" : "1.5rem",
    borderRadius: compact ? "1.6rem" : "2rem",
    border: `1px solid ${authPalette.line}`,
    background: `linear-gradient(180deg, ${authPalette.paper}, rgba(247, 241, 231, 0.98))`,
    boxShadow: "0 28px 72px rgba(85, 65, 39, 0.16)",
    backdropFilter: "blur(18px)",
    transform: compact ? "none" : cardShift(pointer),
    transition: "transform 180ms ease",
  } satisfies CSSProperties,
  glowA: {
    position: "absolute",
    top: "-5rem",
    right: "-4rem",
    width: "15rem",
    height: "15rem",
    borderRadius: "999px",
    background: `radial-gradient(circle, ${authPalette.cool}, rgba(61, 140, 103, 0))`,
    filter: "blur(18px)",
    pointerEvents: "none",
  } satisfies CSSProperties,
  glowB: {
    position: "absolute",
    bottom: "-7rem",
    left: "-5rem",
    width: "18rem",
    height: "18rem",
    borderRadius: "999px",
    background: `radial-gradient(circle, ${authPalette.warm}, rgba(207, 123, 86, 0))`,
    filter: "blur(26px)",
    pointerEvents: "none",
  } satisfies CSSProperties,
  topRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "0.75rem",
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
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "2rem",
    padding: "0.35rem 0.75rem",
    borderRadius: "999px",
    border: `1px solid ${authPalette.line}`,
    background: "rgba(255, 255, 255, 0.5)",
    color: authPalette.inkSoft,
    fontSize: "0.8rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  utilityRow: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    flexWrap: "wrap",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  languageSwitchGroup: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.24rem",
    padding: "0.18rem",
    borderRadius: "999px",
    border: "1px solid rgba(255, 255, 255, 0.16)",
    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.14))",
    backdropFilter: "blur(12px) saturate(1.02)",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.32)",
  } satisfies CSSProperties,
  languageSwitch: {
    border: "1px solid transparent",
    borderRadius: "999px",
    minWidth: "2rem",
    minHeight: "1.85rem",
    padding: "0.28rem 0.5rem",
    font: "inherit",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: authPalette.inkSoft,
    background: "transparent",
    cursor: "pointer",
    transition: "all 0.24s cubic-bezier(0.22, 1, 0.36, 1)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  languageSwitchActive: {
    color: "#204c37",
    border: "1px solid rgba(72, 112, 88, 0.22)",
    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(245, 250, 246, 0.82))",
    boxShadow: "0 8px 16px rgba(24, 34, 24, 0.08)",
  } satisfies CSSProperties,
  hero: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: "0.55rem",
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
    lineHeight: 1.65,
    fontSize: compact ? "0.98rem" : "1rem",
  } satisfies CSSProperties,
  chipRow: {
    position: "relative",
    zIndex: 1,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.5rem",
  } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "2rem",
    padding: "0.35rem 0.72rem",
    borderRadius: "999px",
    border: `1px solid ${authPalette.line}`,
    background: "rgba(255, 255, 255, 0.46)",
    color: authPalette.inkSoft,
    fontSize: "0.8rem",
    fontWeight: 600,
  } satisfies CSSProperties,
  divider: {
    position: "relative",
    zIndex: 1,
    height: "1px",
    background: "linear-gradient(90deg, rgba(72, 84, 68, 0), rgba(72, 84, 68, 0.2), rgba(72, 84, 68, 0))",
  } satisfies CSSProperties,
  form: {
    position: "relative",
    zIndex: 1,
    display: "grid",
    gap: "0.8rem",
  } satisfies CSSProperties,
  label: {
    fontSize: "0.86rem",
    fontWeight: 700,
    color: authPalette.ink,
  } satisfies CSSProperties,
  input: {
    width: "100%",
    borderRadius: "1rem",
    border: `1px solid ${authPalette.line}`,
    background: "rgba(255, 255, 255, 0.78)",
    boxSizing: "border-box",
    padding: "0.95rem 1rem",
    color: authPalette.ink,
    font: "inherit",
    outline: "none",
    boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.6)",
  } satisfies CSSProperties,
  note: {
    margin: 0,
    color: authPalette.muted,
    lineHeight: 1.55,
    fontSize: "0.84rem",
  } satisfies CSSProperties,
  primaryButton: {
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "999px",
    padding: "0.95rem 1rem",
    font: "inherit",
    fontWeight: 600,
    color: "#21533d",
    background: "linear-gradient(180deg, rgba(234, 249, 241, 0.3), rgba(234, 249, 241, 0.12))",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 16px 34px rgba(24, 34, 24, 0.06)",
    backdropFilter: "blur(14px) saturate(1.04)",
    cursor: "pointer",
    transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  } satisfies CSSProperties,
  secondaryButton: {
    justifySelf: "start",
    border: "1px solid rgba(255, 255, 255, 0.14)",
    borderRadius: "999px",
    padding: "0.68rem 0.9rem",
    font: "inherit",
    fontWeight: 600,
    background: "linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.05))",
    color: authPalette.inkSoft,
    cursor: "pointer",
    backdropFilter: "blur(14px) saturate(1.04)",
    boxShadow:
      "inset 0 1px 0 rgba(255, 255, 255, 0.28), 0 16px 34px rgba(24, 34, 24, 0.06)",
    transition: "all 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)",
  } satisfies CSSProperties,
  status: {
    position: "relative",
    zIndex: 1,
    margin: 0,
    padding: "0.8rem 0.92rem",
    borderRadius: "1rem",
    border: "1px solid rgba(31, 122, 82, 0.16)",
    background: "rgba(31, 122, 82, 0.08)",
    color: "#21533d",
    lineHeight: 1.5,
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
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const currentLanguage = resolveSupportedLanguage(i18n.language);
  const styles = getPretextAuthStyles(compact, pointer);

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

  return (
    <div style={styles.shell} {...(compact ? {} : bindings)}>
      <main style={styles.frame}>
        <section style={styles.card}>
          <div style={styles.glowA} />
          <div style={styles.glowB} />

          <div style={styles.topRow}>
            <p style={styles.kicker}>{t("auth.privateEntry")}</p>
            <span style={styles.utilityRow}>
              <span style={styles.badge}>{t("auth.emailSignIn")}</span>
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

          <div style={styles.chipRow}>
            {[t("auth.noPassword"), t("auth.quietHandoff"), t("auth.worksForGroups")].map((item) => (
              <span key={item} style={styles.chip}>
                {item}
              </span>
            ))}
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
