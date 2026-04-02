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

type PortraitStyle = "cartoon" | "studio" | "anime";
type HairShape =
  | "bob"
  | "wave"
  | "bun"
  | "short"
  | "pony"
  | "parted"
  | "pixie"
  | "curl";
type Accessory = "none" | "clip" | "glasses" | "earring" | "scarf" | "band";
type Expression = "calm" | "smile" | "soft";
type Motif = "grid" | "leaf" | "halo" | "petal" | "ripple";

type Palette = {
  bg: string;
  wash: string;
  glow: string;
  skin: string;
  skinShade: string;
  hair: string;
  hairShade: string;
  top: string;
  accent: string;
  line: string;
  iris: string;
  blush: string;
};

type PortraitSeed = {
  key: AvatarKey;
  label: string;
  palette: keyof typeof PALETTES;
  hairShape: HairShape;
  accessory: Accessory;
  expression: Expression;
  motif: Motif;
};

type PortraitDefinition = AvatarOption & {
  style: PortraitStyle;
  palette: Palette;
  hairShape: HairShape;
  accessory: Accessory;
  expression: Expression;
  motif: Motif;
};

const ACTIVE_UNLOCK_RECENT_MESSAGES = 8;
const ACTIVE_UNLOCK_TOTAL_MESSAGES = 12;
const TRUSTED_UNLOCK_SCORE = 64;

const FAMILY_BY_TIER: Record<AvatarTier, string> = {
  starter: "Calm Cartoon Characters",
  active: "Studio Portraits",
  trusted: "Serene Anime Characters",
};

const PALETTES = {
  sagePeach: {
    bg: "#F6F1E8",
    wash: "#E6EFE5",
    glow: "#E7D7C8",
    skin: "#F1D9C9",
    skinShade: "#E6C6B0",
    hair: "#6C665C",
    hairShade: "#4E4A44",
    top: "#8FA79A",
    accent: "#D9B39F",
    line: "#534F49",
    iris: "#57685C",
    blush: "#E6B5AC",
  },
  mistBlue: {
    bg: "#EEF3F5",
    wash: "#E6ECE8",
    glow: "#D8E2E8",
    skin: "#F0D9CC",
    skinShade: "#E5C3B0",
    hair: "#5D6471",
    hairShade: "#404651",
    top: "#93A9BB",
    accent: "#C5D2DB",
    line: "#4E5561",
    iris: "#56728A",
    blush: "#E4B1AA",
  },
  clayRose: {
    bg: "#F7EEE8",
    wash: "#F0E6E2",
    glow: "#EAD8D1",
    skin: "#F2DBC9",
    skinShade: "#E4BEAA",
    hair: "#775E58",
    hairShade: "#57433F",
    top: "#B48D85",
    accent: "#D9C0B7",
    line: "#584944",
    iris: "#6E5D58",
    blush: "#E7B0AB",
  },
  oatFern: {
    bg: "#F4F1E7",
    wash: "#E9EEE1",
    glow: "#D8D7C7",
    skin: "#EFD7C4",
    skinShade: "#DEBAA5",
    hair: "#5E5C4F",
    hairShade: "#434135",
    top: "#8DA287",
    accent: "#C5C8B1",
    line: "#4D4B42",
    iris: "#5E6A53",
    blush: "#E4AEA5",
  },
  seaGlass: {
    bg: "#EEF4F1",
    wash: "#E6F0EC",
    glow: "#D3E2DD",
    skin: "#F2DCCC",
    skinShade: "#E7C2B4",
    hair: "#4E6B68",
    hairShade: "#37504D",
    top: "#7EA7A1",
    accent: "#B6D5CC",
    line: "#465754",
    iris: "#4E7572",
    blush: "#E5B4AB",
  },
  duskLavender: {
    bg: "#F2EEF6",
    wash: "#ECE7F1",
    glow: "#DDD7E7",
    skin: "#F0D8CD",
    skinShade: "#E2BEB0",
    hair: "#645C79",
    hairShade: "#4A435A",
    top: "#A89ABF",
    accent: "#D4CBE5",
    line: "#554E64",
    iris: "#70649D",
    blush: "#E4B0B7",
  },
  cloudMint: {
    bg: "#EFF5F3",
    wash: "#E5F0EE",
    glow: "#D7E8E3",
    skin: "#F1DCCF",
    skinShade: "#E4C3B1",
    hair: "#566964",
    hairShade: "#3F4F4B",
    top: "#93B2A8",
    accent: "#C5DDD7",
    line: "#4E5D59",
    iris: "#597D74",
    blush: "#E7B6B0",
  },
  linenSky: {
    bg: "#F1F4F8",
    wash: "#EBEEF3",
    glow: "#DCE4EE",
    skin: "#F3DDD0",
    skinShade: "#E8C4B2",
    hair: "#64748D",
    hairShade: "#475366",
    top: "#9AB4CC",
    accent: "#CBD8E7",
    line: "#526072",
    iris: "#617EA5",
    blush: "#E8B4AC",
  },
  cocoaLeaf: {
    bg: "#F5EFE9",
    wash: "#EDE7E1",
    glow: "#E3D7CB",
    skin: "#EFD7CA",
    skinShade: "#DDB5A6",
    hair: "#6B534A",
    hairShade: "#4F3D37",
    top: "#8E9C87",
    accent: "#D1C0B1",
    line: "#544740",
    iris: "#6A5A4E",
    blush: "#E4ACA4",
  },
  dawnApricot: {
    bg: "#F8F1E9",
    wash: "#F5EAE2",
    glow: "#ECD8C9",
    skin: "#F1D6C7",
    skinShade: "#E3B9A4",
    hair: "#705C57",
    hairShade: "#514440",
    top: "#D0A088",
    accent: "#E6C7B2",
    line: "#5B4D49",
    iris: "#7B665E",
    blush: "#E8B0AA",
  },
} as const;

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
    eyebrow: "Starter",
    title: "Cartoon Characters",
    description: "Hand-drawn cartoon portraits with fine lines and quiet Morandi palettes. Open from day one.",
  },
  active: {
    eyebrow: "Active",
    title: "Studio Portraits",
    description: "Richer editorial portraits that unlock once your conversations feel consistent and lived in.",
  },
  trusted: {
    eyebrow: "Trusted",
    title: "Anime Characters",
    description: "Calm, fully clothed anime portraits designed to feel safe, human, and instantly memorable.",
  },
};

export const AVATAR_TIER_ORDER: AvatarTier[] = ["starter", "active", "trusted"];

const starterSeed = (
  key: AvatarKey,
  label: string,
  palette: keyof typeof PALETTES,
  hairShape: HairShape,
  accessory: Accessory,
  expression: Expression,
  motif: Motif
): PortraitSeed => ({ key, label, palette, hairShape, accessory, expression, motif });

const activeSeed = starterSeed;
const trustedSeed = starterSeed;

const STARTER_SEEDS: PortraitSeed[] = [
  starterSeed("AVATAR_LEO", "Maple", "sagePeach", "bob", "clip", "smile", "grid"),
  starterSeed("AVATAR_SOPHIE", "Juniper", "mistBlue", "wave", "none", "calm", "ripple"),
  starterSeed("AVATAR_MAX", "Wren", "clayRose", "short", "glasses", "soft", "leaf"),
  starterSeed("AVATAR_BELLA", "Sol", "seaGlass", "bun", "earring", "smile", "halo"),
  starterSeed("AVATAR_CHARLIE", "Olive", "oatFern", "parted", "scarf", "calm", "leaf"),
  starterSeed("AVATAR_ALMA", "Alma", "duskLavender", "bob", "band", "soft", "petal"),
  starterSeed("AVATAR_THEO", "Theo", "linenSky", "short", "none", "smile", "grid"),
  starterSeed("AVATAR_IONA", "Iona", "cloudMint", "curl", "clip", "calm", "leaf"),
  starterSeed("AVATAR_LARK", "Lark", "dawnApricot", "pony", "earring", "smile", "halo"),
  starterSeed("AVATAR_MINA", "Mina", "mistBlue", "pixie", "none", "soft", "ripple"),
  starterSeed("AVATAR_CEDAR", "Cedar", "cocoaLeaf", "parted", "glasses", "calm", "grid"),
  starterSeed("AVATAR_ORIEL", "Oriel", "sagePeach", "wave", "scarf", "smile", "petal"),
  starterSeed("AVATAR_LINA", "Lina", "seaGlass", "bun", "clip", "soft", "leaf"),
  starterSeed("AVATAR_REMY", "Remy", "duskLavender", "short", "band", "calm", "halo"),
  starterSeed("AVATAR_NOOR", "Noor", "oatFern", "bob", "none", "smile", "ripple"),
];

const ACTIVE_SEEDS: PortraitSeed[] = [
  activeSeed("AVATAR_AVERY", "Sable", "linenSky", "parted", "glasses", "calm", "halo"),
  activeSeed("AVATAR_RILEY", "Ellis", "seaGlass", "wave", "earring", "soft", "ripple"),
  activeSeed("AVATAR_JORDAN", "Haze", "duskLavender", "pixie", "band", "smile", "grid"),
  activeSeed("AVATAR_SKYLER", "Clove", "cocoaLeaf", "bun", "none", "calm", "leaf"),
  activeSeed("AVATAR_MORGAN", "Rowan", "cloudMint", "curl", "scarf", "soft", "halo"),
  activeSeed("AVATAR_MIRO", "Miro", "mistBlue", "short", "clip", "smile", "ripple"),
  activeSeed("AVATAR_ELIO", "Elio", "dawnApricot", "parted", "earring", "calm", "petal"),
  activeSeed("AVATAR_TAVI", "Tavi", "sagePeach", "pony", "band", "soft", "grid"),
  activeSeed("AVATAR_BRIAR", "Briar", "oatFern", "wave", "glasses", "smile", "leaf"),
  activeSeed("AVATAR_SENA", "Sena", "clayRose", "bob", "clip", "calm", "halo"),
];

const TRUSTED_SEEDS: PortraitSeed[] = [
  trustedSeed("AVATAR_AIRI", "Airi", "duskLavender", "wave", "clip", "soft", "halo"),
  trustedSeed("AVATAR_REN", "Ren", "linenSky", "short", "none", "calm", "ripple"),
  trustedSeed("AVATAR_NAMI", "Nami", "seaGlass", "parted", "earring", "smile", "leaf"),
  trustedSeed("AVATAR_KIKO", "Kiko", "dawnApricot", "bob", "band", "soft", "petal"),
  trustedSeed("AVATAR_YUTA", "Yuta", "cloudMint", "short", "scarf", "calm", "grid"),
  trustedSeed("AVATAR_HINA", "Hina", "sagePeach", "bun", "clip", "smile", "halo"),
  trustedSeed("AVATAR_AOBA", "Aoba", "mistBlue", "wave", "none", "soft", "ripple"),
  trustedSeed("AVATAR_MEI", "Mei", "clayRose", "pony", "earring", "calm", "petal"),
  trustedSeed("AVATAR_SORA", "Sora", "linenSky", "parted", "glasses", "soft", "leaf"),
  trustedSeed("AVATAR_KAEDE", "Kaede", "oatFern", "curl", "band", "smile", "halo"),
  trustedSeed("AVATAR_YORI", "Yori", "seaGlass", "short", "clip", "calm", "grid"),
  trustedSeed("AVATAR_MIO", "Mio", "duskLavender", "bob", "none", "soft", "petal"),
  trustedSeed("AVATAR_AKARI", "Akari", "dawnApricot", "bun", "earring", "smile", "ripple"),
  trustedSeed("AVATAR_RIN", "Rin", "cloudMint", "parted", "scarf", "calm", "leaf"),
  trustedSeed("AVATAR_HARU", "Haru", "sagePeach", "pixie", "band", "soft", "halo"),
];

const encodeSvg = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

const renderMotif = (motif: Motif, accent: string) => {
  switch (motif) {
    case "grid":
      return `
        <path d="M24 46H136" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.24"/>
        <path d="M24 86H136" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.18"/>
        <path d="M52 26V134" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.18"/>
        <path d="M108 26V134" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.18"/>
      `;
    case "leaf":
      return `
        <path d="M28 118C34 96 50 84 70 82" stroke="${accent}" stroke-width="2.2" stroke-linecap="round" stroke-opacity="0.25"/>
        <path d="M26 118C44 108 54 100 62 88" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-opacity="0.18"/>
        <path d="M132 40C116 48 106 60 100 76" stroke="${accent}" stroke-width="2" stroke-linecap="round" stroke-opacity="0.18"/>
      `;
    case "halo":
      return `
        <circle cx="122" cy="40" r="20" fill="${accent}" fill-opacity="0.12"/>
        <circle cx="122" cy="40" r="30" stroke="${accent}" stroke-width="1.2" stroke-opacity="0.18"/>
        <circle cx="122" cy="40" r="40" stroke="${accent}" stroke-width="0.9" stroke-opacity="0.12"/>
      `;
    case "petal":
      return `
        <path d="M28 40c8-12 18-16 24-4c-6 14-18 18-24 4Z" fill="${accent}" fill-opacity="0.16"/>
        <path d="M116 118c10-8 20-8 24 6c-10 10-20 8-24-6Z" fill="${accent}" fill-opacity="0.18"/>
        <circle cx="126" cy="54" r="7" fill="${accent}" fill-opacity="0.12"/>
      `;
    default:
      return `
        <path d="M26 108C44 94 66 90 88 92C110 94 126 102 138 116" stroke="${accent}" stroke-width="2.1" stroke-linecap="round" stroke-opacity="0.18"/>
        <path d="M20 118C42 102 64 96 84 98C108 100 126 110 142 130" stroke="${accent}" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.12"/>
      `;
  }
};

const renderHair = (style: PortraitStyle, hairShape: HairShape, hair: string, hairShade: string) => {
  const shared = `fill="${hair}"`;
  const shadow = `fill="${hairShade}" fill-opacity="${style === "anime" ? "0.22" : "0.18"}"`;
  switch (hairShape) {
    case "bun":
      return `
        <circle cx="108" cy="42" r="16" ${shared}/>
        <path d="M44 86C44 48 64 26 84 24C110 22 126 40 126 80C120 100 104 116 80 116C58 116 46 102 44 86Z" ${shared}/>
        <path d="M56 46C72 28 100 24 118 44C106 34 84 36 66 48Z" ${shadow}/>
      `;
    case "wave":
      return `
        <path d="M38 84C40 42 68 22 88 24C118 26 128 50 124 88C118 102 108 114 88 118C70 122 48 108 38 84Z" ${shared}/>
        <path d="M32 88C42 110 58 126 82 128C60 122 46 106 38 86Z" ${shadow}/>
      `;
    case "short":
      return `
        <path d="M44 78C46 48 68 28 84 26C106 24 122 40 122 72C114 78 106 82 94 84C82 86 68 84 54 82Z" ${shared}/>
        <path d="M58 42C72 32 92 30 110 42C96 36 76 36 58 42Z" ${shadow}/>
      `;
    case "pony":
      return `
        <path d="M42 86C42 48 68 24 86 24C108 24 124 40 124 78C118 94 108 106 90 110C66 114 48 104 42 86Z" ${shared}/>
        <path d="M116 64C130 72 138 88 134 104C122 94 118 80 116 64Z" ${shared}/>
        <path d="M58 42C78 28 100 30 118 48C100 38 78 38 58 42Z" ${shadow}/>
      `;
    case "parted":
      return `
        <path d="M40 84C42 46 66 24 86 24C112 24 128 46 124 88C118 104 106 116 84 118C64 120 48 108 40 84Z" ${shared}/>
        <path d="M80 28C72 40 68 52 68 68" stroke="${hairShade}" stroke-width="${style === "anime" ? "4.5" : "4"}" stroke-linecap="round" stroke-opacity="0.35"/>
      `;
    case "pixie":
      return `
        <path d="M46 76C50 46 70 28 88 28C108 28 122 44 118 70C102 82 84 86 58 84Z" ${shared}/>
        <path d="M54 42C70 34 92 34 110 46C94 40 72 38 54 42Z" ${shadow}/>
      `;
    case "curl":
      return `
        <path d="M40 88C40 44 66 20 88 24C112 28 130 48 124 88C116 106 102 118 82 120C60 122 44 108 40 88Z" ${shared}/>
        <circle cx="52" cy="58" r="10" ${shadow}/>
        <circle cx="110" cy="54" r="8" ${shadow}/>
      `;
    default:
      return `
        <path d="M42 84C42 46 64 24 84 22C110 20 126 42 124 84C118 102 106 116 82 118C60 120 48 106 42 84Z" ${shared}/>
        <path d="M58 40C72 28 96 28 112 42C98 36 76 36 58 40Z" ${shadow}/>
      `;
  }
};

const renderAccessory = (accessory: Accessory, accent: string, line: string) => {
  switch (accessory) {
    case "clip":
      return `<rect x="106" y="58" width="15" height="8" rx="4" fill="${accent}" stroke="${line}" stroke-width="1.1"/>`;
    case "glasses":
      return `
        <circle cx="66" cy="82" r="10" fill="none" stroke="${line}" stroke-width="1.6" stroke-opacity="0.8"/>
        <circle cx="94" cy="82" r="10" fill="none" stroke="${line}" stroke-width="1.6" stroke-opacity="0.8"/>
        <path d="M76 82H84" stroke="${line}" stroke-width="1.4" stroke-linecap="round" stroke-opacity="0.8"/>
      `;
    case "earring":
      return `<circle cx="104" cy="102" r="3.8" fill="${accent}" fill-opacity="0.88"/>`;
    case "scarf":
      return `
        <path d="M54 132C62 122 76 118 92 118C108 118 120 122 126 132V140H54Z" fill="${accent}" fill-opacity="0.9"/>
        <path d="M76 122C88 124 98 128 104 140" stroke="${line}" stroke-width="1.1" stroke-opacity="0.24"/>
      `;
    case "band":
      return `<path d="M48 56C62 44 80 40 102 42C114 44 122 48 126 54" stroke="${accent}" stroke-width="7" stroke-linecap="round" stroke-opacity="0.7"/>`;
    default:
      return "";
  }
};

const renderFace = (style: PortraitStyle, expression: Expression, line: string, iris: string, blush: string) => {
  if (style === "anime") {
    const mouth =
      expression === "smile"
        ? `M72 106C78 112 86 112 92 106`
        : expression === "soft"
          ? `M74 106C79 109 85 109 90 106`
          : `M76 106C80 108 84 108 88 106`;
    return `
      <ellipse cx="66" cy="84" rx="10" ry="12" fill="#fff" fill-opacity="0.95"/>
      <ellipse cx="94" cy="84" rx="10" ry="12" fill="#fff" fill-opacity="0.95"/>
      <ellipse cx="66" cy="86" rx="5.2" ry="7.4" fill="${iris}"/>
      <ellipse cx="94" cy="86" rx="5.2" ry="7.4" fill="${iris}"/>
      <circle cx="64" cy="82" r="2.2" fill="#fff" fill-opacity="0.88"/>
      <circle cx="92" cy="82" r="2.2" fill="#fff" fill-opacity="0.88"/>
      <path d="M56 74C60 69 66 68 72 70" stroke="${line}" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.72"/>
      <path d="M88 70C94 68 100 69 104 74" stroke="${line}" stroke-width="1.6" stroke-linecap="round" stroke-opacity="0.72"/>
      <path d="M79 88C78 92 78 95 80 98" stroke="${line}" stroke-width="1.1" stroke-linecap="round" stroke-opacity="0.42"/>
      <path d="${mouth}" stroke="${line}" stroke-width="1.35" stroke-linecap="round" fill="none"/>
      <circle cx="56" cy="98" r="5.2" fill="${blush}" fill-opacity="0.24"/>
      <circle cx="104" cy="98" r="5.2" fill="${blush}" fill-opacity="0.24"/>
    `;
  }

  const mouth =
    expression === "smile"
      ? `M74 104C79 109 85 109 90 104`
      : expression === "soft"
        ? `M76 104C80 107 84 107 88 104`
        : `M77 104C81 106 83 106 87 104`;
  return `
    <path d="M60 84C64 80 68 80 72 84" stroke="${line}" stroke-width="2.1" stroke-linecap="round" fill="none"/>
    <path d="M88 84C92 80 96 80 100 84" stroke="${line}" stroke-width="2.1" stroke-linecap="round" fill="none"/>
    <circle cx="66" cy="86" r="2.2" fill="${iris}"/>
    <circle cx="94" cy="86" r="2.2" fill="${iris}"/>
    <path d="M80 88C79 92 79 95 81 97" stroke="${line}" stroke-width="1.3" stroke-linecap="round" stroke-opacity="0.38"/>
    <path d="${mouth}" stroke="${line}" stroke-width="1.7" stroke-linecap="round" fill="none"/>
    <circle cx="58" cy="98" r="4.6" fill="${blush}" fill-opacity="0.2"/>
    <circle cx="102" cy="98" r="4.6" fill="${blush}" fill-opacity="0.2"/>
  `;
};

const buildPortraitDataUri = (definition: PortraitDefinition) => {
  const { palette, style, motif, hairShape, accessory, expression } = definition;
  const faceWidth = style === "anime" ? 36 : style === "studio" ? 34 : 33;
  const faceHeight = style === "anime" ? 42 : 39;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" fill="none">
      <defs>
        <linearGradient id="bg" x1="16" y1="18" x2="144" y2="146" gradientUnits="userSpaceOnUse">
          <stop stop-color="${palette.bg}"/>
          <stop offset="1" stop-color="${palette.wash}"/>
        </linearGradient>
        <radialGradient id="glow" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(118 34) rotate(122) scale(88 80)">
          <stop stop-color="${palette.glow}" stop-opacity="${style === "anime" ? "0.84" : "0.72"}"/>
          <stop offset="1" stop-color="${palette.glow}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#bg)"/>
      <rect x="12" y="12" width="136" height="136" rx="28" stroke="${palette.line}" stroke-opacity="0.08"/>
      <rect x="12" y="12" width="136" height="136" rx="28" fill="url(#glow)"/>
      ${renderMotif(motif, palette.accent)}
      <ellipse cx="80" cy="116" rx="54" ry="30" fill="${palette.accent}" fill-opacity="${style === "anime" ? "0.2" : "0.16"}"/>
      <path d="M40 156C42 130 56 118 80 118C104 118 118 130 120 156H40Z" fill="${palette.top}"/>
      <path d="M52 156C56 136 66 126 80 126C94 126 104 136 108 156" fill="${palette.top}" fill-opacity="0.7"/>
      <path d="M68 120C70 112 74 106 80 106C86 106 90 112 92 120" fill="${palette.skinShade}" fill-opacity="0.7"/>
      <ellipse cx="80" cy="84" rx="${faceWidth}" ry="${faceHeight}" fill="${palette.skin}"/>
      <ellipse cx="80" cy="90" rx="${faceWidth - 1}" ry="${faceHeight - 1}" stroke="${palette.line}" stroke-opacity="${style === "anime" ? "0.18" : "0.15"}"/>
      ${renderHair(style, hairShape, palette.hair, palette.hairShade)}
      ${renderAccessory(accessory, palette.accent, palette.line)}
      ${renderFace(style, expression, palette.line, palette.iris, palette.blush)}
    </svg>
  `.trim();
  return encodeSvg(svg);
};

const buildDefinitions = (
  seeds: PortraitSeed[],
  tier: AvatarTier,
  style: PortraitStyle
): PortraitDefinition[] =>
  seeds.map((seed) => ({
    key: seed.key,
    label: seed.label,
    family: FAMILY_BY_TIER[tier],
    tier,
    url: "",
    style,
    palette: PALETTES[seed.palette],
    hairShape: seed.hairShape,
    accessory: seed.accessory,
    expression: seed.expression,
    motif: seed.motif,
  }));

const AVATAR_DEFINITIONS: PortraitDefinition[] = [
  ...buildDefinitions(STARTER_SEEDS, "starter", "cartoon"),
  ...buildDefinitions(ACTIVE_SEEDS, "active", "studio"),
  ...buildDefinitions(TRUSTED_SEEDS, "trusted", "anime"),
];

export const AVATAR_OPTIONS: AvatarOption[] = AVATAR_DEFINITIONS.map((definition) => ({
  key: definition.key,
  label: definition.label,
  family: definition.family,
  tier: definition.tier,
  url: buildPortraitDataUri(definition),
}));

const ACTIVE_UNLOCK_HINT =
  "Unlock Studio Portraits after 24 hours of healthy activity or a steady reply pattern.";
const TRUSTED_UNLOCK_HINT =
  "Unlock Anime Characters once your Trust Score reaches the steady band.";

const getTierAccess = (
  tier: AvatarTier,
  trust: CleanIdTrustSnapshot
): AvatarTierAccess => {
  if (tier === "starter") {
    return {
      unlocked: true,
      title: "Starter",
      hint: "Cartoon Characters are open from day one so every CleanID starts with a calm human portrait.",
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
        ? "Studio Portraits are open. Your cadence already feels steady enough."
        : ACTIVE_UNLOCK_HINT,
    };
  }

  const unlocked = trust.score >= TRUSTED_UNLOCK_SCORE;
  return {
    unlocked,
    title: "Trusted",
    hint: unlocked
      ? "Anime Characters are open. This set stays fully clothed, calm, and deliberately non-suggestive."
      : TRUSTED_UNLOCK_HINT,
  };
};

export const getAvatarOption = (avatar: AvatarKey) =>
  AVATAR_OPTIONS.find((option) => option.key === avatar) ??
  AVATAR_OPTIONS.find((option) => option.key === DEFAULT_AVATAR_KEY)!;

export const getAvatarUrl = (avatar?: AvatarKey | null) =>
  getAvatarOption(avatar ?? DEFAULT_AVATAR_KEY).url;

export const getAvatarOptionsByTier = (tier: AvatarTier) =>
  AVATAR_OPTIONS.filter((option) => option.tier === tier);

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
    currentTier: getAvatarOption(current).tier,
    availableKeys,
    tiers,
  };
};

export const isAvatarUnlocked = (avatar: AvatarKey, access: AvatarAccess) =>
  access.availableKeys.includes(avatar);
