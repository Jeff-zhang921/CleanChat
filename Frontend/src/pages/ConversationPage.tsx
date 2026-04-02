import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { io, type Socket } from "socket.io-client";
import BottomNav from "../components/BottomNav";
import { DEFAULT_AVATAR_KEY, getAvatarToneClass, getAvatarUrl, type AvatarKey } from "../constants/avatarCatalog";
import { BACKEND_URL, SOCKET_URL } from "../config";
import { useViewportOverscan } from "../hooks/useViewportOverscan";
import {
  FALLBACK_CLEAN_ID_TRUST,
  type CleanIdTrustSnapshot,
  getTrustToneLabel,
} from "../utils/cleanIdTrust";
import { showMessageNotification } from "../utils/notifications";
import "./ConversationPage.css";

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  trust: CleanIdTrustSnapshot;
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
  avatarUrl: string;
  role: string;
  preview: string;
  time: string;
  sortAt?: string | null;
  subline: string;
  trust?: CleanIdTrustSnapshot;
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
  joined: boolean;
  isOwner: boolean;
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
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
  hasTrust: boolean;
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
    hasTrust: true,
    nameWidth: "8.4rem",
    previewWidth: "84%",
    previewSecondaryWidth: "56%",
    sublineWidth: "7.3rem",
  },
  {
    id: "skeleton-group-a",
    chatType: "group",
    role: "Group",
    hasTrust: false,
    nameWidth: "7.1rem",
    previewWidth: "78%",
    previewSecondaryWidth: "48%",
    sublineWidth: "5.4rem",
  },
  {
    id: "skeleton-direct-b",
    chatType: "direct",
    role: "Direct",
    hasTrust: true,
    nameWidth: "7.8rem",
    previewWidth: "88%",
    previewSecondaryWidth: "60%",
    sublineWidth: "6.8rem",
  },
  {
    id: "skeleton-direct-c",
    chatType: "direct",
    role: "Direct",
    hasTrust: true,
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

const formatTime = (time?: string) => {
  if (!time) return "New";
  const date = new Date(time);
  if (Number.isNaN(date.getTime())) return "New";
  return date.toLocaleDateString();
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

const getConversationPreview = (body?: string | null) => {
  if (!body) return "No messages yet.";
  return isImageMessageBody(body) ? "Photo" : body;
};

const getNotificationBody = (body: string) =>
  isImageMessageBody(body) ? "sent a photo" : body;

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      d="M10.75 4.75a6 6 0 1 0 0 12a6 6 0 0 0 0-12Zm0-2a8 8 0 1 1 4.95 14.28l4.01 4.01a1 1 0 1 1-1.42 1.41l-4-4A8 8 0 0 1 10.75 2.75Z"
      fill="currentColor"
    />
  </svg>
);

const ConversationPage = () => {
  const navigate = useNavigate();
  const listOverscan = useViewportOverscan();
  const initialCacheRef = useRef<ConversationsCache | null>(readConversationsCache());
  const shouldShowReturnSkeletonRef = useRef(hasConversationReturnIntent());
  const initialCache = initialCacheRef.current;

  const [me, setMe] = useState<SessionUser | null>(() => initialCache?.me ?? null);
  const [threads, setThreads] = useState<ThreadResponse[]>(() => initialCache?.threads ?? []);
  const [groups, setGroups] = useState<GroupSummary[]>(() => initialCache?.groups ?? []);
  const [status, setStatus] = useState("");
  const [isInitialLoading, setIsInitialLoading] = useState(
    () => !initialCache || shouldShowReturnSkeletonRef.current
  );
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [searchUsers, setSearchUsers] = useState<UserSummary[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [openingUserId, setOpeningUserId] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const meRef = useRef<SessionUser | null>(null);
  const threadsRef = useRef<ThreadResponse[]>([]);
  const groupsRef = useRef<GroupSummary[]>([]);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

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
    if (!isSearchExpanded) return;
    const frame = window.requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isSearchExpanded]);

  const refreshThreads = async () => {
    const threadsResponse = await fetch(`${BACKEND_URL}/chat/threads`, {
      credentials: "include",
    });
    if (!threadsResponse.ok) {
      const data = await threadsResponse.json().catch(() => ({}));
      setStatus(data.message || "Failed to load conversations.");
      return false;
    }

    const data = await threadsResponse.json().catch(() => []);
    setThreads(sortThreadsByLatestActivity(Array.isArray(data) ? data : []));
    setStatus("");
    return true;
  };

  const refreshGroups = async () => {
    const groupsResponse = await fetch(`${BACKEND_URL}/chat/groups`, {
      credentials: "include",
    });
    if (!groupsResponse.ok) {
      const data = await groupsResponse.json().catch(() => ({}));
      setStatus(data.message || "Failed to load groups.");
      return false;
    }

    const data = await groupsResponse.json().catch(() => ({}));
    const incomingGroups = Array.isArray(data.groups) ? data.groups : [];
    setGroups(incomingGroups);
    setStatus("");
    return true;
  };

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
            setStatus("Please login to see conversations.");
          }
          return;
        }

        const meData = await meResponse.json().catch(() => ({}));
        if (!meData.user) {
          if (isMounted) {
            setStatus("Please login to see conversations.");
          }
          return;
        }

        if (isMounted) setMe(meData.user);

        if (isMounted) {
          await Promise.all([refreshThreads(), refreshGroups()]);
        }
      } catch {
        if (isMounted) setStatus("Failed to load conversations.");
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
  }, [initialCache]);

  useEffect(() => {
    if (!me) return;

    const socket = io(SOCKET_URL, { withCredentials: true });
    socketRef.current = socket;

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

      const targetThread = threadsRef.current.find((item) => item.id === message.threadId);
      let senderName = "CleanChat";
      if (!targetThread) {
        void refreshThreads();
      } else {
        const sender = targetThread.UserA.id === message.senderId ? targetThread.UserA : targetThread.UserB;
        senderName = sender.cleanId || sender.name || sender.email;
      }

      showMessageNotification(senderName, getNotificationBody(message.body), `thread-${message.threadId}`);
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

      const targetGroup = groupsRef.current.find((item) => item.id === message.groupId);
      const groupName = targetGroup?.name ?? "Group";
      const senderName = message.senderName || "Someone";
      showMessageNotification(groupName, `${senderName}: ${getNotificationBody(message.body)}`, `group-${message.groupId}`);
    };

    socket.on("inbox:new", handleIncomingMessage);
    socket.on("group:message:new", handleIncomingGroupMessage);
    socket.on("connect_error", () => {
      setStatus("Realtime connection lost. Trying to reconnect...");
    });
    socket.on("connect", () => {
      setStatus("");
    });

    return () => {
      socket.off("inbox:new", handleIncomingMessage);
      socket.off("group:message:new", handleIncomingGroupMessage);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [me]);

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
        setSearchStatus("Searching users by CleanID...");
        const response = await fetch(
          `${BACKEND_URL}/chat/users/search?cleanId=${encodeURIComponent(query)}`,
          {
            credentials: "include",
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          setSearchStatus(data.message || data.error || "Failed to search users.");
          return;
        }

        const users = Array.isArray(data.users) ? data.users : [];
        setSearchUsers(users);
        setSearchStatus(users.length === 0 ? "No users found." : "");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setSearchStatus("Failed to search users.");
      }
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchTerm]);

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
        avatarUrl: resolveAvatarUrl(other.avatar),
        role: "Direct",
        preview: getConversationPreview(latestMessage?.body),
        time: formatTime(lastActivityTime),
        sortAt: lastActivityTime,
        subline: `@${other.cleanId}`,
        trust: other.trust ?? FALLBACK_CLEAN_ID_TRUST,
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
        role: "Group",
        preview: getConversationPreview(group.lastMessagePreview),
        time: formatTime(group.lastMessageAt || undefined),
        sortAt: group.lastMessageAt,
        subline: `${group.memberCount} members`,
      }));

    return [...directItems, ...joinedGroupItems].sort((a, b) => {
      const aTime = toTimestamp(a.sortAt);
      const bTime = toTimestamp(b.sortAt);
      return bTime - aTime;
    });
  }, [threads, groups, me]);

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter(
      (item) =>
        item.cleanId.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        item.subline.toLowerCase().includes(query)
    );
  }, [conversations, searchTerm]);

  const skeletonCards = useMemo<ConversationSkeletonCard[]>(() => {
    if (conversations.length === 0) {
      return FALLBACK_SKELETON_CARDS;
    }
    return conversations.slice(0, 6).map((item, index) => ({
      id: item.id,
      chatType: item.chatType,
      role: item.role,
      hasTrust: Boolean(item.trust),
      nameWidth: item.chatType === "group" ? "7.3rem" : index % 2 === 0 ? "8.2rem" : "6.9rem",
      previewWidth: item.chatType === "group" ? "81%" : index % 2 === 0 ? "87%" : "76%",
      previewSecondaryWidth: item.chatType === "group" ? "54%" : index % 2 === 0 ? "58%" : "49%",
      sublineWidth: item.chatType === "group" ? "5.6rem" : "7.2rem",
    }));
  }, [conversations]);

  const handleOpenThread = (threadId: number, other: string, avatarUrl?: string, avatarKey?: AvatarKey) => {
    navigate("/chat", { state: { threadId, other, avatarUrl, avatarKey, fromPath: "/conversations" } });
  };

  const handleOpenGroup = (groupId: string, groupName: string, avatarUrl: string) => {
    navigate("/chat", {
      state: { chatType: "group", groupId, other: groupName, avatarUrl, fromPath: "/conversations" },
    });
  };

  const handleOpenUser = async (user: UserSummary) => {
    const existingThreadId = threadByUserId.get(user.id);
    if (existingThreadId) {
      handleOpenThread(existingThreadId, user.cleanId || user.email, resolveAvatarUrl(user.avatar), user.avatar);
      return;
    }

    setOpeningUserId(user.id);
    setSearchStatus("Creating conversation...");

    try {
      const response = await fetch(`${BACKEND_URL}/chat/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ BId: user.id }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSearchStatus(data.message || data.error || "Failed to create conversation.");
        return;
      }

      const threadId = data?.thread?.id;
      if (typeof threadId !== "number") {
        setSearchStatus("Conversation created, but thread id is missing.");
        return;
      }

      setSearchStatus("");
      handleOpenThread(threadId, user.cleanId || user.email, resolveAvatarUrl(user.avatar), user.avatar);
    } catch {
      setSearchStatus("Failed to create conversation.");
    } finally {
      setOpeningUserId(null);
    }
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
  const heroName = me?.name || me?.cleanId || me?.email || "CleanChat";
  const heroTrust = me?.trust ?? null;
  const metaCount = hasQuery ? searchUsers.length : conversations.length;
  const metaLabel = isInitialLoading && !hasQuery && metaCount === 0
    ? "Syncing conversations"
    : hasQuery
      ? `${metaCount} ${metaCount === 1 ? "person" : "people"} found`
      : `${metaCount} ${metaCount === 1 ? "conversation" : "conversations"}`;
  const viewportIncrease = {
    top: listOverscan,
    bottom: listOverscan,
  } as const;
  const listOverscanWindow = {
    main: listOverscan,
    reverse: listOverscan,
  } as const;

  const renderSearchUserCard = (_index: number, user: UserSummary) => {
    const hasThread = threadByUserId.has(user.id);
    const actionLabel =
      openingUserId === user.id ? "Opening..." : hasThread ? "Open Chat" : "Start Chat";

    return (
      <div className="conversations-virtual-item">
        <button
          type="button"
          className="conversation-card"
          onClick={() => {
            if (openingUserId !== user.id) {
              handleOpenUser(user);
            }
          }}
        >
          <div className="avatar">
            <img className={getAvatarToneClass(user.avatar)} src={resolveAvatarUrl(user.avatar)} alt={`${user.cleanId} avatar`} />
          </div>
          <div className="conversation-body">
            <div className="conversation-top">
              <h3>{user.name || user.cleanId}</h3>
              <p className="role">{actionLabel}</p>
            </div>
            <div className="conversation-identity-row">
              <p className={`conversation-subline conversation-cleanid conversation-cleanid-${user.trust?.band ?? "blurred"}`}>
                @{user.cleanId}
              </p>
              <span className={`conversation-trust-chip conversation-trust-chip-${user.trust?.band ?? "blurred"}`}>
                {getTrustToneLabel(user.trust ?? FALLBACK_CLEAN_ID_TRUST)}
              </span>
            </div>
            <p className="conversation-subline">{user.email}</p>
          </div>
        </button>
      </div>
    );
  };

  const renderConversationCard = (_index: number, item: ConversationItem) => (
    <div className="conversations-virtual-item">
      <button
        type="button"
        className="conversation-card"
        onClick={() => {
          if (item.chatType === "group" && item.groupId) {
            handleOpenGroup(item.groupId, item.name, item.avatarUrl);
            return;
          }
          if (item.threadId) {
            handleOpenThread(item.threadId, item.cleanId || item.email || item.name, item.avatarUrl, item.avatarKey);
          }
        }}
      >
        <div className="avatar">
          <img className={item.avatarKey ? getAvatarToneClass(item.avatarKey) : undefined} src={item.avatarUrl} alt={`${item.name} avatar`} />
        </div>
        <div className="conversation-body">
          <div className="conversation-top">
            <h3>{item.name}</h3>
            <p className="role">{item.role}</p>
            <span className="time">{item.time}</span>
          </div>
          <p className="preview">{item.preview}</p>
          <div className="conversation-identity-row">
            <p
              className={`conversation-subline ${item.trust ? `conversation-cleanid conversation-cleanid-${item.trust.band}` : ""}`}
            >
              {item.subline}
            </p>
            {item.trust && (
              <span className={`conversation-trust-chip conversation-trust-chip-${item.trust.band}`}>
                {getTrustToneLabel(item.trust)}
              </span>
            )}
          </div>
        </div>
      </button>
    </div>
  );

  return (
    <div className="conversations-page">
      <div className="conversations-shell">
        <header className="conversations-hero">
          <div className="conversations-title-wrap">
            <p className="eyebrow">{heroName}</p>
            <h1 className="page-title">Messages</h1>
            <p className="page-copy">
              {hasQuery
                ? "Search people by CleanID and jump straight into a conversation."
                : "Direct chats and joined groups, sorted by latest activity."}
            </p>
            {heroTrust && (
              <div className={`conversations-signal-strip conversations-signal-strip-${heroTrust.band}`}>
                <div className="conversations-signal-top">
                  <span className={`conversation-trust-chip conversation-trust-chip-${heroTrust.band}`}>
                    {getTrustToneLabel(heroTrust)}
                  </span>
                  <strong>{heroTrust.score}</strong>
                </div>
                <div className="conversations-signal-mark-row">
                  <span className={`conversation-cleanid conversation-cleanid-${heroTrust.band}`}>@{me?.cleanId}</span>
                  <span className="conversations-signal-copy">{heroTrust.summary}</span>
                </div>
              </div>
            )}
          </div>
        </header>

        <div className={`conversations-toolbar ${isSearchOpen ? "search-open" : ""}`}>
          {!isSearchOpen && (
            <button
              type="button"
              className="search-launcher"
              aria-label="Open search"
              onClick={openSearch}
            >
              <SearchGlyph />
            </button>
          )}
          <div className={`search-shell ${isSearchOpen ? "expanded" : ""}`}>
            <div className="search-field">
              <label className="sr-only" htmlFor="conversation-search">
                Search by CleanID
              </label>
              <div className="search-input-wrap">
                <span className="search-icon">
                  <SearchGlyph />
                </span>
                <input
                  ref={searchInputRef}
                  id="conversation-search"
                  type="text"
                  placeholder="Search everyone by CleanID"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  onFocus={openSearch}
                  onBlur={() => {
                    if (!searchTerm.trim()) {
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
                  aria-label="Close search"
                  onClick={closeSearch}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="conversations-meta">
          <h2>{hasQuery ? "People" : "Recent activity"}</h2>
          <span>{metaLabel}</span>
        </div>

        <div className="conversations-stage">

        {isInitialLoading && !hasQuery && (
          <section className="conversations-list conversations-list-loading" aria-label="Loading conversations">
            {skeletonCards.map((item) => (
              <article key={`loading-${item.id}`} className="conversation-card conversation-card-skeleton" aria-hidden="true">
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
                    {item.hasTrust && (
                      <span className="conversation-trust-chip conversation-trust-chip-skeleton">
                        <span className="skeleton-surface trust-skeleton-core" />
                      </span>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}

        {!isInitialLoading && status && <div className="status-text">{status}</div>}

        {!isInitialLoading && !status && hasQuery && (
          <>
            {searchStatus && <div className="status-text">{searchStatus}</div>}
            {!searchStatus && searchUsers.length === 0 && (
              <div className="status-text">No users found.</div>
            )}

            {searchUsers.length > 0 && (
              <section className="conversations-list-shell" aria-label="Search results">
                <Virtuoso
                  className="conversations-virtuoso"
                  data={searchUsers}
                  computeItemKey={(_index, user) => `user-${user.id}`}
                  defaultItemHeight={116}
                  increaseViewportBy={viewportIncrease}
                  overscan={listOverscanWindow}
                  minOverscanItemCount={{ top: 12, bottom: 12 }}
                  skipAnimationFrameInResizeObserver
                  itemContent={renderSearchUserCard}
                />
              </section>
            )}
          </>
        )}

        {!isInitialLoading && !status && !hasQuery && conversations.length === 0 && (
          <section className={`conversations-empty-state ${heroTrust ? `conversations-empty-state-${heroTrust.band}` : ""}`}>
            <div className="conversations-empty-mark">
              <span className={`conversation-cleanid conversation-cleanid-${heroTrust?.band ?? "blurred"}`}>
                @{me?.cleanId ?? "cleanid"}
              </span>
              {heroTrust && (
                <span className={`conversation-trust-chip conversation-trust-chip-${heroTrust.band}`}>
                  {getTrustToneLabel(heroTrust)}
                </span>
              )}
            </div>
            <h3>No conversations yet</h3>
            <p>
              Start with a CleanID search or join a group. Healthy back-and-forth is what sharpens your identity
              signal here.
            </p>
            <div className="conversations-empty-grid">
              <div className="conversations-empty-cell">
                <span>Start clean</span>
                <strong>Search by CleanID</strong>
              </div>
              <div className="conversations-empty-cell">
                <span>Stay trusted</span>
                <strong>{heroTrust?.summary ?? "Build consistent conversations."}</strong>
              </div>
            </div>
          </section>
        )}

        {!isInitialLoading && !status && !hasQuery && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="status-text">No conversations match "{searchTerm.trim()}".</div>
        )}

        {!isInitialLoading && !status && !hasQuery && (
          <section className="conversations-list-shell" aria-label="Recent conversations">
            <Virtuoso
              className="conversations-virtuoso"
              data={filteredConversations}
              computeItemKey={(_index, item) => item.id}
              defaultItemHeight={118}
              increaseViewportBy={viewportIncrease}
              overscan={listOverscanWindow}
              minOverscanItemCount={{ top: 12, bottom: 12 }}
              skipAnimationFrameInResizeObserver
              itemContent={renderConversationCard}
            />
          </section>
        )}
        </div>
      </div>
      <BottomNav />
    </div>
  );
};

export default ConversationPage;
