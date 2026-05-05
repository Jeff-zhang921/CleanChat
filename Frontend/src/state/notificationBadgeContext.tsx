import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { io, type Socket } from "socket.io-client";
import { BACKEND_URL, SOCKET_URL } from "../config";
import {
  AUTH_TOKEN_UPDATED_EVENT,
  getAuthToken,
} from "../utils/auth";
import {
  CONVERSATION_MUTES_UPDATED_EVENT,
  normalizeConversationMutes,
  readConversationMutes,
  sumUnreadCountsExcludingMuted,
  type ConversationMuteMap,
} from "../utils/conversationMutes";
import {
  readUnreadCounts,
  UNREAD_COUNTS_UPDATED_EVENT,
  type ConversationUnreadCounts,
} from "../utils/unreadCounts";
import {
  dispatchGroupsRealtime,
  type GroupsRealtimeDetail,
  type GroupsRealtimeReason,
} from "../utils/conversationEvents";

type NotificationBadgeContextValue = {
  unreadCounts: ConversationUnreadCounts;
  totalUnreadMessages: number;
  pendingDirectRequests: number;
  pendingGroupRequests: number;
  pendingGroupInvitations: number;
  pendingVerificationTotal: number;
  refreshPendingCounts: () => Promise<void>;
  syncUnreadFromStorage: () => void;
};

type NotificationBadgeProviderProps = {
  children: ReactNode;
};

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | null>(null);

const isCountsRecord = (value: unknown): value is ConversationUnreadCounts =>
  Boolean(value) && typeof value === "object";

const readStringField = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return undefined;
  }

  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const readPositiveNumberField = (payload: unknown, key: string) => {
  if (!payload || typeof payload !== "object" || !(key in payload)) {
    return undefined;
  }

  const value = Number((payload as Record<string, unknown>)[key]);
  return Number.isInteger(value) && value > 0 ? value : undefined;
};

const buildGroupsRealtimeDetail = (
  reason: GroupsRealtimeReason,
  payload: unknown,
): GroupsRealtimeDetail => {
  const detail: GroupsRealtimeDetail = { reason };
  const eventType = readStringField(payload, "type");
  const groupId = readStringField(payload, "groupId");
  const invitationId = readPositiveNumberField(payload, "invitationId");
  const requesterId = readPositiveNumberField(payload, "requesterId");
  const actorUserId = readPositiveNumberField(payload, "actorUserId");
  const updatedAt = readStringField(payload, "updatedAt");

  if (eventType) detail.eventType = eventType;
  if (groupId) detail.groupId = groupId;
  if (invitationId) detail.invitationId = invitationId;
  if (requesterId) detail.requesterId = requesterId;
  if (actorUserId) detail.actorUserId = actorUserId;
  if (updatedAt) detail.updatedAt = updatedAt;

  return detail;
};

const getCatalogRealtimeReason = (payload: unknown): GroupsRealtimeReason => {
  const eventType = readStringField(payload, "type");
  if (eventType === "created") return "group-created";
  if (eventType === "deleted") return "group-deleted";
  if (eventType === "member-left") return "member-left";
  return "catalog-updated";
};

export const NotificationBadgeProvider = ({
  children,
}: NotificationBadgeProviderProps) => {
  const [unreadCounts, setUnreadCounts] = useState<ConversationUnreadCounts>(() =>
    readUnreadCounts(),
  );
  const [authToken, setAuthToken] = useState(() => getAuthToken());
  const [mutedConversations, setMutedConversations] =
    useState<ConversationMuteMap>(() => readConversationMutes());
  const [pendingDirectRequests, setPendingDirectRequests] = useState(0);
  const [pendingGroupRequests, setPendingGroupRequests] = useState(0);
  const [pendingGroupInvitations, setPendingGroupInvitations] = useState(0);

  const syncUnreadFromStorage = useCallback(() => {
    setUnreadCounts(readUnreadCounts());
  }, []);

  const syncMutesFromStorage = useCallback(() => {
    setMutedConversations(readConversationMutes());
  }, []);

  const refreshPendingCounts = useCallback(async () => {
    if (!authToken) {
      setPendingDirectRequests(0);
      setPendingGroupRequests(0);
      setPendingGroupInvitations(0);
      return;
    }

    try {
      const [directResponse, groupsResponse, invitationsResponse] =
        await Promise.all([
        fetch(`${BACKEND_URL}/chat/requests/direct/received`, {
          credentials: "include",
        }),
        fetch(`${BACKEND_URL}/chat/groups`, {
          credentials: "include",
        }),
        fetch(`${BACKEND_URL}/chat/groups/invitations/received`, {
          credentials: "include",
        }),
      ]);

      let nextPendingDirect = 0;
      if (directResponse.ok) {
        const directData = (await directResponse.json().catch(() => ({}))) as {
          pending?: unknown;
        };
        if (Array.isArray(directData.pending)) {
          nextPendingDirect = directData.pending.length;
        }
      }

      let nextPendingGroup = 0;
      if (groupsResponse.ok) {
        const groupsData = (await groupsResponse.json().catch(() => ({}))) as {
          groups?: Array<{ isOwner?: boolean; pendingRequestCount?: number }>;
        };
        const groups = Array.isArray(groupsData.groups) ? groupsData.groups : [];
        nextPendingGroup = groups.reduce((sum, group) => {
          if (!group?.isOwner) {
            return sum;
          }
          const count = Number(group.pendingRequestCount);
          if (!Number.isFinite(count) || count <= 0) {
            return sum;
          }
          return sum + Math.floor(count);
        }, 0);
      }

      let nextPendingGroupInvitations = 0;
      if (invitationsResponse.ok) {
        const invitationsData = (await invitationsResponse.json().catch(() => ({}))) as {
          invitations?: unknown;
        };
        if (Array.isArray(invitationsData.invitations)) {
          nextPendingGroupInvitations = invitationsData.invitations.length;
        }
      }

      setPendingDirectRequests(nextPendingDirect);
      setPendingGroupRequests(nextPendingGroup);
      setPendingGroupInvitations(nextPendingGroupInvitations);
    } catch {
      // Keep the existing badge state when refresh fails.
    }
  }, [authToken]);

  useEffect(() => {
    const syncAuthToken = () => {
      setAuthToken(getAuthToken());
    };

    window.addEventListener(AUTH_TOKEN_UPDATED_EVENT, syncAuthToken);
    window.addEventListener("storage", syncAuthToken);

    return () => {
      window.removeEventListener(AUTH_TOKEN_UPDATED_EVENT, syncAuthToken);
      window.removeEventListener("storage", syncAuthToken);
    };
  }, []);

  useEffect(() => {
    const handleUnreadEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (isCountsRecord(customEvent.detail)) {
        setUnreadCounts(customEvent.detail);
        return;
      }
      syncUnreadFromStorage();
    };

    const handleMuteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        setMutedConversations(normalizeConversationMutes(customEvent.detail));
        return;
      }
      syncMutesFromStorage();
    };

    const handleStorage = () => {
      syncUnreadFromStorage();
      syncMutesFromStorage();
    };

    window.addEventListener(
      UNREAD_COUNTS_UPDATED_EVENT,
      handleUnreadEvent as EventListener,
    );
    window.addEventListener(
      CONVERSATION_MUTES_UPDATED_EVENT,
      handleMuteEvent as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        UNREAD_COUNTS_UPDATED_EVENT,
        handleUnreadEvent as EventListener,
      );
      window.removeEventListener(
        CONVERSATION_MUTES_UPDATED_EVENT,
        handleMuteEvent as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncMutesFromStorage, syncUnreadFromStorage]);

  useEffect(() => {
    if (!authToken) {
      setPendingDirectRequests(0);
      setPendingGroupRequests(0);
      setPendingGroupInvitations(0);
      return;
    }

    void refreshPendingCounts();

    const intervalId = window.setInterval(() => {
      void refreshPendingCounts();
    }, 45000);

    const refreshWhenVisible = () => {
      if (!document.hidden) {
        void refreshPendingCounts();
      }
    };

    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [authToken, refreshPendingCounts]);

  useEffect(() => {
    if (!authToken) {
      return;
    }

    const socket: Socket = io(SOCKET_URL, {
      auth: { token: authToken },
      transports: ["websocket", "polling"],
      withCredentials: true,
    });

    const refreshBadges = () => {
      void refreshPendingCounts();
    };
    const refreshBadgesAndGroups =
      (reason: GroupsRealtimeReason) => (payload: unknown) => {
        refreshBadges();
        dispatchGroupsRealtime(buildGroupsRealtimeDetail(reason, payload));
      };

    const handleGroupCatalogUpdated = (payload: unknown) => {
      refreshBadges();
      dispatchGroupsRealtime(
        buildGroupsRealtimeDetail(getCatalogRealtimeReason(payload), payload),
      );
    };
    const handleGroupCreated = refreshBadgesAndGroups("group-created");
    const handleGroupDeleted = refreshBadgesAndGroups("group-deleted");
    const handleGroupMemberLeft = refreshBadgesAndGroups("member-left");
    const handleGroupInvitationNew = refreshBadgesAndGroups("invitation-new");
    const handleGroupInvitationResolved =
      refreshBadgesAndGroups("invitation-resolved");
    const handleGroupJoinRequestNew =
      refreshBadgesAndGroups("join-request-new");
    const handleGroupJoinRequestResolved =
      refreshBadgesAndGroups("join-request-resolved");

    socket.on("request:direct:new", refreshBadges);
    socket.on("request:direct:resolved", refreshBadges);
    socket.on("group:catalog-updated", handleGroupCatalogUpdated);
    socket.on("group:created", handleGroupCreated);
    socket.on("group:deleted", handleGroupDeleted);
    socket.on("group:member-left", handleGroupMemberLeft);
    socket.on("group:invitation:new", handleGroupInvitationNew);
    socket.on("group:invitation:resolved", handleGroupInvitationResolved);
    socket.on("group:join-request:new", handleGroupJoinRequestNew);
    socket.on("group:join-request:resolved", handleGroupJoinRequestResolved);

    return () => {
      socket.off("request:direct:new", refreshBadges);
      socket.off("request:direct:resolved", refreshBadges);
      socket.off("group:catalog-updated", handleGroupCatalogUpdated);
      socket.off("group:created", handleGroupCreated);
      socket.off("group:deleted", handleGroupDeleted);
      socket.off("group:member-left", handleGroupMemberLeft);
      socket.off("group:invitation:new", handleGroupInvitationNew);
      socket.off("group:invitation:resolved", handleGroupInvitationResolved);
      socket.off("group:join-request:new", handleGroupJoinRequestNew);
      socket.off("group:join-request:resolved", handleGroupJoinRequestResolved);
      socket.disconnect();
    };
  }, [authToken, refreshPendingCounts]);

  const value = useMemo<NotificationBadgeContextValue>(
    () => ({
      unreadCounts,
      totalUnreadMessages: sumUnreadCountsExcludingMuted(
        unreadCounts,
        mutedConversations,
      ),
      pendingDirectRequests,
      pendingGroupRequests,
      pendingGroupInvitations,
      pendingVerificationTotal: pendingDirectRequests + pendingGroupRequests,
      refreshPendingCounts,
      syncUnreadFromStorage,
    }),
    [
      unreadCounts,
      mutedConversations,
      pendingDirectRequests,
      pendingGroupRequests,
      pendingGroupInvitations,
      refreshPendingCounts,
      syncUnreadFromStorage,
    ],
  );

  return (
    <NotificationBadgeContext.Provider value={value}>
      {children}
    </NotificationBadgeContext.Provider>
  );
};

export const useNotificationBadges = () => {
  const context = useContext(NotificationBadgeContext);
  if (!context) {
    throw new Error("useNotificationBadges must be used within NotificationBadgeProvider");
  }
  return context;
};
