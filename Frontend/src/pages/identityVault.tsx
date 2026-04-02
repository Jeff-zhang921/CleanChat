import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AVATAR_TIER_META,
  AVATAR_TIER_ORDER,
  buildDerivedAvatarAccess,
  getAvatarOption,
  getAvatarOptionsByTier,
  getAvatarToneClass,
  getAvatarUrl,
  isAvatarUnlocked,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { getShortClaimRangeLabel, validateShortClaimInput } from "../utils/cleanIdClaim";
import { FALLBACK_CLEAN_ID_TRUST, getTrustToneLabel } from "../utils/cleanIdTrust";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";
import "./identityVault.css";

const EXIT_MS = 260;

const IdentityVaultPage = () => {
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
          setStatus("Unable to load the identity vault.");
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
  }, [navigate, seededUser]);

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
  const avatarSections = AVATAR_TIER_ORDER.map((tier) => ({
    tier,
    meta: AVATAR_TIER_META[tier],
    access: avatarAccess.tiers[tier],
    options: getAvatarOptionsByTier(tier).map((item) => ({
      ...item,
      unlocked: isAvatarUnlocked(item.key, avatarAccess),
      isSelected: avatar === item.key,
      isCurrent: user?.avatar === item.key,
    })),
  }));
  const selectedAvatarOption = getAvatarOption(avatar);
  const activeShortIdClaim = user?.shortIdClaim;
  const shortClaimRangeLabel = activeShortIdClaim ? getShortClaimRangeLabel(activeShortIdClaim) : "5-20 characters";
  const liveCleanIdValidation =
    user && activeShortIdClaim
      ? validateShortClaimInput({
          cleanId: normalizedCleanId,
          currentCleanId: user.cleanId,
          claim: activeShortIdClaim,
        })
      : null;
  const currentCleanIdValue = normalizedCleanId || cleanId.trim() || user?.cleanId || "handle";
  const cleanIdLength = currentCleanIdValue.length;
  const cleanIdIntent =
    cleanIdLength > 0 && cleanIdLength <= 2
      ? "Ultra-short"
      : cleanIdLength > 0 && cleanIdLength <= 4
        ? "Short"
        : "Standard";

  const ledgerRows = useMemo(() => {
    if (!user) return [];
    return [
      {
        label: "Active span",
        value:
          user.trust.metrics.accountAgeDays > 0
            ? `${user.trust.metrics.accountAgeDays} days`
            : "Born today",
      },
      {
        label: "Quiet record",
        value:
          user.trust.metrics.moderationPenalties === 0
            ? "No disturbance marks"
            : `${user.trust.metrics.moderationPenalties} moderation marks`,
      },
      {
        label: "Avatar tier",
        value: AVATAR_TIER_META[avatarAccess.currentTier].title,
      },
      {
        label: "Claim window",
        value: shortClaimRangeLabel,
      },
    ];
  }, [avatarAccess.currentTier, shortClaimRangeLabel, user]);

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
      setStatus("CleanID is required.");
      return;
    }

    if (liveCleanIdValidation) {
      setStatus(liveCleanIdValidation);
      return;
    }

    const cleanIdChanged = normalizedCleanId !== user.cleanId;
    const avatarChanged = avatar !== user.avatar;

    if (!cleanIdChanged && !avatarChanged) {
      setStatus("Nothing changed in the vault.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving identity vault...");

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
              "Failed to update CleanID."
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
          setStatus(profileData.error || profileData.message || profileData.details || "Failed to update avatar.");
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
      setStatus("Identity vault updated.");
    } catch {
      setStatus("Unable to connect to server.");
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
              <span>Back</span>
            </button>
          </header>
          <p className="identity-vault-loading">Loading the identity vault...</p>
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
              <span>Back</span>
            </button>
          </header>
          <p className="identity-vault-loading">Identity vault unavailable.</p>
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
            <span>Back</span>
          </button>
        </header>

        <section className={`identity-vault-hero identity-vault-hero-${activeTrust.band}`}>
          <div className="identity-vault-hero-main">
            <div className="identity-vault-avatar-frame">
              <img
                className={getAvatarToneClass(avatar)}
                src={getAvatarUrl(avatar)}
                alt={`${user.name || "User"} avatar`}
              />
            </div>
            <div className="identity-vault-copy">
              <p className="identity-vault-eyebrow">Identity Vault</p>
              <h1>Privilege belongs below the surface.</h1>
              <p>
                Short-handle claims and noble avatars live here so the profile page can stay calm and unadvertised.
              </p>
            </div>
          </div>
          <div className="identity-vault-meta">
            <span>@{currentCleanIdValue}</span>
            <span>{selectedAvatarOption.family}</span>
            <span>{getTrustToneLabel(activeTrust)}</span>
            <span>{shortClaimRangeLabel}</span>
          </div>
        </section>

        <section className="identity-vault-layout">
          <form className="identity-vault-form" onSubmit={handleSave}>
            <section className={`identity-vault-claim identity-vault-claim-${activeShortIdClaim.tier}`}>
              <div className="identity-vault-section-head">
                <p className="identity-vault-eyebrow">Short ID Claim</p>
                <h2>Your purity allows identity to condense.</h2>
                <p>
                  Current window {shortClaimRangeLabel}. Standard handles remain 5-20 characters. Shorter claims open
                  only when the signal is clean enough.
                </p>
              </div>

              <label className="identity-vault-field" htmlFor="vault-clean-id">
                <span className="identity-vault-field-label">Identity handle</span>
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
                  <strong>{cleanIdIntent} handle</strong>
                  <span>{liveCleanIdValidation || activeShortIdClaim.detail}</span>
                </div>
              </div>
            </section>

            <fieldset className="profile-avatars identity-vault-library">
              <legend>Avatar library</legend>
              <div className="profile-avatar-head">
                <p className="profile-hint">
                  Every tier stays human, muted, and composed. The difference is not noise. It is depth, history,
                  and restraint.
                </p>
                <span className="profile-avatar-current-pill">{AVATAR_TIER_META[avatarAccess.currentTier].title}</span>
              </div>

              <div className="profile-avatar-sections">
                {avatarSections.map((section) => (
                  <section
                    key={section.tier}
                    className={`profile-avatar-tier profile-avatar-tier-${section.tier} ${section.access.unlocked ? "open" : "locked"}`}
                  >
                    <div className="profile-avatar-tier-head">
                      <div>
                        <p className="profile-settings-eyebrow">{section.meta.eyebrow}</p>
                        <h4>{section.meta.title}</h4>
                        <p className="profile-hint">
                          {section.access.unlocked ? section.meta.description : section.access.hint}
                        </p>
                      </div>
                      <span className={`profile-avatar-tier-pill ${section.access.unlocked ? "open" : "locked"}`}>
                        {section.access.unlocked ? "Open" : section.access.title}
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
                                ? "Current mark"
                                : "Available now"
                              : "Locked for now"}
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
                Close
              </button>
              <button
                type="submit"
                className="identity-vault-action identity-vault-action-primary"
                disabled={isSaving || Boolean(liveCleanIdValidation)}
              >
                {isSaving ? "Saving..." : "Save Identity"}
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
              <p className="identity-vault-eyebrow">Identity Reading</p>
              <h2>Stored signal</h2>
              <p>
                This page holds the marks that feel rarer, slower, and more guarded than ordinary profile edits.
              </p>
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
