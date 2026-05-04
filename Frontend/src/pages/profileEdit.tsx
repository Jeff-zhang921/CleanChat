import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import GenderLineIcon from "../components/GenderLineIcon";
import GenderPicker from "../components/GenderPicker";
import {
  getAvatarOptions,
  getAvatarToneClass,
  getAvatarUrl,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import {
  FALLBACK_SHORT_ID_CLAIM,
  validateShortClaimInput,
} from "../utils/cleanIdClaim";
import { GENDER_ARIA_KEY_MAP, type GenderValue } from "../utils/gender";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profile.css";
import "./profileEdit.css";

const EXIT_MS = 260;

const ProfileEditPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [nickname, setNickname] = useState(seededUser?.name ?? "");
  const [cleanId, setCleanId] = useState(seededUser?.cleanId ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(seededUser?.avatar ?? "AVATAR_LEO");
  const [gender, setGender] = useState<GenderValue>(seededUser?.gender ?? "hidden");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isGenderDrawerOpen, setIsGenderDrawerOpen] = useState<boolean>(() => false);
  const genderLabel = t(GENDER_ARIA_KEY_MAP[gender]);
  const cleanIdFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    setNickname(user.name ?? "");
    setCleanId(user.cleanId ?? "");
    setAvatar(user.avatar ?? "AVATAR_LEO");
    setGender(user.gender);
  }, [user]);

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
        if (!isMounted || !data.user) return;
        setUser(hydrateProfileUser(data.user));
      } catch {
        if (isMounted) {
          setStatus(t("profileEdit.loadFailed"));
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

  const backTarget = routeState?.returnTo ?? "/profile";

  const leave = (nextUser?: ProfileUser | null) => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
        returnTo: backTarget,
      };
      if (nextUser) {
        nextState.user = nextUser;
      }
      navigate(backTarget, { state: nextState });
    }, EXIT_MS);
  };

  const handleBack = () => {
    if (isGenderDrawerOpen) {
      setIsGenderDrawerOpen(false);
      return;
    }
    if (isSaving) return;
    leave(user);
  };

  useEffect(() => {
    if (!isGenderDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGenderDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isGenderDrawerOpen]);

  useEffect(() => {
    if (!routeState?.focusClaim || !user) return;

    const timer = window.setTimeout(() => {
      cleanIdFieldRef.current?.focus();
      cleanIdFieldRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 140);

    return () => {
      window.clearTimeout(timer);
    };
  }, [routeState?.focusClaim, user]);

  const normalizedCleanId = useMemo(() => cleanId.trim().toLowerCase(), [cleanId]);
  const activeShortIdClaim = user?.shortIdClaim ?? FALLBACK_SHORT_ID_CLAIM;
  const shortClaimRangeLabel =
    activeShortIdClaim.minClaimLength && activeShortIdClaim.maxClaimLength
      ? t("identityVault.claimRange", {
          min: activeShortIdClaim.minClaimLength,
          max: activeShortIdClaim.maxClaimLength,
        })
      : t("identityVault.standardClaimRange", {
          min: activeShortIdClaim.minStandardLength,
        });
  const liveCleanIdValidation =
    user && activeShortIdClaim
      ? validateShortClaimInput({
          cleanId: normalizedCleanId,
          currentCleanId: user.cleanId,
        })
      : null;
  const cleanIdLength = (normalizedCleanId || user?.cleanId || "").length;
  const cleanIdIntent =
    cleanIdLength > 0 && cleanIdLength <= 2
      ? t("profile.cleanIdIntentUltraShort")
      : cleanIdLength > 0 && cleanIdLength <= 4
        ? t("profile.cleanIdIntentShort")
        : t("profile.cleanIdIntentStandard");
  const claimDetailText = liveCleanIdValidation
    ? t("identityVault.cleanIdValidation")
    : activeShortIdClaim.isCurrentShort
      ? t("identityVault.claimDetailClaimed")
      : t("identityVault.claimDetailClaimable");

  const avatarOptions = getAvatarOptions().map((item) => ({
    ...item,
    isSelected: avatar === item.key,
    isCurrent: user?.avatar === item.key,
  }));

  const genderDrawer =
    isGenderDrawerOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="profile-edit-gender-drawer-layer is-open" aria-hidden={false}>
            <button
              type="button"
              className="profile-edit-gender-drawer-backdrop"
              onClick={() => setIsGenderDrawerOpen(false)}
              tabIndex={0}
              aria-label={t("common.close")}
            />
            <aside
              className="profile-edit-gender-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={t("profileEdit.editGender")}
            >
              <header className="profile-edit-gender-drawer-head">
                <p className="profile-edit-eyebrow">{t("profileEdit.editGender")}</p>
                <h2>{t("profileEdit.gender")}</h2>
                <p>{t("profileEdit.genderHint")}</p>
              </header>

              <GenderPicker value={gender} onChange={setGender} disabled={isSaving} className="profile-edit-gender-picker" />

              <button
                type="button"
                className="profile-edit-action profile-edit-action-primary profile-edit-gender-drawer-close"
                onClick={() => setIsGenderDrawerOpen(false)}
                disabled={isSaving}
              >
                {t("common.close")}
              </button>
            </aside>
          </div>,
          document.body,
        )
      : null;

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setStatus(t("profileEdit.displayNameRequired"));
      return;
    }

    if (!normalizedCleanId) {
      setStatus(t("profileEdit.cleanIdRequired"));
      return;
    }

    const cleanIdValidation = validateShortClaimInput({
      cleanId: normalizedCleanId,
      currentCleanId: user.cleanId,
    });
    if (cleanIdValidation) {
      setStatus(t("profileEdit.cleanIdValidation"));
      return;
    }

    if (
      trimmedName === user.name &&
      normalizedCleanId === user.cleanId &&
      gender === user.gender &&
      avatar === user.avatar
    ) {
      leave(user);
      return;
    }

    setIsSaving(true);
    setStatus(t("profileEdit.savingStatus"));

    try {
      if (normalizedCleanId !== user.cleanId) {
        const cleanIdResponse = await fetch(`${BACKEND_URL}/profile/clean-id`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            cleanId: normalizedCleanId,
          }),
        });

        const cleanIdRaw = await cleanIdResponse.text();
        let cleanIdData: { error?: string; message?: string; details?: string } = {};
        if (cleanIdRaw) {
          try {
            cleanIdData = JSON.parse(cleanIdRaw) as typeof cleanIdData;
          } catch {
            cleanIdData = { message: cleanIdRaw };
          }
        }

        if (!cleanIdResponse.ok) {
          setStatus(
            cleanIdData.error ||
              cleanIdData.message ||
              cleanIdData.details ||
              t("profileEdit.cleanIdSaveFailed")
          );
          return;
        }
      }

      const profileUpdates: { name?: string; gender?: GenderValue; avatar?: AvatarKey } = {};
      if (trimmedName !== user.name) {
        profileUpdates.name = trimmedName;
      }
      if (gender !== user.gender) {
        profileUpdates.gender = gender;
      }
      if (avatar !== user.avatar) {
        profileUpdates.avatar = avatar;
      }

      if (Object.keys(profileUpdates).length > 0) {
        const response = await fetch(`${BACKEND_URL}/profile/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(profileUpdates),
        });

        const raw = await response.text();
        let data: { user?: ProfileUser; error?: string; message?: string; details?: string } = {};
        if (raw) {
          try {
            data = JSON.parse(raw) as typeof data;
          } catch {
            data = { message: raw };
          }
        }

        if (!response.ok) {
          setStatus(
            data.error ||
              data.message ||
              data.details ||
              t("profileEdit.profileSaveFailed")
          );
          return;
        }
      }

      const refreshResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        credentials: "include",
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshData.user) {
        setStatus(t("profileEdit.refreshFailed"));
        return;
      }

      const nextUser = hydrateProfileUser(refreshData.user as ProfileUser);
      setUser(nextUser);
      setStatus("");
      leave(nextUser);
    } catch {
      setStatus(t("profileEdit.connectionError"));
    } finally {
      setIsSaving(false);
    }
  };

  if (loading && !user) {
    return (
      <div className="profile-edit-shell">
        <main className="profile-edit-page">
          <header className="profile-edit-nav">
            <button type="button" className="profile-edit-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>{t("common.back")}</span>
            </button>
          </header>
          <p className="profile-edit-loading">{t("profileEdit.loading")}</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-edit-shell">
        <main className="profile-edit-page">
          <header className="profile-edit-nav">
            <button type="button" className="profile-edit-back-button" onClick={handleBack}>
              <span aria-hidden="true">{"\u2190"}</span>
              <span>{t("common.back")}</span>
            </button>
          </header>
          <p className="profile-edit-loading">{t("profileEdit.unavailable")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className={`profile-edit-shell ${isLeaving ? "is-leaving" : ""}`}>
      <main className="profile-edit-page">
        <header className="profile-edit-nav">
          <button
            type="button"
            className="profile-edit-back-button"
            onClick={handleBack}
            disabled={isSaving}
          >
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="profile-edit-header">
          <p className="profile-edit-eyebrow">{t("profileEdit.title")}</p>
          <h1>{t("profileEdit.heading")}</h1>
          <p>{t("profileEdit.description")}</p>
        </section>

        <form className="profile-edit-form" onSubmit={handleSave}>
          <label className="profile-edit-field" htmlFor="nickname">
            <span className="profile-edit-label">{t("profileEdit.displayName")}</span>
            <input
              className="profile-edit-input"
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={t("profileEdit.displayNamePlaceholder")}
              maxLength={40}
              required
            />
          </label>

          <label className="profile-edit-field" htmlFor="cleanId">
            <span className="profile-edit-label">{t("profileEdit.cleanId")}</span>
            <input
              ref={cleanIdFieldRef}
              className="profile-edit-input"
              id="cleanId"
              type="text"
              value={cleanId}
              onChange={(event) => setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
              placeholder={t("profileEdit.cleanIdPlaceholder")}
              maxLength={20}
              required
            />
          </label>

          <section
            className={`profile-claim-editor profile-claim-editor-${activeShortIdClaim.tier} ${routeState?.focusClaim ? "profile-claim-editor-focus" : ""}`}
            aria-label={t("identityVault.shortClaimEyebrow")}
          >
            <div className="profile-claim-editor-head">
              <strong>{t("identityVault.shortClaimTitle")}</strong>
              <span>{shortClaimRangeLabel}</span>
            </div>
            <div className="profile-claim-editor-body">
              <span className={`profile-short-claim-token profile-short-claim-token-${activeShortIdClaim.tier}`}>
                @{normalizedCleanId || user.cleanId || t("profile.handleFallback")}
              </span>
              <div className="profile-claim-editor-copy">
                <strong>{t("profile.handleLabel", { intent: cleanIdIntent })}</strong>
                <span>{claimDetailText}</span>
              </div>
            </div>
            <div className="profile-claim-editor-foot">
              <span>{t("profile.currentClaimWindowOpen")}</span>
            </div>
          </section>

          <button
            type="button"
            className="profile-edit-gender-trigger"
            onClick={() => setIsGenderDrawerOpen(true)}
            disabled={isSaving}
            aria-label={t("profileEdit.editGender")}
          >
            <span className="profile-edit-gender-trigger-copy">
              <span className="profile-edit-label">{t("profileEdit.gender")}</span>
              <span className="profile-edit-gender-value">{genderLabel}</span>
            </span>
            <span className="profile-edit-gender-icon" aria-hidden="true">
              <GenderLineIcon gender={gender} size={19} />
            </span>
          </button>

          <fieldset className="profile-avatars" aria-label={t("identityVault.avatarLibrary")}>
            <legend>{t("identityVault.avatarLibrary")}</legend>
            <div className="profile-avatar-head">
              <p className="profile-hint">{t("identityVault.avatarLibraryNote")}</p>
            </div>

            <div className="profile-avatar-grid">
              {avatarOptions.map((item) => (
                <label
                  key={item.key}
                  className={`profile-avatar-option ${item.isSelected ? "active" : ""} ${item.isCurrent ? "current" : ""}`}
                >
                  <input
                    type="radio"
                    name="avatar"
                    value={item.key}
                    checked={avatar === item.key}
                    onChange={() => setAvatar(item.key)}
                    disabled={isSaving}
                  />
                  <img
                    className={getAvatarToneClass(item.key)}
                    src={getAvatarUrl(item.key)}
                    alt={item.label}
                  />
                  <span>{item.label}</span>
                  <em>
                    {item.isCurrent
                      ? t("identityVault.currentMark")
                      : t("identityVault.availableNow")}
                  </em>
                </label>
              ))}
            </div>
          </fieldset>

          <p className="profile-edit-caption">
            {t("profileEdit.caption")}
          </p>

          <div className="profile-edit-actions">
            <button
              type="button"
              className="profile-edit-action profile-edit-action-secondary"
              onClick={handleBack}
              disabled={isSaving}
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="profile-edit-action profile-edit-action-primary"
              disabled={isSaving || Boolean(liveCleanIdValidation)}
            >
              {isSaving ? t("profileEdit.saving") : t("profileEdit.saveChanges")}
            </button>
          </div>

          {status && (
            <p className="profile-edit-status" role="status">
              {status}
            </p>
          )}
        </form>
      </main>

      {genderDrawer}
    </div>
  );
};

export default ProfileEditPage;
