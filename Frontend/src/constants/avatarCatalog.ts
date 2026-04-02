import {
  FALLBACK_CLEAN_ID_TRUST,
  type CleanIdTrustSnapshot,
} from "../utils/cleanIdTrust";

export const AVATAR_KEYS = [
  "AVATAR_LEO",
  "AVATAR_SOPHIE",
  "AVATAR_MAX",
  "AVATAR_BELLA",
  "AVATAR_CHARLIE",
  "AVATAR_ALMA",
  "AVATAR_THEO",
  "AVATAR_IONA",
  "AVATAR_LARK",
  "AVATAR_MINA",
  "AVATAR_CEDAR",
  "AVATAR_ORIEL",
  "AVATAR_LINA",
  "AVATAR_REMY",
  "AVATAR_NOOR",
  "AVATAR_AVERY",
  "AVATAR_RILEY",
  "AVATAR_JORDAN",
  "AVATAR_SKYLER",
  "AVATAR_MORGAN",
  "AVATAR_MIRO",
  "AVATAR_ELIO",
  "AVATAR_TAVI",
  "AVATAR_BRIAR",
  "AVATAR_SENA",
  "AVATAR_AIRI",
  "AVATAR_REN",
  "AVATAR_NAMI",
  "AVATAR_KIKO",
  "AVATAR_YUTA",
  "AVATAR_HINA",
  "AVATAR_AOBA",
  "AVATAR_MEI",
  "AVATAR_SORA",
  "AVATAR_KAEDE",
  "AVATAR_YORI",
  "AVATAR_MIO",
  "AVATAR_AKARI",
  "AVATAR_RIN",
  "AVATAR_HARU",
] as const;

export type AvatarKey = (typeof AVATAR_KEYS)[number];
export type AvatarTier = "starter" | "active" | "trusted";

export type AvatarOption = {
  key: AvatarKey;
  label: string;
  family: string;
  tier: AvatarTier;
  url: string;
};

export type AvatarTierAccess = {
  unlocked: boolean;
  title: string;
  hint: string;
};

export type AvatarAccess = {
  currentTier: AvatarTier;
  availableKeys: AvatarKey[];
  tiers: Record<AvatarTier, AvatarTierAccess>;
};

type StarterSeed = {
  key: AvatarKey;
  label: string;
  background: string;
  wash: string;
  skin: string;
  hair: string;
  shirt: string;
  line: string;
  accent: string;
  hairShape: "bob" | "crop" | "wave" | "veil" | "bun";
  mark: "leaf" | "arc" | "grid" | "ribbon";
};

type MarbleSeed = {
  key: AvatarKey;
  label: string;
  stone: string;
  stoneDark: string;
  fog: string;
  accent: string;
  profile: "left" | "right";
  crown: "halo" | "laurel" | "veil" | "arch";
  fracture: "ring" | "scar" | "grain" | "dust";
};

type EtherSeed = {
  key: AvatarKey;
  label: string;
  base: string;
  obsidian: string;
  glowA: string;
  glowB: string;
  glowC: string;
  form: "arch" | "spire" | "orb" | "crown" | "veil";
};

const ACTIVE_UNLOCK_RECENT_MESSAGES = 8;
const ACTIVE_UNLOCK_TOTAL_MESSAGES = 12;
const TRUSTED_UNLOCK_SCORE = 64;

const FAMILY_BY_TIER: Record<AvatarTier, string> = {
  starter: "Minimalist Characters",
  active: "Classical Marble Portraits",
  trusted: "Ethereal Light Forms",
};

export const DEFAULT_AVATAR_KEY: AvatarKey = "AVATAR_LEO";

export const AVATAR_TIER_META: Record<
  AvatarTier,
  {
    eyebrow: string;
    title: string;
    description: string;
  }
> = {
  starter: {
    eyebrow: "Level 1",
    title: "Minimalist Characters",
    description:
      "Low-saturation human portraits with quiet line work, clean posture, and almost no ornament.",
  },
  active: {
    eyebrow: "Level 2",
    title: "Classical Marble Portraits",
    description:
      "Grayscale museum figures with illustrated marble texture, profile restraint, and old-money gravity.",
  },
  trusted: {
    eyebrow: "Level 3",
    title: "Ethereal Light Forms",
    description:
      "Abstract human silhouettes built from cosmic light, obsidian shadow, and silence rather than facial detail.",
  },
};

export const AVATAR_TIER_ORDER: AvatarTier[] = ["starter", "active", "trusted"];

const STARTER_SEEDS: StarterSeed[] = [
  { key: "AVATAR_LEO", label: "Maple", background: "#F4EFE7", wash: "#EEE7DE", skin: "#E8D2C5", hair: "#6D675F", shirt: "#98A89E", line: "#57514A", accent: "#C7D2C1", hairShape: "bob", mark: "leaf" },
  { key: "AVATAR_SOPHIE", label: "Juniper", background: "#EEF2F2", wash: "#E7ECEB", skin: "#EAD8CB", hair: "#5B6670", shirt: "#8EA1AE", line: "#4D565D", accent: "#CBD5DA", hairShape: "wave", mark: "arc" },
  { key: "AVATAR_MAX", label: "Wren", background: "#F5EEE7", wash: "#EDE4DC", skin: "#E7D0C2", hair: "#735D56", shirt: "#B0988D", line: "#594841", accent: "#D9C4B9", hairShape: "crop", mark: "grid" },
  { key: "AVATAR_BELLA", label: "Sol", background: "#EEF4F1", wash: "#E5EDE9", skin: "#ECD7C9", hair: "#516A66", shirt: "#7FA29A", line: "#475552", accent: "#C4D9D1", hairShape: "bun", mark: "leaf" },
  { key: "AVATAR_CHARLIE", label: "Olive", background: "#F2F0E6", wash: "#EAE7DB", skin: "#E7D0C2", hair: "#625E52", shirt: "#95A089", line: "#4E4B42", accent: "#D2D0BF", hairShape: "wave", mark: "ribbon" },
  { key: "AVATAR_ALMA", label: "Alma", background: "#F1EEF3", wash: "#E8E5EC", skin: "#EAD4C8", hair: "#665D77", shirt: "#A298BB", line: "#554F62", accent: "#D6D0E1", hairShape: "bob", mark: "arc" },
  { key: "AVATAR_THEO", label: "Theo", background: "#F0F4F7", wash: "#E8EDF2", skin: "#E9D4C8", hair: "#68758A", shirt: "#9EB5C8", line: "#546174", accent: "#D4DFE9", hairShape: "crop", mark: "grid" },
  { key: "AVATAR_IONA", label: "Iona", background: "#EEF5F3", wash: "#E5EFEC", skin: "#E9D7CB", hair: "#586865", shirt: "#95B0A8", line: "#4B5A57", accent: "#D0E0DA", hairShape: "veil", mark: "leaf" },
  { key: "AVATAR_LARK", label: "Lark", background: "#F7F0E8", wash: "#F0E6DC", skin: "#EBD3C6", hair: "#6B5E57", shirt: "#C09A89", line: "#5A4B44", accent: "#E0C7BA", hairShape: "wave", mark: "arc" },
  { key: "AVATAR_MINA", label: "Mina", background: "#EFF2F4", wash: "#E8ECEE", skin: "#EAD6CB", hair: "#5A6470", shirt: "#A0ADB8", line: "#4D5660", accent: "#D1D9DE", hairShape: "crop", mark: "ribbon" },
  { key: "AVATAR_CEDAR", label: "Cedar", background: "#F5EFE8", wash: "#EDE6DE", skin: "#E6CEC2", hair: "#6A564E", shirt: "#8D9986", line: "#534640", accent: "#D5C5B8", hairShape: "veil", mark: "grid" },
  { key: "AVATAR_ORIEL", label: "Oriel", background: "#F3EFE8", wash: "#ECE5DB", skin: "#EAD5C8", hair: "#6A655E", shirt: "#A9A08C", line: "#575149", accent: "#D8D0C0", hairShape: "wave", mark: "leaf" },
  { key: "AVATAR_LINA", label: "Lina", background: "#EEF4F2", wash: "#E5ECEA", skin: "#EBD7C9", hair: "#536B67", shirt: "#85A79F", line: "#485854", accent: "#CADED8", hairShape: "bun", mark: "arc" },
  { key: "AVATAR_REMY", label: "Remy", background: "#F0EEF2", wash: "#E7E4EB", skin: "#E6D0C5", hair: "#645D70", shirt: "#9F94AF", line: "#534D5F", accent: "#D4CDDE", hairShape: "crop", mark: "grid" },
  { key: "AVATAR_NOOR", label: "Noor", background: "#F3F0E6", wash: "#EBE7DB", skin: "#E9D4C7", hair: "#605B50", shirt: "#98A18C", line: "#4E4A41", accent: "#D3D0C1", hairShape: "bob", mark: "ribbon" },
];

const ACTIVE_SEEDS: MarbleSeed[] = [
  { key: "AVATAR_AVERY", label: "Sable", stone: "#D8D4CF", stoneDark: "#8A857F", fog: "#F1EEE9", accent: "#C3B9AF", profile: "left", crown: "halo", fracture: "ring" },
  { key: "AVATAR_RILEY", label: "Ellis", stone: "#D6D3CE", stoneDark: "#8E8881", fog: "#EEEAE4", accent: "#BFB4A8", profile: "right", crown: "laurel", fracture: "scar" },
  { key: "AVATAR_JORDAN", label: "Haze", stone: "#D9D6D1", stoneDark: "#8A857E", fog: "#F2EFEB", accent: "#C7BCB1", profile: "left", crown: "arch", fracture: "grain" },
  { key: "AVATAR_SKYLER", label: "Clove", stone: "#D7D3CC", stoneDark: "#8B857B", fog: "#EEEAE3", accent: "#C3B7AD", profile: "right", crown: "veil", fracture: "dust" },
  { key: "AVATAR_MORGAN", label: "Rowan", stone: "#D5D1CB", stoneDark: "#827D78", fog: "#ECE8E2", accent: "#B8B0A6", profile: "left", crown: "halo", fracture: "scar" },
  { key: "AVATAR_MIRO", label: "Miro", stone: "#DCD8D1", stoneDark: "#928A83", fog: "#F4F1EB", accent: "#C7BBB0", profile: "right", crown: "arch", fracture: "ring" },
  { key: "AVATAR_ELIO", label: "Elio", stone: "#D8D5D0", stoneDark: "#8E877F", fog: "#F1EDE7", accent: "#C2B7AB", profile: "left", crown: "laurel", fracture: "grain" },
  { key: "AVATAR_TAVI", label: "Tavi", stone: "#D4D0CA", stoneDark: "#827B74", fog: "#ECE8E1", accent: "#BBB1A6", profile: "right", crown: "halo", fracture: "dust" },
  { key: "AVATAR_BRIAR", label: "Briar", stone: "#D7D4CE", stoneDark: "#8A837C", fog: "#EFEBE4", accent: "#C3B8AE", profile: "left", crown: "veil", fracture: "scar" },
  { key: "AVATAR_SENA", label: "Sena", stone: "#DAD7D2", stoneDark: "#908983", fog: "#F3EFEA", accent: "#C8BCB1", profile: "right", crown: "laurel", fracture: "ring" },
];

const TRUSTED_SEEDS: EtherSeed[] = [
  { key: "AVATAR_AIRI", label: "Airi", base: "#0F1319", obsidian: "#1B2027", glowA: "#8A97A7", glowB: "#C4CCD5", glowC: "#697789", form: "arch" },
  { key: "AVATAR_REN", label: "Ren", base: "#10151D", obsidian: "#1D222C", glowA: "#8794A6", glowB: "#CAD1DA", glowC: "#647487", form: "spire" },
  { key: "AVATAR_NAMI", label: "Nami", base: "#11161B", obsidian: "#1D242A", glowA: "#7D8F9B", glowB: "#C1CCD3", glowC: "#5E7283", form: "orb" },
  { key: "AVATAR_KIKO", label: "Kiko", base: "#121417", obsidian: "#20242B", glowA: "#8D95A0", glowB: "#D0D5DB", glowC: "#717A87", form: "crown" },
  { key: "AVATAR_YUTA", label: "Yuta", base: "#101419", obsidian: "#1B2228", glowA: "#7B90A2", glowB: "#BCC9D2", glowC: "#596E80", form: "veil" },
  { key: "AVATAR_HINA", label: "Hina", base: "#0F141A", obsidian: "#1B232A", glowA: "#7E8B97", glowB: "#C7CFD7", glowC: "#64707F", form: "arch" },
  { key: "AVATAR_AOBA", label: "Aoba", base: "#11161E", obsidian: "#1E2430", glowA: "#8696A8", glowB: "#CBD3DC", glowC: "#687A8F", form: "orb" },
  { key: "AVATAR_MEI", label: "Mei", base: "#121317", obsidian: "#20232A", glowA: "#8D8F9D", glowB: "#D1D3D8", glowC: "#757887", form: "crown" },
  { key: "AVATAR_SORA", label: "Sora", base: "#0F151B", obsidian: "#1B242E", glowA: "#8292A0", glowB: "#C7D1D9", glowC: "#607285", form: "spire" },
  { key: "AVATAR_KAEDE", label: "Kaede", base: "#101418", obsidian: "#1D2328", glowA: "#7E8B95", glowB: "#C6CDD4", glowC: "#646F7C", form: "veil" },
  { key: "AVATAR_YORI", label: "Yori", base: "#11161D", obsidian: "#1F2630", glowA: "#8594A7", glowB: "#CAD3DB", glowC: "#67778A", form: "arch" },
  { key: "AVATAR_MIO", label: "Mio", base: "#111418", obsidian: "#1D2128", glowA: "#878B98", glowB: "#D1D4D9", glowC: "#717580", form: "orb" },
  { key: "AVATAR_AKARI", label: "Akari", base: "#101519", obsidian: "#1A2228", glowA: "#80909D", glowB: "#C9D0D7", glowC: "#61717E", form: "crown" },
  { key: "AVATAR_RIN", label: "Rin", base: "#0F151C", obsidian: "#1B2431", glowA: "#7A8FA5", glowB: "#BFCCD7", glowC: "#5B738A", form: "spire" },
  { key: "AVATAR_HARU", label: "Haru", base: "#111419", obsidian: "#1E232A", glowA: "#878F99", glowB: "#D0D4DA", glowC: "#6E7882", form: "veil" },
];

const STARTER_KEYS = STARTER_SEEDS.map((seed) => seed.key);
const ACTIVE_KEYS = ACTIVE_SEEDS.map((seed) => seed.key);
const TRUSTED_KEYS = TRUSTED_SEEDS.map((seed) => seed.key);

const encodeSvg = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const renderStarterHair = (seed: StarterSeed) => {
  switch (seed.hairShape) {
    case "crop":
      return `
        <path d="M44 74C48 44 68 28 86 28C108 28 120 44 118 70C100 80 80 84 54 80Z" fill="${seed.hair}"/>
        <path d="M58 42C74 34 92 34 108 44" stroke="${seed.line}" stroke-opacity="0.16" stroke-width="2.6" stroke-linecap="round"/>
      `;
    case "wave":
      return `
        <path d="M38 84C40 44 66 22 88 24C114 26 126 48 122 86C114 102 102 112 82 116C58 120 44 106 38 84Z" fill="${seed.hair}"/>
        <path d="M40 88C52 108 66 120 86 124" stroke="${seed.line}" stroke-opacity="0.18" stroke-width="2.2" stroke-linecap="round"/>
      `;
    case "veil":
      return `
        <path d="M40 84C40 46 64 22 86 22C110 22 124 42 124 80C118 100 108 114 84 118C58 122 44 108 40 84Z" fill="${seed.hair}"/>
        <path d="M34 84C42 108 54 124 70 134" stroke="${seed.hair}" stroke-opacity="0.72" stroke-width="8" stroke-linecap="round"/>
      `;
    case "bun":
      return `
        <circle cx="108" cy="42" r="14" fill="${seed.hair}"/>
        <path d="M44 84C44 46 66 24 86 24C108 24 124 42 122 80C116 98 104 112 84 116C60 120 46 106 44 84Z" fill="${seed.hair}"/>
        <path d="M56 42C72 30 96 30 114 44" stroke="${seed.line}" stroke-opacity="0.16" stroke-width="2.6" stroke-linecap="round"/>
      `;
    default:
      return `
        <path d="M42 84C42 46 66 22 88 22C110 22 124 42 122 82C116 100 102 112 82 116C60 120 46 108 42 84Z" fill="${seed.hair}"/>
        <path d="M54 46C68 34 94 32 112 46" stroke="${seed.line}" stroke-opacity="0.18" stroke-width="2.4" stroke-linecap="round"/>
      `;
  }
};

const renderStarterMark = (seed: StarterSeed) => {
  switch (seed.mark) {
    case "grid":
      return `
        <path d="M22 44H138" stroke="${seed.accent}" stroke-width="1.2" stroke-opacity="0.28"/>
        <path d="M22 88H138" stroke="${seed.accent}" stroke-width="1.2" stroke-opacity="0.18"/>
        <path d="M52 20V140" stroke="${seed.accent}" stroke-width="1.2" stroke-opacity="0.18"/>
      `;
    case "leaf":
      return `
        <path d="M28 122C34 100 50 88 70 84" stroke="${seed.accent}" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.26"/>
        <path d="M124 42C112 50 102 62 96 76" stroke="${seed.accent}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.18"/>
      `;
    case "ribbon":
      return `
        <path d="M18 112C44 92 66 86 86 88C108 90 124 100 142 118" stroke="${seed.accent}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.22"/>
        <path d="M24 120C48 104 70 100 90 102C114 104 128 110 140 126" stroke="${seed.accent}" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.14"/>
      `;
    default:
      return `
        <circle cx="122" cy="38" r="18" fill="${seed.accent}" fill-opacity="0.14"/>
        <circle cx="122" cy="38" r="28" stroke="${seed.accent}" stroke-width="1" stroke-opacity="0.18"/>
      `;
  }
};

const buildStarterAvatar = (seed: StarterSeed) =>
  encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="20" y1="18" x2="142" y2="146" gradientUnits="userSpaceOnUse">
          <stop stop-color="${seed.background}"/>
          <stop offset="1" stop-color="${seed.wash}"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <rect x="12" y="12" width="136" height="136" rx="28" stroke="${seed.line}" stroke-opacity="0.08"/>
      ${renderStarterMark(seed)}
      <ellipse cx="80" cy="118" rx="56" ry="28" fill="${seed.accent}" fill-opacity="0.22"/>
      <path d="M40 156C44 130 58 118 80 118C102 118 116 130 120 156H40Z" fill="${seed.shirt}"/>
      <ellipse cx="80" cy="86" rx="34" ry="40" fill="${seed.skin}"/>
      <ellipse cx="80" cy="90" rx="33" ry="39" stroke="${seed.line}" stroke-opacity="0.12"/>
      ${renderStarterHair(seed)}
      <path d="M60 84C64 80 68 80 72 84" stroke="${seed.line}" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M88 84C92 80 96 80 100 84" stroke="${seed.line}" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="66" cy="86" r="2" fill="${seed.line}"/>
      <circle cx="94" cy="86" r="2" fill="${seed.line}"/>
      <path d="M80 89C79 92 79 95 81 97" stroke="${seed.line}" stroke-width="1.2" stroke-linecap="round" stroke-opacity="0.36"/>
      <path d="M74 104C79 109 85 109 90 104" stroke="${seed.line}" stroke-width="1.5" stroke-linecap="round" fill="none"/>
    </svg>
  `);

const profileBustPath = (profile: "left" | "right") =>
  profile === "left"
    ? "M98 32C88 34 82 42 76 54C72 62 68 70 58 76C54 78 52 82 52 88C52 94 56 98 62 100C70 102 76 110 80 120C84 130 92 138 108 142C96 130 94 118 94 102C94 92 100 84 108 78C114 74 118 68 118 58C118 44 110 34 98 32Z"
    : "M62 32C72 34 78 42 84 54C88 62 92 70 102 76C106 78 108 82 108 88C108 94 104 98 98 100C90 102 84 110 80 120C76 130 68 138 52 142C64 130 66 118 66 102C66 92 60 84 52 78C46 74 42 68 42 58C42 44 50 34 62 32Z";

const profileLinePath = (profile: "left" | "right") =>
  profile === "left"
    ? "M98 48C90 52 86 60 82 68C80 72 76 76 70 80C76 80 80 82 82 86C84 90 84 96 80 100"
    : "M62 48C70 52 74 60 78 68C80 72 84 76 90 80C84 80 80 82 78 86C76 90 76 96 80 100";

const renderMarbleCrown = (seed: MarbleSeed) => {
  switch (seed.crown) {
    case "laurel":
      return `
        <path d="M34 40C48 30 64 26 80 26" stroke="${seed.accent}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.2"/>
        <path d="M126 40C112 30 96 26 80 26" stroke="${seed.accent}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.2"/>
      `;
    case "veil":
      return `
        <path d="M48 20C70 14 92 14 112 20" stroke="${seed.accent}" stroke-width="5.5" stroke-linecap="round" stroke-opacity="0.18"/>
      `;
    case "arch":
      return `
        <path d="M36 124C36 76 54 30 80 30C106 30 124 76 124 124" stroke="${seed.accent}" stroke-width="1.3" stroke-opacity="0.2"/>
      `;
    default:
      return `
        <circle cx="80" cy="34" r="18" stroke="${seed.accent}" stroke-width="1.2" stroke-opacity="0.22"/>
        <circle cx="80" cy="34" r="28" stroke="${seed.accent}" stroke-width="0.9" stroke-opacity="0.14"/>
      `;
  }
};

const renderMarbleFracture = (seed: MarbleSeed) => {
  switch (seed.fracture) {
    case "scar":
      return `<path d="M90 28C84 44 82 58 84 74C86 90 92 110 100 132" stroke="${seed.stoneDark}" stroke-opacity="0.18" stroke-width="1.4" stroke-linecap="round"/>`;
    case "grain":
      return `
        <path d="M48 48C66 52 88 52 112 48" stroke="${seed.stoneDark}" stroke-opacity="0.12" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M42 98C64 104 92 104 118 98" stroke="${seed.stoneDark}" stroke-opacity="0.1" stroke-width="1.1" stroke-linecap="round"/>
      `;
    case "dust":
      return `
        <circle cx="44" cy="44" r="2.2" fill="${seed.stoneDark}" fill-opacity="0.18"/>
        <circle cx="118" cy="62" r="1.8" fill="${seed.stoneDark}" fill-opacity="0.14"/>
        <circle cx="54" cy="116" r="2" fill="${seed.stoneDark}" fill-opacity="0.14"/>
      `;
    default:
      return `<circle cx="118" cy="40" r="18" stroke="${seed.stoneDark}" stroke-width="1.2" stroke-opacity="0.16"/>`;
  }
};

const buildMarbleAvatar = (seed: MarbleSeed) =>
  encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="18" y1="16" x2="142" y2="148" gradientUnits="userSpaceOnUse">
          <stop stop-color="${seed.fog}"/>
          <stop offset="1" stop-color="${seed.stone}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(110 30) rotate(120) scale(82 72)">
          <stop stop-color="#FFFFFF" stop-opacity="0.82"/>
          <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <rect x="12" y="12" width="136" height="136" rx="28" stroke="${seed.stoneDark}" stroke-opacity="0.08"/>
      <rect x="12" y="12" width="136" height="136" rx="28" fill="url(#glow)"/>
      <ellipse cx="80" cy="130" rx="46" ry="18" fill="${seed.accent}" fill-opacity="0.14"/>
      ${renderMarbleCrown(seed)}
      <path d="${profileBustPath(seed.profile)}" fill="${seed.stone}" stroke="${seed.stoneDark}" stroke-opacity="0.22" stroke-width="1.2"/>
      <path d="${profileLinePath(seed.profile)}" stroke="${seed.stoneDark}" stroke-opacity="0.34" stroke-width="1.4" stroke-linecap="round" fill="none"/>
      <path d="M52 142H108" stroke="${seed.stoneDark}" stroke-opacity="0.14" stroke-width="1.2" stroke-linecap="round"/>
      <path d="M60 148H100" stroke="${seed.stoneDark}" stroke-opacity="0.12" stroke-width="2" stroke-linecap="round"/>
      ${renderMarbleFracture(seed)}
    </svg>
  `);

const silhouettePath = (form: EtherSeed["form"]) => {
  switch (form) {
    case "spire":
      return "M80 20C68 24 60 38 58 54C56 68 54 74 46 84C42 90 40 98 42 106C46 122 60 130 80 140C100 130 114 122 118 106C120 98 118 90 114 84C106 74 104 68 102 54C100 38 92 24 80 20Z";
    case "orb":
      return "M80 22C64 26 54 40 52 56C50 72 42 84 42 98C42 120 56 132 80 140C104 132 118 120 118 98C118 84 110 72 108 56C106 40 96 26 80 22Z";
    case "crown":
      return "M80 18C68 26 64 36 62 52C60 66 50 76 46 90C42 104 48 122 80 140C112 122 118 104 114 90C110 76 100 66 98 52C96 36 92 26 80 18Z";
    case "veil":
      return "M80 22C66 26 58 38 56 52C54 66 48 80 44 94C40 110 48 126 80 140C112 126 120 110 116 94C112 80 106 66 104 52C102 38 94 26 80 22Z";
    default:
      return "M80 20C68 24 60 38 58 54C56 68 48 78 46 92C44 110 52 126 80 140C108 126 116 110 114 92C112 78 104 68 102 54C100 38 92 24 80 20Z";
  }
};

const renderEtherField = (seed: EtherSeed) => {
  switch (seed.form) {
    case "orb":
      return `
        <circle cx="118" cy="42" r="18" stroke="${seed.glowB}" stroke-width="1.1" stroke-opacity="0.4"/>
        <circle cx="118" cy="42" r="28" stroke="${seed.glowA}" stroke-width="0.8" stroke-opacity="0.22"/>
      `;
    case "crown":
      return `
        <path d="M42 34C58 18 70 18 80 28C90 18 102 18 118 34" stroke="${seed.glowB}" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.32"/>
      `;
    case "veil":
      return `
        <path d="M50 26C60 20 70 18 80 18C90 18 100 20 110 26" stroke="${seed.glowB}" stroke-width="4.4" stroke-linecap="round" stroke-opacity="0.18"/>
      `;
    case "spire":
      return `
        <path d="M80 10V34" stroke="${seed.glowB}" stroke-width="1.1" stroke-linecap="round" stroke-opacity="0.32"/>
        <path d="M64 24H96" stroke="${seed.glowA}" stroke-width="0.9" stroke-linecap="round" stroke-opacity="0.22"/>
      `;
    default:
      return `
        <path d="M34 122C40 68 56 28 80 28C104 28 120 68 126 122" stroke="${seed.glowA}" stroke-width="1.2" stroke-opacity="0.24"/>
      `;
  }
};

const buildEtherAvatar = (seed: EtherSeed) =>
  encodeSvg(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="20" y1="14" x2="140" y2="148" gradientUnits="userSpaceOnUse">
          <stop stop-color="${seed.obsidian}"/>
          <stop offset="1" stop-color="${seed.base}"/>
        </linearGradient>
        <radialGradient id="nebulaA" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(118 34) rotate(126) scale(78 72)">
          <stop stop-color="${seed.glowB}" stop-opacity="0.9"/>
          <stop offset="1" stop-color="${seed.glowB}" stop-opacity="0"/>
        </radialGradient>
        <radialGradient id="nebulaB" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(48 126) rotate(-48) scale(72 70)">
          <stop stop-color="${seed.glowA}" stop-opacity="0.74"/>
          <stop offset="1" stop-color="${seed.glowA}" stop-opacity="0"/>
        </radialGradient>
        <linearGradient id="silhouette" x1="44" y1="18" x2="116" y2="142" gradientUnits="userSpaceOnUse">
          <stop stop-color="${seed.glowB}"/>
          <stop offset="0.48" stop-color="${seed.glowA}"/>
          <stop offset="1" stop-color="${seed.glowC}"/>
        </linearGradient>
        <mask id="figure">
          <rect width="160" height="160" fill="black"/>
          <path d="${silhouettePath(seed.form)}" fill="white"/>
        </mask>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <rect x="12" y="12" width="136" height="136" rx="28" stroke="${seed.glowB}" stroke-opacity="0.08"/>
      <rect x="12" y="12" width="136" height="136" rx="28" fill="url(#nebulaA)"/>
      <rect x="12" y="12" width="136" height="136" rx="28" fill="url(#nebulaB)"/>
      ${renderEtherField(seed)}
      <g mask="url(#figure)">
        <rect x="28" y="16" width="104" height="128" fill="url(#silhouette)"/>
        <path d="M26 118C48 92 68 82 82 80C98 78 114 84 136 118" stroke="${seed.glowB}" stroke-opacity="0.36" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M20 132C40 108 58 98 78 96C100 94 118 102 140 132" stroke="${seed.glowA}" stroke-opacity="0.22" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="56" cy="58" r="2.4" fill="${seed.glowB}" fill-opacity="0.88"/>
        <circle cx="102" cy="44" r="1.8" fill="${seed.glowB}" fill-opacity="0.72"/>
        <circle cx="88" cy="90" r="1.6" fill="${seed.glowA}" fill-opacity="0.78"/>
        <path d="M44 28L120 132" stroke="${seed.obsidian}" stroke-opacity="0.2" stroke-width="14"/>
      </g>
      <path d="${silhouettePath(seed.form)}" stroke="${seed.glowB}" stroke-opacity="0.18" stroke-width="1.1"/>
    </svg>
  `);

const AVATAR_OPTIONS: AvatarOption[] = [
  ...STARTER_SEEDS.map((seed) => ({
    key: seed.key,
    label: seed.label,
    family: FAMILY_BY_TIER.starter,
    tier: "starter" as const,
    url: buildStarterAvatar(seed),
  })),
  ...ACTIVE_SEEDS.map((seed) => ({
    key: seed.key,
    label: seed.label,
    family: FAMILY_BY_TIER.active,
    tier: "active" as const,
    url: buildMarbleAvatar(seed),
  })),
  ...TRUSTED_SEEDS.map((seed) => ({
    key: seed.key,
    label: seed.label,
    family: FAMILY_BY_TIER.trusted,
    tier: "trusted" as const,
    url: buildEtherAvatar(seed),
  })),
];

const ACTIVE_UNLOCK_HINT =
  "Classical Marble Portraits unlock after 24 hours of healthy activity or a steady reply rhythm.";
const TRUSTED_UNLOCK_HINT =
  "Ethereal Light Forms unlock once your Trust Score reaches the clear enough band.";

const getTierAccess = (
  tier: AvatarTier,
  trust: CleanIdTrustSnapshot
): AvatarTierAccess => {
  if (tier === "starter") {
    return {
      unlocked: true,
      title: "Starter",
      hint: "Minimalist Characters are open from day one so every CleanID begins with a quiet human mark.",
    };
  }

  if (tier === "active") {
    const unlocked =
      trust.metrics.accountAgeDays >= 1 ||
      trust.metrics.recentMessages >= ACTIVE_UNLOCK_RECENT_MESSAGES ||
      trust.metrics.sentMessages >= ACTIVE_UNLOCK_TOTAL_MESSAGES;
    return {
      unlocked,
      title: "Active",
      hint: unlocked
        ? "Classical Marble Portraits are open. Your cadence already reads settled."
        : ACTIVE_UNLOCK_HINT,
    };
  }

  const unlocked = trust.score >= TRUSTED_UNLOCK_SCORE;
  return {
    unlocked,
    title: "Trusted",
    hint: unlocked
      ? "Ethereal Light Forms are open. This set avoids suggestive, aggressive, or uncanny anatomy."
      : TRUSTED_UNLOCK_HINT,
  };
};

export const getAvatarOption = (avatar: AvatarKey) =>
  AVATAR_OPTIONS.find((option) => option.key === avatar) ??
  AVATAR_OPTIONS.find((option) => option.key === DEFAULT_AVATAR_KEY)!;

export const getAvatarTier = (avatar: AvatarKey): AvatarTier => getAvatarOption(avatar).tier;

export const getAvatarUrl = (avatar?: AvatarKey | null) =>
  getAvatarOption(avatar ?? DEFAULT_AVATAR_KEY).url;

export const getAvatarOptionsByTier = (tier: AvatarTier) =>
  AVATAR_OPTIONS.filter((option) => option.tier === tier);

export const getAvatarToneClass = (avatar?: AvatarKey | null) => {
  const tier = getAvatarTier(avatar ?? DEFAULT_AVATAR_KEY);
  return `avatar-tone avatar-tone-${tier}`;
};

export const buildDerivedAvatarAccess = ({
  trust = FALLBACK_CLEAN_ID_TRUST,
  currentAvatar,
}: {
  trust?: CleanIdTrustSnapshot | null;
  currentAvatar?: AvatarKey | null;
}): AvatarAccess => {
  const activeTrust = trust ?? FALLBACK_CLEAN_ID_TRUST;
  const current = currentAvatar ?? DEFAULT_AVATAR_KEY;
  const tiers: Record<AvatarTier, AvatarTierAccess> = {
    starter: getTierAccess("starter", activeTrust),
    active: getTierAccess("active", activeTrust),
    trusted: getTierAccess("trusted", activeTrust),
  };

  const availableKeys = AVATAR_OPTIONS.filter((option) => {
    if (option.key === current) {
      return true;
    }
    return tiers[option.tier].unlocked;
  }).map((option) => option.key);

  return {
    currentTier: getAvatarTier(current),
    availableKeys,
    tiers,
  };
};

export const isAvatarUnlocked = (avatar: AvatarKey, access: AvatarAccess) =>
  access.availableKeys.includes(avatar);

export const AVATAR_COUNTS = {
  starter: STARTER_KEYS.length,
  active: ACTIVE_KEYS.length,
  trusted: TRUSTED_KEYS.length,
} as const;
