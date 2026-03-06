export type GroupAvatarKey = "orbit" | "pixel" | "flare" | "bloom" | "canyon" | "tide";

const toAvatarUrl = (key: GroupAvatarKey) =>
  `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(key)}`;

export const GROUP_AVATAR_OPTIONS: Array<{ key: GroupAvatarKey; label: string; url: string }> = [
  { key: "orbit", label: "Orbit", url: toAvatarUrl("orbit") },
  { key: "pixel", label: "Pixel", url: toAvatarUrl("pixel") },
  { key: "flare", label: "Flare", url: toAvatarUrl("flare") },
  { key: "bloom", label: "Bloom", url: toAvatarUrl("bloom") },
  { key: "canyon", label: "Canyon", url: toAvatarUrl("canyon") },
  { key: "tide", label: "Tide", url: toAvatarUrl("tide") },
];
