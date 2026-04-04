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
import { GENDER_ARIA_KEY_MAP, normalizeGender } from "../utils/gender";
import type { CleanIdTrustSnapshot } from "../utils/cleanIdTrust";
import "./sendChatRequest.css";

type OverlayFromPath = "/conversations" | "/groups" | "/profile";
type ChatFromPath = "/conversations" | "/groups";

type ProfileUserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: string | null;
  trust?: CleanIdTrustSnapshot;
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

type RequestTargetResponse = {
  user: ProfileUserSummary;
  relationship: RelationshipSnapshot;
};

type SendRequestLocationState = {
  fromPath?: OverlayFromPath;
  user?: ProfileUserSummary;
} | null;

const resolveFromPath = (raw: unknown): OverlayFromPath => {
  if (raw === "/groups") return "/groups";
  if (raw === "/profile") return "/profile";
  return "/conversations";
};

const toChatFromPath = (fromPath: OverlayFromPath): ChatFromPath =>
  fromPath === "/groups" ? "/groups" : "/conversations";

const parsePositiveInt = (value: string | null | undefined) => {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const SendChatRequestPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as SendRequestLocationState) ?? null;
  const fromPath = resolveFromPath(locationState?.fromPath);

  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const queryTargetUserId = parsePositiveInt(params.get("targetUserId"));
  const targetUserId = queryTargetUserId ?? locationState?.user?.id ?? null;

  const [user, setUser] = useState<ProfileUserSummary | null>(locationState?.user ?? null);
  const [relationship, setRelationship] = useState<RelationshipSnapshot | null>(null);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  const loadTargetSnapshot = async (id: number) => {
    const response = await fetch(`${BACKEND_URL}/chat/requests/direct/target/${id}`, {
      credentials: "include",
    });
    const data = (await response.json().catch(() => ({}))) as
      | RequestTargetResponse
      | { message?: string; error?: string };

    if (!response.ok || !("user" in data) || !("relationship" in data)) {
      throw new Error(
        ("message" in data && data.message) ||
          ("error" in data && data.error) ||
          t("sendRequest.loadFailed"),
      );
    }

    setUser(data.user);
    setRelationship(data.relationship);
    if (!note && data.relationship.latestRequest?.direction === "outgoing") {
      setNote(data.relationship.latestRequest.note);
    }
  };

  useEffect(() => {
    if (!targetUserId) {
      setStatus(t("sendRequest.unavailable"));
      setLoading(false);
      return;
    }

    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        await loadTargetSnapshot(targetUserId);
        if (isMounted) {
          setStatus("");
        }
      } catch (error) {
        if (isMounted) {
          const message = error instanceof Error ? error.message : t("sendRequest.loadFailed");
          setStatus(message);
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
  }, [targetUserId, t]);

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

  const openChatWithThread = (threadId: number) => {
    if (!user) {
      return;
    }

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

  const handleOpenChat = async () => {
    if (!user || !targetUserId || !relationship) {
      return;
    }

    if (typeof relationship.existingThreadId === "number") {
      openChatWithThread(relationship.existingThreadId);
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
        body: JSON.stringify({ targetUserId }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        thread?: { id?: number };
        message?: string;
        error?: string;
      };

      if (!response.ok || typeof data.thread?.id !== "number") {
        setStatus(data.message || data.error || t("sendRequest.openChatFailed"));
        return;
      }

      openChatWithThread(data.thread.id);
    } catch {
      setStatus(t("sendRequest.openChatFailed"));
    } finally {
      setIsOpeningChat(false);
    }
  };

  const handleSubmit = async () => {
    if (!targetUserId || !user || isSubmitting) {
      return;
    }

    const trimmed = note.trim();
    if (!trimmed) {
      setStatus(t("sendRequest.noteRequired"));
      return;
    }

    setIsSubmitting(true);
    setStatus(t("sendRequest.submitting"));

    try {
      const response = await fetch(`${BACKEND_URL}/chat/requests/direct`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          targetUserId,
          note: trimmed,
        }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        autoAccepted?: boolean;
        alreadyAccepted?: boolean;
        alreadyPending?: boolean;
        message?: string;
      };

      if (!response.ok) {
        setStatus(data.message || t("sendRequest.submitFailed"));
        return;
      }

      await loadTargetSnapshot(targetUserId);

      if (data.autoAccepted || data.alreadyAccepted) {
        setStatus(t("sendRequest.peerAccepted"));
      } else if (data.alreadyPending) {
        setStatus(t("sendRequest.pendingSent"));
      } else {
        setStatus(t("sendRequest.sent"));
      }
    } catch {
      setStatus(t("sendRequest.submitFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const resolvedAvatar = user?.avatar ?? DEFAULT_AVATAR_KEY;
  const resolvedGender = normalizeGender(user?.gender);
  const canOpenChat = Boolean(relationship?.canDirectMessage || relationship?.existingThreadId);
  const isBlocked = Boolean(relationship?.blockedByMe || relationship?.blockedMe);
  const latestRequest = relationship?.latestRequest;

  return (
    <div className="send-request-shell">
      <main className="send-request-page">
        <header className="send-request-nav">
          <button type="button" className="send-request-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="send-request-header">
          <p className="send-request-eyebrow">{t("sendRequest.title")}</p>
          <h1>{t("sendRequest.heading")}</h1>
          <p>{t("sendRequest.subtitle")}</p>
        </section>

        {loading ? (
          <p className="send-request-status">{t("common.loading")}</p>
        ) : !user ? (
          <p className="send-request-status">{status || t("sendRequest.unavailable")}</p>
        ) : (
          <>
            <section className="send-request-user-card">
              <span className="send-request-avatar-wrap">
                <img
                  className={getAvatarToneClass(resolvedAvatar)}
                  src={getAvatarUrl(resolvedAvatar)}
                  alt={`${user.cleanId} ${t("common.avatar")}`}
                />
              </span>
              <span className="send-request-user-copy">
                <strong>{user.name || user.cleanId}</strong>
                <span>@{user.cleanId}</span>
              </span>
              <span
                className="send-request-gender"
                role="img"
                aria-label={t(GENDER_ARIA_KEY_MAP[resolvedGender])}
              >
                <GenderLineIcon gender={resolvedGender} size={18} />
              </span>
            </section>

            {latestRequest?.status === "accepted" && (
              <p className="send-request-status send-request-status-success">
                {t("sendRequest.peerAccepted")}
              </p>
            )}

            {latestRequest?.status === "pending" && latestRequest.direction === "outgoing" && (
              <p className="send-request-status">{t("sendRequest.pendingSent")}</p>
            )}

            {latestRequest?.status === "pending" && latestRequest.direction === "incoming" && (
              <p className="send-request-status">{t("sendRequest.incomingPending")}</p>
            )}

            {isBlocked && (
              <p className="send-request-status send-request-status-warn">
                {relationship?.blockedMe
                  ? t("sendRequest.blockedByPeer")
                  : t("sendRequest.blockingHint")}
              </p>
            )}

            <section className="send-request-form">
              <label htmlFor="request-note">{t("sendRequest.noteLabel")}</label>
              <textarea
                id="request-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder={t("sendRequest.notePlaceholder")}
                maxLength={180}
                disabled={isBlocked || isSubmitting}
              />
              <span>{t("sendRequest.noteHint")}</span>
            </section>

            <div className="send-request-actions">
              <button
                type="button"
                className="send-request-action send-request-action-primary"
                onClick={() => void handleSubmit()}
                disabled={isBlocked || isSubmitting}
              >
                {isSubmitting ? t("sendRequest.submitting") : t("sendRequest.submit")}
              </button>

              {canOpenChat && (
                <button
                  type="button"
                  className="send-request-action send-request-action-secondary"
                  onClick={() => void handleOpenChat()}
                  disabled={isOpeningChat}
                >
                  {isOpeningChat ? t("conversations.opening") : t("sendRequest.openChat")}
                </button>
              )}
            </div>
          </>
        )}

        {status && !loading && (
          <p className="send-request-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default SendChatRequestPage;
