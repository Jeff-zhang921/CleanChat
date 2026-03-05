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
  memberCount: number;
  lastMessagePreview: string;
  lastMessageAt: string | null;
};

const GROUPS: GroupDefinition[] = [
  {
    id: "frontend-lab",
    name: "Frontend Lab",
    description: "UI ideas, React tricks, and CSS polishing.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=FrontendLab",
  },
  {
    id: "backend-hub",
    name: "Backend Hub",
    description: "API design, Prisma, auth, and deployment topics.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=BackendHub",
  },
  {
    id: "debug-clinic",
    name: "Debug Clinic",
    description: "Post issues, get help, and share root causes.",
    avatarUrl: "https://api.dicebear.com/9.x/shapes/svg?seed=DebugClinic",
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

export const normalizeGroupId = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!GROUP_ID_REGEX.test(normalized)) return null;
  return normalized;
};

export const getGroupById = (groupId: string) => GROUPS.find((group) => group.id === groupId) ?? null;

const buildSummary = (group: GroupDefinition, userId: number): GroupSummary => {
  const members = getOrCreateMembers(group.id);
  const messages = groupMessages.get(group.id) ?? [];
  const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
  return {
    ...group,
    joined: members.has(userId),
    memberCount: members.size,
    lastMessagePreview: lastMessage?.body ?? "No messages yet.",
    lastMessageAt: lastMessage?.createdAt ?? null,
  };
};

export const listGroupsForUser = (userId: number): GroupSummary[] => {
  const groups = GROUPS.map((group) => buildSummary(group, userId));
  return groups.sort((a, b) => {
    if (a.joined !== b.joined) return a.joined ? -1 : 1;
    const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return bTime - aTime;
  });
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
