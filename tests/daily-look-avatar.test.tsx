import { buildLookPreviewComposition, resolveAvatarPreviewUrl } from '../src/shared/look-preview';
import { buildWardrobeItem } from '../src/shared/wardrobe';

describe('daily look avatar preview', () => {
  it('prefers the generated avatar base over the raw profile photo', () => {
    const item = buildWardrobeItem({
      id: 'top-1',
      name: 'black shirt',
      category: 'shirt',
      imageUrl: 'file:///top-1.jpg',
    });

    const profile = {
      avatarUrl: 'file:///profile-photo.jpg',
      profileAvatarUrl: 'file:///profile-photo.jpg',
      lookFaceAssetUrl: 'data:image/png;base64,avatar-base',
      identityReferenceUrls: ['https://example.com/face-1.webp'],
      faceAsset: null,
    };

    const composition = buildLookPreviewComposition([item], profile);

    expect(resolveAvatarPreviewUrl(profile)).toBe('data:image/png;base64,avatar-base');
    expect(composition.avatarUrl).toBe('data:image/png;base64,avatar-base');
  });

  it('treats a raw profile photo fallback as missing avatar base', () => {
    const item = buildWardrobeItem({
      id: 'shoe-1',
      name: 'white sneaker',
      category: 'shoes',
      imageUrl: 'file:///shoe-1.jpg',
    });

    const profile = {
      avatarUrl: 'file:///profile-photo.jpg',
      profileAvatarUrl: 'file:///profile-photo.jpg',
      lookFaceAssetUrl: 'file:///profile-photo.jpg',
      identityReferenceUrls: ['https://example.com/face-1.webp'],
      faceAsset: null,
    };

    const composition = buildLookPreviewComposition([item], profile);

    expect(resolveAvatarPreviewUrl(profile)).toBe('');
    expect(composition.avatarUrl).toBe('');
    expect(composition.avatarState).toBe('missing');
  });
});
