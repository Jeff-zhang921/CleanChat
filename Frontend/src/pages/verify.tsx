import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";
import {
  PretextMessageDeck,
  PretextSignalOrb,
  getPretextAuthStyles,
  usePretextCompact,
  usePretextPointer,
} from "../pretext/auth";

const CODE_LENGTH = 6;
const PENDING_EMAIL_KEY = "cleanchat:pending-email";

type VerifyLocationState = {
  email?: string;
} | null;

const getPendingEmail = () => {
  if (typeof window === "undefined") {
    return "";
  }

  return window.sessionStorage.getItem(PENDING_EMAIL_KEY)?.trim().toLowerCase() || "";
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

const VerifyPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = ((location.state as VerifyLocationState)?.email || "").trim().toLowerCase();
  const [storedEmail, setStoredEmail] = useState(() => getPendingEmail());
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  useEffect(() => {
    if (!emailFromState || emailFromState === storedEmail) {
      return;
    }

    setPendingEmail(emailFromState);
    setStoredEmail(emailFromState);
  }, [emailFromState, storedEmail]);

  const email = useMemo(
    () => emailFromState || storedEmail,
    [emailFromState, storedEmail]
  );
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailParts = useMemo(() => email.split("@"), [email]);
  const codeProgress = email
    ? Math.min(1, 0.32 + code.trim().length / CODE_LENGTH)
    : 0.18;
  const styles = getPretextAuthStyles(compact, pointer);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email) {
      setStatus("Email is missing. Please go back to login.");
      return;
    }

    const normalizedCode = code.trim();
    if (normalizedCode.length !== CODE_LENGTH) {
      setStatus("Please enter the 6-digit code.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Verifying...");

    try {
      const response = await fetch(`${BACKEND_URL}/auth/email/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          email,
          code: normalizedCode,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(data.message || data.error || "Verification failed.");
        return;
      }

      setStatus("");
      setPendingEmail("");
      setStoredEmail("");
      navigate(data.isNewUser ? "/basic-info" : "/conversations");
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
            <p style={styles.heroKicker}>Code Receipt</p>
            <span style={styles.heroBadge}>mailbox handshake</span>
          </div>

          <h1 style={styles.heroTitle}>The lane is open. Now prove it is yours.</h1>
          <p style={styles.heroCopy}>
            Verification should feel like the second beat of the same experience, not a dead utility screen. Drop in
            the code and the route resolves into your conversations.
          </p>

          <div style={styles.heroTagRow}>
            {["6 digits", "temporary entry", "quiet handoff"].map((item) => (
              <span key={item} style={styles.heroTag}>
                {item}
              </span>
            ))}
          </div>

          <div style={styles.heroGrid}>
            <PretextMessageDeck
              compact={compact}
              pointer={pointer}
              emailLocal={emailParts[0] || ""}
              emailDomain={emailParts[1] || ""}
            />

            <aside style={styles.sideCard}>
              <p style={styles.sideLabel}>Verification Note</p>
              <h2 style={styles.sideTitle}>One code, then the surface disappears.</h2>
              <p style={styles.sideCopy}>
                The whole point is speed: confirm the mailbox, step in, and leave the mechanics behind you.
              </p>

              <div style={styles.sideStatGrid}>
                {[
                  [String(CODE_LENGTH).padStart(2, "0"), "digits"],
                  ["1", "mailbox"],
                  ["0", "passwords"],
                  ["now", "entry"],
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
          <p style={styles.step}>Step 2 of 2</p>
          <PretextSignalOrb
            progress={codeProgress}
            compact={compact}
            pointer={pointer}
            heading={code.trim().length === CODE_LENGTH ? "All digits present. Resolve the lane." : "Awaiting full code."}
            caption={
              email
                ? `Mailbox locked to ${email}. Finish the 6-digit sequence and we open the conversation surface.`
                : "Return to login to request a new code before continuing."
            }
          />

          <div>
            <h2 style={styles.title}>Verify your code</h2>
            <p style={styles.copy}>
              {email ? `Code sent to ${email}.` : "Return to login to request a code."}
            </p>
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="code">
              Verification Code
            </label>
            <input
              style={{
                ...styles.input,
                textAlign: "center",
                letterSpacing: "0.24em",
                fontWeight: 700,
              }}
              id="code"
              type="text"
              inputMode="numeric"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
              required
            />

            <div style={styles.helperRow}>
              {[
                `${code.trim().length}/${CODE_LENGTH} digits`,
                emailParts[0] ? `entry ${emailParts[0]}` : "entry pending",
                "mailbox verified",
              ].map((item) => (
                <span key={item} style={styles.helperPill}>
                  {item}
                </span>
              ))}
            </div>

            <button
              style={{ ...styles.primaryButton, opacity: isSubmitting || !email ? 0.72 : 1 }}
              type="submit"
              disabled={isSubmitting || !email}
            >
              {isSubmitting ? "Verifying..." : "Enter CleanChat"}
            </button>
          </form>

          <button style={styles.secondaryButton} type="button" onClick={() => navigate("/login")}>
            Back to login
          </button>

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

export default VerifyPage;
