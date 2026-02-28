import { NavLink } from "react-router-dom";
import "./BottomNav.css";

const BottomNav = () => {
  return (
    <>
      <div className="bottom-nav-spacer" />
      <nav className="bottom-nav" aria-label="Primary navigation">
        <NavLink
          to="/conversations"
          className={({ isActive }) =>
            `bottom-nav-link ${isActive ? "active" : ""}`
          }
        >
          Conversations
        </NavLink>
        <NavLink
          to="/profile"
          className={({ isActive }) =>
            `bottom-nav-link ${isActive ? "active" : ""}`
          }
        >
          Profile
        </NavLink>
      </nav>
    </>
  );
};

export default BottomNav;
