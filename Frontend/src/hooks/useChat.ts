import { useCallback, useEffect, useRef, useState } from "react";

export type ChatDeliveryStatus = "sent" | "sending" | "error";

export type ChatMessage = {
  id: number;
  threadId?: number;
  groupId?: string;
  senderId: number;
  senderName?: string;
  body: string;
  createdAt: string;
  parentMessageId?: number | null;
  quoteSenderName?: string | null;
  quotePreview?: string | null;
  quotedContent?: {
    senderName?: string | null;
    preview?: string | null;
  } | null;
  deliveryStatus?: ChatDeliveryStatus;
};

export type ChatSendPayload = {
  body: string;
  parentMessageId?: number | null;
  quoteSenderName?: string | null;
  quotePreview?: string | null;
};

type UseChatOptions = {
  meId: number | null;
  chatMode: "direct" | "group";
  threadId: number | null;
  groupId: string | null;
  onSend: (payload: ChatSendPayload) => boolean;
  onScrollToBottom: () => void;
  sendTimeoutMs?: number;
};

type OptimisticSendResult = {
  messageId: number;
  dispatched: boolean;
};

const normalizeQuotedContent = (message: ChatMessage) => {
  const senderName =
    message.quotedContent?.senderName ?? message.quoteSenderName ?? null;
  const preview =
    message.quotedContent?.preview ?? message.quotePreview ?? null;

  if (!senderName && !preview) {
    return null;
  }

  return {
    senderName,
    preview,
  };
};

const normalizeMessage = (message: ChatMessage): ChatMessage => ({
  ...message,
  quoteSenderName: message.quoteSenderName ?? null,
  quotePreview: message.quotePreview ?? null,
  parentMessageId: message.parentMessageId ?? null,
  quotedContent: normalizeQuotedContent(message),
  deliveryStatus: "sent",
});

const normalizeText = (value: string | null | undefined) =>
  (value ?? "").trim();

const isSameChannel = (left: ChatMessage, right: ChatMessage) => {
  if (left.groupId || right.groupId) {
    return (left.groupId ?? null) === (right.groupId ?? null);
  }

  return (left.threadId ?? null) === (right.threadId ?? null);
};

const shouldMatchOptimisticMessage = (
  candidate: ChatMessage,
  incoming: ChatMessage,
  meId: number,
) => {
  if (candidate.senderId !== meId) {
    return false;
  }

  if (
    candidate.deliveryStatus !== "sending" &&
    candidate.deliveryStatus !== "error"
  ) {
    return false;
  }

  if (!isSameChannel(candidate, incoming)) {
    return false;
  }

  if (normalizeText(candidate.body) !== normalizeText(incoming.body)) {
    return false;
  }

  if (
    (candidate.parentMessageId ?? null) !== (incoming.parentMessageId ?? null)
  ) {
    return false;
  }

  if (
    normalizeText(candidate.quoteSenderName) !==
    normalizeText(incoming.quoteSenderName)
  ) {
    return false;
  }

  if (
    normalizeText(candidate.quotePreview) !==
    normalizeText(incoming.quotePreview)
  ) {
    return false;
  }

  return true;
};

export const useChat = ({
  meId,
  chatMode,
  threadId,
  groupId,
  onSend,
  onScrollToBottom,
  sendTimeoutMs = 10000,
}: UseChatOptions) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const tempMessageIdRef = useRef(-1);
  const pendingTimeoutsRef = useRef<Map<number, number>>(new Map());
  const messagesRef = useRef<ChatMessage[]>([]);
  const meIdRef = useRef<number | null>(meId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    meIdRef.current = meId;
  }, [meId]);

  const clearPendingTimer = useCallback((messageId: number) => {
    if (typeof window === "undefined") {
      return;
    }

    const timeoutId = pendingTimeoutsRef.current.get(messageId);
    if (typeof timeoutId === "number") {
      window.clearTimeout(timeoutId);
      pendingTimeoutsRef.current.delete(messageId);
    }
  }, []);

  const clearAllPendingTimers = useCallback(() => {
    if (typeof window !== "undefined") {
      pendingTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
    }
    pendingTimeoutsRef.current.clear();
  }, []);

  useEffect(() => {
    return () => {
      clearAllPendingTimers();
    };
  }, [clearAllPendingTimers]);

  const markMessageAsError = useCallback((messageId: number) => {
    setMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId || message.deliveryStatus !== "sending") {
          return message;
        }

        return {
          ...message,
          deliveryStatus: "error",
        };
      }),
    );
  }, []);

  const scheduleSendTimeout = useCallback(
    (messageId: number) => {
      if (typeof window === "undefined") {
        return;
      }

      clearPendingTimer(messageId);
      const timeoutId = window.setTimeout(() => {
        pendingTimeoutsRef.current.delete(messageId);
        markMessageAsError(messageId);
      }, sendTimeoutMs);

      pendingTimeoutsRef.current.set(messageId, timeoutId);
    },
    [clearPendingTimer, markMessageAsError, sendTimeoutMs],
  );

  const hydrateMessages = useCallback(
    (incomingMessages: ChatMessage[]) => {
      clearAllPendingTimers();
      setMessages(incomingMessages.map(normalizeMessage));
    },
    [clearAllPendingTimers],
  );

  const clearMessages = useCallback(() => {
    clearAllPendingTimers();
    setMessages([]);
  }, [clearAllPendingTimers]);

  const mutateMessages = useCallback(
    (updater: (current: ChatMessage[]) => ChatMessage[]) => {
      setMessages((current) => updater(current));
    },
    [],
  );

  const appendIncomingMessage = useCallback(
    (incomingMessage: ChatMessage) => {
      const normalizedIncoming = normalizeMessage(incomingMessage);
      let matchedOptimisticId: number | null = null;
      const activeMeId = meIdRef.current;

      setMessages((current) => {
        const existingIndex = current.findIndex(
          (message) => message.id === normalizedIncoming.id,
        );
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = normalizedIncoming;
          return next;
        }

        if (activeMeId && normalizedIncoming.senderId === activeMeId) {
          const optimisticIndex = current.findIndex((message) =>
            shouldMatchOptimisticMessage(
              message,
              normalizedIncoming,
              activeMeId,
            ),
          );
          if (optimisticIndex >= 0) {
            matchedOptimisticId = current[optimisticIndex].id;
            const next = [...current];
            next[optimisticIndex] = normalizedIncoming;
            return next;
          }
        }

        return [...current, normalizedIncoming];
      });

      if (matchedOptimisticId !== null) {
        clearPendingTimer(matchedOptimisticId);
      }

      if (activeMeId && normalizedIncoming.senderId === activeMeId) {
        onScrollToBottom();
      }
    },
    [clearPendingTimer, onScrollToBottom],
  );

  const sendOptimisticMessage = useCallback(
    (payload: ChatSendPayload): OptimisticSendResult | null => {
      if (!meId) {
        return null;
      }

      const messageId = tempMessageIdRef.current;
      tempMessageIdRef.current -= 1;

      const optimisticMessage: ChatMessage = {
        id: messageId,
        threadId: chatMode === "direct" ? (threadId ?? undefined) : undefined,
        groupId: chatMode === "group" ? (groupId ?? undefined) : undefined,
        senderId: meId,
        body: payload.body,
        createdAt: new Date().toISOString(),
        parentMessageId: payload.parentMessageId ?? null,
        quoteSenderName: payload.quoteSenderName ?? null,
        quotePreview: payload.quotePreview ?? null,
        quotedContent:
          payload.quoteSenderName || payload.quotePreview
            ? {
                senderName: payload.quoteSenderName ?? null,
                preview: payload.quotePreview ?? null,
              }
            : null,
        deliveryStatus: "sending",
      };

      setMessages((current) => [...current, optimisticMessage]);
      onScrollToBottom();

      const dispatched = onSend(payload);
      if (!dispatched) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  deliveryStatus: "error",
                }
              : message,
          ),
        );

        return {
          messageId,
          dispatched: false,
        };
      }

      scheduleSendTimeout(messageId);

      return {
        messageId,
        dispatched: true,
      };
    },
    [
      chatMode,
      groupId,
      meId,
      onScrollToBottom,
      onSend,
      scheduleSendTimeout,
      threadId,
    ],
  );

  const retrySendMessage = useCallback(
    (messageId: number) => {
      const target = messagesRef.current.find(
        (message) => message.id === messageId,
      );
      if (!target || target.deliveryStatus !== "error") {
        return false;
      }

      if (!meId || target.senderId !== meId) {
        return false;
      }

      const payload: ChatSendPayload = {
        body: target.body,
        parentMessageId: target.parentMessageId ?? null,
        quoteSenderName: target.quoteSenderName ?? null,
        quotePreview: target.quotePreview ?? null,
      };

      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? {
                ...message,
                deliveryStatus: "sending",
              }
            : message,
        ),
      );
      onScrollToBottom();

      const dispatched = onSend(payload);
      if (!dispatched) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  deliveryStatus: "error",
                }
              : message,
          ),
        );
        return false;
      }

      scheduleSendTimeout(messageId);
      return true;
    },
    [meId, onScrollToBottom, onSend, scheduleSendTimeout],
  );

  return {
    messages,
    hydrateMessages,
    clearMessages,
    mutateMessages,
    appendIncomingMessage,
    sendOptimisticMessage,
    retrySendMessage,
  };
};
