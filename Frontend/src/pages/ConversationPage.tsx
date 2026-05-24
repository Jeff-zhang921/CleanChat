import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type HTMLAttributes, type RefObject } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Virtuoso, type ListProps, type ScrollerProps } from "react-virtuoso";
import { io, type Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import BottomNav from "../components/BottomNav";
import Badge from "../components/Badge";
import GenderLineIcon from "../components/GenderLineIcon";
import { DEFAULT_AVATAR_KEY, getAvatarToneClass, getAvatarUrl, type AvatarKey } from "../constants/avatarCatalog";
import { BACKEND_URL, SOCKET_URL } from "../config";
import { useCompactViewport } from "../hooks/useCompactViewport";
import { useViewportOverscan } from "../hooks/useViewportOverscan";
import {
  GENDER_ARIA_KEY_MAP,
  normalizeGender,
  type GenderValue,
} from "../utils/gender";
import { clearAuthToken, getAuthToken } from "../utils/auth";
import {
  CONVERSATION_DELETED_EVENT,
  GROUP_CONVERSATION_LEFT_EVENT,
  GROUPS_REALTIME_EVENT,
  type ConversationDeletedDetail,
  type GroupConversationLeftDetail,
  type GroupsRealtimeDetail,
} from "../utils/conversationEvents";
import {
  ensurePushSubscriptionForCurrentUser,
  hasExistingPushSubscription,
  hasPushActivationForUser,
  getNotificationPermission,
  getNotificationRuntimeSupport,
  isAndroid13Plus,
  isIOSDevice,
  isStandalonePwa,
  showMessageNotification,
  syncLinkedPushSubscriptionForCurrentUser,
  type NotificationPermissionState,
} from "../utils/notifications";
import {
  ACTIVE_CHAT_VIEW_UPDATED_EVENT,
  readActiveChatView,
  type ActiveChatView,
} from "../utils/activeChatView";
import {
  clearUnreadCount,
  getGroupUnreadKey,
  getThreadUnreadKey,
  incrementUnreadCount,
  normalizeUnreadCounts,
  persistUnreadCounts,
  readUnreadCounts,
  type ConversationUnreadCounts,
} from "../utils/unreadCounts";
import {
  CONVERSATION_MUTES_UPDATED_EVENT,
  getGroupMuteKey,
  getThreadMuteKey,
  isConversationMuted,
  normalizeConversationMutes,
  persistConversationMutes,
  readConversationMutes,
  replaceConversationMutes,
  setConversationMuted,
  type ConversationMuteMap,
} from "../utils/conversationMutes";
import { getSystemMessageText } from "../utils/systemMessages";
import "./ConversationPage.css";

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: string | null;
};

type SessionUser = UserSummary;

type ThreadResponse = {
  id: number;
  AID: number;
  BID: number;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  UserA: UserSummary;
  UserB: UserSummary;
  Messages: {
    id: number;
    body: string;
    createdAt: string;
    senderId: number;
  }[];
  mutedByMe?: boolean;
};

type ConversationItem = {
  id: string;
  chatType: "direct" | "group";
  threadId?: number;
  groupId?: string;
  userId?: number;
  avatarKey?: AvatarKey;
  name: string;
  email?: string;
  cleanId: string;
  gender?: GenderValue;
  avatarUrl: string;
  role: string;
  preview: string;
  time: string;
  sortAt?: string | null;
  subline: string;
  unreadCount: number;
  muted: boolean;
};

type RealtimeMessage = {
  id: number;
  threadId: number;
  senderId: number;
  body: string;
  createdAt: string;
};

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  groupKind?: "community" | "private";
  joined: boolean;
  isOwner: boolean;
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  mutedByMe?: boolean;
};

type GroupRealtimeMessage = {
  id: number;
  groupId: string;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
};

type ConversationsCache = {
  me: SessionUser | null;
  threads: ThreadResponse[];
  groups: GroupSummary[];
  savedAt: number;
};

type ConversationSkeletonCard = {
  id: string;
  chatType: "direct" | "group";
  role: string;
  nameWidth: string;
  previewWidth: string;
  previewSecondaryWidth: string;
  sublineWidth: string;
};

const IMAGE_MESSAGE_PREFIX = "IMG::";
const IMAGE_URL_REGEX =
  /^https:\/\/(?:utfs\.io|(?:[a-z0-9-]+\.)?ufs\.sh|[^/\s]*uploadthing\.com)\//i;
const IMAGE_EXTENSION_REGEX =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)(?:\?.*)?$/i;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;
const CONVERSATIONS_CACHE_KEY = "cleanchat:conversations-cache";
const CONVERSATIONS_RETURN_KEY = "cleanchat:conversations-return";
const CONVERSATION_SKELETON_MIN_MS = 320;
const CONVERSATION_RETURN_SKELETON_MIN_MS = 520;
const FALLBACK_SKELETON_CARDS: ConversationSkeletonCard[] = [
  {
    id: "skeleton-direct-a",
    chatType: "direct",
    role: "Direct",
    nameWidth: "8.4rem",
    previewWidth: "84%",
    previewSecondaryWidth: "56%",
    sublineWidth: "7.3rem",
  },
  {
    id: "skeleton-group-a",
    chatType: "group",
    role: "Group",
    nameWidth: "7.1rem",
    previewWidth: "78%",
    previewSecondaryWidth: "48%",
    sublineWidth: "5.4rem",
  },
  {
    id: "skeleton-direct-b",
    chatType: "direct",
    role: "Direct",
    nameWidth: "7.8rem",
    previewWidth: "88%",
    previewSecondaryWidth: "60%",
    sublineWidth: "6.8rem",
  },
  {
    id: "skeleton-direct-c",
    chatType: "direct",
    role: "Direct",
    nameWidth: "6.6rem",
    previewWidth: "74%",
    previewSecondaryWidth: "52%",
    sublineWidth: "7.6rem",
  },
];

const readConversationsCache = (): ConversationsCache | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CONVERSATIONS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ConversationsCache> | null;
    if (!parsed || !Array.isArray(parsed.threads) || !Array.isArray(parsed.groups)) {
      return null;
    }
    return {
      me: parsed.me ?? null,
      threads: parsed.threads,
      groups: parsed.groups,
      savedAt: typeof parsed.savedAt === "number" ? parsed.savedAt : Date.now(),
    };
  } catch {
    return null;
  }
};

const writeConversationsCache = (payload: ConversationsCache) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(CONVERSATIONS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures and keep the live view working.
  }
};

const isJoinedGroupSummary = (value: unknown): value is GroupSummary => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<GroupSummary>;
  return (
    typeof candidate.id === "string" &&
    candidate.id.trim().length > 0 &&
    typeof candidate.name === "string" &&
    typeof candidate.avatarUrl === "string" &&
    candidate.joined === true &&
    typeof candidate.memberCount === "number"
  );
};

const hasConversationReturnIntent = () => {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(CONVERSATIONS_RETURN_KEY) === "1";
  } catch {
    return false;
  }
};

const clearConversationReturnIntent = () => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(CONVERSATIONS_RETURN_KEY);
  } catch {
    // Ignore storage failures and fall back to the live view.
  }
};

const resolveAvatarUrl = (avatar?: AvatarKey) => getAvatarUrl(avatar ?? DEFAULT_AVATAR_KEY);

const formatTime = (
  time: string | undefined,
  language: string,
  defaultLabel: string,
) => {
  if (!time) return defaultLabel;
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return defaultLabel;
  return new Intl.DateTimeFormat(
    language.toLowerCase().startsWith("zh") ? "zh-CN" : "en-US",
    {
      month: "numeric",
      day: "numeric",
    },
  ).format(date);
};

const toTimestamp = (time?: string | null) => {
  if (!time) return 0;
  const date = new Date(time);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
};

const sortThreadsByLatestActivity = (items: ThreadResponse[]) =>
  [...items].sort((a, b) => {
    const aTime = toTimestamp(a.lastMessageAt || a.updatedAt);
    const bTime = toTimestamp(b.lastMessageAt || b.updatedAt);
    return bTime - aTime;
  });

const isImageMessageBody = (body: string) => {
  const trimmedBody = body.trim();
  const normalizedBody = trimmedBody.startsWith(IMAGE_MESSAGE_PREFIX)
    ? trimmedBody.slice(IMAGE_MESSAGE_PREFIX.length).trim()
    : trimmedBody;
  if (!normalizedBody || !HTTP_URL_REGEX.test(normalizedBody)) {
    return false;
  }
  return IMAGE_URL_REGEX.test(normalizedBody) || IMAGE_EXTENSION_REGEX.test(normalizedBody);
};

const getConversationPreview = (
  body: string | null | undefined,
  labels: {
    noMessages: string;
    photo: string;
    chatRequestAccepted: string;
    groupMemberJoined?: (name: string) => string;
  },
) => {
  if (!body) return labels.noMessages;
  const systemMessage = getSystemMessageText(body, labels);
  if (systemMessage) return systemMessage;
  return isImageMessageBody(body) ? labels.photo : body;
};

const getNotificationBody = (
  body: string,
  labels: {
    sentPhoto: string;
    chatRequestAccepted: string;
    groupMemberJoined?: (name: string) => string;
  },
) => {
  const systemMessage = getSystemMessageText(body, labels);
  if (systemMessage) return systemMessage;
  return isImageMessageBody(body) ? labels.sentPhoto : body;
};

const FLIP_LAYOUT_TRANSITION = {
  layout: {
    type: "spring",
    stiffness: 360,
    damping: 32,
    mass: 0.74,
  },
} as const;

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10.75 4.75a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm0-2a8 8 0 1 1 4.95 14.28l4.01 4.01a1 1 0 1 1-1.42 1.41l-4-4A8 8 0 0 1 10.75 2.75Z"
      fill="currentColor"
    />
  </svg>
);

const MutedBellGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M9.2 18h5.6a2.8 2.8 0 0 1-5.6 0Zm2.8-13a5.2 5.2 0 0 1 5.2 5.2v3.3l1.2 1.7a1 1 0 0 1-.82 1.58H6.42a1 1 0 0 1-.82-1.58l1.2-1.7v-3.3A5.2 5.2 0 0 1 12 5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="m5.2 4.8 13.6 14.4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    />
  </svg>
);

const ConversationsVirtuosoScroller = forwardRef<HTMLDivElement, ScrollerProps>((props, ref) => (
  <div {...props} ref={ref} className="conversations-virtuoso-scroller" data-testid="conversations-list-scroller" />
));

ConversationsVirtuosoScroller.displayName = "ConversationsVirtuosoScroller";

const ConversationsVirtuosoList = forwardRef<HTMLDivElement, ListProps & HTMLAttributes<HTMLDivElement>>(
  (props, ref) => <div {...props} ref={ref} className="conversations-virtuoso-list" />
);

ConversationsVirtuosoList.displayName = "ConversationsVirtuosoList";

type ConversationStageChromeProps = {
  hasQuery: boolean;
  heroName: string;
  isSearchOpen: boolean;
  metaLabel: string;
  searchInputRef: RefObject<HTMLInputElement | null>;
  searchTerm: string;
  onOpenSearch: () => void;
  onCloseSearch: () => void;
  onSearchChange: (value: string) => void;
};

type ConversationPageProps = {
  isDormant?: boolean;
};

type NotificationGuideMode =
  | "permission-default"
  | "permission-denied"
  | "ios-install"
  | "subscription-link"
  | null;

const ConversationStageChrome = ({
  hasQuery,
  heroName,
  isSearchOpen,
  metaLabel,
  searchInputRef,
  searchTerm,
  onOpenSearch,
  onCloseSearch,
  onSearchChange,
}: ConversationStageChromeProps) => {
  const { t } = useTranslation();

  return (
    <div className="conversations-stage-header">
      <header className="conversations-hero">
        <div className="conversations-title-wrap">
          <p className="eyebrow">{heroName}</p>
          <h1 className="page-title">{t("conversations.title")}</h1>
          <p className="page-copy">
            {hasQuery ? t("conversations.subtitleSearch") : t("conversations.subtitle")}
          </p>
        </div>
      </header>

      <div className={`conversations-toolbar ${isSearchOpen ? "search-open" : ""}`}>
        {!isSearchOpen && (
          <button
            type="button"
            className="search-launcher"
            aria-label={t("conversations.openSearch")}
            onClick={onOpenSearch}
          >
            <SearchGlyph />
          </button>
        )}
        <div className={`search-shell ${isSearchOpen ? "expanded" : ""}`}>
          <div className="search-field">
            <label className="sr-only" htmlFor="conversation-search">
              {t("conversations.searchByCleanId")}
            </label>
            <div className="search-input-wrap">
              <span className="search-icon">
                <SearchGlyph />
              </span>
              <input
                ref={searchInputRef as RefObject<HTMLInputElement>}
                id="conversation-search"
                type="text"
                placeholder={t("conversations.searchPlaceholder")}
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                onFocus={onOpenSearch}
                onBlur={() => {
                  if (!searchTerm.trim()) {
                    onCloseSearch();
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    onCloseSearch();
                  }
                }}
              />
              <button
                type="button"
                className="search-dismiss"
                aria-label={t("conversations.closeSearch")}
                onClick={onCloseSearch}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="conversations-meta">
        <span>{hasQuery ? t("conversations.metaPeople", { label: metaLabel }) : metaLabel}</span>
      </div>
    </div>
  );
};

const ConversationPage = ({ isDormant = false }: ConversationPageProps) => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const listOverscan = useViewportOverscan();
  const isCompactViewport = useCompactViewport();
  const initialCacheRef = useRef<ConversationsCache | null>(readConversationsCache());
  const shouldShowReturnSkeletonRef = useRef(hasConversationReturnIntent());
  const initialCache = initialCacheRef.current;

  const [me, setMe] = useState<SessionUser | null>(() => initialCache?.me ?? null);
  const [threads, setThreads] = useState<ThreadResponse[]>(() => initialCache?.threads ?? []);
  const [groups, setGroups] = useState<GroupSummary[]>(() => initialCache?.groups ?? []);
  const [status, setStatus] = useState("");
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermission());
  const [notificationGuideMode, setNotificationGuideMode] =
    useState<NotificationGuideMode>(null);
  const [notificationGuideStatus, setNotificationGuideStatus] = useState("");
  const [isRequestingNotificationPermission, setIsRequestingNotificationPermission] =
    useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(
    () => !initialCache || shouldShowReturnSkeletonRef.current
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchUsers, setSearchUsers] = useState<UserSummary[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [unreadCounts, setUnreadCounts] = useState<ConversationUnreadCounts>(() => readUnreadCounts());
  const [mutedConversations, setMutedConversations] = useState<ConversationMuteMap>(() =>
    readConversationMutes()
  );
  const socketRef = useRef<Socket | null>(null);
  const meRef = useRef<SessionUser | null>(null);
  const threadsRef = useRef<ThreadResponse[]>([]);
  const groupsRef = useRef<GroupSummary[]>([]);
  const unreadCountsRef = useRef<ConversationUnreadCounts>(readUnreadCounts());
  const mutedConversationsRef = useRef<ConversationMuteMap>(readConversationMutes());
  const activeChatViewRef = useRef<ActiveChatView | null>(readActiveChatView());
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const statusToastTimeoutRef = useRef<number | null>(null);
  const wasDormantRef = useRef(isDormant);

  const updateUnreadCounts = (updater: (current: ConversationUnreadCounts) => ConversationUnreadCounts) => {
    setUnreadCounts((current) => {
      const next = updater(current);
      unreadCountsRef.current = next;
      persistUnreadCounts(next);
      return next;
    });
  };

  const replaceUnreadCounts = useCallback((nextCounts: ConversationUnreadCounts) => {
    const normalized = normalizeUnreadCounts(nextCounts);
    unreadCountsRef.current = normalized;
    persistUnreadCounts(normalized);
    setUnreadCounts(normalized);
  }, []);

  const updateMutedConversations = useCallback((
    updater: (current: ConversationMuteMap) => ConversationMuteMap,
  ) => {
    setMutedConversations((current) => {
      const next = normalizeConversationMutes(updater(current));
      mutedConversationsRef.current = next;
      persistConversationMutes(next);
      return next;
    });
  }, []);

  const replaceMutedConversations = useCallback((nextMutes: ConversationMuteMap) => {
    const normalized = normalizeConversationMutes(nextMutes);
    mutedConversationsRef.current = normalized;
    persistConversationMutes(normalized);
    setMutedConversations(normalized);
  }, []);

  const clearConversationMute = useCallback((conversationId: string) => {
    updateMutedConversations((current) =>
      setConversationMuted(current, conversationId, false)
    );
  }, [updateMutedConversations]);

  const refreshUnreadCountsFromBackend = useCallback(async () => {
    if (!getAuthToken()) {
      replaceUnreadCounts({});
      return false;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/unread-count`, {
        credentials: "include",
      });
      if (!response.ok) {
        return false;
      }

      const data = (await response.json().catch(() => ({}))) as {
        counts?: unknown;
      };
      replaceUnreadCounts(normalizeUnreadCounts(data.counts));
      return true;
    } catch {
      return false;
    }
  }, [replaceUnreadCounts]);

  const refreshMutedConversationsFromBackend = useCallback(async () => {
    if (!getAuthToken()) {
      replaceMutedConversations({});
      return false;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/chat/mutes`, {
        credentials: "include",
      });
      if (!response.ok) {
        return false;
      }

      const data = (await response.json().catch(() => ({}))) as {
        keys?: unknown;
        directThreadIds?: unknown;
        groupIds?: unknown;
      };

      let keys: string[] = [];
      if (Array.isArray(data.keys)) {
        keys = data.keys
          .map((value) => (typeof value === "string" ? value.trim() : ""))
          .filter(Boolean);
      }

      if (keys.length === 0) {
        const directThreadIds = Array.isArray(data.directThreadIds)
          ? data.directThreadIds
          : [];
        const groupIds = Array.isArray(data.groupIds) ? data.groupIds : [];

        keys = [
          ...directThreadIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
            .map((threadId) => getThreadMuteKey(threadId)),
          ...groupIds
            .map((value) => (typeof value === "string" ? value.trim() : ""))
            .filter(Boolean)
            .map((groupId) => getGroupMuteKey(groupId)),
        ];
      }

      replaceMutedConversations(replaceConversationMutes(keys));
      return true;
    } catch {
      return false;
    }
  }, [replaceMutedConversations]);

  const syncNotificationPermissionState = useCallback(async () => {
    const runtime = await getNotificationRuntimeSupport();
    setNotificationPermission(runtime.permission);

    if (runtime.requiresStandaloneForIOS) {
      setNotificationGuideMode("ios-install");
      setNotificationGuideStatus("");
      return;
    }

    if (runtime.permission === "default") {
      setNotificationGuideMode("permission-default");
      setNotificationGuideStatus("");
      return;
    }

    if (runtime.permission === "denied") {
      setNotificationGuideMode("permission-denied");
      setNotificationGuideStatus("");
      return;
    }

    const activationUserKey = me?.id ?? null;
    const hasExplicitLink = hasPushActivationForUser(activationUserKey);
    const hasLocalSubscription = await hasExistingPushSubscription();
    if (!hasExplicitLink || !hasLocalSubscription) {
      setNotificationGuideMode("subscription-link");
      setNotificationGuideStatus("");
      return;
    }

    const subscription = await syncLinkedPushSubscriptionForCurrentUser({
      activationUserKey,
    });
    if (!subscription.ok) {
      setNotificationGuideMode("subscription-link");
      setNotificationGuideStatus("");
      return;
    }

    setNotificationGuideMode(null);
    setNotificationGuideStatus("");
  }, [me?.id, t]);

  const handleEnableNotificationsFromGuide = useCallback(async () => {
    if (isRequestingNotificationPermission) {
      return;
    }

    setIsRequestingNotificationPermission(true);
    setNotificationGuideStatus("");

    try {
      const subscription = await ensurePushSubscriptionForCurrentUser({
        requestPermission: true,
        forceResubscribe: true,
        activationUserKey: me?.id ?? null,
      });

      setNotificationPermission(subscription.permission);

      if (subscription.ok) {
        setNotificationGuideMode(null);
        setNotificationGuideStatus(t("conversations.notificationsEnabled"));
        void showMessageNotification(
          t("common.cleanChat"),
          t("conversations.notificationsEnabled"),
          {
            tag: "push-link-test",
            target: {
              url: "/conversations",
            },
          },
        ).then((shown) => {
          if (!shown) {
            console.warn(
              "[CleanChat][notifications] test notification did not display after explicit bind.",
            );
          }
        });
        return;
      }

      console.error("[CleanChat][notifications] explicit bind failed", {
        permission: subscription.permission,
        reason: subscription.reason || null,
      });

      if (subscription.permission === "denied") {
        setNotificationGuideMode("permission-denied");
        setNotificationGuideStatus("");
        return;
      }

      if (subscription.permission === "unsupported") {
        if (isIOSDevice() && !isStandalonePwa()) {
          setNotificationGuideMode("ios-install");
          setNotificationGuideStatus("");
          return;
        }

        setNotificationGuideStatus(t("settings.notificationsUnsupported"));
        return;
      }

      if (subscription.permission === "granted") {
        setNotificationGuideMode("subscription-link");
        setNotificationGuideStatus(t("conversations.notificationsLinkFailed"));
        return;
      }

      setNotificationGuideMode("permission-default");
      setNotificationGuideStatus(
        subscription.reason || t("settings.notificationsNotGranted"),
      );
    } finally {
      setIsRequestingNotificationPermission(false);
    }
  }, [isRequestingNotificationPermission, me?.id, t]);

  const syncConversationReadState = useCallback(
    async (
      target:
        | { chatType: "direct"; threadId: number; lastMessageId?: number }
        | { chatType: "group"; groupId: string; lastMessageId?: number }
    ) => {
      const body: Record<string, unknown> = {
        chatType: target.chatType,
      };
      if (target.chatType === "direct") {
        body.threadId = target.threadId;
      } else {
        body.groupId = target.groupId;
      }
      if (typeof target.lastMessageId === "number" && target.lastMessageId > 0) {
        body.lastMessageId = target.lastMessageId;
      }

      try {
        await fetch(`${BACKEND_URL}/chat/unread/read`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(body),
        });
      } catch {
        // Read-sync is best effort.
      }
    },
    [],
  );

  const incrementThreadUnread = (threadId: number) => {
    updateUnreadCounts((current) =>
      incrementUnreadCount(current, getThreadUnreadKey(threadId), 1)
    );
  };

  const incrementGroupUnread = (groupId: string) => {
    updateUnreadCounts((current) =>
      incrementUnreadCount(current, getGroupUnreadKey(groupId), 1)
    );
  };

  const clearConversationUnread = useCallback((conversationId: string) => {
    updateUnreadCounts((current) => clearUnreadCount(current, conversationId));
  }, [updateUnreadCounts]);

  const removeDeletedThread = useCallback(
    (detail: ConversationDeletedDetail | null | undefined) => {
      if (!detail || !Number.isInteger(detail.threadId) || detail.threadId <= 0) {
        return;
      }

      setThreads((prev) => prev.filter((thread) => thread.id !== detail.threadId));
      clearConversationUnread(getThreadUnreadKey(detail.threadId));
      clearConversationMute(getThreadMuteKey(detail.threadId));

      const toastMessage = detail.toast?.trim() || t("chatSettings.deletedToast");
      setStatus(toastMessage);

      if (statusToastTimeoutRef.current !== null) {
        window.clearTimeout(statusToastTimeoutRef.current);
      }

      statusToastTimeoutRef.current = window.setTimeout(() => {
        setStatus((current) => (current === toastMessage ? "" : current));
        statusToastTimeoutRef.current = null;
      }, 1400);
    },
    [clearConversationMute, clearConversationUnread, t],
  );

  const removeDeletedGroup = useCallback(
    (groupId: string, toast?: string) => {
      const normalizedGroupId = groupId.trim();
      if (!normalizedGroupId) {
        return;
      }

      if (!groupsRef.current.some((group) => group.id === normalizedGroupId)) {
        return;
      }

      setGroups((prev) => prev.filter((group) => group.id !== normalizedGroupId));
      clearConversationUnread(getGroupUnreadKey(normalizedGroupId));
      clearConversationMute(getGroupMuteKey(normalizedGroupId));

      const toastMessage =
        toast?.trim() ||
        t("groups.communityDisbandedToast", {
          defaultValue: "This community has been disbanded.",
        });
      setStatus(toastMessage);

      if (statusToastTimeoutRef.current !== null) {
        window.clearTimeout(statusToastTimeoutRef.current);
      }

      statusToastTimeoutRef.current = window.setTimeout(() => {
        setStatus((current) => (current === toastMessage ? "" : current));
        statusToastTimeoutRef.current = null;
      }, 1600);
    },
    [clearConversationMute, clearConversationUnread, t],
  );

  const upsertJoinedGroup = useCallback((group: GroupSummary) => {
    if (!group.joined) {
      return;
    }

    setGroups((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === group.id);
      if (existingIndex < 0) {
        return [group, ...prev];
      }

      const next = [...prev];
      next[existingIndex] = {
        ...next[existingIndex],
        ...group,
        joined: true,
      };
      return next;
    });
  }, []);

  useEffect(() => {
    if (!me) return;
    writeConversationsCache({
      me,
      threads,
      groups,
      savedAt: Date.now(),
    });
  }, [groups, me, threads]);

  useEffect(() => {
    if (!shouldShowReturnSkeletonRef.current) return;
    clearConversationReturnIntent();
  }, []);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

  useEffect(() => {
    groupsRef.current = groups;
  }, [groups]);

  useEffect(() => {
    unreadCountsRef.current = unreadCounts;
  }, [unreadCounts]);

  useEffect(() => {
    mutedConversationsRef.current = mutedConversations;
  }, [mutedConversations]);

  useEffect(() => {
    const refreshActiveChatView = () => {
      activeChatViewRef.current = readActiveChatView();
    };

    const handleActiveChatViewUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<ActiveChatView | null>;
      activeChatViewRef.current = customEvent.detail ?? null;
    };

    window.addEventListener(
      ACTIVE_CHAT_VIEW_UPDATED_EVENT,
      handleActiveChatViewUpdated as EventListener,
    );
    window.addEventListener("storage", refreshActiveChatView);

    return () => {
      window.removeEventListener(
        ACTIVE_CHAT_VIEW_UPDATED_EVENT,
        handleActiveChatViewUpdated as EventListener,
      );
      window.removeEventListener("storage", refreshActiveChatView);
    };
  }, []);

  useEffect(() => {
    const handleMuteEvent = (event: Event) => {
      const customEvent = event as CustomEvent<unknown>;
      if (customEvent.detail && typeof customEvent.detail === "object") {
        const normalized = normalizeConversationMutes(customEvent.detail);
        mutedConversationsRef.current = normalized;
        setMutedConversations(normalized);
        return;
      }

      const fromStorage = readConversationMutes();
      mutedConversationsRef.current = fromStorage;
      setMutedConversations(fromStorage);
    };

    const handleStorage = () => {
      const fromStorage = readConversationMutes();
      mutedConversationsRef.current = fromStorage;
      setMutedConversations(fromStorage);
    };

    window.addEventListener(
      CONVERSATION_MUTES_UPDATED_EVENT,
      handleMuteEvent as EventListener,
    );
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(
        CONVERSATION_MUTES_UPDATED_EVENT,
        handleMuteEvent as EventListener,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

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

  const refreshThreads = useCallback(async () => {
    const threadsResponse = await fetch(`${BACKEND_URL}/chat/threads`, {
      credentials: "include",
    });
    if (!threadsResponse.ok) {
      const data = await threadsResponse.json().catch(() => ({}));
      setStatus(data.message || t("conversations.loadingFailed"));
      return false;
    }

    const data = await threadsResponse.json().catch(() => []);
    setThreads(sortThreadsByLatestActivity(Array.isArray(data) ? data : []));
    setStatus("");
    return true;
  }, [t]);

  const refreshGroups = useCallback(async () => {
    const groupsResponse = await fetch(`${BACKEND_URL}/chat/groups?scope=joined`, {
      credentials: "include",
    });
    if (!groupsResponse.ok) {
      const data = await groupsResponse.json().catch(() => ({}));
      setStatus(data.message || t("groups.loadingFailed"));
      return false;
    }

    const data = await groupsResponse.json().catch(() => ({}));
    const incomingGroups = Array.isArray(data.groups) ? data.groups : [];
    setGroups(incomingGroups);
    setStatus("");
    return true;
  }, [t]);

  useEffect(() => {
    let isMounted = true;
    const shouldMaskInitialLoad = !initialCache || shouldShowReturnSkeletonRef.current;

    const load = async () => {
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      try {
        const meResponse = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: "include",
        });
        if (!meResponse.ok) {
          if (isMounted) {
            setStatus(t("conversations.loginRequired"));
          }
          return;
        }

        const meData = await meResponse.json().catch(() => ({}));
        if (!meData.user) {
          if (isMounted) {
            setStatus(t("conversations.loginRequired"));
          }
          return;
        }

        if (isMounted) setMe(meData.user);

        if (isMounted) {
          await Promise.all([refreshThreads(), refreshGroups()]);
          await refreshUnreadCountsFromBackend();
          await refreshMutedConversationsFromBackend();
        }
      } catch {
        if (isMounted) setStatus(t("conversations.loadingFailed"));
      } finally {
        if (isMounted && shouldMaskInitialLoad) {
          const endedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
          const elapsed = endedAt - startedAt;
          const minimumDuration = shouldShowReturnSkeletonRef.current
            ? CONVERSATION_RETURN_SKELETON_MIN_MS
            : CONVERSATION_SKELETON_MIN_MS;
          const remaining = minimumDuration - elapsed;
          if (remaining > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, remaining));
          }
          setIsInitialLoading(false);
        }
      }
    };

    void load();
    return () => {
      isMounted = false;
    };
  }, [
    initialCache,
    refreshGroups,
    refreshMutedConversationsFromBackend,
    refreshThreads,
    refreshUnreadCountsFromBackend,
    t,
  ]);

  useEffect(() => {
    if (!me) {
      wasDormantRef.current = isDormant;
      return;
    }

    const didBecomeActive = wasDormantRef.current && !isDormant;
    wasDormantRef.current = isDormant;

    if (!didBecomeActive) {
      return;
    }

    void Promise.all([
      refreshThreads(),
      refreshGroups(),
      refreshUnreadCountsFromBackend(),
      refreshMutedConversationsFromBackend(),
    ]);
  }, [
    isDormant,
    me,
    refreshGroups,
    refreshMutedConversationsFromBackend,
    refreshThreads,
    refreshUnreadCountsFromBackend,
  ]);

  useEffect(() => {
    if (!me) {
      setNotificationGuideMode(null);
      setNotificationGuideStatus("");
      return;
    }

    void syncNotificationPermissionState();

    const refreshNotificationState = () => {
      if (typeof document !== "undefined" && document.hidden) {
        return;
      }
      void syncNotificationPermissionState();
    };

    window.addEventListener("focus", refreshNotificationState);
    window.addEventListener("pageshow", refreshNotificationState);
    document.addEventListener("visibilitychange", refreshNotificationState);

    let permissionStatus: PermissionStatus | null = null;
    const permissionsApi =
      typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (permissionsApi?.query) {
      void permissionsApi
        .query({ name: "notifications" as PermissionName })
        .then((status) => {
          permissionStatus = status;
          permissionStatus.addEventListener("change", refreshNotificationState);
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("focus", refreshNotificationState);
      window.removeEventListener("pageshow", refreshNotificationState);
      document.removeEventListener("visibilitychange", refreshNotificationState);
      if (permissionStatus) {
        permissionStatus.removeEventListener("change", refreshNotificationState);
      }
    };
  }, [me, syncNotificationPermissionState]);

  useEffect(() => {
    if (!me) {
      return;
    }

    void refreshUnreadCountsFromBackend();
    void refreshMutedConversationsFromBackend();

    const refreshWhenVisible = () => {
      if (!document.hidden) {
        void refreshUnreadCountsFromBackend();
        void refreshMutedConversationsFromBackend();
      }
    };

    const intervalId = window.setInterval(() => {
      refreshWhenVisible();
    }, 30000);

    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [me, refreshMutedConversationsFromBackend, refreshUnreadCountsFromBackend]);

  useEffect(() => {
    if (!me) return;
    let isDisposed = false;
    let socket: Socket | null = null;

    const handleIncomingMessage = (message: RealtimeMessage) => {
      setThreads((prev) => {
        const threadExists = prev.some((item) => item.id === message.threadId);
        if (!threadExists) return prev;

        const next = prev.map((item) => {
          if (item.id !== message.threadId) return item;

          return {
            ...item,
            lastMessageAt: message.createdAt,
            updatedAt: message.createdAt,
            Messages: [
              {
                id: message.id,
                body: message.body,
                senderId: message.senderId,
                createdAt: message.createdAt,
              },
            ],
          };
        });

        return sortThreadsByLatestActivity(next);
      });

      const currentUser = meRef.current;
      if (!currentUser || message.senderId === currentUser.id) return;

      const activeChatView = activeChatViewRef.current;
      const suppressForegroundActiveNotification =
        typeof document !== "undefined" &&
        !document.hidden &&
        activeChatView?.chatType === "direct" &&
        activeChatView.threadId === message.threadId;

      if (!suppressForegroundActiveNotification) {
        incrementThreadUnread(message.threadId);
      }

      const targetThread = threadsRef.current.find((item) => item.id === message.threadId);
      let senderName = t("common.cleanChat");
      if (!targetThread) {
        void refreshThreads();
      } else {
        const sender = targetThread.UserA.id === message.senderId ? targetThread.UserA : targetThread.UserB;
        senderName = sender.cleanId || sender.name || sender.email;
      }

      const mutedByMe = isConversationMuted(
        mutedConversationsRef.current,
        getThreadMuteKey(message.threadId),
      );
      if (mutedByMe) {
        return;
      }

      if (suppressForegroundActiveNotification) {
        return;
      }

      showMessageNotification(senderName, getNotificationBody(message.body, {
        sentPhoto: t("conversations.sentPhoto"),
        chatRequestAccepted: t("chat.requestAcceptedSystem"),
        groupMemberJoined: (name) => t("chat.memberJoined", { name }),
      }), {
        tag: `thread-${message.threadId}`,
        target: {
          chatType: "direct",
          threadId: message.threadId,
        },
      });
    };

    const handleIncomingGroupMessage = (message: GroupRealtimeMessage) => {
      setGroups((prev) => {
        const groupExists = prev.some((item) => item.id === message.groupId && item.joined);
        if (!groupExists) {
          void refreshGroups();
          return prev;
        }

        return prev.map((item) => {
          if (item.id !== message.groupId) return item;
          return {
            ...item,
            lastMessagePreview: message.body,
            lastMessageAt: message.createdAt,
          };
        });
      });

      const currentUser = meRef.current;
      if (!currentUser || message.senderId === currentUser.id) return;

      const activeChatView = activeChatViewRef.current;
      const suppressForegroundActiveNotification =
        typeof document !== "undefined" &&
        !document.hidden &&
        activeChatView?.chatType === "group" &&
        activeChatView.groupId === message.groupId;

      if (!suppressForegroundActiveNotification) {
        incrementGroupUnread(message.groupId);
      }

      const targetGroup = groupsRef.current.find((item) => item.id === message.groupId);
      const groupName = targetGroup?.name ?? t("groups.groupFallback");
      const senderName = message.senderName || t("groups.someone");
      const mutedByMe = isConversationMuted(
        mutedConversationsRef.current,
        getGroupMuteKey(message.groupId),
      );
      if (mutedByMe) {
        return;
      }

      if (suppressForegroundActiveNotification) {
        return;
      }

      showMessageNotification(groupName, `${senderName}: ${getNotificationBody(message.body, {
        sentPhoto: t("conversations.sentPhoto"),
        chatRequestAccepted: t("chat.requestAcceptedSystem"),
        groupMemberJoined: (name) => t("chat.memberJoined", { name }),
      })}`, {
        tag: `group-${message.groupId}`,
        target: {
          chatType: "group",
          groupId: message.groupId,
        },
      });
    };

    const initSocket = async () => {
      const token = getAuthToken();
      if (!token || isDisposed) {
        if (!isDisposed) {
          setStatus(t("common.sessionExpired"));
        }
        return;
      }

      socket = io(SOCKET_URL, {
        auth: { token },
      });
      socketRef.current = socket;

      const handleConnectError = async (error: Error) => {
        if (isDisposed) {
          return;
        }

        setStatus(t("conversations.realtimeReconnecting"));
        if (error?.message !== "Not authenticated" || !socket) {
          return;
        }

        clearAuthToken();
        setStatus(t("common.sessionExpired"));
        socket.disconnect();
      };

      socket.on("inbox:new", handleIncomingMessage);
      socket.on("group:message:new", handleIncomingGroupMessage);
      socket.on("thread:deleted", removeDeletedThread);
      socket.on("connect_error", (error) => {
        void handleConnectError(error as Error);
      });
      socket.on("connect", () => {
        if (!isDisposed) {
          setStatus("");
        }
      });
    };

    void initSocket();

    return () => {
      isDisposed = true;
      socket?.off("inbox:new", handleIncomingMessage);
      socket?.off("group:message:new", handleIncomingGroupMessage);
      socket?.off("thread:deleted", removeDeletedThread);
      socket?.disconnect();
      socketRef.current = null;
    };
  }, [me, refreshGroups, refreshThreads, removeDeletedThread, t]);

  useEffect(() => {
    if (typeof window === "undefined" || import.meta.env.PROD) return;

    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{
        chatType?: "direct" | "group";
        threadId?: number;
        groupId?: string;
        senderId?: number;
        senderName?: string;
        body?: string;
        createdAt?: string;
      }>;

      const detail = customEvent.detail;
      if (!detail) return;

      const now = detail.createdAt ?? new Date().toISOString();
      const body = detail.body ?? t("chat.newMessage");

      if ((detail.chatType === "group" || typeof detail.groupId === "string") && detail.groupId) {
        setGroups((prev) =>
          prev.map((group) =>
            group.id === detail.groupId
              ? {
                  ...group,
                  lastMessagePreview: body,
                  lastMessageAt: now,
                }
              : group
          )
        );
        incrementGroupUnread(detail.groupId);
        return;
      }

      if (typeof detail.threadId !== "number") {
        return;
      }

      setThreads((prev) => {
        const next = prev.map((thread) => {
          if (thread.id !== detail.threadId) {
            return thread;
          }

          return {
            ...thread,
            lastMessageAt: now,
            updatedAt: now,
            Messages: [
              {
                id: Date.now(),
                body,
                senderId: detail.senderId ?? 0,
                createdAt: now,
              },
            ],
          };
        });
        return sortThreadsByLatestActivity(next);
      });
      incrementThreadUnread(detail.threadId);
    };

    window.addEventListener("cleanchat:simulate-inbox", handler as EventListener);
    return () => {
      window.removeEventListener("cleanchat:simulate-inbox", handler as EventListener);
    };
  }, [incrementGroupUnread, incrementThreadUnread, t]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<ConversationDeletedDetail>;
      removeDeletedThread(customEvent.detail);
    };

    window.addEventListener(CONVERSATION_DELETED_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(CONVERSATION_DELETED_EVENT, handler as EventListener);
    };
  }, [removeDeletedThread]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<GroupsRealtimeDetail>;
      const detail = customEvent.detail;
      if (!detail?.reason) {
        return;
      }

      if (detail.reason === "group-deleted" && detail.groupId) {
        removeDeletedGroup(detail.groupId);
        return;
      }

      if (isJoinedGroupSummary(detail.group)) {
        upsertJoinedGroup(detail.group);
      }
      void refreshGroups();
    };

    window.addEventListener(GROUPS_REALTIME_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(GROUPS_REALTIME_EVENT, handler as EventListener);
    };
  }, [refreshGroups, removeDeletedGroup, upsertJoinedGroup]);

  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<GroupConversationLeftDetail>;
      const detail = customEvent.detail;
      const groupId = typeof detail?.groupId === "string" ? detail.groupId.trim() : "";
      if (!groupId) {
        return;
      }

      setGroups((prev) => prev.filter((group) => group.id !== groupId));
      clearConversationUnread(getGroupUnreadKey(groupId));
      clearConversationMute(getGroupMuteKey(groupId));

      const toastMessage = detail.toast?.trim() || t("groupSettings.leftToast");
      setStatus(toastMessage);

      if (statusToastTimeoutRef.current !== null) {
        window.clearTimeout(statusToastTimeoutRef.current);
      }

      statusToastTimeoutRef.current = window.setTimeout(() => {
        setStatus((current) => (current === toastMessage ? "" : current));
        statusToastTimeoutRef.current = null;
      }, 1400);
    };

    window.addEventListener(GROUP_CONVERSATION_LEFT_EVENT, handler as EventListener);
    return () => {
      window.removeEventListener(GROUP_CONVERSATION_LEFT_EVENT, handler as EventListener);
    };
  }, [clearConversationMute, clearConversationUnread, t]);

  useEffect(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) {
      setSearchUsers([]);
      setSearchStatus("");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        setSearchStatus(t("conversations.searching"));
        const response = await fetch(
          `${BACKEND_URL}/chat/users/search?cleanId=${encodeURIComponent(query)}`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setSearchStatus(data.message || data.error || t("conversations.searchFailed"));
          return;
        }

        const users = Array.isArray(data.users) ? data.users : [];
        setSearchUsers(users);
        setSearchStatus(users.length === 0 ? t("conversations.noUsers") : "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSearchStatus(t("conversations.searchFailed"));
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm, t]);

  const threadByUserId = useMemo(() => {
    const map = new Map<number, number>();
    if (!me) return map;

    threads.forEach((item) => {
      const other = item.AID === me.id ? item.UserB : item.UserA;
      map.set(other.id, item.id);
    });

    return map;
  }, [threads, me]);

  const conversations = useMemo<ConversationItem[]>(() => {
    if (!me) return [];

    const directItems = threads.map((item) => {
      const isA = item.AID === me.id;
      const other = isA ? item.UserB : item.UserA;
      const latestMessage = item.Messages?.[0] ?? null;
      const displayName = other.name || other.cleanId || other.email;
      const lastActivityTime = latestMessage?.createdAt || item.lastMessageAt || item.updatedAt;
      return {
        id: `direct-${item.id}`,
        chatType: "direct" as const,
        threadId: item.id,
        userId: other.id,
        avatarKey: other.avatar,
        name: displayName,
        email: other.email,
        cleanId: other.cleanId,
        gender: normalizeGender(other.gender),
        avatarUrl: resolveAvatarUrl(other.avatar),
        role: t("conversations.roleDirect"),
        preview: getConversationPreview(latestMessage?.body, {
          noMessages: t("conversations.noMessages"),
          photo: t("conversations.photo"),
          chatRequestAccepted: t("chat.requestAcceptedSystem"),
          groupMemberJoined: (name) => t("chat.memberJoined", { name }),
        }),
        time: formatTime(lastActivityTime, i18n.language, t("conversations.new")),
        sortAt: lastActivityTime,
        subline: `@${other.cleanId}`,
        unreadCount: unreadCounts[getThreadUnreadKey(item.id)] ?? 0,
        muted: isConversationMuted(
          mutedConversations,
          getThreadMuteKey(item.id),
        ),
      };
    });

    const joinedGroupItems = groups
      .filter((group) => group.joined)
      .map((group) => ({
        id: `group-${group.id}`,
        chatType: "group" as const,
        groupId: group.id,
        name: group.name,
        cleanId: group.id,
        avatarUrl: group.avatarUrl,
        role: t("conversations.roleGroup"),
        preview: getConversationPreview(group.lastMessagePreview, {
          noMessages: t("conversations.noMessages"),
          photo: t("conversations.photo"),
          chatRequestAccepted: t("chat.requestAcceptedSystem"),
          groupMemberJoined: (name) => t("chat.memberJoined", { name }),
        }),
        time: formatTime(group.lastMessageAt || undefined, i18n.language, t("conversations.new")),
        sortAt: group.lastMessageAt,
        subline: t("groups.members", { count: group.memberCount }),
        unreadCount: unreadCounts[getGroupUnreadKey(group.id)] ?? 0,
        muted: isConversationMuted(
          mutedConversations,
          getGroupMuteKey(group.id),
        ),
      }));

    return [...directItems, ...joinedGroupItems].sort((a, b) => {
      const aTime = toTimestamp(a.sortAt);
      const bTime = toTimestamp(b.sortAt);
      return bTime - aTime;
    });
  }, [threads, groups, me, mutedConversations, unreadCounts, t, i18n.language]);

  const skeletonCards = useMemo<ConversationSkeletonCard[]>(() => {
    if (conversations.length === 0) {
      return FALLBACK_SKELETON_CARDS;
    }
    return conversations.slice(0, 6).map((item, index) => ({
      id: item.id,
      chatType: item.chatType,
      role: item.role,
      nameWidth: item.chatType === "group" ? "7.3rem" : index % 2 === 0 ? "8.2rem" : "6.9rem",
      previewWidth: item.chatType === "group" ? "81%" : index % 2 === 0 ? "87%" : "76%",
      previewSecondaryWidth: item.chatType === "group" ? "54%" : index % 2 === 0 ? "58%" : "49%",
      sublineWidth: item.chatType === "group" ? "5.6rem" : "7.2rem",
    }));
  }, [conversations]);

  const handleOpenThread = (threadId: number, other: string, avatarUrl?: string, avatarKey?: AvatarKey) => {
    clearConversationUnread(getThreadUnreadKey(threadId));
    void syncConversationReadState({
      chatType: "direct",
      threadId,
    });
    navigate("/chat", { state: { threadId, other, avatarUrl, avatarKey, fromPath: "/conversations" } });
  };

  const handleOpenGroup = (groupId: string, groupName: string, avatarUrl: string) => {
    clearConversationUnread(getGroupUnreadKey(groupId));
    void syncConversationReadState({
      chatType: "group",
      groupId,
    });
    navigate("/chat", {
      state: { chatType: "group", groupId, other: groupName, avatarUrl, fromPath: "/conversations" },
    });
  };

  const handleOpenUser = (user: UserSummary) => {
    const existingThreadId = threadByUserId.get(user.id);
    if (existingThreadId) {
      handleOpenThread(existingThreadId, user.cleanId || user.email, resolveAvatarUrl(user.avatar), user.avatar);
      return;
    }

    navigate(`/profile/user/${user.id}`, {
      state: {
        fromPath: "/conversations",
        user,
      },
    });
  };

  const openSearch = () => {
    setIsSearchExpanded(true);
  };

  const closeSearch = () => {
    setSearchTerm("");
    setSearchUsers([]);
    setSearchStatus("");
    setIsSearchExpanded(false);
  };

  const hasQuery = searchTerm.trim().length > 0;
  const isSearchOpen = isSearchExpanded || hasQuery;
  const heroName = me?.name || me?.cleanId || me?.email || t("common.cleanChat");
  const metaCount = hasQuery ? searchUsers.length : conversations.length;
  const metaLabel = isInitialLoading && !hasQuery && metaCount === 0
    ? t("conversations.syncing")
    : hasQuery
      ? t("conversations.peopleFound", { count: metaCount })
      : t("conversations.conversationCount", { count: metaCount });
  const viewportIncrease = {
    top: listOverscan,
    bottom: listOverscan,
  } as const;
  const listOverscanWindow = {
    main: listOverscan,
    reverse: listOverscan,
  } as const;
  const searchResultStatus = searchStatus || t("conversations.noUsers");
  const hasConversationResults = conversations.length > 0;
  const hasSearchResults = searchUsers.length > 0;
  const shouldShowInlineStatus = !isInitialLoading && Boolean(status);
  const shouldShowSearchEmpty = !isInitialLoading && hasQuery && !hasSearchResults;
  const shouldShowEmptyState = !isInitialLoading && !hasQuery && !hasConversationResults;
  const shouldRenderSearchResults = !isInitialLoading && hasQuery && hasSearchResults;
  const shouldRenderConversations = !isInitialLoading && !hasQuery && hasConversationResults;
  const shouldShowNotificationGuide = Boolean(me) && notificationGuideMode !== null;
  const notificationGuideCopy =
    notificationGuideMode === "ios-install"
      ? t("conversations.notificationsIosPwaGuide")
      : notificationGuideMode === "permission-denied"
        ? isAndroid13Plus()
          ? t("settings.notificationsBlockedAndroid")
          : t("settings.notificationsBlockedBrowser")
        : notificationGuideMode === "subscription-link"
          ? t("conversations.notificationsLinkGuide")
          : t("conversations.notificationsDefaultGuide");
  const notificationGuideActionLabel = isRequestingNotificationPermission
    ? t("conversations.notificationsEnabling")
    : notificationGuideMode === "subscription-link"
      ? t("conversations.notificationsLinkAction")
      : t("conversations.notificationsEnableAction");

  const renderSearchUserCard = (_index: number, user: UserSummary) => {
    const hasThread = threadByUserId.has(user.id);
    const actionLabel =
      hasThread ? t("conversations.openChat") : t("conversations.requestChat");

    return (
      <div className="conversations-virtual-item">
        <button
          type="button"
          className="conversation-card"
          data-conversation-user-id={user.id}
          onClick={() => {
            handleOpenUser(user);
          }}
        >
          <div className="avatar">
            <img
              className={getAvatarToneClass(user.avatar)}
              src={resolveAvatarUrl(user.avatar)}
              alt={`${user.cleanId} ${t("common.avatar")}`}
            />
          </div>
          <div className="conversation-body">
            <div className="conversation-top">
              <h3>{user.name || user.cleanId}</h3>
              <p className="role">{actionLabel}</p>
            </div>
            <div className="conversation-identity-row">
              <p className="conversation-subline conversation-cleanid">
                @{user.cleanId}
              </p>
            </div>
            <p className="conversation-subline">{user.email}</p>
          </div>
        </button>
      </div>
    );
  };

  const renderConversationCardContent = (item: ConversationItem) => (
    <>
      <div className="avatar">
        <img
          className={item.avatarKey ? getAvatarToneClass(item.avatarKey) : undefined}
          src={item.avatarUrl}
          alt={`${item.name} ${t("common.avatar")}`}
        />
      </div>
      <div className="conversation-body">
        <div className="conversation-top">
          <div className="conversation-heading">
            <h3>{item.name}</h3>
            {item.chatType === "direct" && item.gender && (
              <span
                className="conversation-gender-icon"
                role="img"
                aria-label={t(GENDER_ARIA_KEY_MAP[item.gender])}
              >
                <GenderLineIcon gender={item.gender} className="conversation-gender-icon-svg" />
              </span>
            )}
            <p className="role">{item.role}</p>
          </div>
          <div className="conversation-meta-stack">
            <span className="conversation-meta-time-row">
              <span className="time">{item.time}</span>
              {item.muted && (
                <span
                  className="conversation-muted-icon"
                  role="img"
                  aria-label={t("conversations.muted")}
                >
                  <MutedBellGlyph />
                </span>
              )}
            </span>
            <span className="conversation-badge-slot" aria-hidden={item.unreadCount <= 0}>
              {item.unreadCount > 0 && item.muted ? (
                <span
                  className="conversation-muted-unread-dot"
                  role="img"
                  aria-label={t("conversations.mutedUnreadMessage", {
                    count: item.unreadCount,
                  })}
                />
              ) : (
                <Badge
                  count={item.unreadCount}
                  size="compact"
                  className="conversation-unread-badge"
                  ariaLabel={t("conversations.unreadMessage", {
                    count: item.unreadCount,
                  })}
                />
              )}
            </span>
          </div>
        </div>
        <p className="preview">{item.preview}</p>
        <div className="conversation-identity-row">
          <p className="conversation-subline conversation-cleanid">
            {item.subline}
          </p>
        </div>
      </div>
    </>
  );

  const renderConversationCard = (_index: number, item: ConversationItem) => {
    const handleOpen = () => {
      if (item.chatType === "group" && item.groupId) {
        handleOpenGroup(item.groupId, item.name, item.avatarUrl);
        return;
      }
      if (item.threadId) {
        handleOpenThread(item.threadId, item.cleanId || item.email || item.name, item.avatarUrl, item.avatarKey);
      }
    };

    if (isDormant) {
      return (
        <div key={item.id} className="conversations-virtual-item">
          <button
            type="button"
            className="conversation-card"
            data-conversation-id={item.id}
            onClick={handleOpen}
          >
            {renderConversationCardContent(item)}
          </button>
        </div>
      );
    }

    return (
      <motion.div
        key={item.id}
        className="conversations-virtual-item"
        layout
        transition={FLIP_LAYOUT_TRANSITION}
        initial={false}
      >
        <motion.button
          type="button"
          className="conversation-card"
          data-conversation-id={item.id}
          layout
          transition={FLIP_LAYOUT_TRANSITION}
          onClick={handleOpen}
        >
          {renderConversationCardContent(item)}
        </motion.button>
      </motion.div>
    );
  };

  return (
    <div
      className={`conversations-page ${isDormant ? "is-dormant" : ""}`}
      aria-hidden={isDormant}
      data-hibernating={isDormant ? "true" : "false"}
    >
      <div className="conversations-shell">
        <div className="conversations-stage">
          <ConversationStageChrome
            hasQuery={hasQuery}
            heroName={heroName}
            isSearchOpen={isSearchOpen}
            metaLabel={metaLabel}
            searchInputRef={searchInputRef}
            searchTerm={searchTerm}
            onOpenSearch={openSearch}
            onCloseSearch={closeSearch}
            onSearchChange={setSearchTerm}
          />

          {shouldShowNotificationGuide && (
            <p
              className={`conversations-notification-guide ${
                notificationGuideMode === "ios-install" ? "is-ios" : ""
              }`}
              role="status"
            >
              {notificationGuideMode === "ios-install" && (
                <span
                  className="conversations-notification-guide-arrow"
                  aria-hidden="true"
                >
                  ↗
                </span>
              )}
              <span>{notificationGuideCopy}</span>
              {(notificationGuideMode === "permission-default" ||
                notificationGuideMode === "subscription-link") && (
                <button
                  type="button"
                  className="conversations-notification-guide-action"
                  onClick={handleEnableNotificationsFromGuide}
                  disabled={isRequestingNotificationPermission}
                >
                  {notificationGuideActionLabel}
                </button>
              )}
            </p>
          )}

          {notificationGuideStatus && (
            <p className="conversations-notification-guide-status" role="status">
              {notificationGuideStatus}
            </p>
          )}

          {shouldShowInlineStatus && (
            <div className="status-text conversations-inline-status" role="status">
              {status}
            </div>
          )}

          {isInitialLoading && !hasQuery && (
            <div
              className="conversations-scroll-shell"
              data-testid="conversations-scroll-shell"
              aria-label={t("conversations.loading")}
            >
              <div className="conversations-scroll-content">
                <section className="conversations-list conversations-list-loading">
                  {skeletonCards.map((item) => (
                    <article
                      key={`loading-${item.id}`}
                      className="conversation-card conversation-card-skeleton"
                      aria-hidden="true"
                    >
                      <div className="avatar avatar-skeleton">
                        <span className="skeleton-surface avatar-skeleton-core" />
                      </div>
                      <div className="conversation-body">
                        <div className="conversation-top">
                          <span className="skeleton-surface conversation-title-skeleton" style={{ width: item.nameWidth }} />
                          <span className="role role-skeleton">
                            <span className="skeleton-surface role-skeleton-core" />
                          </span>
                          <span className="skeleton-surface time-skeleton" />
                        </div>
                        <div className="conversation-preview-skeleton">
                          <span className="skeleton-surface preview-skeleton-line" style={{ width: item.previewWidth }} />
                          <span
                            className="skeleton-surface preview-skeleton-line preview-skeleton-line-short"
                            style={{ width: item.previewSecondaryWidth }}
                          />
                        </div>
                        <div className="conversation-identity-row">
                          <span
                            className={`conversation-subline conversation-cleanid conversation-cleanid-skeleton ${item.chatType === "group" ? "conversation-cleanid-skeleton-group" : ""}`}
                          >
                            <span className="skeleton-surface cleanid-skeleton-core" style={{ width: item.sublineWidth }} />
                          </span>
                        </div>
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            </div>
          )}

          {shouldShowSearchEmpty && (
            <div className="conversations-scroll-shell" data-testid="conversations-scroll-shell">
              <div className="conversations-scroll-content">
                <div className="status-text">{searchResultStatus}</div>
              </div>
            </div>
          )}

          {shouldRenderSearchResults && (
            isCompactViewport ? (
              <div className="conversations-scroll-shell" data-testid="conversations-scroll-shell">
                <div className="conversations-scroll-content">
                  <section className="conversations-list conversations-list-static" aria-label={t("conversations.searchResults")}>
                    {searchUsers.map((user, index) => (
                      <div key={`user-${user.id}`}>{renderSearchUserCard(index, user)}</div>
                    ))}
                  </section>
                </div>
              </div>
            ) : (
              <section className="conversations-list-shell" aria-label={t("conversations.searchResults")}>
                <Virtuoso
                  className="conversations-virtuoso"
                  data={searchUsers}
                  computeItemKey={(_index, user) => `user-${user.id}`}
                  defaultItemHeight={96}
                  increaseViewportBy={viewportIncrease}
                  overscan={listOverscanWindow}
                  minOverscanItemCount={{ top: 12, bottom: 12 }}
                  skipAnimationFrameInResizeObserver
                  components={{
                    Scroller: ConversationsVirtuosoScroller,
                    List: ConversationsVirtuosoList,
                  }}
                  itemContent={renderSearchUserCard}
                />
              </section>
            )
          )}

          {shouldShowEmptyState && (
            <div className="conversations-scroll-shell" data-testid="conversations-scroll-shell">
              <div className="conversations-scroll-content">
                <section className="conversations-empty-state">
                  <div className="conversations-empty-mark">
                    <span className="conversation-cleanid">@{me?.cleanId ?? "cleanid"}</span>
                  </div>
                  <h3>{t("conversations.emptyTitle")}</h3>
                  <p>{t("conversations.emptyCopy")}</p>
                </section>
              </div>
            </div>
          )}

          {shouldRenderConversations && (
            <div className="conversations-scroll-shell" data-testid="conversations-scroll-shell">
              <div className="conversations-scroll-content">
                {isDormant ? (
                  <section className="conversations-list conversations-list-static conversations-list-fluid" aria-label={t("conversations.title")}>
                    {conversations.map((item, index) => renderConversationCard(index, item))}
                  </section>
                ) : (
                  <MotionConfig reducedMotion="user">
                    <section className="conversations-list conversations-list-static conversations-list-fluid" aria-label={t("conversations.title")}>
                      <AnimatePresence initial={false}>
                        {conversations.map((item, index) => renderConversationCard(index, item))}
                      </AnimatePresence>
                    </section>
                  </MotionConfig>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default ConversationPage;
