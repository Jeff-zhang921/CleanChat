import { useEffect, useRef, useState } from "react";

type ToastState = {
  message: string;
  visible: boolean;
};

type ShowToastOptions = {
  durationMs?: number;
};

const TOAST_FADE_MS = 140;
const DEFAULT_TOAST_DURATION_MS = 500;

export const useToast = () => {
  const [toast, setToast] = useState<ToastState>({
    message: "",
    visible: false,
  });

  const hideTimerRef = useRef<number | null>(null);
  const clearTimerRef = useRef<number | null>(null);

  const clearTimers = () => {
    if (typeof window === "undefined") {
      return;
    }

    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (clearTimerRef.current !== null) {
      window.clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
  };

  const hideToast = () => {
    setToast((current) =>
      current.message ? { ...current, visible: false } : current,
    );
  };

  const clearToast = () => {
    clearTimers();
    setToast({ message: "", visible: false });
  };

  const showToast = (message: string, options?: ShowToastOptions) => {
    const nextMessage = message.trim();
    if (!nextMessage) {
      return;
    }

    const durationMs = Math.max(
      0,
      options?.durationMs ?? DEFAULT_TOAST_DURATION_MS,
    );

    clearTimers();
    setToast({ message: nextMessage, visible: true });

    if (typeof window === "undefined") {
      return;
    }

    hideTimerRef.current = window.setTimeout(() => {
      setToast((current) =>
        current.message === nextMessage
          ? { ...current, visible: false }
          : current,
      );

      clearTimerRef.current = window.setTimeout(() => {
        setToast((current) =>
          current.message === nextMessage
            ? { message: "", visible: false }
            : current,
        );
        clearTimerRef.current = null;
      }, TOAST_FADE_MS);

      hideTimerRef.current = null;
    }, durationMs);
  };

  useEffect(() => clearToast, []);

  return {
    toast,
    showToast,
    hideToast,
    clearToast,
  };
};
