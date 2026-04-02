import { NavLink } from "react-router-dom";
import "./BottomNav.css";

type NavIconProps = {
  kind: "conversations" | "groups" | "profile";
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

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="bottom-nav-icon">
      <path {...common} d="M12 12.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
      <path {...common} d="M5 19a7 7 0 0 1 14 0" />
    </svg>
  );
};

const BottomNav = () => {
  const items = [
    { to: "/conversations", label: "Chats", kind: "conversations" as const },
    { to: "/groups", label: "Contacts", kind: "groups" as const },
    { to: "/profile", label: "Me", kind: "profile" as const },
  ];

  return (
    <>
      <div className="bottom-nav-spacer" />
      <nav className="bottom-nav" aria-label="Primary navigation">
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
                  <NavIcon kind={item.kind} active={isActive} />
                  <span className="bottom-nav-label">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
