type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  cleanId: string;
};

export const GROUP_AVATAR_KEYS = [
  "orbit",
  "pixel",
  "flare",
  "bloom",
  "canyon",
  "tide",
] as const;

export type GroupAvatarKey = (typeof GROUP_AVATAR_KEYS)[number];
const GROUP_AVATAR_KEY_SET = new Set<string>(GROUP_AVATAR_KEYS);

const buildGroupAvatarUrl = (avatarKey: GroupAvatarKey) =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(avatarKey)}`;

export const isValidGroupAvatarKey = (raw: unknown): raw is GroupAvatarKey =>
  typeof raw === "string" && GROUP_AVATAR_KEY_SET.has(raw);

export const COMMUNITY_CATEGORIES = [
  {
    id: "campus-life",
    label: "Campus Life",
    subcategories: [
      { id: "study", label: "Study" },
      { id: "events", label: "Events" },
      { id: "housing", label: "Housing" },
        {id: "food", label: "Food" },
        {id: "transportation", label: "Transportation" },
        {id: "major-specific", label: "Major-specific" },
    ],
  },
  {
    id: "interests",
    label: "Interests",
    subcategories: [
      { id: "music", label: "Music" },
      { id: "gaming", label: "Gaming" },
      { id: "fitness", label: "Fitness" },
      { id:"sports", label: "Sports" },
      
    ],
  },
  {
    id: "career",
    label: "Career",
    subcategories: [
      { id: "frontend", label: "Frontend" },
      { id: "backend", label: "Backend" },
      { id: "design", label: "Design" },
    ],
  },
  {
    id:"other",
    label: "Other",
    subcategories: [
        { id: "general", label: "General" },
    ],
  }
] as const;

export type GroupKind = "community" | "private";
export type CommunityCategoryId = (typeof COMMUNITY_CATEGORIES)[number]["id"];
export type CommunitySubcategoryId =
  (typeof COMMUNITY_CATEGORIES)[number]["subcategories"][number]["id"];

const DEFAULT_COMMUNITY_CATEGORY = COMMUNITY_CATEGORIES[0];
const DEFAULT_COMMUNITY_SUBCATEGORY = DEFAULT_COMMUNITY_CATEGORY.subcategories[0];

export const resolveCommunityCategorySelection = (
  rawMainCategoryId: unknown,
  rawSubcategoryId: unknown,
) => {
  const mainCategoryId =
    typeof rawMainCategoryId === "string" ? rawMainCategoryId.trim() : "";
  const subcategoryId =
    typeof rawSubcategoryId === "string" ? rawSubcategoryId.trim() : "";
  const category = COMMUNITY_CATEGORIES.find(
    (item) => item.id === mainCategoryId,
  );
  if (!category) {
    return null;
  }

  const subcategory = category.subcategories.find(
    (item) => item.id === subcategoryId,
  );
  if (!subcategory) {
    return null;
  }

  return {
    mainCategoryId: category.id,
    mainCategoryLabel: category.label,
    subcategoryId: subcategory.id,
    subcategoryLabel: subcategory.label,
  };
};

const getDefaultCommunityCategorySelection = () => ({
  mainCategoryId: DEFAULT_COMMUNITY_CATEGORY.id,
  subcategoryId: DEFAULT_COMMUNITY_SUBCATEGORY.id,
});

export type GroupDefinition = {
  id: string;
  name: string;
  description: string;
  avatarKey: GroupAvatarKey;
  avatarUrl: string;
  groupKind: GroupKind;
  mainCategoryId: CommunityCategoryId | null;
  subcategoryId: CommunitySubcategoryId | null;
  requiresApproval: boolean;
  creatorId: number | null;
  createdAt: string;
};

export type GroupMessage = {
  id: number;
  groupId: string;
  senderId: number;
  senderName: string;
  body: string;
  createdAt: string;
  parentMessageId?: number | null;
  quoteSenderName?: string | null;
  quotePreview?: string | null;
};

const RECALLED_MESSAGE_BODY = "__CLEANCHAT_RECALLED__";

export type GroupSummary = GroupDefinition & {
  joined: boolean;
  isOwner: boolean;
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
  joinRequestStatus: "none" | "pending";
  pendingRequestCount: number;
};

export type GroupJoinRequest = {
  userId: number;
  requestedAt: string;
};

export type GroupInvitation = {
  id: number;
  groupId: string;
  inviterUserId: number;
  targetUserId: number;
  createdAt: string;
};

const SYSTEM_GROUP_CREATED_AT = new Date().toISOString();

let groups: GroupDefinition[] = [
  {
    id: "frontend-lab",
    name: "Frontend Lab",
    description: "UI ideas, React tricks, and CSS polishing.",
    avatarKey: "pixel",
    avatarUrl: buildGroupAvatarUrl("pixel"),
    groupKind: "community",
    mainCategoryId: "career",
    subcategoryId: "frontend",
    requiresApproval: false,
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
  {
    id: "backend-hub",
    name: "Backend Hub",
    description: "API design, Prisma, auth, and deployment topics.",
    avatarKey: "orbit",
    avatarUrl: buildGroupAvatarUrl("orbit"),
    groupKind: "community",
    mainCategoryId: "career",
    subcategoryId: "backend",
    requiresApproval: false,
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
  {
    id: "debug-clinic",
    name: "Debug Clinic",
    description: "Post issues, get help, and share root causes.",
    avatarKey: "flare",
    avatarUrl: buildGroupAvatarUrl("flare"),
    groupKind: "community",
    mainCategoryId: "interests",
    subcategoryId: "gaming",
    requiresApproval: false,
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
];

const groupMembers = new Map<string, Set<number>>();
const groupMessages = new Map<string, GroupMessage[]>();
const groupJoinRequests = new Map<string, Map<number, string>>();
const groupInvitations = new Map<number, GroupInvitation>();
let nextGroupMessageId = 1;
let nextGroupInvitationId = 1;

export type GroupStoreSnapshot = {
  groups: GroupDefinition[];
  membersByGroupId: Record<string, number[]>;
  messagesByGroupId: Record<string, GroupMessage[]>;
  joinRequestsByGroupId: Record<string, Record<string, string>>;
  invitations: GroupInvitation[];
  nextGroupMessageId: number;
  nextGroupInvitationId: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const toPositiveInt = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

const toIsoString = (value: unknown) => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsedDate = new Date(trimmed);
  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }
  return parsedDate.toISOString();
};

let onGroupStoreStateChange: (() => void) | null = null;

const notifyGroupStoreStateChanged = () => {
  onGroupStoreStateChange?.();
};

export const setGroupStoreStateChangeListener = (
  listener: (() => void) | null,
) => {
  onGroupStoreStateChange = listener;
};

const MAX_GROUP_MESSAGES = 500;
const GROUP_ID_REGEX = /^[a-z0-9-]{2,40}$/;

const getOrCreateMembers = (groupId: string) => {
  const existing = groupMembers.get(groupId);
  if (existing) return existing;
  const created = new Set<number>();
  groupMembers.set(groupId, created);
  return created;
};

const getOrCreateJoinRequests = (groupId: string) => {
  const existing = groupJoinRequests.get(groupId);
  if (existing) return existing;
  const created = new Map<number, string>();
  groupJoinRequests.set(groupId, created);
  return created;
};

const normalizeGroupName = (raw: string) => raw.trim().replace(/\s+/g, " ");

const toGroupSlug = (raw: string) => {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "group";
};

const createUniqueGroupId = (name: string) => {
  const baseSlug = toGroupSlug(name).slice(0, 32) || "group";
  let candidate = baseSlug;
  let suffix = 1;
  while (groups.some((group) => group.id === candidate)) {
    suffix += 1;
    const idSuffix = `-${suffix}`;
    candidate = `${baseSlug.slice(0, 40 - idSuffix.length)}${idSuffix}`;
  }
  return candidate;
};

export const normalizeGroupId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!GROUP_ID_REGEX.test(normalized)) return null;
  return normalized;
};

export const snapshotGroupStore = (): GroupStoreSnapshot => {
  const membersByGroupId: Record<string, number[]> = {};
  groupMembers.forEach((members, groupId) => {
    membersByGroupId[groupId] = [...members].sort((a, b) => a - b);
  });

  const messagesByGroupId: Record<string, GroupMessage[]> = {};
  groupMessages.forEach((messages, groupId) => {
    messagesByGroupId[groupId] = messages.map((message) => ({ ...message }));
  });

  const joinRequestsByGroupId: Record<string, Record<string, string>> = {};
  groupJoinRequests.forEach((requests, groupId) => {
    const nextRequests: Record<string, string> = {};
    requests.forEach((requestedAt, userId) => {
      nextRequests[String(userId)] = requestedAt;
    });
    joinRequestsByGroupId[groupId] = nextRequests;
  });

  return {
    groups: groups.map((group) => ({ ...group })),
    membersByGroupId,
    messagesByGroupId,
    joinRequestsByGroupId,
    invitations: [...groupInvitations.values()]
      .map((invitation) => ({ ...invitation }))
      .sort((a, b) => a.id - b.id),
    nextGroupMessageId,
    nextGroupInvitationId,
  };
};

export const hydrateGroupStore = (snapshot: unknown) => {
  if (!isRecord(snapshot)) {
    return;
  }

  const rawGroups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
  const hydratedGroups: GroupDefinition[] = rawGroups
    .map((rawGroup) => {
      if (!isRecord(rawGroup)) {
        return null;
      }

      const groupId = normalizeGroupId(rawGroup.id);
      const groupName =
        typeof rawGroup.name === "string"
          ? normalizeGroupName(rawGroup.name)
          : "";
      if (!groupId || !groupName) {
        return null;
      }

      const description =
        typeof rawGroup.description === "string" && rawGroup.description.trim()
          ? rawGroup.description.trim()
          : "No description yet.";
      const avatarKey = isValidGroupAvatarKey(rawGroup.avatarKey)
        ? rawGroup.avatarKey
        : "orbit";
      const createdAt =
        toIsoString(rawGroup.createdAt) ?? new Date().toISOString();
      const creatorId = toPositiveInt(rawGroup.creatorId);
      const groupKind = rawGroup.groupKind === "private" ? "private" : "community";
      const categorySelection =
        groupKind === "community"
          ? resolveCommunityCategorySelection(
              rawGroup.mainCategoryId,
              rawGroup.subcategoryId,
            ) ?? getDefaultCommunityCategorySelection()
          : { mainCategoryId: null, subcategoryId: null };

      return {
        id: groupId,
        name: groupName,
        description,
        avatarKey,
        avatarUrl: buildGroupAvatarUrl(avatarKey),
        groupKind,
        mainCategoryId: categorySelection.mainCategoryId,
        subcategoryId: categorySelection.subcategoryId,
        requiresApproval:
          groupKind === "community" && rawGroup.requiresApproval === true,
        creatorId,
        createdAt,
      } satisfies GroupDefinition;
    })
    .filter((group): group is GroupDefinition => Boolean(group));

  if (hydratedGroups.length > 0) {
    groups = hydratedGroups;
  }

  const activeGroupIds = new Set(groups.map((group) => group.id));

  groupMembers.clear();
  const rawMembers = isRecord(snapshot.membersByGroupId)
    ? snapshot.membersByGroupId
    : {};
  Object.entries(rawMembers).forEach(([groupId, value]) => {
    if (!activeGroupIds.has(groupId) || !Array.isArray(value)) {
      return;
    }

    const memberIds = value
      .map((memberId) => toPositiveInt(memberId))
      .filter((memberId): memberId is number => memberId !== null);
    groupMembers.set(groupId, new Set(memberIds));
  });

  groupMessages.clear();
  const rawMessages = isRecord(snapshot.messagesByGroupId)
    ? snapshot.messagesByGroupId
    : {};
  let maxMessageId = 0;
  Object.entries(rawMessages).forEach(([groupId, value]) => {
    if (!activeGroupIds.has(groupId) || !Array.isArray(value)) {
      return;
    }

    const hydratedMessages = value
      .map((rawMessage) => {
        if (!isRecord(rawMessage)) {
          return null;
        }

        const messageId = toPositiveInt(rawMessage.id);
        const senderId = toPositiveInt(rawMessage.senderId);
        const senderName =
          typeof rawMessage.senderName === "string"
            ? rawMessage.senderName.trim().slice(0, 120)
            : "";
        const body = typeof rawMessage.body === "string" ? rawMessage.body : "";
        const createdAt = toIsoString(rawMessage.createdAt);
        if (
          !messageId ||
          !senderId ||
          !senderName ||
          !body.trim() ||
          !createdAt
        ) {
          return null;
        }

        maxMessageId = Math.max(maxMessageId, messageId);

        const hydratedMessage: GroupMessage = {
          id: messageId,
          groupId,
          senderId,
          senderName,
          body,
          createdAt,
          quoteSenderName:
            typeof rawMessage.quoteSenderName === "string"
              ? rawMessage.quoteSenderName.trim().slice(0, 120)
              : null,
          quotePreview:
            typeof rawMessage.quotePreview === "string"
              ? rawMessage.quotePreview.trim().slice(0, 220)
              : null,
        };

        const parentMessageId = toPositiveInt(rawMessage.parentMessageId);
        if (parentMessageId) {
          hydratedMessage.parentMessageId = parentMessageId;
        }

        return hydratedMessage;
      })
      .filter((message): message is GroupMessage => Boolean(message))
      .sort((a, b) => a.id - b.id)
      .slice(-MAX_GROUP_MESSAGES);

    if (hydratedMessages.length > 0) {
      groupMessages.set(groupId, hydratedMessages);
    }
  });

  groupJoinRequests.clear();
  const rawJoinRequests = isRecord(snapshot.joinRequestsByGroupId)
    ? snapshot.joinRequestsByGroupId
    : {};
  Object.entries(rawJoinRequests).forEach(([groupId, value]) => {
    if (!activeGroupIds.has(groupId) || !isRecord(value)) {
      return;
    }

    const requests = new Map<number, string>();
    Object.entries(value).forEach(([userIdKey, requestedAt]) => {
      const userId = toPositiveInt(userIdKey);
      const parsedRequestedAt = toIsoString(requestedAt);
      if (!userId || !parsedRequestedAt) {
        return;
      }
      requests.set(userId, parsedRequestedAt);
    });

    if (requests.size > 0) {
      groupJoinRequests.set(groupId, requests);
    }
  });

  groupInvitations.clear();
  const rawInvitations = Array.isArray(snapshot.invitations)
    ? snapshot.invitations
    : [];
  let maxInvitationId = 0;
  rawInvitations.forEach((rawInvitation) => {
    if (!isRecord(rawInvitation)) {
      return;
    }

    const invitationId = toPositiveInt(rawInvitation.id);
    const groupId = normalizeGroupId(rawInvitation.groupId);
    const inviterUserId = toPositiveInt(rawInvitation.inviterUserId);
    const targetUserId = toPositiveInt(rawInvitation.targetUserId);
    const createdAt = toIsoString(rawInvitation.createdAt);
    if (
      !invitationId ||
      !groupId ||
      !activeGroupIds.has(groupId) ||
      !inviterUserId ||
      !targetUserId ||
      inviterUserId === targetUserId ||
      !createdAt
    ) {
      return;
    }

    groupInvitations.set(invitationId, {
      id: invitationId,
      groupId,
      inviterUserId,
      targetUserId,
      createdAt,
    });
    maxInvitationId = Math.max(maxInvitationId, invitationId);
  });

  const parsedNextMessageId = toPositiveInt(snapshot.nextGroupMessageId);
  nextGroupMessageId = Math.max(parsedNextMessageId ?? 0, maxMessageId + 1, 1);
  const parsedNextInvitationId = toPositiveInt(snapshot.nextGroupInvitationId);
  nextGroupInvitationId = Math.max(
    parsedNextInvitationId ?? 0,
    maxInvitationId + 1,
    1,
  );
};

export const getGroupById = (groupId: string) =>
  groups.find((group) => group.id === groupId) ?? null;

const buildSummary = (group: GroupDefinition, userId: number): GroupSummary => {
  const members = getOrCreateMembers(group.id);
  const joinRequests = getOrCreateJoinRequests(group.id);
  const messages = groupMessages.get(group.id) ?? [];
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;
  const joinRequestStatus = members.has(userId)
    ? "none"
    : joinRequests.has(userId)
      ? "pending"
      : "none";
  return {
    ...group,
    joined: members.has(userId),
    isOwner: group.creatorId === userId,
    memberCount: members.size,
    lastMessagePreview: lastMessage?.body ?? "No messages yet.",
    lastMessageAt: lastMessage?.createdAt ?? null,
    joinRequestStatus,
    pendingRequestCount: joinRequests.size,
  };
};

const canListGroupForUser = (group: GroupDefinition, userId: number) => {
  if (group.groupKind === "community") {
    return true;
  }

  return getOrCreateMembers(group.id).has(userId);
};

const removeGroupInvitationsFor = (groupId: string, targetUserId?: number) => {
  let didRemove = false;
  [...groupInvitations.entries()].forEach(([invitationId, invitation]) => {
    if (
      invitation.groupId === groupId &&
      (typeof targetUserId !== "number" ||
        invitation.targetUserId === targetUserId)
    ) {
      groupInvitations.delete(invitationId);
      didRemove = true;
    }
  });
  return didRemove;
};

export const listGroupsForUser = (
  userId: number,
  options?: { scope?: "all" | "communities" | "joined" },
): GroupSummary[] => {
  const scope = options?.scope ?? "all";
  const summaries = groups
    .filter((group) => {
      if (scope === "communities") {
        return group.groupKind === "community";
      }
      if (scope === "joined") {
        return getOrCreateMembers(group.id).has(userId);
      }
      return canListGroupForUser(group, userId);
    })
    .map((group) => buildSummary(group, userId));
  return summaries.sort((a, b) => {
    if (a.joined !== b.joined) return a.joined ? -1 : 1;
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
};
export const createGroup = (
  creatorId: number,
  rawName: string,
  rawDescription: string,
  requiresApproval = false,
  avatarKey?: GroupAvatarKey,
  options?: {
    groupKind?: GroupKind;
    mainCategoryId?: CommunityCategoryId;
    subcategoryId?: CommunitySubcategoryId;
  },
) => {
  const name = normalizeGroupName(rawName);
  const description = rawDescription.trim();
  const groupId = createUniqueGroupId(name);
  const createdAt = new Date().toISOString();
  const groupKind = options?.groupKind ?? "community";
  const categorySelection =
    groupKind === "community"
      ? resolveCommunityCategorySelection(
          options?.mainCategoryId,
          options?.subcategoryId,
        ) ?? getDefaultCommunityCategorySelection()
      : { mainCategoryId: null, subcategoryId: null };
  const group: GroupDefinition = {
    id: groupId,
    name,
    description: description || "No description yet.",
    avatarKey: avatarKey ?? "orbit",
    avatarUrl: buildGroupAvatarUrl(avatarKey ?? "orbit"),
    groupKind,
    mainCategoryId: categorySelection.mainCategoryId,
    subcategoryId: categorySelection.subcategoryId,
    requiresApproval: groupKind === "community" ? requiresApproval : false,
    creatorId,
    createdAt,
  };

  groups.unshift(group);
  getOrCreateMembers(groupId).add(creatorId);
  notifyGroupStoreStateChanged();
  return buildSummary(group, creatorId);
};

export const deleteGroup = (groupId: string, requestUserId: number) => {
  const targetIndex = groups.findIndex((group) => group.id === groupId);
  if (targetIndex < 0) {
    return { deleted: false as const, reason: "not_found" as const };
  }

  const targetGroup = groups[targetIndex];
  if (targetGroup.creatorId !== requestUserId) {
    return { deleted: false as const, reason: "forbidden" as const };
  }

  groups.splice(targetIndex, 1);
  groupMembers.delete(groupId);
  groupMessages.delete(groupId);
  groupJoinRequests.delete(groupId);
  removeGroupInvitationsFor(groupId);
  notifyGroupStoreStateChanged();
  return { deleted: true as const };
};

export const joinGroup = (groupId: string, userId: number) => {
  const group = getGroupById(groupId);
  if (!group) return null;

  const members = getOrCreateMembers(groupId);
  const joinRequests = getOrCreateJoinRequests(groupId);
  const alreadyJoined = members.has(userId);
  if (alreadyJoined) {
    return {
      alreadyJoined: true,
      pendingApproval: false,
      alreadyRequested: false,
      inviteOnly: false,
      summary: buildSummary(group, userId),
    };
  }

  if (group.groupKind === "private") {
    return {
      alreadyJoined: false,
      pendingApproval: false,
      alreadyRequested: false,
      inviteOnly: true,
      summary: buildSummary(group, userId),
    };
  }

  if (group.requiresApproval && group.creatorId !== userId) {
    const alreadyRequested = joinRequests.has(userId);
    if (!alreadyRequested) {
      joinRequests.set(userId, new Date().toISOString());
      notifyGroupStoreStateChanged();
    }
    return {
      alreadyJoined: false,
      pendingApproval: true,
      alreadyRequested,
      inviteOnly: false,
      summary: buildSummary(group, userId),
    };
  }

  members.add(userId);
  joinRequests.delete(userId);
  removeGroupInvitationsFor(groupId, userId);
  notifyGroupStoreStateChanged();

  return {
    alreadyJoined: false,
    pendingApproval: false,
    alreadyRequested: false,
    inviteOnly: false,
    summary: buildSummary(group, userId),
  };
};

export const leaveGroup = (groupId: string, userId: number) => {
  const group = getGroupById(groupId);
  if (!group) return null;

  const members = getOrCreateMembers(groupId);
  const joinRequests = getOrCreateJoinRequests(groupId);
  const wasMember = members.delete(userId);
  const hadRequest = joinRequests.delete(userId);

  if (wasMember || hadRequest) {
    notifyGroupStoreStateChanged();
  }

  return {
    alreadyLeft: !wasMember,
    summary: buildSummary(group, userId),
  };
};

export const listGroupJoinRequests = (
  groupId: string,
  requestUserId: number,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { ok: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== requestUserId) {
    return { ok: false as const, reason: "forbidden" as const };
  }
  if (group.groupKind === "private") {
    return {
      ok: true as const,
      requests: [],
      summary: buildSummary(group, requestUserId),
    };
  }

  const requests = getOrCreateJoinRequests(groupId);
  const requestList: GroupJoinRequest[] = [...requests.entries()]
    .map(([userId, requestedAt]) => ({ userId, requestedAt }))
    .sort(
      (a, b) =>
        new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime(),
    );

  return {
    ok: true as const,
    requests: requestList,
    summary: buildSummary(group, requestUserId),
  };
};

export const approveGroupJoinRequest = (
  groupId: string,
  ownerUserId: number,
  targetUserId: number,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { approved: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { approved: false as const, reason: "forbidden" as const };
  }

  const requests = getOrCreateJoinRequests(groupId);
  if (!requests.has(targetUserId)) {
    return { approved: false as const, reason: "request_not_found" as const };
  }

  requests.delete(targetUserId);
  getOrCreateMembers(groupId).add(targetUserId);
  notifyGroupStoreStateChanged();
  return {
    approved: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const rejectGroupJoinRequest = (
  groupId: string,
  ownerUserId: number,
  targetUserId: number,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { rejected: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { rejected: false as const, reason: "forbidden" as const };
  }

  const requests = getOrCreateJoinRequests(groupId);
  if (!requests.has(targetUserId)) {
    return { rejected: false as const, reason: "request_not_found" as const };
  }

  requests.delete(targetUserId);
  notifyGroupStoreStateChanged();
  return {
    rejected: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const inviteUserToGroup = (
  groupId: string,
  inviterUserId: number,
  targetUserId: number,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { invited: false as const, reason: "not_found" as const };
  }
  if (inviterUserId === targetUserId) {
    return { invited: false as const, reason: "self" as const };
  }
  if (!isGroupMember(groupId, inviterUserId)) {
    return { invited: false as const, reason: "forbidden" as const };
  }
  if (isGroupMember(groupId, targetUserId)) {
    return { invited: false as const, reason: "already_member" as const };
  }

  const existingInvitation = [...groupInvitations.values()].find(
    (invitation) =>
      invitation.groupId === groupId &&
      invitation.targetUserId === targetUserId,
  );
  if (existingInvitation) {
    return {
      invited: true as const,
      alreadyInvited: true,
      invitation: { ...existingInvitation },
      summary: buildSummary(group, inviterUserId),
    };
  }

  const invitation: GroupInvitation = {
    id: nextGroupInvitationId++,
    groupId,
    inviterUserId,
    targetUserId,
    createdAt: new Date().toISOString(),
  };
  groupInvitations.set(invitation.id, invitation);
  notifyGroupStoreStateChanged();
  return {
    invited: true as const,
    alreadyInvited: false,
    invitation: { ...invitation },
    summary: buildSummary(group, inviterUserId),
  };
};

export const listGroupInvitationsForUser = (targetUserId: number) =>
  [...groupInvitations.values()]
    .filter((invitation) => invitation.targetUserId === targetUserId)
    .map((invitation) => {
      const group = getGroupById(invitation.groupId);
      if (!group) {
        return null;
      }
      return {
        invitation: { ...invitation },
        summary: buildSummary(group, targetUserId),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort(
      (a, b) =>
        new Date(b.invitation.createdAt).getTime() -
        new Date(a.invitation.createdAt).getTime(),
    );

export const acceptGroupInvitation = (
  invitationId: number,
  targetUserId: number,
) => {
  const invitation = groupInvitations.get(invitationId);
  if (!invitation) {
    return { accepted: false as const, reason: "not_found" as const };
  }
  if (invitation.targetUserId !== targetUserId) {
    return { accepted: false as const, reason: "forbidden" as const };
  }

  const group = getGroupById(invitation.groupId);
  if (!group) {
    groupInvitations.delete(invitationId);
    notifyGroupStoreStateChanged();
    return { accepted: false as const, reason: "group_not_found" as const };
  }

  const members = getOrCreateMembers(invitation.groupId);
  const alreadyMember = members.has(targetUserId);
  members.add(targetUserId);
  getOrCreateJoinRequests(invitation.groupId).delete(targetUserId);
  groupInvitations.delete(invitationId);
  notifyGroupStoreStateChanged();

  return {
    accepted: true as const,
    alreadyMember,
    summary: buildSummary(group, targetUserId),
  };
};

export const rejectGroupInvitation = (
  invitationId: number,
  targetUserId: number,
) => {
  const invitation = groupInvitations.get(invitationId);
  if (!invitation) {
    return { rejected: false as const, reason: "not_found" as const };
  }
  if (invitation.targetUserId !== targetUserId) {
    return { rejected: false as const, reason: "forbidden" as const };
  }

  groupInvitations.delete(invitationId);
  notifyGroupStoreStateChanged();
  const group = getGroupById(invitation.groupId);
  return {
    rejected: true as const,
    summary: group ? buildSummary(group, targetUserId) : null,
  };
};

export const updateGroupJoinPolicy = (
  groupId: string,
  ownerUserId: number,
  requiresApproval: boolean,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { updated: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { updated: false as const, reason: "forbidden" as const };
  }
  if (group.groupKind === "private") {
    return { updated: false as const, reason: "private_group" as const };
  }

  const previousRequiresApproval = group.requiresApproval;

  group.requiresApproval = requiresApproval;
  let didMutate = previousRequiresApproval !== requiresApproval;
  if (!requiresApproval) {
    // Switching to open join auto-approves existing pending requests.
    const requests = getOrCreateJoinRequests(groupId);
    const members = getOrCreateMembers(groupId);
    const pendingCountBefore = requests.size;
    requests.forEach((_, userId) => {
      members.add(userId);
    });
    requests.clear();
    if (pendingCountBefore > 0) {
      didMutate = true;
    }
  }

  if (didMutate) {
    notifyGroupStoreStateChanged();
  }

  return {
    updated: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const updateGroupAvatar = (
  groupId: string,
  ownerUserId: number,
  avatarKey: GroupAvatarKey,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { updated: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { updated: false as const, reason: "forbidden" as const };
  }

  if (group.avatarKey === avatarKey) {
    return {
      updated: true as const,
      summary: buildSummary(group, ownerUserId),
    };
  }

  group.avatarKey = avatarKey;
  group.avatarUrl = buildGroupAvatarUrl(avatarKey);
  notifyGroupStoreStateChanged();
  return {
    updated: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const removeGroupMember = (
  groupId: string,
  ownerUserId: number,
  targetUserId: number,
) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { removed: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { removed: false as const, reason: "forbidden" as const };
  }
  if (targetUserId === group.creatorId) {
    return { removed: false as const, reason: "owner" as const };
  }

  const members = getOrCreateMembers(groupId);
  const wasMember = members.delete(targetUserId);
  getOrCreateJoinRequests(groupId).delete(targetUserId);
  removeGroupInvitationsFor(groupId, targetUserId);

  if (wasMember) {
    notifyGroupStoreStateChanged();
  }

  return {
    removed: true as const,
    alreadyRemoved: !wasMember,
    summary: buildSummary(group, ownerUserId),
  };
};

export const isGroupMember = (groupId: string, userId: number) => {
  const members = groupMembers.get(groupId);
  if (!members) return false;
  return members.has(userId);
};

export const listGroupMemberIds = (groupId: string) => {
  const members = groupMembers.get(groupId);
  if (!members) return [];
  return [...members];
};

export const listGroupMessages = (groupId: string): GroupMessage[] => {
  const messages = groupMessages.get(groupId);
  return messages ? [...messages] : [];
};

export const appendGroupMessage = (
  groupId: string,
  sender: SessionUser,
  body: string,
  quote?: {
    parentMessageId?: number | null;
    quoteSenderName?: string | null;
    quotePreview?: string | null;
  },
): GroupMessage => {
  const messages = groupMessages.get(groupId) ?? [];
  const senderName =
    sender.name?.trim() ||
    sender.cleanId ||
    sender.email.split("@")[0] ||
    "User";
  const message: GroupMessage = {
    id: nextGroupMessageId++,
    groupId,
    senderId: sender.id,
    senderName,
    body,
    createdAt: new Date().toISOString(),
    parentMessageId:
      typeof quote?.parentMessageId === "number" && quote.parentMessageId > 0
        ? quote.parentMessageId
        : null,
    quoteSenderName: quote?.quoteSenderName?.trim() || null,
    quotePreview: quote?.quotePreview?.trim() || null,
  };

  messages.push(message);
  if (messages.length > MAX_GROUP_MESSAGES) {
    messages.splice(0, messages.length - MAX_GROUP_MESSAGES);
  }
  groupMessages.set(groupId, messages);
  notifyGroupStoreStateChanged();

  return message;
};

export const deleteGroupMessage = (
  groupId: string,
  messageId: number,
  requestUserId: number,
) => {
  const messages = groupMessages.get(groupId);
  if (!messages) {
    return { deleted: false as const, reason: "not_found" as const };
  }

  const targetIndex = messages.findIndex((message) => message.id === messageId);
  if (targetIndex < 0) {
    return { deleted: false as const, reason: "not_found" as const };
  }

  const targetMessage = messages[targetIndex];
  if (targetMessage.senderId !== requestUserId) {
    return { deleted: false as const, reason: "forbidden" as const };
  }

  const recalledMessage: GroupMessage = {
    ...targetMessage,
    body: RECALLED_MESSAGE_BODY,
    parentMessageId: null,
    quoteSenderName: null,
    quotePreview: null,
  };

  messages[targetIndex] = recalledMessage;
  groupMessages.set(groupId, messages);
  notifyGroupStoreStateChanged();
  return { deleted: true as const, message: recalledMessage };
};
