import { Avatar } from "@prisma/client";

export const AVATAR_URLS: Record<Avatar, string> = {
  [Avatar.AVATAR_LEO]: "https://api.dicebear.com/7.x/avataaars/svg?seed=Leo",
  [Avatar.AVATAR_SOPHIE]: "https://api.dicebear.com/7.x/avataaars/svg?seed=Sophie",
  [Avatar.AVATAR_MAX]: "https://api.dicebear.com/7.x/avataaars/svg?seed=Max",
  [Avatar.AVATAR_BELLA]: "https://api.dicebear.com/7.x/avataaars/svg?seed=Bella",
  [Avatar.AVATAR_CHARLIE]: "https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie",
  [Avatar.AVATAR_AVERY]: "https://api.dicebear.com/9.x/adventurer/svg?seed=Avery",
  [Avatar.AVATAR_RILEY]: "https://api.dicebear.com/9.x/lorelei/svg?seed=Riley",
  [Avatar.AVATAR_JORDAN]: "https://api.dicebear.com/9.x/adventurer/svg?seed=Jordan",
  [Avatar.AVATAR_SKYLER]: "https://api.dicebear.com/9.x/lorelei/svg?seed=Skyler",
  [Avatar.AVATAR_MORGAN]: "https://api.dicebear.com/9.x/adventurer/svg?seed=Morgan",
};

export const DEFAULT_AVATAR = Avatar.AVATAR_LEO;

export function avatarUrl(avatar: Avatar): string {
  return AVATAR_URLS[avatar];
}
