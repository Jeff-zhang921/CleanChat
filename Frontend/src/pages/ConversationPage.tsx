import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import BottomNav from "../components/BottomNav";
import { BACKEND_URL, SOCKET_URL } from "../config";
import {
  getNotificationPermission,
  requestNotificationPermission,
  showMessageNotification,
} from "../utils/notifications";
import "./ConversationPage.css";

type AvatarKey =
  | "AVATAR_LEO"
  | "AVATAR_SOPHIE"
  | "AVATAR_MAX"
  | "AVATAR_BELLA"
  | "AVATAR_CHARLIE";

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
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
  threadId: number;
  userId: number;
  name: string;
  email: string;
  cleanId: string;
  avatarUrl: string;
  role: string;
  preview: string;
  time: string;
};

type RealtimeMessage = {
  id: number;
  threadId: number;
  senderId: number;
  body: string;
  createdAt: string;
};

const AVATAR_URLS: Record<AvatarKey, string> = {
  AVATAR_LEO: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo",
  AVATAR_SOPHIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie",
  AVATAR_MAX: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max",
  AVATAR_BELLA: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  AVATAR_CHARLIE: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
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

const isIOSDevice = () =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent);

const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone === true;
  return mediaStandalone || navigatorStandalone;
};

const ConversationPage = () => {
  const navigate = useNavigate();

  const [me, setMe] = useState<SessionUser | null>(null);
  const [threads, setThreads] = useState<ThreadResponse[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchUsers, setSearchUsers] = useState<UserSummary[]>([]);
  const [searchStatus, setSearchStatus] = useState("");
  const [openingUserId, setOpeningUserId] = useState<number | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const meRef = useRef<SessionUser | null>(null);
  const threadsRef = useRef<ThreadResponse[]>([]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    threadsRef.current = threads;
  }, [threads]);

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

      showMessageNotification(senderName, message.body, `thread-${message.threadId}`);
    };

    socket.on("inbox:new", handleIncomingMessage);
    socket.on("connect_error", () => {
      setNotificationStatus("Realtime connection lost. Trying to reconnect...");
    });
    socket.on("connect", () => {
      setNotificationStatus("");
    });

    return () => {
      socket.off("inbox:new", handleIncomingMessage);
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

    return threads.map((item) => {
      const isA = item.AID === me.id;
      const other = isA ? item.UserB : item.UserA;
      const latestMessage = item.Messages?.[0] ?? null;
      const displayName = other.name || other.cleanId || other.email;
      return {
        threadId: item.id,
        userId: other.id,
        name: displayName,
        email: other.email,
        cleanId: other.cleanId,
        avatarUrl: getAvatarUrl(other.avatar),
        role: "Direct",
        preview: latestMessage?.body || "No messages yet.",
        time: formatTime(latestMessage?.createdAt || item.lastMessageAt || item.updatedAt),
      };
    });
  }, [threads, me]);

  const filteredConversations = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((item) => item.cleanId.toLowerCase().includes(query));
  }, [conversations, searchTerm]);

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setNotificationStatus("Notifications enabled.");
      return;
    }
    if (permission === "denied") {
      setNotificationStatus("Notifications blocked. Please allow notifications in browser settings.");
      return;
    }
    if (permission === "unsupported") {
      if (isIOSDevice() && !isStandalonePwa()) {
        setNotificationStatus(
          "iPhone Safari tab cannot enable web push. Add CleanChat to Home Screen, open from app icon, then enable notifications."
        );
        return;
      }
      setNotificationStatus("This browser does not support notifications.");
      return;
    }
    setNotificationStatus("Notification permission not granted yet.");
  };

  const handleOpenThread = (threadId: number, other: string, avatarUrl?: string) => {
    navigate("/chat", { state: { threadId, other, avatarUrl } });
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

  const hasQuery = searchTerm.trim().length > 0;

  return (
    <div className="conversations-page">
      <div className="conversations-shell">
        <header className="conversations-header">
          <div>
            <p className="eyebrow" />
            <h1>{me?.cleanId || me?.email}</h1>
          </div>
          <button
            type="button"
            className="notify-button"
            onClick={handleEnableNotifications}
            disabled={notificationPermission === "granted"}
          >
            {notificationPermission === "granted" ? "Notifications On" : "Enable Notifications"}
          </button>
        </header>

        {notificationStatus && <div className="status-text">{notificationStatus}</div>}

        <div className="conversations-toolbar">
          <div className="search-field">
            <label htmlFor="conversation-search">Search</label>
            <input
              id="conversation-search"
              type="text"
              placeholder="Search everyone by CleanID"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </div>
        </div>

        <div className="conversations-meta">
          <h2>{hasQuery ? "People" : "Messages"}</h2>
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
                  <article
                    key={`user-${user.id}`}
                    className="conversation-card"
                    onClick={() => {
                      if (openingUserId !== user.id) {
                        handleOpenUser(user);
                      }
                    }}
                    role="button"
                    onKeyDown={(event) => {
                      if ((event.key === "Enter" || event.key === " ") && openingUserId !== user.id) {
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
                      <p className="preview">@{user.cleanId}</p>
                      <p className="conversation-subline">{user.email}</p>
                    </div>
                  </article>
                );
              })}
            </section>
          </>
        )}

        {!status && !hasQuery && conversations.length === 0 && <div className="status-text">No conversations yet.</div>}

        {!status && !hasQuery && conversations.length > 0 && filteredConversations.length === 0 && (
          <div className="status-text">No conversations match "{searchTerm.trim()}".</div>
        )}

        {!status && !hasQuery && (
          <section className="conversations-list">
            {filteredConversations.map((item) => (
              <article
                key={item.threadId}
                className="conversation-card"
                onClick={() => handleOpenThread(item.threadId, item.cleanId || item.email, item.avatarUrl)}
                role="button"
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    handleOpenThread(item.threadId, item.cleanId || item.email, item.avatarUrl);
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
                  <p className="conversation-subline">@{item.cleanId}</p>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
      <BottomNav />
    </div>
  );
};

export default ConversationPage;
