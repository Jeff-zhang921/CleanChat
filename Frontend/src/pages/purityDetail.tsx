import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getAvatarToneClass, getAvatarUrl } from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { getShortClaimRangeLabel } from "../utils/cleanIdClaim";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./purityDetail.css";

const EXIT_MS = 260;

const getTrustBandLabel = (
  band: ProfileUser["trust"]["band"],
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  if (band === "clear") return t("purityDetail.trustToneClear");
  if (band === "steady") return t("purityDetail.trustToneSteady");
  if (band === "fragile") return t("purityDetail.trustToneFragile");
  return t("purityDetail.trustToneBlurred");
};

const getPurityMaterialLabel = (
  band: ProfileUser["trust"]["band"],
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  if (band === "clear") return t("purityDetail.materialClear");
  if (band === "steady") return t("purityDetail.materialSteady");
  return t("purityDetail.materialDefault");
};

const getPurityTextureNarrative = (
  band: ProfileUser["trust"]["band"],
  t: (key: string, options?: Record<string, unknown>) => string
) => {
  if (band === "clear") {
    return t("purityDetail.textureNarrativeClear");
  }
  if (band === "steady") {
    return t("purityDetail.textureNarrativeSteady");
  }
  if (band === "fragile") {
    return t("purityDetail.textureNarrativeFragile");
  }
  return t("purityDetail.textureNarrativeBlurred");
};

const PurityDetailPage = () => {
  const { t } = useTranslation();
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
          setStatus(t("purityDetail.loadFailed"));
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
  }, [navigate, t]);

  const handleBack = () => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
        returnTo: routeState?.returnTo ?? "/profile",
      };
      if (user) {
        nextState.user = user;
      }
      navigate(routeState?.returnTo ?? "/profile", {
        state: nextState,
      });
    }, EXIT_MS);
  };

  const handleOpenEditProfile = () => {
    if (!user) return;
    navigate("/profile/edit", {
      state: {
        user,
        spatialTransition: "push",
        focusClaim: true,
        returnTo: "/profile/purity",
      } satisfies ProfileRouteState,
    });
  };

  const detailRows = useMemo(() => {
    if (!user) return [];

    const quietRecord =
      user.trust.metrics.moderationPenalties === 0
        ? t("purityDetail.quietRecordNone")
        : t("purityDetail.quietRecordCount", {
            count: user.trust.metrics.moderationPenalties,
          });
    const nextRefinement =
      user.trust.metrics.sustainedThreads > 1
        ? t("purityDetail.nextRefinementHold")
        : user.trust.metrics.recentMessages > 4
          ? t("purityDetail.nextRefinementDeepen")
          : t("purityDetail.nextRefinementSteadyReply");

    return [
      {
        label: t("purityDetail.labelActiveSpan"),
        value:
          user.trust.metrics.accountAgeDays > 0
            ? t("purityDetail.valueDays", { count: user.trust.metrics.accountAgeDays })
            : t("purityDetail.valueBornToday"),
      },
      {
        label: t("purityDetail.labelStableLines"),
        value: t("purityDetail.valueLongThreads", {
          count: user.trust.metrics.sustainedThreads,
        }),
      },
      {
        label: t("purityDetail.labelQuietRecord"),
        value: quietRecord,
      },
      {
        label: t("purityDetail.labelRecentCadence"),
        value: t("purityDetail.valueReplies30d", {
          count: user.trust.metrics.recentMessages,
        }),
      },
      {
        label: t("purityDetail.labelDirectReach"),
        value: t("purityDetail.valueLiveContacts", {
          count: user.trust.metrics.directThreads,
        }),
      },
      {
        label: t("purityDetail.labelNextRefinement"),
        value: nextRefinement,
      },
    ];
  }, [user, t]);

  const resonanceCopy = useMemo(() => {
    if (!user) {
      return {
        statement: t("purityDetail.resonanceStatementDefault"),
        note: "",
      };
    }

    const claim = user.shortIdClaim;
    if (claim.isCurrentShort) {
      return {
        statement: t("purityDetail.resonanceStatementCurrent"),
        note: t("purityDetail.resonanceNoteCurrent", {
          range: getShortClaimRangeLabel(claim),
          scarcity: claim.scarcity,
        }),
      };
    }

    if (claim.tier === "locked" && claim.nextUnlockScore) {
      return {
        statement: t("purityDetail.resonanceStatementLocked"),
        note: t("purityDetail.resonanceNoteLocked", {
          score: claim.nextUnlockScore,
          detail: claim.detail,
        }),
      };
    }

    return {
      statement: t("purityDetail.resonanceStatementDefault"),
      note: t("purityDetail.resonanceNoteOpen", {
        range: getShortClaimRangeLabel(claim),
        detail: claim.detail,
      }),
    };
  }, [user, t]);

  if (loading && !user) {
    return (
      <div className="purity-detail-shell purity-detail-shell-loading">
        <main className="purity-detail-page">
          <button type="button" className="purity-back-button" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="purity-loading">{t("purityDetail.loadingSpace")}</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="purity-detail-shell purity-detail-shell-loading">
        <main className="purity-detail-page">
          <button type="button" className="purity-back-button" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="purity-loading">{t("purityDetail.unavailable")}</p>
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
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className={`purity-detail-hero purity-detail-hero-${user.trust.band}`}>
          <div className="purity-detail-avatar-wrap">
            <img
              className={getAvatarToneClass(user.avatar)}
              src={getAvatarUrl(user.avatar)}
              alt={t("purityDetail.avatarAlt", {
                name: user.name || t("common.user"),
              })}
            />
          </div>
          <div className="purity-detail-copy">
            <p className="purity-detail-eyebrow">{t("purityDetail.identityPurity")}</p>
            <h1>{user.trust.title}</h1>
            <p className="purity-detail-summary">{user.trust.summary}</p>
            <div className="purity-detail-meta">
              <span>@{user.cleanId}</span>
              <span>{getTrustBandLabel(user.trust.band, t)}</span>
              <span>{t("purityDetail.signalValue", { score: user.trust.score })}</span>
              <span>{getPurityMaterialLabel(user.trust.band, t)}</span>
            </div>
          </div>
        </section>

        <section className="purity-detail-note">
          <p>{getPurityTextureNarrative(user.trust.band, t)}</p>
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
            <p className="purity-detail-eyebrow">{t("purityDetail.reading")}</p>
            <h2>{t("purityDetail.surfaceFormation")}</h2>
          </div>
          <div className="purity-detail-ledger-list">
            <div className="purity-detail-ledger-item">
              <span>{t("purityDetail.material")}</span>
              <strong>{getPurityMaterialLabel(user.trust.band, t)}</strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>{t("purityDetail.signalState")}</span>
              <strong>{getTrustBandLabel(user.trust.band, t)}</strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>{t("purityDetail.whatSharpens")}</span>
              <strong>
                {user.trust.metrics.sustainedThreads > 1
                  ? t("purityDetail.sharpensLongThreads")
                  : user.trust.metrics.recentMessages > 4
                    ? t("purityDetail.sharpensSteadyBackAndForth")
                    : t("purityDetail.sharpensGentleCadence")}
              </strong>
            </div>
            <div className="purity-detail-ledger-item">
              <span>{t("purityDetail.whatBlurs")}</span>
              <strong>
                {user.trust.metrics.moderationPenalties === 0
                  ? t("purityDetail.blursFutureSpam")
                  : t("purityDetail.blursExistingMarks")}
              </strong>
            </div>
          </div>
        </section>

        <section className="purity-detail-resonance" aria-labelledby="identity-resonance-title">
          <div className="purity-detail-resonance-copy">
            <p className="purity-detail-eyebrow">{t("purityDetail.identityResonance")}</p>
            <h2 id="identity-resonance-title">{t("purityDetail.resonanceTitle")}</h2>
          </div>
          <div className="purity-detail-resonance-line">
            <p>{resonanceCopy.statement}</p>
            <button type="button" className="purity-resonance-cta" onClick={handleOpenEditProfile}>
              {t("profile.editProfile")}
            </button>
          </div>
          <p className="purity-detail-resonance-note">{resonanceCopy.note}</p>
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
