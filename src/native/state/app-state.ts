import { createDevelopmentSession } from '../../shared/onboarding';
import { DEFAULT_WARDROBE_FILTER } from '../../shared/wardrobe';
import type { AppState } from '../../types/models';

export function createInitialAppState(): AppState {
  return {
    selectedDate: new Date().toISOString().slice(0, 10),
    city: '',
    location: {
      latitude: null,
      longitude: null,
    },
    weather: null,
    themeMode: 'dark',
    accentPalette: 'blush',
    customAccentColor: null,
    activeTab: 'home',
    activeOutfitIndex: 0,
    authSession: createDevelopmentSession(),
    user: null,
    wardrobeItems: [],
    wardrobeFilter: DEFAULT_WARDROBE_FILTER,
    generatedLooks: [],
    savedLooks: [],
    manualSelectionIds: [],
    chatMessages: [],
    chatLoading: false,
    chatError: null,
    aiLoading: false,
    aiError: null,
  };
}
