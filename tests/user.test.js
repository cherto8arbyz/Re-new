import { describe, it, expect } from './runner.js';
import { createUser, validateUser, updateAvatar, USER_STYLES } from '../src/models/user.js';

describe('User Model', () => {
  it('should create a user with valid data', () => {
    const user = createUser({ name: 'Anna', style: 'casual' });
    expect(user.name).toBe('Anna');
    expect(user.style).toBe('casual');
    expect(user.avatarUrl).toBe('');
    expect(user.onboardingComplete).toBe(false);
    expect(typeof user.id).toBe('string');
  });

  it('should generate a unique id if not provided', () => {
    const u1 = createUser({ name: 'A', style: 'casual' });
    const u2 = createUser({ name: 'B', style: 'classic' });
    expect(u1.id !== u2.id).toBeTruthy();
  });

  it('should use provided id when given', () => {
    const user = createUser({ id: 'user-42', name: 'Test', style: 'sporty' });
    expect(user.id).toBe('user-42');
  });

  it('should throw for invalid style', () => {
    expect(() => createUser({ name: 'Test', style: 'invalid-style' })).toThrow();
  });

  it('should throw for empty name', () => {
    expect(() => createUser({ name: '', style: 'casual' })).toThrow();
  });

  it('should validate a complete user', () => {
    const user = createUser({ name: 'Anna', style: 'casual' });
    const result = validateUser(user);
    expect(result.valid).toBeTruthy();
    expect(result.errors).toHaveLength(0);
  });

  it('should flag user without name as invalid', () => {
    const user = /** @type {import('../src/models/user.js').User} */ ({ id: '1', name: '', style: 'casual', avatarUrl: '', onboardingComplete: false });
    const result = validateUser(user);
    expect(result.valid).toBeFalsy();
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('should update avatar URL', () => {
    const user = createUser({ name: 'Anna', style: 'casual' });
    const updated = updateAvatar(user, 'data:image/png;base64,abc');
    expect(updated.avatarUrl).toBe('data:image/png;base64,abc');
    expect(updated.name).toBe('Anna');
  });

  it('should mark onboarding as complete when avatar is set', () => {
    const user = createUser({ name: 'Anna', style: 'casual' });
    const updated = updateAvatar(user, 'data:image/png;base64,abc');
    expect(updated.onboardingComplete).toBeTruthy();
  });

  it('should expose valid style options', () => {
    expect(USER_STYLES.length).toBeGreaterThan(0);
    expect(USER_STYLES.includes('casual')).toBeTruthy();
    expect(USER_STYLES.includes('classic')).toBeTruthy();
    expect(USER_STYLES.includes('sporty')).toBeTruthy();
    expect(USER_STYLES.includes('minimalist')).toBeTruthy();
  });
});
