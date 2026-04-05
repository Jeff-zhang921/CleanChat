import {
  forwardRef,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
  type SyntheticEvent as ReactSyntheticEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, type ListProps, type ScrollerProps, type VirtuosoHandle } from "react-virtuoso";
import { useLocation, useNavigate } from "react-router-dom";
import { io, type Socket } from "socket.io-client";
import { useTranslation } from "react-i18next";
import { getAvatarToneClass, type AvatarKey } from "../constants/avatarCatalog";
import MessageContextMenu from "../components/MessageContextMenu";
import MessageItem from "../components/MessageItem";
import { BACKEND_URL, SOCKET_URL } from "../config";
import { useChat, type ChatMessage, type ChatSendPayload } from "../hooks/useChat";
import { useChatScroll } from "../hooks/useChatScroll";
import { useViewportOverscan } from "../hooks/useViewportOverscan";
import { useToast } from "../hooks/useToast";
import { getNotificationPermission, showMessageNotification } from "../utils/notifications";
import { clearAuthToken, getAuthToken } from "../utils/auth";
import {
  clearDraftForTarget,
  readDraftForTarget,
  writeDraftForTarget,
} from "../utils/chatDraftStorage";
import { clearGroupUnread, clearThreadUnread } from "../utils/unreadCounts";
import "./chatPage.css";

type MessageRecallPayload = {
  id: number;
  threadId?: number;
  groupId?: string;
  deletedBy?: number;
  recalledBy?: number;
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

type QuoteDraft = {
  parentMessageId: number;
  senderName: string;
  preview: string;
};

type MessageContextMenuState = {
  messageId: number;
  anchorRect: {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
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
const RECALLED_MESSAGE_BODY = "__CLEANCHAT_RECALLED__";

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

const isRecalledMessageBody = (body: string) => body === RECALLED_MESSAGE_BODY;

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
  const historyHydratedRef = useRef(false);
  const sendPulseTimeoutRef = useRef<number | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const longPressTimeoutRef = useRef<number | null>(null);
  const longPressOriginRef = useRef<{ x: number; y: number } | null>(null);
  const isAtBottomRef = useRef(true);

  const [status, setStatus] = useState("");
  const [threadId, setThreadId] = useState<number | null>(null);
  const [groupId, setGroupId] = useState<string | null>(
    initialChatMode === "group" && typeof resolvedState.groupId === "string"
      ? resolvedState.groupId
      : null
  );
  const [chatMode, setChatMode] = useState<ChatMode>(initialChatMode);
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
  const [contextMenu, setContextMenu] = useState<MessageContextMenuState | null>(null);
  const [selectableMessageId, setSelectableMessageId] = useState<number | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null);
  const { toast, showToast } = useToast();

  const dispatchMessageToSocket = useCallback((payload: ChatSendPayload) => {
    const socket = socketRef.current;
    if (!socket || !socket.connected) {
      return false;
    }

    const activeMode = chatModeRef.current;
    if (activeMode === "group") {
      const activeGroupId = groupIdRef.current;
      if (!activeGroupId) {
        return false;
      }

      socket.emit("group:message:send", {
        groupId: activeGroupId,
        body: payload.body,
        parentMessageId: payload.parentMessageId,
        quoteSenderName: payload.quoteSenderName,
        quotePreview: payload.quotePreview,
      });
      return true;
    }

    const activeThreadId = threadIdRef.current;
    if (!activeThreadId) {
      return false;
    }

    socket.emit("message:send", {
      threadId: activeThreadId,
      body: payload.body,
      parentMessageId: payload.parentMessageId,
      quoteSenderName: payload.quoteSenderName,
      quotePreview: payload.quotePreview,
    });
    return true;
  }, []);

  const optimisticScrollHandlerRef = useRef<() => void>(() => undefined);
  const requestOptimisticScroll = useCallback(() => {
    optimisticScrollHandlerRef.current();
  }, []);

  const {
    messages: message,
    hydrateMessages,
    clearMessages,
    mutateMessages,
    appendIncomingMessage,
    sendOptimisticMessage,
    retrySendMessage,
  } = useChat({
    meId: me?.id ?? null,
    chatMode,
    threadId,
    groupId,
    onSend: dispatchMessageToSocket,
    onScrollToBottom: requestOptimisticScroll,
  });

  const activeDraftTarget = useMemo(() => {
    if (chatMode === "direct" && threadId) {
      return {
        chatType: "direct" as const,
        threadId,
      };
    }

    if (chatMode === "group" && groupId) {
      return {
        chatType: "group" as const,
        groupId,
      };
    }

    return null;
  }, [chatMode, groupId, threadId]);

  const { scrollToBottomSmooth, scrollToBottomIfPinned, scrollIntoBottomNow } = useChatScroll({
    virtuosoRef,
    messageCount: message.length,
    isHistoryLoading,
  });

  useEffect(() => {
    optimisticScrollHandlerRef.current = scrollIntoBottomNow;
  }, [scrollIntoBottomNow]);

  useEffect(() => {
    if (!activeDraftTarget) {
      setMessageBody("");
      return;
    }

    setMessageBody(readDraftForTarget(activeDraftTarget));
  }, [activeDraftTarget]);

  useEffect(() => {
    if (!activeDraftTarget) {
      return;
    }

    writeDraftForTarget(activeDraftTarget, messageBody);
  }, [activeDraftTarget, messageBody]);

  const refocusMessageInput = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      messageInputRef.current?.focus({ preventScroll: true });
    });
  };

  const clearLongPressTimeout = () => {
    if (typeof window === "undefined") {
      return;
    }
    if (longPressTimeoutRef.current !== null) {
      window.clearTimeout(longPressTimeoutRef.current);
      longPressTimeoutRef.current = null;
    }
  };

  const showMiniToast = (nextMessage: string) => {
    showToast(nextMessage, { durationMs: 200 });
  };

  const clearTextSelection = () => {
    if (typeof window === "undefined") {
      return;
    }
    window.getSelection()?.removeAllRanges();
  };

  const getSelectedTextFromMessage = (messageId: number) => {
    if (typeof window === "undefined") {
      return "";
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return "";
    }

    const selectedText = selection.toString().trim();
    if (!selectedText) {
      return "";
    }

    const bubble = document.querySelector<HTMLElement>(`.chat-bubble[data-message-id="${messageId}"]`);
    if (!bubble) {
      return "";
    }

    const normalizeSelectionNode = (node: Node | null) => {
      if (!node) {
        return null;
      }
      if (node.nodeType === Node.TEXT_NODE) {
        return node.parentElement;
      }
      return node instanceof Element ? node : null;
    };

    const anchorElement = normalizeSelectionNode(selection.anchorNode);
    const focusElement = normalizeSelectionNode(selection.focusNode);
    if (!anchorElement || !focusElement) {
      return "";
    }

    if (!bubble.contains(anchorElement) || !bubble.contains(focusElement)) {
      return "";
    }

    return selectedText;
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setSelectableMessageId(null);
    clearTextSelection();
  };

  const getMessagePlainText = (msg: ChatMessage) => {
    if (isRecalledMessageBody(msg.body)) {
      return msg.senderId === me?.id ? t("chat.recalledBySelf") : t("chat.recalledByOther");
    }

    const imageUrl = getImageUrlFromMessage(msg.body);
    if (imageUrl) {
      return imageUrl;
    }
    return msg.body.trim();
  };

  const getMessagePreviewText = (msg: ChatMessage) => {
    if (isRecalledMessageBody(msg.body)) {
      return t("chat.quoteFallbackPreview");
    }

    const imageUrl = getImageUrlFromMessage(msg.body);
    if (imageUrl) {
      return t("chat.photoPreview");
    }
    return msg.body.trim().replace(/\s+/g, " ").slice(0, 140);
  };

  const resolveQuoteSenderName = (msg: ChatMessage) => {
    if (msg.senderId === me?.id) {
      return t("chat.you");
    }
    if (chatMode === "group") {
      return msg.senderName?.trim() || chatLabel || t("common.user");
    }
    return chatLabel || t("common.user");
  };

  const getRecallMarkerText = (msg: ChatMessage) =>
    msg.senderId === me?.id ? t("chat.recalledBySelf") : t("chat.recalledByOther");

  const beginHistoryLoad = ({ preserveExisting = false }: { preserveExisting?: boolean } = {}) => {
    const token = historyLoadTokenRef.current + 1;
    historyLoadTokenRef.current = token;
    if (!preserveExisting) {
      historyHydratedRef.current = false;
      clearMessages();
    }
    setIsHistoryLoading(true);
    return token;
  };

  const finishHistoryLoad = (token: number, incoming: ChatMessage[]) => {
    if (historyLoadTokenRef.current !== token) {
      return;
    }
    hydrateMessages(incoming);
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

  const syncReadCheckpoint = async (
    target:
      | { chatType: "direct"; threadId: number; lastMessageId?: number }
      | { chatType: "group"; groupId: string; lastMessageId?: number },
  ) => {
    const payload: Record<string, unknown> = {
      chatType: target.chatType,
    };

    if (target.chatType === "direct") {
      payload.threadId = target.threadId;
    } else {
      payload.groupId = target.groupId;
    }

    if (typeof target.lastMessageId === "number" && target.lastMessageId > 0) {
      payload.lastMessageId = target.lastMessageId;
    }

    try {
      await fetch(`${BACKEND_URL}/chat/unread/read`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      });
    } catch {
      // Read sync is best effort and should not interrupt chat usage.
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
      const incoming = Array.isArray(data) ? data : [];
      finishHistoryLoad(token, incoming);

      const lastMessageId =
        incoming.length > 0 && typeof incoming[incoming.length - 1]?.id === "number"
          ? incoming[incoming.length - 1].id
          : undefined;
      void syncReadCheckpoint({
        chatType: "direct",
        threadId: id,
        lastMessageId,
      });
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

      const lastMessageId =
        incoming.length > 0 && typeof incoming[incoming.length - 1]?.id === "number"
          ? incoming[incoming.length - 1].id
          : undefined;
      void syncReadCheckpoint({
        chatType: "group",
        groupId: id,
        lastMessageId,
      });
    } catch {
      failHistoryLoad(token, t("chat.groupHistoryLoadFailed"));
    }
  };

  const markMessageAsRecalled = (messageId: number) => {
    mutateMessages((prev) =>
      prev.map((item) =>
        item.id === messageId
          ? {
              ...item,
              body: RECALLED_MESSAGE_BODY,
              parentMessageId: null,
              quoteSenderName: null,
              quotePreview: null,
            }
          : item,
      ),
    );
    setDeletingMessageIds((prev) => prev.filter((id) => id !== messageId));
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
      appendIncomingMessage(msg);
      const currentUser = meRef.current;

      if (currentUser && msg.senderId === currentUser.id) {
        return;
      }

      if (currentUser && msg.threadId) {
        void syncReadCheckpoint({
          chatType: "direct",
          threadId: msg.threadId,
          lastMessageId: msg.id,
        });
      }

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

    const handleDirectRecalled = (payload: MessageRecallPayload) => {
      const activeThreadId = threadIdRef.current;
      if (
        typeof payload.threadId === "number" &&
        typeof activeThreadId === "number" &&
        payload.threadId !== activeThreadId
      ) {
        return;
      }
      markMessageAsRecalled(payload.id);
    };

    socket.on("message:recalled", handleDirectRecalled);
    socket.on("message:deleted", handleDirectRecalled);

    socket.on("group:message:new", (msg: ChatMessage) => {
      appendIncomingMessage(msg);
      const currentUser = meRef.current;

      if (currentUser && msg.senderId === currentUser.id) {
        return;
      }

      if (currentUser && msg.groupId) {
        void syncReadCheckpoint({
          chatType: "group",
          groupId: msg.groupId,
          lastMessageId: msg.id,
        });
      }

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

    const handleGroupRecalled = (payload: MessageRecallPayload) => {
      const activeGroupId = groupIdRef.current;
      if (
        typeof payload.groupId === "string" &&
        typeof activeGroupId === "string" &&
        payload.groupId !== activeGroupId
      ) {
        return;
      }
      markMessageAsRecalled(payload.id);
    };

    socket.on("group:message:recalled", handleGroupRecalled);
    socket.on("group:message:deleted", handleGroupRecalled);
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
      void syncReadCheckpoint({
        chatType: "direct",
        threadId,
      });
    }
  }, [chatMode, threadId]);

  useEffect(() => {
    if (chatMode === "group" && groupId) {
      clearGroupUnread(groupId);
      void syncReadCheckpoint({
        chatType: "group",
        groupId,
      });
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
    } else {
      if (!threadId) {
        setStatus(t("chat.createOrJoinThread"));
        return false;
      }
    }

    const sendResult = sendOptimisticMessage({
      body: trimmed,
      parentMessageId: quoteDraft?.parentMessageId,
      quoteSenderName: quoteDraft?.senderName,
      quotePreview: quoteDraft?.preview,
    });
    if (!sendResult) {
      setStatus(t("chat.chatError"));
      return false;
    }

    if (chatMode === "group" && groupId) {
      clearDraftForTarget({
        chatType: "group",
        groupId,
      });
    }
    if (chatMode === "direct" && threadId) {
      clearDraftForTarget({
        chatType: "direct",
        threadId,
      });
    }

    setMessageBody("");
    setQuoteDraft(null);
    setStatus(sendResult.dispatched ? "" : t("chat.socketNotConnected"));
    closeContextMenu();
    refocusMessageInput();
    return true;
  };

  const handleRetrySend = (messageId: number) => {
    const retried = retrySendMessage(messageId);
    if (!retried) {
      setStatus(t("chat.socketNotConnected"));
      return;
    }
    setStatus("");
  };

  const handleDeleteMessage = (
    targetMessage: ChatMessage,
    options?: {
      bypassConfirm?: boolean;
      withToast?: boolean;
    }
  ) => {
    const currentUser = meRef.current;
    if (!currentUser || currentUser.id !== targetMessage.senderId) {
      return;
    }
    if (!socketRef.current || !socketRef.current.connected) {
      setStatus(t("chat.socketNotConnected"));
      return;
    }
    if (!options?.bypassConfirm && !window.confirm(t("chat.deleteMessageConfirm"))) {
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
          markMessageAsRecalled(targetMessage.id);
          clearDeletingState();
          setStatus("");
          if (options?.withToast) {
            showMiniToast(t("chat.recallToast"));
          }
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
        markMessageAsRecalled(targetMessage.id);
        clearDeletingState();
        setStatus("");
        if (options?.withToast) {
          showMiniToast(t("chat.recallToast"));
        }
      }
    );
  };

  const activeContextMessage = useMemo(() => {
    if (!contextMenu) {
      return null;
    }
    return message.find((item) => item.id === contextMenu.messageId) ?? null;
  }, [contextMenu, message]);

  const openContextMenuAt = (targetMessage: ChatMessage, element: HTMLElement) => {
    const rect = element.getBoundingClientRect();
    clearTextSelection();
    setSelectableMessageId(targetMessage.id);
    setContextMenu({
      messageId: targetMessage.id,
      anchorRect: {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    });
  };

  const handleMessagePointerDown = (event: ReactPointerEvent<HTMLElement>, targetMessage: ChatMessage) => {
    if (typeof window === "undefined") {
      return;
    }

    if (event.pointerType === "mouse" && event.button !== 0) {
      return;
    }

    if (contextMenu?.messageId === targetMessage.id || selectableMessageId === targetMessage.id) {
      return;
    }

    clearLongPressTimeout();
    longPressOriginRef.current = { x: event.clientX, y: event.clientY };
    const anchorElement = event.currentTarget;

    longPressTimeoutRef.current = window.setTimeout(() => {
      openContextMenuAt(targetMessage, anchorElement);
      longPressTimeoutRef.current = null;
      longPressOriginRef.current = null;
    }, 600);
  };

  const handleMessagePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const origin = longPressOriginRef.current;
    if (!origin) {
      return;
    }

    const deltaX = Math.abs(event.clientX - origin.x);
    const deltaY = Math.abs(event.clientY - origin.y);
    if (deltaX > 8 || deltaY > 8) {
      clearLongPressTimeout();
      longPressOriginRef.current = null;
    }
  };

  const handleMessagePointerEnd = () => {
    clearLongPressTimeout();
    longPressOriginRef.current = null;
  };

  const handleMessageContextMenu = (event: ReactMouseEvent<HTMLElement>, targetMessage: ChatMessage) => {
    event.preventDefault();
    openContextMenuAt(targetMessage, event.currentTarget);
  };

  const handleMessageSelectCapture = (event: ReactSyntheticEvent<HTMLElement>, targetMessage: ChatMessage) => {
    if (selectableMessageId === targetMessage.id) {
      return;
    }
    event.preventDefault();
  };

  const handleCopyFromContextMenu = async () => {
    if (!activeContextMessage) {
      closeContextMenu();
      return;
    }

    const selectedText = getSelectedTextFromMessage(activeContextMessage.id);
    const text = selectedText || getMessagePlainText(activeContextMessage);
    try {
      await navigator.clipboard.writeText(text);
      showMiniToast(t("chat.copyDone"));
    } catch {
      showMiniToast(t("chat.copyFailed"));
    }
    closeContextMenu();
  };

  const handleQuoteFromContextMenu = () => {
    if (!activeContextMessage) {
      closeContextMenu();
      return;
    }

    setQuoteDraft({
      parentMessageId: activeContextMessage.id,
      senderName: resolveQuoteSenderName(activeContextMessage),
      preview: getMessagePreviewText(activeContextMessage),
    });
    closeContextMenu();
    refocusMessageInput();
  };

  const handleRecallFromContextMenu = () => {
    if (
      !activeContextMessage ||
      activeContextMessage.senderId !== me?.id ||
      activeContextMessage.deliveryStatus === "sending" ||
      activeContextMessage.deliveryStatus === "error" ||
      isRecalledMessageBody(activeContextMessage.body)
    ) {
      closeContextMenu();
      return;
    }

    closeContextMenu();
    handleDeleteMessage(activeContextMessage, { bypassConfirm: true, withToast: true });
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

      const sendResult = sendOptimisticMessage({
        body: `${IMAGE_MESSAGE_PREFIX}${imageUrl}`,
      });
      if (!sendResult) {
        setStatus(t("chat.chatError"));
        return;
      }

      setStatus(sendResult.dispatched ? t("chat.photoSent") : t("chat.socketNotConnected"));
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
      if (typeof window !== "undefined" && longPressTimeoutRef.current !== null) {
        window.clearTimeout(longPressTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (contextMenu && !message.some((item) => item.id === contextMenu.messageId)) {
      setContextMenu(null);
    }
  }, [contextMenu, message]);

  useEffect(() => {
    if (selectableMessageId === null || !contextMenu || typeof document === "undefined") {
      return;
    }

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }

      if (!getSelectedTextFromMessage(selectableMessageId)) {
        closeContextMenu();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [contextMenu, selectableMessageId]);

  useEffect(() => {
    if (selectableMessageId !== null && !message.some((item) => item.id === selectableMessageId)) {
      setSelectableMessageId(null);
      clearTextSelection();
    }
  }, [message, selectableMessageId]);

  useEffect(() => {
    if (quoteDraft && !message.some((item) => item.id === quoteDraft.parentMessageId)) {
      setQuoteDraft(null);
    }
  }, [message, quoteDraft]);

  const chatLabel = other || (chatMode === "group" ? t("chat.groupChat") : t("chat.conversation"));
  const isZhLanguage = i18n.language.toLowerCase().startsWith("zh");
  const sendingStatusLabel = isZhLanguage ? "发送中" : "Sending";
  const retrySendLabel = isZhLanguage ? "重发" : "Retry send";
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
              scrollToBottomIfPinned(isAtBottomRef.current);
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

  const handleMessageMediaLoad = () => {
    scrollToBottomIfPinned(isAtBottom);
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

        <div
          className={`chat-body ${showHistorySkeleton ? "loading" : "ready"}`}
          onContextMenuCapture={(event) => event.preventDefault()}
        >
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
                const isRecalled = isRecalledMessageBody(msg.body);
                const quoteSender =
                  msg.quotedContent?.senderName ?? msg.quoteSenderName ?? null;
                const quotePreview =
                  msg.quotedContent?.preview ?? msg.quotePreview ?? null;
                const hasQuoteContent = Boolean(
                  quotePreview || quoteSender || msg.parentMessageId,
                );

                if (isRecalled) {
                  return (
                    <MessageItem
                      message={msg}
                      isMe={isMe}
                      isGroupChat={chatMode === "group"}
                      isSelectableText={selectableMessageId === msg.id}
                      isDeletingMessage={isDeletingMessage}
                      isRecalled
                      imageUrl={imageUrl}
                      quoteSender={quoteSender}
                      quotePreview={quotePreview}
                      hasQuoteContent={hasQuoteContent}
                      recallMarkerText={getRecallMarkerText(msg)}
                      sendingLabel={sendingStatusLabel}
                      retryLabel={retrySendLabel}
                      sharedImageAlt={t("chat.sharedImage")}
                      quoteActionLabel={t("chat.quoteAction")}
                      quoteFallbackSender={t("chat.quoteFallbackSender")}
                      quoteFallbackPreview={t("chat.quoteFallbackPreview")}
                      deletingLabel={t("chat.deleting")}
                      onRetrySend={handleRetrySend}
                      onOpenImagePreview={handleOpenImagePreview}
                      onMessageMediaLoad={handleMessageMediaLoad}
                      onPointerDown={handleMessagePointerDown}
                      onPointerMove={handleMessagePointerMove}
                      onPointerEnd={handleMessagePointerEnd}
                      onContextMenu={handleMessageContextMenu}
                      onSelectCapture={handleMessageSelectCapture}
                    />
                  );
                }

                return (
                  <MessageItem
                    message={msg}
                    isMe={isMe}
                    isGroupChat={chatMode === "group"}
                    isSelectableText={selectableMessageId === msg.id}
                    isDeletingMessage={isDeletingMessage}
                    isRecalled={false}
                    imageUrl={imageUrl}
                    quoteSender={quoteSender}
                    quotePreview={quotePreview}
                    hasQuoteContent={hasQuoteContent}
                    recallMarkerText={getRecallMarkerText(msg)}
                    sendingLabel={sendingStatusLabel}
                    retryLabel={retrySendLabel}
                    sharedImageAlt={t("chat.sharedImage")}
                    quoteActionLabel={t("chat.quoteAction")}
                    quoteFallbackSender={t("chat.quoteFallbackSender")}
                    quoteFallbackPreview={t("chat.quoteFallbackPreview")}
                    deletingLabel={t("chat.deleting")}
                    onRetrySend={handleRetrySend}
                    onOpenImagePreview={handleOpenImagePreview}
                    onMessageMediaLoad={handleMessageMediaLoad}
                    onPointerDown={handleMessagePointerDown}
                    onPointerMove={handleMessagePointerMove}
                    onPointerEnd={handleMessagePointerEnd}
                    onContextMenu={handleMessageContextMenu}
                    onSelectCapture={handleMessageSelectCapture}
                  />
                );
              }}
            />
          )}
        </div>

        <footer className="chat-footer">
          {quoteDraft && (
            <div className="chat-quote-preview" role="status" aria-live="polite">
              <span className="chat-quote-preview-line" aria-hidden="true" />
              <div className="chat-quote-preview-copy">
                <p>
                  <strong>{quoteDraft.senderName}</strong>: {quoteDraft.preview}
                </p>
              </div>
              <button
                type="button"
                className="chat-quote-preview-clear"
                aria-label={t("chat.clearQuote")}
                onClick={() => setQuoteDraft(null)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path
                    d="M7 7 17 17M17 7 7 17"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          )}

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

        <MessageContextMenu
          open={Boolean(contextMenu && activeContextMessage)}
          anchorRect={contextMenu?.anchorRect ?? null}
          canRecall={Boolean(
            activeContextMessage &&
              activeContextMessage.senderId === me?.id &&
              activeContextMessage.deliveryStatus !== "sending" &&
              activeContextMessage.deliveryStatus !== "error" &&
              !isRecalledMessageBody(activeContextMessage.body),
          )}
          labels={{
            recall: t("chat.recallAction"),
            copy: t("chat.copyAction"),
            quote: t("chat.quoteAction"),
          }}
          onRecall={handleRecallFromContextMenu}
          onCopy={handleCopyFromContextMenu}
          onQuote={handleQuoteFromContextMenu}
          onClose={closeContextMenu}
        />

        {toast.message && (
          <div
            className={`chat-mini-toast ${toast.visible ? "is-visible" : "is-hidden"}`}
            role="status"
            aria-live="polite"
          >
            {toast.message}
          </div>
        )}

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
