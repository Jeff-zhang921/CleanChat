import { useEffect, useState } from "react";

const DEFAULT_VIEWPORT_HEIGHT = 844;

export const useViewportOverscan = (multiplier = 2.5) => {
  const [overscan, setOverscan] = useState(() => {
    if (typeof window === "undefined") {
      return Math.ceil(DEFAULT_VIEWPORT_HEIGHT * multiplier);
    }
    return Math.ceil(window.innerHeight * multiplier);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const updateOverscan = () => {
      setOverscan(Math.ceil(window.innerHeight * multiplier));
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
