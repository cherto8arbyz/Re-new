import {
  type AccessoryRole,
  GARMENT_CATEGORIES,
  type BodySlot,
  type ClothingSlot,
  type GarmentCategory,
  type GarmentPosition,
  type ReviewState,
  type SourceType,
  type WardrobeFilterState,
  type WardrobeItem,
} from '../types/models';
import {
  readClothingMarker,
  resolveAccessoryRole,
  resolveBodySlotFromClothing,
  resolveClothingSlot,
} from './clothing-taxonomy';

export const CATEGORY_ORDER: GarmentCategory[] = ['shirt', 'sweater', 'outerwear', 'dress', 'pants', 'socks', 'shoes', 'accessory', 'base'];

export const CATEGORY_Z_INDEX: Record<GarmentCategory, number> = {
  base: 10,
  pants: 20,
  dress: 24,
  socks: 30,
  shoes: 40,
  shirt: 45,
  sweater: 50,
  outerwear: 60,
  accessory: 70,
};

export const WARDROBE_ZONE_ORDER: BodySlot[] = ['head', 'torso', 'legs', 'socks', 'feet', 'accessory'];

export const BODY_SLOT_ANCHORS: Record<BodySlot, GarmentPosition> = {
  head: { x: 35, y: 4, width: 30, height: 12 },
  torso: { x: 18, y: 20, width: 56, height: 31 },
  legs: { x: 23, y: 44, width: 45, height: 40 },
  socks: { x: 31, y: 73, width: 30, height: 16 },
  feet: { x: 28, y: 79, width: 36, height: 13 },
  accessory: { x: 61, y: 34, width: 22, height: 19 },
};

export const DEFAULT_GARMENT_POSITIONS: Record<GarmentCategory, GarmentPosition> = {
  base: { x: 20, y: 22, width: 54, height: 27 },
  shirt: { x: 18, y: 20, width: 56, height: 30 },
  sweater: { x: 16, y: 19, width: 60, height: 34 },
  outerwear: { x: 14, y: 18, width: 64, height: 38 },
  dress: { x: 18, y: 20, width: 56, height: 60 },
  pants: { x: 23, y: 44, width: 45, height: 40 },
  socks: { x: 31, y: 73, width: 30, height: 16 },
  shoes: { x: 28, y: 79, width: 36, height: 13 },
  accessory: { x: 61, y: 34, width: 22, height: 19 },
};

export const DEFAULT_WARDROBE_FILTER: WardrobeFilterState = {
  query: '',
  categories: [],
  colors: [],
  reviewStates: [],
  onlyApproved: false,
  sourceTypes: [],
};

const CATEGORY_ALIASES: Record<string, GarmentCategory> = {
  accessory: 'accessory',
  accessories: 'accessory',
  backpack: 'accessory',
  backpacks: 'accessory',
  bag: 'accessory',
  bags: 'accessory',
  base: 'base',
  beanie: 'accessory',
  beanies: 'accessory',
  belt: 'accessory',
  belts: 'accessory',
  beret: 'accessory',
  blouse: 'shirt',
  blouses: 'shirt',
  boots: 'shoes',
  cap: 'accessory',
  caps: 'accessory',
  cami: 'base',
  camisole: 'base',
  cardigan: 'sweater',
  coat: 'outerwear',
  coats: 'outerwear',
  crossbody: 'accessory',
  dress: 'dress',
  dresses: 'dress',
  eyewear: 'accessory',
  flats: 'shoes',
  gloves: 'accessory',
  gown: 'dress',
  handbag: 'accessory',
  handbags: 'accessory',
  hat: 'accessory',
  hats: 'accessory',
  headphone: 'accessory',
  headphones: 'accessory',
  headset: 'accessory',
  heels: 'shoes',
  hoodie: 'sweater',
  hoodies: 'sweater',
  jacket: 'outerwear',
  jackets: 'outerwear',
  jeans: 'pants',
  jumper: 'sweater',
  jumpsuit: 'dress',
  jumpsuits: 'dress',
  jewellery: 'accessory',
  jewelry: 'accessory',
  knitwear: 'sweater',
  loafers: 'shoes',
  outerwear: 'outerwear',
  pants: 'pants',
  purse: 'accessory',
  purses: 'accessory',
  scarf: 'accessory',
  scarves: 'accessory',
  sandals: 'shoes',
  sock: 'socks',
  socks: 'socks',
  shirt: 'shirt',
  shirts: 'shirt',
  shoes: 'shoes',
  shorts: 'pants',
  skirt: 'pants',
  skirts: 'pants',
  slippers: 'shoes',
  sneakers: 'shoes',
  sunglasses: 'accessory',
  sweater: 'sweater',
  sweatshirts: 'sweater',
  't shirt': 'shirt',
  tank: 'base',
  tee: 'shirt',
  top: 'shirt',
  tops: 'shirt',
  tote: 'accessory',
  totes: 'accessory',
  trouser: 'pants',
  trousers: 'pants',
  tshirt: 'shirt',
  earbud: 'accessory',
  earbuds: 'accessory',
  visor: 'accessory',
  watch: 'accessory',
};

const CATEGORY_LABELS: Record<GarmentCategory, string> = {
  accessory: 'accessory',
  base: 'base layer',
  dress: 'dress',
  outerwear: 'outerwear',
  pants: 'bottom',
  socks: 'socks',
  shirt: 'top',
  shoes: 'footwear',
  sweater: 'knitwear',
};

const CATEGORY_DISPLAY_LABELS: Record<GarmentCategory, string> = {
  accessory: 'Accessory',
  base: 'Base Layer',
  dress: 'Dress',
  outerwear: 'Outerwear',
  pants: 'Bottom',
  socks: 'Socks',
  shirt: 'Top',
  shoes: 'Shoes',
  sweater: 'Knitwear',
};

const DESCRIPTOR_KEYWORDS: { pattern: RegExp; label: string; categories?: GarmentCategory[] }[] = [
  { pattern: /\b(t[\s-]?shirt|tee)\b/i, label: 't-shirt', categories: ['shirt', 'base'] },
  { pattern: /\b(top|cami|tank)\b/i, label: 'top', categories: ['shirt', 'base'] },
  { pattern: /\bblouse\b/i, label: 'blouse', categories: ['shirt'] },
  { pattern: /\bshirt\b/i, label: 'shirt', categories: ['shirt'] },
  { pattern: /\bhoodie\b/i, label: 'hoodie', categories: ['sweater'] },
  { pattern: /\bsweatshirt\b/i, label: 'sweatshirt', categories: ['sweater'] },
  { pattern: /\bcardigan\b/i, label: 'cardigan', categories: ['sweater'] },
  { pattern: /\bknitwear\b/i, label: 'knitwear', categories: ['sweater'] },
  { pattern: /\bsweater\b/i, label: 'sweater', categories: ['sweater'] },
  { pattern: /\bblazer\b/i, label: 'blazer', categories: ['outerwear'] },
  { pattern: /\btrench\b/i, label: 'trench coat', categories: ['outerwear'] },
  { pattern: /\bpuffer\b/i, label: 'puffer jacket', categories: ['outerwear'] },
  { pattern: /\bcoat\b/i, label: 'coat', categories: ['outerwear'] },
  { pattern: /\bjacket\b/i, label: 'jacket', categories: ['outerwear'] },
  { pattern: /\bouterwear\b/i, label: 'outerwear item', categories: ['outerwear'] },
  { pattern: /\bjumpsuit\b/i, label: 'jumpsuit', categories: ['dress'] },
  { pattern: /\bromper\b/i, label: 'romper', categories: ['dress'] },
  { pattern: /\bslip dress\b/i, label: 'slip dress', categories: ['dress'] },
  { pattern: /\bdress\b/i, label: 'dress', categories: ['dress'] },
  { pattern: /\bgown\b/i, label: 'gown', categories: ['dress'] },
  { pattern: /\bwide[\s-]?leg\s+jeans?\b/i, label: 'wide-leg jeans', categories: ['pants'] },
  { pattern: /\bcargo\s+pants?\b/i, label: 'cargo pants', categories: ['pants'] },
  { pattern: /\bjeans\b/i, label: 'jeans', categories: ['pants'] },
  { pattern: /\btrousers\b/i, label: 'trousers', categories: ['pants'] },
  { pattern: /\b(skirt|mini skirt|maxi skirt|midi skirt)\b/i, label: 'skirt', categories: ['pants'] },
  { pattern: /\b(shorts?)\b/i, label: 'shorts', categories: ['pants'] },
  { pattern: /\bleggings\b/i, label: 'leggings', categories: ['pants'] },
  { pattern: /\bpants\b/i, label: 'pants', categories: ['pants'] },
  { pattern: /\bsneakers?\b/i, label: 'sneakers', categories: ['shoes'] },
  { pattern: /\bboots?\b/i, label: 'boots', categories: ['shoes'] },
  { pattern: /\bloafers?\b/i, label: 'loafers', categories: ['shoes'] },
  { pattern: /\bheels?\b/i, label: 'heels', categories: ['shoes'] },
  { pattern: /\bsandals?\b/i, label: 'sandals', categories: ['shoes'] },
  { pattern: /\bflats?\b/i, label: 'flats', categories: ['shoes'] },
  { pattern: /\bslippers?\b/i, label: 'slippers', categories: ['shoes'] },
  { pattern: /\bsocks?\b/i, label: 'socks', categories: ['socks'] },
  { pattern: /\bshoes?\b/i, label: 'shoes', categories: ['shoes'] },
  { pattern: /\b(trucker cap|baseball cap|bucket hat)\b/i, label: 'cap', categories: ['accessory'] },
  { pattern: /\b(cap|beanie|beret|hat|headband)\b/i, label: 'hat', categories: ['accessory'] },
  { pattern: /\b(mini bag|shoulder bag|crossbody bag)\b/i, label: 'shoulder bag', categories: ['accessory'] },
  { pattern: /\b(handbag|purse)\b/i, label: 'handbag', categories: ['accessory'] },
  { pattern: /\b(backpack)\b/i, label: 'backpack', categories: ['accessory'] },
  { pattern: /\b(tote)\b/i, label: 'tote bag', categories: ['accessory'] },
  { pattern: /\bbag\b/i, label: 'bag', categories: ['accessory'] },
  { pattern: /\b(sunglasses|eyewear|glasses)\b/i, label: 'eyewear', categories: ['accessory'] },
  { pattern: /\b(headphones?|headset|earbuds?|airpods?)\b/i, label: 'headphones', categories: ['accessory'] },
  { pattern: /\b(earrings?|ear cuff|stud earrings?)\b/i, label: 'earrings', categories: ['accessory'] },
  { pattern: /\b(necklace|bracelet|ring|earrings?|jewelry|jewellery)\b/i, label: 'jewelry', categories: ['accessory'] },
  { pattern: /\b(gloves?)\b/i, label: 'gloves', categories: ['accessory'] },
  { pattern: /\bscarf\b/i, label: 'scarf', categories: ['accessory'] },
  { pattern: /\bbelt\b/i, label: 'belt', categories: ['accessory'] },
];

const COLOR_KEYWORDS: { pattern: RegExp; label: string }[] = [
  { pattern: /\b(off[\s-]?white|ivory|cream|white)\b/i, label: 'white' },
  { pattern: /\b(black|charcoal|jet)\b/i, label: 'black' },
  { pattern: /\b(grey|gray|silver)\b/i, label: 'gray' },
  { pattern: /\b(beige|sand|camel|taupe)\b/i, label: 'beige' },
  { pattern: /\b(brown|tan|mocha|chocolate)\b/i, label: 'brown' },
  { pattern: /\b(navy|indigo|blue|denim)\b/i, label: 'blue' },
  { pattern: /\b(green|olive|sage|mint)\b/i, label: 'green' },
  { pattern: /\b(red|burgundy|maroon)\b/i, label: 'red' },
  { pattern: /\b(pink|rose)\b/i, label: 'pink' },
  { pattern: /\b(purple|lilac|violet)\b/i, label: 'purple' },
  { pattern: /\b(orange|rust|terracotta)\b/i, label: 'orange' },
  { pattern: /\b(yellow|mustard)\b/i, label: 'yellow' },
];

const HAT_KEYWORDS = /\b(hat|cap|beanie|beret|bucket hat|trucker cap|visor|headband|headwear)\b/i;
const FACE_ACCESSORY_KEYWORDS = /\b(sunglasses|glasses)\b/i;
const SCARF_KEYWORDS = /\b(scarf|necklace|chain|tie)\b/i;
const BAG_KEYWORDS = /\b(bag|handbag|shoulder bag|tote|crossbody|backpack|purse|satchel|mini bag)\b/i;
const BELT_KEYWORDS = /\b(belt)\b/i;
const WRIST_KEYWORDS = /\b(watch|bracelet)\b/i;
const DRESS_KEYWORDS = /\b(dress|gown|slip dress|jumpsuit|romper)\b/i;
const SOCK_KEYWORDS = /\b(socks?|ankle socks?|crew socks?|stockings?|hosiery)\b/i;
const FOOTWEAR_KEYWORDS = /\b(sneakers?|shoes?|boots?|heels?|sandals?|loafers?|flats?|slippers?|socks?|ankle socks?|crew socks?)\b/i;
const BOTTOM_KEYWORDS = /\b(jeans|trousers?|pants|shorts?|skirt|leggings|cargo|chino)\b/i;
const TOP_KEYWORDS = /\b(top|t[\s-]?shirt|tee|shirt|blouse|tank|cami)\b/i;
const KNITWEAR_KEYWORDS = /\b(hoodie|sweatshirt|sweater|cardigan|knitwear|jumper|pullover)\b/i;
const OUTERWEAR_KEYWORDS = /\b(jacket|coat|blazer|trench|puffer|parka|outerwear)\b/i;
const GENERIC_SUBCATEGORY_KEYWORDS = /^(heuristic detected|detected|unknown|uncertain|item|garment|fashion item|wearable|clothing|apparel)$/i;
const GENERIC_DESCRIPTOR_KEYWORDS = /^(unknown|uncertain|detected|item|garment|fashion item|wearable|clothing|apparel|photo|image)$/i;
const TOP_CATEGORIES = new Set<GarmentCategory>(['base', 'shirt', 'sweater', 'outerwear', 'dress']);

export interface WardrobeItemDraft {
  id?: string;
  name: string;
  title?: string;
  shortTitle?: string;
  fullTitle?: string;
  category: GarmentCategory;
  subcategory?: string;
  clothingSlot?: ClothingSlot;
  accessoryRole?: AccessoryRole;
  imageUrl?: string;
  thumbnailUrl?: string;
  iconName?: string;
  sourceType?: SourceType;
  backgroundRemoved?: boolean;
  extractionConfidence?: number;
  confidence?: number;
  requiresReview?: boolean;
  reviewState?: ReviewState;
  colors?: string[];
  styleTags?: string[];
  seasonTags?: string[];
  occasionTags?: string[];
  createdAt?: string;
  position?: GarmentPosition;
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

export function normalizeWardrobeCategory(value: string): GarmentCategory | null {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return null;
  if ((GARMENT_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as GarmentCategory;
  }
  return CATEGORY_ALIASES[normalized] ?? inferCategoryFromMarker(normalized);
}

export function inferBodySlot(category: GarmentCategory): BodySlot {
  return resolveBodySlotFromClothing({ category });
}

export function resolveWardrobeBodySlot(input: Pick<WardrobeItemDraft, 'category' | 'subcategory' | 'name' | 'title' | 'shortTitle' | 'fullTitle' | 'bodySlot' | 'clothingSlot' | 'accessoryRole'>): BodySlot {
  return resolveBodySlotFromClothing({
    category: input.category,
    subcategory: input.subcategory,
    name: input.name,
    title: input.title,
    shortTitle: input.shortTitle,
    fullTitle: input.fullTitle,
    bodySlot: input.bodySlot,
    clothingSlot: input.clothingSlot,
    accessoryRole: input.accessoryRole,
  });
}

export function resolveWardrobeClothingSlot(input: Pick<WardrobeItemDraft, 'category' | 'subcategory' | 'name' | 'title' | 'shortTitle' | 'fullTitle' | 'bodySlot' | 'clothingSlot' | 'accessoryRole'>): ClothingSlot {
  return resolveClothingSlot({
    category: input.category,
    subcategory: input.subcategory,
    name: input.name,
    title: input.title,
    shortTitle: input.shortTitle,
    fullTitle: input.fullTitle,
    bodySlot: input.bodySlot,
    clothingSlot: input.clothingSlot,
    accessoryRole: input.accessoryRole,
  });
}

export function resolveWardrobeAccessoryRole(input: Pick<WardrobeItemDraft, 'category' | 'subcategory' | 'name' | 'title' | 'shortTitle' | 'fullTitle' | 'bodySlot' | 'accessoryRole'>): AccessoryRole | undefined {
  return resolveAccessoryRole({
    category: input.category,
    subcategory: input.subcategory,
    name: input.name,
    title: input.title,
    shortTitle: input.shortTitle,
    fullTitle: input.fullTitle,
    bodySlot: input.bodySlot,
    accessoryRole: input.accessoryRole,
  });
}

export function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function formatWardrobeCategory(category: GarmentCategory): string {
  return CATEGORY_DISPLAY_LABELS[category] || CATEGORY_LABELS[category] || category;
}

export function getWardrobeItemColor(item: Pick<WardrobeItem, 'colors' | 'color'>): string {
  return normalizeColorLabel(item.colors[0] || item.color || '');
}

export function getWardrobeItemShortTitle(item: Pick<WardrobeItem, 'shortTitle' | 'fullTitle' | 'title' | 'name' | 'category' | 'subcategory' | 'colors' | 'color'>): string {
  if (String(item.shortTitle || '').trim()) return String(item.shortTitle).trim();
  return buildWardrobeTitles({
    name: String(item.name || item.title || ''),
    title: String(item.title || item.name || ''),
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    color: item.color,
  }).shortTitle;
}

export function getWardrobeItemFullTitle(item: Pick<WardrobeItem, 'shortTitle' | 'fullTitle' | 'title' | 'name' | 'category' | 'subcategory' | 'colors' | 'color'>): string {
  if (String(item.fullTitle || '').trim()) return String(item.fullTitle).trim();
  return buildWardrobeTitles({
    name: String(item.name || item.title || ''),
    title: String(item.title || item.name || ''),
    category: item.category,
    subcategory: item.subcategory,
    colors: item.colors,
    color: item.color,
  }).fullTitle;
}

export function getWardrobeItemCategoryPreview(
  item: Pick<WardrobeItem, 'category' | 'subcategory' | 'name' | 'title' | 'shortTitle' | 'fullTitle' | 'bodySlot' | 'clothingSlot' | 'accessoryRole'>,
): string {
  const slot = resolveWardrobeClothingSlot(item);
  const role = resolveWardrobeAccessoryRole(item);

  if (slot === 'headwear') return 'Headwear';
  if (slot === 'tops') return item.category === 'sweater' ? 'Knitwear' : 'Top';
  if (slot === 'outerwear') return 'Outerwear';
  if (slot === 'bottoms') return 'Bottom';
  if (slot === 'full_body') return 'Dress';
  if (slot === 'socks') return 'Socks';
  if (slot === 'shoes') return 'Shoes';
  if (slot === 'bags') return 'Bag';
  if (slot === 'jewelry') return 'Jewelry';
  if (role === 'eyewear') return 'Eyewear';
  return 'Accessory';
}

export function buildWardrobeItem(draft: WardrobeItemDraft): WardrobeItem {
  const rawName = String(draft.title || draft.name || '').trim();
  const normalizedSubcategory = normalizeWardrobeSubcategory(
    draft.category,
    draft.subcategory,
    rawName,
    String(draft.name || draft.title || ''),
  );
  const normalizedColors = normalizeList(draft.colors || (draft.color ? [draft.color] : []))
    .map(normalizeColorLabel)
    .filter(Boolean);
  const primaryColor = normalizedColors[0] || normalizeColorLabel(draft.color);
  const titles = buildWardrobeTitles({
    ...draft,
    subcategory: normalizedSubcategory,
    colors: normalizedColors,
    color: primaryColor,
  });
  const accessoryRole = resolveWardrobeAccessoryRole({
    ...draft,
    subcategory: normalizedSubcategory,
    shortTitle: titles.shortTitle,
    fullTitle: titles.fullTitle,
  });
  const clothingSlot = resolveWardrobeClothingSlot({
    ...draft,
    subcategory: normalizedSubcategory,
    shortTitle: titles.shortTitle,
    fullTitle: titles.fullTitle,
    accessoryRole,
  });
  const bodySlot = resolveWardrobeBodySlot({
    ...draft,
    subcategory: normalizedSubcategory,
    shortTitle: titles.shortTitle,
    fullTitle: titles.fullTitle,
    accessoryRole,
    clothingSlot,
  });
  const backgroundRemoved = Boolean(draft.backgroundRemoved);
  const processedImageUrl = cleanUri(draft.processedImageUrl);
  const originalUrl = cleanUri(draft.originalUrl);
  const imageUrl =
    processedImageUrl ||
    cleanUri(draft.thumbnailUrl) ||
    cleanUri(draft.imageUrl) ||
    originalUrl;

  return {
    id: draft.id || createId('garment'),
    name: titles.fullTitle,
    title: titles.fullTitle,
    shortTitle: titles.shortTitle,
    fullTitle: titles.fullTitle,
    category: draft.category,
    subcategory: normalizedSubcategory,
    clothingSlot,
    accessoryRole,
    imageUrl,
    thumbnailUrl: cleanUri(draft.thumbnailUrl) || imageUrl,
    iconName: draft.iconName || `icon-${draft.category}`,
    sourceType: draft.sourceType || (imageUrl ? 'single_item' : 'manual'),
    backgroundRemoved,
    extractionConfidence: clamp01(draft.extractionConfidence ?? draft.confidence ?? 1),
    confidence: clamp01(draft.confidence ?? 1),
    requiresReview: Boolean(draft.requiresReview),
    reviewState: draft.reviewState || (draft.requiresReview ? 'requires_review' : 'approved'),
    colors: primaryColor ? [primaryColor, ...normalizedColors.filter(color => color !== primaryColor)] : normalizedColors,
    styleTags: normalizeList(draft.styleTags),
    seasonTags: normalizeList(draft.seasonTags),
    occasionTags: normalizeList(draft.occasionTags),
    createdAt: draft.createdAt || new Date().toISOString(),
    position: draft.position || DEFAULT_GARMENT_POSITIONS[draft.category],
    color: primaryColor || undefined,
    originalUrl,
    cutoutUrl: cleanUri(draft.cutoutUrl),
    maskUrl: cleanUri(draft.maskUrl),
    bodySlot,
    positionOffsetX: clampOffset(draft.positionOffsetX),
    positionOffsetY: clampOffset(draft.positionOffsetY),
    scale: clampScale(draft.scale),
    rotation: clampRotation(draft.rotation),
    processedImageUrl,
    rawImageFallback: draft.rawImageFallback ?? (!backgroundRemoved && Boolean(originalUrl) && !processedImageUrl),
    metadata: {
      ...(draft.metadata || {}),
      clothingSlot,
      accessoryRole,
      closetStorageMode: resolveClosetStorageMode(clothingSlot),
      originalName: rawName,
      rawFallbackUrl: cleanUri((draft.metadata?.rawFallbackUrl as string | undefined) || originalUrl),
    },
  };
}

export function selectBestImageUri(item: WardrobeItem): string {
  return resolvePreferredWardrobeVisualAsset(item).url;
}

export function selectOriginalWardrobeImageUri(item: WardrobeItem): string {
  const candidates = [
    item.originalUrl,
    String(item.metadata?.rawFallbackUrl || ''),
    item.thumbnailUrl,
    item.imageUrl,
    item.cutoutUrl,
    item.processedImageUrl,
  ];
  return candidates.map(cleanUri).find(Boolean) || '';
}

export function filterWardrobeItems(items: WardrobeItem[], filter: WardrobeFilterState): WardrobeItem[] {
  const query = filter.query.trim().toLowerCase();
  const categorySet = new Set(filter.categories);
  const colorSet = new Set(filter.colors.map(color => color.toLowerCase()));
  const reviewSet = new Set(filter.reviewStates);
  const sourceSet = new Set(filter.sourceTypes);

  return items.filter(item => {
    if (query) {
      const haystack = [
        item.shortTitle,
        item.fullTitle,
        item.title,
        item.name,
        item.subcategory,
        item.category,
        ...item.colors,
        ...item.styleTags,
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    if (categorySet.size > 0 && !categorySet.has(item.category)) return false;
    if (colorSet.size > 0) {
      const itemColors = item.colors.map(color => color.toLowerCase());
      if (!itemColors.some(color => colorSet.has(color))) return false;
    }
    if (reviewSet.size > 0 && !reviewSet.has(item.reviewState)) return false;
    if (filter.onlyApproved && item.reviewState !== 'approved') return false;
    if (sourceSet.size > 0 && !sourceSet.has(item.sourceType)) return false;
    return true;
  });
}

export function getLayer(item: WardrobeItem): number {
  return CATEGORY_Z_INDEX[item.category];
}

export function resolvePreferredWardrobeVisualAsset(item: Pick<WardrobeItem, 'backgroundRemoved' | 'processedImageUrl' | 'thumbnailUrl' | 'imageUrl' | 'cutoutUrl' | 'originalUrl' | 'metadata'>): {
  url: string;
  source: 'processed_transparent' | 'cleaned_thumbnail' | 'raw_fallback' | 'none';
  fallbackUsed: boolean;
  backgroundRemoved: boolean;
} {
  const backgroundRemoved = Boolean(item.backgroundRemoved || item.metadata?.backgroundRemoved);
  const processedTransparent = cleanUri(item.processedImageUrl) || cleanUri(String(item.metadata?.processedImageUrl || ''));
  if (processedTransparent) {
    return {
      url: processedTransparent,
      source: 'processed_transparent',
      fallbackUsed: false,
      backgroundRemoved,
    };
  }

  const cleanedThumbnail = cleanUri(String(item.metadata?.processedThumbnailUrl || ''))
    || (backgroundRemoved ? cleanUri(item.thumbnailUrl) : '');
  if (cleanedThumbnail) {
    return {
      url: cleanedThumbnail,
      source: 'cleaned_thumbnail',
      fallbackUsed: false,
      backgroundRemoved,
    };
  }

  const rawFallback = [
    String(item.metadata?.rawFallbackUrl || ''),
    item.originalUrl,
    item.imageUrl,
    item.thumbnailUrl,
    item.cutoutUrl,
  ]
    .map(cleanUri)
    .find(Boolean) || '';
  if (rawFallback && !backgroundRemoved) {
    return {
      url: rawFallback,
      source: 'raw_fallback',
      fallbackUsed: true,
      backgroundRemoved,
    };
  }

  return {
    url: '',
    source: 'none',
    fallbackUsed: false,
    backgroundRemoved,
  };
}

/**
 * Returns the canonical zone for a wardrobe item.
 * @param {Pick<WardrobeItem, 'category' | 'subcategory' | 'name' | 'title' | 'bodySlot'>} item
 * @returns {BodySlot}
 */
export function resolveWardrobeZone(item: Pick<WardrobeItem, 'category' | 'subcategory' | 'name' | 'title' | 'bodySlot'>): BodySlot {
  return resolveWardrobeBodySlot(item);
}

/**
 * Normalizes a selection so each non-accessory zone keeps a single primary
 * item. Accessories are allowed to accumulate.
 * @param {WardrobeItem[]} wardrobeItems
 * @param {string[]} selectedIds
 * @returns {string[]}
 */
export function normalizeWardrobeSelection(wardrobeItems: WardrobeItem[], selectedIds: string[]): string[] {
  const itemsById = new Map(wardrobeItems.map(item => [item.id, item]));
  const slotSelection: Partial<Record<ClothingSlot, string>> = {};

  for (const id of selectedIds) {
    const item = itemsById.get(id);
    if (!item) continue;

    const slot = resolveWardrobeClothingSlot(item);
    if (slot === 'full_body') {
      slotSelection.tops = undefined;
      slotSelection.bottoms = undefined;
      slotSelection.full_body = id;
      continue;
    }

    if (slot === 'tops' || slot === 'bottoms') {
      slotSelection.full_body = undefined;
    }

    slotSelection[slot] = id;
  }

  return [
    ...(slotSelection.headwear ? [slotSelection.headwear] : []),
    ...(slotSelection.full_body ? [slotSelection.full_body] : []),
    ...(slotSelection.tops ? [slotSelection.tops] : []),
    ...(slotSelection.outerwear ? [slotSelection.outerwear] : []),
    ...(slotSelection.bottoms ? [slotSelection.bottoms] : []),
    ...(slotSelection.socks ? [slotSelection.socks] : []),
    ...(slotSelection.shoes ? [slotSelection.shoes] : []),
    ...(slotSelection.bags ? [slotSelection.bags] : []),
    ...(slotSelection.jewelry ? [slotSelection.jewelry] : []),
    ...(slotSelection.accessories ? [slotSelection.accessories] : []),
  ];
}

export function resolveWardrobePlacement(
  item: Pick<WardrobeItem, 'category' | 'subcategory' | 'name' | 'title' | 'shortTitle' | 'fullTitle' | 'bodySlot' | 'clothingSlot' | 'accessoryRole' | 'position' | 'positionOffsetX' | 'positionOffsetY' | 'scale'>,
  slotIndex = 0,
): { x: number; y: number; width: number; height: number; bodySlot: BodySlot } {
  const clothingSlot = resolveWardrobeClothingSlot(item);
  const accessoryRole = resolveWardrobeAccessoryRole(item);
  const bodySlot = resolveWardrobeBodySlot({
    category: item.category,
    subcategory: item.subcategory,
    shortTitle: item.shortTitle,
    name: item.fullTitle || item.name,
    title: item.title,
    bodySlot: item.bodySlot,
    clothingSlot,
    accessoryRole,
  });
  const offsetX = clampOffset(item.positionOffsetX);
  const offsetY = clampOffset(item.positionOffsetY);
  const scale = clampScale(item.scale);
  const marker = readClothingMarker({
    category: item.category,
    subcategory: item.subcategory,
    shortTitle: item.shortTitle,
    fullTitle: item.fullTitle,
    title: item.title,
    name: item.name,
    clothingSlot,
    accessoryRole,
    bodySlot,
  });

  let base = item.position || DEFAULT_GARMENT_POSITIONS[item.category] || BODY_SLOT_ANCHORS[bodySlot];

  if (bodySlot === 'head') {
    if (clothingSlot === 'headwear' || accessoryRole === 'headwear' || HAT_KEYWORDS.test(marker)) {
      base = { x: 34, y: 2, width: 31, height: 10.5 };
    } else if (accessoryRole === 'eyewear' || FACE_ACCESSORY_KEYWORDS.test(marker)) {
      base = { x: 34, y: 9.5, width: 30, height: 7.8 };
    } else {
      base = { ...BODY_SLOT_ANCHORS.head, width: 30, height: 12 };
    }
  } else if (bodySlot === 'torso') {
    if (clothingSlot === 'tops' && item.category === 'base') {
      base = { x: 20.5, y: 22, width: 53, height: 26 };
    } else if (clothingSlot === 'tops' && item.category === 'shirt') {
      if (/\b(cropped|crop|tank|cami|ruched|fitted)\b/i.test(marker)) {
        base = { x: 21.5, y: 22, width: 51, height: 24.5 };
      } else if (/\b(oversized|boxy|button|blouse|camp collar)\b/i.test(marker)) {
        base = { x: 17.5, y: 20, width: 58, height: 31 };
      } else {
        base = DEFAULT_GARMENT_POSITIONS.shirt;
      }
    } else if (clothingSlot === 'tops' && item.category === 'sweater') {
      if (/\b(cropped|crop)\b/i.test(marker)) {
        base = { x: 18.5, y: 20.5, width: 57, height: 29 };
      } else {
        base = DEFAULT_GARMENT_POSITIONS.sweater;
      }
    } else if (clothingSlot === 'outerwear') {
      base = /\b(cropped|crop)\b/i.test(marker)
        ? { x: 16.5, y: 19.5, width: 60, height: 32 }
        : DEFAULT_GARMENT_POSITIONS.outerwear;
    } else if (clothingSlot === 'full_body' || item.category === 'dress' || DRESS_KEYWORDS.test(marker)) {
      base = DEFAULT_GARMENT_POSITIONS.dress;
    }
  } else if (bodySlot === 'legs') {
    if (/\b(shorts?)\b/i.test(marker)) {
      base = { x: 24.5, y: 47, width: 42, height: 25 };
    } else if (/\b(skirt|mini skirt|midi skirt|maxi skirt)\b/i.test(marker)) {
      base = { x: 22.5, y: 46.5, width: 47, height: 29 };
    } else if (/\b(wide[\s-]?leg|flare|bootcut|trouser|jeans|cargo)\b/i.test(marker)) {
      base = { x: 22.5, y: 43.5, width: 46, height: 42 };
    } else {
      base = DEFAULT_GARMENT_POSITIONS.pants;
    }
  } else if (bodySlot === 'socks') {
    base = SOCK_KEYWORDS.test(marker)
      ? { x: 32.5, y: 73, width: 28, height: 17 }
      : DEFAULT_GARMENT_POSITIONS.socks;
  } else if (bodySlot === 'feet') {
    if (/\b(boots?)\b/i.test(marker)) {
      base = { x: 29, y: 76.5, width: 38, height: 18 };
    } else if (/\b(heels?|sandals?|flats?|loafers?)\b/i.test(marker)) {
      base = { x: 30, y: 80, width: 34, height: 11.5 };
    } else {
      base = { x: 28, y: 79, width: 36, height: 13.5 };
    }
  } else if (bodySlot === 'accessory') {
    if (accessoryRole === 'audio' || /\b(headphones?|headset|earbuds?|airpods?)\b/i.test(marker)) {
      base = { x: 33, y: 9.5, width: 32, height: 18 };
    } else if (accessoryRole === 'jewelry' && /\b(earrings?|ear cuff|stud earrings?)\b/i.test(marker)) {
      base = slotIndex % 2 === 0
        ? { x: 33, y: 11.5, width: 8.5, height: 12.5 }
        : { x: 58.5, y: 11.5, width: 8.5, height: 12.5 };
    } else if (accessoryRole === 'neckwear' || SCARF_KEYWORDS.test(marker)) {
      base = { x: 35, y: 23, width: 28, height: 13 };
    } else if (clothingSlot === 'bags' || accessoryRole === 'bag' || BAG_KEYWORDS.test(marker)) {
      base = { x: 60, y: 35, width: 24, height: 20 };
    } else if (accessoryRole === 'belt' || BELT_KEYWORDS.test(marker)) {
      base = { x: 34, y: 54, width: 32, height: 8 };
    } else if (accessoryRole === 'wristwear' || WRIST_KEYWORDS.test(marker)) {
      base = slotIndex % 2 === 0
        ? { x: 14, y: 38, width: 15, height: 12 }
        : { x: 71, y: 38, width: 15, height: 12 };
    } else {
      const presets = [
        { x: 17, y: 23, width: 14, height: 12 },
        { x: 70, y: 23, width: 14, height: 12 },
        { x: 14, y: 54, width: 16, height: 14 },
        { x: 70, y: 54, width: 16, height: 14 },
      ];
      base = presets[Math.abs(slotIndex) % presets.length];
    }
  }

  const width = base.width * scale;
  const height = base.height * scale;
  const x = base.x - (width - base.width) / 2 + offsetX;
  const y = base.y - (height - base.height) / 2 + offsetY;

  return {
    x: Math.max(0, Math.min(100 - width, x)),
    y: Math.max(0, Math.min(100 - height, y)),
    width,
    height,
    bodySlot,
  };
}

function buildWardrobeTitles(input: {
  name?: string;
  title?: string;
  category: GarmentCategory;
  subcategory?: string;
  colors?: string[];
  color?: string;
}): { shortTitle: string; fullTitle: string } {
  const color = normalizeColorLabel(input.colors?.[0] || input.color || '');
  const descriptor = pickDescriptor(input.category, input.subcategory, input.name, input.title);
  const combined = descriptorContainsColor(descriptor, color) || !color
    ? descriptor
    : [color, descriptor].filter(Boolean).join(' ').trim();
  const shortTitle = toTitleCase(combined || fallbackDescriptor(input.category));
  return {
    shortTitle,
    fullTitle: shortTitle,
  };
}

function pickDescriptor(
  category: GarmentCategory,
  subcategory?: string,
  rawName?: string,
  rawTitle?: string,
): string {
  const normalizedSubcategory = normalizeWardrobeSubcategory(category, subcategory, rawName, rawTitle);
  if (normalizedSubcategory) {
    return normalizedSubcategory;
  }

  const sourceText = `${cleanText(rawTitle)} ${cleanText(rawName)}`.trim();
  if (sourceText && !looksLikeTechnicalName(sourceText)) {
    const phrase = normalizeDescriptorPhrase(stripLeadingColorWords(sourceText.toLowerCase()));
    if (phrase && phrase.split(' ').length <= 4 && containsUsefulDescriptor(phrase, category)) {
      return phrase;
    }
    const keyword = findDescriptorKeyword(sourceText, category);
    if (keyword) return keyword.label;
  }

  return fallbackDescriptor(category, sourceText);
}

function normalizeWardrobeSubcategory(
  category: GarmentCategory,
  subcategory: string | undefined,
  rawName?: string,
  rawTitle?: string,
): string {
  const raw = normalizeDescriptorPhrase(stripLeadingColorWords(cleanText(subcategory).toLowerCase()));
  if (raw && !looksLikeTechnicalName(raw) && !GENERIC_SUBCATEGORY_KEYWORDS.test(raw)) {
    return raw;
  }

  const marker = `${cleanText(subcategory)} ${cleanText(rawTitle)} ${cleanText(rawName)}`.trim();
  return findDescriptorKeyword(marker, category)?.label || '';
}

function normalizeList(values: string[] | undefined): string[] {
  return Array.isArray(values)
    ? values.map(value => cleanText(value)).filter(Boolean)
    : [];
}

function normalizeColorLabel(value: string | undefined): string {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return '';

  const modifier = normalized.includes('light') ? 'light ' : normalized.includes('dark') ? 'dark ' : '';
  const keyword = COLOR_KEYWORDS.find(entry => entry.pattern.test(normalized));
  if (keyword) {
    return `${modifier}${keyword.label}`.trim();
  }

  const hex = normalized.replace(/[^0-9a-f]/gi, '');
  if (hex.length === 6) {
    return describeHexColor(hex);
  }

  return normalized;
}

function describeHexColor(hex: string): string {
  const red = parseInt(hex.slice(0, 2), 16) / 255;
  const green = parseInt(hex.slice(2, 4), 16) / 255;
  const blue = parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  const brightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * brightness - 1));

  if (saturation < 0.12) {
    if (brightness > 0.92) return 'white';
    if (brightness > 0.74) return 'light gray';
    if (brightness > 0.38) return 'gray';
    return 'black';
  }

  let hue = 0;
  if (delta !== 0) {
    switch (max) {
      case red:
        hue = ((green - blue) / delta) % 6;
        break;
      case green:
        hue = (blue - red) / delta + 2;
        break;
      default:
        hue = (red - green) / delta + 4;
        break;
    }
  }
  hue *= 60;
  if (hue < 0) hue += 360;

  if (hue < 15 || hue >= 345) return brightness < 0.42 ? 'burgundy' : 'red';
  if (hue < 42) {
    if (brightness > 0.72) return 'beige';
    if (brightness > 0.46) return 'brown';
    return 'orange';
  }
  if (hue < 65) return 'yellow';
  if (hue < 170) return 'green';
  if (hue < 250) return brightness < 0.42 ? 'navy' : 'blue';
  if (hue < 300) return 'purple';
  return 'pink';
}

function looksLikeTechnicalName(value: string): boolean {
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return true;
  return /^(img|image|pxl|dsc|screenshot|photo|scan|capture)[\s_-]?\d+/i.test(normalized)
    || /^[a-z]{2,5}\d{3,}$/i.test(normalized)
    || /^\d+$/.test(normalized);
}

function cleanText(value: string | undefined): string {
  return typeof value === 'string'
    ? value
        .trim()
        .replace(/\.[^.]+$/, '')
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
    : '';
}

function cleanUri(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveClosetStorageMode(clothingSlot: ClothingSlot): string {
  switch (clothingSlot) {
    case 'headwear':
      return 'headwear-rail';
    case 'bags':
    case 'jewelry':
    case 'accessories':
      return 'accessory-hooks';
    case 'socks':
      return 'drawer';
    case 'shoes':
      return 'shoe-shelf';
    default:
      return 'hanger';
  }
}

function containsUsefulDescriptor(value: string, category: GarmentCategory): boolean {
  if (Boolean(findDescriptorKeyword(value, category))) return true;
  if (category === 'pants') return /\b(jeans|trousers|pants|shorts|skirt|wide|straight|cargo)\b/i.test(value);
  if (category === 'socks' || category === 'shoes') return FOOTWEAR_KEYWORDS.test(value);
  if (category === 'dress') return DRESS_KEYWORDS.test(value);
  if (TOP_CATEGORIES.has(category)) return /\b(top|shirt|tee|t-shirt|hoodie|sweater|jacket|coat|dress|blouse|cardigan|blazer)\b/i.test(value);
  if (category === 'accessory') return /\b(hat|cap|bag|scarf|belt|watch|necklace|eyewear|gloves|jewelry|headphones?|headset|earbuds?|earrings?)\b/i.test(value);
  return false;
}

function stripLeadingColorWords(value: string): string {
  return value.replace(
    /^(light|dark|white|black|gray|grey|beige|brown|blue|green|red|pink|purple|orange|yellow|navy|cream|ivory|silver|gold|camel)\s+/i,
    '',
  ).trim();
}

function fallbackDescriptor(category: GarmentCategory, sourceText = ''): string {
  const marker = `${sourceText}`.toLowerCase();
  const keyword = findDescriptorKeyword(marker, category);
  if (keyword) return keyword.label;

  const meaningfulSource = normalizeDescriptorPhrase(stripLeadingColorWords(cleanText(sourceText).toLowerCase()));
  if (meaningfulSource && !looksLikeTechnicalName(meaningfulSource) && !GENERIC_DESCRIPTOR_KEYWORDS.test(meaningfulSource)) {
    return meaningfulSource;
  }

  switch (category) {
    case 'base':
      return 'top';
    case 'shirt':
      return 'top';
    case 'sweater':
      return 'knitwear';
    case 'outerwear':
      return 'outerwear item';
    case 'pants':
      return 'bottom item';
    case 'socks':
      return 'socks';
    case 'shoes':
      return 'footwear item';
    case 'accessory':
      return BAG_KEYWORDS.test(marker) ? 'bag' : HAT_KEYWORDS.test(marker) ? 'hat' : 'fashion accessory';
    case 'dress':
      return 'dress';
    default:
      return CATEGORY_LABELS[category];
  }
}

function inferCategoryFromMarker(marker: string): GarmentCategory | null {
  if (!marker) return null;
  if (DRESS_KEYWORDS.test(marker)) return 'dress';
  if (OUTERWEAR_KEYWORDS.test(marker)) return 'outerwear';
  if (KNITWEAR_KEYWORDS.test(marker)) return 'sweater';
  if (BOTTOM_KEYWORDS.test(marker)) return 'pants';
  if (SOCK_KEYWORDS.test(marker)) return 'socks';
  if (FOOTWEAR_KEYWORDS.test(marker)) return 'shoes';
  if (HAT_KEYWORDS.test(marker) || BAG_KEYWORDS.test(marker) || BELT_KEYWORDS.test(marker) || FACE_ACCESSORY_KEYWORDS.test(marker) || WRIST_KEYWORDS.test(marker) || SCARF_KEYWORDS.test(marker)) {
    return 'accessory';
  }
  if (/\b(base layer|undershirt|tank|cami)\b/i.test(marker)) return 'base';
  if (TOP_KEYWORDS.test(marker)) return 'shirt';
  return null;
}

function findDescriptorKeyword(
  value: string,
  category: GarmentCategory,
): { pattern: RegExp; label: string; categories?: GarmentCategory[] } | null {
  const marker = String(value || '');
  if (!marker) return null;
  return DESCRIPTOR_KEYWORDS.find(entry => (
    entry.pattern.test(marker) &&
    (!entry.categories || entry.categories.includes(category))
  )) || null;
}

function normalizeDescriptorPhrase(value: string): string {
  const normalized = cleanText(value)
    .toLowerCase()
    .replace(/\b(item|garment|fashion|wearable|clothing|apparel)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return '';

  return normalized
    .split(' ')
    .filter(Boolean)
    .filter((word, index, words) => index === 0 || words[index - 1] !== word)
    .join(' ')
    .trim();
}

function descriptorContainsColor(descriptor: string, color: string): boolean {
  const normalizedDescriptor = String(descriptor || '').toLowerCase();
  const normalizedColor = String(color || '').toLowerCase();
  if (!normalizedDescriptor || !normalizedColor) return false;
  return normalizedColor.split(' ').every(token => normalizedDescriptor.includes(token));
}

function toTitleCase(value: string): string {
  return value
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampOffset(value: number | undefined): number {
  const normalized = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(-18, Math.min(18, normalized));
}

function clampScale(value: number | undefined): number {
  const normalized = Number.isFinite(value) ? Number(value) : 1;
  return Math.max(0.78, Math.min(1.55, normalized));
}

function clampRotation(value: number | undefined): number {
  const normalized = Number.isFinite(value) ? Number(value) : 0;
  return Math.max(-14, Math.min(14, normalized));
}
