import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { BACKEND_URL } from "../config";
import "./profile.css";

const CLEAN_ID_REGEX = /^[a-z0-9_]{3,20}$/;

type AvatarKey =
  | "AVATAR_LEO"
  | "AVATAR_SOPHIE"
  | "AVATAR_MAX"
  | "AVATAR_BELLA"
  | "AVATAR_CHARLIE"
  | "AVATAR_AVERY"
  | "AVATAR_RILEY"
  | "AVATAR_JORDAN"
  | "AVATAR_SKYLER"
  | "AVATAR_MORGAN";

type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
};

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

const AVATAR_OPTIONS: { key: AvatarKey; label: string; url: string }[] = [
  { key: "AVATAR_LEO", label: "Leo", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" },
  { key: "AVATAR_SOPHIE", label: "Sophie", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie" },
  { key: "AVATAR_MAX", label: "Max", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max" },
  { key: "AVATAR_BELLA", label: "Bella", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella" },
  { key: "AVATAR_CHARLIE", label: "Charlie", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie" },
  { key: "AVATAR_AVERY", label: "Avery", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Avery" },
  { key: "AVATAR_RILEY", label: "Riley", url: "https://api.dicebear.com/9.x/lorelei/svg?seed=Riley" },
  { key: "AVATAR_JORDAN", label: "Jordan", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan" },
  { key: "AVATAR_SKYLER", label: "Skyler", url: "https://api.dicebear.com/9.x/lorelei/svg?seed=Skyler" },
  { key: "AVATAR_MORGAN", label: "Morgan", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Morgan" },
];

const avatarUrl = (avatar: AvatarKey) => {
  const option = AVATAR_OPTIONS.find((item) => item.key === avatar);
  return option?.url ?? "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo";
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ProfileUser | null>(null);

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
        setUser(data.user);
        setNickname(data.user.name ?? "");
        setCleanId(data.user.cleanId ?? "");
        setAvatar(data.user.avatar ?? "AVATAR_LEO");
      } catch {
        if (isMounted) {
          setStatus("Unable to load profile.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const resetFormToUser = () => {
    if (!user) return;
    setNickname(user.name ?? "");
    setCleanId(user.cleanId ?? "");
    setAvatar(user.avatar ?? "AVATAR_LEO");
  };

  const startEdit = () => {
    resetFormToUser();
    setStatus("");
    setIsDeleteConfirming(false);
    setIsEditing(true);
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
    if (!CLEAN_ID_REGEX.test(normalizedCleanId)) {
      setStatus("CleanID must be 3-20 chars: lowercase letters, numbers, underscore.");
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

      setUser(refreshData.user as ProfileUser);
      setNickname(refreshData.user.name ?? "");
      setCleanId(refreshData.user.cleanId ?? "");
      setAvatar(refreshData.user.avatar ?? "AVATAR_LEO");
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

  if (loading) {
    return (
      <div className="profile-shell">
        <main className="profile-card">
          <p className="profile-loading">Loading profile...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-shell">
        <main className="profile-card">
          <p className="profile-loading">Profile not found.</p>
        </main>
      </div>
    );
  }

  const activeAvatar = isEditing ? avatar : user.avatar;
  const activeName = isEditing ? nickname : user.name;
  const activeCleanId = isEditing ? cleanId : user.cleanId;
  const selectedOwnedGroup = ownedGroups.find((group) => group.id === selectedGroupId) ?? null;

  return (
    <div className="profile-shell">
      <main className="profile-card">
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
            {isLoggingOut ? "Logging out..." : "Back to Login"}
          </button>
        </header>

        <section className="profile-summary">
          <img
            className="profile-avatar-main"
            src={avatarUrl(activeAvatar)}
            alt={`${activeName || "User"} avatar`}
          />
          <div className="profile-summary-text">
            <h2>{activeName}</h2>
            <p>@{activeCleanId}</p>
            <span>{user.email}</span>
          </div>
        </section>

        {!isEditing && (
          <div className="profile-top-actions">
            <button type="button" className="profile-action-row" onClick={startEdit}>
              <span className="profile-action-row-title">Edit Profile</span>
              <span className="profile-action-row-arrow" aria-hidden="true">
                &gt;
              </span>
            </button>
            <button
              type="button"
              className="profile-action-row"
              onClick={() => void handleToggleGroupAccess()}
            >
              <span className="profile-action-row-title">
                {showGroupAccess ? "Hide Group Access" : "Manage Group Access"}
              </span>
              <span className="profile-action-row-arrow" aria-hidden="true">
                &gt;
              </span>
            </button>
          </div>
        )}

        {isEditing && (
          <form className="profile-form" onSubmit={handleSave}>
            <fieldset className="profile-avatars">
              <legend>Avatar</legend>
              <div className="profile-avatar-grid">
                {AVATAR_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    className={`profile-avatar-option ${avatar === item.key ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="avatar"
                      value={item.key}
                      checked={avatar === item.key}
                      onChange={() => setAvatar(item.key)}
                    />
                    <img
                      src={item.url}
                      alt={item.label}
                    />
                    <span>{item.label}</span>
                  </label>
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
              Use 3-20 characters: lowercase letters, numbers, underscore.
            </p>

            <div className="profile-actions">
              <button
                type="button"
                className="profile-secondary-btn"
                onClick={cancelEdit}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className="profile-primary-btn" disabled={isSaving}>
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
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
