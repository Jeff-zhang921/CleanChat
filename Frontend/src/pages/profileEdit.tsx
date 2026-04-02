import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../config";
import { validateShortClaimInput } from "../utils/cleanIdClaim";
import { hydrateProfileUser, type ProfileRouteState, type ProfileUser } from "../utils/profileUser";
import "./profileEdit.css";

const EXIT_MS = 260;

const ProfileEditPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = (location.state as ProfileRouteState | null) ?? null;
  const seededUser = routeState?.user ? hydrateProfileUser(routeState.user) : null;

  const [loading, setLoading] = useState(!seededUser);
  const [user, setUser] = useState<ProfileUser | null>(seededUser);
  const [nickname, setNickname] = useState(seededUser?.name ?? "");
  const [cleanId, setCleanId] = useState(seededUser?.cleanId ?? "");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setNickname(user.name ?? "");
    setCleanId(user.cleanId ?? "");
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
          setStatus("Unable to load profile editing.");
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

  const leave = (nextUser?: ProfileUser | null) => {
    if (isLeaving) return;
    setIsLeaving(true);
    window.setTimeout(() => {
      const nextState: ProfileRouteState = {
        spatialTransition: "pop",
        returnTo: routeState?.returnTo ?? "/profile",
      };
      if (nextUser) {
        nextState.user = nextUser;
      }
      navigate(routeState?.returnTo ?? "/profile", { state: nextState });
    }, EXIT_MS);
  };

  const handleBack = () => {
    if (isSaving) return;
    leave(user);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = nickname.trim();
    const normalizedCleanId = cleanId.trim().toLowerCase();
    if (!trimmedName) {
      setStatus("Display name is required.");
      return;
    }

    if (!normalizedCleanId) {
      setStatus("CleanID is required.");
      return;
    }

    const cleanIdValidation = validateShortClaimInput({
      cleanId: normalizedCleanId,
      currentCleanId: user.cleanId,
      claim: user.shortIdClaim,
    });
    if (cleanIdValidation) {
      setStatus(cleanIdValidation);
      return;
    }

    if (trimmedName === user.name && normalizedCleanId === user.cleanId) {
      leave(user);
      return;
    }

    setIsSaving(true);
    setStatus("Saving changes...");

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
          setStatus(cleanIdData.error || cleanIdData.message || cleanIdData.details || "Failed to save CleanID.");
          return;
        }
      }

      if (trimmedName !== user.name) {
        const response = await fetch(`${BACKEND_URL}/profile/me`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            name: trimmedName,
          }),
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
          setStatus(data.error || data.message || data.details || "Failed to save profile.");
          return;
        }
      }

      const refreshResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        credentials: "include",
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshData.user) {
        setStatus("Profile saved, but failed to refresh profile.");
        return;
      }

      const nextUser = hydrateProfileUser(refreshData.user as ProfileUser);
      setUser(nextUser);
      setStatus("");
      leave(nextUser);
    } catch {
      setStatus("Unable to connect to server.");
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
              <span>Back</span>
            </button>
          </header>
          <p className="profile-edit-loading">Loading edit page...</p>
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
              <span>Back</span>
            </button>
          </header>
          <p className="profile-edit-loading">Profile editing is unavailable right now.</p>
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
            <span>Back</span>
          </button>
        </header>

        <section className="profile-edit-header">
          <p className="profile-edit-eyebrow">Profile Edit</p>
          <h1>Only the visible profile fields are edited here.</h1>
          <p>
            Keep this surface quiet. Edit the name people see and the CleanID they can reach, while identity
            privileges stay elsewhere.
          </p>
        </section>

        <form className="profile-edit-form" onSubmit={handleSave}>
          <label className="profile-edit-field" htmlFor="nickname">
            <span className="profile-edit-label">Display name</span>
            <input
              className="profile-edit-input"
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="Jeff Stone"
              maxLength={40}
              required
            />
          </label>

          <label className="profile-edit-field" htmlFor="cleanId">
            <span className="profile-edit-label">CleanID</span>
            <input
              className="profile-edit-input"
              id="cleanId"
              type="text"
              value={cleanId}
              onChange={(event) => setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))}
              placeholder="jeff_stone"
              maxLength={20}
              required
            />
          </label>

          <p className="profile-edit-caption">
            This page stays free of identity perks on purpose. It only edits the visible account fields.
          </p>

          <div className="profile-edit-actions">
            <button
              type="button"
              className="profile-edit-action profile-edit-action-secondary"
              onClick={handleBack}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="profile-edit-action profile-edit-action-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {status && (
            <p className="profile-edit-status" role="status">
              {status}
            </p>
          )}
        </form>
      </main>
    </div>
  );
};

export default ProfileEditPage;
