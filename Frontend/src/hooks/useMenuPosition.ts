import { useEffect, useRef, useState, type CSSProperties } from "react";

export type MenuAnchorRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type MenuPlacement = "above" | "below";

type UseMenuPositionOptions = {
  open: boolean;
  anchorRect: MenuAnchorRect | null;
  viewportPadding?: number;
  offset?: number;
};

const HIDDEN_MENU_STYLE: CSSProperties = {
  left: "-9999px",
  top: "-9999px",
  visibility: "hidden",
};

export const useMenuPosition = ({
  open,
  anchorRect,
  viewportPadding = 12,
  offset = 10,
}: UseMenuPositionOptions) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>(HIDDEN_MENU_STYLE);
  const [placement, setPlacement] = useState<MenuPlacement>("above");

  useEffect(() => {
    if (!open || !anchorRect || typeof window === "undefined") {
      setStyle(HIDDEN_MENU_STYLE);
      return;
    }

    let frameId = 0;

    const updatePosition = () => {
      const menuElement = menuRef.current;
      if (!menuElement) {
        return;
      }

      const menuRect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      const anchorCenterX = anchorRect.left + anchorRect.width / 2;
      let left = anchorCenterX - menuRect.width / 2;
      const minLeft = viewportPadding;
      const maxLeft = Math.max(
        viewportPadding,
        viewportWidth - viewportPadding - menuRect.width,
      );
      left = Math.min(Math.max(left, minLeft), maxLeft);

      const roomAbove = anchorRect.top - viewportPadding;
      const roomBelow = viewportHeight - anchorRect.bottom - viewportPadding;
      const fitsAbove = roomAbove >= menuRect.height + offset;
      const fitsBelow = roomBelow >= menuRect.height + offset;

      let nextPlacement: MenuPlacement = "above";
      let top = anchorRect.top - menuRect.height - offset;

      if (!fitsAbove && fitsBelow) {
        nextPlacement = "below";
        top = anchorRect.bottom + offset;
      } else if (!fitsAbove && !fitsBelow && roomBelow > roomAbove) {
        nextPlacement = "below";
        top = Math.min(
          anchorRect.bottom + offset,
          viewportHeight - viewportPadding - menuRect.height,
        );
      } else {
        nextPlacement = "above";
        top = Math.max(
          viewportPadding,
          anchorRect.top - menuRect.height - offset,
        );
      }

      top = Math.min(
        Math.max(top, viewportPadding),
        Math.max(
          viewportPadding,
          viewportHeight - viewportPadding - menuRect.height,
        ),
      );

      setPlacement(nextPlacement);
      setStyle({
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        visibility: "visible",
      });
    };

    const requestUpdate = () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(updatePosition);
    };

    requestUpdate();
    window.addEventListener("resize", requestUpdate);
    window.addEventListener("scroll", requestUpdate, true);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener("resize", requestUpdate);
      window.removeEventListener("scroll", requestUpdate, true);
    };
  }, [anchorRect, offset, open, viewportPadding]);

  return {
    menuRef,
    style,
    placement,
  };
};
