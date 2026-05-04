export const CHAT_REQUEST_ACCEPTED_MESSAGE_BODY =
  "__CLEANCHAT_CHAT_REQUEST_ACCEPTED__";

export const GROUP_MEMBER_JOINED_MESSAGE_PREFIX =
  "__CLEANCHAT_GROUP_MEMBER_JOINED__:";

const safeDecodeURIComponent = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const parseGroupMemberJoinedSystemMessage = (
  body: string | null | undefined,
) => {
  const normalized = typeof body === "string" ? body.trim() : "";
  if (!normalized.startsWith(GROUP_MEMBER_JOINED_MESSAGE_PREFIX)) {
    return null;
  }

  const encodedName = normalized
    .slice(GROUP_MEMBER_JOINED_MESSAGE_PREFIX.length)
    .trim();
  if (!encodedName) {
    return null;
  }

  const decoded = safeDecodeURIComponent(encodedName).trim();
  return decoded || null;
};

export const getSystemMessageText = (
  body: string | null | undefined,
  labels: {
    chatRequestAccepted: string;
    groupMemberJoined?: (name: string) => string;
  },
) => {
  const normalized = typeof body === "string" ? body.trim() : "";
  if (normalized === CHAT_REQUEST_ACCEPTED_MESSAGE_BODY) {
    return labels.chatRequestAccepted;
  }

  const joinedName = parseGroupMemberJoinedSystemMessage(normalized);
  if (joinedName && labels.groupMemberJoined) {
    return labels.groupMemberJoined(joinedName);
  }

  return null;
};
