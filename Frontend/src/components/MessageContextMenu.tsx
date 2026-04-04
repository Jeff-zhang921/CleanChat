import { useEffect } from "react";
import "./MessageContextMenu.css";

type MessageContextMenuProps = {
  open: boolean;
  anchorX: number;
  anchorY: number;
  canRecall: boolean;
  labels: {
    recall: string;
    copy: string;
    quote: string;
  };
  onRecall: () => void;
  onCopy: () => void;
  onQuote: () => void;
  onClose: () => void;
};

const RecallGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M6 7.5v4.25c0 3.45 2.8 6.25 6.25 6.25S18.5 15.2 18.5 11.75V9.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M4.5 7.5 6.75 5.25 9 7.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const CopyGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="8" y="6.5" width="10" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M6 16.5h-.5A1.5 1.5 0 0 1 4 15V6.5A1.5 1.5 0 0 1 5.5 5H13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const QuoteGlyph = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path
      d="M7.5 8.5h4v4h-4zm5 0h4v4h-4z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
    <path
      d="M6.25 16.5h11.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);

const MessageContextMenu = ({
  open,
  anchorX,
  anchorY,
  canRecall,
  labels,
  onRecall,
  onCopy,
  onQuote,
  onClose,
}: MessageContextMenuProps) => {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        onClose();
        return;
      }
      if (!target.closest(".message-context-menu")) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  return (
    <div
      className="message-context-menu"
      role="menu"
      style={{ left: `${anchorX}px`, top: `${anchorY}px` }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="message-context-action"
        onClick={onRecall}
        disabled={!canRecall}
      >
        <RecallGlyph />
        <span>{labels.recall}</span>
      </button>
      <button type="button" role="menuitem" className="message-context-action" onClick={onCopy}>
        <CopyGlyph />
        <span>{labels.copy}</span>
      </button>
      <button type="button" role="menuitem" className="message-context-action" onClick={onQuote}>
        <QuoteGlyph />
        <span>{labels.quote}</span>
      </button>
    </div>
  );
};

export default MessageContextMenu;
