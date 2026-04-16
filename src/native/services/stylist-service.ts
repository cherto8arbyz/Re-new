import { readConfig } from '../../api/backend-config.js';
import { generateGeminiContent } from '../../api/gemini-client.js';
import { buildStylistReply } from '../../shared/chat';
import { buildLookMissingSlotLabels } from '../../shared/look-preview';
import { createOutfit, generateOutfitRecommendations } from '../../shared/outfits';
import { getWardrobeItemColor, getWardrobeItemFullTitle, normalizeWardrobeSelection } from '../../shared/wardrobe';
import { CalendarService } from '../../services/calendar-service.js';
import {
  buildLookVariationRequest,
  describeCalendarEvents,
  describeTrendSignals,
  pickDistinctLeadOutfit,
} from '../../services/stylist-variation.js';
import { TrendService } from '../../services/trend-service.js';
import type { AppState, Outfit, WardrobeItem } from '../../types/models';

const GEMINI_MODEL = 'gemini-2.5-flash';
const calendarService = new CalendarService();
const trendService = new TrendService();

const STYLIST_CORE_PROMPT = [
  'You are an AI stylist inside a digital wardrobe app.',
  'You are warm, friendly, supportive, slightly playful, emotionally intelligent, and never robotic.',
  'You are not customer support and not a generic assistant.',
  'Always use the actual wardrobe items provided in context.',
  'Never mention internal IDs or file names in the reply.',
  'Use the provided descriptive wardrobe titles exactly as the human-facing item names.',
  'Keep responses human, natural, practical, and concise.',
  'Do not hallucinate wardrobe items that do not exist.',
  'Explain outfit logic clearly when useful, but do not overtalk.',
  'Respond in the same language as the user message.',
].join('\n');

interface GenerateLookResult {
  outfits: Outfit[];
  error: string | null;
  usedAI: boolean;
}

export async function generateLooksWithStylist(state: AppState): Promise<GenerateLookResult> {
  const fallback = generateOutfitRecommendations({
    wardrobe: state.wardrobeItems,
    weather: state.weather,
    userStyle: state.user?.style || '',
    selectedDate: state.selectedDate,
  });

  const proxyUrl = readConfig('AI_PROXY_URL') || readConfig('IMAGE_PIPELINE_URL');
  const apiKey = readConfig('GEMINI_API_KEY');
  if (!proxyUrl && !apiKey) {
    return {
      outfits: fallback.outfits,
      error: fallback.success ? null : resolveLookError(fallback),
      usedAI: false,
    };
  }

  try {
    const variation = buildLookVariationRequest(
      state.generatedLooks,
      state.selectedDate,
      state.user?.style || '',
    );
    const [trendSnapshot, calendarEvents] = await Promise.all([
      loadTrendSnapshot(state),
      loadCalendarEvents(state),
    ]);
    const prompt = [
      STYLIST_CORE_PROMPT,
      'Build one wearable outfit from the provided wardrobe.',
      'This request came from the Generate button, so every tap must create a fresh outfit direction.',
      `Target direction for this tap: ${variation.direction}.`,
      variation.previousStyleNames.length
        ? `Do not repeat recent style names: ${variation.previousStyleNames.join(' | ')}.`
        : 'No recent style history is available.',
      variation.previousSignatures.length
        ? `Avoid these exact previous outfit signatures: ${variation.previousSignatures.join(', ')}.`
        : 'There are no previous outfit signatures to avoid.',
      'Return STRICT JSON only and nothing else.',
      'Schema:',
      '{"selectedIds":["garment-id"],"styleName":"string","reasoning":"string","missingItems":["string"]}',
      'Prefer a complete outfit with top, bottom, and shoes.',
      'If the wardrobe is incomplete, still build the best realistic option and mention missingItems.',
      'Use trend signals and calendar context when styling the outfit.',
      '',
      `User style preference: ${state.user?.style || 'unknown'}`,
      `Date: ${state.selectedDate}`,
      `City: ${state.city || 'unknown'}`,
      `Weather: ${formatWeather(state)}`,
      `Trend signals: ${describeTrendSignals(trendSnapshot)}`,
      `Calendar context: ${describeCalendarEvents(calendarEvents)}`,
      '',
      'Wardrobe items:',
      buildWardrobeCatalogue(state.wardrobeItems),
    ].join('\n');

    const payload = await generateJsonWithGemini<{
      selectedIds?: string[];
      styleName?: string;
      reasoning?: string;
      missingItems?: string[];
    }>(prompt, 0.45);

    const aiOutfit = createAiOutfitFromPayload(payload, state.wardrobeItems, fallback.outfits[0] || null);
    if (!aiOutfit) {
      return {
        outfits: fallback.outfits,
        error: fallback.success ? null : resolveLookError(fallback),
        usedAI: false,
      };
    }

    const leadOutfit = pickDistinctLeadOutfit([aiOutfit, ...fallback.outfits], state.generatedLooks) || aiOutfit;
    const leadSignature = createSignature(leadOutfit.garments);
    const mergedOutfits = [
      leadOutfit,
      ...[aiOutfit, ...fallback.outfits].filter(outfit => createSignature(outfit.garments) !== leadSignature),
    ]
      .filter((outfit, index, list) => list.findIndex(candidate => createSignature(candidate.garments) === createSignature(outfit.garments)) === index)
      .slice(0, 4);

    return {
      outfits: mergedOutfits,
      error: null,
      usedAI: true,
    };
  } catch {
    return {
      outfits: fallback.outfits,
      error: fallback.success ? null : resolveLookError(fallback),
      usedAI: false,
    };
  }
}

export async function chatWithStylist(state: AppState, message: string): Promise<string> {
  const proxyUrl = readConfig('AI_PROXY_URL') || readConfig('IMAGE_PIPELINE_URL');
  const apiKey = readConfig('GEMINI_API_KEY');
  if (!proxyUrl && !apiKey) {
    return buildStylistReply(message, state);
  }

  try {
    const prompt = [
      STYLIST_CORE_PROMPT,
      'Write a direct stylist reply to the latest user message.',
      'Keep it to roughly 3-6 sentences.',
      'When giving concrete outfit advice, only use wardrobe items from the context.',
      'Use descriptive names like "green shirt" or "black jeans", never raw upload filenames.',
      'If wardrobe is limited, be honest and move the conversation forward naturally.',
      '',
      `User style preference: ${state.user?.style || 'unknown'}`,
      `City: ${state.city || 'unknown'}`,
      `Weather: ${formatWeather(state)}`,
      '',
      'Wardrobe summary:',
      buildWardrobeCatalogue(state.wardrobeItems),
      '',
      state.generatedLooks.length
        ? `Current generated look: ${state.generatedLooks[state.activeOutfitIndex]?.garments?.map(item => getWardrobeItemFullTitle(item))?.join(', ') || 'none'}`
        : 'Current generated look: none',
      '',
      'Recent conversation:',
      state.chatMessages
        .slice(-10)
        .map(entry => `${entry.role === 'user' ? 'User' : 'Stylist'}: ${entry.text}`)
        .join('\n') || 'No previous messages.',
      '',
      `Latest user message: ${message}`,
    ].join('\n');

    const text = await generateTextWithGemini(prompt, 0.7);
    return text || buildStylistReply(message, state);
  } catch {
    return buildStylistReply(message, state);
  }
}

async function generateTextWithGemini(prompt: string, temperature: number): Promise<string> {
  const data = await generateGeminiContent({
    model: GEMINI_MODEL,
    body: {
      contents: [{
        role: 'user',
        parts: [{ text: prompt }],
      }],
      generationConfig: {
        temperature,
      },
    },
  });
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return '';

  return parts
    .map(part => typeof part?.text === 'string' ? part.text : '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function generateJsonWithGemini<T>(prompt: string, temperature: number): Promise<T> {
  const text = await generateTextWithGemini(prompt, temperature);
  const match = text.replace(/```json|```/gi, '').match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('Gemini did not return JSON.');
  }
  return JSON.parse(match[0]) as T;
}

function createAiOutfitFromPayload(
  payload: {
    selectedIds?: string[];
    styleName?: string;
    reasoning?: string;
    missingItems?: string[];
  },
  wardrobeItems: WardrobeItem[],
  fallbackOutfit: Outfit | null,
): Outfit | null {
  const selectedIds = Array.isArray(payload.selectedIds) ? payload.selectedIds.map(String) : [];
  const selected = selectedIds
    .map(id => wardrobeItems.find(item => item.id === id))
    .filter((item): item is WardrobeItem => Boolean(item));
  const garments = mergeWithFallback(selected, fallbackOutfit?.garments || []);

  if (!garments.length) return fallbackOutfit;

  return createOutfit({
    name: payload.styleName || 'AI Stylist Look',
    styleName: payload.styleName || 'AI Stylist Look',
    garments,
    confidenceScore: 0.92,
    renderMetadata: {
      generationSource: 'ai',
      reasoning: String(payload.reasoning || 'Curated by the stylist AI.'),
      missingItems: Array.isArray(payload.missingItems) && payload.missingItems.length
        ? payload.missingItems
        : inferMissingItems(garments),
      completionPrompt: buildCompletionPrompt(
        Array.isArray(payload.missingItems) && payload.missingItems.length
          ? payload.missingItems
          : inferMissingItems(garments),
      ),
      recommendation: {
        source: 'gemini-stylist',
      },
    },
  });
}

function buildWardrobeCatalogue(items: WardrobeItem[]): string {
  if (!items.length) {
    return '- Wardrobe is empty.';
  }

  return items
    .slice(0, 40)
    .map(item => {
      const color = getWardrobeItemColor(item) || 'no color';
      return `- ${item.id} | ${getWardrobeItemFullTitle(item)} | ${item.category} | ${color}`;
    })
    .join('\n');
}

async function loadTrendSnapshot(state: AppState) {
  try {
    return await trendService.getTrendSignals(
      state.selectedDate,
      state.city || 'global',
      state.authSession?.accessToken,
    );
  } catch {
    return {
      date: state.selectedDate,
      region: state.city || 'global',
      signals: [],
      source: 'fallback' as const,
    };
  }
}

async function loadCalendarEvents(state: AppState) {
  try {
    return await calendarService.getUserCalendarEvents(
      state.selectedDate,
      state.authSession?.accessToken,
    );
  } catch {
    return [];
  }
}

function createSignature(garments: WardrobeItem[]): string {
  return garments.map(item => item.id).sort().join('|');
}

function formatWeather(state: AppState): string {
  if (!state.weather) return 'unknown';
  return `${state.weather.temperature}C and ${state.weather.condition}`;
}

function resolveLookError(result: ReturnType<typeof generateOutfitRecommendations>): string {
  return result.warnings?.[0] || 'We could not build a look yet.';
}

function mergeWithFallback(selected: WardrobeItem[], fallback: WardrobeItem[]): WardrobeItem[] {
  const combined = [...selected];
  for (const item of fallback) {
    if (!combined.some(entry => entry.id === item.id)) {
      combined.push(item);
    }
  }

  const itemsById = new Map(combined.map(item => [item.id, item]));
  const normalizedIds = normalizeWardrobeSelection(combined, combined.map(item => item.id));
  return normalizedIds
    .map(id => itemsById.get(id))
    .filter((item): item is WardrobeItem => Boolean(item));
}

function inferMissingItems(garments: WardrobeItem[]): string[] {
  return buildLookMissingSlotLabels(garments);
}

function buildCompletionPrompt(missingItems: string[]): string {
  if (!missingItems.length) return '';
  if (missingItems.length === 1) return `Add ${missingItems[0]} to complete the look.`;
  return `Add ${missingItems.slice(0, -1).join(', ')} and ${missingItems[missingItems.length - 1]} to complete the look.`;
}
