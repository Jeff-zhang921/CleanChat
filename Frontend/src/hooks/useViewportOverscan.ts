import { useEffect, useState } from "react";

const DEFAULT_VIEWPORT_HEIGHT = 844;
const MIN_OVERSCAN_PX = 960;
const MAX_OVERSCAN_PX = 1200;

const resolveOverscan = (viewportHeight: number, multiplier: number) =>
  Math.min(MAX_OVERSCAN_PX, Math.max(MIN_OVERSCAN_PX, Math.ceil(viewportHeight * multiplier)));

export const useViewportOverscan = (multiplier = 2.5) => {
  const [overscan, setOverscan] = useState(() => {
    if (typeof window === "undefined") {
      return resolveOverscan(DEFAULT_VIEWPORT_HEIGHT, multiplier);
    }
    return resolveOverscan(window.innerHeight, multiplier);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOverscan = () => {
      setOverscan(resolveOverscan(window.innerHeight, multiplier));
    };

    updateOverscan();
    window.addEventListener("resize", updateOverscan);
    window.addEventListener("orientationchange", updateOverscan);

    return () => {
      window.removeEventListener("resize", updateOverscan);
      window.removeEventListener("orientationchange", updateOverscan);
    };
  }, [multiplier]);

  return overscan;
};
