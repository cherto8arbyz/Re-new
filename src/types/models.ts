export const APP_TABS = ['home', 'wardrobe', 'looks', 'chat', 'profile'] as const;
export const GARMENT_CATEGORIES = ['base', 'shirt', 'sweater', 'outerwear', 'dress', 'accessory', 'pants', 'socks', 'shoes'] as const;
export const BODY_SLOTS = ['head', 'torso', 'legs', 'socks', 'feet', 'accessory'] as const;
export const REVIEW_STATES = ['draft', 'approved', 'requires_review', 'rejected'] as const;
export const SOURCE_TYPES = ['single_item', 'person_outfit', 'manual', 'unknown'] as const;
export const STYLE_PREFERENCES = ['casual', 'classic', 'sporty', 'minimalist', 'streetwear', 'bohemian'] as const;
export const UPLOAD_INPUT_TYPES = ['single_item', 'person_outfit', 'unsupported', 'uncertain'] as const;
export const WEATHER_CONDITIONS = ['clear', 'cloudy', 'rain', 'snow', 'wind', 'unknown'] as const;
export const THEME_MODES = ['dark', 'light'] as const;
export const ACCENT_PALETTE_KEYS = ['blush', 'sky', 'mint', 'coral', 'custom'] as const;
export const AVATAR_GENDERS = ['female', 'male'] as const;
export const CLOTHING_SLOTS = ['headwear', 'tops', 'outerwear', 'bottoms', 'full_body', 'socks', 'shoes', 'bags', 'jewelry', 'accessories'] as const;
export const ACCESSORY_ROLES = ['headwear', 'bag', 'eyewear', 'neckwear', 'wristwear', 'belt', 'jewelry', 'audio', 'other'] as const;

export type AppTab = (typeof APP_TABS)[number];
export type GarmentCategory = (typeof GARMENT_CATEGORIES)[number];
export type BodySlot = (typeof BODY_SLOTS)[number];
export type ReviewState = (typeof REVIEW_STATES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];
export type StylePreference = (typeof STYLE_PREFERENCES)[number];
export type UploadInputType = (typeof UPLOAD_INPUT_TYPES)[number];
export type WeatherCondition = (typeof WEATHER_CONDITIONS)[number];
export type ThemeMode = (typeof THEME_MODES)[number];
export type AccentPaletteKey = (typeof ACCENT_PALETTE_KEYS)[number];
export type AvatarGender = (typeof AVATAR_GENDERS)[number];
export type ClothingSlot = (typeof CLOTHING_SLOTS)[number];
export type AccessoryRole = (typeof ACCESSORY_ROLES)[number];

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  provider: string;
}

export interface AuthSession {
  user: AuthUser;
  accessToken?: string;
  refreshToken?: string;
  isDevelopmentFallback?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export interface GeoLocation {
  latitude: number | null;
  longitude: number | null;
}

export interface WeatherModel {
  temperature: number;
  condition: WeatherCondition;
  humidity?: number;
  windSpeed?: number;
}

export interface FaceAssetMetrics {
  faceCount: number;
  faceAreaRatio: number;
  blurScore: number;
  occlusionScore: number;
  imageWidth: number;
  imageHeight: number;
}

export interface FaceAsset {
  id: string;
  originalUrl: string;
  avatarUrl: string;
  croppedFaceUrl: string;
  qualityScore: number;
  metrics: FaceAssetMetrics;
  reviewState: ReviewState;
  createdAt: string;
}

export interface UserProfile {
  id: string;
  name: string;
  style: StylePreference;
  avatarGender: AvatarGender;
  bio: string;
  avatarUrl: string;
  profileAvatarUrl?: string;
  lookFaceAssetUrl?: string;
  faceReferenceUrl?: string;
  identityReferenceUrls?: string[];
  faceAsset: FaceAsset | null;
  onboardingComplete: boolean;
}

export interface GarmentPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WardrobeItem {
  id: string;
  name: string;
  title: string;
  shortTitle: string;
  fullTitle: string;
  category: GarmentCategory;
  subcategory: string;
  clothingSlot?: ClothingSlot;
  accessoryRole?: AccessoryRole;
  imageUrl: string;
  thumbnailUrl: string;
  iconName: string;
  sourceType: SourceType;
  backgroundRemoved: boolean;
  extractionConfidence: number;
  confidence: number;
  requiresReview: boolean;
  reviewState: ReviewState;
  colors: string[];
  styleTags: string[];
  seasonTags: string[];
  occasionTags: string[];
  createdAt: string;
  position: GarmentPosition;
  color?: string;
  originalUrl?: string;
  cutoutUrl?: string;
  maskUrl?: string;
  bodySlot?: BodySlot;
  positionOffsetX?: number;
  positionOffsetY?: number;
  scale?: number;
  rotation?: number;
  processedImageUrl?: string;
  rawImageFallback?: boolean;
  metadata?: Record<string, unknown>;
}

export interface OutfitItemRef {
  itemId: string;
  category: GarmentCategory;
  clothingSlot?: ClothingSlot;
  bodySlot?: BodySlot;
  layer: number;
}

export interface Outfit {
  id: string;
  name: string;
  styleName?: string;
  confidenceScore?: number;
  photoUrl?: string;
  garments: WardrobeItem[];
  itemRefs: OutfitItemRef[];
  renderMetadata?: Record<string, unknown>;
  createdAt: string;
}

export interface UploadClassificationResult {
  inputType: UploadInputType;
  confidence: number;
  reason: string;
  metrics?: Record<string, unknown>;
}

export interface FaceValidationResult {
  success: boolean;
  faceDetected: boolean;
  source: 'face-detector' | 'gemini-vision' | 'fallback';
  error?: string;
  metrics?: FaceAssetMetrics;
  croppedFaceUrl?: string;
  avatarUrl?: string;
  qualityScore?: number;
  warnings?: string[];
}

export interface BackgroundRemovalResult {
  success: boolean;
  provider: string;
  backgroundRemoved: boolean;
  imageDataUrl?: string;
  error?: string;
  metrics?: Record<string, unknown>;
}

export interface OutfitGenerationResult {
  success: boolean;
  source: 'ai' | 'fallback' | 'manual';
  outfits: Outfit[];
  reason?: string;
  warnings?: string[];
}

export interface SavedLookEntry {
  id: string;
  createdAt: string;
  date: string;
  source: 'ai' | 'fallback' | 'manual';
  outfit: Outfit;
}

export interface WardrobeFilterState {
  query: string;
  categories: GarmentCategory[];
  colors: string[];
  reviewStates: ReviewState[];
  onlyApproved: boolean;
  sourceTypes: SourceType[];
}

export interface AppState {
  selectedDate: string;
  city: string;
  location: GeoLocation;
  weather: WeatherModel | null;
  themeMode: ThemeMode;
  accentPalette: AccentPaletteKey;
  customAccentColor: string | null;
  activeTab: AppTab;
  activeOutfitIndex: number;
  authSession: AuthSession;
  user: UserProfile | null;
  wardrobeItems: WardrobeItem[];
  wardrobeFilter: WardrobeFilterState;
  generatedLooks: Outfit[];
  savedLooks: SavedLookEntry[];
  manualSelectionIds: string[];
  chatMessages: ChatMessage[];
  chatLoading: boolean;
  chatError: string | null;
  aiLoading: boolean;
  aiError: string | null;
}

export interface PersistedAppSnapshot {
  selectedDate: string;
  city: string;
  location: GeoLocation;
  themeMode: ThemeMode;
  accentPalette: AccentPaletteKey;
  customAccentColor: string | null;
  user: UserProfile | null;
  authSession: AuthSession;
  wardrobeItems: WardrobeItem[];
  wardrobeFilter: WardrobeFilterState;
  generatedLooks: Outfit[];
  savedLooks: SavedLookEntry[];
  manualSelectionIds: string[];
  chatMessages: ChatMessage[];
}
