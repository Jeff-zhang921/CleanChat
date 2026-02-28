import { FormEvent, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "./login.css";

const BACKEND_URL = "http://localhost:4000";
const CODE_LENGTH = 6;

type VerifyLocationState = {
  email?: string;
} | null;

const VerifyPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const email = useMemo(
    () =>
      ((location.state as VerifyLocationState)?.email || "").trim().toLowerCase(),
    [location.state]
  );
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      navigate(data.isNewUser ? "/basic-info" : "/conversations");
    } catch {
      setStatus("Unable to connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-shell">
      <main className="auth-layout">
        <section className="auth-brand">
          <p className="auth-kicker">Secure Messaging</p>
          <h1 className="auth-logo">CleanChat</h1>
          <p className="auth-tagline">You are one step away from your conversations.</p>
          <div className="auth-chip-row">
            <span className="auth-chip">6-digit verification</span>
            <span className="auth-chip">Fast sign-in</span>
          </div>
        </section>

        <section className="auth-panel">
          <p className="auth-step">Step 2 of 2</p>
          <h2 className="auth-title">Verify your code</h2>
          <p className="auth-copy">
            {email ? (
              <>
                Code sent to <span className="auth-email">{email}</span>
              </>
            ) : (
              "Return to login to request a code."
            )}
          </p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label" htmlFor="code">
              Verification Code
            </label>
          <input
            className="auth-input auth-code-input"
            id="code"
            type="text"
            inputMode="numeric"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="123456"
            required
          />

            <button className="auth-primary" type="submit" disabled={isSubmitting || !email}>
              {isSubmitting ? "Verifying..." : "Verify"}
            </button>
          </form>

          <button className="auth-secondary" type="button" onClick={() => navigate("/login")}>
            Back to login
          </button>

          {status && (
            <p className="auth-status" role="status">
              {status}
            </p>
          )}
        </section>
      </main>
    </div>
  );
};

export default VerifyPage;
