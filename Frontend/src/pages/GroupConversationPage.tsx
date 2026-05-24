import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import Badge from "../components/Badge";
import { BACKEND_URL } from "../config";
import {
  COMMUNITY_CATEGORIES,
  findCommunityCategory,
  findCommunitySubcategory,
  isValidCommunityCategoryPair,
  type CommunityCategory,
  type CommunitySubcategory,
} from "../constants/communityCategories";
import { GROUP_AVATAR_OPTIONS, type GroupAvatarKey } from "../constants/groupAvatars";
import { useNotificationBadges } from "../state/notificationBadgeContext";
import {
  dispatchGroupsRealtime,
  dispatchGroupConversationLeft,
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

type GroupKind = "community" | "private";

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
  groupKind?: GroupKind;
  mainCategoryId?: string | null;
  subcategoryId?: string | null;
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

const buildCategoryPath = (mainCategoryId?: string, subcategoryId?: string) => {
  if (!mainCategoryId) return "/groups";
  if (!subcategoryId) return `/groups/${encodeURIComponent(mainCategoryId)}`;
  return `/groups/${encodeURIComponent(mainCategoryId)}/${encodeURIComponent(subcategoryId)}`;
};

const GroupConversationPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as { statusToast?: string } | null) ?? null;
  const incomingStatusToast =
    typeof locationState?.statusToast === "string"
      ? locationState.statusToast.trim()
      : "";
  const { refreshPendingCounts } = useNotificationBadges();
  const [me, setMe] = useState<SessionUser | null>(null);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState(() => t("groups.loadingGroups"));
  const [query, setQuery] = useState("");
  const [searchMainCategoryId, setSearchMainCategoryId] = useState("");
  const [searchSubcategoryId, setSearchSubcategoryId] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [draftSearchMainCategoryId, setDraftSearchMainCategoryId] = useState("");
  const [draftSearchSubcategoryId, setDraftSearchSubcategoryId] = useState("");
  const [isSearchPanelOpen, setIsSearchPanelOpen] = useState(false);
  const [isCreateMenuOpen, setIsCreateMenuOpen] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [createGroupKind, setCreateGroupKind] = useState<GroupKind>("community");
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupDescription, setNewGroupDescription] = useState("");
  const [newGroupMainCategoryId, setNewGroupMainCategoryId] = useState("");
  const [newGroupSubcategoryId, setNewGroupSubcategoryId] = useState("");
  const [newGroupAvatarKey, setNewGroupAvatarKey] = useState<GroupAvatarKey>(GROUP_AVATAR_OPTIONS[0].key);
  const [newGroupRequiresApproval, setNewGroupRequiresApproval] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [workingGroupId, setWorkingGroupId] = useState<string | null>(null);
  const [workingAction, setWorkingAction] = useState<"join" | "leave" | "delete" | "avatar" | null>(null);
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<GroupSummary | null>(null);
  const [pendingLeaveGroup, setPendingLeaveGroup] = useState<GroupSummary | null>(null);
  const [pendingAvatarGroup, setPendingAvatarGroup] = useState<GroupSummary | null>(null);
  const [pendingAvatarKey, setPendingAvatarKey] = useState<GroupAvatarKey>(GROUP_AVATAR_OPTIONS[0].key);
  const [isInvitationPanelOpen, setIsInvitationPanelOpen] = useState(false);
  const [groupInvitations, setGroupInvitations] = useState<GroupInvitationEntry[]>([]);
  const [isLoadingInvitations, setIsLoadingInvitations] = useState(false);
  const [processingInvitationId, setProcessingInvitationId] = useState<number | null>(null);
  const [inviteStatus, setInviteStatus] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const groupsRef = useRef<GroupSummary[]>([]);
  const statusToastTimeoutRef = useRef<number | null>(null);
  const statusToastMessageRef = useRef<string | null>(null);

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const selectedMainCategoryId = pathSegments[1] ? decodeURIComponent(pathSegments[1]) : "";
  const selectedSubcategoryId = pathSegments[2] ? decodeURIComponent(pathSegments[2]) : "";
  const isAtCommunityRoot = !selectedMainCategoryId && !selectedSubcategoryId;
  const selectedMainCategory = findCommunityCategory(selectedMainCategoryId);
  const selectedSubcategory = findCommunitySubcategory(selectedMainCategoryId, selectedSubcategoryId);
  const searchMainCategory = findCommunityCategory(searchMainCategoryId);
  const searchSubcategory = findCommunitySubcategory(searchMainCategoryId, searchSubcategoryId);
  const draftSearchMainCategory = findCommunityCategory(draftSearchMainCategoryId);

  const getCategoryLabel = (category: CommunityCategory) =>
    t(`groups.categories.${category.id}.label`, { defaultValue: category.label });

  const getCategoryDescription = (category: CommunityCategory) =>
    t(`groups.categories.${category.id}.description`, {
      defaultValue: category.description,
    });

  const getSubcategoryLabel = (
    category: CommunityCategory,
    subcategory: CommunitySubcategory,
  ) =>
    t(`groups.categories.${category.id}.subcategories.${subcategory.id}`, {
      defaultValue: subcategory.label,
    });

  const showStatusToast = useCallback((toastMessage: string, durationMs = 2200) => {
    statusToastMessageRef.current = toastMessage;
    setStatus(toastMessage);
    if (statusToastTimeoutRef.current !== null) {
      window.clearTimeout(statusToastTimeoutRef.current);
    }

    statusToastTimeoutRef.current = window.setTimeout(() => {
      setStatus((current) => (current === toastMessage ? "" : current));
      if (statusToastMessageRef.current === toastMessage) {
        statusToastMessageRef.current = null;
      }
      statusToastTimeoutRef.current = null;
    }, durationMs);
  }, []);

  useEffect(() => {
    return () => {
      if (statusToastTimeoutRef.current !== null) {
        window.clearTimeout(statusToastTimeoutRef.current);
      }
      statusToastMessageRef.current = null;
    };
  }, []);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    if (!incomingStatusToast) {
      return;
    }

    showStatusToast(incomingStatusToast, 2600);
    navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [
    incomingStatusToast,
    location.pathname,
    location.search,
    navigate,
    showStatusToast,
  ]);

  useEffect(() => {
    if (!isSearchPanelOpen) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchPanelOpen]);

  useEffect(() => {
    if (isAtCommunityRoot) return;
    setQuery("");
    setSearchMainCategoryId("");
    setSearchSubcategoryId("");
    setDraftQuery("");
    setDraftSearchMainCategoryId("");
    setDraftSearchSubcategoryId("");
    setIsSearchPanelOpen(false);
  }, [isAtCommunityRoot]);

  const refreshGroups = useCallback(async () => {
    const response = await fetch(`${BACKEND_URL}/chat/groups?scope=communities`, {
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
    setStatus((current) =>
      current && statusToastMessageRef.current === current ? current : "",
    );
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

      if (detail.reason === "group-deleted" && detail.groupId) {
        const knownGroup = groupsRef.current.some((group) => group.id === detail.groupId);
        setGroups((prev) => prev.filter((group) => group.id !== detail.groupId));
        setPendingDeleteGroup((current) =>
          current?.id === detail.groupId ? null : current,
        );
        setPendingLeaveGroup((current) =>
          current?.id === detail.groupId ? null : current,
        );
        setPendingAvatarGroup((current) =>
          current?.id === detail.groupId ? null : current,
        );
        if (knownGroup) {
          showStatusToast(
            t("groups.communityDisbandedToast", {
              defaultValue: "This community has been disbanded.",
            }),
            2600,
          );
        }
        void refreshGroupInvitations();
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
  }, [refreshGroupInvitations, refreshGroups, showStatusToast, t]);

  const communityGroups = useMemo(
    () => groups.filter((group) => group.groupKind !== "private"),
    [groups],
  );

  const communitiesInSelectedSubcategory = useMemo(() => {
    if (!selectedMainCategory || !selectedSubcategory) return [];
    return communityGroups.filter(
      (group) =>
        group.mainCategoryId === selectedMainCategory.id &&
        group.subcategoryId === selectedSubcategory.id,
    );
  }, [communityGroups, selectedMainCategory, selectedSubcategory]);

  const filteredGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const scopedGroups = isAtCommunityRoot
      ? communityGroups.filter((group) => {
          if (searchMainCategoryId && group.mainCategoryId !== searchMainCategoryId) {
            return false;
          }
          if (searchSubcategoryId && group.subcategoryId !== searchSubcategoryId) {
            return false;
          }
          return true;
        })
      : selectedSubcategory
      ? communitiesInSelectedSubcategory
      : selectedMainCategory
        ? communityGroups.filter(
            (group) => group.mainCategoryId === selectedMainCategory.id,
          )
        : communityGroups;

    if (!normalizedQuery) return scopedGroups;
    return scopedGroups.filter((group) => {
      const category = findCommunityCategory(group.mainCategoryId);
      const subcategory = findCommunitySubcategory(
        group.mainCategoryId,
        group.subcategoryId,
      );
      const searchableText = [
        group.name,
        group.description,
        category?.label,
        category?.description,
        subcategory?.label,
        group.mainCategoryId,
        group.subcategoryId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return searchableText.includes(normalizedQuery);
    });
  }, [
    communitiesInSelectedSubcategory,
    communityGroups,
    isAtCommunityRoot,
    query,
    searchMainCategoryId,
    searchSubcategoryId,
    selectedMainCategory,
    selectedSubcategory,
  ]);

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
        prev.map((item) => (item.id === group.id ? joinedGroup ?? { ...item, joined: true } : item)),
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

  const openCreatePanel = (groupKind: GroupKind = "community") => {
    setIsCreateMenuOpen(false);
    setCreateGroupKind(groupKind);
    setNewGroupMainCategoryId(groupKind === "community" ? selectedMainCategory?.id ?? "" : "");
    setNewGroupSubcategoryId(groupKind === "community" ? selectedSubcategory?.id ?? "" : "");
    setNewGroupRequiresApproval(false);
    setIsCreatePanelOpen(true);
  };

  const handleCreateGroup = async () => {
    const name = newGroupName.trim().replace(/\s+/g, " ");
    const description = newGroupDescription.trim();
    const isPrivateGroup = createGroupKind === "private";
    if (!isPrivateGroup && !isValidCommunityCategoryPair(newGroupMainCategoryId, newGroupSubcategoryId)) {
      setStatus(t("groups.chooseCommunityCategory", { defaultValue: "Choose a main category and sub-category." }));
      return;
    }
    if (name.length < 2 || name.length > 48) {
      setStatus(t("groups.groupNameLength"));
      return;
    }
    if (description.length > 180) {
      setStatus(t("groups.groupDescriptionLength"));
      return;
    }

    setIsCreating(true);
    setStatus(
      isPrivateGroup
        ? t("groups.creatingPrivateGroup", { defaultValue: "Creating private group..." })
        : t("groups.creatingCommunity", { defaultValue: "Creating community..." }),
    );
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          groupKind: createGroupKind,
          mainCategoryId: isPrivateGroup ? undefined : newGroupMainCategoryId,
          subcategoryId: isPrivateGroup ? undefined : newGroupSubcategoryId,
          name,
          description,
          requiresApproval: !isPrivateGroup && newGroupRequiresApproval,
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
      if (!isPrivateGroup) {
        setGroups((prev) => [createdGroup, ...prev.filter((item) => item.id !== createdGroup.id)]);
      }
      setNewGroupName("");
      setNewGroupDescription("");
      setNewGroupAvatarKey(GROUP_AVATAR_OPTIONS[0].key);
      setNewGroupRequiresApproval(false);
      setIsCreatePanelOpen(false);
      setStatus(isPrivateGroup ? t("groups.privateGroupCreated", { defaultValue: "Private group created." }) : "");
      if (createdGroup.joined) {
        dispatchGroupsRealtime({
          reason: "group-created",
          eventType: "created",
          groupId: createdGroup.id,
          group: createdGroup,
        });
      }
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
            : item,
        ),
      );
      dispatchGroupConversationLeft({
        groupId: group.id,
        toast: t("groups.leftToast", {
          name: group.name,
          defaultValue: "You left {{name}}.",
        }),
      });
      setPendingLeaveGroup(null);
      showStatusToast(
        t("groups.leftToast", {
          name: group.name,
          defaultValue: "You left {{name}}.",
        }),
      );
    } catch {
      setStatus(t("groups.leaveFailed"));
    } finally {
      setWorkingGroupId(null);
      setWorkingAction(null);
    }
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
      showStatusToast(
        t("groups.groupDeletedToast", {
          name: group.name,
          defaultValue: "Deleted {{name}}.",
        }),
      );
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
            : item,
        ),
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

  const openInvitationsPanel = () => {
    setIsCreateMenuOpen(false);
    setInviteStatus("");
    setIsInvitationPanelOpen(true);
    void refreshGroupInvitations();
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
        if (!acceptedGroup) {
          await refreshGroups();
        } else {
          if (acceptedGroup.groupKind !== "private") {
            setGroups((prev) => {
              const exists = prev.some((item) => item.id === acceptedGroup.id);
              return exists
                ? prev.map((item) => (item.id === acceptedGroup.id ? acceptedGroup : item))
                : [acceptedGroup, ...prev];
            });
          }
          if (acceptedGroup.joined) {
            dispatchGroupsRealtime({
              reason: "invitation-resolved",
              eventType: "invite-accepted",
              groupId: acceptedGroup.id,
              invitationId: invitation.id,
              group: acceptedGroup,
            });
          }
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
  const hasSearchText = query.trim().length > 0;
  const hasSearchFilter = Boolean(searchMainCategoryId || searchSubcategoryId);
  const hasQuery = isAtCommunityRoot && (hasSearchText || hasSearchFilter);
  const joinedInSelectedSubcategory = filteredGroups.filter((group) => group.joined);
  const discoverInSelectedSubcategory = filteredGroups.filter((group) => !group.joined);
  const invitationCount = groupInvitations.length;
  const getGroupAvatarLabel = (key: GroupAvatarKey) => t(GROUP_AVATAR_LABEL_KEYS[key]);
  const selectedMainCategoryLabel = selectedMainCategory ? getCategoryLabel(selectedMainCategory) : "";
  const selectedSubcategoryLabel =
    selectedMainCategory && selectedSubcategory
      ? getSubcategoryLabel(selectedMainCategory, selectedSubcategory)
      : "";
  const backTarget =
    selectedMainCategory && selectedSubcategory
      ? buildCategoryPath(selectedMainCategory.id)
      : "/groups";
  const backLabel =
    selectedMainCategory && selectedSubcategory
      ? t("groups.backToSubcategories", { defaultValue: "Back to sub-categories" })
      : t("groups.backToCategories", { defaultValue: "Back to categories" });
  const isCreatingPrivateGroup = createGroupKind === "private";
  const searchSummaryParts = [
    searchMainCategory ? getCategoryLabel(searchMainCategory) : "",
    searchMainCategory && searchSubcategory
      ? getSubcategoryLabel(searchMainCategory, searchSubcategory)
      : "",
    query.trim(),
  ].filter(Boolean);
  const searchSummaryText = searchSummaryParts.length
    ? searchSummaryParts.join(" / ")
    : t("groups.searchAllCommunities", { defaultValue: "Search communities" });

  const openSearch = () => {
    setDraftQuery(query);
    setDraftSearchMainCategoryId(searchMainCategoryId);
    setDraftSearchSubcategoryId(searchSubcategoryId);
    setIsSearchPanelOpen(true);
  };
  const closeSearchPanel = () => {
    setDraftQuery(query);
    setDraftSearchMainCategoryId(searchMainCategoryId);
    setDraftSearchSubcategoryId(searchSubcategoryId);
    setIsSearchPanelOpen(false);
  };
  const closeSearch = () => {
    setQuery("");
    setSearchMainCategoryId("");
    setSearchSubcategoryId("");
    setDraftQuery("");
    setDraftSearchMainCategoryId("");
    setDraftSearchSubcategoryId("");
    setIsSearchPanelOpen(false);
  };
  const clearSearchFilters = () => {
    setQuery("");
    setSearchMainCategoryId("");
    setSearchSubcategoryId("");
    setDraftQuery("");
    setDraftSearchMainCategoryId("");
    setDraftSearchSubcategoryId("");
    setIsSearchPanelOpen(false);
  };
  const applySearch = () => {
    setQuery(draftQuery.trim());
    setSearchMainCategoryId(draftSearchMainCategoryId);
    setSearchSubcategoryId(draftSearchMainCategoryId ? draftSearchSubcategoryId : "");
    setIsSearchPanelOpen(false);
  };

  const getCommunityCount = (mainCategoryId: string, subcategoryId?: string) =>
    communityGroups.filter((group) => {
      if (group.mainCategoryId !== mainCategoryId) return false;
      if (subcategoryId && group.subcategoryId !== subcategoryId) return false;
      return true;
    }).length;

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
                setPendingLeaveGroup(group);
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
                  setPendingAvatarGroup(group);
                  setPendingAvatarKey(group.avatarKey);
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
                  setPendingDeleteGroup(group);
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
                className="group-action delete"
                disabled={isWorking || isCreating}
                onClick={(event) => {
                  event.stopPropagation();
                  setPendingDeleteGroup(group);
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

  const renderMainCategories = () => (
    <section className="community-category-grid" aria-label={t("groups.mainCategories", { defaultValue: "Main categories" })}>
      {COMMUNITY_CATEGORIES.map((category) => {
        const categoryLabel = getCategoryLabel(category);
        return (
          <button
            key={category.id}
            type="button"
            className="community-category-card"
            data-community-category-id={category.id}
            onClick={() => navigate(buildCategoryPath(category.id))}
          >
            <span>{t("groups.mainCategory", { defaultValue: "Main category" })}</span>
            <strong>{categoryLabel}</strong>
            <p>{getCategoryDescription(category)}</p>
            <em>{t("groups.communityCount", { defaultValue: "{{count}} communities", count: getCommunityCount(category.id) })}</em>
          </button>
        );
      })}
    </section>
  );

  const renderSubcategories = () => {
    if (!selectedMainCategory) return null;
    return (
      <section className="community-category-grid" aria-label={t("groups.subCategories", { defaultValue: "Sub-categories" })}>
        {selectedMainCategory.subcategories.map((subcategory) => (
          <button
            key={subcategory.id}
            type="button"
            className="community-category-card community-subcategory-card"
            data-community-subcategory-id={subcategory.id}
            onClick={() => navigate(buildCategoryPath(selectedMainCategory.id, subcategory.id))}
          >
            <span>{t("groups.subCategory", { defaultValue: "Sub-category" })}</span>
            <strong>{getSubcategoryLabel(selectedMainCategory, subcategory)}</strong>
            <p>
              {t("groups.subCategoryHint", {
                defaultValue: "Browse communities in {{category}}.",
                category: getCategoryLabel(selectedMainCategory),
              })}
            </p>
            <em>{t("groups.communityCount", { defaultValue: "{{count}} communities", count: getCommunityCount(selectedMainCategory.id, subcategory.id) })}</em>
          </button>
        ))}
      </section>
    );
  };

  const renderSearchControl = () => (
    <div className="groups-search-entry">
      <button
        type="button"
        className={`groups-search-trigger ${hasQuery ? "has-active-search" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isSearchPanelOpen}
        onClick={openSearch}
      >
        <span className="groups-search-trigger-icon" aria-hidden="true">
          <SearchGlyph />
        </span>
        <span className="groups-search-trigger-copy">
          <strong>{t("groups.searchGroups")}</strong>
          <small>{searchSummaryText}</small>
        </span>
      </button>
      {hasQuery && (
        <button
          type="button"
          className="groups-search-clear"
          aria-label={t("groups.closeSearch")}
          onClick={closeSearch}
        >
          {t("common.close")}
        </button>
      )}

      {isSearchPanelOpen && (
        <div className="groups-search-overlay" role="presentation" onClick={closeSearchPanel}>
          <div
            className="groups-search-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="groups-search-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="groups-search-modal-head">
              <div>
                <p className="groups-search-eyebrow">{t("groups.communitiesTitle", { defaultValue: "Communities" })}</p>
                <h3 id="groups-search-title">{t("groups.searchGroups")}</h3>
              </div>
              <button type="button" className="groups-search-modal-close" onClick={closeSearchPanel}>
                {t("common.close")}
              </button>
            </div>

            <div className="groups-search-filter-row">
              <label className="groups-search-filter">
                <span>{t("groups.mainCategory", { defaultValue: "Main category" })}</span>
                <select
                  className="groups-search-main-select"
                  value={draftSearchMainCategoryId}
                  onChange={(event) => {
                    setDraftSearchMainCategoryId(event.target.value);
                    setDraftSearchSubcategoryId("");
                  }}
                >
                  <option value="">
                    {t("groups.chooseMainCategory", { defaultValue: "Choose main category" })}
                  </option>
                  {COMMUNITY_CATEGORIES.map((category) => (
                    <option key={category.id} value={category.id}>
                      {getCategoryLabel(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="groups-search-filter">
                <span>{t("groups.subCategory", { defaultValue: "Sub-category" })}</span>
                <select
                  className="groups-search-subcategory-select"
                  value={draftSearchSubcategoryId}
                  onChange={(event) => setDraftSearchSubcategoryId(event.target.value)}
                  disabled={!draftSearchMainCategory}
                >
                  <option value="">
                    {draftSearchMainCategory
                      ? t("groups.chooseSubCategory", { defaultValue: "Choose sub-category" })
                      : t("groups.chooseMainCategory", { defaultValue: "Choose main category" })}
                  </option>
                  {draftSearchMainCategory?.subcategories.map((subcategory) => (
                    <option key={subcategory.id} value={subcategory.id}>
                      {getSubcategoryLabel(draftSearchMainCategory, subcategory)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
                  placeholder={t("groups.searchAllCommunities", {
                    defaultValue: "Search communities",
                  })}
                  value={draftQuery}
                  onChange={(event) => setDraftQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      closeSearchPanel();
                    }
                    if (event.key === "Enter") {
                      applySearch();
                    }
                  }}
                />
              </div>
            </div>

            <div className="groups-search-modal-actions">
              <button type="button" className="group-action cancel groups-search-reset" onClick={clearSearchFilters}>
                {t("groups.clearFilter", { defaultValue: "Clear filter" })}
              </button>
              <button type="button" className="group-action cancel" onClick={closeSearchPanel}>
                {t("common.cancel")}
              </button>
              <button type="button" className="group-action create groups-search-apply" onClick={applySearch}>
                {t("common.confirm", { defaultValue: "Confirm" })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderCommunityList = () => (
    <>
      <div className="groups-stage-bar">
        <div className="groups-stage-copy">
          <h2>{hasQuery ? t("groups.searchResults") : selectedSubcategoryLabel}</h2>
          <span>
            {hasQuery
              ? t("groups.visibleCount", { count: filteredGroups.length })
              : t("groups.joinedAndDiscover", {
                  joined: joinedInSelectedSubcategory.length,
                  discover: discoverInSelectedSubcategory.length,
                })}
          </span>
        </div>
      </div>

      {status && <div className="status-text">{status}</div>}
      {!status && filteredGroups.length === 0 && <div className="status-text">{t("groups.noGroupsFound")}</div>}

      {filteredGroups.length > 0 && (
        <div className="groups-sections">
          {joinedInSelectedSubcategory.length > 0 && (
            <section className="groups-section" aria-label={t("groups.joinedGroups")}>
              <div className="groups-section-head">
                <div>
                  <h3>{t("groups.joinedCommunities", { defaultValue: "Joined communities" })}</h3>
                  <p>{t("groups.joinedGroupsHint")}</p>
                </div>
              </div>
              <div className="conversations-list">{joinedInSelectedSubcategory.map(renderGroupCard)}</div>
            </section>
          )}

          {discoverInSelectedSubcategory.length > 0 && (
            <section className="groups-section" aria-label={t("groups.discoverGroups")}>
              <div className="groups-section-head">
                <div>
                  <h3>{joinedInSelectedSubcategory.length > 0 ? t("groups.discoverMore") : t("groups.communityRooms")}</h3>
                  <p>{t("groups.discoverHint")}</p>
                </div>
              </div>
              <div className="conversations-list">{discoverInSelectedSubcategory.map(renderGroupCard)}</div>
            </section>
          )}
        </div>
      )}
    </>
  );

  const pageTitle = selectedSubcategory
    ? selectedSubcategoryLabel
    : selectedMainCategory
      ? selectedMainCategoryLabel
      : t("groups.communitiesTitle", { defaultValue: "Communities" });
  const pageCopy = selectedSubcategory
    ? t("groups.communityListCopy", {
        defaultValue: "Join public communities in {{subcategory}}, or apply when approval is required.",
        subcategory: selectedSubcategoryLabel,
      })
    : selectedMainCategory
      ? t("groups.subcategoryPageCopy", {
          defaultValue: "Choose a sub-category to find the right community lane.",
        })
      : t("groups.categoryPageCopy", {
          defaultValue: "Choose a category first. Private groups stay hidden and invite-only.",
        });

  return (
    <div className="groups-page">
      <div className="conversations-shell">
        <header className="conversations-header">
          <div className="conversations-title-wrap">
            <p className="eyebrow">{heroName}</p>
            <h1 className="page-title">{pageTitle}</h1>
            <p className="page-copy">{pageCopy}</p>
          </div>
        </header>

        <div className="community-breadcrumbs" aria-label={t("groups.categoryTrail", { defaultValue: "Category trail" })}>
          <button type="button" onClick={() => navigate("/groups")}>
            {t("groups.communitiesTitle", { defaultValue: "Communities" })}
          </button>
          {selectedMainCategory && (
            <button type="button" onClick={() => navigate(buildCategoryPath(selectedMainCategory.id))}>
              {selectedMainCategoryLabel}
            </button>
          )}
          {selectedSubcategory && <span>{selectedSubcategoryLabel}</span>}
        </div>

        {(selectedMainCategory || selectedSubcategory) && (
          <button
            type="button"
            className="community-back-button"
            aria-label={backLabel}
            onClick={() => navigate(backTarget)}
          >
            <span className="community-back-chevron" aria-hidden="true">&lt;</span>
            <span>{t("common.back")}</span>
          </button>
        )}

        <div className="groups-command-bar" aria-label={t("groups.communityActions", { defaultValue: "Community actions" })}>
          {isAtCommunityRoot && renderSearchControl()}
          <div className="groups-command-actions">
            <button
              type="button"
              className="group-action invitations groups-invitations-trigger"
              onClick={openInvitationsPanel}
            >
              {t("groups.invitationsButton")}
              <Badge
                count={invitationCount}
                size="compact"
                className="groups-action-badge groups-invitations-count"
                ariaLabel={`${t("groups.invitationsButton")} ${invitationCount}`}
              />
            </button>
          </div>
        </div>

        {hasQuery ? (
          renderCommunityList()
        ) : (
          <>
            {!selectedMainCategory && renderMainCategories()}
            {selectedMainCategory && !selectedSubcategory && renderSubcategories()}
            {selectedMainCategory && selectedSubcategory && renderCommunityList()}
          </>
        )}
      </div>

      {isCreateMenuOpen && (
        <div
          className="groups-create-menu-layer"
          role="presentation"
          onClick={() => setIsCreateMenuOpen(false)}
        >
          <div
            id="groups-create-menu"
            className="groups-create-menu"
            role="menu"
            aria-label={t("groups.communityActions", { defaultValue: "Community actions" })}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              role="menuitem"
              className="groups-create-menu-option community groups-create-trigger"
              onClick={() => openCreatePanel("community")}
            >
              <span className="groups-create-menu-mark" aria-hidden="true">
                <span className="groups-fab-icon">
                  <span />
                  <span />
                </span>
              </span>
              <span className="groups-create-menu-copy">
                <strong>{t("groups.createCommunity", { defaultValue: "Create Community" })}</strong>
                <small>
                  {selectedSubcategory
                    ? selectedSubcategoryLabel
                    : t("groups.communitiesTitle", { defaultValue: "Communities" })}
                </small>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              className="groups-create-menu-option private groups-create-private-trigger"
              onClick={() => openCreatePanel("private")}
            >
              <span className="groups-create-menu-mark" aria-hidden="true">
                <span className="groups-fab-icon">
                  <span />
                  <span />
                </span>
              </span>
              <span className="groups-create-menu-copy">
                <strong>{t("groups.createPrivateGroup", { defaultValue: "Create Private Group" })}</strong>
                <small>
                  {t("groups.privateGroupNote", {
                    defaultValue: "Invite-only. It will not appear in community lists or public search.",
                  })}
                </small>
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="groups-create-fab-shell">
        <button
          type="button"
          className={`groups-create-fab ${isCreateMenuOpen ? "is-open" : ""}`}
          aria-label={t("groups.communityActions", { defaultValue: "Community actions" })}
          aria-expanded={isCreateMenuOpen}
          aria-controls="groups-create-menu"
          onClick={() => setIsCreateMenuOpen((current) => !current)}
        >
          <span className="groups-fab-icon" aria-hidden="true">
            <span />
            <span />
          </span>
        </button>
      </div>

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
                <p className="eyebrow">
                  {isCreatingPrivateGroup
                    ? t("groups.newPrivateGroup", { defaultValue: "New Private Group" })
                    : t("groups.newCommunity", { defaultValue: "New Community" })}
                </p>
                <h3 id="create-group-title">
                  {isCreatingPrivateGroup
                    ? t("groups.createPrivateGroup", { defaultValue: "Create Private Group" })
                    : t("groups.createCommunity", { defaultValue: "Create Community" })}
                </h3>
                <p>
                  {isCreatingPrivateGroup
                    ? t("groups.createPrivateGroupHint", {
                        defaultValue: "Private groups stay hidden. New members can only join from invites inside the group.",
                      })
                    : t("groups.createCommunityHint", {
                        defaultValue: "Pick the exact category before opening a public or approval-based community.",
                      })}
                </p>
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
              {!isCreatingPrivateGroup ? (
                <div className="group-create-category-grid">
                  <label className="group-create-field">
                    <span>{t("groups.mainCategory", { defaultValue: "Main category" })}</span>
                    <select
                      value={newGroupMainCategoryId}
                      onChange={(event) => {
                        setNewGroupMainCategoryId(event.target.value);
                        setNewGroupSubcategoryId("");
                      }}
                      disabled={isCreating}
                    >
                      <option value="">{t("groups.chooseMainCategory", { defaultValue: "Choose main category" })}</option>
                      {COMMUNITY_CATEGORIES.map((category) => (
                        <option key={category.id} value={category.id}>
                          {getCategoryLabel(category)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="group-create-field">
                    <span>{t("groups.subCategory", { defaultValue: "Sub-category" })}</span>
                    <select
                      value={newGroupSubcategoryId}
                      onChange={(event) => setNewGroupSubcategoryId(event.target.value)}
                      disabled={isCreating || !newGroupMainCategoryId}
                    >
                      <option value="">{t("groups.chooseSubCategory", { defaultValue: "Choose sub-category" })}</option>
                      {findCommunityCategory(newGroupMainCategoryId)?.subcategories.map((subcategory) => {
                        const category = findCommunityCategory(newGroupMainCategoryId);
                        return (
                          <option key={subcategory.id} value={subcategory.id}>
                            {category ? getSubcategoryLabel(category, subcategory) : subcategory.label}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              ) : (
                <p className="group-create-private-note">
                  {t("groups.privateGroupNote", {
                    defaultValue: "Invite-only. It will not appear in community lists or public search.",
                  })}
                </p>
              )}

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
                {!isCreatingPrivateGroup && (
                  <label className="group-create-toggle">
                    <input
                      type="checkbox"
                      checked={newGroupRequiresApproval}
                      onChange={(event) => setNewGroupRequiresApproval(event.target.checked)}
                      disabled={isCreating}
                    />
                    {t("groups.requireVerification")}
                  </label>
                )}
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

      {pendingLeaveGroup && (
        <div className="groups-leave-overlay" role="presentation">
          <div className="groups-leave-modal" role="dialog" aria-modal="true" aria-labelledby="leave-group-title">
            <h3 id="leave-group-title">{t("groups.leaveConfirmTitle", { name: pendingLeaveGroup.name })}</h3>
            <p>{t("groups.leaveConfirmBody")}</p>
            <div className="groups-delete-actions">
              <button
                type="button"
                className="group-action cancel"
                onClick={() => setPendingLeaveGroup(null)}
                disabled={workingAction === "leave"}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="group-action leave"
                onClick={() => {
                  void handleLeaveGroup(pendingLeaveGroup);
                }}
                disabled={workingAction === "leave"}
              >
                {workingAction === "leave" ? t("groups.leaving") : t("groups.leave")}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteGroup && (
        <div className="groups-delete-overlay" role="presentation">
          <div className="groups-delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-group-title">
            <h3 id="delete-group-title">{t("groups.deleteGroupTitle", { name: pendingDeleteGroup.name })}</h3>
            <p>{t("groups.deleteGroupHint")}</p>
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
