import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  SyntheticEvent as ReactSyntheticEvent,
} from "react";
import type { ChatMessage } from "../hooks/useChat";
import "./MessageItem.css";

type MessageItemProps = {
  message: ChatMessage;
  isMe: boolean;
  isGroupChat: boolean;
  isSelectableText: boolean;
  isDeletingMessage: boolean;
  isRecalled: boolean;
  bodyText: string;
  imageUrl: string | null;
  quoteSender: string | null;
  quotePreview: string | null;
  hasQuoteContent: boolean;
  recallMarkerText: string;
  sendingLabel: string;
  retryLabel: string;
  sharedImageAlt: string;
  quoteActionLabel: string;
  quoteFallbackSender: string;
  quoteFallbackPreview: string;
  deletingLabel: string;
  onRetrySend: (messageId: number) => void;
  onOpenImagePreview: (imageUrl: string) => void;
  onMessageMediaLoad: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>, targetMessage: ChatMessage) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onPointerEnd: () => void;
  onContextMenu: (event: ReactMouseEvent<HTMLElement>, targetMessage: ChatMessage) => void;
  onSelectCapture: (event: ReactSyntheticEvent<HTMLElement>, targetMessage: ChatMessage) => void;
};

const MessageItem = ({
  message,
  isMe,
  isGroupChat,
  isSelectableText,
  isDeletingMessage,
  isRecalled,
  bodyText,
  imageUrl,
  quoteSender,
  quotePreview,
  hasQuoteContent,
  recallMarkerText,
  sendingLabel,
  retryLabel,
  sharedImageAlt,
  quoteActionLabel,
  quoteFallbackSender,
  quoteFallbackPreview,
  deletingLabel,
  onRetrySend,
  onOpenImagePreview,
  onMessageMediaLoad,
  onPointerDown,
  onPointerMove,
  onPointerEnd,
  onContextMenu,
  onSelectCapture,
}: MessageItemProps) => {
  if (isRecalled) {
    return (
      <div className="chat-virtuoso-item">
        <div className="chat-recall-row" aria-live="polite">
          <p className="chat-recall-marker">{recallMarkerText}</p>
        </div>
      </div>
    );
  }

  const deliveryStatus = message.deliveryStatus ?? "sent";
  const showSendingIndicator = isMe && deliveryStatus === "sending" && !isDeletingMessage;
  const showRetryIndicator = isMe && deliveryStatus === "error" && !isDeletingMessage;

  return (
    <div className="chat-virtuoso-item">
      <div className={`chat-row ${isMe ? "me" : "them"}`}>
        {showSendingIndicator && (
          <span
            className="chat-status-indicator chat-status-indicator-sending"
            role="status"
            aria-live="polite"
            aria-label={sendingLabel}
          >
            <span className="chat-status-spinner-line" aria-hidden="true" />
          </span>
        )}
        {showRetryIndicator && (
          <button
            type="button"
            className="chat-status-indicator chat-status-indicator-error"
            aria-label={retryLabel}
            title={retryLabel}
            onClick={() => onRetrySend(message.id)}
          >
            <span className="chat-status-error-dot" aria-hidden="true" />
          </button>
        )}
        <div
          className={`chat-bubble ${isMe ? "bubble-me" : "bubble-them"} ${isSelectableText ? "is-selectable-text" : ""}`}
          data-message-id={message.id}
          onPointerDown={(event) => onPointerDown(event, message)}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
          onPointerLeave={onPointerEnd}
          onContextMenu={(event) => onContextMenu(event, message)}
          onSelectCapture={(event) => onSelectCapture(event, message)}
        >
          {isGroupChat && !isMe && message.senderName && (
            <p className="group-sender">{message.senderName}</p>
          )}

          {imageUrl ? (
            <button
              type="button"
              className="chat-image-button"
              onClick={() => onOpenImagePreview(imageUrl)}
            >
              <img
                className="chat-image"
                src={imageUrl}
                alt={sharedImageAlt}
                onLoad={onMessageMediaLoad}
              />
            </button>
          ) : (
            <p className="chat-message-content">{bodyText}</p>
          )}

          {hasQuoteContent && (
            <div className="chat-quote-inline" aria-label={quoteActionLabel}>
              <p className="chat-quote-inline-sender">
                {quoteSender || quoteFallbackSender}
              </p>
              <p className="chat-quote-inline-body">
                {quotePreview || quoteFallbackPreview}
              </p>
            </div>
          )}

          {isDeletingMessage && (
            <div className="chat-meta-row" aria-hidden="true">
              <span className="chat-delete-pending">{deletingLabel}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
