import React, { createContext, useContext, useEffect, useMemo, useReducer, useState } from 'react';

import { appReducer } from '../state/app-reducer';
import { createInitialAppState } from '../state/app-state';
import { loadPersistedSnapshot, savePersistedSnapshot } from '../storage/persistence';
import type { AppState } from '../../types/models';
import type { AppAction } from '../state/app-reducer';
import { resolveTheme, type ThemeTokens } from '../theme';

interface AppContextValue {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  hydrated: boolean;
  theme: ThemeTokens;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, createInitialAppState);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const snapshot = await loadPersistedSnapshot();
      if (!active) return;
      if (snapshot) {
        dispatch({ type: 'HYDRATE', payload: snapshot });
      }
      setHydrated(true);
    })();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void savePersistedSnapshot(state);
  }, [hydrated, state]);

  const value = useMemo(() => ({
    state,
    dispatch,
    hydrated,
    theme: resolveTheme(state.themeMode, state.accentPalette, state.customAccentColor),
  }), [hydrated, state]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error('useAppContext must be used inside AppProvider.');
  }
  return value;
}
