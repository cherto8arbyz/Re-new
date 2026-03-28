import {
  type GarmentCategory,
  type Outfit,
  type OutfitGenerationResult,
  type OutfitItemRef,
  type StylePreference,
  type WardrobeItem,
  type WeatherModel,
} from '../types/models';
import { createId, getLayer, getWardrobeItemFullTitle, normalizeWardrobeSelection } from './wardrobe';

export interface RecommendationInput {
  wardrobe: WardrobeItem[];
  weather: WeatherModel | null;
  userStyle?: StylePreference | '';
  selectedDate: string;
}

const TOP_CATEGORIES: GarmentCategory[] = ['shirt', 'sweater', 'base'];
const ACCESSORY_LIMIT = 2;
const CORE_LIMIT = 3;

export function buildManualOutfit(wardrobeItems: WardrobeItem[], selectedIds: string[]): Outfit | null {
  if (!selectedIds.length) return null;
  const normalizedIds = normalizeWardrobeSelection(wardrobeItems, selectedIds);
  const selected = normalizedIds
    .map(id => wardrobeItems.find(item => item.id === id))
    .filter((item): item is WardrobeItem => Boolean(item));
  if (!selected.length) return null;

  const missingItems = computeMissingItems(selected);
  return createOutfit({
    name: 'Manual look',
    styleName: 'Manual Try-On',
    garments: selected,
    confidenceScore: 1,
    renderMetadata: {
      generationSource: 'manual',
      missingItems,
      completionPrompt: buildCompletionPrompt(missingItems),
      reasoning: buildReasoning(selected, missingItems, null),
    },
  });
}

export function buildDefaultTryOnOutfit(input: RecommendationInput): Outfit | null {
  return generateOutfitRecommendations(input).outfits[0] || null;
}

export function generateOutfitRecommendations(input: RecommendationInput): OutfitGenerationResult {
  const wardrobe = rankItems(input.wardrobe);
  if (!wardrobe.length) {
    return {
      success: false,
      source: 'fallback',
      outfits: [],
      reason: 'empty_wardrobe',
      warnings: ['Add a few pieces to start building looks.'],
    };
  }

  const weather = input.weather || { temperature: 20, condition: 'unknown' as const };
  const pools = buildPools(wardrobe);
  const candidates = buildCandidateSets(pools, weather.temperature);
  const outfits = dedupe(candidates)
    .map(garments => buildRecommendationOutfit(garments, input, weather.temperature))
    .sort((left, right) => Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0))
    .slice(0, 4);

  return {
    success: outfits.length > 0,
    source: 'fallback',
    outfits,
    warnings: collectWarnings(outfits),
    reason: outfits.some(outfit => getMissingItemsFromMetadata(outfit).length) ? 'partial_wardrobe' : undefined,
  };
}

export function createOutfit(input: {
  name: string;
  garments: WardrobeItem[];
  styleName?: string;
  confidenceScore?: number;
  photoUrl?: string;
  renderMetadata?: Record<string, unknown>;
}): Outfit {
  const garments = sortByLayer(input.garments);
  const itemRefs: OutfitItemRef[] = garments.map(item => ({
    itemId: item.id,
    category: item.category,
    bodySlot: item.bodySlot,
    layer: getLayer(item),
  }));

  return {
    id: createId('outfit'),
    name: input.name,
    styleName: input.styleName,
    confidenceScore: input.confidenceScore,
    photoUrl: input.photoUrl,
    garments,
    itemRefs,
    renderMetadata: input.renderMetadata,
    createdAt: new Date().toISOString(),
  };
}

export function sortByLayer(items: WardrobeItem[]): WardrobeItem[] {
  return [...items].sort((left, right) => getLayer(left) - getLayer(right));
}

function buildRecommendationOutfit(
  garments: WardrobeItem[],
  input: RecommendationInput,
  temperature: number,
): Outfit {
  const missingItems = computeMissingItems(garments);
  const score = scoreCombination(garments, temperature, input.userStyle || '', missingItems);
  const partial = missingItems.length > 0;
  const completionPrompt = buildCompletionPrompt(missingItems);

  return createOutfit({
    name: partial ? 'Look in progress' : 'Ready look',
    styleName: buildStyleName(garments, input.userStyle || '', partial),
    garments,
    confidenceScore: Number((score / 100).toFixed(2)),
    renderMetadata: {
      generationSource: 'fallback',
      recommendation: {
        score,
        source: 'deterministic-fallback',
        date: input.selectedDate,
      },
      missingItems,
      completionPrompt,
      reasoning: buildReasoning(garments, missingItems, temperature),
      warnings: completionPrompt ? [completionPrompt] : [],
    },
  });
}

function buildPools(wardrobe: WardrobeItem[]): Partial<Record<GarmentCategory, WardrobeItem[]>> {
  return wardrobe.reduce<Partial<Record<GarmentCategory, WardrobeItem[]>>>((accumulator, item) => {
    if (!accumulator[item.category]) accumulator[item.category] = [];
    accumulator[item.category]?.push(item);
    return accumulator;
  }, {});
}

function buildCandidateSets(
  pools: Partial<Record<GarmentCategory, WardrobeItem[]>>,
  temperature: number,
): WardrobeItem[][] {
  const dresses = take(pools.dress, CORE_LIMIT);
  const tops = buildTopChoices(pools, CORE_LIMIT);
  const bottoms = take(pools.pants, CORE_LIMIT);
  const socks = take(pools.socks, CORE_LIMIT);
  const shoes = take(pools.shoes, CORE_LIMIT);
  const outerwear = take(pools.outerwear, 2);
  const accessories = take(pools.accessory, ACCESSORY_LIMIT);
  const candidates: WardrobeItem[][] = [];

  const primaryShoes = shoes.length ? shoes : [null];
  const primaryOuterwear = outerwear.length ? outerwear : [null];
  const primaryAccessories = [null, ...accessories];

  for (const dress of dresses) {
    for (const sock of socks.length ? socks : [null]) {
    for (const shoe of primaryShoes) {
      const baseLook = compactGarments([
        dress,
        sock,
        shoe,
        temperature <= 14 ? primaryOuterwear[0] : null,
      ]);
      candidates.push(baseLook);
      if (primaryAccessories[1]) {
        candidates.push(compactGarments([...baseLook, primaryAccessories[1]]));
      }
    }
    }
  }

  const topOptions = tops.length ? tops : [null];
  const bottomOptions = bottoms.length ? bottoms : [null];

  for (const top of topOptions) {
    for (const bottom of bottomOptions) {
      for (const shoe of primaryShoes) {
        for (const sock of socks.length ? socks : [null]) {
        const baseLook = compactGarments([
          top,
          bottom,
          sock,
          shoe,
          temperature <= 12 && top ? primaryOuterwear[0] : null,
        ]);
        if (baseLook.length) {
          candidates.push(baseLook);
        }

        if (baseLook.length && primaryAccessories[1]) {
          candidates.push(compactGarments([...baseLook, primaryAccessories[1]]));
        }

        if (baseLook.length && primaryOuterwear[1] && top) {
          candidates.push(compactGarments([top, bottom, sock, shoe, primaryOuterwear[1]]));
        }
        }
      }
    }
  }

  if (!candidates.length) {
    const fallback = compactGarments([
      dresses[0] || tops[0] || bottoms[0] || shoes[0] || outerwear[0] || accessories[0] || null,
      !dresses[0] ? bottoms[0] || shoes[0] || outerwear[0] || null : shoes[0] || outerwear[0] || null,
    ]);
    if (fallback.length) candidates.push(fallback);
  }

  return candidates;
}

function buildTopChoices(
  pools: Partial<Record<GarmentCategory, WardrobeItem[]>>,
  limit: number,
): WardrobeItem[] {
  return TOP_CATEGORIES.flatMap(category => take(pools[category], limit)).slice(0, limit);
}

function rankItems(items: WardrobeItem[]): WardrobeItem[] {
  return [...items].sort((left, right) => {
    const reviewDelta = Number(left.requiresReview) - Number(right.requiresReview);
    if (reviewDelta !== 0) return reviewDelta;
    const confidenceDelta = (right.confidence || 0) - (left.confidence || 0);
    if (confidenceDelta !== 0) return confidenceDelta;
    return toTimestamp(right.createdAt) - toTimestamp(left.createdAt);
  });
}

function scoreCombination(
  garments: WardrobeItem[],
  temperature: number,
  style: string,
  missingItems: string[],
): number {
  let score = 42;
  const hasDress = garments.some(item => item.category === 'dress');
  const hasTop = garments.some(item => TOP_CATEGORIES.includes(item.category));
  const hasBottom = garments.some(item => item.category === 'pants');
  const hasShoes = garments.some(item => item.category === 'shoes');
  const hasOuterwear = garments.some(item => item.category === 'outerwear');
  const hasAccessory = garments.some(item => item.category === 'accessory');

  if (hasDress) score += 22;
  if (hasTop && hasBottom) score += 24;
  if (hasShoes) score += 16;
  if (hasOuterwear && temperature <= 14) score += 8;
  if (hasAccessory) score += 4;

  if (temperature >= 22 && hasOuterwear) score -= 6;
  if (temperature <= 10 && !hasOuterwear && !hasDress) score -= 5;

  if (style) {
    const normalized = style.toLowerCase();
    const matches = garments.filter(item => item.styleTags.some(tag => tag.toLowerCase().includes(normalized))).length;
    score += 6 + matches * 4;
  } else {
    score += 4;
  }

  const requiresReviewCount = garments.filter(item => item.requiresReview).length;
  score -= requiresReviewCount * 2;
  score -= missingItems.length * 10;

  const uniqueColors = new Set(
    garments
      .map(item => (item.colors[0] || item.color || '').toLowerCase())
      .filter(Boolean),
  );
  if (uniqueColors.size <= 2) score += 10;
  else if (uniqueColors.size === 3) score += 6;
  else score += 2;

  return Number(Math.max(score, 28).toFixed(2));
}

function buildStyleName(garments: WardrobeItem[], userStyle: string, partial: boolean): string {
  const normalized = userStyle
    ? `${userStyle.charAt(0).toUpperCase()}${userStyle.slice(1)}`
    : 'Daily';

  if (partial) return `${normalized} Start`;
  if (garments.some(item => item.category === 'dress')) return `${normalized} Dress`;
  if (garments.some(item => item.category === 'outerwear')) return `${normalized} Layered`;
  return `${normalized} Easy`;
}

function buildReasoning(garments: WardrobeItem[], missingItems: string[], temperature: number | null): string {
  const pieces = garments
    .map(item => getWardrobeItemFullTitle(item))
    .slice(0, 4)
    .join(', ');
  const tempNote = temperature == null
    ? 'It is a clean starting point for the mannequin.'
    : temperature <= 10
      ? 'The mix keeps enough coverage for colder weather.'
      : temperature >= 22
        ? 'The look stays light enough for warmer weather.'
        : 'The balance feels easy for an everyday look.';
  const completionPrompt = buildCompletionPrompt(missingItems);

  return [pieces ? `${pieces} work well together.` : '', tempNote, completionPrompt]
    .filter(Boolean)
    .join(' ');
}

function collectWarnings(outfits: Outfit[]): string[] {
  const warnings = outfits
    .map(outfit => String(outfit.renderMetadata?.completionPrompt || ''))
    .filter(Boolean);
  return Array.from(new Set(warnings)).slice(0, 3);
}

function computeMissingItems(garments: WardrobeItem[]): string[] {
  const hasDress = garments.some(item => item.category === 'dress');
  const hasTop = garments.some(item => TOP_CATEGORIES.includes(item.category));
  const hasBottom = garments.some(item => item.category === 'pants');
  const hasShoes = garments.some(item => item.category === 'shoes');
  const missing: string[] = [];

  if (hasDress) {
    if (!hasShoes) missing.push('shoes');
    return missing;
  }

  if (!hasTop) missing.push('a top');
  if (!hasBottom) missing.push('bottoms');
  if (!hasShoes) missing.push('shoes');
  return missing;
}

function buildCompletionPrompt(missingItems: string[]): string {
  if (!missingItems.length) return '';
  if (missingItems.length === 1) {
    return `Add ${missingItems[0]} to complete the look.`;
  }
  return `Add ${joinHuman(missingItems)} to complete the look.`;
}

function getMissingItemsFromMetadata(outfit: Outfit): string[] {
  const value = outfit.renderMetadata?.missingItems;
  return Array.isArray(value) ? value.map(item => String(item)) : [];
}

function joinHuman(values: string[]): string {
  if (values.length <= 1) return values[0] || '';
  return `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function dedupe(combinations: WardrobeItem[][]): WardrobeItem[][] {
  const seen = new Set<string>();
  const unique: WardrobeItem[][] = [];

  for (const combination of combinations) {
    const sorted = sortByLayer(combination);
    const key = sorted.map(item => item.id).sort().join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sorted);
  }

  return unique;
}

function compactGarments(items: (WardrobeItem | null)[]): WardrobeItem[] {
  return items.filter((item): item is WardrobeItem => Boolean(item));
}

function take(items: WardrobeItem[] | undefined, limit: number): WardrobeItem[] {
  return Array.isArray(items) ? items.slice(0, limit) : [];
}

function toTimestamp(value: string | undefined): number {
  const timestamp = Date.parse(String(value || ''));
  return Number.isFinite(timestamp) ? timestamp : 0;
}
