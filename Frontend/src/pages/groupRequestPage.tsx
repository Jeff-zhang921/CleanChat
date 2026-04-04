import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./groupRequestPage.css";
import { BACKEND_URL } from "../config";

type OverlayFromPath = "/conversations" | "/groups" | "/profile";

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  isOwner: boolean;
  joined: boolean;
  requiresApproval: boolean;
  joinRequestStatus: "none" | "pending";
  pendingRequestCount: number;
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
};

type GroupJoinRequest = {
  userId: number;
  requestedAt: string;
  name: string | null;
  email: string;
  cleanId: string;
};

type GroupRequestLocationState = {
  fromPath?: OverlayFromPath;
} | null;

const resolveFromPath = (raw: unknown): OverlayFromPath => {
  if (raw === "/groups") return "/groups";
  if (raw === "/profile") return "/profile";
  return "/conversations";
};

const GroupRequestPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as GroupRequestLocationState) ?? null;
  const fromPath = resolveFromPath(locationState?.fromPath);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [requests, setRequests] = useState<GroupJoinRequest[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) ?? null,
    [groups, selectedGroupId],
  );

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

  const loadGroups = async () => {
    setLoadingGroups(true);

    try {
      const response = await fetch(`${BACKEND_URL}/chat/groups`, {
        credentials: "include",
      });
      const data = (await response.json().catch(() => ({}))) as {
        groups?: GroupSummary[];
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("groupRequests.loadGroupsFailed"));
        return;
      }

      const ownedGroups = (Array.isArray(data.groups) ? data.groups : []).filter(
        (group) => group.isOwner,
      );
      setGroups(ownedGroups);
      setStatus("");

      if (!selectedGroupId && ownedGroups.length > 0) {
        setSelectedGroupId(ownedGroups[0].id);
      }
      if (
        selectedGroupId &&
        ownedGroups.length > 0 &&
        !ownedGroups.some((group) => group.id === selectedGroupId)
      ) {
        setSelectedGroupId(ownedGroups[0].id);
      }
      if (ownedGroups.length === 0) {
        setSelectedGroupId(null);
        setRequests([]);
      }
    } catch {
      setStatus(t("groupRequests.loadGroupsFailed"));
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadRequests = async (groupId: string) => {
    setLoadingRequests(true);
    setRequests([]);

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/join-requests`,
        {
          credentials: "include",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        requests?: GroupJoinRequest[];
        group?: GroupSummary;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("groupRequests.loadRequestsFailed"));
        return;
      }

      setRequests(Array.isArray(data.requests) ? data.requests : []);
      if (data.group) {
        setGroups((prev) =>
          prev.map((group) => (group.id === data.group?.id ? data.group : group)),
        );
      }
      setStatus("");
    } catch {
      setStatus(t("groupRequests.loadRequestsFailed"));
    } finally {
      setLoadingRequests(false);
    }
  };

  useEffect(() => {
    void loadGroups();
  }, []);

  useEffect(() => {
    if (!selectedGroupId) {
      return;
    }
    void loadRequests(selectedGroupId);
  }, [selectedGroupId]);

  const handleResolve = async (
    groupId: string,
    userId: number,
    action: "approve" | "reject",
  ) => {
    const key = `${groupId}:${userId}:${action}`;
    setProcessingKey(key);
    setStatus(
      action === "approve" ? t("groupRequests.approving") : t("groupRequests.rejecting"),
    );

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/join-requests/${userId}/${action}`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        group?: GroupSummary;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("groupRequests.updateFailed"));
        return;
      }

      setRequests((prev) => prev.filter((item) => item.userId !== userId));
      if (data.group) {
        setGroups((prev) =>
          prev.map((group) => (group.id === groupId ? data.group ?? group : group)),
        );
      } else {
        await loadGroups();
      }
      setStatus(action === "approve" ? t("groupRequests.approved") : t("groupRequests.rejected"));
    } catch {
      setStatus(t("groupRequests.updateFailed"));
    } finally {
      setProcessingKey(null);
    }
  };

  return (
    <div className="group-requests-shell">
      <main className="group-requests-page">
        <header className="group-requests-nav">
          <button type="button" className="group-requests-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
        </header>

        <section className="group-requests-header">
          <p className="group-requests-eyebrow">{t("groupRequests.title")}</p>
          <h1>{t("groupRequests.heading")}</h1>
          <p>{t("groupRequests.subtitle")}</p>
        </section>

        <section className="group-requests-board">
          <aside className="group-requests-groups">
            <h2>{t("groupRequests.groupsTitle")}</h2>

            {loadingGroups && <p className="group-requests-empty">{t("common.loading")}</p>}
            {!loadingGroups && groups.length === 0 && (
              <p className="group-requests-empty">{t("groupRequests.noOwnedGroups")}</p>
            )}

            {!loadingGroups && groups.length > 0 && (
              <ul>
                {groups.map((group) => (
                  <li key={group.id}>
                    <button
                      type="button"
                      className={`group-requests-group-item ${
                        selectedGroupId === group.id ? "is-active" : ""
                      }`}
                      onClick={() => setSelectedGroupId(group.id)}
                    >
                      <span className="group-requests-group-main">
                        <strong>{group.name}</strong>
                        <span>
                          {t("groupRequests.pendingCount", {
                            count: group.pendingRequestCount,
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          <section className="group-requests-list-wrap">
            <h2>
              {selectedGroup
                ? t("groupRequests.listTitle", { name: selectedGroup.name })
                : t("groupRequests.listTitleFallback")}
            </h2>

            {!selectedGroup && (
              <p className="group-requests-empty">{t("groupRequests.selectGroup")}</p>
            )}

            {selectedGroup && loadingRequests && (
              <p className="group-requests-empty">{t("common.loading")}</p>
            )}

            {selectedGroup && !loadingRequests && requests.length === 0 && (
              <p className="group-requests-empty">{t("groupRequests.noPending")}</p>
            )}

            {selectedGroup && !loadingRequests && requests.length > 0 && (
              <ul className="group-requests-list">
                {requests.map((request) => {
                  const approveKey = `${selectedGroup.id}:${request.userId}:approve`;
                  const rejectKey = `${selectedGroup.id}:${request.userId}:reject`;
                  return (
                    <li key={request.userId} className="group-requests-item">
                      <div className="group-requests-item-copy">
                        <strong>@{request.cleanId}</strong>
                        <span>{request.name || request.email}</span>
                      </div>
                      <div className="group-requests-item-actions">
                        <button
                          type="button"
                          className="group-requests-action group-requests-action-approve"
                          disabled={Boolean(processingKey)}
                          onClick={() =>
                            void handleResolve(selectedGroup.id, request.userId, "approve")
                          }
                        >
                          {processingKey === approveKey
                            ? t("groupRequests.approving")
                            : t("groupRequests.approve")}
                        </button>
                        <button
                          type="button"
                          className="group-requests-action group-requests-action-reject"
                          disabled={Boolean(processingKey)}
                          onClick={() =>
                            void handleResolve(selectedGroup.id, request.userId, "reject")
                          }
                        >
                          {processingKey === rejectKey
                            ? t("groupRequests.rejecting")
                            : t("groupRequests.reject")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </section>

        {status && (
          <p className="group-requests-status" role="status">
            {status}
          </p>
        )}
      </main>
    </div>
  );
};

export default GroupRequestPage;
