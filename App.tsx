import React from 'react';
import { StatusBar } from 'react-native';

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
