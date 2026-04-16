import { createOutfit } from '../../shared/outfits';
import {
  getWardrobeItemColor,
  getWardrobeItemFullTitle,
  selectBestImageUri,
} from '../../shared/wardrobe';
import type { Outfit, WardrobeItem, WeatherModel } from '../../types/models';
import type {
  DailyLookAvailableGarmentInput,
  DailyLookJobStatus,
  DailyLookWeatherContextInput,
} from '../services/daily-look';
import type { WardrobeStorageMode } from '../components/wardrobe/types';

export function buildDailyLookAvailableGarments(items: WardrobeItem[]): DailyLookAvailableGarmentInput[] {
  return items.reduce<DailyLookAvailableGarmentInput[]>((accumulator, item) => {
    const imageReference = selectDailyLookImageReference(item);
    if (!imageReference) {
      return accumulator;
    }

    accumulator.push({
      garment_id: item.id,
      image_url: imageReference,
      category: item.category,
      color: item.colors.length ? item.colors : item.color,
      style_tags: item.styleTags,
      name: getWardrobeItemFullTitle(item),
    });
    return accumulator;
  }, []);
}

export function buildDailyLookWeatherContext(
  weather: WeatherModel | null,
  city: string,
): DailyLookWeatherContextInput {
  const condition = String(weather?.condition || 'unknown').trim().toLowerCase();
  return {
    temperature_celsius: Number.isFinite(weather?.temperature) ? Number(weather?.temperature) : 18,
    condition,
    summary: condition,
    precipitation: condition === 'rain' ? 'rain' : condition === 'snow' ? 'snow' : '',
    is_raining: condition === 'rain',
    is_snowing: condition === 'snow',
    location: String(city || '').trim() || undefined,
    season: inferWeatherSeason(weather?.temperature),
  };
}

export function selectDailyLookUsedItems(items: WardrobeItem[], selectedGarmentIds: string[]): WardrobeItem[] {
  return selectedGarmentIds
    .map(id => items.find(item => item.id === id))
    .filter((item): item is WardrobeItem => Boolean(item));
}

export function buildSavedDailyLookOutfit(input: {
  selectedItems: WardrobeItem[];
  finalImageUrl: string;
  jobId: string | null;
  prompt: string | null;
  status: DailyLookJobStatus;
}): Outfit {
  const label = input.selectedItems.length
    ? `Daily Look: ${input.selectedItems.map(item => item.shortTitle || item.title || item.name).slice(0, 2).join(' + ')}`
    : 'Daily Look';

  return createOutfit({
    name: label,
    styleName: 'Daily Look',
    garments: input.selectedItems,
    photoUrl: input.finalImageUrl,
    confidenceScore: input.status === 'completed' ? 0.98 : 0.9,
    renderMetadata: {
      generationSource: 'ai',
      dailyLook: {
        jobId: input.jobId,
        prompt: input.prompt,
        selectedGarmentIds: input.selectedItems.map(item => item.id),
      },
    },
  });
}

export function resolveDailyLookStorageMode(item: WardrobeItem): WardrobeStorageMode {
  switch (item.category) {
    case 'shoes':
      return 'shoe-shelf';
    case 'pants':
    case 'socks':
      return 'folded';
    case 'accessory':
      return item.bodySlot === 'head' ? 'headwear-rail' : 'accessory-hooks';
    default:
      return 'hanger';
  }
}

export function formatDailyLookLoaderLabel(status: DailyLookJobStatus): string {
  switch (status) {
    case 'starting':
    case 'processing':
      return 'Talking to your AI stylist';
    case 'generating_base':
      return 'Building the base pose';
    case 'vton_iterating':
      return 'Dressing the look layer by layer';
    case 'face_swap':
      return 'Blending your identity into the final frame';
    case 'completed':
      return 'Look is ready';
    case 'failed':
      return 'Generation needs another try';
    default:
      return 'Preparing your daily look';
  }
}

export function selectDailyLookImageReference(item: WardrobeItem): string {
  const candidates = [
    item.processedImageUrl,
    item.thumbnailUrl,
    item.imageUrl,
    item.originalUrl,
    item.cutoutUrl,
    selectBestImageUri(item),
  ];

  return candidates.find(candidate => String(candidate || '').trim().length > 0) || '';
}

export function getDailyLookGarmentCaption(item: WardrobeItem): string {
  const title = getWardrobeItemFullTitle(item);
  const color = getWardrobeItemColor(item);
  const normalizedTitle = title.toLowerCase();
  if (!color || color.split(' ').every(token => normalizedTitle.includes(token))) {
    return title;
  }
  return `${color} ${title}`.trim();
}

function inferWeatherSeason(temperature?: number): string {
  const safeTemperature = Number.isFinite(temperature) ? Number(temperature) : 18;
  if (safeTemperature <= 4) return 'winter';
  if (safeTemperature <= 14) return 'autumn';
  if (safeTemperature >= 24) return 'summer';
  return 'spring';
}
