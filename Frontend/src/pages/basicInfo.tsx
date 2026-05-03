import { FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAvatarOptions,
  getAvatarToneClass,
  type AvatarKey,
} from "../constants/avatarCatalog";
import GenderPicker from "../components/GenderPicker";
import { BACKEND_URL } from "../config";
import { normalizeGender, type GenderValue } from "../utils/gender";
import "./basicInfo.css";

const CLEAN_ID_REGEX = /^[a-z0-9_]{1,20}$/;

type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: GenderValue | string;
};

const BasicInfoPage = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [cleanId, setCleanId] = useState("");
  const [avatar, setAvatar] = useState<AvatarKey>("AVATAR_LEO");
  const [gender, setGender] = useState<GenderValue>("hidden");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [user, setUser] = useState<ProfileUser | null>(null);

  const normalizedCleanId = useMemo(
    () => cleanId.trim().toLowerCase(),
    [cleanId]
  );
  const avatarOptions = getAvatarOptions();

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
        const user = data.user;
        if (!isMounted || !user) return;

        setUser(user);
        setEmail(user.email ?? "");
        setNickname(user.name ?? "");
        setCleanId(user.cleanId ?? "");
        setAvatar(user.avatar ?? "AVATAR_LEO");
        setGender(normalizeGender(user.gender));
      } catch {
        if (isMounted) {
          setStatus("Unable to load profile.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      isMounted = false;
    };
  }, [navigate]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = nickname.trim();

    if (!trimmedName) {
      setStatus("Nickname is required.");
      return;
    }
    if (!CLEAN_ID_REGEX.test(normalizedCleanId)) {
      setStatus("CleanID must be 1-20 characters: a-z, 0-9, or _.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Saving profile...");

    try {
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
      let cleanIdData: Record<string, string> = {};
      if (cleanIdRaw) {
        try {
          cleanIdData = JSON.parse(cleanIdRaw) as Record<string, string>;
        } catch {
          cleanIdData = {};
        }
      }
      if (!cleanIdResponse.ok) {
        setStatus(
          cleanIdData.error ||
            cleanIdData.message ||
            cleanIdData.details ||
            cleanIdRaw ||
            "Failed to update CleanID."
        );
        return;
      }

      const profileResponse = await fetch(`${BACKEND_URL}/profile/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: trimmedName,
          avatar,
          gender,
        }),
      });

      const profileRaw = await profileResponse.text();
      let profileData: Record<string, string> = {};
      if (profileRaw) {
        try {
          profileData = JSON.parse(profileRaw) as Record<string, string>;
        } catch {
          profileData = {};
        }
      }
      if (!profileResponse.ok) {
        setStatus(
          profileData.error ||
            profileData.message ||
            profileData.details ||
            profileRaw ||
            "Failed to update profile."
        );
        return;
      }

      setStatus("");
      navigate("/conversations", { replace: true });
    } catch {
      setStatus("Unable to connect to server.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="basic-shell">
        <main className="basic-card">
          <p className="basic-loading">Loading profile...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="basic-shell">
      <main className="basic-card">
        <p className="basic-step">Set Up Profile</p>
        <h1 className="basic-title">Welcome to CleanChat</h1>
        <p className="basic-copy">
          Complete your profile so people can recognize you.
        </p>
        <p className="basic-email">{email}</p>

        <form className="basic-form" onSubmit={handleSubmit}>
          <fieldset className="basic-avatars">
            <legend>Choose an avatar</legend>
            <p className="basic-hint">
              Every avatar is available from the start.
            </p>
            <div className="basic-avatar-grid">
              {avatarOptions.map((item) => (
                <label
                  key={item.key}
                  className={`basic-avatar-option ${avatar === item.key ? "active" : ""}`}
                >
                  <input
                    type="radio"
                    name="avatar"
                    value={item.key}
                    checked={avatar === item.key}
                    onChange={() => setAvatar(item.key)}
                  />
                  <img
                    className={getAvatarToneClass(item.key)}
                    src={item.url}
                    alt={item.label}
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <section className="basic-gender-row">
            <GenderPicker value={gender} onChange={setGender} />
          </section>

          <label className="basic-label" htmlFor="nickname">
            Nickname
          </label>
          <input
            className="basic-input"
            id="nickname"
            type="text"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Your nickname"
            maxLength={40}
            required
          />

          <label className="basic-label" htmlFor="cleanId">
            CleanID
          </label>
          <input
            className="basic-input"
            id="cleanId"
            type="text"
            value={cleanId}
            onChange={(event) =>
              setCleanId(event.target.value.toLowerCase().replace(/\s+/g, "_"))
            }
            placeholder="my_clean_id"
            maxLength={20}
            required
          />
          <p className="basic-hint">Use 1-20 lowercase letters, numbers, or underscore.</p>

          <button className="basic-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : "Save and Continue"}
          </button>
        </form>

        {status && (
          <p className="basic-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default BasicInfoPage;
