import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import {
  AVATAR_TIER_META,
  AVATAR_TIER_ORDER,
  buildDerivedAvatarAccess,
  getAvatarOption,
  getAvatarToneClass,
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
import { clearAuthToken } from "../utils/auth";
import {
  FALLBACK_CLEAN_ID_TRUST,
} from "../utils/cleanIdTrust";
import {
  ensurePushSubscriptionForCurrentUser,
  getNotificationPermission,
  isAndroid13Plus,
} from "../utils/notifications";
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

const ProfileLoadingState = () => (
  <>
    <header className="profile-header profile-header-skeleton" aria-hidden="true">
      <div className="profile-header-skeleton-copy">
        <span className="profile-skeleton-surface profile-step-skeleton" />
        <span className="profile-skeleton-surface profile-title-skeleton" />
      </div>
    </header>

    <section className="profile-entry-card profile-entry-card-loading" aria-hidden="true">
      <div className="profile-entry-identity">
        <div className="profile-avatar-main profile-avatar-skeleton">
          <span className="profile-skeleton-surface profile-avatar-skeleton-core" />
        </div>
        <div className="profile-summary-text profile-entry-copy profile-loading-copy">
          <span className="profile-skeleton-surface profile-entry-kicker-skeleton" />
          <span className="profile-skeleton-surface profile-name-skeleton" />
          <span className="profile-skeleton-surface profile-cleanid-skeleton" />
          <span className="profile-skeleton-surface profile-meta-skeleton" />
          <span className="profile-skeleton-surface profile-meta-skeleton profile-meta-skeleton-short" />
        </div>
      </div>

      <div className="profile-aura-skeleton">
        <span className="profile-skeleton-surface profile-aura-label-skeleton" />
        <span className="profile-skeleton-surface profile-aura-title-skeleton" />
        <span className="profile-skeleton-surface profile-aura-copy-skeleton" />
        <span className="profile-skeleton-surface profile-aura-copy-skeleton profile-aura-copy-skeleton-short" />
      </div>
    </section>

    <div className="profile-top-actions profile-top-actions-loading" aria-hidden="true">
      {[0, 1, 2].map((item) => (
        <article key={item} className="profile-action-row profile-action-row-skeleton">
          <span className="profile-action-row-copy">
            <span className="profile-skeleton-surface profile-action-title-skeleton" />
            <span className="profile-skeleton-surface profile-action-note-skeleton" />
          </span>
          <span className="profile-skeleton-surface profile-action-arrow-skeleton" />
        </article>
      ))}
    </div>
  </>
);

const ProfilePage = () => {
  const { t } = useTranslation();
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
          setStatus(t("profile.loadFailed"));
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    void loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate, t]);

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

  useEffect(() => {
    if (notificationPermission !== "granted") {
      return;
    }

    void ensurePushSubscriptionForCurrentUser({
      requestPermission: false,
    });
  }, [notificationPermission]);

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
        returnTo: "/profile",
      } satisfies ProfileRouteState,
    });
  };

  const openSettings = () => {
    if (!user) return;
    setStatus("");
    navigate("/profile/settings", {
      state: {
        user,
        spatialTransition: "push",
        returnTo: "/profile",
      } satisfies ProfileRouteState,
    });
  };

  const openUserRequestHub = () => {
    navigate("/profile/requests/users", {
      state: {
        fromPath: "/profile",
      },
    });
  };

  const openGroupRequestHub = () => {
    navigate("/profile/requests/groups", {
      state: {
        fromPath: "/profile",
      },
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
      setStatus(t("profile.nicknameRequired"));
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
  setStatus(t("profile.saving"));

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
                t("profile.cleanIdUpdateFailed")
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
                t("profile.updateFailed")
          );
          return;
        }
      }

      const refreshResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        credentials: "include",
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshData.user) {
        setStatus(t("profile.savedRefreshFailed"));
        setIsEditing(false);
        return;
      }

      const nextUser = hydrateProfileUser(refreshData.user as ProfileUser);
      setUser(nextUser);
      setNickname(nextUser.name ?? "");
      setCleanId(nextUser.cleanId ?? "");
      setAvatar(nextUser.avatar ?? "AVATAR_LEO");
      setStatus(t("profile.updated"));
      setIsEditing(false);
    } catch {
      setStatus(t("common.connectionError"));
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
      clearAuthToken();
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  };

  const handleEnableNotifications = async () => {
    const subscriptionResult = await ensurePushSubscriptionForCurrentUser({
      requestPermission: true,
      forceResubscribe: true,
    });
    setNotificationPermission(subscriptionResult.permission);

    if (subscriptionResult.ok) {
      setNotificationStatus(t("profile.notificationsEnabled"));
      return;
    }
    if (subscriptionResult.permission === "denied") {
      setNotificationStatus(
        isAndroid13Plus()
          ? t("settings.notificationsBlockedAndroid")
          : t("settings.notificationsBlockedBrowser")
      );
      return;
    }
    if (subscriptionResult.permission === "unsupported") {
      if (isIOSDevice() && !isStandalonePwa()) {
        setNotificationStatus(t("settings.notificationsUnsupportedIOS"));
        return;
      }
      setNotificationStatus(t("settings.notificationsUnsupported"));
      return;
    }

    setNotificationStatus(
      subscriptionResult.reason || t("settings.notificationsNotGranted"),
    );
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      return;
    }

    setIsDeleting(true);
  setStatus(t("profile.deleting"));
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
        setStatus(data.error || data.message || data.details || raw || t("profile.deleteFailed"));
        setIsDeleteConfirming(false);
        return;
      }
      clearAuthToken();
      navigate("/login", { replace: true });
    } catch {
      setStatus(t("common.connectionError"));
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
        setStatus(data.message || data.error || t("profile.groupsLoadFailed"));
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
      setStatus(t("profile.groupsLoadFailed"));
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
    setStatus(t("profile.groupSettingUpdating"));
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ requiresApproval }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("profile.groupSettingUpdateFailed"));
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
      setStatus(t("profile.groupSettingUpdateFailed"));
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
    setStatus(t("profile.joinRequestsLoading"));
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/join-requests`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("profile.joinRequestsLoadFailed"));
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
      setStatus(t("profile.joinRequestsLoadFailed"));
    } finally {
      setIsLoadingJoinRequests(false);
    }
  };

  const handleResolveJoinRequest = async (groupId: string, userId: number, action: "approve" | "reject") => {
    const key = `${groupId}-${userId}-${action}`;
    setProcessingJoinRequestKey(key);
    setStatus(action === "approve" ? t("profile.joinRequestApproving") : t("profile.joinRequestRejecting"));
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
        setStatus(data.message || data.error || t("profile.joinRequestUpdateFailed"));
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
      setStatus(t("profile.joinRequestUpdateFailed"));
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
        returnTo: "/profile",
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
  const shortClaimRangeLabel = getShortClaimRangeLabel(activeShortIdClaim);
  const purityMaterialLabel =
    activeTrust.band === "clear"
      ? t("profile.purityMaterialClear")
      : activeTrust.band === "steady"
        ? t("profile.purityMaterialSteady")
        : activeTrust.band === "fragile"
          ? t("profile.purityMaterialFragile")
          : t("profile.purityMaterialBlurred");
  const purityActionLabel =
    activeTrust.band === "clear"
      ? t("profile.purityActionClear")
      : activeTrust.band === "steady"
        ? t("profile.purityActionSteady")
        : t("profile.purityActionDefault");
  const activeTrustToneLabel =
    activeTrust.band === "clear"
      ? t("profile.trustToneClear")
      : activeTrust.band === "steady"
        ? t("profile.trustToneSteady")
        : activeTrust.band === "fragile"
          ? t("profile.trustToneFragile")
          : t("profile.trustToneBlurred");
  const activeCleanIdLength = activeCleanId.trim().length;
  const cleanIdIntent =
    activeCleanIdLength > 0 && activeCleanIdLength <= 2
      ? t("profile.cleanIdIntentUltraShort")
      : activeCleanIdLength > 0 && activeCleanIdLength <= 4
        ? t("profile.cleanIdIntentShort")
        : t("profile.cleanIdIntentStandard");
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
          <ProfileLoadingState />
        ) : !user ? (
          <p className="profile-loading">{t("profile.notFound")}</p>
        ) : (
          <>
            <header className="profile-header">
              <div>
                <p className="profile-step">{t("profile.yourAccount")}</p>
                <h1 className="profile-title">{t("profile.title")}</h1>
              </div>
            </header>

            <section className={`profile-entry-card profile-entry-card-${activeTrust.band}`}>
              <div className="profile-entry-identity">
                <img
                  className={`profile-avatar-main ${getAvatarToneClass(activeAvatar)}`}
                  src={getAvatarUrl(activeAvatar)}
                  alt={t("profile.avatarAlt", { name: activeName || t("common.user") })}
                />
                <div className="profile-summary-text profile-entry-copy">
                  <p className="profile-entry-kicker">{t("profile.identity")}</p>
                  <h2>{activeName}</h2>
                  <div className="profile-summary-id-row">
                    <p className={`profile-cleanid profile-cleanid-${activeTrust.band}`}>@{activeCleanId}</p>
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
                <span className="profile-aura-label">{t("profile.purity")}</span>
                <strong>{activeTrust.title}</strong>
                <span className="profile-aura-score">
                  {t("profile.signalScore", {
                    label: activeTrustToneLabel,
                    score: activeTrust.score,
                  })}
                </span>
                <span className="profile-aura-texture">{purityMaterialLabel}</span>
                <span className="profile-aura-hint">{purityActionLabel}</span>
              </button>
            </section>

            {!isEditing && (
              <div className="profile-top-actions">
                <button type="button" className="profile-action-row" onClick={startEdit}>
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">{t("profile.editProfile")}</span>
                    <span className="profile-action-row-note">{t("profile.editProfileNote")}</span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
                <button type="button" className="profile-action-row" onClick={openSettings}>
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">{t("profile.settings")}</span>
                    <span className="profile-action-row-note">{t("profile.settingsNote")}</span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
                <button
                  type="button"
                  className="profile-action-row"
                  onClick={openUserRequestHub}
                >
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">
                      {t("profile.manageUserRequests")}
                    </span>
                    <span className="profile-action-row-note">
                      {t("profile.userRequestsNote")}
                    </span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
                <button
                  type="button"
                  className="profile-action-row"
                  onClick={openGroupRequestHub}
                >
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">
                      {t("profile.manageGroupAccess")}
                    </span>
                    <span className="profile-action-row-note">
                      {t("profile.groupAccessNote")}
                    </span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
              </div>
            )}

            {isEditing && (
              <form className="profile-form" onSubmit={handleSave}>
                <fieldset className="profile-avatars">
                  <legend>{t("profile.avatarLibrary")}</legend>
                  <div className="profile-avatar-head">
                    <p className="profile-hint">
                      {t("profile.avatarLibraryNote")}
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
                            {section.access.unlocked ? t("profile.open") : section.access.title}
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
                                    ? t("profile.currentMark")
                                    : t("profile.availableNow")
                                  : t("profile.lockedForNow")}
                              </em>
                            </label>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </fieldset>

                <label className="profile-label" htmlFor="nickname">
                  {t("profile.nickname")}
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
                  {t("profile.cleanId")}
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
                  {t("profile.cleanIdHint")}
                </p>
                <section className={`profile-claim-editor profile-claim-editor-${activeShortIdClaim.tier}`}>
                  <div className="profile-claim-editor-head">
                    <strong>{activeShortIdClaim.pill}</strong>
                    <span>{shortClaimRangeLabel}</span>
                  </div>
                  <div className="profile-claim-editor-body">
                    <span className={`profile-short-claim-token profile-short-claim-token-${activeShortIdClaim.tier}`}>
                      @{normalizedCleanId || activeCleanId || t("profile.handleFallback")}
                    </span>
                    <div className="profile-claim-editor-copy">
                      <strong>{t("profile.handleLabel", { intent: cleanIdIntent })}</strong>
                      <span>{liveCleanIdValidation || activeShortIdClaim.detail}</span>
                    </div>
                  </div>
                  <div className="profile-claim-editor-foot">
                    <span>
                      {activeShortIdClaim.nextUnlockScore && !activeShortIdClaim.isCurrentShort
                        ? t("profile.nextUnlockAt", { score: activeShortIdClaim.nextUnlockScore })
                        : t("profile.currentClaimWindowOpen")}
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
                    {t("common.cancel")}
                  </button>
                  <button type="submit" className="profile-primary-btn" disabled={isSaving || Boolean(liveCleanIdValidation)}>
                    {isSaving ? t("profile.saving") : t("profile.saveChanges")}
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
            <h3>{t("profile.groupJoinVerification")}</h3>
            <p className="profile-hint">
              {t("profile.groupJoinVerificationNote")}
            </p>

            {isLoadingGroupAccess && <p className="profile-loading">{t("profile.loadingGroups")}</p>}
            {!isLoadingGroupAccess && ownedGroups.length === 0 && (
              <p className="profile-hint">{t("profile.noOwnedGroups")}</p>
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
                          {t("profile.groupMembersAndPending", {
                            members: group.memberCount,
                            pending: group.pendingRequestCount,
                          })}
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
                          <span>{group.requiresApproval ? t("profile.verificationOn") : t("profile.verificationOff")}</span>
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
                            ? t("profile.hideRequests")
                            : t("profile.reviewRequests", { count: group.pendingRequestCount })}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {selectedOwnedGroup && (
              <section className="profile-join-requests-panel">
                <h4>{t("profile.joinRequestsTitle", { name: selectedOwnedGroup.name })}</h4>
                {isLoadingJoinRequests && <p className="profile-loading">{t("profile.loadingRequests")}</p>}
                {!isLoadingJoinRequests && joinRequests.length === 0 && (
                  <p className="profile-hint">{t("profile.noPendingRequests")}</p>
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
                              {processingJoinRequestKey === approveKey ? t("profile.joinRequestApproving") : t("profile.approve")}
                            </button>
                            <button
                              type="button"
                              className="profile-secondary-btn"
                              disabled={processingJoinRequestKey === rejectKey}
                              onClick={() => {
                                void handleResolveJoinRequest(selectedOwnedGroup.id, request.userId, "reject");
                              }}
                            >
                              {processingJoinRequestKey === rejectKey ? t("profile.joinRequestRejecting") : t("profile.reject")}
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

          </>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
