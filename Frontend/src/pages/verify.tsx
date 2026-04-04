import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import {
  resolveSupportedLanguage,
  setPreferredLanguage,
  type SupportedLanguage,
} from "../i18n";
import { apiClient } from "../utils/apiClient";
import { setAuthToken } from "../utils/auth";
import { ensurePushSubscriptionForCurrentUser } from "../utils/notifications";
import {
  AuthLanguageSwitch,
  getPretextAuthStyles,
  usePretextCompact,
  usePretextPointer,
} from "./login";

const CODE_LENGTH = 6;
const PENDING_EMAIL_KEY = "cleanchat:pending-email";

type VerifyLocationState = {
  email?: string;
} | null;

type VerifyErrorResponse = {
  errorCode?: string;
};

const VERIFY_ERROR_TRANSLATION_KEYS = {
  AUTH_INVALID_EMAIL: "auth.invalidEmail",
  AUTH_INVALID_CODE: "auth.enterSixDigitCode",
  AUTH_INVALID_OR_EXPIRED_CODE: "auth.invalidOrExpiredCode",
  AUTH_TOO_MANY_ATTEMPTS: "auth.tooManyAttempts",
  AUTH_EMAIL_LOGIN_NOT_CONFIGURED: "auth.emailLoginUnavailable",
  AUTH_VERIFICATION_FAILED: "auth.verifyFailed",
} as const;

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
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const emailFromState = ((location.state as VerifyLocationState)?.email || "").trim().toLowerCase();
  const compact = usePretextCompact();
  const { pointer, bindings } = usePretextPointer();
  const [storedEmail, setStoredEmail] = useState(() => getPendingEmail());
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const currentLanguage = resolveSupportedLanguage(i18n.language);

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

  const resolveVerifyStatus = (errorCode?: string) => {
    const translationKey =
      (errorCode && VERIFY_ERROR_TRANSLATION_KEYS[errorCode as keyof typeof VERIFY_ERROR_TRANSLATION_KEYS]) ||
      "auth.verifyFailed";

    return t(translationKey);
  };

  const handleLanguageSwitch = (language: SupportedLanguage) => {
    if (language === currentLanguage) {
      return;
    }

    void setPreferredLanguage(language);
  };

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
        const responseData = error.response?.data as VerifyErrorResponse | undefined;
        setStatus(resolveVerifyStatus(responseData?.errorCode));
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
          <div style={styles.topRow}>
            <p style={styles.kicker}>{t("auth.stepTwoOfTwo")}</p>
            <span style={styles.utilityRow}>
              <AuthLanguageSwitch
                currentLanguage={currentLanguage}
                onLanguageSwitch={handleLanguageSwitch}
                styles={styles}
              />
            </span>
          </div>

          <div style={styles.hero}>
            <h1 style={styles.heroTitle}>{t("auth.enterSixDigitCodeTitle")}</h1>
            <p style={styles.heroCopy}>
              {email ? t("auth.codeSentTo", { email }) : t("auth.returnLoginForCode")}
            </p>
          </div>

          <div style={styles.divider} />

          <p style={{ ...styles.note, position: "relative", zIndex: 1 }}>
            {email ? t("auth.verifyOnceOnly") : t("auth.returnLoginForCode")}
          </p>

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

            <p style={styles.note}>
              {email ? t("auth.codeSentTo", { email }) : t("auth.routeIncomplete")}
            </p>

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
