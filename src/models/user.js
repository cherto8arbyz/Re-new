/**
 * @typedef {'casual' | 'classic' | 'sporty' | 'minimalist' | 'streetwear' | 'bohemian'} UserStyle
 */

/** @type {UserStyle[]} */
export const USER_STYLES = ['casual', 'classic', 'sporty', 'minimalist', 'streetwear', 'bohemian'];

/**
 * @typedef {Object} User
 * @property {string} id
 * @property {string} name
 * @property {UserStyle} style
 * @property {string} avatarUrl - Legacy avatar URL (kept for compatibility)
 * @property {string} [profileAvatarUrl] - User profile photo (original upload)
 * @property {string} [lookFaceAssetUrl] - Clean face asset used on look screen
 * @property {string} [faceReferenceUrl] - Face reference used by photorealistic rendering
 * @property {import('./domain-models.js').FaceAsset | null} [faceAsset]
 * @property {boolean} onboardingComplete
 */

/**
 * Creates a validated User object.
 * @param {{
 *  id?: string,
 *  name: string,
 *  style: string,
 *  avatarUrl?: string,
 *  profileAvatarUrl?: string,
 *  lookFaceAssetUrl?: string,
 *  faceReferenceUrl?: string,
 *  faceAsset?: import('./domain-models.js').FaceAsset | null,
 *  onboardingComplete?: boolean
 * }} data
 * @returns {User}
 */
export function createUser(data) {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('User name is required.');
  }
  if (!USER_STYLES.includes(/** @type {UserStyle} */ (data.style))) {
    throw new Error(`Invalid style: "${data.style}". Must be one of: ${USER_STYLES.join(', ')}`);
  }
  return {
    id: data.id || `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: data.name.trim(),
    style: /** @type {UserStyle} */ (data.style),
    avatarUrl: data.avatarUrl || data.profileAvatarUrl || '',
    profileAvatarUrl: data.profileAvatarUrl || data.avatarUrl || '',
    lookFaceAssetUrl: data.lookFaceAssetUrl || data.faceReferenceUrl || '',
    faceReferenceUrl: data.faceReferenceUrl || data.lookFaceAssetUrl || '',
    faceAsset: data.faceAsset || null,
    onboardingComplete: data.onboardingComplete ?? false,
  };
}

/**
 * Validates a user object.
 * @param {User} user
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateUser(user) {
  const errors = [];
  if (!user.name || user.name.trim().length === 0) {
    errors.push('Name is required.');
  }
  if (!USER_STYLES.includes(user.style)) {
    errors.push(`Invalid style: "${user.style}".`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * Returns a new user with the avatar URL set and onboarding marked complete.
 * @param {User} user
 * @param {string} avatarUrl
 * @returns {User}
 */
export function updateAvatar(user, avatarUrl) {
  return {
    ...user,
    avatarUrl,
    profileAvatarUrl: avatarUrl,
    onboardingComplete: true,
  };
}
