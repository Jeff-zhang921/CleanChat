import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import BottomNav from "../components/BottomNav";
import { BACKEND_URL, SOCKET_URL } from "../config";
import {
  FALLBACK_CLEAN_ID_TRUST,
  type CleanIdTrustSnapshot,
  getTrustToneLabel,
} from "../utils/cleanIdTrust";
import { showMessageNotification } from "../utils/notifications";
import "./ConversationPage.css";

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

const IMAGE_MESSAGE_PREFIX = "IMG::";
const IMAGE_URL_REGEX =
  /^https:\/\/(?:utfs\.io|(?:[a-z0-9-]+\.)?ufs\.sh|[^/\s]*uploadthing\.com)\//i;
const IMAGE_EXTENSION_REGEX =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)(?:\?.*)?$/i;
const HTTP_URL_REGEX = /^https?:\/\/\S+$/i;

const AVATAR_URLS: Record<AvatarKey, string> = {
  AVATAR_LEO: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo",
  AVATAR_SOPHIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie",
  AVATAR_MAX: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max",
  AVATAR_BELLA: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  AVATAR_CHARLIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
  AVATAR_AVERY: "https://api.dicebear.com/9.x/adventurer/svg?seed=Avery",
  AVATAR_RILEY: "https://api.dicebear.com/9.x/lorelei/svg?seed=Riley",
  AVATAR_JORDAN: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan",
  AVATAR_SKYLER: "https://api.dicebear.com/9.x/lorelei/svg?seed=Skyler",
  AVATAR_MORGAN: "https://api.dicebear.com/9.x/adventurer/svg?seed=Morgan",
};

const getAvatarUrl = (avatar?: AvatarKey) => {
  if (!avatar) return AVATAR_URLS.AVATAR_LEO;
  return AVATAR_URLS[avatar] ?? AVATAR_URLS.AVATAR_LEO;
};

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

  const [me, setMe] = useState<SessionUser | null>(null);
  const [threads, setThreads] = useState<ThreadResponse[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [status, setStatus] = useState("Loading...");
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

    const load = async () => {
      try {
        const meResponse = await fetch(`${BACKEND_URL}/auth/me`, {
          credentials: "include",
        });
        if (!meResponse.ok) {
          if (isMounted) setStatus("Please login to see conversations.");
          return;
        }

        const meData = await meResponse.json().catch(() => ({}));
        if (!meData.user) {
          if (isMounted) setStatus("Please login to see conversations.");
          return;
        }

        if (isMounted) setMe(meData.user);

        if (isMounted) {
          await refreshThreads();
          await refreshGroups();
        }
      } catch {
        if (isMounted) setStatus("Failed to load conversations.");
      }
    };

    load();
    return () => {
      isMounted = false;
    };
  }, []);

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
        name: displayName,
        email: other.email,
        cleanId: other.cleanId,
        avatarUrl: getAvatarUrl(other.avatar),
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

  const handleOpenThread = (threadId: number, other: string, avatarUrl?: string) => {
    navigate("/chat", { state: { threadId, other, avatarUrl } });
  };

  const handleOpenGroup = (groupId: string, groupName: string, avatarUrl: string) => {
    navigate("/chat", {
      state: { chatType: "group", groupId, other: groupName, avatarUrl },
    });
  };

  const handleOpenUser = async (user: UserSummary) => {
    const existingThreadId = threadByUserId.get(user.id);
    if (existingThreadId) {
      handleOpenThread(existingThreadId, user.cleanId || user.email, getAvatarUrl(user.avatar));
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
      handleOpenThread(threadId, user.cleanId || user.email, getAvatarUrl(user.avatar));
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
  const metaLabel = hasQuery
    ? `${metaCount} ${metaCount === 1 ? "person" : "people"} found`
    : `${metaCount} ${metaCount === 1 ? "conversation" : "conversations"}`;

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

        {status && <div className="status-text">{status}</div>}

        {!status && hasQuery && (
          <>
            {searchStatus && <div className="status-text">{searchStatus}</div>}
            {!searchStatus && searchUsers.length === 0 && (
              <div className="status-text">No users found.</div>
            )}

            <section className="conversations-list">
              {searchUsers.map((user) => {
                const hasThread = threadByUserId.has(user.id);
                const actionLabel =
                  openingUserId === user.id ? "Opening..." : hasThread ? "Open Chat" : "Start Chat";

                return (
                  <button
                    key={`user-${user.id}`}
                    type="button"
                    className="conversation-card"
                    onClick={() => {
                      if (openingUserId !== user.id) {
                        handleOpenUser(user);
                      }
                    }}
                  >
                    <div className="avatar">
                      <img src={getAvatarUrl(user.avatar)} alt={`${user.cleanId} avatar`} />
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
                );
              })}
            </section>
          </>
        )}

        {!status && !hasQuery && conversations.length === 0 && (
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

        {!status && !hasQuery && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="status-text">No conversations match "{searchTerm.trim()}".</div>
        )}

        {!status && !hasQuery && (
          <section className="conversations-list">
            {filteredConversations.map((item) => (
              <button
                key={item.id}
                type="button"
                className="conversation-card"
                onClick={() => {
                  if (item.chatType === "group" && item.groupId) {
                    handleOpenGroup(item.groupId, item.name, item.avatarUrl);
                    return;
                  }
                  if (item.threadId) {
                    handleOpenThread(item.threadId, item.cleanId || item.email || item.name, item.avatarUrl);
                  }
                }}
              >
                <div className="avatar">
                  <img src={item.avatarUrl} alt={`${item.name} avatar`} />
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
            ))}
          </section>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default ConversationPage;
