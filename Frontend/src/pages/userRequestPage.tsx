import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import GenderLineIcon from "../components/GenderLineIcon";
import {
  getAvatarToneClass,
  getAvatarUrl,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { GENDER_ARIA_KEY_MAP, normalizeGender } from "../utils/gender";
import type { CleanIdTrustSnapshot } from "../utils/cleanIdTrust";
import "./userRequestPage.css";

type OverlayFromPath = "/conversations" | "/groups" | "/profile";
type ChatFromPath = "/conversations" | "/groups";

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

type UserSummary = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: string | null;
  trust: CleanIdTrustSnapshot;
};

type RequestEntry = {
  request: DirectRequestSnapshot;
  user: UserSummary;
};

type ReceivedRequestsResponse = {
  pending: RequestEntry[];
  recent: RequestEntry[];
};

type AcceptRequestResponse = {
  request: DirectRequestSnapshot;
  thread?: {
    id?: number;
  };
  user?: UserSummary;
};

type RejectRequestResponse = {
  request: DirectRequestSnapshot;
};

type UserRequestLocationState = {
  fromPath?: OverlayFromPath;
} | null;

const resolveFromPath = (raw: unknown): OverlayFromPath => {
  if (raw === "/groups") return "/groups";
  if (raw === "/profile") return "/profile";
  return "/conversations";
};

const toChatFromPath = (fromPath: OverlayFromPath): ChatFromPath =>
  fromPath === "/groups" ? "/groups" : "/conversations";

const UserRequestPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as UserRequestLocationState) ?? null;
  const fromPath = resolveFromPath(locationState?.fromPath);

  const [pendingRequests, setPendingRequests] = useState<RequestEntry[]>([]);
  const [recentRequests, setRecentRequests] = useState<RequestEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [processingKey, setProcessingKey] = useState<string | null>(null);

  const refreshRequests = async () => {
    const response = await fetch(`${BACKEND_URL}/chat/requests/direct/received`, {
      credentials: "include",
    });
    const data = (await response.json().catch(() => ({}))) as
      | ReceivedRequestsResponse
      | { message?: string; error?: string };

    if (!response.ok || !("pending" in data) || !("recent" in data)) {
      throw new Error(
        ("message" in data && data.message) ||
          ("error" in data && data.error) ||
          t("userRequests.loadFailed"),
      );
    }

    setPendingRequests(Array.isArray(data.pending) ? data.pending : []);
    setRecentRequests(Array.isArray(data.recent) ? data.recent : []);
  };

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      setLoading(true);
      try {
        await refreshRequests();
        if (isMounted) {
          setStatus("");
        }
      } catch (error) {
        if (isMounted) {
          setStatus(error instanceof Error ? error.message : t("userRequests.loadFailed"));
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
  }, [t]);

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

  const handleApprove = async (entry: RequestEntry) => {
    const key = `${entry.request.id}:approve`;
    setProcessingKey(key);
    setStatus(t("userRequests.approving"));

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/requests/direct/${entry.request.id}/accept`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | AcceptRequestResponse
        | { message?: string; error?: string };

      if (!response.ok || !("request" in data)) {
        setStatus(
          ("message" in data && data.message) ||
            ("error" in data && data.error) ||
            t("userRequests.updateFailed"),
        );
        return;
      }

      const threadId = data.thread?.id;
      if (typeof threadId === "number") {
        const chatFromPath = toChatFromPath(fromPath);
        navigate("/chat", {
          state: {
            threadId,
            other: entry.user.name || entry.user.cleanId,
            avatarUrl: getAvatarUrl(entry.user.avatar),
            avatarKey: entry.user.avatar,
            fromPath: chatFromPath,
          },
        });
        return;
      }

      await refreshRequests();
      setStatus(t("userRequests.accepted"));
    } catch {
      setStatus(t("userRequests.updateFailed"));
    } finally {
      setProcessingKey(null);
    }
  };

  const handleReject = async (entry: RequestEntry) => {
    const key = `${entry.request.id}:reject`;
    setProcessingKey(key);
    setStatus(t("userRequests.rejecting"));

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/requests/direct/${entry.request.id}/reject`,
        {
          method: "POST",
          credentials: "include",
        },
      );

      const data = (await response.json().catch(() => ({}))) as
        | RejectRequestResponse
        | { message?: string; error?: string };

      if (!response.ok || !("request" in data)) {
        setStatus(
          ("message" in data && data.message) ||
            ("error" in data && data.error) ||
            t("userRequests.updateFailed"),
        );
        return;
      }

      setPendingRequests((prev) => prev.filter((item) => item.request.id !== entry.request.id));
      setRecentRequests((prev) => [{ ...entry, request: data.request }, ...prev].slice(0, 20));
      setStatus(t("userRequests.rejected"));
    } catch {
      setStatus(t("userRequests.updateFailed"));
    } finally {
      setProcessingKey(null);
    }
  };

  const hasPending = pendingRequests.length > 0;
  const hasRecent = recentRequests.length > 0;
  const loadingStatus = useMemo(() => {
    if (loading) {
      return t("common.loading");
    }
    return status;
  }, [loading, status, t]);

  return (
    <div className="user-requests-shell">
      <main className="user-requests-page">
        <header className="user-requests-nav">
          <button type="button" className="user-requests-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="user-requests-header">
          <p className="user-requests-eyebrow">{t("userRequests.title")}</p>
          <h1>{t("userRequests.heading")}</h1>
          <p>{t("userRequests.subtitle")}</p>
        </section>

        {loading ? (
          <p className="user-requests-status">{loadingStatus}</p>
        ) : (
          <>
            <section className="user-requests-section">
              <h2>{t("userRequests.pendingTitle")}</h2>
              {!hasPending && <p className="user-requests-empty">{t("userRequests.emptyPending")}</p>}
              {hasPending && (
                <ul className="user-requests-list">
                  {pendingRequests.map((entry) => {
                    const approveKey = `${entry.request.id}:approve`;
                    const rejectKey = `${entry.request.id}:reject`;
                    return (
                      <li key={entry.request.id} className="user-requests-item">
                        <div className="user-requests-avatar-wrap">
                          <img
                            className={getAvatarToneClass(entry.user.avatar)}
                            src={getAvatarUrl(entry.user.avatar)}
                            alt={`${entry.user.cleanId} ${t("common.avatar")}`}
                          />
                        </div>
                        <div className="user-requests-item-copy">
                          <div className="user-requests-item-head">
                            <strong>{entry.user.name || entry.user.cleanId}</strong>
                            <span
                              className="user-requests-gender"
                              role="img"
                              aria-label={t(GENDER_ARIA_KEY_MAP[normalizeGender(entry.user.gender)])}
                            >
                              <GenderLineIcon gender={normalizeGender(entry.user.gender)} size={16} />
                            </span>
                          </div>
                          <span>@{entry.user.cleanId}</span>
                          <p>{entry.request.note}</p>
                        </div>
                        <div className="user-requests-actions">
                          <button
                            type="button"
                            className="user-requests-action user-requests-action-approve"
                            disabled={processingKey === approveKey || Boolean(processingKey)}
                            onClick={() => void handleApprove(entry)}
                          >
                            {processingKey === approveKey ? t("userRequests.approving") : t("userRequests.approve")}
                          </button>
                          <button
                            type="button"
                            className="user-requests-action user-requests-action-reject"
                            disabled={processingKey === rejectKey || Boolean(processingKey)}
                            onClick={() => void handleReject(entry)}
                          >
                            {processingKey === rejectKey ? t("userRequests.rejecting") : t("userRequests.reject")}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="user-requests-section">
              <h2>{t("userRequests.recentTitle")}</h2>
              {!hasRecent && <p className="user-requests-empty">{t("userRequests.emptyRecent")}</p>}
              {hasRecent && (
                <ul className="user-requests-list user-requests-list-recent">
                  {recentRequests.map((entry) => (
                    <li key={entry.request.id} className="user-requests-item user-requests-item-recent">
                      <div className="user-requests-avatar-wrap">
                        <img
                          className={getAvatarToneClass(entry.user.avatar)}
                          src={getAvatarUrl(entry.user.avatar)}
                          alt={`${entry.user.cleanId} ${t("common.avatar")}`}
                        />
                      </div>
                      <div className="user-requests-item-copy">
                        <strong>{entry.user.name || entry.user.cleanId}</strong>
                        <span>@{entry.user.cleanId}</span>
                        <p>{entry.request.note}</p>
                      </div>
                      <span className={`user-requests-result user-requests-result-${entry.request.status}`}>
                        {entry.request.status === "accepted"
                          ? t("userRequests.acceptedTag")
                          : t("userRequests.rejectedTag")}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        {status && !loading && (
          <p className="user-requests-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default UserRequestPage;
