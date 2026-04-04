import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { useTranslation } from "react-i18next";
import { apiClient } from "../utils/apiClient";
import { setAuthToken } from "../utils/auth";
import { ensurePushSubscriptionForCurrentUser } from "../utils/notifications";
import "./verify.css";

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
    <main className="verify-page">
      <form onSubmit={handleSubmit} className="verify-form">
        <h1 className="verify-title">{t("auth.enterSixDigitCodeTitle")}</h1>
        <p className="verify-copy">
          {email ? t("auth.codeSentTo", { email }) : t("auth.returnLoginForCode")}
        </p>

        <label className="verify-label" htmlFor="code">
          {t("auth.verificationCode")}
        </label>
        <input
          className="verify-input"
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={CODE_LENGTH}
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder={t("auth.codePlaceholder")}
          required
        />

        <button className="verify-primary" type="submit" disabled={isSubmitting || !email}>
          {isSubmitting ? t("auth.verifying") : t("auth.enterCleanChat")}
        </button>
      </form>

      <button className="verify-secondary" type="button" onClick={() => navigate("/login")}>
        {t("auth.backToLogin")}
      </button>

      {status && (
        <p className="verify-status" role="status">
          {status}
        </p>
      )}
    </main>
  );
};

export default VerifyPage;
