import type { AppState, ChatMessage, Outfit, WardrobeItem } from '../types/models';
import { buildDefaultTryOnOutfit } from './outfits';
import { createId, getWardrobeItemFullTitle } from './wardrobe';

export function createChatMessage(role: ChatMessage['role'], text: string): ChatMessage {
  return {
    id: createId('chat'),
    role,
    text,
    timestamp: Date.now(),
  };
}

export function buildStylistReply(message: string, state: AppState): string {
  const text = message.toLowerCase();

  if (/(what should i wear|what to wear|look|outfit|wear today|wear tomorrow)/i.test(text)) {
    return buildLookReply(state);
  }

  if (/(wardrobe|closet|things|pieces|added)/i.test(text)) {
    return buildWardrobeReply(state);
  }

  if (/(style|vibe|mood|elevated|casual|formal)/i.test(text)) {
    return buildStyleReply(state);
  }

  const outfit = getReferenceOutfit(state);
  if (!outfit) {
    return 'I can build a look as soon as you add a few pieces. Start with a top, bottoms, or shoes and I will make it concrete.';
  }

  return [
    `I would start from ${joinHuman(outfit.garments.map(item => `your ${getWardrobeItemFullTitle(item)}`))}.`,
    getCompletionPrompt(outfit) || 'That gives you a clean base to work with.',
    'If you want, I can make it sharper, softer, or more dressed-up.',
  ].join(' ');
}

function buildLookReply(state: AppState): string {
  const outfit = getReferenceOutfit(state);
  if (!outfit) {
    return 'Your wardrobe is still too light for a full outfit. Add a top, bottoms, or shoes and I will turn it into something wearable.';
  }

  const pieces = outfit.garments.map(item => `your ${getWardrobeItemFullTitle(item)}`);
  const reasoning = String(outfit.renderMetadata?.reasoning || '').trim();
  const completionPrompt = getCompletionPrompt(outfit);

  return [
    `I would build today around ${joinHuman(pieces)}.`,
    reasoning || 'The shape feels balanced and easy to wear.',
    completionPrompt || 'It already reads like a complete look.',
    'If you want, I can switch the vibe to cleaner, more relaxed, or a little more elevated.',
  ].filter(Boolean).join(' ');
}

function buildWardrobeReply(state: AppState): string {
  if (!state.wardrobeItems.length) {
    return 'Your wardrobe is still empty. Add a few photos first and I will tell you what is strong and what is missing.';
  }

  const spotlight = state.wardrobeItems
    .slice(0, 3)
    .map(item => `your ${getWardrobeItemFullTitle(item)}`);
  const missing = getMissingCoreCategories(state.wardrobeItems);
  const missingLine = missing.length
    ? `The easiest next add would be ${joinHuman(missing)} so outfits come together faster.`
    : 'You already have the core building blocks for real outfits.';

  return [
    `Right now the wardrobe feels most useful around ${joinHuman(spotlight)}.`,
    missingLine,
    'If you want, I can also help you clean it up into a tighter capsule.',
  ].join(' ');
}

function buildStyleReply(state: AppState): string {
  const outfit = getReferenceOutfit(state);
  const style = state.user?.style || 'casual';

  if (!outfit) {
    return `Your direction still reads ${style}, but I need a few more real pieces before I can shape it properly.`;
  }

  const anchorPieces = outfit.garments.slice(0, 3).map(item => getWardrobeItemFullTitle(item));
  return [
    `Your wardrobe leans ${style}, and I would keep that grounded in ${joinHuman(anchorPieces)}.`,
    'That keeps the look intentional instead of random.',
    'When you want more personality, we can push color, layering, or accessories on top of that base.',
  ].join(' ');
}

function getReferenceOutfit(state: AppState): Outfit | null {
  return state.generatedLooks[state.activeOutfitIndex]
    || buildDefaultTryOnOutfit({
      wardrobe: state.wardrobeItems,
      weather: state.weather,
      userStyle: state.user?.style || '',
      selectedDate: state.selectedDate,
    });
}

function getCompletionPrompt(outfit: Outfit): string {
  return String(outfit.renderMetadata?.completionPrompt || '').trim();
}

function getMissingCoreCategories(items: WardrobeItem[]): string[] {
  const hasDress = items.some(item => item.category === 'dress');
  const hasTop = items.some(item => item.category === 'shirt' || item.category === 'sweater' || item.category === 'base');
  const hasBottom = items.some(item => item.category === 'pants');
  const hasShoes = items.some(item => item.category === 'shoes');
  const missing: string[] = [];

  if (!hasDress && !hasTop) missing.push('a top');
  if (!hasDress && !hasBottom) missing.push('bottoms');
  if (!hasShoes) missing.push('shoes');
  return missing;
}

function joinHuman(values: (string | null | undefined)[]): string {
  const items = values.filter((value): value is string => Boolean(value));
  if (items.length <= 1) return items[0] || '';
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
