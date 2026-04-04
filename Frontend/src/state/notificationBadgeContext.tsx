import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BACKEND_URL } from "../config";
import { getAuthToken } from "../utils/auth";
import {
  readUnreadCounts,
  UNREAD_COUNTS_UPDATED_EVENT,
  type ConversationUnreadCounts,
} from "../utils/unreadCounts";

type NotificationBadgeContextValue = {
  unreadCounts: ConversationUnreadCounts;
  totalUnreadMessages: number;
  pendingDirectRequests: number;
  pendingGroupRequests: number;
  pendingVerificationTotal: number;
  refreshPendingCounts: () => Promise<void>;
  syncUnreadFromStorage: () => void;
};

type NotificationBadgeProviderProps = {
  children: ReactNode;
};

const NotificationBadgeContext = createContext<NotificationBadgeContextValue | null>(null);

const sumUnreadCounts = (counts: ConversationUnreadCounts) =>
  Object.values(counts).reduce((sum, count) => sum + count, 0);

const isCountsRecord = (value: unknown): value is ConversationUnreadCounts =>
  Boolean(value) && typeof value === "object";

export const NotificationBadgeProvider = ({
  children,
}: NotificationBadgeProviderProps) => {
  const [unreadCounts, setUnreadCounts] = useState<ConversationUnreadCounts>(() =>
    readUnreadCounts(),
  );
  const [pendingDirectRequests, setPendingDirectRequests] = useState(0);
  const [pendingGroupRequests, setPendingGroupRequests] = useState(0);

  const syncUnreadFromStorage = useCallback(() => {
    setUnreadCounts(readUnreadCounts());
  }, []);

  const refreshPendingCounts = useCallback(async () => {
    if (!getAuthToken()) {
      setPendingDirectRequests(0);
      setPendingGroupRequests(0);
      return;
    }

    try {
      const [directResponse, groupsResponse] = await Promise.all([
        fetch(`${BACKEND_URL}/chat/requests/direct/received`, {
          credentials: "include",
        }),
        fetch(`${BACKEND_URL}/chat/groups`, {
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

      setPendingDirectRequests(nextPendingDirect);
      setPendingGroupRequests(nextPendingGroup);
    } catch {
      // Keep the existing badge state when refresh fails.
    }
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

    const handleStorage = () => {
      syncUnreadFromStorage();
    };

    window.addEventListener(
      UNREAD_COUNTS_UPDATED_EVENT,
      handleUnreadEvent as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        UNREAD_COUNTS_UPDATED_EVENT,
        handleUnreadEvent as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, [syncUnreadFromStorage]);

  useEffect(() => {
    if (!getAuthToken()) {
      setPendingDirectRequests(0);
      setPendingGroupRequests(0);
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
  }, [refreshPendingCounts]);

  const value = useMemo<NotificationBadgeContextValue>(
    () => ({
      unreadCounts,
      totalUnreadMessages: sumUnreadCounts(unreadCounts),
      pendingDirectRequests,
      pendingGroupRequests,
      pendingVerificationTotal: pendingDirectRequests + pendingGroupRequests,
      refreshPendingCounts,
      syncUnreadFromStorage,
    }),
    [
      unreadCounts,
      pendingDirectRequests,
      pendingGroupRequests,
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
