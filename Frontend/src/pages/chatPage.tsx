import { forwardRef, type CSSProperties, type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type ListProps, type ScrollerProps, type VirtuosoHandle } from "react-virtuoso";
import { useLocation, useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { getAvatarToneClass, type AvatarKey } from "../constants/avatarCatalog";
import { BACKEND_URL, SOCKET_URL } from "../config";
import { useViewportOverscan } from "../hooks/useViewportOverscan";
import { getNotificationPermission, showMessageNotification } from "../utils/notifications";
import { clearAuthToken, getAuthToken } from "../utils/auth";
import { clearGroupUnread, clearThreadUnread } from "../utils/unreadCounts";
import "./chatPage.css";

type ChatMessage = {
  id: number;
  threadId?: number;
  groupId?: string;
  senderId: number;
  senderName?: string;
  body: string;
  createdAt: string;
};

type MessageDeletedPayload = {
  id: number;
  threadId?: number;
  groupId?: string;
  deletedBy: number;
};

type ChatMode = "direct" | "group";

type ChatLocationState = {
  other?: string;
  avatarUrl?: string;
  avatarKey?: AvatarKey;
  hostId?: number;
  threadId?: number;
  groupId?: string;
  chatType?: ChatMode;
  fromPath?: "/conversations" | "/groups";
};

type ChatPageProps = {
  onRequestClose?: (fromPath: "/conversations" | "/groups") => void;
};

type ChatRenderItem =
  | {
      kind: "temporal-divider";
      key: string;
      label: string;
    }
  | {
      kind: "message";
      key: string;
      message: ChatMessage;
    };

const IMAGE_MESSAGE_PREFIX = "IMG::";
const IMAGE_URL_REGEX =
  /^https:\/\/(?:utfs\.io|(?:[a-z0-9-]+\.)?ufs\.sh|[^/\s]*uploadthing\.com)\//i;
const IMAGE_EXTENSION_REGEX =
  /\.(?:png|jpe?g|gif|webp|bmp|svg|heic|heif|avif)(?:\?.*)?$/i;
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const CONVERSATIONS_RETURN_KEY = "cleanchat:conversations-return";
const CHAT_OVERLAY_EXIT_MS = 300;
const TEMPORAL_GROUP_GAP_MS = 5 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const isHttpUrl = (value: string) => /^https?:\/\/\S+$/i.test(value);

const getImageUrlFromMessage = (body: string) => {
  const trimmedBody = body.trim();
  const normalizedBody = trimmedBody.startsWith(IMAGE_MESSAGE_PREFIX)
    ? trimmedBody.slice(IMAGE_MESSAGE_PREFIX.length).trim()
    : trimmedBody;
  if (!normalizedBody || !isHttpUrl(normalizedBody)) {
    return null;
  }

  if (IMAGE_URL_REGEX.test(normalizedBody) || IMAGE_EXTENSION_REGEX.test(normalizedBody)) {
    return normalizedBody;
  }

  return null;
};

const formatNotificationBody = (body: string, sentPhotoLabel: string) =>
  getImageUrlFromMessage(body) ? sentPhotoLabel : body;

const parsePositiveInt = (value: string | null) => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const toTwoDigits = (value: number) => String(value).padStart(2, "0");

const formatTime24Hour = (date: Date) => `${toTwoDigits(date.getHours())}:${toTwoDigits(date.getMinutes())}`;

const formatTemporalGroupLabel = (
  createdAt: string,
  language: string,
  labels: {
    yesterday: string;
    periodAm: string;
    periodPm: string;
  },
) => {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const isZh = language.toLowerCase().startsWith("zh");
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.floor((todayStart - dateStart) / DAY_MS);

  if (dayDiff === 0) {
    return isZh
      ? formatTime24Hour(date)
      : new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(date);
  }

  if (dayDiff === 1) {
    const timeLabel = isZh
      ? formatTime24Hour(date)
      : new Intl.DateTimeFormat("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }).format(date);
    return `${labels.yesterday} ${timeLabel}`;
  }

  if (isZh) {
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const minute = toTwoDigits(date.getMinutes());
    const period = date.getHours() < 12 ? labels.periodAm : labels.periodPm;
    const hour12 = date.getHours() % 12 || 12;
    return `${month}月${day}日 ${period}${hour12}:${minute}`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
};

const buildTemporalRenderItems = (
  messages: ChatMessage[],
  language: string,
  labels: {
    yesterday: string;
    periodAm: string;
    periodPm: string;
  },
): ChatRenderItem[] => {
  const renderItems: ChatRenderItem[] = [];

  messages.forEach((current, index) => {
    const previous = index > 0 ? messages[index - 1] : null;

    if (previous) {
      const currentTs = Date.parse(current.createdAt);
      const previousTs = Date.parse(previous.createdAt);
      const shouldInsertTemporalDivider =
        Number.isFinite(currentTs) &&
        Number.isFinite(previousTs) &&
        currentTs - previousTs > TEMPORAL_GROUP_GAP_MS;

      if (shouldInsertTemporalDivider) {
        const label = formatTemporalGroupLabel(current.createdAt, language, labels);
        if (label) {
          renderItems.push({
            kind: "temporal-divider",
            key: `temporal-${current.id}-${currentTs}`,
            label,
          });
        }
      }
    }

    renderItems.push({
      kind: "message",
      key: `message-${current.id}`,
      message: current,
    });
  });

  return renderItems;
};

const ChatVirtuosoScroller = forwardRef<HTMLDivElement, ScrollerProps>((props, ref) => (
  <div {...props} ref={ref} className="chat-virtuoso-scroller" />
));

ChatVirtuosoScroller.displayName = "ChatVirtuosoScroller";

const ChatVirtuosoList = forwardRef<HTMLDivElement, ListProps>((props, ref) => (
  <div {...props} ref={ref} className="chat-virtuoso-list" />
));

ChatVirtuosoList.displayName = "ChatVirtuosoList";

const EllipsisGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="6" cy="12" r="1.25" fill="currentColor" />
    <circle cx="12" cy="12" r="1.25" fill="currentColor" />
    <circle cx="18" cy="12" r="1.25" fill="currentColor" />
  </svg>
);

const ChatPage = ({ onRequestClose }: ChatPageProps) => {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const messageOverscan = useViewportOverscan();
  const locationState = (location.state as ChatLocationState | null) ?? null;
  const deepLinkState = useMemo<ChatLocationState>(() => {
    const directPathMatch = location.pathname.match(/^\/chat\/(\d+)$/);
    const groupPathMatch = location.pathname.match(/^\/chat\/group\/([^/?#]+)$/);
    const params = new URLSearchParams(location.search);
    const pathThreadId = directPathMatch ? parsePositiveInt(directPathMatch[1]) : null;
    const pathGroupId = (() => {
      if (!groupPathMatch) {
        return null;
      }

      try {
        const decoded = decodeURIComponent(groupPathMatch[1]).trim();
        return decoded ? decoded : null;
      } catch {
        return null;
      }
    })();

    const threadId = pathThreadId ?? parsePositiveInt(params.get("threadId"));
    const groupIdCandidate = pathGroupId ?? params.get("groupId");
    const groupId = typeof groupIdCandidate === "string" && groupIdCandidate.trim()
      ? groupIdCandidate.trim()
      : undefined;

    if (!threadId && !groupId) {
      return {};
    }

    const chatType = params.get("chatType") === "group" || groupId ? "group" : "direct";
    const title = params.get("title") ?? params.get("other") ?? undefined;

    return {
      chatType,
      threadId: threadId ?? undefined,
      groupId,
      other: title,
      fromPath: chatType === "group" ? "/groups" : "/conversations",
    };
  }, [location.pathname, location.search]);
  const resolvedState = useMemo<ChatLocationState>(
    () => ({
      ...deepLinkState,
      ...locationState,
      other: locationState?.other ?? deepLinkState.other,
      threadId: locationState?.threadId ?? deepLinkState.threadId,
      groupId: locationState?.groupId ?? deepLinkState.groupId,
      chatType: locationState?.chatType ?? deepLinkState.chatType,
      fromPath: locationState?.fromPath ?? deepLinkState.fromPath,
    }),
    [deepLinkState, locationState]
  );
  const initialChatMode: ChatMode =
    resolvedState.chatType === "group" || typeof resolvedState.groupId === "string"
      ? "group"
      : "direct";
  const other = resolvedState.other ?? "";
  const avatarUrl = resolvedState.avatarUrl ?? "";
  const avatarToneClass = resolvedState.avatarKey ? getAvatarToneClass(resolvedState.avatarKey) : "";
  const fromPath = resolvedState.fromPath === "/groups" ? "/groups" : "/conversations";

  const socketRef = useRef<Socket | null>(null);
  const virtuosoRef = useRef<VirtuosoHandle | null>(null);
  const messageInputRef = useRef<HTMLInputElement | null>(null);
  const threadIdRef = useRef<number | null>(null);
  const groupIdRef = useRef<string | null>(
    initialChatMode === "group" && typeof resolvedState.groupId === "string"
      ? resolvedState.groupId
      : null
  );
  const chatModeRef = useRef<ChatMode>(initialChatMode);
  const meRef = useRef<{ id: number; email: string; name: string | null } | null>(null);
  const autoThreadRef = useRef(false);
  const historyLoadTokenRef = useRef(0);
  const previousMessageCountRef = useRef(0);
  const historyHydratedRef = useRef(false);
  const sendPulseTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isAtBottomRef = useRef(true);

  const [status, setStatus] = useState("");
  const [threadId, setThreadId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<string | null>(
    initialChatMode === "group" && typeof resolvedState.groupId === "string"
      ? resolvedState.groupId
      : null
  );
  const [chatMode, setChatMode] = useState<ChatMode>(initialChatMode);
  const [message, setMessages] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<{ id: number; email: string; name: string | null } | null>(null);
  const [messageBody, setMessageBody] = useState("");
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [deletingMessageIds, setDeletingMessageIds] = useState<number[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [isComposerFocused, setIsComposerFocused] = useState(false);
  const [isSendPulseVisible, setIsSendPulseVisible] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isClosing, setIsClosing] = useState(false);

  const refocusMessageInput = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus({ preventScroll: true });
    });
  };

  const beginHistoryLoad = ({ preserveExisting = false }: { preserveExisting?: boolean } = {}) => {
    const token = historyLoadTokenRef.current + 1;
    historyLoadTokenRef.current = token;
    if (!preserveExisting) {
      historyHydratedRef.current = false;
      previousMessageCountRef.current = 0;
      setMessages([]);
    }
    setIsHistoryLoading(true);
    return token;
  };

  const finishHistoryLoad = (token: number, incoming: ChatMessage[]) => {
    if (historyLoadTokenRef.current !== token) {
      return;
    }
    setMessages(incoming);
    setDeletingMessageIds([]);
    historyHydratedRef.current = true;
    setIsHistoryLoading(false);
  };

  const failHistoryLoad = (token: number, nextStatus: string) => {
    if (historyLoadTokenRef.current !== token) {
      return;
    }
    setStatus(nextStatus);
    historyHydratedRef.current = true;
    setIsHistoryLoading(false);
  };

  const triggerSendPulse = () => {
    if (typeof window === "undefined") return;
    if (sendPulseTimeoutRef.current !== null) {
      window.clearTimeout(sendPulseTimeoutRef.current);
    }
    setIsSendPulseVisible(true);
    sendPulseTimeoutRef.current = window.setTimeout(() => {
      setIsSendPulseVisible(false);
      sendPulseTimeoutRef.current = null;
    }, 420);
  };

  const loadMe = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/auth/me`, {
        credentials: "include",
      });
      if (!res.ok) {
        setMe(null);
        return null;
      }
      const data = await res.json();
      setMe(data.user || null);
      meRef.current = data.user || null;
      return data.user || null;
    } catch {
      setMe(null);
      meRef.current = null;
      return null;
    }
  };

  const loadThreadMessages = async (id: number) => {
    const token = beginHistoryLoad();
    try {
      const res = await fetch(`${BACKEND_URL}/chat/threads/${id}/messages`, {
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        failHistoryLoad(token, data.message || t("chat.historyLoadFailed"));
        return;
      }
      const data = await res.json();
      finishHistoryLoad(token, Array.isArray(data) ? data : []);
    } catch {
      failHistoryLoad(token, t("chat.historyLoadFailed"));
    }
  };

  const loadGroupMessages = async (id: string) => {
    const token = beginHistoryLoad();
    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups/${encodeURIComponent(id)}/messages`, {
        credentials: "include",
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        failHistoryLoad(token, data.message || t("chat.groupHistoryLoadFailed"));
        return;
      }

      const data = await response.json().catch(() => ({}));
      const incoming = Array.isArray(data.messages) ? data.messages : [];
      finishHistoryLoad(token, incoming);
    } catch {
      failHistoryLoad(token, t("chat.groupHistoryLoadFailed"));
    }
  };

  const connectSocket = async () => {
    if (socketRef.current) return;

    const token = getAuthToken();
    if (!token) {
      setStatus(t("common.sessionExpired"));
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token },
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setStatus(t("common.connected"));
      const mode = chatModeRef.current;
      if (mode === "group") {
        const activeGroupId = groupIdRef.current;
        if (activeGroupId) {
          socket.emit("group:join", { groupId: activeGroupId });
        }
        return;
      }

      const activeThreadId = threadIdRef.current;
      if (activeThreadId) {
        socket.emit("thread:join", { threadId: activeThreadId });
      }
    });

    socket.on("connect_error", (error) => {
      setStatus(t("chat.socketError"));
      if (error?.message !== "Not authenticated") {
        return;
      }

      clearAuthToken();
      setStatus(t("common.sessionExpired"));
      socket.disconnect();
    });

    socket.on("chat:error", (msg: string) => {
      setStatus(msg || t("chat.chatError"));
    });

    socket.on("message:new", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      const currentUser = meRef.current;
      if (
        currentUser &&
        msg.senderId !== currentUser.id &&
        typeof document !== "undefined" &&
        document.hidden &&
        getNotificationPermission() === "granted"
      ) {
        const title = other || t("chat.newMessage");
        showMessageNotification(title, formatNotificationBody(msg.body, t("chat.sentPhotoNotification")), {
          tag: `thread-${msg.threadId}`,
          target: msg.threadId
            ? {
                chatType: "direct",
                threadId: msg.threadId,
              }
            : { url: "/conversations" },
        });
      }
    });

    socket.on("message:deleted", (payload: MessageDeletedPayload) => {
      const activeThreadId = threadIdRef.current;
      if (
        typeof payload.threadId === "number" &&
        typeof activeThreadId === "number" &&
        payload.threadId !== activeThreadId
      ) {
        return;
      }
      setMessages((prev) => prev.filter((item) => item.id !== payload.id));
      setDeletingMessageIds((prev) => prev.filter((id) => id !== payload.id));
    });

    socket.on("group:message:new", (msg: ChatMessage) => {
      setMessages((prev) => [...prev, msg]);
      const currentUser = meRef.current;
      if (
        currentUser &&
        msg.senderId !== currentUser.id &&
        typeof document !== "undefined" &&
        document.hidden &&
        getNotificationPermission() === "granted"
      ) {
        const title = other || t("chat.groupMessage");
        showMessageNotification(title, formatNotificationBody(msg.body, t("chat.sentPhotoNotification")), {
          tag: `group-${msg.groupId ?? "room"}`,
          target: msg.groupId
            ? {
                chatType: "group",
                groupId: msg.groupId,
              }
            : { url: "/conversations" },
        });
      }
    });

    socket.on("group:message:deleted", (payload: MessageDeletedPayload) => {
      const activeGroupId = groupIdRef.current;
      if (
        typeof payload.groupId === "string" &&
        typeof activeGroupId === "string" &&
        payload.groupId !== activeGroupId
      ) {
        return;
      }
      setMessages((prev) => prev.filter((item) => item.id !== payload.id));
      setDeletingMessageIds((prev) => prev.filter((id) => id !== payload.id));
    });
  };

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    groupIdRef.current = groupId;
  }, [groupId]);

  useEffect(() => {
    chatModeRef.current = chatMode;
  }, [chatMode]);

  useEffect(() => {
    meRef.current = me;
  }, [me]);

  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  useEffect(() => {
    let isDisposed = false;
    void (async () => {
      const user = await loadMe();
      if (user && !isDisposed) {
        await connectSocket();
      }
    })();
    return () => {
      isDisposed = true;
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (chatMode !== "direct" || !threadId) return;
    void loadThreadMessages(threadId);
    if (socketRef.current?.connected) {
      socketRef.current.emit("thread:join", { threadId });
    }
  }, [threadId, chatMode]);

  useEffect(() => {
    if (chatMode !== "group" || !groupId) return;
    void loadGroupMessages(groupId);
    if (socketRef.current?.connected) {
      socketRef.current.emit("group:join", { groupId });
    }
  }, [groupId, chatMode]);

  useEffect(() => {
    if (chatMode === "direct" && threadId) {
      clearThreadUnread(threadId);
    }
  }, [chatMode, threadId]);

  useEffect(() => {
    if (chatMode === "group" && groupId) {
      clearGroupUnread(groupId);
    }
  }, [chatMode, groupId]);

  const createThreadForHostId = async (rawHostId: number) => {
    setChatMode("direct");
    setGroupId(null);
    const parsed = Number(rawHostId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      setStatus(t("chat.hostInvalid"));
      return;
    }
    try {
      const res = await fetch(`${BACKEND_URL}/chat/threads`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hostId: parsed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.message || t("chat.threadCreateFailed"));
        return;
      }
      const createdThreadId =
        typeof data?.thread?.id === "number"
          ? data.thread.id
          : typeof data?.threadId === "number"
            ? data.threadId
            : null;
      if (!createdThreadId) {
        setStatus(t("chat.threadMissing"));
        return;
      }
      setThreadId(createdThreadId);
      setStatus(t("chat.threadReady"));
    } catch {
      setStatus(t("chat.threadCreateFailed"));
    }
  };

  useEffect(() => {
    const state = resolvedState;
    if (autoThreadRef.current) return;
    if ((state.chatType === "group" || typeof state.groupId === "string") && typeof state.groupId === "string") {
      autoThreadRef.current = true;
      setChatMode("group");
      setThreadId(null);
      setGroupId(state.groupId);
      setStatus(t("chat.groupReady"));
      return;
    }
    if (typeof state.threadId === "number") {
      autoThreadRef.current = true;
      setChatMode("direct");
      setGroupId(null);
      setThreadId(state.threadId);
      setStatus(t("chat.threadReady"));
      return;
    }
    if (typeof state.hostId === "number") {
      autoThreadRef.current = true;
      setChatMode("direct");
      setGroupId(null);
      void createThreadForHostId(state.hostId);
    }
  }, [resolvedState]);

  const handleSendMessage = () => {
    if (!socketRef.current || !socketRef.current.connected) {
      setStatus(t("chat.socketNotConnected"));
      return false;
    }
    const trimmed = messageBody.trim();
    if (!trimmed) {
      setStatus(t("chat.messageEmpty"));
      return false;
    }
    if (chatMode === "group") {
      if (!groupId) {
        setStatus(t("chat.joinGroupFirst"));
        return false;
      }
      socketRef.current.emit("group:message:send", {
        groupId,
        body: trimmed,
      });
    } else {
      if (!threadId) {
        setStatus(t("chat.createOrJoinThread"));
        return false;
      }
      socketRef.current.emit("message:send", {
        threadId,
        body: trimmed,
      });
    }
    setMessageBody("");
    setStatus("");
    refocusMessageInput();
    return true;
  };

  const handleDeleteMessage = (targetMessage: ChatMessage) => {
    const currentUser = meRef.current;
    if (!currentUser || currentUser.id !== targetMessage.senderId) {
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      setStatus(t("chat.socketNotConnected"));
      return;
    }
    if (!window.confirm(t("chat.deleteMessageConfirm"))) {
      return;
    }

    setDeletingMessageIds((prev) => (prev.includes(targetMessage.id) ? prev : [...prev, targetMessage.id]));
    const clearDeletingState = () => {
      setDeletingMessageIds((prev) => prev.filter((id) => id !== targetMessage.id));
    };

    if (chatModeRef.current === "group") {
      const activeGroupId = groupIdRef.current;
      if (!activeGroupId) {
        setStatus(t("chat.joinGroupFirst"));
        clearDeletingState();
        return;
      }

      socketRef.current.emit(
        "group:message:delete",
        {
          groupId: activeGroupId,
          messageId: targetMessage.id,
        },
        (response?: { ok?: boolean; message?: string }) => {
          if (!response?.ok) {
            setStatus(response?.message || t("chat.deleteMessageFailed"));
            clearDeletingState();
            return;
          }
          setMessages((prev) => prev.filter((item) => item.id !== targetMessage.id));
          clearDeletingState();
          setStatus("");
        }
      );
      return;
    }

    const activeThreadId = threadIdRef.current;
    if (!activeThreadId) {
      setStatus(t("chat.createOrJoinThread"));
      clearDeletingState();
      return;
    }

    socketRef.current.emit(
      "message:delete",
      {
        threadId: activeThreadId,
        messageId: targetMessage.id,
      },
      (response?: { ok?: boolean; message?: string }) => {
        if (!response?.ok) {
          setStatus(response?.message || t("chat.deleteMessageFailed"));
          clearDeletingState();
          return;
        }
        setMessages((prev) => prev.filter((item) => item.id !== targetMessage.id));
        clearDeletingState();
        setStatus("");
      }
    );
  };

  const handleUploadImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus(t("chat.imageOnly"));
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus(t("chat.imageTooLarge"));
      return;
    }

    if (chatMode === "group" && !groupId) {
      setStatus(t("chat.joinGroupFirst"));
      return;
    }
    if (chatMode === "direct" && !threadId) {
      setStatus(t("chat.createOrJoinThread"));
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      setStatus(t("chat.socketNotConnected"));
      return;
    }

    const formData = new FormData();
    formData.append("image", file);

    setIsUploadingImage(true);
    setStatus(t("chat.uploadingImage"));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/upload-image`, {
        method: "POST",
        credentials: "include",
        body: formData,
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
        setStatus(
          data.error ||
            data.message ||
            raw ||
            t("chat.uploadFailedHttp", { status: response.status })
        );
        return;
      }

      const imageUrl = typeof data.url === "string" ? data.url.trim() : "";
      if (!imageUrl) {
        setStatus(t("chat.uploadMissingUrl"));
        return;
      }

      if (chatMode === "group") {
        socketRef.current.emit("group:message:send", {
          groupId,
          body: `${IMAGE_MESSAGE_PREFIX}${imageUrl}`,
        });
      } else {
        socketRef.current.emit("message:send", {
          threadId,
          body: `${IMAGE_MESSAGE_PREFIX}${imageUrl}`,
        });
      }
      setStatus(t("chat.photoSent"));
      refocusMessageInput();
    } catch {
      setStatus(t("chat.uploadFailed"));
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handleOpenImagePreview = (imageUrl: string) => {
    setPreviewImageUrl(imageUrl);
  };

  const handleCloseImagePreview = () => {
    setPreviewImageUrl(null);
  };

  useEffect(() => {
    if (!previewImageUrl) return;

    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        handleCloseImagePreview();
      }
    };

    window.addEventListener("keydown", handleEsc);
    return () => {
      window.removeEventListener("keydown", handleEsc);
    };
  }, [previewImageUrl]);

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && sendPulseTimeoutRef.current !== null) {
        window.clearTimeout(sendPulseTimeoutRef.current);
      }
      if (typeof window !== "undefined" && closeTimeoutRef.current !== null) {
        window.clearTimeout(closeTimeoutRef.current);
      }
    };
  }, []);

  const chatLabel = other || (chatMode === "group" ? t("chat.groupChat") : t("chat.conversation"));
  const avatarFallback = chatLabel.trim().charAt(0).toUpperCase() || "?";
  const isConnected = Boolean(socketRef.current?.connected);
  const hasDraft = messageBody.trim().length > 0;
  const isComposerEngaged = isComposerFocused || hasDraft || isUploadingImage;
  const showHistorySkeleton = isHistoryLoading && message.length === 0;
  const chatKicker = chatMode === "group" ? t("chat.groupThread") : t("chat.privateLine");
  const backLabel = fromPath === "/groups" ? t("nav.groups") : t("nav.chats");
  const canOpenSettings = chatMode === "direct" && typeof threadId === "number";
  const messageViewportIncrease = {
    top: messageOverscan,
    bottom: messageOverscan,
  } as const;
  const messageOverscanWindow = {
    main: messageOverscan,
    reverse: messageOverscan,
  } as const;
  const timelineItems = useMemo(
    () =>
      buildTemporalRenderItems(message, i18n.language, {
        yesterday: t("chat.yesterday"),
        periodAm: t("chat.periodAm"),
        periodPm: t("chat.periodPm"),
      }),
    [i18n.language, message, t]
  );
  const historySkeletonRows = [
    { key: "skeleton-a", side: "them" as const, width: "68%" },
    { key: "skeleton-b", side: "me" as const, width: "54%" },
    { key: "skeleton-c", side: "them" as const, width: "61%" },
  ];

  useEffect(() => {
    if (typeof window === "undefined" || showHistorySkeleton) {
      return;
    }

    let disposed = false;
    let cleanup: (() => void) | null = null;

    const frame = window.requestAnimationFrame(() => {
      if (disposed) {
        return;
      }

      const scroller = document.querySelector<HTMLElement>(".chat-virtuoso-scroller");
      if (!scroller) {
        return;
      }

      const onScroll = () => {
        // Keep a cheap touchpoint for future scroll heuristics while remaining passive.
        void scroller.scrollTop;
      };

      scroller.addEventListener("scroll", onScroll, { passive: true });

      const resizeObserver =
        typeof ResizeObserver !== "undefined"
          ? new ResizeObserver(() => {
              if (isAtBottomRef.current) {
                virtuosoRef.current?.autoscrollToBottom();
              }
            })
          : null;
      resizeObserver?.observe(scroller);

      const imageObserver =
        typeof IntersectionObserver !== "undefined"
          ? new IntersectionObserver(
              (entries) => {
                const observer = imageObserver;
                entries.forEach((entry) => {
                  if (!entry.isIntersecting) {
                    return;
                  }
                  const element = entry.target;
                  if (element instanceof HTMLImageElement) {
                    element.decoding = "async";
                  }
                  observer?.unobserve(element);
                });
              },
              {
                root: scroller,
                rootMargin: "140px",
              }
            )
          : null;

      const observeImages = () => {
        if (!imageObserver) return;
        const images = scroller.querySelectorAll<HTMLImageElement>(".chat-image");
        images.forEach((image) => imageObserver.observe(image));
      };

      observeImages();

      const mutationObserver =
        typeof MutationObserver !== "undefined"
          ? new MutationObserver(() => {
              observeImages();
            })
          : null;
      mutationObserver?.observe(scroller, {
        childList: true,
        subtree: true,
      });

      cleanup = () => {
        scroller.removeEventListener("scroll", onScroll);
        resizeObserver?.disconnect();
        imageObserver?.disconnect();
        mutationObserver?.disconnect();
      };
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      cleanup?.();
    };
  }, [showHistorySkeleton]);

  useEffect(() => {
    if (showHistorySkeleton || message.length === 0) {
      previousMessageCountRef.current = message.length;
      return;
    }

    const previousCount = previousMessageCountRef.current;
    if (previousCount === 0) {
      window.requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: message.length - 1,
          align: "end",
          behavior: "auto",
        });
      });
    }

    previousMessageCountRef.current = message.length;
  }, [message.length, showHistorySkeleton]);

  const handleMessageMediaLoad = () => {
    if (isAtBottom) {
      virtuosoRef.current?.autoscrollToBottom();
    }
  };

  const handleBack = () => {
    if (isClosing) {
      return;
    }

    if (typeof window !== "undefined") {
      try {
        if (fromPath === "/conversations") {
          window.sessionStorage.setItem(CONVERSATIONS_RETURN_KEY, "1");
        }
      } catch {
        // Ignore storage failures and still perform the close transition.
      }
    }

    setIsClosing(true);

    const completeClose = () => {
      if (onRequestClose) {
        onRequestClose(fromPath);
        return;
      }

      if (typeof window !== "undefined" && window.history.length > 1) {
        navigate(-1);
        return;
      }

      navigate(fromPath, { replace: true });
    };

    if (typeof window === "undefined") {
      completeClose();
      return;
    }

    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
    }

    closeTimeoutRef.current = window.setTimeout(() => {
      closeTimeoutRef.current = null;
      completeClose();
    }, CHAT_OVERLAY_EXIT_MS);
  };

  const handleOpenSettings = () => {
    if (!canOpenSettings) {
      return;
    }

    navigate("/chat/settings", {
      state: {
        threadId,
        other: chatLabel,
        avatarUrl,
        avatarKey: resolvedState.avatarKey,
        fromPath,
      },
    });
  };

  return (
    <div
      className={`chat-shell ${isComposerEngaged ? "composer-engaged" : ""} ${isSendPulseVisible ? "send-pulse" : ""} ${showHistorySkeleton ? "history-loading" : "history-ready"} ${isClosing ? "is-closing" : ""}`}
    >
      <main className="chat-panel">
        <div className="chat-bar">
          <button type="button" className="back-button" aria-label={t("chat.goBack")} onClick={handleBack} disabled={isClosing}>
            <span className="back-button-icon" aria-hidden="true" />
            <span className="back-button-copy">{backLabel}</span>
          </button>
          <span className="avatar">
            {avatarUrl ? <img className={avatarToneClass || undefined} src={avatarUrl} alt={`${chatLabel} ${t("common.avatar")}`} /> : avatarFallback}
          </span>
          <div className="chat-heading">
            <span className="chat-kicker">{chatKicker}</span>
            <span className="chat-title">{chatLabel}</span>
          </div>
          <div className="chat-bar-actions">
            {canOpenSettings && (
              <button
                type="button"
                className="chat-more-button"
                aria-label={t("chat.openSettings")}
                title={t("chat.openSettings")}
                onClick={handleOpenSettings}
                disabled={isClosing}
              >
                <EllipsisGlyph />
              </button>
            )}
          </div>
        </div>

        <div className={`chat-body ${showHistorySkeleton ? "loading" : "ready"}`}>
          {showHistorySkeleton && (
            <div className="chat-history-skeleton" aria-hidden="true">
              {historySkeletonRows.map((row, index) => (
                <div key={row.key} className={`chat-row ${row.side} skeleton-row`}>
                  <div
                    className={`chat-bubble chat-bubble-skeleton bubble-${row.side === "me" ? "me" : "them"}`}
                    style={{ ["--skeleton-width" as string]: row.width, ["--chat-index" as string]: index } as CSSProperties}
                  >
                    <span className="chat-skeleton-line chat-skeleton-line-long" />
                    <span className="chat-skeleton-line chat-skeleton-line-short" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!showHistorySkeleton && message.length === 0 && (
            <div className="chat-empty">{chatMode === "group" ? t("chat.noGroupMessages") : t("chat.startConversation")}</div>
          )}

          {!showHistorySkeleton && message.length > 0 && (
            <Virtuoso
              ref={virtuosoRef}
              className="chat-virtuoso"
              data={timelineItems}
              alignToBottom
              atBottomStateChange={setIsAtBottom}
              followOutput={(atBottom) => (atBottom ? "smooth" : false)}
              computeItemKey={(_index, item) => item.key}
              defaultItemHeight={92}
              increaseViewportBy={messageViewportIncrease}
              overscan={messageOverscanWindow}
              minOverscanItemCount={{ top: 14, bottom: 14 }}
              skipAnimationFrameInResizeObserver
              components={{
                Scroller: ChatVirtuosoScroller,
                List: ChatVirtuosoList,
              }}
              itemContent={(_index, item) => {
                if (item.kind === "temporal-divider") {
                  return (
                    <div className="chat-virtuoso-item chat-virtuoso-temporal-item" aria-hidden="true">
                      <div className="chat-temporal-separator">{item.label}</div>
                    </div>
                  );
                }

                const msg = item.message;
                const isMe = msg.senderId === me?.id;
                const imageUrl = getImageUrlFromMessage(msg.body);
                const isDeletingMessage = deletingMessageIds.includes(msg.id);

                return (
                  <div className="chat-virtuoso-item">
                    <div className={`chat-row ${isMe ? "me" : "them"}`}>
                      <div className={`chat-bubble ${isMe ? "bubble-me" : "bubble-them"}`}>
                        {chatMode === "group" && !isMe && msg.senderName && (
                          <p className="group-sender">{msg.senderName}</p>
                        )}
                        {imageUrl ? (
                          <button
                            type="button"
                            className="chat-image-button"
                            onClick={() => handleOpenImagePreview(imageUrl)}
                          >
                            <img
                              className="chat-image"
                              src={imageUrl}
                              alt={t("chat.sharedImage")}
                              onLoad={handleMessageMediaLoad}
                            />
                          </button>
                        ) : (
                          <p>{msg.body}</p>
                        )}
                        {isMe && (
                          <div className="chat-meta-row">
                            <button
                              type="button"
                              className="chat-delete-button"
                              onClick={() => handleDeleteMessage(msg)}
                              disabled={isDeletingMessage}
                            >
                              {isDeletingMessage ? t("chat.deleting") : t("chat.deleteAction")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          )}
        </div>

        <footer className="chat-footer">
          <div className={`chat-input ${isComposerEngaged ? "engaged" : ""}`}>
            <input
              id="chat-photo-input"
              type="file"
              accept="image/*,.heic,.heif"
              className="chat-file-input"
              onChange={handleUploadImage}
              disabled={isUploadingImage || isClosing}
            />
            <label
              htmlFor="chat-photo-input"
              className={`photo-button ${isUploadingImage ? "disabled" : ""}`}
              aria-label={isUploadingImage ? t("chat.uploadingImage") : t("chat.addPhoto")}
              title={isUploadingImage ? t("chat.uploadingImage") : t("chat.addPhoto")}
              aria-disabled={isUploadingImage}
              onClick={(event) => {
                if (isUploadingImage || isClosing) {
                  event.preventDefault();
                }
              }}
            >
              <span aria-hidden="true">{isUploadingImage ? "..." : "+"}</span>
            </label>
            <input
              type="text"
              placeholder={t("chat.messagePlaceholder")}
              value={messageBody}
              ref={messageInputRef}
              onChange={(event) => setMessageBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (handleSendMessage()) {
                    triggerSendPulse();
                  }
                }
              }}
              onFocus={() => setIsComposerFocused(true)}
              onBlur={() => setIsComposerFocused(false)}
              disabled={isClosing}
            />
            <button
              type="button"
              className={`send-button ${hasDraft ? "ready" : ""}`}
              onClick={() => {
                if (handleSendMessage()) {
                  triggerSendPulse();
                }
              }}
              onMouseDown={(event) => event.preventDefault()}
              onPointerDown={(event) => event.preventDefault()}
              disabled={isUploadingImage || !hasDraft || isClosing}
            >
              {t("chat.send")}
            </button>
          </div>
        </footer>

        {previewImageUrl && (
          <div className="image-viewer-overlay" onClick={handleCloseImagePreview} role="presentation">
            <div
              className="image-viewer-card"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <img className="image-viewer-image" src={previewImageUrl} alt={t("chat.preview")} />
              <div className="image-viewer-actions">
                <a
                  className="image-viewer-btn"
                  href={previewImageUrl}
                  target="_blank"
                  rel="noreferrer"
                  download
                >
                  {t("chat.saveOrOpen")}
                </a>
                <button type="button" className="image-viewer-btn secondary" onClick={handleCloseImagePreview}>
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default ChatPage;
