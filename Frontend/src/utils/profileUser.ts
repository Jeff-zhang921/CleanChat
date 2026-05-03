import {
  buildDerivedAvatarAccess,
  type AvatarAccess,
  type AvatarKey,
} from "../constants/avatarCatalog";
import { normalizeGender, type GenderValue } from "./gender";
import {
  buildDerivedShortIdClaim,
  FALLBACK_SHORT_ID_CLAIM,
  type CleanIdShortClaim,
} from "./cleanIdClaim";
import {
  FALLBACK_CLEAN_ID_TRUST,
  type CleanIdTrustSnapshot,
} from "./cleanIdTrust";

export type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
  gender: GenderValue;
  trust: CleanIdTrustSnapshot;
  shortIdClaim: CleanIdShortClaim;
  avatarAccess?: AvatarAccess;
};

type ProfileUserInput = Omit<ProfileUser, "gender"> & {
  gender?: string | null;
};

export type SpatialTransition = "push" | "pop";

export type ProfileRouteState = {
  user?: ProfileUser;
  spatialTransition?: SpatialTransition;
  focusClaim?: boolean;
  returnTo?: "/profile" | "/profile/purity" | "/profile/settings";
};

export const hydrateProfileUser = (user: ProfileUserInput): ProfileUser => ({
  ...user,
  gender: normalizeGender(user.gender),
  trust: user.trust ?? FALLBACK_CLEAN_ID_TRUST,
  shortIdClaim:
    user.shortIdClaim ??
    buildDerivedShortIdClaim({
      cleanId: user.cleanId ?? "",
      trustScore: user.trust?.score ?? 0,
    }) ??
    FALLBACK_SHORT_ID_CLAIM,
  avatarAccess:
    user.avatarAccess ??
    buildDerivedAvatarAccess({
      trust: user.trust,
      currentAvatar: user.avatar,
    }),
});
