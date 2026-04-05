export type ActiveChatView =
  | {
      chatType: "direct";
      threadId: number;
    }
  | {
      chatType: "group";
      groupId: string;
    };

export const ACTIVE_CHAT_VIEW_UPDATED_EVENT =
  "cleanchat:active-chat-view-updated";
const ACTIVE_CHAT_VIEW_STORAGE_KEY = "cleanchat:active-chat-view";

const normalizePositiveInt = (value: unknown): number | null => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

const normalizeGroupId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const normalizeActiveChatView = (value: unknown): ActiveChatView | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (record.chatType === "direct") {
    const threadId = normalizePositiveInt(record.threadId);
    if (!threadId) {
      return null;
    }

    return {
      chatType: "direct",
      threadId,
    };
  }

  if (record.chatType === "group") {
    const groupId = normalizeGroupId(record.groupId);
    if (!groupId) {
      return null;
    }

    return {
      chatType: "group",
      groupId,
    };
  }

  return null;
};

const dispatchActiveChatViewUpdate = (next: ActiveChatView | null) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.dispatchEvent(
      new CustomEvent<ActiveChatView | null>(ACTIVE_CHAT_VIEW_UPDATED_EVENT, {
        detail: next,
      }),
    );
  } catch {
    // Ignore dispatch failures so state persistence keeps working.
  }
};

export const readActiveChatView = (): ActiveChatView | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(ACTIVE_CHAT_VIEW_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeActiveChatView(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const setActiveChatView = (value: ActiveChatView | null) => {
  const normalized = normalizeActiveChatView(value);
  if (typeof window !== "undefined") {
    try {
      if (normalized) {
        window.sessionStorage.setItem(
          ACTIVE_CHAT_VIEW_STORAGE_KEY,
          JSON.stringify(normalized),
        );
      } else {
        window.sessionStorage.removeItem(ACTIVE_CHAT_VIEW_STORAGE_KEY);
      }
    } catch {
      // Ignore storage failures and still notify subscribers in this tab.
    }
  }

  dispatchActiveChatViewUpdate(normalized);
};

export const clearActiveChatView = () => {
  setActiveChatView(null);
};
