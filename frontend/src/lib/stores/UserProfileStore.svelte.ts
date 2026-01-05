import { getContext, setContext } from 'svelte';

type PageDataFunction = () => { loggedInUser?: { id: string, displayName: string, isSuperUser: boolean } };

const CONTEXT_KEY = Symbol('user_profile');

// We pass the page data as function, to avoid Svelte's 'state_referenced_locally' warning
// (and I don't want to suppress the warning everywhere)
export function setUserProfileContext(pageDataFunction: PageDataFunction): UserProfile {
  if (getContext(CONTEXT_KEY) != null) {
    throw new Error('UserProfile context is already set');
  }

  const user = pageDataFunction().loggedInUser;
  if (user == null) {
    throw new Error('No logged in user found in page data');
  }

  return setContext(CONTEXT_KEY, new UserProfile(user.id, user.displayName, user.isSuperUser));
}

export function getUserProfile(): UserProfile {
  const userProfile = getContext(CONTEXT_KEY);
  if (userProfile instanceof UserProfile) {
    return userProfile;
  }

  throw new Error('UserProfile context is not set');
}

class UserProfile {
  public readonly id: string;
  public displayName: string;
  public isSuperUser: boolean;
  public profilePictureUri = $state('');

  constructor(userId: string, displayName: string, isSuperUser: boolean) {
    this.id = userId;
    this.displayName = $state(displayName);
    this.isSuperUser = $state(isSuperUser);
    this.indicateProfilePictureChanged();
  }

  updateDisplayName(displayName: string): void {
    this.displayName = displayName;
    this.indicateProfilePictureChanged();
  }

  indicateProfilePictureChanged(): void {
    let newProfilePictureUri = `/api/_frontend/user/${encodeURIComponent(this.id)}/picture.png`;
    if (this.profilePictureUri !== '') {
      newProfilePictureUri += `?t=${Date.now()}`;
    }

    this.profilePictureUri = newProfilePictureUri;
  }
}
