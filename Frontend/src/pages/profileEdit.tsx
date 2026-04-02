import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  AVATAR_TIER_META,
  AVATAR_TIER_ORDER,
  buildDerivedAvatarAccess,
  getAvatarOption,
  getAvatarOptionsByTier,
  getAvatarUrl,
  isAvatarUnlocked,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import {
  FALLBACK_SHORT_ID_CLAIM,
  getShortClaimRangeLabel,
  validateShortClaimInput,
} from "../utils/cleanIdClaim";
import {
  FALLBACK_CLEAN_ID_TRUST,
  getTrustToneLabel,
} from "../utils/cleanIdTrust";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";
import "./profileEdit.css";

const EXIT_MS = 260;

const getPurityMaterialLabel = (user: ProfileUser | null) => {
  const band = user?.trust.band ?? "blurred";
  if (band === "clear") return "Crystal depth";
  if (band === "steady") return "Frosted glass";
  if (band === "fragile") return "Soft matte";
  return "Matte paper";
};

const getPurityGuidance = (user: ProfileUser | null) => {
  const band = user?.trust.band ?? "blurred";
  if (band === "clear") {
    return "Your identity already reads clean and memorable. Edit it gently so the surface stays precise.";
  }
  if (band === "steady") {
    return "Everything here should feel verified, restrained, and easy to remember across long threads.";
  }
  if (band === "fragile") {
    return "Keep the mark quiet and readable. Stable conversations will sharpen the surface over time.";
  }
  return "This profile is still settling. Calm signals and a consistent mark will help it stabilize.";
};

const ProfileEditPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [nickname, setNickname] = useState(seededUser?.name ?? "");
  const [cleanId, setCleanId] = useState(seededUser?.cleanId ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(seededUser?.avatar ?? "AVATAR_LEO");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNickname(user.name ?? "");
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
          setStatus("Unable to load editing workspace.");
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
  const activeShortIdClaim = user?.shortIdClaim ?? FALLBACK_SHORT_ID_CLAIM;
  const shortClaimRangeLabel = getShortClaimRangeLabel(activeShortIdClaim);
  const liveCleanIdValidation = user
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

  const detailRows = useMemo(() => {
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
        label: "Long threads",
        value: `${user.trust.metrics.sustainedThreads} stable lines`,
      },
      {
        label: "Recent cadence",
        value: `${user.trust.metrics.recentMessages} replies / 30d`,
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

  const leaveToProfile = (nextUser?: ProfileUser | null) => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
      };
      if (nextUser) {
        nextState.user = nextUser;
      }
      navigate("/profile", {
        state: nextState,
      });
    }, EXIT_MS);
  };

  const handleBack = () => {
    if (isSaving) return;
    leaveToProfile(user);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setStatus("Nickname is required.");
      return;
    }
    if (liveCleanIdValidation) {
      setStatus(liveCleanIdValidation);
      return;
    }

    setIsSaving(true);
    setStatus("Saving profile...");

    try {
      if (normalizedCleanId !== user.cleanId) {
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
      }

      const nameOrAvatarChanged = trimmedName !== user.name || avatar !== user.avatar;
      if (nameOrAvatarChanged) {
        const profileResponse = await fetch(`${BACKEND_URL}/profile/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: trimmedName,
            avatar,
          }),
        });
        const profileRaw = await profileResponse.text();
        let profileData: Record<string, string> = {};
        if (profileRaw) {
          try {
            profileData = JSON.parse(profileRaw) as Record<string, string>;
          } catch {
            profileData = {};
          }
        }
        if (!profileResponse.ok) {
          setStatus(
            profileData.error ||
              profileData.message ||
              profileData.details ||
              profileRaw ||
              "Failed to update profile."
          );
          return;
        }
      }

      const refreshResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        credentials: "include",
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshData.user) {
        setStatus("Profile saved, but failed to refresh profile.");
        return;
      }

      const nextUser = hydrateProfileUser(refreshData.user as ProfileUser);
      setUser(nextUser);
      setStatus("Profile updated.");
      leaveToProfile(nextUser);
    } catch {
      setStatus("Unable to connect to server.");
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="profile-edit-shell profile-edit-shell-loading">
        <main className="profile-edit-page">
          <header className="profile-edit-nav">
            <button type="button" className="profile-edit-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>Back</span>
            </button>
          </header>
          <p className="profile-edit-loading">Loading editing space...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-edit-shell profile-edit-shell-loading">
        <main className="profile-edit-page">
          <header className="profile-edit-nav">
            <button type="button" className="profile-edit-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>Back</span>
            </button>
          </header>
          <p className="profile-edit-loading">Profile editing is unavailable right now.</p>
        </main>
      </div>
    );
  }

  return (
    <div
      className={`profile-edit-shell profile-edit-shell-${activeTrust.band} ${isLeaving ? "is-leaving" : ""}`}
    >
      <main className="profile-edit-page">
        <header className="profile-edit-nav">
          <button
            type="button"
            className="profile-edit-back-button"
            onClick={handleBack}
            disabled={isSaving}
          >
            <span aria-hidden="true">{"\u2190"}</span>
            <span>Back</span>
          </button>
        </header>

        <section className={`profile-edit-hero profile-edit-hero-${activeTrust.band}`}>
          <div className="profile-edit-hero-main">
            <div className="profile-edit-avatar-frame">
              <img src={getAvatarUrl(avatar)} alt={`${nickname || user.name || "User"} avatar`} />
            </div>
            <div className="profile-edit-hero-copy">
              <p className="profile-edit-eyebrow">Profile Edit Page</p>
              <h1>Shape your CleanID with calm precision.</h1>
              <p>{getPurityGuidance(user)}</p>
            </div>
          </div>
          <div className="profile-edit-hero-meta">
            <span>@{currentCleanIdValue}</span>
            <span>{selectedAvatarOption.family}</span>
            <span>{getTrustToneLabel(activeTrust)}</span>
            <span>{getPurityMaterialLabel(user)}</span>
          </div>
        </section>

        <section className="profile-edit-layout">
          <form className="profile-form profile-edit-form" onSubmit={handleSave}>
            <div className="profile-edit-form-head">
              <div>
                <p className="profile-edit-eyebrow">Edit identity</p>
                <h2>Adjust the visible mark, then return.</h2>
              </div>
              <span className="profile-avatar-current-pill">
                {AVATAR_TIER_META[avatarAccess.currentTier].title}
              </span>
            </div>

            <fieldset className="profile-avatars">
              <legend>Avatar library</legend>
              <div className="profile-avatar-head">
                <p className="profile-hint">
                  Calm cartoon portraits arrive first. Richer studio portraits and safe anime marks unlock as the
                  signal settles.
                </p>
                <span className="profile-edit-tier-note">{selectedAvatarOption.family}</span>
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
                          <img src={item.url} alt={item.label} />
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

            <section className="profile-edit-fields">
              <div className="profile-edit-field">
                <label className="profile-label" htmlFor="nickname">
                  Nickname
                </label>
                <input
                  className="profile-input"
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={40}
                  required
                />
              </div>

              <div className="profile-edit-field">
                <label className="profile-label" htmlFor="cleanId">
                  CleanID
                </label>
                <input
                  className="profile-input"
                  id="cleanId"
                  type="text"
                  value={cleanId}
                  onChange={(event) => {
                    setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"));
                  }}
                  maxLength={20}
                  required
                />
                <p className="profile-hint">
                  Use lowercase letters, numbers, or underscore. Standard IDs stay 5-20 characters; short claims unlock
                  with trust.
                </p>
              </div>
            </section>

            <section className={`profile-claim-editor profile-claim-editor-${activeShortIdClaim.tier}`}>
              <div className="profile-claim-editor-head">
                <strong>{activeShortIdClaim.pill}</strong>
                <span>{shortClaimRangeLabel}</span>
              </div>
              <div className="profile-claim-editor-body">
                <span className={`profile-short-claim-token profile-short-claim-token-${activeShortIdClaim.tier}`}>
                  @{currentCleanIdValue}
                </span>
                <div className="profile-claim-editor-copy">
                  <strong>{cleanIdIntent} handle</strong>
                  <span>{liveCleanIdValidation || activeShortIdClaim.detail}</span>
                </div>
              </div>
              <div className="profile-claim-editor-foot">
                <span>
                  {activeShortIdClaim.nextUnlockScore && !activeShortIdClaim.isCurrentShort
                    ? `Next unlock at ${activeShortIdClaim.nextUnlockScore}+ trust score.`
                    : "Your current claim window is already open."}
                </span>
                {activeShortIdClaim.nextUnlockLabel && <span>{activeShortIdClaim.nextUnlockLabel}</span>}
              </div>
            </section>

            <div className="profile-actions profile-edit-actions">
              <button
                type="button"
                className="profile-secondary-btn"
                onClick={handleBack}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="profile-primary-btn"
                disabled={isSaving || Boolean(liveCleanIdValidation)}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>

            {status && (
              <p className="profile-status" role="status">
                {status}
              </p>
            )}
          </form>

          <aside className={`profile-edit-aside profile-edit-aside-${activeTrust.band}`}>
            <div className="profile-edit-aside-head">
              <p className="profile-edit-eyebrow">Purity context</p>
              <h2>{activeTrust.title}</h2>
              <p>{user.trust.summary}</p>
            </div>

            <div className="profile-edit-metrics">
              {detailRows.map((row) => (
                <article key={row.label} className="profile-edit-metric">
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </article>
              ))}
            </div>

            <div className="profile-edit-ledger">
              <div className="profile-edit-ledger-item">
                <span>Current tone</span>
                <strong>{getTrustToneLabel(activeTrust)}</strong>
              </div>
              <div className="profile-edit-ledger-item">
                <span>Surface material</span>
                <strong>{getPurityMaterialLabel(user)}</strong>
              </div>
              <div className="profile-edit-ledger-item">
                <span>What sharpens it</span>
                <strong>
                  {user.trust.metrics.sustainedThreads > 1
                    ? "Long, calm conversation"
                    : user.trust.metrics.recentMessages > 4
                      ? "Steadier reply rhythm"
                      : "Gentle healthy cadence"}
                </strong>
              </div>
              <div className="profile-edit-ledger-item">
                <span>What would blur it</span>
                <strong>
                  {user.trust.metrics.moderationPenalties === 0
                    ? "Future spam or blocks"
                    : "Existing moderation marks"}
                </strong>
              </div>
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
};

export default ProfileEditPage;
