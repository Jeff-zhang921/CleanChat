import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  AVATAR_KEYS,
  DEFAULT_AVATAR_KEY,
  getAvatarToneClass,
  getAvatarUrl,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { BACKEND_URL } from "../config";
import { dispatchGroupConversationLeft } from "../utils/conversationEvents";
import { clearGroupUnread } from "../utils/unreadCounts";
import {
  getGroupMuteKey,
  persistConversationMutes,
  readConversationMutes,
  setConversationMuted,
} from "../utils/conversationMutes";
import "./groupSettings.css";

type GroupSettingsLocationState = {
  groupId?: string;
  other?: string;
  avatarUrl?: string;
  fromPath?: "/conversations" | "/groups";
} | null;

type GroupSummary = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
  groupKind?: "community" | "private";
  creatorId: number | null;
  joined: boolean;
  isOwner: boolean;
  memberCount: number;
  mutedByMe?: boolean;
};

type GroupMember = {
  id: number;
  name: string | null;
  email: string;
  cleanId: string;
  avatar: AvatarKey;
  gender?: string | null;
};

type GroupSettingsResponse = {
  group?: Partial<GroupSummary>;
  members?: unknown[];
  message?: string;
  error?: string;
};

const AVATAR_KEY_SET = new Set<string>(AVATAR_KEYS);
const PREVIEW_MEMBER_LIMIT = 11;

const normalizeAvatarKey = (raw: unknown): AvatarKey => {
  if (typeof raw === "string" && AVATAR_KEY_SET.has(raw)) {
    return raw as AvatarKey;
  }
  return DEFAULT_AVATAR_KEY;
};

const GroupSettingsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = (location.state as GroupSettingsLocationState) ?? null;
  const search = new URLSearchParams(location.search);

  const stateGroupId =
    typeof locationState?.groupId === "string" && locationState.groupId.trim()
      ? locationState.groupId.trim()
      : "";
  const queryGroupId =
    typeof search.get("groupId") === "string" && search.get("groupId")?.trim()
      ? (search.get("groupId") as string).trim()
      : "";
  const groupId = stateGroupId || queryGroupId;

  const fallbackFromPath =
    locationState?.fromPath === "/groups" ? "/groups" : "/conversations";

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [showAllMembers, setShowAllMembers] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  const [mutedByMe, setMutedByMe] = useState(false);
  const [isUpdatingMute, setIsUpdatingMute] = useState(false);
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState("");
  const [inviteCandidates, setInviteCandidates] = useState<GroupMember[]>([]);
  const [isSearchingInvitees, setIsSearchingInvitees] = useState(false);
  const [isSendingInvite, setIsSendingInvite] = useState(false);
  const [inviteStatus, setInviteStatus] = useState("");
  const [kickingMemberId, setKickingMemberId] = useState<number | null>(null);

  useEffect(() => {
    if (!groupId) {
      setIsLoading(false);
      setStatus(t("groupSettings.unavailable"));
      return;
    }

    let isMounted = true;

    const loadSettings = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/settings`,
          {
            credentials: "include",
          },
        );
        const data = (await response.json().catch(() => ({}))) as GroupSettingsResponse;

        if (!response.ok || !data.group || !Array.isArray(data.members)) {
          if (isMounted) {
            if (response.status === 404) {
              const toastMessage = t("groups.communityDisbandedToast", {
                defaultValue: "This community has been disbanded.",
              });
              setStatus(toastMessage);
              navigate("/groups", {
                replace: true,
                state: { statusToast: toastMessage },
              });
              return;
            }
            setStatus(data.message || data.error || t("groupSettings.loadFailed"));
          }
          return;
        }

        const rawGroup = data.group;
        if (
          typeof rawGroup.id !== "string" ||
          typeof rawGroup.name !== "string" ||
          typeof rawGroup.avatarUrl !== "string"
        ) {
          if (isMounted) {
            setStatus(t("groupSettings.loadFailed"));
          }
          return;
        }

        const normalizedMembers = data.members.reduce<GroupMember[]>((acc, item) => {
          if (!item || typeof item !== "object") {
            return acc;
          }

          const candidate = item as Partial<GroupMember>;
          if (
            typeof candidate.id !== "number" ||
            !Number.isInteger(candidate.id) ||
            candidate.id <= 0 ||
            typeof candidate.cleanId !== "string" ||
            typeof candidate.email !== "string"
          ) {
            return acc;
          }

          acc.push({
            id: candidate.id,
            name: typeof candidate.name === "string" ? candidate.name : null,
            cleanId: candidate.cleanId,
            email: candidate.email,
            avatar: normalizeAvatarKey(candidate.avatar),
            gender: typeof candidate.gender === "string" ? candidate.gender : null,
          });
          return acc;
        }, []);

        if (!isMounted) {
          return;
        }

        setGroup({
          id: rawGroup.id,
          name: rawGroup.name,
          description:
            typeof rawGroup.description === "string"
              ? rawGroup.description
              : "",
          avatarUrl: rawGroup.avatarUrl,
          groupKind: rawGroup.groupKind === "private" ? "private" : "community",
          creatorId:
            typeof rawGroup.creatorId === "number" && rawGroup.creatorId > 0
              ? rawGroup.creatorId
              : null,
          joined: rawGroup.joined !== false,
          isOwner: rawGroup.isOwner === true,
          memberCount:
            typeof rawGroup.memberCount === "number" && rawGroup.memberCount >= 0
              ? rawGroup.memberCount
              : normalizedMembers.length,
          mutedByMe: rawGroup.mutedByMe === true,
        });
        const muted = rawGroup.mutedByMe === true;
        setMutedByMe(muted);
        const muteKey = getGroupMuteKey(groupId);
        const nextMutes = setConversationMuted(readConversationMutes(), muteKey, muted);
        persistConversationMutes(nextMutes);
        setMembers(normalizedMembers);
        setStatus("");
      } catch {
        if (isMounted) {
          setStatus(t("groupSettings.loadFailed"));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, [groupId, navigate, t]);

  useEffect(() => {
    if (!isInvitePanelOpen) {
      return;
    }

    const normalizedQuery = inviteQuery.trim();
    if (!normalizedQuery) {
      setInviteCandidates([]);
      setIsSearchingInvitees(false);
      return;
    }

    let isMounted = true;
    setIsSearchingInvitees(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `${BACKEND_URL}/chat/users/search?q=${encodeURIComponent(normalizedQuery)}`,
          { credentials: "include" },
        );
        const data = await response.json().catch(() => ({}));
        if (!isMounted) return;
        if (!response.ok) {
          setInviteStatus(data.message || data.error || t("groups.inviteSearchFailed"));
          setInviteCandidates([]);
          return;
        }
        const users: unknown[] = Array.isArray(data.users) ? data.users : [];
        setInviteCandidates(
          users.reduce<GroupMember[]>((acc, item) => {
            if (!item || typeof item !== "object") return acc;
            const candidate = item as Partial<GroupMember>;
            if (
              typeof candidate.id !== "number" ||
              !Number.isInteger(candidate.id) ||
              candidate.id <= 0 ||
              typeof candidate.cleanId !== "string" ||
              typeof candidate.email !== "string"
            ) {
              return acc;
            }
            acc.push({
              id: candidate.id,
              name: typeof candidate.name === "string" ? candidate.name : null,
              cleanId: candidate.cleanId,
              email: candidate.email,
              avatar: normalizeAvatarKey(candidate.avatar),
              gender: typeof candidate.gender === "string" ? candidate.gender : null,
            });
            return acc;
          }, []),
        );
      } catch {
        if (isMounted) {
          setInviteStatus(t("groups.inviteSearchFailed"));
          setInviteCandidates([]);
        }
      } finally {
        if (isMounted) {
          setIsSearchingInvitees(false);
        }
      }
    }, 220);

    return () => {
      isMounted = false;
      window.clearTimeout(timer);
    };
  }, [inviteQuery, isInvitePanelOpen, t]);

  const groupName =
    group?.name || locationState?.other || t("groups.groupFallback");
  const groupAvatarUrl = group?.avatarUrl || locationState?.avatarUrl || "";

  const visibleMembers = useMemo(
    () => (showAllMembers ? members : members.slice(0, PREVIEW_MEMBER_LIMIT)),
    [members, showAllMembers],
  );

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/chat", {
      replace: true,
      state: {
        chatType: "group",
        groupId: groupId || undefined,
        other: groupName,
        avatarUrl: groupAvatarUrl,
        fromPath: fallbackFromPath,
      },
    });
  };

  const handleOpenMemberProfile = (member: GroupMember) => {
    navigate(`/profile/user/${member.id}`, {
      state: {
        fromPath: "/groups",
        user: member,
      },
    });
  };

  const handleToggleMute = async () => {
    if (!groupId || isUpdatingMute || isLeaving || isLoading) {
      return;
    }

    const nextMuted = !mutedByMe;
    setIsUpdatingMute(true);

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/mute`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ muted: nextMuted }),
        },
      );

      const data = (await response.json().catch(() => ({}))) as {
        mutedByMe?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("groupSettings.muteUpdateFailed"));
        return;
      }

      const applied = typeof data.mutedByMe === "boolean" ? data.mutedByMe : nextMuted;
      setMutedByMe(applied);

      const muteKey = getGroupMuteKey(groupId);
      const nextMutes = setConversationMuted(readConversationMutes(), muteKey, applied);
      persistConversationMutes(nextMutes);

      setStatus(applied ? t("groupSettings.mutedNow") : t("groupSettings.unmutedNow"));
    } catch {
      setStatus(t("groupSettings.muteUpdateFailed"));
    } finally {
      setIsUpdatingMute(false);
    }
  };

  const openInvitePanel = () => {
    setInviteQuery("");
    setInviteCandidates([]);
    setInviteStatus("");
    setIsInvitePanelOpen(true);
  };

  const handleInviteCandidate = async (candidate: GroupMember) => {
    if (!groupId || isSendingInvite) {
      return;
    }

    setIsSendingInvite(true);
    setInviteStatus(t("groups.inviteSending", { name: candidate.cleanId }));
    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/invitations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ targetUserId: candidate.id }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setInviteStatus(data.message || data.error || t("groups.inviteFailed"));
        return;
      }

      setInviteCandidates((prev) => prev.filter((item) => item.id !== candidate.id));
      setInviteQuery("");
      setInviteStatus(
        data.alreadyInvited
          ? t("groups.inviteAlreadySent", { name: candidate.cleanId })
          : t("groups.inviteSent", { name: candidate.cleanId, group: groupName }),
      );
    } catch {
      setInviteStatus(t("groups.inviteFailed"));
    } finally {
      setIsSendingInvite(false);
    }
  };

  const handleKickMember = async (member: GroupMember) => {
    if (!groupId || !group?.isOwner || kickingMemberId !== null) {
      return;
    }

    setKickingMemberId(member.id);
    setStatus("");
    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/members/${member.id}`,
        {
          method: "DELETE",
          credentials: "include",
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setStatus(data.message || data.error || t("groupSettings.kickFailed", { defaultValue: "Failed to remove member." }));
        return;
      }

      setMembers((prev) => prev.filter((item) => item.id !== member.id));
      setGroup((current) =>
        current
          ? {
              ...current,
              memberCount: Math.max(0, current.memberCount - 1),
            }
          : current,
      );
      setStatus(t("groupSettings.kicked", { defaultValue: "Member removed." }));
    } catch {
      setStatus(t("groupSettings.kickFailed", { defaultValue: "Failed to remove member." }));
    } finally {
      setKickingMemberId(null);
    }
  };

  const handleConfirmLeave = async () => {
    if (!groupId || isLeaving) {
      return;
    }

    setIsLeaving(true);
    setStatus("");

    try {
      const response = await fetch(
        `${BACKEND_URL}/chat/groups/${encodeURIComponent(groupId)}/leave`,
        {
          method: "POST",
          credentials: "include",
        },
      );
      const data = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
      };

      if (!response.ok) {
        setStatus(data.message || data.error || t("groupSettings.leaveFailed"));
        setIsLeaving(false);
        return;
      }

      clearGroupUnread(groupId);
      const muteKey = getGroupMuteKey(groupId);
      const nextMutes = setConversationMuted(readConversationMutes(), muteKey, false);
      persistConversationMutes(nextMutes);
      dispatchGroupConversationLeft({
        groupId,
        toast: t("groupSettings.leftToast"),
      });
      setShowLeaveConfirm(false);
      navigate(fallbackFromPath, {
        replace: true,
        state:
          fallbackFromPath === "/groups"
            ? { statusToast: t("groupSettings.leftToast") }
            : undefined,
      });
    } catch {
      setStatus(t("groupSettings.leaveFailed"));
      setIsLeaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="group-settings-shell">
        <main className="group-settings-page">
          <button type="button" className="group-settings-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="group-settings-status">{t("groupSettings.loading")}</p>
        </main>
      </div>
    );
  }

  if (!groupId || !group) {
    return (
      <div className="group-settings-shell">
        <main className="group-settings-page">
          <button type="button" className="group-settings-back" onClick={handleBack}>
            <span aria-hidden="true">{"\u2190"}</span>
            <span>{t("common.back")}</span>
          </button>
          <p className="group-settings-status">
            {status || t("groupSettings.unavailable")}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="group-settings-shell">
      <main className="group-settings-page">
        <button type="button" className="group-settings-back" onClick={handleBack}>
          <span aria-hidden="true">{"\u2190"}</span>
          <span>{t("common.back")}</span>
        </button>

        <header className="group-settings-header">
          <span className="group-settings-avatar" aria-hidden="true">
            {groupAvatarUrl ? (
              <img src={groupAvatarUrl} alt="" />
            ) : (
              <span>{groupName.trim().charAt(0).toUpperCase() || "#"}</span>
            )}
          </span>
          <div className="group-settings-copy">
            <p>{t("groupSettings.title")}</p>
            <h1>{groupName}</h1>
            <span>{t("groups.members", { count: group.memberCount || members.length })}</span>
          </div>
        </header>

        <section className="group-settings-mute-card">
          <div className="group-settings-row">
            <div className="group-settings-row-copy">
              <h2>{t("groupSettings.muteNotifications")}</h2>
              <p>{t("groupSettings.muteHint")}</p>
            </div>
            <button
              type="button"
              className={`group-settings-toggle ${mutedByMe ? "is-on" : ""}`}
              role="switch"
              aria-checked={mutedByMe}
              aria-label={t("groupSettings.muteNotifications")}
              onClick={handleToggleMute}
              disabled={isUpdatingMute || isLeaving}
            >
              <span className="group-settings-toggle-thumb" />
            </button>
          </div>
        </section>

        <section className="group-settings-members-card">
          <div className="group-settings-members-head">
            <h2>{t("groupSettings.members")}</h2>
            {members.length > PREVIEW_MEMBER_LIMIT && (
              <button
                type="button"
                className="group-settings-view-more"
                onClick={() => setShowAllMembers((current) => !current)}
              >
                {showAllMembers ? t("common.close") : t("groupSettings.viewMore")}
              </button>
            )}
          </div>

          <div className="group-settings-member-grid">
            {visibleMembers.map((member) => {
              const displayName =
                member.name?.trim() || member.cleanId || member.email.split("@")[0] || t("common.user");
              const canKickMember =
                group.isOwner &&
                member.id !== group.creatorId &&
                kickingMemberId !== member.id;

              return (
                <div
                  key={member.id}
                  className={`group-settings-member-cell ${group.isOwner ? "owner-view" : ""}`}
                >
                  <button
                    type="button"
                    className="group-settings-member-item"
                    onClick={() => handleOpenMemberProfile(member)}
                    title={displayName}
                  >
                    <span className="group-settings-member-avatar" aria-hidden="true">
                      <img
                        className={getAvatarToneClass(member.avatar)}
                        src={getAvatarUrl(member.avatar)}
                        alt=""
                      />
                    </span>
                    <span className="group-settings-member-name">{displayName}</span>
                  </button>
                  {group.isOwner && member.id !== group.creatorId && (
                    <button
                      type="button"
                      className="group-settings-kick-action"
                      onClick={() => {
                        void handleKickMember(member);
                      }}
                      disabled={!canKickMember || kickingMemberId !== null}
                    >
                      {kickingMemberId === member.id
                        ? t("groupSettings.kicking", { defaultValue: "Removing..." })
                        : t("groupSettings.kick", { defaultValue: "Kick" })}
                    </button>
                  )}
                </div>
              );
            })}

            <button
              type="button"
              className="group-settings-invite-placeholder"
              aria-label={t("groupSettings.invitePlaceholder")}
              onClick={openInvitePanel}
              disabled={isSendingInvite}
            >
              <span>+</span>
            </button>
          </div>
        </section>

        <section className="group-settings-danger">
          <button
            type="button"
            className="group-settings-leave-action"
            onClick={() => setShowLeaveConfirm(true)}
            disabled={!group.joined || isUpdatingMute || isLeaving}
          >
            {isLeaving ? t("groupSettings.leaving") : t("groupSettings.deleteAndLeave")}
          </button>
        </section>

        {status && (
          <p className="group-settings-status" role="status">
            {status}
          </p>
        )}
      </main>

      {isInvitePanelOpen && (
        <div className="group-settings-invite-layer" role="presentation">
          <button
            type="button"
            className="group-settings-invite-backdrop"
            aria-label={t("common.close")}
            onClick={() => setIsInvitePanelOpen(false)}
            disabled={isSendingInvite}
          />
          <section className="group-settings-invite-dialog" role="dialog" aria-modal="true" aria-labelledby="group-settings-invite-title">
            <div className="group-settings-invite-head">
              <div>
                <p>{group.groupKind === "private" ? t("groupSettings.privateGroup", { defaultValue: "Private Group" }) : t("groupSettings.community", { defaultValue: "Community" })}</p>
                <h2 id="group-settings-invite-title">{t("groups.invitePeople")}</h2>
                <span>{groupName}</span>
              </div>
              <button
                type="button"
                className="group-settings-invite-close"
                onClick={() => setIsInvitePanelOpen(false)}
                disabled={isSendingInvite}
              >
                {t("common.close")}
              </button>
            </div>

            <label className="group-settings-invite-field">
              <span>{t("groups.inviteSearchLabel")}</span>
              <input
                type="search"
                value={inviteQuery}
                onChange={(event) => {
                  setInviteQuery(event.target.value);
                  setInviteStatus("");
                }}
                placeholder={t("groups.inviteSearchPlaceholder")}
                disabled={isSendingInvite}
              />
            </label>

            <div className="group-settings-invite-results" aria-live="polite">
              {isSearchingInvitees ? (
                <p>{t("groups.inviteSearching")}</p>
              ) : inviteQuery.trim().length === 0 ? (
                <p>{t("groups.inviteSearchIdle")}</p>
              ) : inviteCandidates.length === 0 ? (
                <p>{t("groups.inviteSearchEmpty")}</p>
              ) : (
                <ul>
                  {inviteCandidates.map((candidate) => (
                    <li key={candidate.id}>
                      <div className="group-settings-invite-user">
                        <strong>@{candidate.cleanId}</strong>
                        <span>{candidate.name || candidate.email}</span>
                      </div>
                      <button
                        type="button"
                        className="group-settings-invite-send"
                        onClick={() => {
                          void handleInviteCandidate(candidate);
                        }}
                        disabled={isSendingInvite}
                      >
                        {isSendingInvite ? t("groups.inviteSendingShort") : t("groups.invite")}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {inviteStatus && (
              <p className="group-settings-invite-status" role="status">
                {inviteStatus}
              </p>
            )}
          </section>
        </div>
      )}

      {showLeaveConfirm && (
        <div className="group-settings-confirm-layer" role="presentation">
          <button
            type="button"
            className="group-settings-confirm-backdrop"
            aria-label={t("common.close")}
            onClick={() => setShowLeaveConfirm(false)}
            disabled={isLeaving}
          />
          <section className="group-settings-confirm-dialog" role="dialog" aria-modal="true">
            <h2>{t("groupSettings.leaveConfirmTitle")}</h2>
            <p>{t("groupSettings.leaveConfirmBody")}</p>
            <div className="group-settings-confirm-actions">
              <button
                type="button"
                className="group-settings-confirm-cancel"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={isLeaving}
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                className="group-settings-confirm-leave"
                onClick={handleConfirmLeave}
                disabled={isLeaving}
              >
                {isLeaving ? t("groupSettings.leaving") : t("groupSettings.deleteAndLeave")}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default GroupSettingsPage;
