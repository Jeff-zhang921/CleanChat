import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import Badge from "./Badge";
import { useNotificationBadges } from "../state/notificationBadgeContext";
import "./BottomNav.css";

type NavIconProps = {
  kind: "conversations" | "groups" | "discover" | "profile";
  active: boolean;
};

const NavIcon = ({ kind, active }: NavIconProps) => {
  const stroke = active ? "currentColor" : "#70757f";
  const common = {
    fill: "none",
    stroke,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (kind === "conversations") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-icon">
        <path {...common} d="M5 6.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H10l-4.5 3v-3H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
        <path {...common} d="M8 11h8" />
        <path {...common} d="M8 14h5" />
      </svg>
    );
  }

  if (kind === "groups") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-icon">
        <path {...common} d="M9 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
        <path {...common} d="M17 11a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
        <path {...common} d="M4.5 18a4.5 4.5 0 0 1 9 0" />
        <path {...common} d="M14 18a3.5 3.5 0 0 1 6.5-1.8" />
      </svg>
    );
  }

  if (kind === "discover") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-icon">
        <path {...common} d="M12 3.8 14.15 9l5.6.45-4.25 3.62 1.3 5.48L12 15.64l-4.8 2.91 1.3-5.48-4.25-3.62L9.85 9 12 3.8Z" />
        <path {...common} d="M12 8.6v3.5l2.2 1.2" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-icon">
      <path {...common} d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path {...common} d="M5 19a7 7 0 0 1 14 0" />
    </svg>
  );
};

const BottomNav = () => {
  const { t } = useTranslation();
  const { totalUnreadMessages, pendingVerificationTotal } = useNotificationBadges();

  const items = [
    { to: "/conversations", label: t("nav.chats"), kind: "conversations" as const },
    { to: "/groups", label: t("nav.groups"), kind: "groups" as const },
    { to: "/discover", label: t("nav.discover"), kind: "discover" as const },
    { to: "/profile", label: t("nav.me"), kind: "profile" as const },
  ];

  return (
    <nav className="bottom-nav" aria-label={t("nav.primaryNavigation")}>
      <div className="bottom-nav-inner">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `bottom-nav-link ${isActive ? "active" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <span className="bottom-nav-icon-wrap">
                  <NavIcon kind={item.kind} active={isActive} />
                  <Badge
                    count={
                      item.kind === "conversations"
                        ? totalUnreadMessages
                        : item.kind === "profile"
                          ? pendingVerificationTotal
                          : 0
                    }
                    size="compact"
                    className="bottom-nav-badge"
                    ariaLabel={t("conversations.unreadMessage", {
                      count:
                        item.kind === "conversations"
                          ? totalUnreadMessages
                          : item.kind === "profile"
                            ? pendingVerificationTotal
                            : 0,
                    })}
                  />
                </span>
                <span className="bottom-nav-label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
};

export default BottomNav;
