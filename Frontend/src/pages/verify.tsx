import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { apiClient } from "../utils/apiClient";
import { setAuthToken } from "../utils/auth";
import { ensurePushSubscriptionForCurrentUser } from "../utils/notifications";
import {
  getPretextAuthStyles,
  PretextSignalPanel,
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = ((location.state as VerifyLocationState)?.email || "").trim().toLowerCase();
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();
  const [storedEmail, setStoredEmail] = useState(() => getPendingEmail());
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!emailFromState || emailFromState === storedEmail) {
      return;
    }

    setPendingEmail(emailFromState);
    setStoredEmail(emailFromState);
  }, [emailFromState, storedEmail]);

  const email = emailFromState || storedEmail;
  const normalizedCode = code.trim();
  const styles = getPretextAuthStyles(compact, pointer);
  const codeDigitCount = normalizedCode.length;
  const codeProgress = Math.min(1, codeDigitCount / CODE_LENGTH);
  const hasCompleteCode = codeDigitCount === CODE_LENGTH;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!email) {
      setStatus(t("auth.emailMissing"));
      return;
    }

    if (normalizedCode.length !== CODE_LENGTH) {
      setStatus(t("auth.enterSixDigitCode"));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("auth.verifying"));

    try {
      const response = await apiClient.post("/auth/email/verify", {
        email,
        code: normalizedCode,
      });

      const data = response.data as { token?: string; isNewUser?: boolean };
      if (!data.token) {
        setStatus(t("auth.verifyTokenMissing"));
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
        const message = error.response?.data?.message || error.response?.data?.error || t("auth.verifyFailed");
        setStatus(message);
        return;
      }

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
            <p style={styles.kicker}>{t("auth.stepTwoOfTwo")}</p>
            <span style={styles.badge}>{t("auth.verifyCode")}</span>
          </div>

          <div style={styles.hero}>
            <h1 style={styles.heroTitle}>{t("auth.enterSixDigitCodeTitle")}</h1>
            <p style={styles.heroCopy}>
              {email ? t("auth.codeSentTo", { email }) : t("auth.returnLoginForCode")}
            </p>
          </div>

          <div style={styles.signalRow}>
            <PretextSignalPanel
              progress={codeProgress}
              compact={compact}
              heading={hasCompleteCode ? t("auth.allDigitsReady") : t("auth.waitingFullCode")}
              caption={t("auth.verifyOnceOnly")}
            />
          </div>

          <form onSubmit={handleSubmit} style={styles.form}>
            <label style={styles.label} htmlFor="code">
              {t("auth.verificationCode")}
            </label>
            <input
              style={styles.input}
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D+/g, "").slice(0, CODE_LENGTH))
              }
              placeholder={t("auth.codePlaceholder")}
              required
            />

            <div style={styles.helperRow}>
              <span style={styles.helperPill}>
                {t("auth.codeDigitsProgress", {
                  current: codeDigitCount,
                  total: CODE_LENGTH,
                })}
              </span>
              <span style={styles.helperPill}>
                {email ? t("auth.mailboxLinked") : t("auth.mailboxMissing")}
              </span>
              <span style={styles.helperPill}>{t("auth.oneTimeEntry")}</span>
            </div>

            {!email && <p style={styles.note}>{t("auth.routeIncomplete")}</p>}

            <button
              style={{
                ...styles.primaryButton,
                opacity: isSubmitting || !email ? 0.72 : 1,
              }}
              type="submit"
              disabled={isSubmitting || !email}
            >
              {isSubmitting ? t("auth.verifying") : t("auth.enterCleanChat")}
            </button>
          </form>

          <button
            style={{ ...styles.secondaryButton, opacity: isSubmitting ? 0.72 : 1 }}
            type="button"
            onClick={() => navigate("/login")}
            disabled={isSubmitting}
          >
            {t("auth.backToLogin")}
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
