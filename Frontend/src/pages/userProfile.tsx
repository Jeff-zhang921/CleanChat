import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import GenderLineIcon from "../components/GenderLineIcon";
import {
  DEFAULT_AVATAR_KEY,
  getAvatarToneClass,
  getAvatarUrl,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { GENDER_ARIA_KEY_MAP, normalizeGender } from "../utils/gender";
import "./userProfile.css";

type OverlayFromPath = "/conversations" | "/groups" | "/profile";

type ProfileUserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: string | null;
};

type RequestDirection = "incoming" | "outgoing";
type RequestStatus = "pending" | "accepted" | "rejected";

type DirectRequestSnapshot = {
  id: number;
  requesterId: number;
  recipientId: number;
  note: string;
  status: RequestStatus;
  acceptedThreadId: number | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  direction: RequestDirection;
};

type RelationshipSnapshot = {
  existingThreadId: number | null;
  canDirectMessage: boolean;
  accepted: boolean;
  blockedByMe?: boolean;
  blockedMe?: boolean;
  latestRequest: DirectRequestSnapshot | null;
};

type UserProfileResponse = {
  user: ProfileUserSummary;
  relationship: RelationshipSnapshot;
};

type UserProfileLocationState = {
  fromPath?: OverlayFromPath;
  user?: ProfileUserSummary;
} | null;

const parsePositiveInt = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const parseRouteUserId = (pathname: string) => {
  const matched = pathname.match(/^\/profile\/user\/(\d+)$/);
  return parsePositiveInt(matched?.[1]);
};

const resolveFromPath = (raw: unknown): OverlayFromPath => {
  if (raw === "/groups") return "/groups";
  if (raw === "/profile") return "/profile";
  return "/conversations";
};

const toChatFromPath = (fromPath: OverlayFromPath): "/conversations" | "/groups" =>
  fromPath === "/groups" ? "/groups" : "/conversations";

const UserProfilePage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as UserProfileLocationState) ?? null;
  const fromPath = resolveFromPath(locationState?.fromPath);
  const routeUserId = parseRouteUserId(location.pathname);

  const seededUser =
    locationState?.user && routeUserId && locationState.user.id === routeUserId
      ? locationState.user
      : null;

  const [user, setUser] = useState<ProfileUserSummary | null>(seededUser);
  const [relationship, setRelationship] = useState<RelationshipSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  useEffect(() => {
    if (!routeUserId) {
      setStatus(t("userProfile.unavailable"));
      setLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch(
          `${BACKEND_URL}/chat/requests/direct/target/${routeUserId}`,
          {
            credentials: "include",
          },
        );
        const data = (await response.json().catch(() => ({}))) as
          | UserProfileResponse
          | { message?: string; error?: string };

        if (!response.ok || !("user" in data) || !("relationship" in data)) {
          if (isMounted) {
            setStatus(
              ("message" in data && data.message) ||
                ("error" in data && data.error) ||
                t("userProfile.loadFailed"),
            );
          }
          return;
        }

        if (!isMounted) {
          return;
        }

        setUser(data.user);
        setRelationship(data.relationship);
        setStatus("");
      } catch {
        if (isMounted) {
          setStatus(t("userProfile.loadFailed"));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [routeUserId, t]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    if (fromPath === "/groups") {
      navigate("/groups", { replace: true });
      return;
    }

    if (fromPath === "/profile") {
      navigate("/profile", { replace: true });
      return;
    }

    navigate("/conversations", { replace: true });
  };

  const handleOpenChat = async () => {
    if (!user || !relationship) {
      return;
    }

    const jumpToChat = (threadId: number) => {
      navigate("/chat", {
        state: {
          threadId,
          other: user.name || user.cleanId,
          avatarUrl: getAvatarUrl(user.avatar),
          avatarKey: user.avatar,
          fromPath: toChatFromPath(fromPath),
        },
      });
    };

    if (typeof relationship.existingThreadId === "number") {
      jumpToChat(relationship.existingThreadId);
      return;
    }

    setIsOpeningChat(true);
    try {
      const response = await fetch(`${BACKEND_URL}/chat/threads`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ targetUserId: user.id }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        thread?: { id?: number };
        message?: string;
        error?: string;
      };

      if (!response.ok || typeof data.thread?.id !== "number") {
        setStatus(data.message || data.error || t("userProfile.openChatFailed"));
        return;
      }

      jumpToChat(data.thread.id);
    } catch {
      setStatus(t("userProfile.openChatFailed"));
    } finally {
      setIsOpeningChat(false);
    }
  };

  const handleRequestChat = () => {
    if (!user) {
      return;
    }

    navigate(`/profile/request-chat?targetUserId=${user.id}`, {
      state: {
        fromPath,
        user,
      },
    });
  };

  const resolvedAvatar = user?.avatar ?? DEFAULT_AVATAR_KEY;
  const resolvedGender = normalizeGender(user?.gender);
  const displayName = user?.name?.trim() || user?.cleanId || t("common.user");
  const relationshipRequest = relationship?.latestRequest ?? null;
  const canOpenChat = Boolean(relationship?.canDirectMessage || relationship?.existingThreadId);
  const isBlocked = Boolean(relationship?.blockedByMe || relationship?.blockedMe);

  return (
    <div className="user-profile-shell">
      <main className="user-profile-page">
        <header className="user-profile-nav">
          <button type="button" className="user-profile-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="user-profile-header">
          <p className="user-profile-eyebrow">{t("userProfile.title")}</p>
          <h1>{displayName}</h1>
          <p>{t("userProfile.subtitle")}</p>
        </section>

        {loading ? (
          <p className="user-profile-status">{t("common.loading")}</p>
        ) : !user ? (
          <p className="user-profile-status">{status || t("userProfile.unavailable")}</p>
        ) : (
          <>
            <section className="user-profile-card">
              <div className="user-profile-avatar-wrap">
                <img
                  className={getAvatarToneClass(resolvedAvatar)}
                  src={getAvatarUrl(resolvedAvatar)}
                  alt={`${displayName} ${t("common.avatar")}`}
                />
              </div>
              <div className="user-profile-copy">
                <strong>{displayName}</strong>
                <span>@{user.cleanId}</span>
                <span>{user.email}</span>
              </div>
              <span
                className="user-profile-gender"
                role="img"
                aria-label={t(GENDER_ARIA_KEY_MAP[resolvedGender])}
              >
                <GenderLineIcon gender={resolvedGender} size={19} />
              </span>
            </section>

            {relationshipRequest && (
              <section className="user-profile-note">
                <h2>{t("userProfile.latestVerification")}</h2>
                <p>{relationshipRequest.note}</p>
              </section>
            )}

            {isBlocked && (
              <p className="user-profile-status user-profile-status-warn">
                {relationship?.blockedMe
                  ? t("userProfile.blockedByPeer")
                  : t("userProfile.blockingHint")}
              </p>
            )}

            <section className="user-profile-actions">
              {canOpenChat && (
                <button
                  type="button"
                  className="user-profile-action user-profile-action-secondary"
                  onClick={() => void handleOpenChat()}
                  disabled={isOpeningChat}
                >
                  {isOpeningChat ? t("conversations.opening") : t("userProfile.openChat")}
                </button>
              )}
              <button
                type="button"
                className="user-profile-action user-profile-action-primary"
                onClick={handleRequestChat}
                disabled={isBlocked}
              >
                {t("userProfile.requestToChat")}
              </button>
            </section>
          </>
        )}

        {status && !loading && user && (
          <p className="user-profile-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default UserProfilePage;
