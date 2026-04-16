import type {
  AccessoryRole,
  BodySlot,
  ClothingSlot,
  GarmentCategory,
  WardrobeItem,
} from '../types/models';

const HEADWEAR_KEYWORDS = /\b(trucker cap|baseball cap|bucket hat|cap|caps|hat|hats|beanie|beanies|beret|berets|visor|headband|headwear)\b/i;
const BAG_KEYWORDS = /\b(mini bag|shoulder bag|crossbody bag|bag|bags|handbag|handbags|purse|purses|backpack|backpacks|tote|totes|satchel)\b/i;
const EYEWEAR_KEYWORDS = /\b(sunglasses|eyewear|glasses)\b/i;
const NECKWEAR_KEYWORDS = /\b(scarf|scarves|necklace|necklaces|chain|chains|tie|ties|choker)\b/i;
const WRISTWEAR_KEYWORDS = /\b(watch|watches|bracelet|bracelets|cuff|cuffs)\b/i;
const BELT_KEYWORDS = /\b(belt|belts)\b/i;
const JEWELRY_KEYWORDS = /\b(jewelry|jewellery|ring|rings|earring|earrings|ear cuff|ear cuffs|stud|studs|brooch|brooches)\b/i;
const AUDIO_KEYWORDS = /\b(headphones?|headset|earbuds?|airpods?)\b/i;

export function readClothingMarker(input: {
  category?: string;
  subcategory?: string;
  shortTitle?: string;
  fullTitle?: string;
  title?: string;
  name?: string;
  clothingSlot?: string;
  accessoryRole?: string;
  bodySlot?: string;
}): string {
  return [
    input.category,
    input.clothingSlot,
    input.accessoryRole,
    input.bodySlot,
    input.subcategory,
    input.shortTitle,
    input.fullTitle,
    input.title,
    input.name,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

export function resolveAccessoryRole(input: {
  category?: GarmentCategory;
  subcategory?: string;
  shortTitle?: string;
  fullTitle?: string;
  title?: string;
  name?: string;
  accessoryRole?: AccessoryRole;
  bodySlot?: BodySlot;
}): AccessoryRole | undefined {
  if (input.accessoryRole) return input.accessoryRole;
  if (input.category !== 'accessory') return undefined;
  const marker = readClothingMarker(input);

  if (HEADWEAR_KEYWORDS.test(marker) || input.bodySlot === 'head') return 'headwear';
  if (BAG_KEYWORDS.test(marker)) return 'bag';
  if (EYEWEAR_KEYWORDS.test(marker)) return 'eyewear';
  if (NECKWEAR_KEYWORDS.test(marker)) return 'neckwear';
  if (WRISTWEAR_KEYWORDS.test(marker)) return 'wristwear';
  if (BELT_KEYWORDS.test(marker)) return 'belt';
  if (JEWELRY_KEYWORDS.test(marker)) return 'jewelry';
  if (AUDIO_KEYWORDS.test(marker)) return 'audio';
  return 'other';
}

export function resolveClothingSlot(input: {
  category?: GarmentCategory;
  subcategory?: string;
  shortTitle?: string;
  fullTitle?: string;
  title?: string;
  name?: string;
  clothingSlot?: ClothingSlot;
  accessoryRole?: AccessoryRole;
  bodySlot?: BodySlot;
}): ClothingSlot {
  if (input.clothingSlot) return input.clothingSlot;

  switch (input.category) {
    case 'base':
    case 'shirt':
    case 'sweater':
      return 'tops';
    case 'outerwear':
      return 'outerwear';
    case 'dress':
      return 'full_body';
    case 'pants':
      return 'bottoms';
    case 'socks':
      return 'socks';
    case 'shoes':
      return 'shoes';
    case 'accessory': {
      const role = resolveAccessoryRole(input);
      if (role === 'headwear') return 'headwear';
      if (role === 'bag') return 'bags';
      if (role === 'jewelry' || role === 'neckwear' || role === 'wristwear') return 'jewelry';
      return 'accessories';
    }
    default:
      return 'accessories';
  }
}

export function resolveBodySlotFromClothing(input: {
  category?: GarmentCategory;
  subcategory?: string;
  shortTitle?: string;
  fullTitle?: string;
  title?: string;
  name?: string;
  clothingSlot?: ClothingSlot;
  accessoryRole?: AccessoryRole;
  bodySlot?: BodySlot;
}): BodySlot {
  if (
    input.bodySlot === 'head'
    || input.bodySlot === 'torso'
    || input.bodySlot === 'legs'
    || input.bodySlot === 'socks'
    || input.bodySlot === 'feet'
    || input.bodySlot === 'accessory'
  ) {
    return input.bodySlot;
  }

  const slot = resolveClothingSlot(input);
  if (slot === 'headwear') return 'head';
  if (slot === 'bottoms') return 'legs';
  if (slot === 'socks') return 'socks';
  if (slot === 'shoes') return 'feet';
  if (slot === 'tops' || slot === 'outerwear' || slot === 'full_body') return 'torso';

  const role = resolveAccessoryRole(input);
  if (role === 'headwear' || role === 'eyewear') return 'head';
  return 'accessory';
}

export function isTopLikeCategory(category: GarmentCategory): boolean {
  return category === 'base' || category === 'shirt' || category === 'sweater';
}

export function isTopLikeSlot(slot: ClothingSlot): boolean {
  return slot === 'tops';
}

export function isCoreOutfitSlot(slot: ClothingSlot): boolean {
  return slot === 'tops' || slot === 'bottoms' || slot === 'full_body' || slot === 'shoes';
}

export function matchesClothingSlot(item: Pick<WardrobeItem, 'category' | 'subcategory' | 'shortTitle' | 'fullTitle' | 'title' | 'name' | 'clothingSlot' | 'accessoryRole' | 'bodySlot'>, slot: ClothingSlot): boolean {
  return resolveClothingSlot(item) === slot;
}
