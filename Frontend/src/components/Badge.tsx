import { useEffect, useMemo, useRef, useState } from "react";
import "./Badge.css";

type BadgeSize = "default" | "compact";

type BadgeProps = {
  count: number;
  max?: number;
  size?: BadgeSize;
  className?: string;
  ariaLabel?: string;
};

const formatBadgeCount = (count: number, max: number) => {
  if (count > max) {
    return `${max}+`;
  }
  return String(count);
};

const Badge = ({
  count,
  max = 99,
  size = "default",
  className,
  ariaLabel,
}: BadgeProps) => {
  const previousCountRef = useRef(count);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (count <= 0) {
      previousCountRef.current = count;
      setIsUpdating(false);
      return;
    }

    if (previousCountRef.current !== count) {
      setIsUpdating(true);
      const timeoutId = window.setTimeout(() => {
        setIsUpdating(false);
      }, 380);
      previousCountRef.current = count;
      return () => {
        window.clearTimeout(timeoutId);
      };
    }

    previousCountRef.current = count;
    return;
  }, [count]);

  const badgeText = useMemo(() => formatBadgeCount(count, max), [count, max]);

  if (count <= 0) {
    return null;
  }

  const classes = [
    "ui-badge",
    size === "compact" ? "ui-badge-compact" : "",
    isUpdating ? "ui-badge-updating" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} aria-label={ariaLabel}>
      {badgeText}
    </span>
  );
};

export default Badge;
