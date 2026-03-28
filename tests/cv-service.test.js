import { describe, it, expect } from './runner.js';
import { generateAvatar, analyzeGarment, extractWardrobeFromUpload } from '../src/services/cv-service.js';

globalThis.__RENEW_TEST_GEMINI__ = {
  wardrobeValidation({ sourceFileName = '', dataUrl = '' }) {
    const marker = `${String(sourceFileName || '')} ${String(dataUrl || '')}`
      .toLowerCase()
      .replace(/[_\s]+/g, '-');

    if (marker.includes('gemini-api-down')) {
      throw new Error('Gemini request failed: upstream timeout');
    }

    if (marker.includes('living-room') || marker.includes('interior') || marker.includes('food') || marker.includes('pet')) {
      return {
        isValidWearable: false,
        inputType: 'unsupported',
        acceptance: 'reject',
        category: 'unknown',
        subcategory: '',
        color: '',
        colors: [],
        title: '',
        confidence: 0.98,
        rejectionReason: 'Image shows a non-fashion scene instead of a wearable item.',
      };
    }

    if (marker.includes('person-wearing') || marker.includes('full-body')) {
      return {
        isValidWearable: false,
        inputType: 'person_outfit',
        acceptance: 'reject',
        category: 'unknown',
        subcategory: '',
        color: '',
        colors: [],
        title: '',
        confidence: 0.96,
        rejectionReason: 'Upload shows a full-body person instead of a single wardrobe item.',
      };
    }

    if (marker.includes('denim-shorts') || marker.includes('washed-shorts')) {
      return [
        'Here is the wardrobe decision.',
        '```json',
        '{"isValidWearable":true,"inputType":"single_item","acceptance":"accept","category":"pants","subcategory":"shorts","color":"blue","colors":["blue"],"title":"Blue Denim Shorts","confidence":0.95,"rejectionReason":null}',
        '```',
      ].join('\n');
    }

    if (marker.includes('hoodie')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'sweater',
        subcategory: 'hoodie',
        color: 'olive',
        colors: ['olive'],
        title: 'Olive Zip Hoodie',
        confidence: 0.93,
        rejectionReason: null,
      };
    }

    if (marker.includes('wide-leg-light-jeans') || marker.includes('jeans')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'pants',
        subcategory: 'wide-leg jeans',
        color: 'blue',
        colors: ['blue'],
        title: 'Wide-Leg Jeans',
        confidence: 0.94,
        rejectionReason: null,
      };
    }

    if (marker.includes('sneaker') || marker.includes('shoe')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'shoes',
        subcategory: 'sneakers',
        color: 'white',
        colors: ['white'],
        title: 'White Sneakers',
        confidence: 0.95,
        rejectionReason: null,
      };
    }

    if (marker.includes('sock')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'socks',
        subcategory: 'socks',
        color: 'white',
        colors: ['white'],
        title: 'White Crew Socks',
        confidence: 0.94,
        rejectionReason: null,
      };
    }

    if (marker.includes('headphone')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'accessory',
        subcategory: 'headphones',
        color: 'black',
        colors: ['black'],
        title: 'Black Headphones',
        confidence: 0.93,
        rejectionReason: null,
      };
    }

    if (marker.includes('trucker-cap') || marker.includes('cap') || marker.includes('hat')) {
      return `Result: {"isValidWearable":true,"inputType":"single_item","acceptance":"accept","category":"accessory","subcategory":"cap","color":"black","colors":["black"],"title":"Black Trucker Cap","confidence":0.92,"rejectionReason":null}`;
    }

    if (marker.includes('belt')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'accessory',
        subcategory: 'belt',
        color: 'brown',
        colors: ['brown'],
        title: 'Brown Belt',
        confidence: 0.91,
        rejectionReason: null,
      };
    }

    if (marker.includes('bag')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'accessory',
        subcategory: 'shoulder bag',
        color: 'black',
        colors: ['black'],
        title: 'Mini Shoulder Bag',
        confidence: 0.9,
        rejectionReason: null,
      };
    }

    if (marker.includes('linen-layer')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'review',
        category: 'shirt',
        subcategory: 'shirt',
        color: 'beige',
        colors: ['beige'],
        title: 'Linen Layer',
        confidence: 0.69,
        rejectionReason: null,
      };
    }

    if (marker.includes('broken-parser-shorts')) {
      return 'The item is probably denim shorts, but the formatter broke before JSON output.';
    }

    if (marker.includes('blouse') || marker.includes('shirt')) {
      return {
        isValidWearable: true,
        inputType: 'single_item',
        acceptance: 'accept',
        category: 'shirt',
        subcategory: 'blouse',
        color: 'white',
        colors: ['white'],
        title: 'White Short Sleeve Shirt',
        confidence: 0.96,
        rejectionReason: null,
      };
    }

    return {
      isValidWearable: true,
      inputType: 'single_item',
      acceptance: 'review',
      category: 'shirt',
      subcategory: 'shirt',
      color: 'gray',
      colors: ['gray'],
      title: 'Clean Shirt',
      confidence: 0.74,
      rejectionReason: null,
    };
  },
};

describe('CV Service - generateAvatar', () => {
  it('should return an avatar result from a photo data URL', async () => {
    const result = await generateAvatar('data:image/png;base64,fakePhoto');
    expect(typeof result.avatarUrl).toBe('string');
    expect(result.avatarUrl.length).toBeGreaterThan(0);
    expect(result.success).toBeTruthy();
  });

  it('should return error for empty photo input', async () => {
    const result = await generateAvatar('');
    expect(result.success).toBeFalsy();
    expect(typeof result.error).toBe('string');
  });

  it('should return error for null photo input', async () => {
    const result = await generateAvatar(null);
    expect(result.success).toBeFalsy();
  });

  it('should return a real-photo avatar data URL', async () => {
    const result = await generateAvatar('data:image/png;base64,validPhoto');
    expect(result.avatarUrl.startsWith('data:image/')).toBeTruthy();
    expect(result.avatarUrl.startsWith('data:image/svg+xml')).toBeFalsy();
  });
});

describe('CV Service - analyzeGarment', () => {
  it('should analyze a garment photo and return garment data', async () => {
    const result = await analyzeGarment('data:image/png;base64,shirtPhoto');
    expect(result.success).toBeTruthy();
    expect(typeof result.garment).toBe('object');
    expect(typeof result.garment.category).toBe('string');
    expect(typeof result.garment.color).toBe('string');
    expect(typeof result.garment.name).toBe('string');
  });

  it('should return error for empty photo', async () => {
    const result = await analyzeGarment('');
    expect(result.success).toBeFalsy();
    expect(typeof result.error).toBe('string');
  });

  it('should assign a valid category to analyzed garment', async () => {
    const validCategories = ['base', 'shirt', 'sweater', 'outerwear', 'dress', 'accessory', 'pants', 'socks', 'shoes'];
    const result = await analyzeGarment('data:image/png;base64,anyPhoto');
    expect(validCategories.includes(result.garment.category)).toBeTruthy();
  });

  it('should assign position data to analyzed garment', async () => {
    const result = await analyzeGarment('data:image/png;base64,photo');
    const pos = result.garment.position;
    expect(typeof pos.x).toBe('number');
    expect(typeof pos.y).toBe('number');
    expect(typeof pos.width).toBe('number');
    expect(typeof pos.height).toBe('number');
  });

  it('should remove background (mock returns empty imageUrl)', async () => {
    const result = await analyzeGarment('data:image/png;base64,photo');
    expect(typeof result.garment.imageUrl).toBe('string');
  });

  it('should accept blouse uploads through Gemini wardrobe validation', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'white-blouse-product-shot.jpg',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('shirt');
    expect(item.subcategory).toBe('blouse');
  });

  it('should accept hoodie uploads through Gemini wardrobe validation', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'olive-zip-hoodie.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('sweater');
    expect(item.subcategory).toBe('hoodie');
    expect(item.title).toBe('Olive Zip Hoodie');
  });

  it('should parse fenced Gemini JSON and accept shorts uploads', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'blue-denim-shorts.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('pants');
    expect(item.subcategory).toBe('shorts');
    expect(item.title).toBe('Blue Denim Shorts');
  });

  it('should classify jeans as pants instead of generic shirt', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'wide-leg-light-jeans.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('pants');
    expect(['wide-leg jeans', 'wide leg jeans', 'jeans', 'pants'].includes(item.subcategory)).toBeTruthy();
  });

  it('should accept hats as accessory uploads', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'black-trucker-cap.jpg',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('accessory');
    expect(['cap', 'hat'].includes(item.subcategory)).toBeTruthy();
    expect(item.title).toBeTruthy();
  });

  it('should accept footwear uploads', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'white-sneakers.jpeg',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('shoes');
    expect(['sneakers', 'shoes'].includes(item.subcategory)).toBeTruthy();
  });

  it('should classify socks as footwear and keep them in the feet slot', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'white-crew-socks.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('socks');
    expect(item.subcategory).toBe('socks');
    expect(item.bodySlot).toBe('socks');
  });

  it('should accept bag accessories through Gemini wardrobe validation', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'mini-shoulder-bag.jpeg',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('accessory');
    expect(item.subcategory).toBe('shoulder bag');
    expect(item.title).toBe('Mini Shoulder Bag');
  });

  it('should keep the transparent processed asset when background removal succeeds', async () => {
    globalThis.__RENEW_TEST_BG_REMOVAL__ = {
      success: true,
      backgroundRemoved: true,
      imageDataUrl: 'data:image/png;base64,ZmFrZUJnUmVtb3ZlZA==',
      provider: 'remove.bg',
    };

    try {
      const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
        sourceFileName: 'white-blouse-product-shot.jpg',
      });
      expect(result.success).toBeTruthy();
      const item = result.autoApproved[0] || result.requiresReview[0];
      expect(item.backgroundRemoved).toBeTruthy();
      expect(item.processedImageUrl).toBe('data:image/png;base64,ZmFrZUJnUmVtb3ZlZA==');
      expect(item.rawImageFallback).toBeFalsy();
      expect(item.metadata?.bgRemovalStatus).toBe('succeeded');
      expect(item.metadata?.bgRemovalProvider).toBe('remove.bg');
    } finally {
      delete globalThis.__RENEW_TEST_BG_REMOVAL__;
    }
  });

  it('should keep accepted items addable with the original image when background removal fails', async () => {
    globalThis.__RENEW_TEST_BG_REMOVAL__ = {
      success: false,
      backgroundRemoved: false,
      error: 'Background removal API timed out after 30000 ms.',
      provider: 'external-api',
    };

    try {
      const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
        sourceFileName: 'olive-zip-hoodie.png',
      });
      expect(result.success).toBeTruthy();
      const item = result.autoApproved[0] || result.requiresReview[0];
      expect(item.backgroundRemoved).toBeFalsy();
      expect(Boolean(item.processedImageUrl)).toBeFalsy();
      expect(item.rawImageFallback).toBeTruthy();
      expect(item.metadata?.bgRemovalStatus).toBe('failed');
      expect(item.metadata?.segmentationError).toBe('Background removal API timed out after 30000 ms.');
    } finally {
      delete globalThis.__RENEW_TEST_BG_REMOVAL__;
    }
  });

  it('should reject obvious non-fashion uploads', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'living-room-interior.png',
    });
    expect(result.success).toBeFalsy();
    expect(typeof result.error).toBe('string');
  });

  it('should reject full-body person outfit uploads in single-item wardrobe flow', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'full-body-person-wearing-blazer.jpg',
    });
    expect(result.success).toBeFalsy();
    expect(result.inputType).toBe('person_outfit');
    expect(typeof result.error).toBe('string');
  });

  it('should keep generic single-item uploads reviewable instead of rejecting them', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==');
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(typeof item.title).toBe('string');
    expect(['base', 'shirt', 'sweater', 'outerwear', 'dress', 'accessory', 'pants', 'socks', 'shoes'].includes(item.category)).toBeTruthy();
    expect(item.confidence).toBeGreaterThan(0.45);
  });

  it('should preserve meaningful fallback titles instead of collapsing to a generic shirt label', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'linen-layer.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.title).toBe('Linen Layer');
    expect(item.category).toBe('shirt');
  });

  it('should expose the structured Gemini validation contract on upload classification metrics', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'white-blouse-product-shot.jpg',
    });
    expect(result.success).toBeTruthy();
    expect(result.classification.metrics?.source).toBe('gemini-wardrobe-validation');
    expect(result.classification.metrics?.geminiValidation?.isValidWearable).toBeTruthy();
    expect(result.classification.metrics?.geminiValidation?.category).toBe('shirt');
    expect(result.classification.metrics?.geminiValidation?.title).toBe('White Short Sleeve Shirt');
  });

  it('should return a meaningful AI validation failure when Gemini is unavailable and fallback cannot recover', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'gemini-api-down-living-room.png',
    });
    expect(result.success).toBeFalsy();
    expect(result.error).toBe('AI validation is temporarily unavailable. Please try this upload again.');
  });

  it('should not mark wearable shorts invalid when Gemini text is malformed and heuristics can recover', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'broken-parser-shorts.png',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('pants');
    expect(item.subcategory).toBe('shorts');
  });

  it('should map belts to the accessory body slot', async () => {
    const result = await extractWardrobeFromUpload('data:image/png;base64,ZmFrZQ==', {
      sourceFileName: 'brown-belt.jpg',
    });
    expect(result.success).toBeTruthy();
    const item = result.autoApproved[0] || result.requiresReview[0];
    expect(item.category).toBe('accessory');
    expect(item.bodySlot).toBe('accessory');
  });
});
