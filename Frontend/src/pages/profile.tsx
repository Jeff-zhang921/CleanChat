import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
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
  getShortClaimTierLabel,
  validateShortClaimInput,
} from "../utils/cleanIdClaim";
import {
  FALLBACK_CLEAN_ID_TRUST,
  getTrustToneLabel,
} from "../utils/cleanIdTrust";
import { getNotificationPermission, requestNotificationPermission } from "../utils/notifications";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";

type OwnedGroupSummary = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  isOwner: boolean;
  joined: boolean;
  requiresApproval: boolean;
  joinRequestStatus: "none" | "pending";
  pendingRequestCount: number;
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
};

type GroupJoinRequest = {
  userId: number;
  requestedAt: string;
  name: string | null;
  email: string;
  cleanId: string;
};

const isIOSDevice = () =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent);

const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone === true;
  return mediaStandalone || navigatorStandalone;
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);

  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [cleanId, setCleanId] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey>("AVATAR_LEO");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [showGroupAccess, setShowGroupAccess] = useState(false);
  const [ownedGroups, setOwnedGroups] = useState<OwnedGroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<GroupJoinRequest[]>([]);
  const [isLoadingGroupAccess, setIsLoadingGroupAccess] = useState(false);
  const [isLoadingJoinRequests, setIsLoadingJoinRequests] = useState(false);
  const [updatingGroupId, setUpdatingGroupId] = useState<string | null>(null);
  const [processingJoinRequestKey, setProcessingJoinRequestKey] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState("");

  const normalizedCleanId = useMemo(() => cleanId.trim().toLowerCase(), [cleanId]);

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
        const nextUser = hydrateProfileUser(data.user);
        setUser(nextUser);
        setNickname(nextUser.name ?? "");
        setCleanId(nextUser.cleanId ?? "");
        setAvatar(nextUser.avatar ?? "AVATAR_LEO");
      } catch {
        if (isMounted) {
          setStatus("Unable to load profile.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  useEffect(() => {
    const syncPermission = () => {
      const permission = getNotificationPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setNotificationStatus("");
      }
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        syncPermission();
      }
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    window.addEventListener("pageshow", syncPermission);
    document.addEventListener("visibilitychange", handleVisibility);

    let permissionStatus: PermissionStatus | null = null;
    const permissionsApi = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (permissionsApi?.query) {
      void permissionsApi
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          permissionStatus.addEventListener("change", syncPermission);
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("focus", syncPermission);
      window.removeEventListener("pageshow", syncPermission);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (permissionStatus) {
        permissionStatus.removeEventListener("change", syncPermission);
      }
    };
  }, []);

  const resetFormToUser = () => {
    if (!user) return;
    setNickname(user.name ?? "");
    setCleanId(user.cleanId ?? "");
    setAvatar(user.avatar ?? "AVATAR_LEO");
  };

  const startEdit = () => {
    if (!user) return;
    setStatus("");
    setIsDeleteConfirming(false);
    navigate("/profile/edit", {
      state: {
        user,
        spatialTransition: "push",
      } satisfies ProfileRouteState,
    });
  };

  const cancelEdit = () => {
    resetFormToUser();
    setStatus("");
    setIsDeleteConfirming(false);
    setIsEditing(false);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setStatus("Nickname is required.");
      return;
    }
    const cleanIdValidation = validateShortClaimInput({
      cleanId: normalizedCleanId,
      currentCleanId: user.cleanId,
      claim: user.shortIdClaim ?? FALLBACK_SHORT_ID_CLAIM,
    });
    if (cleanIdValidation) {
      setStatus(cleanIdValidation);
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
        setIsEditing(false);
        return;
      }

      const nextUser = hydrateProfileUser(refreshData.user as ProfileUser);
      setUser(nextUser);
      setNickname(nextUser.name ?? "");
      setCleanId(nextUser.cleanId ?? "");
      setAvatar(nextUser.avatar ?? "AVATAR_LEO");
      setStatus("Profile updated.");
      setIsEditing(false);
    } catch {
      setStatus("Unable to connect to server.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToLogin = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setIsDeleteConfirming(false);
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  };

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setNotificationStatus("Notifications enabled.");
      return;
    }
    if (permission === "denied") {
      setNotificationStatus("Notifications blocked. Please allow notifications in browser settings.");
      return;
    }
    if (permission === "unsupported") {
      if (isIOSDevice() && !isStandalonePwa()) {
        setNotificationStatus(
          "iPhone Safari tab cannot enable web push. Add CleanChat to Home Screen, open from app icon, then enable notifications."
        );
        return;
      }
      setNotificationStatus("This browser does not support notifications.");
      return;
    }
    setNotificationStatus("Notification permission not granted yet.");
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      return;
    }

    setIsDeleting(true);
    setStatus("Deleting account...");
    try {
      const response = await fetch(`${BACKEND_URL}/profile/me`, {
        method: "DELETE",
        credentials: "include",
      });
      const raw = await response.text();
      let data: Record<string, string> = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as Record<string, string>;
        } catch {
          data = {};
        }
      }
      if (!response.ok) {
        setStatus(data.error || data.message || data.details || raw || "Failed to delete account.");
        setIsDeleteConfirming(false);
        return;
      }
      navigate("/login", { replace: true });
    } catch {
      setStatus("Unable to connect to server.");
      setIsDeleteConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const refreshOwnedGroups = async () => {
    setIsLoadingGroupAccess(true);
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to load your groups.");
        return;
      }

      const groups = Array.isArray(data.groups) ? (data.groups as OwnedGroupSummary[]) : [];
      const owned = groups.filter((group) => group.isOwner);
      setOwnedGroups(owned);
      if (selectedGroupId && !owned.some((group) => group.id === selectedGroupId)) {
        setSelectedGroupId(null);
        setJoinRequests([]);
      }
      if (owned.length === 0) {
        setJoinRequests([]);
      }
    } catch {
      setStatus("Failed to load your groups.");
    } finally {
      setIsLoadingGroupAccess(false);
    }
  };

  const handleToggleGroupAccess = async () => {
    if (showGroupAccess) {
      setShowGroupAccess(false);
      setSelectedGroupId(null);
      setJoinRequests([]);
      return;
    }
    setShowGroupAccess(true);
    setStatus("");
    await refreshOwnedGroups();
  };

  const handleUpdateJoinPolicy = async (group: OwnedGroupSummary, requiresApproval: boolean) => {
    setUpdatingGroupId(group.id);
    setStatus("Updating group verification setting...");
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requiresApproval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to update group setting.");
        return;
      }

      const updatedGroup = data.group as OwnedGroupSummary | undefined;
      setOwnedGroups((prev) =>
        prev.map((item) =>
          item.id === group.id ? updatedGroup ?? { ...item, requiresApproval, pendingRequestCount: 0 } : item
        )
      );
      if (!requiresApproval) {
        setSelectedGroupId(null);
        setJoinRequests([]);
      }
      setStatus("");
    } catch {
      setStatus("Failed to update group setting.");
    } finally {
      setUpdatingGroupId(null);
    }
  };

  const handleLoadJoinRequests = async (groupId: string) => {
    if (selectedGroupId === groupId) {
      setSelectedGroupId(null);
      setJoinRequests([]);
      return;
    }

    setSelectedGroupId(groupId);
    setJoinRequests([]);
    setIsLoadingJoinRequests(true);
    setStatus("Loading join requests...");
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/join-requests`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to load join requests.");
        return;
      }

      const requests = Array.isArray(data.requests) ? (data.requests as GroupJoinRequest[]) : [];
      setJoinRequests(requests);
      const updatedGroup = data.group as OwnedGroupSummary | undefined;
      if (updatedGroup) {
        setOwnedGroups((prev) => prev.map((item) => (item.id === groupId ? updatedGroup : item)));
      }
      setStatus("");
    } catch {
      setStatus("Failed to load join requests.");
    } finally {
      setIsLoadingJoinRequests(false);
    }
  };

  const handleResolveJoinRequest = async (groupId: string, userId: number, action: "approve" | "reject") => {
    const key = `${groupId}-${userId}-${action}`;
    setProcessingJoinRequestKey(key);
    setStatus(action === "approve" ? "Approving request..." : "Rejecting request...");
    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/join-requests/${userId}/${action}`,
        {
          method: "POST",
          credentials: "include",
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to update join request.");
        return;
      }

      setJoinRequests((prev) => prev.filter((request) => request.userId !== userId));
      const updatedGroup = data.group as OwnedGroupSummary | undefined;
      if (updatedGroup) {
        setOwnedGroups((prev) => prev.map((item) => (item.id === groupId ? updatedGroup : item)));
      } else {
        await refreshOwnedGroups();
      }
      setStatus("");
    } catch {
      setStatus("Failed to update join request.");
    } finally {
      setProcessingJoinRequestKey(null);
    }
  };

  const handleOpenPurity = () => {
    if (!user) return;
    navigate("/profile/purity", {
      state: {
        user,
        spatialTransition: "push",
      } satisfies ProfileRouteState,
    });
  };

  const activeAvatar = user ? (isEditing ? avatar : user.avatar) : "AVATAR_LEO";
  const activeName = user ? (isEditing ? nickname : user.name) : "";
  const activeCleanId = user ? (isEditing ? cleanId : user.cleanId) : "";
  const selectedOwnedGroup = ownedGroups.find((group) => group.id === selectedGroupId) ?? null;
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
  const activeAvatarOption = getAvatarOption(activeAvatar);
  const activeShortIdClaim = user?.shortIdClaim ?? FALLBACK_SHORT_ID_CLAIM;
  const shortClaimTierLabel = getShortClaimTierLabel(activeShortIdClaim);
  const shortClaimRangeLabel = getShortClaimRangeLabel(activeShortIdClaim);
  const purityMaterialLabel =
    activeTrust.band === "clear"
      ? "Crystal depth"
      : activeTrust.band === "steady"
        ? "Frosted glass"
        : activeTrust.band === "fragile"
          ? "Soft matte"
          : "Matte paper";
  const purityActionLabel =
    activeTrust.band === "clear"
      ? "Open crystal ledger"
      : activeTrust.band === "steady"
        ? "Open purity field"
        : "Inspect signal surface";
  const activeCleanIdLength = activeCleanId.trim().length;
  const cleanIdIntent =
    activeCleanIdLength > 0 && activeCleanIdLength <= 2
      ? "Ultra-short"
      : activeCleanIdLength > 0 && activeCleanIdLength <= 4
        ? "Short"
        : "Standard";
  const liveCleanIdValidation =
    user && isEditing
      ? validateShortClaimInput({
          cleanId: normalizedCleanId,
          currentCleanId: user.cleanId,
          claim: activeShortIdClaim,
        })
      : null;

  return (
    <div className="profile-shell">
      <main className="profile-card">
        {loading ? (
          <p className="profile-loading">Loading profile...</p>
        ) : !user ? (
          <p className="profile-loading">Profile not found.</p>
        ) : (
          <>
            <header className="profile-header">
              <div>
                <p className="profile-step">Your Account</p>
                <h1 className="profile-title">Profile</h1>
              </div>
              <button
                type="button"
                className="profile-link-btn"
                onClick={handleBackToLogin}
                disabled={isLoggingOut}
              >
                {isLoggingOut ? "Logging out..." : "Log Out"}
              </button>
            </header>

            <section className={`profile-entry-card profile-entry-card-${activeTrust.band}`}>
              <div className="profile-entry-identity">
                <img
                  className="profile-avatar-main"
                  src={getAvatarUrl(activeAvatar)}
                  alt={`${activeName || "User"} avatar`}
                />
                <div className="profile-summary-text profile-entry-copy">
                  <p className="profile-entry-kicker">Identity</p>
                  <h2>{activeName}</h2>
                  <div className="profile-summary-id-row">
                    <p className={`profile-cleanid profile-cleanid-${activeTrust.band}`}>@{activeCleanId}</p>
                    <span className={`profile-short-claim-badge profile-short-claim-badge-${activeShortIdClaim.tier}`}>
                      {activeShortIdClaim.isCurrentShort ? "Short ID held" : activeShortIdClaim.pill}
                    </span>
                  </div>
                  <p className="profile-avatar-family">{activeAvatarOption.family}</p>
                  <span>{user.email}</span>
                </div>
              </div>
              <button
                type="button"
                className={`profile-aura-button profile-aura-button-${activeTrust.band}`}
                onClick={handleOpenPurity}
                disabled={isEditing}
              >
                <span className="profile-aura-label">Purity</span>
                <strong>{activeTrust.title}</strong>
                <span className="profile-aura-score">
                  {getTrustToneLabel(activeTrust)} · {activeTrust.score} signal
                </span>
                <span className="profile-aura-texture">{purityMaterialLabel}</span>
                <span className="profile-aura-hint">{purityActionLabel}</span>
              </button>
            </section>

            {!isEditing && (
              <section
                className={`profile-short-claim-card profile-short-claim-card-${activeShortIdClaim.tier} profile-short-claim-standalone`}
              >
                <div className="profile-short-claim-head">
                  <div>
                    <p className="profile-settings-eyebrow">Short ID Claim</p>
                    <h4>{activeShortIdClaim.title}</h4>
                  </div>
                  <span className={`profile-short-claim-pill profile-short-claim-pill-${activeShortIdClaim.tier}`}>
                    {shortClaimTierLabel}
                  </span>
                </div>
                <div className="profile-short-claim-hero">
                  <span className={`profile-short-claim-token profile-short-claim-token-${activeShortIdClaim.tier}`}>
                    @{activeCleanId}
                  </span>
                  <div className="profile-short-claim-hero-copy">
                    <strong>
                      {activeShortIdClaim.isCurrentShort
                        ? `${cleanIdIntent} handle occupied`
                        : `${shortClaimRangeLabel} claim window`}
                    </strong>
                    <span>{activeShortIdClaim.detail}</span>
                  </div>
                </div>
                <div className="profile-short-claim-grid">
                  <div className="profile-short-claim-cell">
                    <span>Claim window</span>
                    <strong>{shortClaimRangeLabel}</strong>
                  </div>
                  <div className="profile-short-claim-cell">
                    <span>Next unlock</span>
                    <strong>
                      {activeShortIdClaim.nextUnlockScore
                        ? `${activeShortIdClaim.nextUnlockScore}+`
                        : "Open now"}
                    </strong>
                  </div>
                </div>
                <p className="profile-short-claim-note">{activeShortIdClaim.scarcity}</p>
                <div className="profile-short-claim-examples">
                  {activeShortIdClaim.examples.map((example) => (
                    <span key={example} className="profile-short-claim-example">
                      @{example}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {!isEditing && (
              <div className="profile-top-actions">
                <button type="button" className="profile-action-row" onClick={startEdit}>
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">Edit Profile</span>
                    <span className="profile-action-row-note">Open the dedicated identity workspace</span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">
                    &gt;
                  </span>
                </button>
                <button
                  type="button"
                  className="profile-action-row"
                  onClick={() => void handleToggleGroupAccess()}
                >
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">
                      {showGroupAccess ? "Hide Group Access" : "Manage Group Access"}
                    </span>
                    <span className="profile-action-row-note">
                      Review owned groups and pending join requests
                    </span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">
                    &gt;
                  </span>
                </button>
              </div>
            )}

            {!isEditing && (
              <section className="profile-settings-card">
                <div className="profile-settings-copy">
                  <p className="profile-settings-eyebrow">Notifications</p>
                  <h3>Message alerts</h3>
                  <p className="profile-hint">
                    Turn browser notifications on here instead of showing that action on the chat list.
                  </p>
                </div>
                <div className="profile-settings-actions">
                  <span className={`profile-permission-pill ${notificationPermission === "granted" ? "active" : ""}`}>
                    {notificationPermission === "granted"
                      ? "On"
                      : notificationPermission === "denied"
                        ? "Blocked"
                        : notificationPermission === "unsupported"
                          ? "Unsupported"
                          : "Off"}
                  </span>
                  <button
                    type="button"
                    className="profile-primary-btn"
                    onClick={() => void handleEnableNotifications()}
                    disabled={notificationPermission === "granted"}
                  >
                    {notificationPermission === "granted" ? "Notifications On" : "Enable Notifications"}
                  </button>
                </div>
                {notificationStatus && (
                  <p className="profile-status profile-notification-status" role="status">
                    {notificationStatus}
                  </p>
                )}
              </section>
            )}

            {isEditing && (
              <form className="profile-form" onSubmit={handleSave}>
                <fieldset className="profile-avatars">
                  <legend>Avatar Library</legend>
                  <div className="profile-avatar-head">
                    <p className="profile-hint">
                      CleanIDs now start with calm cartoon portraits, then unlock richer studio portraits and safe
                      anime characters as trust settles.
                    </p>
                    <span className="profile-avatar-current-pill">
                      {AVATAR_TIER_META[avatarAccess.currentTier].title}
                    </span>
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
                          <span
                            className={`profile-avatar-tier-pill ${section.access.unlocked ? "open" : "locked"}`}
                          >
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

                <label className="profile-label" htmlFor="cleanId">
                  CleanID
                </label>
                <input
                  className="profile-input"
                  id="cleanId"
                  type="text"
                  value={cleanId}
                  onChange={(event) =>
                    setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))
                  }
                  maxLength={20}
                  required
                />
                <p className="profile-hint">
                  Use lowercase letters, numbers, or underscore. Standard IDs stay 5-20 characters; short claims unlock with trust.
                </p>
                <section className={`profile-claim-editor profile-claim-editor-${activeShortIdClaim.tier}`}>
                  <div className="profile-claim-editor-head">
                    <strong>{activeShortIdClaim.pill}</strong>
                    <span>{shortClaimRangeLabel}</span>
                  </div>
                  <div className="profile-claim-editor-body">
                    <span className={`profile-short-claim-token profile-short-claim-token-${activeShortIdClaim.tier}`}>
                      @{normalizedCleanId || activeCleanId || "handle"}
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
                    {activeShortIdClaim.nextUnlockLabel && (
                      <span>{activeShortIdClaim.nextUnlockLabel}</span>
                    )}
                  </div>
                </section>

                <div className="profile-actions">
                  <button
                    type="button"
                    className="profile-secondary-btn"
                    onClick={cancelEdit}
                    disabled={isSaving}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="profile-primary-btn" disabled={isSaving || Boolean(liveCleanIdValidation)}>
                    {isSaving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            )}

            {status && (
              <p className="profile-status" role="status">
                {status}
              </p>
            )}

            {!isEditing && showGroupAccess && (
              <section className="profile-group-access">
            <h3>Group Join Verification</h3>
            <p className="profile-hint">
              Choose whether your groups need verification before others can join, and approve/reject requests.
            </p>

            {isLoadingGroupAccess && <p className="profile-loading">Loading your groups...</p>}
            {!isLoadingGroupAccess && ownedGroups.length === 0 && (
              <p className="profile-hint">You have not created any groups yet.</p>
            )}

            {!isLoadingGroupAccess && ownedGroups.length > 0 && (
              <div className="profile-owned-groups">
                {ownedGroups.map((group) => {
                  const isUpdatingGroup = updatingGroupId === group.id;
                  const isRequestPanelOpen = selectedGroupId === group.id;
                  return (
                    <article key={group.id} className="profile-owned-group">
                      <div className="profile-owned-group-main">
                        <h4>{group.name}</h4>
                        <p>
                          {group.memberCount} members - {group.pendingRequestCount} pending request(s)
                        </p>
                      </div>
                      <div className="profile-owned-group-actions">
                        <label className="profile-verify-toggle">
                          <input
                            type="checkbox"
                            checked={group.requiresApproval}
                            disabled={isUpdatingGroup}
                            onChange={(event) => {
                              void handleUpdateJoinPolicy(group, event.target.checked);
                            }}
                          />
                          <span>{group.requiresApproval ? "Verification ON" : "Verification OFF"}</span>
                        </label>
                        <button
                          type="button"
                          className="profile-secondary-btn"
                          disabled={isUpdatingGroup}
                          onClick={() => {
                            void handleLoadJoinRequests(group.id);
                          }}
                        >
                          {isRequestPanelOpen
                            ? "Hide Requests"
                            : `Review Requests (${group.pendingRequestCount})`}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {selectedOwnedGroup && (
              <section className="profile-join-requests-panel">
                <h4>{selectedOwnedGroup.name} - Join Requests</h4>
                {isLoadingJoinRequests && <p className="profile-loading">Loading requests...</p>}
                {!isLoadingJoinRequests && joinRequests.length === 0 && (
                  <p className="profile-hint">No pending requests for this group.</p>
                )}
                {!isLoadingJoinRequests && joinRequests.length > 0 && (
                  <ul className="profile-join-request-list">
                    {joinRequests.map((request) => {
                      const approveKey = `${selectedOwnedGroup.id}-${request.userId}-approve`;
                      const rejectKey = `${selectedOwnedGroup.id}-${request.userId}-reject`;
                      return (
                        <li key={request.userId} className="profile-join-request-item">
                          <div className="profile-join-request-meta">
                            <strong>@{request.cleanId}</strong>
                            <span>{request.name || request.email}</span>
                          </div>
                          <div className="profile-join-request-actions">
                            <button
                              type="button"
                              className="profile-primary-btn"
                              disabled={processingJoinRequestKey === approveKey}
                              onClick={() => {
                                void handleResolveJoinRequest(selectedOwnedGroup.id, request.userId, "approve");
                              }}
                            >
                              {processingJoinRequestKey === approveKey ? "Approving..." : "Approve"}
                            </button>
                            <button
                              type="button"
                              className="profile-secondary-btn"
                              disabled={processingJoinRequestKey === rejectKey}
                              onClick={() => {
                                void handleResolveJoinRequest(selectedOwnedGroup.id, request.userId, "reject");
                              }}
                            >
                              {processingJoinRequestKey === rejectKey ? "Rejecting..." : "Reject"}
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
              </section>
            )}

            <section className="profile-danger-wrap">
              {isDeleteConfirming && !isDeleting && (
                <p className="profile-danger-hint">
                  Are you sure? This will permanently delete your account, profile, and all chats.
                  Click delete again to continue.
                </p>
              )}
              <div className="profile-danger-actions">
                <button
                  type="button"
                  className={`profile-danger-btn ${isDeleteConfirming ? "confirm" : ""}`}
                  onClick={handleDeleteAccount}
                  disabled={isDeleting || isSaving || isLoggingOut}
                >
                  {isDeleting
                    ? "Deleting..."
                    : isDeleteConfirming
                      ? "Delete Account (Confirm)"
                      : "Delete Account"}
                </button>
                {isDeleteConfirming && !isDeleting && (
                  <button
                    type="button"
                    className="profile-secondary-btn"
                    onClick={() => setIsDeleteConfirming(false)}
                    disabled={isSaving || isLoggingOut}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </section>
          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
