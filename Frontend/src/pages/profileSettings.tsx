import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BACKEND_URL } from "../config";
import {
  LANGUAGE_SWITCH_OPTIONS,
  resolveSupportedLanguage,
  setPreferredLanguage,
  type SupportedLanguage,
} from "../i18n";
import { clearAuthToken } from "../utils/auth";
import {
  ensurePushSubscriptionForCurrentUser,
  getNotificationPermission,
  isAndroid13Plus,
  isIOSDevice,
  isStandalonePwa,
} from "../utils/notifications";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profileSettings.css";

const EXIT_MS = 260;

type BeforeInstallPromptOutcome = "accepted" | "dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: BeforeInstallPromptOutcome;
    platform: string;
  }>;
};

const ProfileSettingsLoadingState = ({ onBack }: { onBack: () => void }) => {
  const { t } = useTranslation();

  return (
    <div className="profile-settings-shell">
      <main className="profile-settings-page">
        <header className="profile-settings-nav">
          <button type="button" className="profile-settings-back-button" onClick={onBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
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
};

const ProfileSettingsPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const isSettingsRouteActive = location.pathname === "/profile/settings";

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [status, setStatus] = useState("");
  const [notificationPermission, setNotificationPermission] = useState(getNotificationPermission());
  const [notificationStatus, setNotificationStatus] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isLanguagePickerOpen, setIsLanguagePickerOpen] = useState(false);
  const [isSwitchingLanguage, setIsSwitchingLanguage] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isPromptingInstall, setIsPromptingInstall] = useState(false);

  const currentLanguage = resolveSupportedLanguage(i18n.language);
  const showIosInstallShortcut = isIOSDevice() && !isStandalonePwa();
  const showAndroidInstallShortcut =
    typeof navigator !== "undefined" &&
    /Android/i.test(navigator.userAgent) &&
    !isStandalonePwa();
  const showNativeInstallShortcut =
    !isStandalonePwa() && Boolean(deferredInstallPrompt);
  const shouldShowInstallShortcut =
    showIosInstallShortcut ||
    showAndroidInstallShortcut ||
    showNativeInstallShortcut;

  const getLanguageName = (language: SupportedLanguage) => {
    const option = LANGUAGE_SWITCH_OPTIONS.find((item) => item.code === language);
    return option ? t(option.nameKey) : t("language.zh");
  };

  useEffect(() => {
    if (!isSettingsRouteActive) {
      return;
    }

    if (isStandalonePwa()) {
      setDeferredInstallPrompt(null);
      return;
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent;
      if (typeof promptEvent.prompt !== "function") {
        return;
      }

      event.preventDefault();
      setDeferredInstallPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setIsPromptingInstall(false);
      setNotificationStatus("");
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt as EventListener,
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt as EventListener,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [isSettingsRouteActive]);

  useEffect(() => {
    if (!isSettingsRouteActive) {
      return;
    }

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
          setStatus(t("common.connectionError"));
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
  }, [isSettingsRouteActive, navigate, seededUser, t]);

  useEffect(() => {
    if (isSettingsRouteActive) {
      setIsLeaving(false);
    }
  }, [isSettingsRouteActive]);

  useEffect(() => {
    if (!isSettingsRouteActive) {
      return;
    }

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
  }, [isSettingsRouteActive]);

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
    const subscriptionResult = await ensurePushSubscriptionForCurrentUser({
      requestPermission: true,
      forceResubscribe: true,
      activationUserKey: user?.id ?? null,
    });
    setNotificationPermission(subscriptionResult.permission);

    if (subscriptionResult.ok) {
      setNotificationStatus(t("settings.notificationsEnabled"));
      return;
    }
    if (subscriptionResult.permission === "denied") {
      setNotificationStatus(
        isAndroid13Plus()
          ? t("settings.notificationsBlockedAndroid")
          : t("settings.notificationsBlockedBrowser")
      );
      return;
    }
    if (subscriptionResult.permission === "unsupported") {
      if (isIOSDevice() && !isStandalonePwa()) {
        setNotificationStatus(
          t("settings.notificationsUnsupportedIOS")
        );
        return;
      }
      setNotificationStatus(t("settings.notificationsUnsupported"));
      return;
    }
    setNotificationStatus(
      subscriptionResult.reason || t("settings.notificationsNotGranted"),
    );
  };

  const handleInstallShortcut = async () => {
    if (isPromptingInstall) {
      return;
    }

    if (showIosInstallShortcut) {
      setNotificationStatus(t("auth.installShortcutIosGuide"));
      return;
    }

    const promptEvent = deferredInstallPrompt;
    if (!promptEvent) {
      setNotificationStatus(t("settings.notificationsUnsupported"));
      return;
    }

    try {
      setIsPromptingInstall(true);
      setNotificationStatus(t("auth.installShortcutOpening"));
      await promptEvent.prompt();
      await promptEvent.userChoice;
      setNotificationStatus("");
    } catch {
      setNotificationStatus(t("settings.notificationsUnsupported"));
    } finally {
      setDeferredInstallPrompt(null);
      setIsPromptingInstall(false);
    }
  };

  const handleLanguageChange = async (nextLanguage: SupportedLanguage) => {
    if (nextLanguage === currentLanguage) {
      setIsLanguagePickerOpen(false);
      return;
    }

    setIsSwitchingLanguage(true);
    try {
      await setPreferredLanguage(nextLanguage);
      setStatus(t("language.saved"));
    } finally {
      setIsSwitchingLanguage(false);
      setIsLanguagePickerOpen(false);
    }
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
    setStatus(t("settings.deletingAccount"));
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
        setStatus(data.error || data.message || data.details || raw || t("settings.deleteFailed"));
        setIsDeleteConfirming(false);
        return;
      }
      clearAuthToken();
      navigate("/login", { replace: true });
    } catch {
      setStatus(t("common.connectionError"));
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
              <span>{t("common.back")}</span>
            </button>
          </header>
          <p className="profile-settings-loading">{t("settings.unavailable")}</p>
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
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="profile-settings-header">
          <p className="profile-settings-eyebrow">{t("settings.title")}</p>
          <h1>{t("settings.headerTitle")}</h1>
          <p>
            {t("settings.headerCopy")}
          </p>
        </section>

        <section className="profile-settings-card profile-settings-card-soft">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">{t("settings.sectionAccount")}</p>
            <h2>{user.name}</h2>
            <p>@{user.cleanId}</p>
            <span>{user.email}</span>
          </div>
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">{t("language.label")}</p>
            <h2>{t("language.current")}</h2>
            <p>{getLanguageName(currentLanguage)}</p>
          </div>
          <div className="profile-settings-actions">
            <button
              type="button"
              className="profile-settings-action"
              onClick={() => setIsLanguagePickerOpen(true)}
              disabled={isSwitchingLanguage}
            >
              {t("language.choose")}
            </button>
          </div>
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">{t("settings.sectionNotifications")}</p>
            <h2>{t("settings.notificationTitle")}</h2>
            <p>{t("settings.notificationCopy")}</p>
          </div>
          <div className="profile-settings-actions">
            <span className={`profile-permission-pill ${notificationPermission === "granted" ? "active" : ""}`}>
              {notificationPermission === "granted"
                ? t("settings.permissionOn")
                : notificationPermission === "denied"
                  ? t("settings.permissionBlocked")
                  : notificationPermission === "unsupported"
                    ? t("settings.permissionUnsupported")
                    : t("settings.permissionOff")}
            </span>
            <button
              type="button"
              className="profile-settings-action"
              onClick={() => void handleEnableNotifications()}
              disabled={notificationPermission === "granted"}
            >
              {notificationPermission === "granted" ? t("settings.notificationsOn") : t("settings.enableNotifications")}
            </button>
            {shouldShowInstallShortcut && (
              <button
                type="button"
                className="profile-settings-action"
                onClick={() => void handleInstallShortcut()}
                aria-label={t("auth.installShortcutAria")}
                title={t("auth.installShortcutAria")}
                disabled={isPromptingInstall}
              >
                {isPromptingInstall ? t("auth.installShortcutOpening") : t("auth.installShortcut")}
              </button>
            )}
          </div>
          {notificationStatus && (
            <p className="profile-settings-status" role="status">
              {notificationStatus}
            </p>
          )}
        </section>

        <section className="profile-settings-card">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">{t("settings.sectionSession")}</p>
            <h2>{t("settings.sessionTitle")}</h2>
            <p>{t("settings.sessionCopy")}</p>
          </div>
          <div className="profile-settings-actions">
            <button
              type="button"
              className="profile-settings-action"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? t("settings.loggingOut") : t("settings.logout")}
            </button>
          </div>
        </section>

        <section className="profile-settings-card profile-settings-card-danger">
          <div className="profile-settings-copy">
            <p className="profile-settings-eyebrow">{t("settings.sectionDanger")}</p>
            <h2>{t("settings.dangerTitle")}</h2>
            <p>{t("settings.dangerCopy")}</p>
          </div>
          {isDeleteConfirming && !isDeleting && (
            <p className="profile-settings-danger-note">
              {t("settings.dangerConfirmNote")}
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
                ? t("settings.deleting")
                : isDeleteConfirming
                  ? t("settings.deleteAccountConfirm")
                  : t("settings.deleteAccount")}
            </button>
            {isDeleteConfirming && !isDeleting && (
              <button
                type="button"
                className="profile-settings-action"
                onClick={() => setIsDeleteConfirming(false)}
                disabled={isLoggingOut}
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
        </section>

        {isLanguagePickerOpen && (
          <div
            role="presentation"
            onClick={() => {
              if (!isSwitchingLanguage) {
                setIsLanguagePickerOpen(false);
              }
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(21, 26, 22, 0.34)",
              backdropFilter: "blur(6px)",
              display: "grid",
              placeItems: "center",
              zIndex: 30,
              padding: "1rem",
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(event) => event.stopPropagation()}
              style={{
                width: "min(100%, 24rem)",
                borderRadius: "1.05rem",
                border: "1px solid rgba(54, 72, 58, 0.16)",
                background: "rgba(255, 255, 255, 0.94)",
                boxShadow: "0 24px 56px rgba(0, 0, 0, 0.2)",
                padding: "1rem",
                display: "grid",
                gap: "0.7rem",
              }}
            >
              <h3 style={{ margin: 0, fontSize: "1rem", color: "#1d2a22" }}>{t("language.choose")}</h3>
              <div className="profile-settings-actions" style={{ justifyContent: "stretch" }}>
                {LANGUAGE_SWITCH_OPTIONS.map((option) => (
                  <button
                    key={option.code}
                    type="button"
                    className="profile-settings-action"
                    disabled={isSwitchingLanguage || currentLanguage === option.code}
                    onClick={() => void handleLanguageChange(option.code)}
                  >
                    {`${option.shortLabel} ${t(option.nameKey)}`}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="profile-settings-action"
                disabled={isSwitchingLanguage}
                onClick={() => setIsLanguagePickerOpen(false)}
              >
                {t("common.close")}
              </button>
            </div>
          </div>
        )}

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
