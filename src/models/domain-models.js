/**
 * Strict domain models for wardrobe ingestion and look generation.
 */

/** @typedef {'draft' | 'approved' | 'requires_review' | 'rejected'} ReviewState */
/** @typedef {'single_item' | 'person_outfit' | 'manual' | 'unknown'} SourceType */

/**
 * @typedef {Object} FaceAsset
 * @property {string} id
 * @property {string} originalUrl
 * @property {string} avatarUrl
 * @property {string} croppedFaceUrl
 * @property {number} qualityScore
 * @property {{ faceCount: number, faceAreaRatio: number, blurScore: number, occlusionScore: number, imageWidth: number, imageHeight: number }} metrics
 * @property {ReviewState} reviewState
 * @property {string} createdAt
 */

/**
 * @typedef {Object} UserProfile
 * @property {string} id
 * @property {string} name
 * @property {string} style
 * @property {string} avatarUrl
 * @property {string} [profileAvatarUrl]
 * @property {string} [lookFaceAssetUrl]
 * @property {FaceAsset | null} faceAsset
 * @property {boolean} onboardingComplete
 */

/**
 * @typedef {Object} ExtractedGarment
 * @property {string} id
 * @property {string} title
 * @property {import('./garment.js').GarmentCategory} category
 * @property {string} subcategory
 * @property {string[]} colors
 * @property {string[]} styleTags
 * @property {string[]} seasonTags
 * @property {string[]} occasionTags
 * @property {string} thumbnailUrl
 * @property {string} iconName
 * @property {SourceType} sourceType
 * @property {boolean} backgroundRemoved
 * @property {number} extractionConfidence
 * @property {number} confidence
 * @property {boolean} requiresReview
 * @property {ReviewState} reviewState
 * @property {string} createdAt
 * @property {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} [bodySlot]
 * @property {number} [positionOffsetX]
 * @property {number} [positionOffsetY]
 * @property {string} [processedImageUrl]
 * @property {boolean} [rawImageFallback]
 * @property {Record<string, any>} [metadata]
 */

/**
 * @typedef {Object} WardrobeItem
 * @property {string} id
 * @property {string} title
 * @property {import('./garment.js').GarmentCategory} category
 * @property {string} subcategory
 * @property {string[]} colors
 * @property {string[]} styleTags
 * @property {string[]} seasonTags
 * @property {string[]} occasionTags
 * @property {string} thumbnailUrl
 * @property {string} iconName
 * @property {SourceType} sourceType
 * @property {boolean} backgroundRemoved
 * @property {number} extractionConfidence
 * @property {number} confidence
 * @property {boolean} requiresReview
 * @property {ReviewState} reviewState
 * @property {string} createdAt
 * @property {'head' | 'torso' | 'legs' | 'socks' | 'feet' | 'accessory'} [bodySlot]
 * @property {number} [positionOffsetX]
 * @property {number} [positionOffsetY]
 * @property {string} [processedImageUrl]
 * @property {boolean} [rawImageFallback]
 */

/**
 * @typedef {Object} WeatherContext
 * @property {number} temperature
 * @property {import('./weather.js').WeatherCondition} condition
 * @property {number} humidity
 * @property {number} windSpeed
 */

/**
 * @typedef {Object} TrendSignal
 * @property {string} tag
 * @property {number} score
 * @property {string} [source]
 */

/**
 * @typedef {Object} OutfitSuggestion
 * @property {string} id
 * @property {string} title
 * @property {string[]} itemIds
 * @property {number} score
 * @property {string[]} reasons
 * @property {string} createdAt
 */

/**
 * @typedef {Object} ExtractionResult
 * @property {boolean} success
 * @property {'success' | 'partial' | 'failed' | 'unsupported' | 'uncertain'} status
 * @property {'single_item' | 'person_outfit' | 'unsupported' | 'uncertain'} inputType
 * @property {ExtractedGarment[]} autoApproved
 * @property {ExtractedGarment[]} requiresReview
 * @property {string[]} logs
 * @property {string | null} error
 * @property {{ confidence: number, reason: string, metrics?: Record<string, any> }} classification
 */

/**
 * @param {import('./garment.js').GarmentCategory} category
 * @returns {string}
 */
export function iconForCategory(category) {
  const map = {
    base: 'icon-base-layer',
    shirt: 'icon-shirt',
    sweater: 'icon-sweater',
    outerwear: 'icon-jacket',
    dress: 'icon-dress',
    pants: 'icon-pants',
    socks: 'icon-socks',
    shoes: 'icon-shoes',
    accessory: 'icon-accessory',
  };
  return map[category] || 'icon-garment';
}

/**
 * @param {WardrobeItem | ExtractedGarment} item
 * @returns {boolean}
 */
export function hasVisualAsset(item) {
  return Boolean(item.thumbnailUrl && item.thumbnailUrl.trim().length > 0);
}
