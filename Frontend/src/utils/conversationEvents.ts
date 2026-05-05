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

export type GroupsRealtimeReason =
  | "catalog-updated"
  | "group-created"
  | "group-deleted"
  | "member-left"
  | "invitation-new"
  | "invitation-resolved"
  | "join-request-new"
  | "join-request-resolved";

export type GroupsRealtimeDetail = {
  reason: GroupsRealtimeReason;
  eventType?: string;
  groupId?: string;
  invitationId?: number;
  requesterId?: number;
  actorUserId?: number;
  updatedAt?: string;
};

export const CONVERSATION_DELETED_EVENT = "cleanchat:conversation-deleted";
export const GROUP_CONVERSATION_LEFT_EVENT =
  "cleanchat:group-conversation-left";
export const GROUPS_REALTIME_EVENT = "cleanchat:groups-realtime";

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

export const dispatchGroupsRealtime = (detail: GroupsRealtimeDetail) => {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<GroupsRealtimeDetail>(GROUPS_REALTIME_EVENT, {
      detail,
    }),
  );
};
