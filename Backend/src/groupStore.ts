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

export type GroupDefinition = {
  id: string;
  name: string;
  description: string;
  avatarKey: GroupAvatarKey;
  avatarUrl: string;
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
};

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

const SYSTEM_GROUP_CREATED_AT = new Date().toISOString();

let groups: GroupDefinition[] = [
  {
    id: "frontend-lab",
    name: "Frontend Lab",
    description: "UI ideas, React tricks, and CSS polishing.",
    avatarKey: "pixel",
    avatarUrl: buildGroupAvatarUrl("pixel"),
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
    requiresApproval: false,
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
];

const groupMembers = new Map<string, Set<number>>();
const groupMessages = new Map<string, GroupMessage[]>();
const groupJoinRequests = new Map<string, Map<number, string>>();
let nextGroupMessageId = 1;

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

export const getGroupById = (groupId: string) => groups.find((group) => group.id === groupId) ?? null;

const buildSummary = (group: GroupDefinition, userId: number): GroupSummary => {
  const members = getOrCreateMembers(group.id);
  const joinRequests = getOrCreateJoinRequests(group.id);
  const messages = groupMessages.get(group.id) ?? [];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  const joinRequestStatus = members.has(userId) ? "none" : joinRequests.has(userId) ? "pending" : "none";
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

export const listGroupsForUser = (userId: number): GroupSummary[] => {
  const summaries = groups.map((group) => buildSummary(group, userId));
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
  avatarKey?: GroupAvatarKey
) => {
  const name = normalizeGroupName(rawName);
  const description = rawDescription.trim();
  const groupId = createUniqueGroupId(name);
  const createdAt = new Date().toISOString();
  const group: GroupDefinition = {
    id: groupId,
    name,
    description: description || "No description yet.",
    avatarKey: avatarKey ?? "orbit",
    avatarUrl: buildGroupAvatarUrl(avatarKey ?? "orbit"),
    requiresApproval,
    creatorId,
    createdAt,
  };

  groups.unshift(group);
  getOrCreateMembers(groupId).add(creatorId);
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
      summary: buildSummary(group, userId),
    };
  }

  if (group.requiresApproval && group.creatorId !== userId) {
    const alreadyRequested = joinRequests.has(userId);
    if (!alreadyRequested) {
      joinRequests.set(userId, new Date().toISOString());
    }
    return {
      alreadyJoined: false,
      pendingApproval: true,
      alreadyRequested,
      summary: buildSummary(group, userId),
    };
  }

  members.add(userId);
  joinRequests.delete(userId);

  return {
    alreadyJoined: false,
    pendingApproval: false,
    alreadyRequested: false,
    summary: buildSummary(group, userId),
  };
};

export const leaveGroup = (groupId: string, userId: number) => {
  const group = getGroupById(groupId);
  if (!group) return null;

  const members = getOrCreateMembers(groupId);
  const joinRequests = getOrCreateJoinRequests(groupId);
  const wasMember = members.delete(userId);
  joinRequests.delete(userId);

  return {
    alreadyLeft: !wasMember,
    summary: buildSummary(group, userId),
  };
};

export const listGroupJoinRequests = (groupId: string, requestUserId: number) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { ok: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== requestUserId) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  const requests = getOrCreateJoinRequests(groupId);
  const requestList: GroupJoinRequest[] = [...requests.entries()]
    .map(([userId, requestedAt]) => ({ userId, requestedAt }))
    .sort((a, b) => new Date(a.requestedAt).getTime() - new Date(b.requestedAt).getTime());

  return {
    ok: true as const,
    requests: requestList,
    summary: buildSummary(group, requestUserId),
  };
};

export const approveGroupJoinRequest = (groupId: string, ownerUserId: number, targetUserId: number) => {
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
  return {
    approved: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const rejectGroupJoinRequest = (groupId: string, ownerUserId: number, targetUserId: number) => {
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
  return {
    rejected: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const updateGroupJoinPolicy = (groupId: string, ownerUserId: number, requiresApproval: boolean) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { updated: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { updated: false as const, reason: "forbidden" as const };
  }

  group.requiresApproval = requiresApproval;
  if (!requiresApproval) {
    // Switching to open join auto-approves existing pending requests.
    const requests = getOrCreateJoinRequests(groupId);
    const members = getOrCreateMembers(groupId);
    requests.forEach((_, userId) => {
      members.add(userId);
    });
    requests.clear();
  }

  return {
    updated: true as const,
    summary: buildSummary(group, ownerUserId),
  };
};

export const updateGroupAvatar = (groupId: string, ownerUserId: number, avatarKey: GroupAvatarKey) => {
  const group = getGroupById(groupId);
  if (!group) {
    return { updated: false as const, reason: "not_found" as const };
  }
  if (group.creatorId !== ownerUserId) {
    return { updated: false as const, reason: "forbidden" as const };
  }

  group.avatarKey = avatarKey;
  group.avatarUrl = buildGroupAvatarUrl(avatarKey);
  return {
    updated: true as const,
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

export const appendGroupMessage = (groupId: string, sender: SessionUser, body: string): GroupMessage => {
  const messages = groupMessages.get(groupId) ?? [];
  const senderName = sender.name?.trim() || sender.cleanId || sender.email.split("@")[0] || "User";
  const message: GroupMessage = {
    id: nextGroupMessageId++,
    groupId,
    senderId: sender.id,
    senderName,
    body,
    createdAt: new Date().toISOString(),
  };

  messages.push(message);
  if (messages.length > MAX_GROUP_MESSAGES) {
    messages.splice(0, messages.length - MAX_GROUP_MESSAGES);
  }
  groupMessages.set(groupId, messages);

  return message;
};

export const deleteGroupMessage = (groupId: string, messageId: number, requestUserId: number) => {
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

  messages.splice(targetIndex, 1);
  groupMessages.set(groupId, messages);
  return { deleted: true as const, message: targetMessage };
};
