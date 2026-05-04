import { useEffect, useMemo, useState } from "react";
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
import { GENDER_ARIA_KEY_MAP, normalizeGender, type GenderValue } from "../utils/gender";
import { dispatchConversationDeleted } from "../utils/conversationEvents";
import { formatRegion } from "../utils/region";
import {
  getThreadMuteKey,
  persistConversationMutes,
  readConversationMutes,
  setConversationMuted,
} from "../utils/conversationMutes";
import "./chatSettings.css";

type ChatSettingsLocationState = {
  threadId?: number;
  other?: string;
  avatarUrl?: string;
  avatarKey?: AvatarKey;
  fromPath?: "/conversations" | "/groups";
} | null;

type ChatSettingsResponse = {
  threadId: number;
  otherUser: {
    id: number;
    name: string | null;
    cleanId: string;
    avatar: AvatarKey;
    gender?: string | null;
    country?: string | null;
    city?: string | null;
  };
  blockedByMe: boolean;
  blockedMe: boolean;
  mutedByMe?: boolean;
};

const parsePositiveInt = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const ChatSettingsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as ChatSettingsLocationState) ?? null;
  const search = new URLSearchParams(location.search);
  const threadId =
    (typeof locationState?.threadId === "number" && locationState.threadId > 0
      ? locationState.threadId
      : null) ?? parsePositiveInt(search.get("threadId"));
  const fallbackFromPath = locationState?.fromPath === "/groups" ? "/groups" : "/conversations";

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [otherUser, setOtherUser] = useState<ChatSettingsResponse["otherUser"] | null>(null);
  const [blockedByMe, setBlockedByMe] = useState(false);
  const [blockedMe, setBlockedMe] = useState(false);
  const [isUpdatingBlock, setIsUpdatingBlock] = useState(false);
  const [mutedByMe, setMutedByMe] = useState(false);
  const [isUpdatingMute, setIsUpdatingMute] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    if (!threadId) {
      setLoading(false);
      setStatus(t("chatSettings.unavailable"));
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      setLoading(true);
      try {
        const response = await fetch(`${BACKEND_URL}/chat/threads/${threadId}/settings`, {
          credentials: "include",
        });
        const data = (await response.json().catch(() => ({}))) as Partial<ChatSettingsResponse> & {
          message?: string;
          error?: string;
        };

        if (!response.ok || !data.otherUser) {
          if (isMounted) {
            setStatus(data.message || data.error || t("chatSettings.loadFailed"));
          }
          return;
        }

        if (!isMounted) {
          return;
        }

        setOtherUser(data.otherUser);
        setBlockedByMe(Boolean(data.blockedByMe));
        setBlockedMe(Boolean(data.blockedMe));
        const muted = Boolean(data.mutedByMe);
        setMutedByMe(muted);
        const muteKey = getThreadMuteKey(threadId);
        const nextMutes = setConversationMuted(readConversationMutes(), muteKey, muted);
        persistConversationMutes(nextMutes);
        setStatus("");
      } catch {
        if (isMounted) {
          setStatus(t("chatSettings.loadFailed"));
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, [threadId, t]);

  const resolvedGender: GenderValue = normalizeGender(otherUser?.gender);
  const regionLabel = formatRegion(otherUser?.country, otherUser?.city);
  const displayName =
    (otherUser?.name && otherUser.name.trim()) ||
    otherUser?.cleanId ||
    locationState?.other ||
    t("common.user");
  const avatarKey = otherUser?.avatar || locationState?.avatarKey || DEFAULT_AVATAR_KEY;
  const avatarUrl = locationState?.avatarUrl || getAvatarUrl(avatarKey);
  const avatarClassName = useMemo(() => getAvatarToneClass(avatarKey), [avatarKey]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/chat", {
      replace: true,
      state: {
        threadId: threadId ?? undefined,
        other: displayName,
        avatarUrl,
        avatarKey,
        fromPath: fallbackFromPath,
      },
    });
  };

  const handleToggleBlock = async () => {
    if (!threadId || isUpdatingBlock || loading) {
      return;
    }

    const nextBlocked = !blockedByMe;
    setIsUpdatingBlock(true);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/threads/${threadId}/block`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ blocked: nextBlocked }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        blockedByMe?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("chatSettings.blockUpdateFailed"));
        return;
      }

      const applied = typeof data.blockedByMe === "boolean" ? data.blockedByMe : nextBlocked;
      setBlockedByMe(applied);
      setStatus(applied ? t("chatSettings.blockedNow") : t("chatSettings.unblockedNow"));
    } catch {
      setStatus(t("chatSettings.blockUpdateFailed"));
    } finally {
      setIsUpdatingBlock(false);
    }
  };

  const handleToggleMute = async () => {
    if (!threadId || isUpdatingMute || loading) {
      return;
    }

    const nextMuted = !mutedByMe;
    setIsUpdatingMute(true);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/threads/${threadId}/mute`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ muted: nextMuted }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        mutedByMe?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("chatSettings.muteUpdateFailed"));
        return;
      }

      const applied = typeof data.mutedByMe === "boolean" ? data.mutedByMe : nextMuted;
      setMutedByMe(applied);

      const muteKey = getThreadMuteKey(threadId);
      const nextMutes = setConversationMuted(readConversationMutes(), muteKey, applied);
      persistConversationMutes(nextMutes);

      setStatus(applied ? t("chatSettings.mutedNow") : t("chatSettings.unmutedNow"));
    } catch {
      setStatus(t("chatSettings.muteUpdateFailed"));
    } finally {
      setIsUpdatingMute(false);
    }
  };

  const handleDeleteThread = async () => {
    if (!threadId || isDeleting) {
      return;
    }

    setIsDeleting(true);
    setStatus("");

    try {
      const deleteUrl = BACKEND_URL.endsWith("/api")
        ? `${BACKEND_URL}/conversations/${threadId}`
        : `${BACKEND_URL}/api/conversations/${threadId}`;

      const response = await fetch(deleteUrl, {
        method: "DELETE",
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("chatSettings.deleteFailed"));
        setIsDeleting(false);
        return;
      }

      dispatchConversationDeleted({
        threadId,
        toast: t("chatSettings.deletedToast"),
      });
      setShowDeleteConfirm(false);
      navigate("/conversations", { replace: true });
    } catch {
      setStatus(t("chatSettings.deleteFailed"));
      setIsDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="chat-settings-shell">
        <main className="chat-settings-page">
          <button type="button" className="chat-settings-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="chat-settings-status">{t("chatSettings.loading")}</p>
        </main>
      </div>
    );
  }

  if (!threadId || !otherUser) {
    return (
      <div className="chat-settings-shell">
        <main className="chat-settings-page">
          <button type="button" className="chat-settings-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="chat-settings-status">{status || t("chatSettings.unavailable")}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="chat-settings-shell">
      <main className="chat-settings-page">
        <button type="button" className="chat-settings-back" onClick={handleBack}>
          <span aria-hidden="true">{"\u2190"}</span>
          <span>{t("common.back")}</span>
        </button>

        <header className="chat-settings-header">
          <p className="chat-settings-eyebrow">{t("chatSettings.title")}</p>
          <h1>{displayName}</h1>
          <p>{t("chatSettings.subtitle")}</p>
        </header>

        <section className="chat-settings-peer-card">
          <span className="chat-settings-avatar">
            <img className={avatarClassName} src={avatarUrl} alt={`${displayName} ${t("common.avatar")}`} />
          </span>
          <div className="chat-settings-peer-copy">
            <strong>{displayName}</strong>
            <span>@{otherUser.cleanId}</span>
          </div>
          <div className="chat-settings-peer-meta">
            {regionLabel && <span className="chat-settings-peer-region">{regionLabel}</span>}
            <span className="chat-settings-peer-gender" role="img" aria-label={t(GENDER_ARIA_KEY_MAP[resolvedGender])}>
              <GenderLineIcon gender={resolvedGender} size={18} />
            </span>
          </div>
        </section>

        <section className="chat-settings-card">
          <div className="chat-settings-row">
            <div className="chat-settings-row-copy">
              <h2>{t("chatSettings.muteNotifications")}</h2>
              <p>{t("chatSettings.muteHint")}</p>
            </div>
            <button
              type="button"
              className={`chat-settings-toggle ${mutedByMe ? "is-on" : ""}`}
              role="switch"
              aria-checked={mutedByMe}
              aria-label={t("chatSettings.muteNotifications")}
              onClick={handleToggleMute}
              disabled={isUpdatingBlock || isUpdatingMute || isDeleting}
            >
              <span className="chat-settings-toggle-thumb" />
            </button>
          </div>

          <div className="chat-settings-row chat-settings-row-divider">
            <div className="chat-settings-row-copy">
              <h2>{blockedByMe ? t("chatSettings.unblockUser") : t("chatSettings.blockUser")}</h2>
              <p>{t("chatSettings.blockHint")}</p>
              {blockedMe && <p className="chat-settings-note">{t("chatSettings.blockedByPeer")}</p>}
            </div>
            <button
              type="button"
              className={`chat-settings-toggle ${blockedByMe ? "is-on" : ""}`}
              role="switch"
              aria-checked={blockedByMe}
              aria-label={blockedByMe ? t("chatSettings.unblockUser") : t("chatSettings.blockUser")}
              onClick={handleToggleBlock}
              disabled={isUpdatingBlock || isUpdatingMute || isDeleting}
            >
              <span className="chat-settings-toggle-thumb" />
            </button>
          </div>
        </section>

        <section className="chat-settings-card chat-settings-card-danger">
          <div className="chat-settings-row-copy">
            <h2>{t("chatSettings.deleteChat")}</h2>
            <p>{t("chatSettings.deleteHint")}</p>
          </div>
          <button
            type="button"
            className="chat-settings-danger-action"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={isDeleting}
          >
            {isDeleting ? t("chatSettings.deleting") : t("chatSettings.deleteChat")}
          </button>
        </section>

        {status && (
          <p className="chat-settings-status" role="status">
            {status}
          </p>
        )}
      </main>

      {showDeleteConfirm && (
        <div className="chat-settings-confirm-layer" role="presentation">
          <button
            type="button"
            className="chat-settings-confirm-backdrop"
            aria-label={t("common.close")}
            onClick={() => setShowDeleteConfirm(false)}
          />
          <section className="chat-settings-confirm-dialog" role="dialog" aria-modal="true">
            <h2>{t("chatSettings.deleteConfirmTitle")}</h2>
            <p>{t("chatSettings.deleteConfirmBody")}</p>
            <div className="chat-settings-confirm-actions">
              <button
                type="button"
                className="chat-settings-confirm-cancel"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="chat-settings-confirm-delete"
                onClick={handleDeleteThread}
                disabled={isDeleting}
              >
                {isDeleting ? t("chatSettings.deleting") : t("chatSettings.deleteConfirmAction")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default ChatSettingsPage;
