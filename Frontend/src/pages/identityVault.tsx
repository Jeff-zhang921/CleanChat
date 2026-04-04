import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AVATAR_TIER_ORDER,
  buildDerivedAvatarAccess,
  getAvatarOptionsByTier,
  getAvatarToneClass,
  getAvatarUrl,
  isAvatarUnlocked,
  type AvatarKey,
  type AvatarTier,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { validateShortClaimInput } from "../utils/cleanIdClaim";
import { FALLBACK_CLEAN_ID_TRUST } from "../utils/cleanIdTrust";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";
import "./identityVault.css";

const EXIT_MS = 260;

const IdentityVaultPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const backTarget = routeState?.returnTo ?? "/profile";

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [cleanId, setCleanId] = useState(seededUser?.cleanId ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(seededUser?.avatar ?? "AVATAR_LEO");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const cleanIdFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    setCleanId(user.cleanId ?? "");
    setAvatar(user.avatar ?? "AVATAR_LEO");
  }, [user]);

  useEffect(() => {
    if (seededUser) {
      return;
    }

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
          setStatus(t("identityVault.loadFailed"));
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
  }, [navigate, seededUser, t]);

  useEffect(() => {
    if (!routeState?.focusClaim || !user) return;

    const timer = window.setTimeout(() => {
      cleanIdFieldRef.current?.focus();
      cleanIdFieldRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 140);

    return () => {
      window.clearTimeout(timer);
    };
  }, [routeState?.focusClaim, user]);

  const normalizedCleanId = useMemo(() => cleanId.trim().toLowerCase(), [cleanId]);
  const activeTrust = user?.trust ?? FALLBACK_CLEAN_ID_TRUST;
  const avatarAccess =
    user?.avatarAccess ??
    buildDerivedAvatarAccess({
      trust: activeTrust,
      currentAvatar: user?.avatar,
    });
  const getTierCopy = (tier: AvatarTier) => ({
    eyebrow: t(`identityVault.avatarTiers.${tier}.eyebrow`),
    title: t(`identityVault.avatarTiers.${tier}.title`),
    description: t(`identityVault.avatarTiers.${tier}.description`),
    lockedHint: t(`identityVault.avatarTiers.${tier}.lockedHint`),
  });
  const avatarSections = AVATAR_TIER_ORDER.map((tier) => ({
    tier,
    access: avatarAccess.tiers[tier],
    options: getAvatarOptionsByTier(tier).map((item) => ({
      ...item,
      unlocked: isAvatarUnlocked(item.key, avatarAccess),
      isSelected: avatar === item.key,
      isCurrent: user?.avatar === item.key,
    })),
  }));
  const currentTierTitle = getTierCopy(avatarAccess.currentTier).title;
  const activeShortIdClaim = user?.shortIdClaim;
  const shortClaimRangeLabel = activeShortIdClaim
    ? activeShortIdClaim.minClaimLength && activeShortIdClaim.maxClaimLength
      ? t("identityVault.claimRange", {
          min: activeShortIdClaim.minClaimLength,
          max: activeShortIdClaim.maxClaimLength,
        })
      : t("identityVault.standardClaimRange", {
          min: activeShortIdClaim.minStandardLength,
        })
    : t("identityVault.standardClaimRange", { min: 5 });
  const liveCleanIdValidation =
    user && activeShortIdClaim
      ? validateShortClaimInput({
          cleanId: normalizedCleanId,
          currentCleanId: user.cleanId,
          claim: activeShortIdClaim,
        })
      : null;
  const currentCleanIdValue =
    normalizedCleanId || cleanId.trim() || user?.cleanId || t("profile.handleFallback");
  const cleanIdLength = currentCleanIdValue.length;
  const cleanIdIntent =
    cleanIdLength > 0 && cleanIdLength <= 2
      ? t("profile.cleanIdIntentUltraShort")
      : cleanIdLength > 0 && cleanIdLength <= 4
        ? t("profile.cleanIdIntentShort")
        : t("profile.cleanIdIntentStandard");
  const trustToneLabel =
    activeTrust.band === "clear"
      ? t("profile.trustToneClear")
      : activeTrust.band === "steady"
        ? t("profile.trustToneSteady")
        : activeTrust.band === "fragile"
          ? t("profile.trustToneFragile")
          : t("profile.trustToneBlurred");
  const claimDetailText = liveCleanIdValidation
    ? t("identityVault.cleanIdValidation")
    : activeShortIdClaim?.state === "locked"
      ? t("identityVault.claimDetailLocked")
      : activeShortIdClaim?.state === "claimable"
        ? t("identityVault.claimDetailClaimable")
        : t("identityVault.claimDetailClaimed");

  const ledgerRows = useMemo(() => {
    if (!user) return [];
    return [
      {
        label: t("identityVault.activeSpan"),
        value:
          user.trust.metrics.accountAgeDays > 0
            ? t("identityVault.days", { count: user.trust.metrics.accountAgeDays })
            : t("identityVault.bornToday"),
      },
      {
        label: t("identityVault.quietRecord"),
        value:
          user.trust.metrics.moderationPenalties === 0
            ? t("identityVault.noDisturbanceMarks")
            : t("identityVault.moderationMarks", {
                count: user.trust.metrics.moderationPenalties,
              }),
      },
      {
        label: t("identityVault.encryptionKeys"),
        value: currentTierTitle,
      },
      {
        label: t("identityVault.claimWindow"),
        value: shortClaimRangeLabel,
      },
    ];
  }, [currentTierTitle, shortClaimRangeLabel, t, user]);

  const leave = (nextUser?: ProfileUser | null) => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
        returnTo: backTarget === "/profile/purity" ? "/profile" : undefined,
      };
      if (nextUser) {
        nextState.user = nextUser;
      }
      navigate(backTarget, { state: nextState });
    }, EXIT_MS);
  };

  const handleBack = () => {
    if (isSaving) return;
    leave(user);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !activeShortIdClaim) return;

    if (!normalizedCleanId) {
      setStatus(t("identityVault.cleanIdRequired"));
      return;
    }

    if (liveCleanIdValidation) {
      setStatus(t("identityVault.cleanIdValidation"));
      return;
    }

    const cleanIdChanged = normalizedCleanId !== user.cleanId;
    const avatarChanged = avatar !== user.avatar;

    if (!cleanIdChanged && !avatarChanged) {
      setStatus(t("identityVault.nothingChanged"));
      return;
    }

    setIsSaving(true);
    setStatus(t("identityVault.savingStatus"));

    let nextUser = user;

    try {
      if (cleanIdChanged) {
        const cleanIdResponse = await fetch(`${BACKEND_URL}/profile/clean-id`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cleanId: normalizedCleanId }),
        });
        const cleanIdRaw = await cleanIdResponse.text();
        let cleanIdData: Record<string, string> = {};
        if (cleanIdRaw) {
          try {
            cleanIdData = JSON.parse(cleanIdRaw) as Record<string, string>;
          } catch {
            cleanIdData = {};
          }
        }
        if (!cleanIdResponse.ok) {
          setStatus(
            cleanIdData.error ||
              cleanIdData.message ||
              cleanIdData.details ||
              cleanIdRaw ||
              t("identityVault.cleanIdUpdateFailed")
          );
          return;
        }

        nextUser = hydrateProfileUser({
          ...nextUser,
          cleanId: normalizedCleanId,
        });
      }

      if (avatarChanged) {
        const profileResponse = await fetch(`${BACKEND_URL}/profile/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            avatar,
          }),
        });
        const profileRaw = await profileResponse.text();
        let profileData: { user?: ProfileUser; error?: string; message?: string; details?: string } = {};
        if (profileRaw) {
          try {
            profileData = JSON.parse(profileRaw) as typeof profileData;
          } catch {
            profileData = { message: profileRaw };
          }
        }
        if (!profileResponse.ok) {
          setStatus(
            profileData.error ||
              profileData.message ||
              profileData.details ||
              t("identityVault.avatarUpdateFailed")
          );
          return;
        }

        nextUser = hydrateProfileUser(
          profileData.user ?? {
            ...nextUser,
            avatar,
          }
        );
      }

      setUser(nextUser);
      setStatus(t("identityVault.updated"));
    } catch {
      setStatus(t("identityVault.connectionError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="identity-vault-shell">
        <main className="identity-vault-page">
          <header className="identity-vault-nav">
            <button type="button" className="identity-vault-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>{t("common.back")}</span>
            </button>
          </header>
          <p className="identity-vault-loading">{t("identityVault.loading")}</p>
        </main>
      </div>
    );
  }

  if (!user || !activeShortIdClaim) {
    return (
      <div className="identity-vault-shell">
        <main className="identity-vault-page">
          <header className="identity-vault-nav">
            <button type="button" className="identity-vault-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>{t("common.back")}</span>
            </button>
          </header>
          <p className="identity-vault-loading">{t("identityVault.unavailable")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`identity-vault-shell identity-vault-shell-${activeTrust.band} ${isLeaving ? "is-leaving" : ""}`}>
      <main className="identity-vault-page">
        <header className="identity-vault-nav">
          <button
            type="button"
            className="identity-vault-back-button"
            onClick={handleBack}
            disabled={isSaving}
          >
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className={`identity-vault-hero identity-vault-hero-${activeTrust.band}`}>
          <div className="identity-vault-hero-main">
            <div className="identity-vault-avatar-frame">
              <img
                className={getAvatarToneClass(avatar)}
                src={getAvatarUrl(avatar)}
                alt={t("profile.avatarAlt", {
                  name: user.name || t("common.user"),
                })}
              />
            </div>
            <div className="identity-vault-copy">
              <p className="identity-vault-eyebrow">{t("identityVault.vault")}</p>
              <h1>{t("identityVault.heroTitle")}</h1>
              <p>{t("identityVault.heroCopy")}</p>
            </div>
          </div>
          <div className="identity-vault-meta">
            <span>@{currentCleanIdValue}</span>
            <span>{currentTierTitle}</span>
            <span>{trustToneLabel}</span>
            <span>{shortClaimRangeLabel}</span>
          </div>
        </section>

        <section className="identity-vault-layout">
          <form className="identity-vault-form" onSubmit={handleSave}>
            <section className={`identity-vault-claim identity-vault-claim-${activeShortIdClaim.tier}`}>
              <div className="identity-vault-section-head">
                <p className="identity-vault-eyebrow">{t("identityVault.shortClaimEyebrow")}</p>
                <h2>{t("identityVault.shortClaimTitle")}</h2>
                <p>
                  {t("identityVault.shortClaimCopy", {
                    range: shortClaimRangeLabel,
                    min: activeShortIdClaim.minStandardLength,
                  })}
                </p>
              </div>

              <label className="identity-vault-field" htmlFor="vault-clean-id">
                <span className="identity-vault-field-label">{t("identityVault.identityHandle")}</span>
                <input
                  ref={cleanIdFieldRef}
                  className="identity-vault-input"
                  id="vault-clean-id"
                  type="text"
                  value={cleanId}
                  onChange={(event) => setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  maxLength={20}
                  required
                />
              </label>

              <div className="identity-vault-claim-preview">
                <span className={`identity-vault-token identity-vault-token-${activeShortIdClaim.tier}`}>@{currentCleanIdValue}</span>
                <div className="identity-vault-claim-copy">
                  <strong>{t("profile.handleLabel", { intent: cleanIdIntent })}</strong>
                  <span>{claimDetailText}</span>
                </div>
              </div>
            </section>

            <fieldset className="profile-avatars identity-vault-library">
              <legend>{t("identityVault.avatarLibrary")}</legend>
              <div className="profile-avatar-head">
                <p className="profile-hint">
                  {t("identityVault.avatarLibraryNote")}
                </p>
                <span className="profile-avatar-current-pill">{currentTierTitle}</span>
              </div>

              <div className="profile-avatar-sections">
                {avatarSections.map((section) => (
                  <section
                    key={section.tier}
                    className={`profile-avatar-tier profile-avatar-tier-${section.tier} ${section.access.unlocked ? "open" : "locked"}`}
                  >
                    <div className="profile-avatar-tier-head">
                      <div>
                        <p className="profile-settings-eyebrow">{getTierCopy(section.tier).eyebrow}</p>
                        <h4>{getTierCopy(section.tier).title}</h4>
                        <p className="profile-hint">
                          {section.access.unlocked
                            ? getTierCopy(section.tier).description
                            : getTierCopy(section.tier).lockedHint}
                        </p>
                      </div>
                      <span className={`profile-avatar-tier-pill ${section.access.unlocked ? "open" : "locked"}`}>
                        {section.access.unlocked
                          ? t("identityVault.unlock")
                          : t("identityVault.lockedForNow")}
                      </span>
                    </div>
                    <div className="profile-avatar-grid">
                      {section.options.map((item) => (
                        <label
                          key={item.key}
                          className={`profile-avatar-option ${item.isSelected ? "active" : ""} ${item.unlocked ? "" : "locked"} ${item.isCurrent ? "current" : ""}`}
                        >
                          <input
                            type="radio"
                            name="avatar"
                            value={item.key}
                            checked={avatar === item.key}
                            onChange={() => setAvatar(item.key)}
                            disabled={!item.unlocked}
                          />
                          <img className={getAvatarToneClass(item.key)} src={item.url} alt={item.label} />
                          <span>{item.label}</span>
                          <em>
                            {item.unlocked
                              ? item.isCurrent
                                ? t("identityVault.currentMark")
                                : t("identityVault.availableNow")
                              : t("identityVault.lockedForNow")}
                          </em>
                        </label>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </fieldset>

            <div className="identity-vault-actions">
              <button
                type="button"
                className="identity-vault-action identity-vault-action-secondary"
                onClick={handleBack}
                disabled={isSaving}
              >
                {t("common.close")}
              </button>
              <button
                type="submit"
                className="identity-vault-action identity-vault-action-primary"
                disabled={isSaving || Boolean(liveCleanIdValidation)}
              >
                {isSaving ? t("identityVault.saving") : t("identityVault.saveIdentity")}
              </button>
            </div>

            {status && (
              <p className="identity-vault-status" role="status">
                {status}
              </p>
            )}
          </form>

          <aside className="identity-vault-ledger">
            <div className="identity-vault-section-head">
              <p className="identity-vault-eyebrow">{t("identityVault.secureStorage")}</p>
              <h2>{t("identityVault.storedSignal")}</h2>
              <p>{t("identityVault.storedSignalCopy")}</p>
            </div>
            <div className="identity-vault-ledger-list">
              {ledgerRows.map((row) => (
                <article key={row.label} className="identity-vault-ledger-item">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </article>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default IdentityVaultPage;
