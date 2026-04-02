import React, { useEffect } from 'react';
import { Platform, StatusBar } from 'react-native';

import { AppProvider, useAppContext } from './src/native/context/AppContext';
import { AppNavigator } from './src/native/navigation/AppNavigator';

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  );
}

function AppShell() {
  const { theme } = useAppContext();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');

    html.style.backgroundColor = theme.colors.background;
    html.style.width = '100%';

    body.style.backgroundColor = theme.colors.background;
    body.style.width = '100%';
    body.style.margin = '0';
    body.style.overflowX = 'hidden';

    if (root) {
      root.style.backgroundColor = theme.colors.background;
      root.style.width = '100%';
      root.style.minWidth = '0';
      root.style.overflowX = 'hidden';
    }
  }, [theme.colors.background]);

  return (
    <>
      <StatusBar
        barStyle={theme.mode === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <AppNavigator />
    </>
  );
}
