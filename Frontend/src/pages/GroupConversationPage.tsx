import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import Badge from "../components/Badge";
import { BACKEND_URL } from "../config";
import { GROUP_AVATAR_OPTIONS, type GroupAvatarKey } from "../constants/groupAvatars";
import { useNotificationBadges } from "../state/notificationBadgeContext";
import {
  GROUPS_REALTIME_EVENT,
  type GroupsRealtimeDetail,
} from "../utils/conversationEvents";
import { getSystemMessageText } from "../utils/systemMessages";
import "./GroupConversationPage.css";

type SessionUser = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
};

type InviteCandidate = {
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

type GroupInvitationEntry = {
  id: number;
  groupId: string;
  createdAt: string;
  group: GroupSummary;
  inviter: InviteCandidate;
};

const formatTime = (time?: string | null, fallback = "") => {
  if (!time) return fallback;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString();
};

const GROUP_AVATAR_LABEL_KEYS: Record<GroupAvatarKey, string> = {
  orbit: "groups.avatarOptionOrbit",
  pixel: "groups.avatarOptionPixel",
  flare: "groups.avatarOptionFlare",
  bloom: "groups.avatarOptionBloom",
  canyon: "groups.avatarOptionCanyon",
  tide: "groups.avatarOptionTide",
};

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10.75 4.75a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm0-2a8 8 0 1 1 4.95 14.28l4.01 4.01a1 1 0 1 1-1.42 1.41l-4-4A8 8 0 0 1 10.75 2.75Z"
      fill="currentColor"
    />
  </svg>
);

const GroupConversationPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { refreshPendingCounts } = useNotificationBadges();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState(() => t("groups.loadingGroups"));
  const [query, setQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
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
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const [inviteGroupId, setInviteGroupId] = useState("");
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<InviteCandidate[]>([]);
  const [isSearchingInvitees, setIsSearchingInvitees] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [isInvitationPanelOpen, setIsInvitationPanelOpen] = useState(false);
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitationEntry[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [processingInvitationId, setProcessingInvitationId] = useState<number | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const statusToastTimeoutRef = useRef<number | null>(null);

  const showStatusToast = (toastMessage: string, durationMs = 2200) => {
    setStatus(toastMessage);
    if (statusToastTimeoutRef.current !== null) {
      window.clearTimeout(statusToastTimeoutRef.current);
    }

    statusToastTimeoutRef.current = window.setTimeout(() => {
      setStatus((current) => (current === toastMessage ? "" : current));
      statusToastTimeoutRef.current = null;
    }, durationMs);
  };

  useEffect(() => {
    return () => {
      if (statusToastTimeoutRef.current !== null) {
        window.clearTimeout(statusToastTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isSearchExpanded) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchExpanded]);

  const refreshGroups = useCallback(async () => {
    const response = await fetch(`${BACKEND_URL}/chat/groups`, {
      credentials: "include",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setStatus(data.message || data.error || t("groups.loadingFailed"));
      return;
    }

    const data = await response.json().catch(() => ({}));
    const incoming = Array.isArray(data.groups) ? data.groups : [];
    setGroups(incoming);
    setStatus("");
  }, [t]);

  const refreshGroupInvitations = useCallback(async () => {
    setIsLoadingInvitations(true);
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/invitations/received`, {
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInviteStatus(data.message || data.error || t("groups.invitationsLoadFailed"));
        return;
      }
      setGroupInvitations(Array.isArray(data.invitations) ? data.invitations : []);
    } catch {
      setInviteStatus(t("groups.invitationsLoadFailed"));
    } finally {
      setIsLoadingInvitations(false);
    }
  }, [t]);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      try {
        const meResponse = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: "include",
        });
        if (!meResponse.ok) {
          if (isMounted) setStatus(t("groups.loginRequired"));
          return;
        }

        const meData = await meResponse.json().catch(() => ({}));
        if (!meData.user) {
          if (isMounted) setStatus(t("groups.loginRequired"));
          return;
        }

        if (isMounted) {
          setMe(meData.user);
          await refreshGroups();
          await refreshGroupInvitations();
        }
      } catch {
        if (isMounted) setStatus(t("groups.loadingFailed"));
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [refreshGroupInvitations, refreshGroups, t]);

  useEffect(() => {
    const handleGroupsRealtime = (event: Event) => {
      const detail = (event as CustomEvent<GroupsRealtimeDetail>).detail;
      if (!detail?.reason) {
        return;
      }

      void refreshGroups();
      if (
        detail.reason === "invitation-new" ||
        detail.reason === "invitation-resolved"
      ) {
        void refreshGroupInvitations();
      }
    };

    window.addEventListener(
      GROUPS_REALTIME_EVENT,
      handleGroupsRealtime as EventListener,
    );

    return () => {
      window.removeEventListener(
        GROUPS_REALTIME_EVENT,
        handleGroupsRealtime as EventListener,
      );
    };
  }, [refreshGroupInvitations, refreshGroups]);

  useEffect(() => {
    const joinedGroupIds = groups.filter((group) => group.joined).map((group) => group.id);
    if (joinedGroupIds.length === 0) {
      setInviteGroupId("");
      return;
    }
    if (!inviteGroupId || !joinedGroupIds.includes(inviteGroupId)) {
      setInviteGroupId(joinedGroupIds[0]);
    }
  }, [groups, inviteGroupId]);

  useEffect(() => {
    if (!isInvitePanelOpen) {
      return;
    }

    const normalizedQuery = inviteQuery.trim();
    if (!normalizedQuery) {
      setInviteCandidates([]);
      setIsSearchingInvitees(false);
      return;
    }

    let isMounted = true;
    setIsSearchingInvitees(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/chat/users/search?q=${encodeURIComponent(normalizedQuery)}`,
          { credentials: "include" },
        );
        const data = await response.json().catch(() => ({}));
        if (!isMounted) return;
        if (!response.ok) {
          setInviteStatus(data.message || data.error || t("groups.inviteSearchFailed"));
          setInviteCandidates([]);
          return;
        }
        setInviteCandidates(Array.isArray(data.users) ? data.users : []);
      } catch {
        if (isMounted) {
          setInviteStatus(t("groups.inviteSearchFailed"));
          setInviteCandidates([]);
        }
      } finally {
        if (isMounted) {
          setIsSearchingInvitees(false);
        }
      }
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [inviteQuery, isInvitePanelOpen, t]);

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
        fromPath: "/groups",
      },
    });
  };

  const handleJoinGroup = async (group: GroupSummary) => {
    setWorkingGroupId(group.id);
    setWorkingAction("join");
    setStatus(t("groups.joiningGroup", { name: group.name }));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/join`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("groups.joinFailed"));
        return;
      }

      const joinedGroup = data.group as GroupSummary | undefined;
      setGroups((prev) =>
        prev.map((item) => (item.id === group.id ? joinedGroup ?? { ...item, joined: true } : item))
      );
      if (data.pendingApproval) {
        showStatusToast(data.message || t("groups.joinRequestSent"));
        return;
      }
      setStatus("");
      openGroupChat(joinedGroup ?? { ...group, joined: true, joinRequestStatus: "none" });
    } catch {
      setStatus(t("groups.joinFailed"));
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
    }
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim().replace(/\s+/g, " ");
    const description = newGroupDescription.trim();
    if (name.length < 2 || name.length > 48) {
      setStatus(t("groups.groupNameLength"));
      return;
    }
    if (description.length > 180) {
      setStatus(t("groups.groupDescriptionLength"));
      return;
    }

    setIsCreating(true);
    setStatus(t("groups.creatingGroup"));
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
        setStatus(data.message || data.error || t("groups.createFailed"));
        return;
      }

      const createdGroup = data.group as GroupSummary | undefined;
      if (!createdGroup) {
        setStatus(t("groups.createMissingData"));
        return;
      }
      setGroups((prev) => [createdGroup, ...prev.filter((item) => item.id !== createdGroup.id)]);
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupAvatarKey(GROUP_AVATAR_OPTIONS[0].key);
      setNewGroupRequiresApproval(false);
      setIsCreatePanelOpen(false);
      setStatus("");
      openGroupChat(createdGroup);
    } catch {
      setStatus(t("groups.createFailed"));
    } finally {
      setIsCreating(false);
    }
  };

  const handleLeaveGroup = async (group: GroupSummary) => {
    setWorkingGroupId(group.id);
    setWorkingAction("leave");
    setStatus(t("groups.leavingGroup", { name: group.name }));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/leave`, {
        method: "POST",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("groups.leaveFailed"));
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
      setStatus(t("groups.leaveFailed"));
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
    setStatus(t("groups.deletingGroup", { name: group.name }));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("groups.deleteFailed"));
        return;
      }
      setGroups((prev) => prev.filter((item) => item.id !== group.id));
      setStatus("");
    } catch {
      setStatus(t("groups.deleteFailed"));
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
    setStatus(t("groups.updatingAvatar", { name: group.name }));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/avatar`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ avatarKey: pendingAvatarKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("groups.updateAvatarFailed"));
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
      setStatus(t("groups.updateAvatarFailed"));
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

  const openInvitePanel = () => {
    const firstJoinedGroup = groups.find((group) => group.joined);
    if (!firstJoinedGroup) {
      setStatus(t("groups.inviteJoinFirst"));
      return;
    }
    setInviteGroupId((current) => current || firstJoinedGroup.id);
    setInviteQuery("");
    setInviteCandidates([]);
    setInviteStatus("");
    setIsInvitePanelOpen(true);
  };

  const openInvitationsPanel = () => {
    setInviteStatus("");
    setIsInvitationPanelOpen(true);
    void refreshGroupInvitations();
  };

  const handleInviteCandidate = async (candidate: InviteCandidate) => {
    const group = groups.find((item) => item.id === inviteGroupId);
    if (!group) {
      setInviteStatus(t("groups.inviteChooseGroup"));
      return;
    }

    setIsSendingInvite(true);
    setInviteStatus(t("groups.inviteSending", { name: candidate.cleanId }));
    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(group.id)}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetUserId: candidate.id }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInviteStatus(data.message || data.error || t("groups.inviteFailed"));
        return;
      }

      const updatedGroup = data.group as GroupSummary | undefined;
      if (updatedGroup) {
        setGroups((prev) =>
          prev.map((item) => (item.id === updatedGroup.id ? updatedGroup : item)),
        );
      }
      setInviteCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      setInviteQuery("");
      setInviteStatus(
        data.alreadyInvited
          ? t("groups.inviteAlreadySent", { name: candidate.cleanId })
          : t("groups.inviteSent", { name: candidate.cleanId, group: group.name }),
      );
    } catch {
      setInviteStatus(t("groups.inviteFailed"));
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleResolveInvitation = async (
    invitation: GroupInvitationEntry,
    action: "accept" | "reject",
  ) => {
    setProcessingInvitationId(invitation.id);
    setInviteStatus(
      action === "accept" ? t("groups.acceptingInvite") : t("groups.rejectingInvite"),
    );
    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/invitations/${invitation.id}/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInviteStatus(
          data.message ||
            data.error ||
            (action === "accept"
              ? t("groups.acceptInviteFailed")
              : t("groups.rejectInviteFailed")),
        );
        return;
      }

      setGroupInvitations((prev) => prev.filter((item) => item.id !== invitation.id));
      void refreshPendingCounts();
      if (action === "accept") {
        const acceptedGroup = data.group as GroupSummary | undefined;
        if (acceptedGroup) {
          setGroups((prev) => {
            const exists = prev.some((item) => item.id === acceptedGroup.id);
            return exists
              ? prev.map((item) => (item.id === acceptedGroup.id ? acceptedGroup : item))
              : [acceptedGroup, ...prev];
          });
        } else {
          await refreshGroups();
        }
        setInviteStatus(t("groups.inviteAccepted", { group: invitation.group.name }));
        return;
      }
      setInviteStatus(t("groups.inviteRejected", { group: invitation.group.name }));
    } catch {
      setInviteStatus(
        action === "accept" ? t("groups.acceptInviteFailed") : t("groups.rejectInviteFailed"),
      );
    } finally {
      setProcessingInvitationId(null);
    }
  };

  const heroName = me?.name || me?.cleanId || me?.email || t("common.cleanChat");
  const hasQuery = query.trim().length > 0;
  const allJoinedGroups = groups.filter((group) => group.joined);
  const joinedGroups = filteredGroups.filter((group) => group.joined);
  const discoverGroups = filteredGroups.filter((group) => !group.joined);
  const invitationCount = groupInvitations.length;
  const isSearchOpen = isSearchExpanded || hasQuery;
  const openSearch = () => {
    setIsSearchExpanded(true);
  };
  const closeSearch = () => {
    setQuery("");
    setIsSearchExpanded(false);
  };
  const getGroupAvatarLabel = (key: GroupAvatarKey) => t(GROUP_AVATAR_LABEL_KEYS[key]);

  const renderGroupCard = (group: GroupSummary) => {
    const isWorking = workingGroupId === group.id;
    const isPendingRequest = group.joinRequestStatus === "pending";
    const actionLabel = isPendingRequest
      ? t("groups.requested")
      : isWorking && workingAction === "join"
        ? group.requiresApproval
          ? t("groups.requesting")
          : t("groups.joining")
        : group.requiresApproval
          ? t("groups.requestJoin")
          : t("groups.joinGroup");
    const leaveLabel = isWorking && workingAction === "leave" ? t("groups.leaving") : t("groups.leave");
    const deleteLabel = isWorking && workingAction === "delete" ? t("groups.deleting") : t("groups.delete");
    const avatarLabel = isWorking && workingAction === "avatar" ? t("groups.saving") : t("groups.avatar");
    const canOpenByCard = group.joined && !isWorking && !isCreating;
    const pendingRequestCount = group.isOwner ? group.pendingRequestCount : 0;
    const previewText =
      getSystemMessageText(group.lastMessagePreview, {
        chatRequestAccepted: t("chat.requestAcceptedSystem"),
        groupMemberJoined: (name) => t("chat.memberJoined", { name }),
      }) ?? group.lastMessagePreview;

    return (
      <article
        key={group.id}
        className={`conversation-card group-card ${group.joined ? "joined" : "not-joined"}`}
        onClick={() => {
          if (canOpenByCard) openGroupChat(group);
        }}
        role={canOpenByCard ? "button" : undefined}
        tabIndex={canOpenByCard ? 0 : -1}
        onKeyDown={(event) => {
          if (canOpenByCard && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            openGroupChat(group);
          }
        }}
      >
        <div className="avatar group-card-avatar">
          <img src={group.avatarUrl} alt={t("groups.groupAvatarAlt", { name: group.name })} />
          <Badge
            count={pendingRequestCount}
            size="compact"
            className="group-card-pending-badge"
            ariaLabel={t("groups.pendingRequests", { count: pendingRequestCount })}
          />
        </div>
        <div className="conversation-body">
          <div className="conversation-top">
            <h3>{group.name}</h3>
            <p className="role">
              {group.joined ? t("groups.roleJoined") : isPendingRequest ? t("groups.roleRequested") : t("groups.roleDiscover")}
            </p>
            <span className="time">{formatTime(group.lastMessageAt, t("groups.newTag"))}</span>
          </div>
          <p className="preview">{previewText}</p>
          <p className="conversation-subline">
            {t("groups.groupMetaLine", {
              members: t("groups.members", { count: group.memberCount }),
              description: group.description || t("groups.groupFallback"),
              joinRule: group.requiresApproval ? t("groups.verificationRequired") : t("groups.openJoin"),
            })}
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
              {t("groups.openChat")}
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
  };

  return (
    <div className="conversations-page groups-page">
      <div className="conversations-shell">
        <header className="conversations-hero conversations-hero-compact">
          <div className="conversations-title-wrap">
            <p className="eyebrow">{heroName}</p>
            <h1 className="page-title">{t("groups.title")}</h1>
            <p className="page-copy">
              {t("groups.pageCopy")}
            </p>
          </div>
        </header>

        <div className={`conversations-toolbar ${isSearchOpen ? "search-open" : ""}`}>
          {!isSearchOpen && (
            <button
              type="button"
              className="search-launcher"
              aria-label={t("groups.openSearch")}
              onClick={openSearch}
            >
              <SearchGlyph />
            </button>
          )}
          <div className={`search-shell ${isSearchOpen ? "expanded" : ""}`}>
            <div className="search-field">
              <label className="sr-only" htmlFor="group-search">
                {t("groups.searchGroups")}
              </label>
              <div className="search-input-wrap">
                <span className="search-icon">
                  <SearchGlyph />
                </span>
                <input
                  ref={searchInputRef}
                  id="group-search"
                  type="text"
                  placeholder={t("groups.searchPlaceholder")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={openSearch}
                  onBlur={() => {
                    if (!query.trim()) {
                      setIsSearchExpanded(false);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeSearch();
                    }
                  }}
                />
                <button
                  type="button"
                  className="search-dismiss"
                  aria-label={t("groups.closeSearch")}
                  onClick={closeSearch}
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="groups-stage-bar">
          <div className="groups-stage-copy">
            <h2>{hasQuery ? t("groups.searchResults") : t("groups.yourCirclesFirst")}</h2>
            <span>
              {hasQuery
                ? t("groups.visibleCount", { count: filteredGroups.length })
                : t("groups.joinedAndDiscover", {
                    joined: joinedGroups.length,
                    discover: discoverGroups.length,
                  })}
            </span>
          </div>
          <div className="groups-stage-actions">
            {allJoinedGroups.length > 0 && (
              <button
                type="button"
                className="group-action invite groups-invite-trigger"
                onClick={openInvitePanel}
              >
                <span aria-hidden="true">+</span>
                {t("groups.invitePeople")}
              </button>
            )}
            <button
              type="button"
              className="group-action invitations groups-invitations-trigger"
              onClick={openInvitationsPanel}
            >
              {t("groups.invitationsButton")}
              {invitationCount > 0 && (
                <span className="groups-invitations-count">{invitationCount}</span>
              )}
            </button>
            <button
              type="button"
              className="group-action create groups-create-trigger"
              onClick={() => setIsCreatePanelOpen(true)}
            >
              {t("groups.createGroup")}
            </button>
          </div>
        </div>

        {status && <div className="status-text">{status}</div>}

        {!status && filteredGroups.length === 0 && <div className="status-text">{t("groups.noGroupsFound")}</div>}

        {filteredGroups.length > 0 && (
          <div className="groups-sections">
            {joinedGroups.length > 0 && (
              <section className="groups-section" aria-label={t("groups.joinedGroups")}>
                <div className="groups-section-head">
                  <div>
                    <h3>{t("groups.joinedGroups")}</h3>
                    <p>{t("groups.joinedGroupsHint")}</p>
                  </div>
                </div>
                <div className="conversations-list">{joinedGroups.map(renderGroupCard)}</div>
              </section>
            )}

            {discoverGroups.length > 0 && (
              <section className="groups-section" aria-label={t("groups.discoverGroups")}>
                <div className="groups-section-head">
                  <div>
                    <h3>{joinedGroups.length > 0 ? t("groups.discoverMore") : t("groups.communityRooms")}</h3>
                    <p>{t("groups.discoverHint")}</p>
                  </div>
                </div>
                <div className="conversations-list">{discoverGroups.map(renderGroupCard)}</div>
              </section>
            )}
          </div>
        )}
      </div>
      {allJoinedGroups.length > 0 && (
        <button
          type="button"
          className="group-action invite groups-fab"
          aria-label={t("groups.invitePeople")}
          onClick={openInvitePanel}
        >
          <span className="groups-fab-icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      )}
      {isCreatePanelOpen && (
        <div className="groups-create-overlay" role="presentation" onClick={() => setIsCreatePanelOpen(false)}>
          <div
            className="groups-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-group-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="groups-create-head">
              <div>
                <p className="eyebrow">{t("groups.newRoom")}</p>
                <h3 id="create-group-title">{t("groups.createGroup")}</h3>
                <p>{t("groups.createGroupHint")}</p>
              </div>
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setIsCreatePanelOpen(false)}
                disabled={isCreating}
              >
                {t("common.close")}
              </button>
            </div>

            <section className="group-create-panel">
              <div className="group-create-grid">
                <input
                  type="text"
                  value={newGroupName}
                  onChange={(event) => setNewGroupName(event.target.value)}
                  placeholder={t("groups.groupNamePlaceholder")}
                  maxLength={48}
                  disabled={isCreating}
                />
                <input
                  type="text"
                  value={newGroupDescription}
                  onChange={(event) => setNewGroupDescription(event.target.value)}
                  placeholder={t("groups.groupDescriptionPlaceholder")}
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
                  {t("groups.requireVerification")}
                </label>
                <button type="button" className="group-action create" onClick={handleCreateGroup} disabled={isCreating}>
                  {isCreating ? t("groups.creating") : t("common.create")}
                </button>
              </div>
              <div className="group-avatar-picker">
                <p>{t("groups.groupAvatar")}</p>
                <div className="group-avatar-options">
                  {GROUP_AVATAR_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      className={`group-avatar-option ${newGroupAvatarKey === option.key ? "active" : ""}`}
                      onClick={() => setNewGroupAvatarKey(option.key)}
                      disabled={isCreating}
                    >
                      <img src={option.url} alt={t("groups.avatarOptionAlt", { label: getGroupAvatarLabel(option.key) })} />
                      <span>{getGroupAvatarLabel(option.key)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
      {isInvitePanelOpen && (
        <div className="groups-invite-overlay" role="presentation" onClick={() => setIsInvitePanelOpen(false)}>
          <div
            className="groups-invite-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-invite-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="groups-create-head">
              <div>
                <p className="eyebrow">{t("groups.inviteEyebrow")}</p>
                <h3 id="group-invite-title">{t("groups.invitePeople")}</h3>
                <p>{t("groups.invitePeopleHint")}</p>
              </div>
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setIsInvitePanelOpen(false)}
                disabled={isSendingInvite}
              >
                {t("common.close")}
              </button>
            </div>

            {allJoinedGroups.length === 0 ? (
              <p className="groups-invite-empty">{t("groups.inviteNoJoinedGroups")}</p>
            ) : (
              <section className="groups-invite-panel">
                <label className="groups-invite-field">
                  <span>{t("groups.inviteGroupLabel")}</span>
                  <select
                    value={inviteGroupId}
                    onChange={(event) => setInviteGroupId(event.target.value)}
                    disabled={isSendingInvite}
                  >
                    {allJoinedGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="groups-invite-field">
                  <span>{t("groups.inviteSearchLabel")}</span>
                  <input
                    type="search"
                    value={inviteQuery}
                    onChange={(event) => {
                      setInviteQuery(event.target.value);
                      setInviteStatus("");
                    }}
                    placeholder={t("groups.inviteSearchPlaceholder")}
                    disabled={isSendingInvite}
                  />
                </label>

                <div className="groups-invite-results" aria-live="polite">
                  {isSearchingInvitees ? (
                    <p>{t("groups.inviteSearching")}</p>
                  ) : inviteQuery.trim().length === 0 ? (
                    <p>{t("groups.inviteSearchIdle")}</p>
                  ) : inviteCandidates.length === 0 ? (
                    <p>{t("groups.inviteSearchEmpty")}</p>
                  ) : (
                    <ul>
                      {inviteCandidates.map((candidate) => (
                        <li key={candidate.id}>
                          <div className="groups-invite-user">
                            <strong>@{candidate.cleanId}</strong>
                            <span>{candidate.name || candidate.email}</span>
                          </div>
                          <button
                            type="button"
                            className="group-action invite"
                            onClick={() => {
                              void handleInviteCandidate(candidate);
                            }}
                            disabled={isSendingInvite}
                          >
                            {isSendingInvite ? t("groups.inviteSendingShort") : t("groups.invite")}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {inviteStatus && (
              <p className="groups-invite-status" role="status">
                {inviteStatus}
              </p>
            )}
          </div>
        </div>
      )}
      {isInvitationPanelOpen && (
        <div className="groups-invitations-overlay" role="presentation" onClick={() => setIsInvitationPanelOpen(false)}>
          <div
            className="groups-invitations-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="group-invitations-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="groups-create-head">
              <div>
                <p className="eyebrow">{t("groups.invitationsEyebrow")}</p>
                <h3 id="group-invitations-title">{t("groups.invitationsTitle")}</h3>
                <p>{t("groups.invitationsHint")}</p>
              </div>
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setIsInvitationPanelOpen(false)}
                disabled={processingInvitationId !== null}
              >
                {t("common.close")}
              </button>
            </div>

            <section className="groups-invitations-list" aria-live="polite">
              {isLoadingInvitations ? (
                <p className="groups-invite-empty">{t("groups.invitationsLoading")}</p>
              ) : groupInvitations.length === 0 ? (
                <p className="groups-invite-empty">{t("groups.invitationsEmpty")}</p>
              ) : (
                <ul>
                  {groupInvitations.map((invitation) => {
                    const isProcessing = processingInvitationId === invitation.id;
                    return (
                      <li key={invitation.id}>
                        <img
                          src={invitation.group.avatarUrl}
                          alt={t("groups.groupAvatarAlt", { name: invitation.group.name })}
                        />
                        <div className="groups-invitations-copy">
                          <strong>{invitation.group.name}</strong>
                          <span>
                            {t("groups.invitationLine", {
                              inviter: invitation.inviter.cleanId,
                            })}
                          </span>
                        </div>
                        <div className="groups-invitations-actions">
                          <button
                            type="button"
                            className="group-action invite"
                            onClick={() => {
                              void handleResolveInvitation(invitation, "accept");
                            }}
                            disabled={processingInvitationId !== null}
                          >
                            {isProcessing ? t("groups.acceptingInvite") : t("groups.acceptInvite")}
                          </button>
                          <button
                            type="button"
                            className="group-action leave"
                            onClick={() => {
                              void handleResolveInvitation(invitation, "reject");
                            }}
                            disabled={processingInvitationId !== null}
                          >
                            {isProcessing ? t("groups.rejectingInvite") : t("groups.rejectInvite")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {inviteStatus && (
              <p className="groups-invite-status" role="status">
                {inviteStatus}
              </p>
            )}
          </div>
        </div>
      )}
      {pendingDeleteGroup && (
        <div className="groups-delete-overlay" role="presentation">
          <div className="groups-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
            <h3 id="delete-group-title">{t("groups.deleteGroupTitle", { name: pendingDeleteGroup.name })}</h3>
            <p>
              {t("groups.deleteGroupHint")}
            </p>
            <div className="groups-delete-actions">
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setPendingDeleteGroup(null)}
                disabled={workingAction === "delete"}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="group-action delete"
                onClick={() => {
                  void handleConfirmDeleteGroup();
                }}
                disabled={workingAction === "delete"}
              >
                {workingAction === "delete" ? t("groups.deleting") : t("groups.deleteGroup")}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingAvatarGroup && (
        <div className="groups-avatar-overlay" role="presentation">
          <div className="groups-avatar-modal" role="dialog" aria-modal="true" aria-labelledby="group-avatar-title">
            <h3 id="group-avatar-title">{t("groups.chooseAvatar", { name: pendingAvatarGroup.name })}</h3>
            <div className="groups-avatar-options">
              {GROUP_AVATAR_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  className={`groups-avatar-option ${pendingAvatarKey === option.key ? "active" : ""}`}
                  onClick={() => setPendingAvatarKey(option.key)}
                  disabled={workingAction === "avatar"}
                >
                  <img src={option.url} alt={t("groups.avatarOptionAlt", { label: getGroupAvatarLabel(option.key) })} />
                  <span>{getGroupAvatarLabel(option.key)}</span>
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
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="group-action create"
                onClick={() => {
                  void handleConfirmAvatarChange();
                }}
                disabled={workingAction === "avatar"}
              >
                {workingAction === "avatar" ? t("groups.saving") : t("groups.saveAvatar")}
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
