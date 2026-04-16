import { appReducer } from '../src/native/state/app-reducer';
import { createInitialAppState } from '../src/native/state/app-state';

describe('profile avatar asset persistence', () => {
  it('keeps the previous generated avatar base when a new profile photo update has no regenerated base yet', () => {
    const initialState = {
      ...createInitialAppState(),
      user: {
        id: 'user-1',
        name: 'User',
        style: 'casual' as const,
        avatarGender: 'female' as const,
        bio: '',
        avatarUrl: 'file:///profile-old.jpg',
        profileAvatarUrl: 'file:///profile-old.jpg',
        lookFaceAssetUrl: 'https://cdn.example.com/look-face-old.png',
        faceReferenceUrl: 'https://cdn.example.com/look-face-old.png',
        identityReferenceUrls: [],
        faceAsset: null,
        onboardingComplete: true,
      },
    };

    const nextState = appReducer(initialState, {
      type: 'SET_PROFILE_AVATAR_ASSETS',
      payload: {
        avatarUrl: 'file:///profile-new.jpg',
      },
    });

    expect(nextState.user?.profileAvatarUrl).toBe('file:///profile-new.jpg');
    expect(nextState.user?.avatarUrl).toBe('file:///profile-new.jpg');
    expect(nextState.user?.lookFaceAssetUrl).toBe('https://cdn.example.com/look-face-old.png');
    expect(nextState.user?.faceReferenceUrl).toBe('https://cdn.example.com/look-face-old.png');
  });
});
