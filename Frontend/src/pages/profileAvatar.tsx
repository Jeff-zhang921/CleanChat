import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  DEFAULT_AVATAR_KEY,
  getAvatarOption,
  getAvatarOptionsByStyle,
  getAvatarStyleCategories,
  getAvatarToneClass,
  getAvatarUrl,
  type AvatarKey,
  type AvatarStyle,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";
import "./profileEdit.css";
import "./profileAvatar.css";

const ProfileAvatarPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [loading, setLoading] = useState(!seededUser);
  const [status, setStatus] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<AvatarStyle | null>(null);

  useEffect(() => {
    if (seededUser) {
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
        if (!isMounted || !data.user) {
          return;
        }
        setUser(hydrateProfileUser(data.user));
      } catch {
        if (isMounted) {
          setStatus(t("avatarPicker.loadFailed"));
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
  }, [navigate, seededUser, t]);

  const selectedAvatar =
    routeState?.editDraft?.avatar ??
    routeState?.selectedAvatar ??
    user?.avatar ??
    DEFAULT_AVATAR_KEY;
  const selectedAvatarOption = getAvatarOption(selectedAvatar);
  const categories = getAvatarStyleCategories();
  const avatarOptions = useMemo(
    () =>
      selectedStyle
        ? getAvatarOptionsByStyle(selectedStyle).map((item) => ({
            ...item,
            isSelected: selectedAvatar === item.key,
            isCurrent: user?.avatar === item.key,
          }))
        : [],
    [selectedAvatar, selectedStyle, user?.avatar],
  );

  const returnTo = routeState?.avatarPickerReturnTo ?? "/profile/edit";
  const profileReturnTo = routeState?.returnTo ?? "/profile";

  const buildReturnState = (avatar: AvatarKey): ProfileRouteState => ({
    user: user ?? undefined,
    selectedAvatar: avatar,
    editDraft: routeState?.editDraft
      ? {
          ...routeState.editDraft,
          avatar,
        }
      : undefined,
    spatialTransition: "pop",
    returnTo: profileReturnTo,
  });

  const handleBack = () => {
    if (selectedStyle) {
      setSelectedStyle(null);
      return;
    }
    navigate(returnTo, {
      state: buildReturnState(selectedAvatar),
    });
  };

  const handleAvatarSelect = (avatar: AvatarKey) => {
    navigate(returnTo, {
      state: buildReturnState(avatar),
    });
  };

  return (
    <div className="profile-avatar-shell">
      <main className="profile-avatar-page">
        <header className="profile-edit-nav">
          <button type="button" className="profile-edit-back-button" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{selectedStyle ? t("avatarPicker.stylesBack") : t("common.back")}</span>
          </button>
        </header>

        <section className="profile-avatar-page-header">
          <p className="profile-edit-eyebrow">{t("avatarPicker.title")}</p>
          <h1>
            {selectedStyle
              ? t(`avatarPicker.styles.${selectedStyle}.label`)
              : t("avatarPicker.heading")}
          </h1>
          <p>
            {selectedStyle
              ? t(`avatarPicker.styles.${selectedStyle}.description`)
              : t("avatarPicker.subtitle")}
          </p>
        </section>

        {loading ? (
          <p className="profile-edit-loading">{t("avatarPicker.loading")}</p>
        ) : !user ? (
          <p className="profile-edit-loading">{t("avatarPicker.unavailable")}</p>
        ) : !selectedStyle ? (
          <section className="profile-avatar-style-grid" aria-label={t("avatarPicker.styleLabel")}>
            {categories.map((category) => (
              <button
                key={category.style}
                type="button"
                className={`profile-avatar-style-card ${
                  selectedAvatarOption.style === category.style ? "is-current" : ""
                }`}
                onClick={() => setSelectedStyle(category.style)}
              >
                <span className="profile-avatar-style-preview" aria-hidden="true">
                  {category.sampleKeys.map((key) => (
                    <img
                      key={key}
                      className={getAvatarToneClass(key)}
                      src={getAvatarUrl(key)}
                      alt=""
                    />
                  ))}
                </span>
                <span className="profile-avatar-style-copy">
                  <strong>{t(`avatarPicker.styles.${category.style}.label`)}</strong>
                  <span>{t(`avatarPicker.styles.${category.style}.description`)}</span>
                </span>
                <span className="profile-avatar-style-meta">
                  {t("avatarPicker.styleCount", { count: category.count })}
                </span>
              </button>
            ))}
          </section>
        ) : (
          <section className="profile-avatar-choice-panel" aria-label={t("avatarPicker.avatarLabel")}>
            <button
              type="button"
              className="profile-avatar-style-return"
              onClick={() => setSelectedStyle(null)}
            >
              {t("avatarPicker.changeStyle")}
            </button>

            <div className="profile-avatar-grid profile-avatar-choice-grid">
              {avatarOptions.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`profile-avatar-option profile-avatar-choice ${
                    item.isSelected ? "active" : ""
                  } ${item.isCurrent ? "current" : ""}`}
                  onClick={() => handleAvatarSelect(item.key)}
                  aria-pressed={item.isSelected}
                >
                  <img
                    className={getAvatarToneClass(item.key)}
                    src={item.url}
                    alt={item.label}
                  />
                  <span>{item.label}</span>
                  <em>
                    {item.isCurrent
                      ? t("identityVault.currentMark")
                      : t("identityVault.availableNow")}
                  </em>
                </button>
              ))}
            </div>
          </section>
        )}

        {status && (
          <p className="profile-edit-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default ProfileAvatarPage;
