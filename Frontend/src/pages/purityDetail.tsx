import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { getAvatarUrl } from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { getTrustToneLabel } from "../utils/cleanIdTrust";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./purityDetail.css";

const EXIT_MS = 260;

const getPurityMaterialLabel = (user: ProfileUser) => {
  if (user.trust.band === "clear") return "Crystal depth";
  if (user.trust.band === "steady") return "Frosted glass";
  return "Matte paper";
};

const getPurityTextureNarrative = (user: ProfileUser) => {
  if (user.trust.band === "clear") {
    return "Your signal holds depth, memory, and light without looking loud.";
  }
  if (user.trust.band === "steady") {
    return "Your signal reads calm and verified, like acrylic catching light without noise.";
  }
  if (user.trust.band === "fragile") {
    return "The surface is readable, but it still feels soft and sketch-like around the edges.";
  }
  return "The surface is intentionally quiet. More healthy conversation will make it settle.";
};

const PurityDetailPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const [user, setUser] = useState<ProfileUser | null>(
    routeState?.user ? hydrateProfileUser(routeState.user) : null
  );
  const [loading, setLoading] = useState(!routeState?.user);
  const [status, setStatus] = useState("");
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/profile/me`, {
          credentials: "include",
        });
        if (!response.ok) {
          navigate("/login", { replace: true });
          return;
        }
        const data = (await response.json()) as { user?: ProfileUser };
        if (!isMounted || !data.user) return;
        setUser(hydrateProfileUser(data.user));
      } catch {
        if (isMounted) {
          setStatus("Unable to load purity details.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleBack = () => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      navigate("/profile", {
        state: {
          spatialTransition: "pop",
        } satisfies ProfileRouteState,
      });
    }, EXIT_MS);
  };

  const detailRows = useMemo(() => {
    if (!user) return [];

    const quietRecord =
      user.trust.metrics.moderationPenalties === 0
        ? "No disturbance marks"
        : `${user.trust.metrics.moderationPenalties} moderation marks`;
    const nextRefinement =
      user.trust.metrics.sustainedThreads > 1
        ? "Hold the same calm cadence"
        : user.trust.metrics.recentMessages > 4
          ? "Let more threads deepen"
          : "Reply with steadier rhythm";

    return [
      {
        label: "Active span",
        value:
          user.trust.metrics.accountAgeDays > 0
            ? `${user.trust.metrics.accountAgeDays} days`
            : "Born today",
      },
      {
        label: "Stable lines",
        value: `${user.trust.metrics.sustainedThreads} long threads`,
      },
      {
        label: "Quiet record",
        value: quietRecord,
      },
      {
        label: "Recent cadence",
        value: `${user.trust.metrics.recentMessages} replies / 30d`,
      },
      {
        label: "Direct reach",
        value: `${user.trust.metrics.directThreads} live contacts`,
      },
      {
        label: "Next refinement",
        value: nextRefinement,
      },
    ];
  }, [user]);

  if (loading && !user) {
    return (
      <div className="purity-detail-shell purity-detail-shell-loading">
        <main className="purity-detail-page">
          <button type="button" className="purity-back-button" onClick={handleBack}>
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
          <p className="purity-loading">Loading purity space...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="purity-detail-shell purity-detail-shell-loading">
        <main className="purity-detail-page">
          <button type="button" className="purity-back-button" onClick={handleBack}>
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
          <p className="purity-loading">Purity detail unavailable.</p>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`purity-detail-shell purity-detail-shell-${user.trust.band} ${isLeaving ? "is-leaving" : ""}`}
    >
      <main className="purity-detail-page">
        <header className="purity-detail-nav">
          <button type="button" className="purity-back-button" onClick={handleBack}>
            <span aria-hidden="true">←</span>
            <span>Back</span>
          </button>
        </header>

        <section className={`purity-detail-hero purity-detail-hero-${user.trust.band}`}>
          <div className="purity-detail-avatar-wrap">
            <img src={getAvatarUrl(user.avatar)} alt={`${user.name || "User"} avatar`} />
          </div>
          <div className="purity-detail-copy">
            <p className="purity-detail-eyebrow">Identity purity</p>
            <h1>{user.trust.title}</h1>
            <p className="purity-detail-summary">{user.trust.summary}</p>
            <div className="purity-detail-meta">
              <span>@{user.cleanId}</span>
              <span>{getTrustToneLabel(user.trust)}</span>
              <span>{user.trust.score} signal</span>
              <span>{getPurityMaterialLabel(user)}</span>
            </div>
          </div>
        </section>

        <section className="purity-detail-note">
          <p>{getPurityTextureNarrative(user)}</p>
          <span>{user.trust.detail}</span>
        </section>

        <section className="purity-detail-grid">
          {detailRows.map((row) => (
            <article key={row.label} className="purity-detail-cell">
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </article>
          ))}
        </section>

        <section className="purity-detail-ledger">
          <div className="purity-detail-ledger-copy">
            <p className="purity-detail-eyebrow">Reading</p>
            <h2>How this surface is formed</h2>
          </div>
          <div className="purity-detail-ledger-list">
            <div className="purity-detail-ledger-item">
              <span>Material</span>
              <strong>{getPurityMaterialLabel(user)}</strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>Signal state</span>
              <strong>{getTrustToneLabel(user.trust)}</strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>What sharpens it</span>
              <strong>
                {user.trust.metrics.sustainedThreads > 1
                  ? "Longer calm threads"
                  : user.trust.metrics.recentMessages > 4
                    ? "Steady back-and-forth"
                    : "Gentle healthy cadence"}
              </strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>What would blur it</span>
              <strong>
                {user.trust.metrics.moderationPenalties === 0
                  ? "Future spam or blocks"
                  : "Existing moderation marks"}
              </strong>
            </div>
          </div>
        </section>

        {status && (
          <p className="purity-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default PurityDetailPage;
