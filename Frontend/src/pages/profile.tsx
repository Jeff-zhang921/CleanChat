import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { BACKEND_URL } from "../config";
import "./profile.css";

const CLEAN_ID_REGEX = /^[a-z0-9_]{3,20}$/;

type AvatarKey =
  | "AVATAR_LEO"
  | "AVATAR_SOPHIE"
  | "AVATAR_MAX"
  | "AVATAR_BELLA"
  | "AVATAR_CHARLIE"
  | "AVATAR_AVERY"
  | "AVATAR_RILEY"
  | "AVATAR_JORDAN"
  | "AVATAR_SKYLER"
  | "AVATAR_MORGAN";

type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
};

const AVATAR_OPTIONS: { key: AvatarKey; label: string; url: string }[] = [
  { key: "AVATAR_LEO", label: "Leo", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo" },
  { key: "AVATAR_SOPHIE", label: "Sophie", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie" },
  { key: "AVATAR_MAX", label: "Max", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max" },
  { key: "AVATAR_BELLA", label: "Bella", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella" },
  { key: "AVATAR_CHARLIE", label: "Charlie", url: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie" },
  { key: "AVATAR_AVERY", label: "Avery", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Avery" },
  { key: "AVATAR_RILEY", label: "Riley", url: "https://api.dicebear.com/9.x/lorelei/svg?seed=Riley" },
  { key: "AVATAR_JORDAN", label: "Jordan", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan" },
  { key: "AVATAR_SKYLER", label: "Skyler", url: "https://api.dicebear.com/9.x/lorelei/svg?seed=Skyler" },
  { key: "AVATAR_MORGAN", label: "Morgan", url: "https://api.dicebear.com/9.x/adventurer/svg?seed=Morgan" },
];

const avatarUrl = (avatar: AvatarKey) => {
  const option = AVATAR_OPTIONS.find((item) => item.key === avatar);
  return option?.url ?? "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo";
};

const ProfilePage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<ProfileUser | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [nickname, setNickname] = useState("");
  const [cleanId, setCleanId] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey>("AVATAR_LEO");
  const [status, setStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const normalizedCleanId = useMemo(() => cleanId.trim().toLowerCase(), [cleanId]);

  useEffect(() => {
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
        setUser(data.user);
        setNickname(data.user.name ?? "");
        setCleanId(data.user.cleanId ?? "");
        setAvatar(data.user.avatar ?? "AVATAR_LEO");
      } catch {
        if (isMounted) {
          setStatus("Unable to load profile.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const resetFormToUser = () => {
    if (!user) return;
    setNickname(user.name ?? "");
    setCleanId(user.cleanId ?? "");
    setAvatar(user.avatar ?? "AVATAR_LEO");
  };

  const startEdit = () => {
    resetFormToUser();
    setStatus("");
    setIsEditing(true);
  };

  const cancelEdit = () => {
    resetFormToUser();
    setStatus("");
    setIsEditing(false);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return;

    const trimmedName = nickname.trim();
    if (!trimmedName) {
      setStatus("Nickname is required.");
      return;
    }
    if (!CLEAN_ID_REGEX.test(normalizedCleanId)) {
      setStatus("CleanID must be 3-20 chars: lowercase letters, numbers, underscore.");
      return;
    }

    setIsSaving(true);
    setStatus("Saving profile...");

    try {
      if (normalizedCleanId !== user.cleanId) {
        const cleanIdResponse = await fetch(`${BACKEND_URL}/profile/clean-id`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ cleanId: normalizedCleanId }),
        });
        const cleanIdData = await cleanIdResponse.json().catch(() => ({}));
        if (!cleanIdResponse.ok) {
          setStatus(cleanIdData.error || cleanIdData.message || "Failed to update CleanID.");
          return;
        }
      }

      const nameOrAvatarChanged = trimmedName !== user.name || avatar !== user.avatar;
      if (nameOrAvatarChanged) {
        const profileResponse = await fetch(`${BACKEND_URL}/profile/me`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name: trimmedName,
            avatar,
          }),
        });
        const profileData = await profileResponse.json().catch(() => ({}));
        if (!profileResponse.ok) {
          setStatus(profileData.error || profileData.message || "Failed to update profile.");
          return;
        }
      }

      const refreshResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        credentials: "include",
      });
      const refreshData = await refreshResponse.json().catch(() => ({}));
      if (!refreshResponse.ok || !refreshData.user) {
        setStatus("Profile saved, but failed to refresh profile.");
        setIsEditing(false);
        return;
      }

      setUser(refreshData.user as ProfileUser);
      setNickname(refreshData.user.name ?? "");
      setCleanId(refreshData.user.cleanId ?? "");
      setAvatar(refreshData.user.avatar ?? "AVATAR_LEO");
      setStatus("Profile updated.");
      setIsEditing(false);
    } catch {
      setStatus("Unable to connect to server.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleBackToLogin = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await fetch(`${BACKEND_URL}/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      navigate("/login", { replace: true });
      setIsLoggingOut(false);
    }
  };

  if (loading) {
    return (
      <div className="profile-shell">
        <main className="profile-card">
          <p className="profile-loading">Loading profile...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-shell">
        <main className="profile-card">
          <p className="profile-loading">Profile not found.</p>
        </main>
      </div>
    );
  }

  const activeAvatar = isEditing ? avatar : user.avatar;
  const activeName = isEditing ? nickname : user.name;
  const activeCleanId = isEditing ? cleanId : user.cleanId;

  return (
    <div className="profile-shell">
      <main className="profile-card">
        <header className="profile-header">
          <div>
            <p className="profile-step">Your Account</p>
            <h1 className="profile-title">Profile</h1>
          </div>
          <button
            type="button"
            className="profile-link-btn"
            onClick={handleBackToLogin}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? "Logging out..." : "Back to Login"}
          </button>
        </header>

        <section className="profile-summary">
          <img
            className="profile-avatar-main"
            src={avatarUrl(activeAvatar)}
            alt={`${activeName || "User"} avatar`}
          />
          <div className="profile-summary-text">
            <h2>{activeName}</h2>
            <p>@{activeCleanId}</p>
            <span>{user.email}</span>
          </div>
        </section>

        {!isEditing && (
          <button type="button" className="profile-primary-btn" onClick={startEdit}>
            Edit Profile
          </button>
        )}

        {isEditing && (
          <form className="profile-form" onSubmit={handleSave}>
            <fieldset className="profile-avatars">
              <legend>Avatar</legend>
              <div className="profile-avatar-grid">
                {AVATAR_OPTIONS.map((item) => (
                  <label
                    key={item.key}
                    className={`profile-avatar-option ${avatar === item.key ? "active" : ""}`}
                  >
                    <input
                      type="radio"
                      name="avatar"
                      value={item.key}
                      checked={avatar === item.key}
                      onChange={() => setAvatar(item.key)}
                    />
                    <img
                      src={item.url}
                      alt={item.label}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="profile-label" htmlFor="nickname">
              Nickname
            </label>
            <input
              className="profile-input"
              id="nickname"
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              maxLength={40}
              required
            />

            <label className="profile-label" htmlFor="cleanId">
              CleanID
            </label>
            <input
              className="profile-input"
              id="cleanId"
              type="text"
              value={cleanId}
              onChange={(event) =>
                setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))
              }
              maxLength={20}
              required
            />
            <p className="profile-hint">
              Use 3-20 characters: lowercase letters, numbers, underscore.
            </p>

            <div className="profile-actions">
              <button
                type="button"
                className="profile-secondary-btn"
                onClick={cancelEdit}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button type="submit" className="profile-primary-btn" disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        )}

        {status && (
          <p className="profile-status" role="status">
            {status}
          </p>
        )}
      </main>
      <BottomNav />
    </div>
  );
};

export default ProfilePage;
