import {
  STYLE_PREFERENCES,
  type AuthSession,
  type FaceAsset,
  type StylePreference,
  type UserProfile,
} from '../types/models';
import { createId } from './wardrobe';

export interface OnboardingSubmission {
  name: string;
  style: StylePreference;
  avatarUrl: string;
  city?: string;
  faceAsset?: FaceAsset | null;
  lookFaceAssetUrl?: string;
}

export function createDevelopmentSession(): AuthSession {
  const id = createId('dev-user');
  return {
    user: {
      id,
      email: 'dev.user@renew.app',
      name: 'Re:new User',
      provider: 'expo:development',
    },
    isDevelopmentFallback: true,
  };
}

export function buildUserProfile(session: AuthSession, input: OnboardingSubmission): UserProfile {
  return {
    id: session.user.id,
    name: input.name.trim(),
    style: normalizeStylePreference(input.style),
    bio: '',
    avatarUrl: input.avatarUrl,
    profileAvatarUrl: input.avatarUrl,
    lookFaceAssetUrl: input.lookFaceAssetUrl || input.avatarUrl,
    faceReferenceUrl: input.lookFaceAssetUrl || input.avatarUrl,
    faceAsset: input.faceAsset || null,
    onboardingComplete: true,
  };
}

export function isOnboardingComplete(profile: UserProfile | null): boolean {
  return Boolean(
    profile &&
    profile.onboardingComplete &&
    profile.name.trim().length > 0 &&
    STYLE_PREFERENCES.includes(profile.style)
  );
}

export function normalizeStylePreference(value: string): StylePreference {
  const fallback: StylePreference = 'casual';
  return STYLE_PREFERENCES.includes(value as StylePreference) ? (value as StylePreference) : fallback;
}
