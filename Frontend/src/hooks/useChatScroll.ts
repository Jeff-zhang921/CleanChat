import { useCallback, useEffect, useRef, type RefObject } from "react";
import type { VirtuosoHandle } from "react-virtuoso";

type UseChatScrollOptions = {
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  messageCount: number;
  isHistoryLoading: boolean;
};

type ScrollBehaviorMode = "auto" | "smooth";

export const useChatScroll = ({
  virtuosoRef,
  messageCount,
  isHistoryLoading,
}: UseChatScrollOptions) => {
  const previousMessageCountRef = useRef(0);
  const messageCountRef = useRef(messageCount);

  useEffect(() => {
    messageCountRef.current = messageCount;
  }, [messageCount]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehaviorMode) => {
      const performScroll = () => {
        const currentMessageCount = messageCountRef.current;
        if (!virtuosoRef.current || currentMessageCount <= 0) {
          return;
        }

        virtuosoRef.current.scrollToIndex({
          index: currentMessageCount - 1,
          align: "end",
          behavior,
        });
      };

      if (typeof window === "undefined") {
        performScroll();
        return;
      }

      window.requestAnimationFrame(performScroll);
    },
    [virtuosoRef],
  );

  const scrollToBottomImmediate = useCallback(() => {
    scrollToBottom("auto");
  }, [scrollToBottom]);

  const scrollToBottomSmooth = useCallback(() => {
    scrollToBottom("smooth");
  }, [scrollToBottom]);

  const scrollToBottomIfPinned = useCallback(
    (isAtBottom: boolean) => {
      if (!isAtBottom) {
        return;
      }
      scrollToBottomImmediate();
    },
    [scrollToBottomImmediate],
  );

  useEffect(() => {
    if (isHistoryLoading) {
      previousMessageCountRef.current = 0;
      return;
    }

    if (messageCount <= 0) {
      previousMessageCountRef.current = 0;
      return;
    }

    if (previousMessageCountRef.current === 0) {
      scrollToBottomImmediate();
    }

    previousMessageCountRef.current = messageCount;
  }, [isHistoryLoading, messageCount, scrollToBottomImmediate]);

  return {
    scrollToBottomImmediate,
    scrollToBottomSmooth,
    scrollToBottomIfPinned,
  };
};
