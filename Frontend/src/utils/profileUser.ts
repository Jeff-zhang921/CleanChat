import {
  buildDerivedAvatarAccess,
  type AvatarAccess,
  type AvatarKey,
} from "../constants/avatarCatalog";
import {
  buildDerivedShortIdClaim,
  FALLBACK_SHORT_ID_CLAIM,
  type CleanIdShortClaim,
} from "./cleanIdClaim";
import { FALLBACK_CLEAN_ID_TRUST, type CleanIdTrustSnapshot } from "./cleanIdTrust";

export type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
  trust: CleanIdTrustSnapshot;
  shortIdClaim: CleanIdShortClaim;
  avatarAccess?: AvatarAccess;
};

export type SpatialTransition = "push" | "pop";

export type ProfileRouteState = {
  user?: ProfileUser;
  spatialTransition?: SpatialTransition;
  focusClaim?: boolean;
  returnTo?: "/profile" | "/profile/purity" | "/profile/vault" | "/profile/settings";
};

export const hydrateProfileUser = (user: ProfileUser): ProfileUser => ({
  ...user,
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
