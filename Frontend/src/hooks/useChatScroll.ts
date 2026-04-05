import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";
import type { VirtuosoHandle } from "react-virtuoso";

type UseChatScrollOptions = {
  virtuosoRef: RefObject<VirtuosoHandle | null>;
  itemCount: number;
  isHistoryLoading: boolean;
};

type ScrollBehaviorMode = "auto" | "smooth";

export const useChatScroll = ({
  virtuosoRef,
  itemCount,
  isHistoryLoading,
}: UseChatScrollOptions) => {
  const previousItemCountRef = useRef(0);
  const itemCountRef = useRef(itemCount);
  const hasAnchoredOnLoadRef = useRef(false);
  const deferredAnchorTimerIdsRef = useRef<number[]>([]);

  useEffect(() => {
    itemCountRef.current = itemCount;
  }, [itemCount]);

  const clearDeferredAnchorTimers = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    deferredAnchorTimerIdsRef.current.forEach((timerId) => {
      window.clearTimeout(timerId);
    });
    deferredAnchorTimerIdsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearDeferredAnchorTimers();
    };
  }, [clearDeferredAnchorTimers]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehaviorMode) => {
      const performScroll = () => {
        const currentItemCount = itemCountRef.current;
        if (!virtuosoRef.current || currentItemCount <= 0) {
          return;
        }

        virtuosoRef.current.scrollToIndex({
          index: currentItemCount - 1,
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

  const scrollIntoBottomNow = useCallback(() => {
    const performScroll = () => {
      const currentItemCount = itemCountRef.current;
      if (!virtuosoRef.current || currentItemCount <= 0) {
        return;
      }

      virtuosoRef.current.scrollToIndex({
        index: currentItemCount - 1,
        align: "end",
        behavior: "auto",
      });
    };

    if (typeof window === "undefined") {
      performScroll();
      return;
    }

    clearDeferredAnchorTimers();

    // Multi-phase anchoring keeps the viewport pinned to bottom when heights settle asynchronously.
    performScroll();
    window.requestAnimationFrame(() => {
      performScroll();
      window.requestAnimationFrame(performScroll);
    });
    deferredAnchorTimerIdsRef.current.push(
      window.setTimeout(performScroll, 0),
      window.setTimeout(performScroll, 64),
    );
  }, [clearDeferredAnchorTimers, virtuosoRef]);

  useLayoutEffect(() => {
    // Keep the ref in sync for layout-time anchoring decisions.
    itemCountRef.current = itemCount;

    if (isHistoryLoading) {
      hasAnchoredOnLoadRef.current = false;
      previousItemCountRef.current = 0;
      clearDeferredAnchorTimers();
      return;
    }

    if (itemCount <= 0) {
      hasAnchoredOnLoadRef.current = false;
      previousItemCountRef.current = 0;
      clearDeferredAnchorTimers();
      return;
    }

    if (!hasAnchoredOnLoadRef.current) {
      hasAnchoredOnLoadRef.current = true;
      previousItemCountRef.current = itemCount;
      scrollIntoBottomNow();
      return;
    }

    if (itemCount > previousItemCountRef.current) {
      scrollToBottomSmooth();
    }

    previousItemCountRef.current = itemCount;
  }, [
    clearDeferredAnchorTimers,
    isHistoryLoading,
    itemCount,
    scrollIntoBottomNow,
    scrollToBottomSmooth,
  ]);

  return {
    scrollToBottomImmediate,
    scrollToBottomSmooth,
    scrollToBottomIfPinned,
    scrollIntoBottomNow,
  };
};
