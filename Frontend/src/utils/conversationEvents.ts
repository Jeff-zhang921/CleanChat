export type ConversationDeletedDetail = {
  threadId: number;
  toast?: string;
  deletedBy?: number;
  deletedAt?: string;
};

export type GroupConversationLeftDetail = {
  groupId: string;
  toast?: string;
};

export const CONVERSATION_DELETED_EVENT = "cleanchat:conversation-deleted";
export const GROUP_CONVERSATION_LEFT_EVENT =
  "cleanchat:group-conversation-left";

export const dispatchConversationDeleted = (
  detail: ConversationDeletedDetail,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<ConversationDeletedDetail>(CONVERSATION_DELETED_EVENT, {
      detail,
    }),
  );
};

export const dispatchGroupConversationLeft = (
  detail: GroupConversationLeftDetail,
) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<GroupConversationLeftDetail>(
      GROUP_CONVERSATION_LEFT_EVENT,
      {
        detail,
      },
    ),
  );
};
