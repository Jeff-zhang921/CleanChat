export type ConversationDeletedDetail = {
  threadId: number;
  toast?: string;
};

export const CONVERSATION_DELETED_EVENT = "cleanchat:conversation-deleted";

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
