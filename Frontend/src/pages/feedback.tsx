import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "../config";
import { hydrateProfileUser, type ProfileRouteState } from "../utils/profileUser";
import "./feedback.css";

const FeedbackPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const user = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  const handleBack = () => {
    navigate(routeState?.returnTo ?? "/profile", { replace: true });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      setStatus(t("feedback.messageRequired"));
      return;
    }

    setIsSending(true);
    setStatus("");
    try {
      const response = await fetch(`${BACKEND_URL}/profile/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ message: trimmedMessage }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        setStatus(data.message || data.error || t("feedback.sendFailed"));
        return;
      }

      setMessage("");
      setShowSuccessDialog(true);
    } catch {
      setStatus(t("common.connectionError"));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="feedback-shell">
      <main className="feedback-page">
        <header className="feedback-nav">
          <button type="button" className="feedback-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            {t("common.back")}
          </button>
        </header>

        <section className="feedback-header">
          <p className="feedback-eyebrow">{t("feedback.title")}</p>
          <h1>{t("feedback.heading")}</h1>
          <p>{t("feedback.subtitle")}</p>
        </section>

        <section className="feedback-thread" aria-label={t("feedback.threadLabel")}>
          <div className="feedback-bubble feedback-bubble-system">
            <span>{t("feedback.destinationLabel")}</span>
            <strong>{t("feedback.destinationEmail")}</strong>
          </div>
          <div className="feedback-bubble feedback-bubble-user">
            <span>{user?.name || user?.cleanId || t("common.user")}</span>
            <strong>{message.trim() || t("feedback.draftPlaceholder")}</strong>
          </div>
        </section>

        <form className="feedback-composer" onSubmit={handleSubmit}>
          <label htmlFor="feedback-message">{t("feedback.messageLabel")}</label>
          <textarea
            id="feedback-message"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("feedback.messagePlaceholder")}
            maxLength={1200}
            disabled={isSending}
          />
          <div className="feedback-composer-actions">
            <span>{t("feedback.characterCount", { count: message.trim().length })}</span>
            <button type="submit" disabled={isSending || message.trim().length === 0}>
              {isSending ? t("feedback.sending") : t("feedback.send")}
            </button>
          </div>
        </form>

        {status && (
          <p className="feedback-status" role="status">
            {status}
          </p>
        )}
      </main>

      {showSuccessDialog && (
        <div className="feedback-dialog-layer" role="presentation">
          <div
            className="feedback-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-dialog-title"
          >
            <p className="feedback-eyebrow">{t("feedback.sentEyebrow")}</p>
            <h2 id="feedback-dialog-title">{t("feedback.sentTitle")}</h2>
            <p>{t("feedback.sentCopy")}</p>
            <button type="button" onClick={() => setShowSuccessDialog(false)}>
              {t("common.close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeedbackPage;
