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
    accessToken: createDevelopmentAccessToken(id),
    isDevelopmentFallback: true,
  };
}

export function ensureAuthSessionAccessToken(
  session: AuthSession | null | undefined,
  fallbackUserId?: string | null,
): AuthSession {
  const userId = String(session?.user?.id || fallbackUserId || '').trim();
  if (!userId) {
    return session || createDevelopmentSession();
  }

  const accessToken = String(session?.accessToken || '').trim();
  if (accessToken) {
    return {
      ...session!,
      user: {
        ...session!.user,
        id: userId,
      },
    };
  }

  return {
    user: session?.user || {
      id: userId,
      email: 'dev.user@renew.app',
      name: 'Re:new User',
      provider: 'expo:development',
    },
    refreshToken: session?.refreshToken,
    accessToken: createDevelopmentAccessToken(userId),
    isDevelopmentFallback: true,
  };
}

export function resolveAuthAccessToken(
  session: AuthSession | null | undefined,
  fallbackUserId?: string | null,
): string {
  return String(ensureAuthSessionAccessToken(session, fallbackUserId).accessToken || '').trim();
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
    identityReferenceUrls: [],
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

function createDevelopmentAccessToken(userId: string): string {
  const header = base64UrlEncode({ alg: 'none', typ: 'JWT' });
  const payload = base64UrlEncode({
    sub: userId,
    aud: 'renew-development',
    role: 'authenticated',
  });
  return `${header}.${payload}.`;
}

function base64UrlEncode(value: Record<string, unknown>): string {
  const json = JSON.stringify(value);
  const utf8Json = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex: string) => (
    String.fromCharCode(parseInt(hex, 16))
  ));
  const base64 = typeof globalThis.btoa === 'function'
    ? globalThis.btoa(utf8Json)
    : encodeBase64(utf8Json);
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function encodeBase64(value: string): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let output = '';

  for (let index = 0; index < value.length; index += 3) {
    const byte1 = value.charCodeAt(index);
    const byte2 = index + 1 < value.length ? value.charCodeAt(index + 1) : NaN;
    const byte3 = index + 2 < value.length ? value.charCodeAt(index + 2) : NaN;

    const encoded1 = byte1 >> 2;
    const encoded2 = ((byte1 & 0x03) << 4) | ((Number.isNaN(byte2) ? 0 : byte2) >> 4);
    const encoded3 = Number.isNaN(byte2) ? 64 : (((byte2 & 0x0f) << 2) | ((Number.isNaN(byte3) ? 0 : byte3) >> 6));
    const encoded4 = Number.isNaN(byte3) ? 64 : (byte3 & 0x3f);

    output += alphabet.charAt(encoded1);
    output += alphabet.charAt(encoded2);
    output += encoded3 === 64 ? '=' : alphabet.charAt(encoded3);
    output += encoded4 === 64 ? '=' : alphabet.charAt(encoded4);
  }

  return output;
}
