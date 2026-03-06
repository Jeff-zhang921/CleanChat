import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { BACKEND_URL } from "../config";
import { GROUP_AVATAR_OPTIONS, type GroupAvatarKey } from "../constants/groupAvatars";
import "./GroupConversationPage.css";

type SessionUser = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
};

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  avatarKey: GroupAvatarKey;
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

const formatTime = (time?: string | null) => {
  if (!time) return "New";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "New";
  return date.toLocaleDateString();
};

const GroupConversationPage = () => {
  const navigate = useNavigate();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState("Loading groups...");
  const [query, setQuery] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupAvatarKey, setNewGroupAvatarKey] = useState<GroupAvatarKey>(GROUP_AVATAR_OPTIONS[0].key);
  const [newGroupRequiresApproval, setNewGroupRequiresApproval] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [workingGroupId, setWorkingGroupId] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<"join" | "leave" | "delete" | "avatar" | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupSummary | null>(null);
  const [pendingAvatarGroup, setPendingAvatarGroup] = useState<GroupSummary | null>(null);
  const [pendingAvatarKey, setPendingAvatarKey] = useState<GroupAvatarKey>(GROUP_AVATAR_OPTIONS[0].key);

  const refreshGroups = async () => {
    const response = await fetch(`${BACKEND_URL}/chat/groups`, {
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(data.message || data.error || "Failed to load groups.");
      return;
    }

    const data = await response.json().catch(() => ({}));
    const incoming = Array.isArray(data.groups) ? data.groups : [];
    setGroups(incoming);
    setStatus("");
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const meResponse = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: "include",
        });
        if (!meResponse.ok) {
          if (isMounted) setStatus("Please login first.");
          return;
        }

        const meData = await meResponse.json().catch(() => ({}));
        if (!meData.user) {
          if (isMounted) setStatus("Please login first.");
          return;
        }

        if (isMounted) {
          setMe(meData.user);
          await refreshGroups();
        }
      } catch {
        if (isMounted) setStatus("Failed to load groups.");
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return groups;
    return groups.filter(
      (group) =>
        group.name.toLowerCase().includes(normalizedQuery) ||
        group.description.toLowerCase().includes(normalizedQuery)
    );
  }, [groups, query]);

  const openGroupChat = (group: GroupSummary) => {
    navigate("/chat", {
      state: {
        chatType: "group",
        groupId: group.id,
        other: group.name,
        avatarUrl: group.avatarUrl,
      },
    });
  };

  const handleJoinGroup = async (group: GroupSummary) => {
    setWorkingGroupId(group.id);
    setWorkingAction("join");
    setStatus(`Joining ${group.name}...`);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/join`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to join group.");
        return;
      }

      const joinedGroup = data.group as GroupSummary | undefined;
      setGroups((prev) =>
        prev.map((item) => (item.id === group.id ? joinedGroup ?? { ...item, joined: true } : item))
      );
      if (data.pendingApproval) {
        setStatus(data.message || "Join request sent. Wait for owner approval.");
        return;
      }
      setStatus("");
      openGroupChat(joinedGroup ?? { ...group, joined: true, joinRequestStatus: "none" });
    } catch {
      setStatus("Failed to join group.");
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim().replace(/\s+/g, " ");
    const description = newGroupDescription.trim();
    if (name.length < 2 || name.length > 48) {
      setStatus("Group name must be 2-48 characters.");
      return;
    }
    if (description.length > 180) {
      setStatus("Description must be 180 characters or less.");
      return;
    }

    setIsCreating(true);
    setStatus("Creating group...");
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          description,
          requiresApproval: newGroupRequiresApproval,
          avatarKey: newGroupAvatarKey,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to create group.");
        return;
      }

      const createdGroup = data.group as GroupSummary | undefined;
      if (!createdGroup) {
        setStatus("Group created but response is missing group data.");
        return;
      }
      setGroups((prev) => [createdGroup, ...prev.filter((item) => item.id !== createdGroup.id)]);
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupAvatarKey(GROUP_AVATAR_OPTIONS[0].key);
      setNewGroupRequiresApproval(false);
      setStatus("");
      openGroupChat(createdGroup);
    } catch {
      setStatus("Failed to create group.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleLeaveGroup = async (group: GroupSummary) => {
    setWorkingGroupId(group.id);
    setWorkingAction("leave");
    setStatus(`Leaving ${group.name}...`);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/leave`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to leave group.");
        return;
      }

      const leftGroup = data.group as GroupSummary | undefined;
      setGroups((prev) =>
        prev.map((item) =>
          item.id === group.id
            ? leftGroup ?? { ...item, joined: false, memberCount: Math.max(0, item.memberCount - 1) }
            : item
        )
      );
      setStatus("");
    } catch {
      setStatus("Failed to leave group.");
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
    }
  };

  const requestDeleteGroup = (group: GroupSummary) => {
    setPendingDeleteGroup(group);
  };

  const requestAvatarChange = (group: GroupSummary) => {
    setPendingAvatarGroup(group);
    setPendingAvatarKey(group.avatarKey);
  };

  const handleConfirmDeleteGroup = async () => {
    if (!pendingDeleteGroup) return;
    const group = pendingDeleteGroup;

    setWorkingGroupId(group.id);
    setWorkingAction("delete");
    setStatus(`Deleting ${group.name}...`);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to delete group.");
        return;
      }
      setGroups((prev) => prev.filter((item) => item.id !== group.id));
      setStatus("");
    } catch {
      setStatus("Failed to delete group.");
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
      setPendingDeleteGroup(null);
    }
  };

  const handleConfirmAvatarChange = async () => {
    if (!pendingAvatarGroup) return;
    const group = pendingAvatarGroup;

    setWorkingGroupId(group.id);
    setWorkingAction("avatar");
    setStatus(`Updating avatar for ${group.name}...`);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarKey: pendingAvatarKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || "Failed to update avatar.");
        return;
      }
      const updatedGroup = data.group as GroupSummary | undefined;
      const selectedAvatarUrl =
        GROUP_AVATAR_OPTIONS.find((option) => option.key === pendingAvatarKey)?.url ?? group.avatarUrl;
      setGroups((prev) =>
        prev.map((item) =>
          item.id === group.id
            ? updatedGroup ?? { ...item, avatarKey: pendingAvatarKey, avatarUrl: selectedAvatarUrl }
            : item
        )
      );
      setStatus("");
      setPendingAvatarGroup(null);
    } catch {
      setStatus("Failed to update avatar.");
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
    }
  };

  const handleJoinOrOpen = async (group: GroupSummary) => {
    if (group.joined) {
      openGroupChat(group);
      return;
    }
    await handleJoinGroup(group);
  };

  return (
    <div className="conversations-page groups-page">
      <div className="conversations-shell">
        <p className="search-owner-name">{me?.name || me?.cleanId || me?.email}</p>

        <div className="conversations-toolbar">
          <div className="search-field">
            <label htmlFor="group-search">Search groups</label>
            <input
              id="group-search"
              type="text"
              placeholder="Search by group name"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>

        <div className="conversations-meta">
          <h2>Groups</h2>
        </div>

        <section className="group-create-panel">
          <h3>Create Group</h3>
          <div className="group-create-grid">
            <input
              type="text"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Group name (2-48 chars)"
              maxLength={48}
              disabled={isCreating}
            />
            <input
              type="text"
              value={newGroupDescription}
              onChange={(event) => setNewGroupDescription(event.target.value)}
              placeholder="Description (optional, max 180)"
              maxLength={180}
              disabled={isCreating}
            />
            <label className="group-create-toggle">
              <input
                type="checkbox"
                checked={newGroupRequiresApproval}
                onChange={(event) => setNewGroupRequiresApproval(event.target.checked)}
                disabled={isCreating}
              />
              Require verification to join
            </label>
            <button type="button" className="group-action create" onClick={handleCreateGroup} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </button>
          </div>
          <div className="group-avatar-picker">
            <p>Group avatar</p>
            <div className="group-avatar-options">
              {GROUP_AVATAR_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`group-avatar-option ${newGroupAvatarKey === option.key ? "active" : ""}`}
                  onClick={() => setNewGroupAvatarKey(option.key)}
                  disabled={isCreating}
                >
                  <img src={option.url} alt={`${option.label} avatar`} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {status && <div className="status-text">{status}</div>}

        {!status && filteredGroups.length === 0 && <div className="status-text">No groups found.</div>}

        {!status && filteredGroups.length > 0 && (
          <section className="conversations-list">
            {filteredGroups.map((group) => {
              const isWorking = workingGroupId === group.id;
              const isPendingRequest = group.joinRequestStatus === "pending";
              const actionLabel = isPendingRequest
                ? "Requested"
                : isWorking && workingAction === "join"
                  ? group.requiresApproval
                    ? "Requesting..."
                    : "Joining..."
                  : group.requiresApproval
                    ? "Request Join"
                    : "Join Group";
              const leaveLabel = isWorking && workingAction === "leave" ? "Leaving..." : "Leave";
              const deleteLabel = isWorking && workingAction === "delete" ? "Deleting..." : "Delete";
              const avatarLabel = isWorking && workingAction === "avatar" ? "Saving..." : "Avatar";
              const canOpenByCard = group.joined && !isWorking && !isCreating;

              return (
                <article
                  key={group.id}
                  className={`conversation-card group-card ${group.joined ? "joined" : "not-joined"}`}
                  onClick={() => {
                    if (canOpenByCard) openGroupChat(group);
                  }}
                  role={canOpenByCard ? "button" : undefined}
                  onKeyDown={(event) => {
                    if (canOpenByCard && (event.key === "Enter" || event.key === " ")) {
                      openGroupChat(group);
                    }
                  }}
                >
                  <div className="avatar">
                    <img src={group.avatarUrl} alt={`${group.name} avatar`} />
                  </div>
                    <div className="conversation-body">
                      <div className="conversation-top">
                        <h3>{group.name}</h3>
                        <p className="role">
                          {group.joined ? "Joined" : isPendingRequest ? "Requested" : "Discover"}
                        </p>
                        <span className="time">{formatTime(group.lastMessageAt)}</span>
                      </div>
                      <p className="preview">{group.lastMessagePreview}</p>
                      <p className="conversation-subline">
                        {group.memberCount} members - {group.description} -{" "}
                        {group.requiresApproval ? "Verification required" : "Open join"}
                        {group.isOwner && group.pendingRequestCount > 0
                          ? ` - ${group.pendingRequestCount} pending request(s)`
                          : ""}
                      </p>
                    </div>
                  {group.joined ? (
                    <div className="group-action-row">
                      <button
                        type="button"
                        className="group-action open"
                        disabled={isWorking || isCreating}
                        onClick={(event) => {
                          event.stopPropagation();
                          openGroupChat(group);
                        }}
                      >
                        Open Chat
                      </button>
                      <button
                        type="button"
                        className="group-action leave"
                        disabled={isWorking || isCreating}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleLeaveGroup(group);
                        }}
                      >
                        {leaveLabel}
                      </button>
                      {group.isOwner && (
                        <button
                          type="button"
                          className="group-action avatar"
                          disabled={isWorking || isCreating}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestAvatarChange(group);
                          }}
                        >
                          {avatarLabel}
                        </button>
                      )}
                      {group.isOwner && (
                        <button
                          type="button"
                          className="group-action delete"
                          disabled={isWorking || isCreating}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestDeleteGroup(group);
                          }}
                        >
                          {deleteLabel}
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="group-action-row">
                      <button
                        type="button"
                        className="group-action join"
                        disabled={isWorking || isCreating || isPendingRequest}
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleJoinOrOpen(group);
                        }}
                      >
                        {actionLabel}
                      </button>
                      {group.isOwner && (
                        <button
                          type="button"
                          className="group-action avatar"
                          disabled={isWorking || isCreating}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestAvatarChange(group);
                          }}
                        >
                          {avatarLabel}
                        </button>
                      )}
                      {group.isOwner && (
                        <button
                          type="button"
                          className="group-action delete"
                          disabled={isWorking || isCreating}
                          onClick={(event) => {
                            event.stopPropagation();
                            requestDeleteGroup(group);
                          }}
                        >
                          {deleteLabel}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </section>
        )}
      </div>
      {pendingDeleteGroup && (
        <div className="groups-delete-overlay" role="presentation">
          <div className="groups-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
            <h3 id="delete-group-title">Delete "{pendingDeleteGroup.name}"?</h3>
            <p>
              This will permanently delete the group, all group messages, and all membership data for this group.
              This action cannot be undone.
            </p>
            <div className="groups-delete-actions">
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setPendingDeleteGroup(null)}
                disabled={workingAction === "delete"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="group-action delete"
                onClick={() => {
                  void handleConfirmDeleteGroup();
                }}
                disabled={workingAction === "delete"}
              >
                {workingAction === "delete" ? "Deleting..." : "Delete Group"}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingAvatarGroup && (
        <div className="groups-avatar-overlay" role="presentation">
          <div className="groups-avatar-modal" role="dialog" aria-modal="true" aria-labelledby="group-avatar-title">
            <h3 id="group-avatar-title">Choose Avatar for "{pendingAvatarGroup.name}"</h3>
            <div className="groups-avatar-options">
              {GROUP_AVATAR_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`groups-avatar-option ${pendingAvatarKey === option.key ? "active" : ""}`}
                  onClick={() => setPendingAvatarKey(option.key)}
                  disabled={workingAction === "avatar"}
                >
                  <img src={option.url} alt={`${option.label} avatar`} />
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
            <div className="groups-delete-actions">
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setPendingAvatarGroup(null)}
                disabled={workingAction === "avatar"}
              >
                Cancel
              </button>
              <button
                type="button"
                className="group-action create"
                onClick={() => {
                  void handleConfirmAvatarChange();
                }}
                disabled={workingAction === "avatar"}
              >
                {workingAction === "avatar" ? "Saving..." : "Save Avatar"}
              </button>
            </div>
          </div>
        </div>
      )}
      <BottomNav />
    </div>
  );
};

export default GroupConversationPage;
