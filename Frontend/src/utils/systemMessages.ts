export const CHAT_REQUEST_ACCEPTED_MESSAGE_BODY =
  "__CLEANCHAT_CHAT_REQUEST_ACCEPTED__";

export const getSystemMessageText = (
  body: string | null | undefined,
  labels: {
    chatRequestAccepted: string;
  },
) => {
  const normalized = typeof body === "string" ? body.trim() : "";
  if (normalized === CHAT_REQUEST_ACCEPTED_MESSAGE_BODY) {
    return labels.chatRequestAccepted;
  }

  return null;
};
