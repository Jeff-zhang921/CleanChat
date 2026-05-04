import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import GenderLineIcon from "../components/GenderLineIcon";
import GenderPicker from "../components/GenderPicker";
import {
  getAvatarOption,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import {
  FALLBACK_SHORT_ID_CLAIM,
  validateShortClaimInput,
} from "../utils/cleanIdClaim";
import { GENDER_ARIA_KEY_MAP, type GenderValue } from "../utils/gender";
import {
  hydrateProfileUser,
  type ProfileEditDraft,
  type ProfileRouteState,
  type ProfileUser,
} from "../utils/profileUser";
import {
  getRegionCitiesForCountry,
  getRegionCountries,
  mergeSelectOptions,
} from "../utils/region";
import "./profile.css";
import "./profileEdit.css";

const EXIT_MS = 260;

const ProfileEditPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;
  const seededDraft = routeState?.editDraft ?? null;

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [nickname, setNickname] = useState(seededDraft?.name ?? seededUser?.name ?? "");
  const [cleanId, setCleanId] = useState(seededDraft?.cleanId ?? seededUser?.cleanId ?? "");
  const [avatar, setAvatar] = useState<AvatarKey>(
    seededDraft?.avatar ?? routeState?.selectedAvatar ?? seededUser?.avatar ?? "AVATAR_LEO"
  );
  const [gender, setGender] = useState<GenderValue>(seededDraft?.gender ?? seededUser?.gender ?? "hidden");
  const [country, setCountry] = useState(seededDraft?.country ?? seededUser?.country ?? "");
  const [city, setCity] = useState(seededDraft?.city ?? seededUser?.city ?? "");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [isGenderDrawerOpen, setIsGenderDrawerOpen] = useState<boolean>(() => false);
  const [isRegionDrawerOpen, setIsRegionDrawerOpen] = useState<boolean>(() => false);
  const [regionStep, setRegionStep] = useState<"country" | "city">("country");
  const genderLabel = t(GENDER_ARIA_KEY_MAP[gender]);
  const cleanIdFieldRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!user) return;
    setNickname(routeState?.editDraft?.name ?? user.name ?? "");
    setCleanId(routeState?.editDraft?.cleanId ?? user.cleanId ?? "");
    setAvatar(routeState?.editDraft?.avatar ?? routeState?.selectedAvatar ?? user.avatar ?? "AVATAR_LEO");
    setGender(routeState?.editDraft?.gender ?? user.gender);
    const nextCountry = routeState?.editDraft?.country ?? user.country ?? "";
    const nextCity = routeState?.editDraft?.city ?? user.city ?? "";
    setCountry(nextCountry);
    setCity(nextCountry ? nextCity : "");
  }, [
    routeState?.editDraft?.avatar,
    routeState?.editDraft?.cleanId,
    routeState?.editDraft?.country,
    routeState?.editDraft?.city,
    routeState?.editDraft?.gender,
    routeState?.editDraft?.name,
    routeState?.selectedAvatar,
    user,
  ]);

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
    if (isRegionDrawerOpen) {
      setIsRegionDrawerOpen(false);
      return;
    }
    if (isSaving) return;
    leave(user);
  };

  useEffect(() => {
    if (!isGenderDrawerOpen && !isRegionDrawerOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsGenderDrawerOpen(false);
        setIsRegionDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isGenderDrawerOpen, isRegionDrawerOpen]);

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

  const selectedAvatarOption = getAvatarOption(avatar);
  const normalizedCountry = country.trim();
  const normalizedCity = city.trim();
  const countryOptions = useMemo(
    () => mergeSelectOptions(country, getRegionCountries()),
    [country],
  );
  const cityOptions = useMemo(
    () =>
      normalizedCountry
        ? mergeSelectOptions(city, getRegionCitiesForCountry(normalizedCountry))
        : [],
    [city, normalizedCountry],
  );
  const regionValue = normalizedCountry
    ? normalizedCity
      ? `${normalizedCountry}, ${normalizedCity}`
      : normalizedCountry
    : t("profileEdit.regionPlaceholder");
  const regionAriaLabel = `${t("profileEdit.editRegion")}: ${regionValue}`;

  const openRegionDrawer = () => {
    setRegionStep(normalizedCountry ? "city" : "country");
    setIsRegionDrawerOpen(true);
  };

  const handleRegionCountrySelect = (nextCountry: string) => {
    setCountry(nextCountry);
    const allowedCities = getRegionCitiesForCountry(nextCountry);
    if (!nextCountry || !allowedCities.includes(city.trim())) {
      setCity("");
    }
    setRegionStep("city");
  };

  const handleRegionCitySelect = (nextCity: string) => {
    setCity(nextCity);
    setIsRegionDrawerOpen(false);
  };

  const clearRegion = () => {
    setCountry("");
    setCity("");
    setRegionStep("country");
    setIsRegionDrawerOpen(false);
  };

  const openAvatarPage = () => {
    if (!user) return;
    setStatus("");
    const editDraft: ProfileEditDraft = {
      name: nickname,
      cleanId,
      avatar,
      gender,
      country,
      city,
    };
    navigate("/profile/avatar", {
      state: {
        user,
        editDraft,
        selectedAvatar: avatar,
        spatialTransition: "push",
        returnTo: backTarget,
        avatarPickerReturnTo: "/profile/edit",
      } satisfies ProfileRouteState,
    });
  };

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

  const regionDrawer =
    isRegionDrawerOpen && typeof document !== "undefined"
      ? createPortal(
          <div className="profile-edit-region-drawer-layer is-open" aria-hidden={false}>
            <button
              type="button"
              className="profile-edit-region-drawer-backdrop"
              onClick={() => setIsRegionDrawerOpen(false)}
              tabIndex={0}
              aria-label={t("common.close")}
            />
            <aside
              className="profile-edit-region-drawer"
              role="dialog"
              aria-modal="true"
              aria-label={t("profileEdit.editRegion")}
            >
              <header className="profile-edit-region-drawer-head">
                <p className="profile-edit-eyebrow">{t("profileEdit.editRegion")}</p>
                <h2>{t("profileEdit.region")}</h2>
                <span className="profile-edit-region-current">{regionValue}</span>
              </header>

              <div className="profile-edit-region-tabs" role="tablist" aria-label={t("profileEdit.region")}>
                <button
                  type="button"
                  className={`profile-edit-region-tab ${regionStep === "country" ? "is-active" : ""}`}
                  onClick={() => setRegionStep("country")}
                  role="tab"
                  aria-selected={regionStep === "country"}
                >
                  {t("profileEdit.country")}
                </button>
                <button
                  type="button"
                  className={`profile-edit-region-tab ${regionStep === "city" ? "is-active" : ""}`}
                  onClick={() => normalizedCountry && setRegionStep("city")}
                  disabled={!normalizedCountry}
                  role="tab"
                  aria-selected={regionStep === "city"}
                >
                  {t("profileEdit.city")}
                </button>
              </div>

              <div className="profile-edit-region-panel">
                {regionStep === "country" ? (
                  <div className="profile-edit-region-grid" role="listbox" aria-label={t("profileEdit.country")}>
                    {countryOptions.map((option) => {
                      const isSelected = option === normalizedCountry;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`profile-edit-region-option ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleRegionCountrySelect(option)}
                          disabled={isSaving}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : cityOptions.length > 0 ? (
                  <div className="profile-edit-region-grid" role="listbox" aria-label={t("profileEdit.city")}>
                    {cityOptions.map((option) => {
                      const isSelected = option === normalizedCity;
                      return (
                        <button
                          key={option}
                          type="button"
                          className={`profile-edit-region-option ${isSelected ? "is-selected" : ""}`}
                          onClick={() => handleRegionCitySelect(option)}
                          disabled={isSaving}
                          role="option"
                          aria-selected={isSelected}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="profile-edit-region-empty">{t("profileEdit.cityPlaceholderDisabled")}</p>
                )}
              </div>

              <div className="profile-edit-region-actions">
                <button
                  type="button"
                  className="profile-edit-action profile-edit-action-secondary"
                  onClick={clearRegion}
                  disabled={isSaving || (!normalizedCountry && !normalizedCity)}
                >
                  {t("profileEdit.clearRegion")}
                </button>
                <button
                  type="button"
                  className="profile-edit-action profile-edit-action-primary"
                  onClick={() => setIsRegionDrawerOpen(false)}
                  disabled={isSaving}
                >
                  {t("common.close")}
                </button>
              </div>
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
      avatar === user.avatar &&
      country.trim() === (user.country?.trim() || "") &&
      city.trim() === (user.city?.trim() || "")
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

      const profileUpdates: {
        name?: string;
        gender?: GenderValue;
        avatar?: AvatarKey;
        country?: string | null;
        city?: string | null;
      } = {};
      if (trimmedName !== user.name) {
        profileUpdates.name = trimmedName;
      }
      if (gender !== user.gender) {
        profileUpdates.gender = gender;
      }
      if (avatar !== user.avatar) {
        profileUpdates.avatar = avatar;
      }

      const normalizedCountry = country.trim();
      const normalizedCity = city.trim();
      const currentCountry = user.country?.trim() || "";
      const currentCity = user.city?.trim() || "";

      if (normalizedCountry !== currentCountry) {
        if (!normalizedCountry) {
          profileUpdates.country = null;
          profileUpdates.city = null;
        } else {
          profileUpdates.country = normalizedCountry;
        }
      }

      if (normalizedCountry && normalizedCity !== currentCity) {
        profileUpdates.city = normalizedCity ? normalizedCity : null;
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

          <button
            type="button"
            className={`profile-edit-region-trigger ${normalizedCountry ? "has-value" : ""}`}
            onClick={openRegionDrawer}
            disabled={isSaving}
            aria-label={regionAriaLabel}
          >
            <span className="profile-edit-region-trigger-copy">
              <span className="profile-edit-label">{t("profileEdit.region")}</span>
              <span className="profile-edit-region-value">{regionValue}</span>
            </span>
            <span className="profile-edit-region-chevron" aria-hidden="true">
              {"\u2192"}
            </span>
          </button>

          <section className="profile-avatars" aria-label={t("identityVault.avatarLibrary")}>
            <div className="profile-avatar-head">
              <p className="profile-hint">{t("identityVault.avatarLibraryNote")}</p>
            </div>
            <button
              type="button"
              className="profile-avatar-picker-trigger"
              onClick={openAvatarPage}
              disabled={isSaving}
            >
              <span className="profile-avatar-picker-trigger-copy">
                <span className="profile-edit-label">{t("identityVault.avatarLibrary")}</span>
                <strong>{selectedAvatarOption.label}</strong>
              </span>
              <span className="profile-avatar-picker-trigger-action">
                {t("identityVault.avatarPickerAction")}
              </span>
            </button>
          </section>

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
      {regionDrawer}
    </div>
  );
};

export default ProfileEditPage;
