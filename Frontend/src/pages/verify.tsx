import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { apiClient } from "../utils/apiClient";
import { setAuthToken } from "../utils/auth";
import { ensurePushSubscriptionForCurrentUser } from "../utils/notifications";
import {
  PretextMessageDeck,
  PretextSignalPanel,
  getPretextAuthStyles,
  usePretextCompact,
  usePretextPointer,
} from "./login";

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
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();

  useEffect(() => {
    if (!emailFromState || emailFromState === storedEmail) {
      return;
    }

    setPendingEmail(emailFromState);
    setStoredEmail(emailFromState);
  }, [emailFromState, storedEmail]);

  const email = useMemo(() => emailFromState || storedEmail, [emailFromState, storedEmail]);
  const emailParts = useMemo(() => email.split("@"), [email]);
  const normalizedCode = code.trim();
  const codeProgress = email ? Math.min(1, 0.24 + normalizedCode.length / CODE_LENGTH) : 0.12;
  const styles = getPretextAuthStyles(compact, pointer);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email) {
      setStatus("Email is missing. Please go back to login.");
      return;
    }

    if (normalizedCode.length !== CODE_LENGTH) {
      setStatus("Please enter the 6-digit code.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Verifying...");

    try {
      const response = await apiClient.post("/auth/email/verify", {
        email,
        code: normalizedCode,
      });

      const data = response.data as { token?: string; isNewUser?: boolean };
      if (!data.token) {
        setStatus("Verification succeeded, but no token was returned.");
        return;
      }

      setAuthToken(data.token);
      void ensurePushSubscriptionForCurrentUser({
        requestPermission: true,
      });
      setStatus("");
      setPendingEmail("");
      setStoredEmail("");
      navigate(data.isNewUser ? "/basic-info" : "/conversations");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.message || error.response?.data?.error || "Verification failed.";
        setStatus(message);
        return;
      }

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
            <p style={styles.kicker}>Step 2 of 2</p>
            <span style={styles.badge}>Verify code</span>
          </div>

          <div style={styles.hero}>
            <h1 style={styles.heroTitle}>Enter the 6-digit code.</h1>
            <p style={styles.heroCopy}>
              {email
                ? `We sent the code to ${email}. Enter it here and the auth surface disappears.`
                : "Return to login, request a code, then finish the handoff here."}
            </p>
          </div>

          <div style={styles.chipRow}>
            {[
              `${normalizedCode.length}/${CODE_LENGTH} digits`,
              email ? "mailbox linked" : "mailbox missing",
              "one-time entry",
            ].map((item) => (
              <span key={item} style={styles.chip}>
                {item}
              </span>
            ))}
          </div>

          <div style={styles.divider} />

          <div style={styles.signalRow}>
            <PretextSignalPanel
              progress={codeProgress}
              compact={compact}
              heading={normalizedCode.length === CODE_LENGTH ? "All digits are present. Ready to enter." : "Waiting for the full 6-digit code."}
              caption={
                email
                  ? "This only needs to happen once. After verification, you go straight to your conversations."
                  : "The route is incomplete without the email from step one."
              }
            />
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="code">
              Verification code
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
              <PretextMessageDeck
                compact={compact}
                pointer={pointer}
                emailLocal={emailParts[0] || ""}
                emailDomain={emailParts[1] || ""}
              />
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
