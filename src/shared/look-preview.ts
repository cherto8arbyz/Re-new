import type { ClothingSlot, UserProfile, WardrobeItem } from '../types/models';
import {
  getLayer,
  normalizeWardrobeSelection,
  resolveWardrobeClothingSlot,
} from './wardrobe';

export type LookControlSlot = ClothingSlot;
export type AvatarLookState = 'ready' | 'needs_identity' | 'missing';

export interface LookPreviewComposition {
  avatarUrl: string;
  avatarState: AvatarLookState;
  visibleItems: WardrobeItem[];
  activeSlots: Partial<Record<LookControlSlot, WardrobeItem>>;
  missingCoreSlots: LookControlSlot[];
}

export const LOOK_CONTROL_SLOT_ORDER: LookControlSlot[] = [
  'headwear',
  'full_body',
  'tops',
  'outerwear',
  'bottoms',
  'socks',
  'shoes',
  'bags',
  'jewelry',
  'accessories',
];

export const LOOK_CANVAS_CONTROL_POSITIONS: Record<LookControlSlot, number> = {
  headwear: 16,
  full_body: 30,
  tops: 34,
  outerwear: 41,
  bottoms: 60,
  socks: 77,
  shoes: 84,
  bags: 49,
  jewelry: 23,
  accessories: 55,
};

export function resolveAvatarPreviewUrl(
  profile: Pick<UserProfile, 'avatarUrl' | 'profileAvatarUrl' | 'lookFaceAssetUrl' | 'faceAsset'> | null | undefined,
): string {
  return resolveGeneratedAvatarAssetUrl(profile);
}

const LOOK_SLOT_RENDER_ORDER: Record<LookControlSlot, number> = {
  socks: 18,
  shoes: 22,
  bottoms: 28,
  full_body: 34,
  tops: 40,
  outerwear: 48,
  headwear: 60,
  jewelry: 64,
  accessories: 66,
  bags: 68,
};

export function buildLookPreviewComposition(
  items: WardrobeItem[],
  profile: Pick<UserProfile, 'avatarUrl' | 'profileAvatarUrl' | 'lookFaceAssetUrl' | 'identityReferenceUrls' | 'faceAsset'> | null | undefined,
): LookPreviewComposition {
  const activeSlots = items.reduce<Partial<Record<LookControlSlot, WardrobeItem>>>((accumulator, item) => {
    const slot = resolveWardrobeClothingSlot(item);
    accumulator[slot] = item;
    return accumulator;
  }, {});

  const visibleItems = [...items].sort((left, right) => getLookPreviewLayer(left) - getLookPreviewLayer(right));
  const avatarUrl = resolveAvatarPreviewUrl(profile);
  const identityAnchorUrl = resolveGeneratedAvatarAssetUrl(profile);
  const identityCount = Array.isArray(profile?.identityReferenceUrls) ? profile.identityReferenceUrls.length : 0;
  const avatarState: AvatarLookState = identityAnchorUrl
    ? (identityCount >= 5 ? 'ready' : 'needs_identity')
    : 'missing';

  return {
    avatarUrl,
    avatarState,
    visibleItems,
    activeSlots,
    missingCoreSlots: computeMissingCoreLookSlots(items),
  };
}

export function buildLookSlotOptions(items: WardrobeItem[]): Partial<Record<LookControlSlot, WardrobeItem[]>> {
  return items.reduce<Partial<Record<LookControlSlot, WardrobeItem[]>>>((accumulator, item) => {
    const slot = resolveWardrobeClothingSlot(item);
    accumulator[slot] = [...(accumulator[slot] || []), item];
    accumulator[slot]?.sort(compareLookOptionPriority);
    return accumulator;
  }, {});
}

export function buildLookSelectionForControl(
  slot: LookControlSlot,
  nextItem: WardrobeItem | null,
  activeIds: string[],
  wardrobeItems: WardrobeItem[],
): string[] {
  const selection = new Set(activeIds);

  for (const item of wardrobeItems) {
    if (resolveWardrobeClothingSlot(item) === slot) {
      selection.delete(item.id);
    }
  }

  if (slot === 'full_body' && nextItem) {
    for (const item of wardrobeItems) {
      const itemSlot = resolveWardrobeClothingSlot(item);
      if (itemSlot === 'tops' || itemSlot === 'bottoms') {
        selection.delete(item.id);
      }
    }
  }

  if ((slot === 'tops' || slot === 'bottoms') && nextItem) {
    for (const item of wardrobeItems) {
      if (resolveWardrobeClothingSlot(item) === 'full_body') {
        selection.delete(item.id);
      }
    }
  }

  if (nextItem) {
    selection.add(nextItem.id);
  }

  return normalizeWardrobeSelection(wardrobeItems, Array.from(selection));
}

export function getLookPreviewLayer(item: WardrobeItem): number {
  const slot = resolveWardrobeClothingSlot(item);
  return LOOK_SLOT_RENDER_ORDER[slot] + getLayer(item) / 100;
}

export function getLookControlSlotLabel(slot: LookControlSlot): string {
  switch (slot) {
    case 'headwear':
      return 'Headwear';
    case 'tops':
      return 'Top';
    case 'outerwear':
      return 'Outerwear';
    case 'bottoms':
      return 'Bottom';
    case 'full_body':
      return 'Full body';
    case 'socks':
      return 'Socks';
    case 'shoes':
      return 'Shoes';
    case 'bags':
      return 'Bag';
    case 'jewelry':
      return 'Jewelry';
    case 'accessories':
      return 'Accessory';
    default:
      return slot;
  }
}

export function buildLookMissingSlotLabels(items: WardrobeItem[]): string[] {
  return computeMissingCoreLookSlots(items).map(slot => {
    switch (slot) {
      case 'tops':
        return 'a top';
      case 'bottoms':
        return 'bottoms';
      case 'shoes':
        return 'shoes';
      default:
        return getLookControlSlotLabel(slot).toLowerCase();
    }
  });
}

function computeMissingCoreLookSlots(items: WardrobeItem[]): LookControlSlot[] {
  const activeSlots = new Set(items.map(item => resolveWardrobeClothingSlot(item)));
  const missing: LookControlSlot[] = [];

  if (activeSlots.has('full_body')) {
    if (!activeSlots.has('shoes')) missing.push('shoes');
    return missing;
  }

  if (!activeSlots.has('tops')) missing.push('tops');
  if (!activeSlots.has('bottoms')) missing.push('bottoms');
  if (!activeSlots.has('shoes')) missing.push('shoes');
  return missing;
}

function compareLookOptionPriority(left: WardrobeItem, right: WardrobeItem): number {
  const reviewDelta = Number(left.requiresReview) - Number(right.requiresReview);
  if (reviewDelta !== 0) return reviewDelta;
  const confidenceDelta = (right.confidence || 0) - (left.confidence || 0);
  if (confidenceDelta !== 0) return confidenceDelta;
  return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
}

function toTimestamp(value: string | undefined): number {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function resolveGeneratedAvatarAssetUrl(
  profile: Pick<UserProfile, 'avatarUrl' | 'profileAvatarUrl' | 'lookFaceAssetUrl' | 'faceAsset'> | null | undefined,
): string {
  const rawAvatarUrls = new Set(
    [profile?.profileAvatarUrl, profile?.avatarUrl]
      .map(value => String(value || '').trim())
      .filter(Boolean),
  );
  const candidates = [
    profile?.lookFaceAssetUrl,
    profile?.faceAsset?.avatarUrl,
  ]
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return candidates.find(value => !rawAvatarUrls.has(value)) || '';
}
