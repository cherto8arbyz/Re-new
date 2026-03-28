import { describe, expect, it } from './runner.js';
import { resolvePreferredVisualAsset } from '../src/models/garment-presentation.js';

describe('Wardrobe visual assets', () => {
  it('prefers the transparent processed asset for Looks when available', () => {
    const image = resolvePreferredVisualAsset({
      imageUrl: 'https://example.com/raw.jpg',
      thumbnailUrl: 'https://example.com/thumb.jpg',
      originalUrl: 'https://example.com/raw.jpg',
      processedImageUrl: 'https://example.com/transparent.png',
      backgroundRemoved: true,
      metadata: {},
    });

    expect(image.url).toBe('https://example.com/transparent.png');
    expect(image.source).toBe('processed_transparent');
  });

  it('falls back to the original wardrobe asset when no transparent version exists', () => {
    const image = resolvePreferredVisualAsset({
      imageUrl: 'https://example.com/raw-jeans.jpg',
      originalUrl: 'https://example.com/raw-jeans.jpg',
      backgroundRemoved: false,
      rawImageFallback: true,
      metadata: {},
    });

    expect(image.url).toBe('https://example.com/raw-jeans.jpg');
    expect(image.source).toBe('raw_fallback');
  });
});
