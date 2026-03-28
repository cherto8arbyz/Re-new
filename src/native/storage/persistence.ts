import AsyncStorage from '@react-native-async-storage/async-storage';

import type { AppState, PersistedAppSnapshot } from '../../types/models';

const SNAPSHOT_KEY = 'renew_native_snapshot_v1';

export async function loadPersistedSnapshot(): Promise<Partial<AppState> | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PersistedAppSnapshot;
  } catch {
    return null;
  }
}

export async function savePersistedSnapshot(state: AppState): Promise<void> {
  const snapshot: PersistedAppSnapshot = {
    selectedDate: state.selectedDate,
    city: state.city,
    location: state.location,
    themeMode: state.themeMode,
    accentPalette: state.accentPalette,
    customAccentColor: state.customAccentColor,
    user: state.user,
    authSession: state.authSession,
    wardrobeItems: state.wardrobeItems,
    wardrobeFilter: state.wardrobeFilter,
    generatedLooks: state.generatedLooks,
    savedLooks: state.savedLooks,
    manualSelectionIds: state.manualSelectionIds,
    chatMessages: state.chatMessages,
  };

  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
}
