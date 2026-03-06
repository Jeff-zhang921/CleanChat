type SessionUser = {
  id: number;
  email: string;
  name: string | null;
  cleanId: string;
};

export type GroupDefinition = {
  id: string;
  name: string;
  description: string;
  avatarUrl: string;
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
};

const SYSTEM_GROUP_CREATED_AT = new Date().toISOString();

let groups: GroupDefinition[] = [
  {
    id: "frontend-lab",
    name: "Frontend Lab",
    description: "UI ideas, React tricks, and CSS polishing.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=FrontendLab",
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
  {
    id: "backend-hub",
    name: "Backend Hub",
    description: "API design, Prisma, auth, and deployment topics.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=BackendHub",
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
  {
    id: "debug-clinic",
    name: "Debug Clinic",
    description: "Post issues, get help, and share root causes.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=DebugClinic",
    creatorId: null,
    createdAt: SYSTEM_GROUP_CREATED_AT,
  },
];

const groupMembers = new Map<string, Set<number>>();
const groupMessages = new Map<string, GroupMessage[]>();
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
  const messages = groupMessages.get(group.id) ?? [];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  return {
    ...group,
    joined: members.has(userId),
    isOwner: group.creatorId === userId,
    memberCount: members.size,
    lastMessagePreview: lastMessage?.body ?? "No messages yet.",
    lastMessageAt: lastMessage?.createdAt ?? null,
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
export const createGroup = (creatorId: number, rawName: string, rawDescription: string) => {
  const name = normalizeGroupName(rawName);
  const description = rawDescription.trim();
  const groupId = createUniqueGroupId(name);
  const createdAt = new Date().toISOString();
  const group: GroupDefinition = {
    id: groupId,
    name,
    description: description || "No description yet.",
    avatarUrl: `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(groupId)}`,
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
  return { deleted: true as const };
};

export const joinGroup = (groupId: string, userId: number) => {
  const group = getGroupById(groupId);
  if (!group) return null;

  const members = getOrCreateMembers(groupId);
  const alreadyJoined = members.has(userId);
  members.add(userId);

  return {
    alreadyJoined,
    summary: buildSummary(group, userId),
  };
};

export const leaveGroup = (groupId: string, userId: number) => {
  const group = getGroupById(groupId);
  if (!group) return null;

  const members = getOrCreateMembers(groupId);
  const wasMember = members.delete(userId);

  return {
    alreadyLeft: !wasMember,
    summary: buildSummary(group, userId),
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
