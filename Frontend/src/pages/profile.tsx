import { FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import Badge from "../components/Badge";
import {
  getAvatarOption,
  getAvatarToneClass,
  getAvatarUrl,
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
  ensurePushSubscriptionForCurrentUser,
  getNotificationPermission,
  isAndroid13Plus,
  isIOSDevice,
  isStandalonePwa,
} from "../utils/notifications";
import {
  hydrateProfileUser,
  type ProfileEditDraft,
  type ProfileRouteState,
  type ProfileUser,
} from "../utils/profileUser";
import { formatRegion } from "../utils/region";
import { useNotificationBadges } from "../state/notificationBadgeContext";
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
  const { pendingDirectRequests, pendingGroupRequests } = useNotificationBadges();
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

  const openFeedback = () => {
    if (!user) return;
    setStatus("");
    navigate("/profile/feedback", {
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

  const openAvatarPage = () => {
    if (!user) return;
    setStatus("");
    const editDraft: ProfileEditDraft = {
      name: nickname,
      cleanId,
      avatar,
      gender: user.gender,
      country: user.country ?? "",
      city: user.city ?? "",
    };
    navigate("/profile/avatar", {
      state: {
        user,
        editDraft,
        selectedAvatar: avatar,
        spatialTransition: "push",
        returnTo: "/profile",
        avatarPickerReturnTo: "/profile/edit",
      } satisfies ProfileRouteState,
    });
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
      activationUserKey: user?.id ?? null,
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

  const activeAvatar = user ? (isEditing ? avatar : user.avatar) : "AVATAR_LEO";
  const activeName = user ? (isEditing ? nickname : user.name) : "";
  const activeCleanId = user ? (isEditing ? cleanId : user.cleanId) : "";
  const activeRegion = user ? formatRegion(user.country, user.city) : null;
  const selectedOwnedGroup = ownedGroups.find((group) => group.id === selectedGroupId) ?? null;
  const activeAvatarOption = getAvatarOption(activeAvatar);
  const selectedAvatarOption = getAvatarOption(avatar);
  const activeShortIdClaim = user?.shortIdClaim ?? FALLBACK_SHORT_ID_CLAIM;
  const shortClaimRangeLabel = getShortClaimRangeLabel(activeShortIdClaim);
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

            <section className="profile-entry-card">
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
                    <p className="profile-cleanid">@{activeCleanId}</p>
                  </div>
                  <p className="profile-avatar-family">{activeAvatarOption.family}</p>
                  {activeRegion && <span className="profile-region">{activeRegion}</span>}
                  <span>{user.email}</span>
                </div>
              </div>
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
                <button type="button" className="profile-action-row" onClick={openFeedback}>
                  <span className="profile-action-row-copy">
                    <span className="profile-action-row-title">{t("profile.feedback")}</span>
                    <span className="profile-action-row-note">{t("profile.feedbackNote")}</span>
                  </span>
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
                <button
                  type="button"
                  className="profile-action-row profile-user-requests-action"
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
                  <Badge
                    count={pendingDirectRequests}
                    size="compact"
                    className="profile-action-row-badge profile-user-requests-badge"
                    ariaLabel={`${t("profile.manageUserRequests")} ${pendingDirectRequests}`}
                  />
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
                <button
                  type="button"
                  className="profile-action-row profile-group-access-action"
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
                  <Badge
                    count={pendingGroupRequests}
                    size="compact"
                    className="profile-action-row-badge profile-group-access-badge"
                    ariaLabel={`${t("profile.manageGroupAccess")} ${pendingGroupRequests}`}
                  />
                  <span className="profile-action-row-arrow" aria-hidden="true">{"\u2192"}</span>
                </button>
              </div>
            )}

            {isEditing && (
              <form className="profile-form" onSubmit={handleSave}>
                <section className="profile-avatars" aria-label={t("profile.avatarLibrary")}>
                  <div className="profile-avatar-head">
                    <p className="profile-hint">
                      {t("profile.avatarLibraryNote")}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="profile-avatar-picker-trigger"
                    onClick={openAvatarPage}
                    disabled={isSaving}
                  >
                    <span className="profile-avatar-picker-trigger-copy">
                      <span>{t("profile.avatarLibrary")}</span>
                      <strong>{selectedAvatarOption.label}</strong>
                    </span>
                    <span className="profile-avatar-picker-trigger-action">
                      {t("profile.avatarPickerAction")}
                    </span>
                  </button>
                </section>

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
                    <span>{t("profile.currentClaimWindowOpen")}</span>
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
