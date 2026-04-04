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
  signalRow: {
    position: "relative",
    zIndex: 1,
    display: "block",
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
  helperRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: "0.45rem",
  } satisfies CSSProperties,
  helperPill: {
    display: "inline-flex",
    alignItems: "center",
    minHeight: "1.9rem",
    padding: "0.32rem 0.68rem",
    borderRadius: "999px",
    background: authPalette.accentSoft,
    border: "1px solid rgba(31, 122, 82, 0.12)",
    color: "#29553f",
    fontSize: "0.78rem",
    fontWeight: 600,
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

export const PretextSignalPanel = ({
  progress,
  compact,
  heading,
  caption,
}: {
  progress: number;
  compact: boolean;
  heading: string;
  caption: string;
}) => {
  const { t } = useTranslation();
  const normalized = clampUnit(progress);
  const phaseLabel =
    normalized >= 0.72
      ? t("auth.phaseReady")
      : normalized >= 0.38
        ? t("auth.phasePreparing")
        : t("auth.phaseIdle");

  return (
    <div
      style={{
        display: "grid",
        gap: compact ? "0.7rem" : "0.82rem",
        padding: compact ? "0.92rem 0.94rem" : "1rem 1.04rem",
        borderRadius: compact ? "1.06rem" : "1.18rem",
        border: `1px solid ${authPalette.line}`,
        background:
          "linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0.2))",
        boxShadow:
          "inset 0 1px 0 rgba(255, 255, 255, 0.42), 0 16px 34px rgba(24, 34, 24, 0.05)",
        backdropFilter: "blur(12px) saturate(1.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: "0.8rem",
        }}
      >
        <div
          style={{
            display: "grid",
            gap: "0.26rem",
            minWidth: 0,
          }}
        >
          <strong
            style={{
              fontSize: compact ? "0.98rem" : "1.04rem",
              lineHeight: 1.24,
              color: authPalette.ink,
              maxWidth: "26ch",
            }}
          >
            {heading}
          </strong>
          <span style={{ color: authPalette.muted, lineHeight: 1.55, fontSize: "0.9rem", maxWidth: "34ch" }}>
            {caption}
          </span>
        </div>
        <span
          style={{
            flexShrink: 0,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "1.95rem",
            padding: "0.32rem 0.68rem",
            borderRadius: "999px",
            border: `1px solid ${authPalette.line}`,
            background: "rgba(255, 255, 255, 0.58)",
            color: authPalette.inkSoft,
            fontSize: "0.78rem",
            fontWeight: 700,
            whiteSpace: "nowrap",
          }}
        >
          {phaseLabel}
        </span>
      </div>

      <div
        style={{
          position: "relative",
          height: "0.38rem",
          borderRadius: "999px",
          overflow: "hidden",
          background: "rgba(54, 68, 55, 0.08)",
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: 0,
            width: `${Math.max(18, Math.round(normalized * 100))}%`,
            borderRadius: "inherit",
            background: "linear-gradient(90deg, rgba(31, 122, 82, 0.78), rgba(198, 125, 88, 0.6))",
            boxShadow: "0 0 12px rgba(31, 122, 82, 0.12)",
          }}
        />
      </div>
    </div>
  );
};

export const PretextMessageDeck = ({
  emailLocal,
  emailDomain,
}: {
  compact: boolean;
  pointer: PointerState;
  emailLocal: string;
  emailDomain: string;
}) => {
  const { t } = useTranslation();
  const items = [
    emailLocal ? t("auth.aliasWithValue", { value: emailLocal }) : t("auth.aliasAfterTyping"),
    emailDomain ? t("auth.relayWithValue", { value: emailDomain }) : t("auth.relayAfterDomain"),
    t("auth.oneTimeCode"),
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
      {items.map((item) => (
        <span
          key={item}
          style={{
            display: "inline-flex",
            alignItems: "center",
            minHeight: "1.95rem",
            padding: "0.34rem 0.72rem",
            borderRadius: "999px",
            border: `1px solid ${authPalette.line}`,
            background: "rgba(255, 255, 255, 0.44)",
            color: authPalette.inkSoft,
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          {item}
        </span>
      ))}
    </div>
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(false);
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailParts = useMemo(() => normalizedEmail.split("@"), [normalizedEmail]);
  const emailLocal = emailParts[0] || "";
  const emailDomain = emailParts[1] || "";
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

  return (
    <div style={styles.shell} {...(compact ? {} : bindings)}>
      <main style={styles.frame}>
        <section style={styles.card}>
          <div style={styles.glowA} />
          <div style={styles.glowB} />

          <div style={styles.topRow}>
            <p style={styles.kicker}>{t("auth.privateEntry")}</p>
            <span style={styles.badge}>{t("auth.emailSignIn")}</span>
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

            <div style={styles.helperRow}>
              <PretextMessageDeck
                compact={compact}
                pointer={pointer}
                emailLocal={emailLocal}
                emailDomain={emailDomain}
              />
            </div>

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
