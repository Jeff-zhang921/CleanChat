import { type AvatarKey } from "../constants/avatarCatalog";
import { normalizeGender, type GenderValue } from "./gender";
import {
  buildDerivedShortIdClaim,
  FALLBACK_SHORT_ID_CLAIM,
  type CleanIdShortClaim,
} from "./cleanIdClaim";

export type ProfileUser = {
  id: number;
  email: string;
  name: string;
  cleanId: string;
  avatar: AvatarKey;
  gender: GenderValue;
  shortIdClaim: CleanIdShortClaim;
};

type ProfileUserInput = Omit<ProfileUser, "gender"> & {
  gender?: string | null;
};

export type SpatialTransition = "push" | "pop";

export type ProfileEditDraft = {
  name: string;
  cleanId: string;
  avatar: AvatarKey;
  gender: GenderValue;
};

export type ProfileRouteState = {
  user?: ProfileUser;
  editDraft?: ProfileEditDraft;
  selectedAvatar?: AvatarKey;
  avatarPickerReturnTo?: "/profile" | "/profile/edit";
  spatialTransition?: SpatialTransition;
  focusClaim?: boolean;
  returnTo?: "/profile" | "/profile/settings";
};

export const hydrateProfileUser = (user: ProfileUserInput): ProfileUser => ({
  ...user,
  gender: normalizeGender(user.gender),
  shortIdClaim:
    user.shortIdClaim ??
    buildDerivedShortIdClaim({
      cleanId: user.cleanId ?? "",
    }) ??
    FALLBACK_SHORT_ID_CLAIM,
});
