import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";
import {
  PretextMessageDeck,
  PretextSignalOrb,
  getPretextAuthStyles,
  usePretextCompact,
  usePretextPointer,
} from "../pretext/auth";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PENDING_EMAIL_KEY = "cleanchat:pending-email";

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
      ? Math.min(1, 0.58 + normalizedEmail.length / 34)
      : Math.min(0.52, 0.22 + normalizedEmail.length / 44)
    : 0.16;
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
      <main style={styles.layout}>
        <section style={styles.heroPanel}>
          <div style={styles.heroGlowA} />
          <div style={styles.heroGlowB} />

          <div style={styles.heroHeader}>
            <p style={styles.heroKicker}>Quiet Entry</p>
            <span style={styles.heroBadge}>zero app install</span>
          </div>

          <h1 style={styles.heroTitle}>CleanChat opens a private lane, not a crowded lobby.</h1>
          <p style={styles.heroCopy}>
            Type one address, receive one code, and step straight into a short-lived conversation space. No password
            ceremony. No contact request detour.
          </p>

          <div style={styles.heroTagRow}>
            {["email handoff", "group rooms ready", "clean id search"].map((item) => (
              <span key={item} style={styles.heroTag}>
                {item}
              </span>
            ))}
          </div>

          <div style={styles.heroGrid}>
            <PretextMessageDeck
              compact={compact}
              pointer={pointer}
              emailLocal={emailLocal}
              emailDomain={emailDomain}
            />

            <aside style={styles.sideCard}>
              <p style={styles.sideLabel}>Entry Mood</p>
              <h2 style={styles.sideTitle}>Closer to knocking on a door than registering for a platform.</h2>
              <p style={styles.sideCopy}>
                CleanChat is built for temporary focus: quick follow-ups, quiet group rooms, and private conversation
                starts that feel light instead of ceremonial.
              </p>

              <div style={styles.sideStatGrid}>
                {[
                  ["01", "address"],
                  ["06", "digits"],
                  ["00", "passwords"],
                  ["24/7", "rooms"],
                ].map(([value, label]) => (
                  <div key={label} style={styles.sideStat}>
                    <span style={styles.sideStatValue}>{value}</span>
                    <span style={styles.sideStatLabel}>{label}</span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </section>

        <section style={styles.panel}>
          <p style={styles.step}>Step 1 of 2</p>
          <PretextSignalOrb
            progress={emailProgress}
            compact={compact}
            pointer={pointer}
            heading={emailReady ? "Address confirmed, route can open." : "Waiting for a clean address."}
            caption={
              emailReady
                ? "Your code path is ready. Continue and we hand off a 6-digit entry."
                : "As you type, the lane map sharpens and the relay locks onto your mailbox."
            }
          />

          <div>
            <h2 style={styles.title}>Sign in with email</h2>
            <p style={styles.copy}>
              This first step should feel fast and slightly theatrical. Enter your email and CleanChat routes a
              6-digit code through a private entry lane.
            </p>
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
              {[
                emailLocal ? `entry ${emailLocal}` : "entry alias pending",
                emailDomain ? `relay ${emailDomain}` : "relay mailbox pending",
                "6-digit handoff",
              ].map((item) => (
                <span key={item} style={styles.helperPill}>
                  {item}
                </span>
              ))}
            </div>

            <p style={styles.emailHint}>
              We only use the address to deliver the code and reconnect you to the right conversation entry.
            </p>

            <button
              style={{ ...styles.primaryButton, opacity: isSubmitting ? 0.72 : 1 }}
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? "Routing code..." : "Continue to Code"}
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
