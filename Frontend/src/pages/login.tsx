import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEventHandler,
} from "react";
import { useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PENDING_EMAIL_KEY = "cleanchat:pending-email";

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
    display: "grid",
    gridTemplateColumns: compact ? "1fr" : "5.6rem minmax(0, 1fr)",
    gap: compact ? "0.85rem" : "1rem",
    alignItems: "center",
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
    border: 0,
    borderRadius: "1rem",
    padding: "0.95rem 1rem",
    font: "inherit",
    fontWeight: 700,
    color: "#f8f3ea",
    background: "linear-gradient(135deg, #173723, #1f6b49)",
    boxShadow: "0 14px 30px rgba(25, 92, 61, 0.2)",
    cursor: "pointer",
  } satisfies CSSProperties,
  secondaryButton: {
    justifySelf: "start",
    border: `1px solid ${authPalette.line}`,
    borderRadius: "999px",
    padding: "0.68rem 0.9rem",
    font: "inherit",
    fontWeight: 700,
    background: "rgba(255, 255, 255, 0.56)",
    color: authPalette.inkSoft,
    cursor: "pointer",
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

export const PretextSignalOrb = ({
  progress,
  compact,
  pointer,
  heading,
  caption,
}: {
  progress: number;
  compact: boolean;
  pointer: PointerState;
  heading: string;
  caption: string;
}) => {
  const normalized = clampUnit(progress);
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * (0.18 + normalized * 0.68);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: compact ? "1fr" : "5.6rem minmax(0, 1fr)",
        gap: compact ? "0.8rem" : "0.95rem",
        alignItems: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: "5.4rem",
          height: "5.4rem",
          justifySelf: compact ? "start" : "center",
          transform: compact ? "none" : `${cardShift(pointer, 0.35)} scale(1)`,
          transition: "transform 180ms ease",
        }}
      >
        <svg viewBox="0 0 96 96" width="100%" height="100%" aria-hidden="true">
          <defs>
            <linearGradient id="auth-meter" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#1f7a52" />
              <stop offset="100%" stopColor="#c67d58" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(44, 57, 44, 0.09)" strokeWidth="8" />
          <circle
            cx="48"
            cy="48"
            r={radius}
            fill="none"
            stroke="url(#auth-meter)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference}`}
            transform="rotate(-90 48 48)"
          />
          <circle cx="48" cy="48" r="23" fill="rgba(255, 250, 244, 0.9)" />
        </svg>

        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            fontFamily: "\"Space Grotesk\", sans-serif",
            fontSize: "1.15rem",
            fontWeight: 700,
            color: authPalette.ink,
          }}
        >
          {Math.round(normalized * 100)}%
        </div>
      </div>

      <div style={{ display: "grid", gap: "0.24rem" }}>
        <span
          style={{
            fontSize: "0.74rem",
            fontWeight: 700,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            color: authPalette.accent,
          }}
        >
          Entry status
        </span>
        <strong
          style={{
            fontSize: compact ? "1rem" : "1.05rem",
            lineHeight: 1.2,
            color: authPalette.ink,
          }}
        >
          {heading}
        </strong>
        <span style={{ color: authPalette.muted, lineHeight: 1.55, fontSize: "0.9rem" }}>{caption}</span>
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
  const items = [
    emailLocal ? `alias ${emailLocal}` : "alias appears after typing",
    emailDomain ? `relay ${emailDomain}` : "relay follows your domain",
    "one-time code",
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
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);
  const emailParts = useMemo(() => normalizedEmail.split("@"), [normalizedEmail]);
  const emailLocal = emailParts[0] || "";
  const emailDomain = emailParts[1] || "";
  const emailReady = EMAIL_REGEX.test(normalizedEmail);
  const emailProgress = normalizedEmail
    ? emailReady
      ? Math.min(1, 0.56 + normalizedEmail.length / 38)
      : Math.min(0.5, 0.18 + normalizedEmail.length / 44)
    : 0.14;
  const styles = getPretextAuthStyles(compact, pointer);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setStatus("Please enter a valid email.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Sending verification code...");

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
            `Failed to send verification code (HTTP ${response.status}).`
        );
        return;
      }

      setStatus("");
      setPendingEmail(normalizedEmail);
      navigate("/verify", { state: { email: normalizedEmail } });
    } catch {
      setStatus("Unable to connect to server.");
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
            <p style={styles.kicker}>Private entry</p>
            <span style={styles.badge}>Email sign-in</span>
          </div>

          <div style={styles.hero}>
            <h1 style={styles.heroTitle}>Start with your email.</h1>
            <p style={styles.heroCopy}>
              One address. One 6-digit code. Then straight into your conversations. No password reset theater and no
              profile wall before you can talk.
            </p>
          </div>

          <div style={styles.chipRow}>
            {["no password", "quiet handoff", "works for groups"].map((item) => (
              <span key={item} style={styles.chip}>
                {item}
              </span>
            ))}
          </div>

          <div style={styles.divider} />

          <div style={styles.signalRow}>
            <PretextSignalOrb
              progress={emailProgress}
              compact={compact}
              pointer={pointer}
              heading={emailReady ? "Address looks good. Ready to send the code." : "Waiting for a clean email address."}
              caption={
                emailReady
                  ? "Continue and CleanChat sends a 6-digit code to this mailbox."
                  : "Type the address you want to use, and we will route the code there."
              }
            />
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="email">
              Email address
            </label>
            <input
              style={styles.input}
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
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
              We only use this address to deliver the code and reconnect you to the right conversation entry.
            </p>

            <button
              style={{ ...styles.primaryButton, opacity: isSubmitting ? 0.72 : 1 }}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Sending code..." : "Continue to Code"}
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
