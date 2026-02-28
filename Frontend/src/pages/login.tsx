import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";
import "./login.css";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const normalizedEmail = useMemo(() => email.trim().toLowerCase(), [email]);

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

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 429) {
          navigate("/verify", { state: { email: normalizedEmail } });
          return;
        }
        setStatus(data.message || data.error || "Failed to send verification code.");
        return;
      }

      setStatus("");
      navigate("/verify", { state: { email: normalizedEmail } });
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
          <p className="auth-tagline">Private conversations start with one email.</p>
          <div className="auth-chip-row">
            <span className="auth-chip">Email code login</span>
            <span className="auth-chip">No password needed</span>
          </div>
        </section>

        <section className="auth-panel">
          <p className="auth-step">Step 1 of 2</p>
          <h2 className="auth-title">Sign in with email</h2>
          <p className="auth-copy">Enter your email and we will send a 6-digit code.</p>

          <form onSubmit={handleSubmit} className="auth-form">
            <label className="auth-label" htmlFor="email">
              Email
            </label>
          <input
            className="auth-input"
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

            <button className="auth-primary" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Sending..." : "Continue"}
            </button>
          </form>

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

export default LoginPage;
