import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";
import { clearAuthToken } from "../utils/auth";
import { getNotificationPermission, requestNotificationPermission } from "../utils/notifications";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profileSettings.css";

const EXIT_MS = 260;

const isIOSDevice = () =>
  typeof navigator !== "undefined" && /iPad|iPhone|iPod/i.test(navigator.userAgent);

const isStandalonePwa = () => {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone = (
    window.navigator as Navigator & { standalone?: boolean }
  ).standalone === true;
  return mediaStandalone || navigatorStandalone;
};

const ProfileSettingsLoadingState = ({ onBack }: { onBack: () => void }) => (
  <div className="profile-settings-shell">
    <main className="profile-settings-page">
      <header className="profile-settings-nav">
        <button type="button" className="profile-settings-back-button" onClick={onBack}>
          <span aria-hidden="true">{"\u2190"}</span>
          <span>Back</span>
        </button>
      </header>

      <section className="profile-settings-header profile-settings-header-loading" aria-hidden="true">
        <span className="profile-settings-skeleton profile-settings-eyebrow-skeleton" />
        <span className="profile-settings-skeleton profile-settings-title-skeleton" />
        <span className="profile-settings-skeleton profile-settings-copy-skeleton" />
        <span className="profile-settings-skeleton profile-settings-copy-skeleton profile-settings-copy-skeleton-short" />
      </section>

      <section className="profile-settings-card profile-settings-card-soft profile-settings-card-loading" aria-hidden="true">
        <div className="profile-settings-copy">
          <span className="profile-settings-skeleton profile-settings-eyebrow-skeleton" />
          <span className="profile-settings-skeleton profile-settings-name-skeleton" />
          <span className="profile-settings-skeleton profile-settings-inline-skeleton" />
          <span className="profile-settings-skeleton profile-settings-copy-skeleton" />
        </div>
      </section>

      {[0, 1, 2].map((item) => (
        <section key={item} className="profile-settings-card profile-settings-card-loading" aria-hidden="true">
          <div className="profile-settings-copy">
            <span className="profile-settings-skeleton profile-settings-eyebrow-skeleton" />
            <span className="profile-settings-skeleton profile-settings-name-skeleton" />
            <span className="profile-settings-skeleton profile-settings-copy-skeleton" />
            <span className="profile-settings-skeleton profile-settings-copy-skeleton profile-settings-copy-skeleton-short" />
          </div>
          <div className="profile-settings-actions profile-settings-actions-loading">
            <span className="profile-settings-skeleton profile-settings-pill-skeleton" />
            <span className="profile-settings-skeleton profile-settings-button-skeleton" />
          </div>
        </section>
      ))}
    </main>
  </div>
);

const ProfileSettingsPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [status, setStatus] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (seededUser) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadProfile = async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/profile/me`, {
          credentials: "include",
        });
        if (!response.ok) {
          navigate("/login", { replace: true });
          return;
        }
        const data = (await response.json()) as { user?: ProfileUser };
        if (!isMounted || !data.user) return;
        setUser(hydrateProfileUser(data.user));
      } catch {
        if (isMounted) {
          setStatus("Unable to load settings.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadProfile();

    return () => {
      isMounted = false;
    };
  }, [navigate, seededUser]);

  useEffect(() => {
    const syncPermission = () => {
      const permission = getNotificationPermission();
      setNotificationPermission(permission);
      if (permission === "granted") {
        setNotificationStatus("");
      }
    };

    const handleVisibility = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        syncPermission();
      }
    };

    syncPermission();
    window.addEventListener("focus", syncPermission);
    window.addEventListener("pageshow", syncPermission);
    document.addEventListener("visibilitychange", handleVisibility);

    let permissionStatus: PermissionStatus | null = null;
    const permissionsApi = typeof navigator !== "undefined" ? navigator.permissions : undefined;
    if (permissionsApi?.query) {
      void permissionsApi
        .query({ name: "notifications" as PermissionName })
        .then((result) => {
          permissionStatus = result;
          permissionStatus.addEventListener("change", syncPermission);
        })
        .catch(() => undefined);
    }

    return () => {
      window.removeEventListener("focus", syncPermission);
      window.removeEventListener("pageshow", syncPermission);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (permissionStatus) {
        permissionStatus.removeEventListener("change", syncPermission);
      }
    };
  }, []);

  const leave = (nextUser?: ProfileUser | null) => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
        returnTo: "/profile",
      };
      if (nextUser) {
        nextState.user = nextUser;
      }
      navigate(routeState?.returnTo ?? "/profile", { state: nextState });
    }, EXIT_MS);
  };

  const handleBack = () => {
    if (isDeleting || isLoggingOut) return;
    leave(user);
  };

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);

    if (permission === "granted") {
      setNotificationStatus("Notifications enabled.");
      return;
    }
    if (permission === "denied") {
      setNotificationStatus("Notifications blocked. Please allow notifications in browser settings.");
      return;
    }
    if (permission === "unsupported") {
      if (isIOSDevice() && !isStandalonePwa()) {
        setNotificationStatus(
          "iPhone Safari tab cannot enable web push. Add CleanChat to Home Screen, open from app icon, then enable notifications."
        );
        return;
      }
      setNotificationStatus("This browser does not support notifications.");
      return;
    }
    setNotificationStatus("Notification permission not granted yet.");
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      clearAuthToken();
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (isDeleting) return;
    if (!isDeleteConfirming) {
      setIsDeleteConfirming(true);
      return;
    }

    setIsDeleting(true);
    setStatus("Deleting account...");
    try {
      const response = await fetch(`${BACKEND_URL}/profile/me`, {
        method: "DELETE",
        credentials: "include",
      });
      const raw = await response.text();
      let data: Record<string, string> = {};
      if (raw) {
        try {
          data = JSON.parse(raw) as Record<string, string>;
        } catch {
          data = {};
        }
      }
      if (!response.ok) {
        setStatus(data.error || data.message || data.details || raw || "Failed to delete account.");
        setIsDeleteConfirming(false);
        return;
      }
      clearAuthToken();
      navigate("/login", { replace: true });
    } catch {
      setStatus("Unable to connect to server.");
      setIsDeleteConfirming(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading && !user) {
    return <ProfileSettingsLoadingState onBack={handleBack} />;
  }

  if (!user) {
    return (
      <div className="profile-settings-shell">
        <main className="profile-settings-page">
          <header className="profile-settings-nav">
            <button type="button" className="profile-settings-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>Back</span>
            </button>
          </header>
          <p className="profile-settings-loading">Settings are unavailable right now.</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`profile-settings-shell ${isLeaving ? "is-leaving" : ""}`}>
      <main className="profile-settings-page">
        <header className="profile-settings-nav">
          <button
            type="button"
            className="profile-settings-back-button"
            onClick={handleBack}
            disabled={isDeleting || isLoggingOut}
          >
            <span aria-hidden="true">{"\u2190"}</span>
            <span>Back</span>
          </button>
        </header>

        <section className="profile-settings-header">
          <p className="profile-settings-eyebrow">Settings</p>
          <h1>Keep account controls away from the main surface.</h1>
          <p>
            Notification permission, session control, and destructive actions live here so the profile page can stay
            quiet.
          </p>
        </section>

        <section className="profile-settings-card profile-settings-card-soft">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">Account</p>
            <h2>{user.name}</h2>
            <p>@{user.cleanId}</p>
            <span>{user.email}</span>
          </div>
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">Notifications</p>
            <h2>Message alerts</h2>
            <p>Enable browser notifications here instead of occupying the main conversation surface.</p>
          </div>
          <div className="profile-settings-actions">
            <span className={`profile-permission-pill ${notificationPermission === "granted" ? "active" : ""}`}>
              {notificationPermission === "granted"
                ? "On"
                : notificationPermission === "denied"
                  ? "Blocked"
                  : notificationPermission === "unsupported"
                    ? "Unsupported"
                    : "Off"}
            </span>
            <button
              type="button"
              className="profile-settings-action"
              onClick={() => void handleEnableNotifications()}
              disabled={notificationPermission === "granted"}
            >
              {notificationPermission === "granted" ? "Notifications On" : "Enable Notifications"}
            </button>
          </div>
          {notificationStatus && (
            <p className="profile-settings-status" role="status">
              {notificationStatus}
            </p>
          )}
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">Session</p>
            <h2>Leave this device</h2>
            <p>Use a calm exit instead of keeping the action exposed on the profile header.</p>
          </div>
          <div className="profile-settings-actions">
            <button
              type="button"
              className="profile-settings-action"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Logging out..." : "Log Out"}
            </button>
          </div>
        </section>

        <section className="profile-settings-card profile-settings-card-danger">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">Danger Zone</p>
            <h2>Delete account</h2>
            <p>This removes the account, profile, and message history attached to it.</p>
          </div>
          {isDeleteConfirming && !isDeleting && (
            <p className="profile-settings-danger-note">
              Confirm once more to permanently delete this account.
            </p>
          )}
          <div className="profile-settings-actions">
            <button
              type="button"
              className="profile-settings-action profile-settings-action-danger"
              onClick={handleDeleteAccount}
              disabled={isDeleting || isLoggingOut}
            >
              {isDeleting
                ? "Deleting..."
                : isDeleteConfirming
                  ? "Delete Account (Confirm)"
                  : "Delete Account"}
            </button>
            {isDeleteConfirming && !isDeleting && (
              <button
                type="button"
                className="profile-settings-action"
                onClick={() => setIsDeleteConfirming(false)}
                disabled={isLoggingOut}
              >
                Cancel
              </button>
            )}
          </div>
        </section>

        {status && (
          <p className="profile-settings-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default ProfileSettingsPage;
