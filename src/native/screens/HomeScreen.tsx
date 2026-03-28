import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';
import MaterialCommunityIcons from 'expo/node_modules/@expo/vector-icons/MaterialCommunityIcons';

import { buildDefaultTryOnOutfit } from '../../shared/outfits';
import { type AppTab } from '../../types/models';
import { DayWeatherCarousel } from '../components/DayWeatherCarousel';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { type ThemeTokens } from '../theme';
import { ChatScreen } from './ChatScreen';
import { LooksScreen } from './LooksScreen';
import { ProfileScreen } from './ProfileScreen';
import { WardrobeScreen } from './WardrobeScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

const TAB_ITEMS: { id: AppTab; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'looks', label: 'Looks' },
  { id: 'chat', label: 'Chat' },
  { id: 'profile', label: 'Profile' },
];

export function HomeScreen(_: Props) {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.backgroundOrbOne} />
      <View pointerEvents="none" style={styles.backgroundOrbTwo} />
      <View pointerEvents="none" style={styles.gridGlow} />

      <View style={styles.contentShell}>
        {state.activeTab === 'home' && <HomeDashboard />}
        {state.activeTab === 'wardrobe' && <WardrobeScreen />}
        {state.activeTab === 'looks' && <LooksScreen />}
        {state.activeTab === 'chat' && <ChatScreen />}
        {state.activeTab === 'profile' && <ProfileScreen />}
      </View>

      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
          {TAB_ITEMS.map(tab => (
            <Pressable
              key={tab.id}
              onPress={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.id })}
              style={[styles.tabButton, state.activeTab === tab.id && styles.tabButtonActive]}
            >
              <TabIcon tab={tab.id} active={state.activeTab === tab.id} theme={theme} />
              <Text style={[styles.tabText, state.activeTab === tab.id && styles.tabTextActive]}>
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

function HomeDashboard() {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const todayOutfit = useMemo(() => (
    state.generatedLooks[state.activeOutfitIndex] || buildDefaultTryOnOutfit({
      wardrobe: state.wardrobeItems,
      weather: state.weather,
      userStyle: state.user?.style || '',
      selectedDate: state.selectedDate,
    })
  ), [state.activeOutfitIndex, state.generatedLooks, state.selectedDate, state.user?.style, state.wardrobeItems, state.weather]);

  const completionPrompt = String(todayOutfit?.renderMetadata?.completionPrompt || '').trim();
  const helperCopy = todayOutfit
    ? (completionPrompt || 'Your wardrobe already has enough to render a clean look on the mannequin.')
    : 'Add a few key pieces and the mannequin will start shaping the look for you.';

  return (
    <ScrollView contentContainerStyle={styles.dashboardContent} showsVerticalScrollIndicator={false}>
      <View style={styles.weatherCard}>
        <DayWeatherCarousel
          selectedDate={state.selectedDate}
          onChangeDate={date => dispatch({ type: 'SET_SELECTED_DATE', payload: date })}
          theme={theme}
          city={state.city}
          weather={state.weather}
        />
      </View>

      <View style={styles.heroCard}>
        <View style={styles.heroHeader}>
          <View style={styles.heroCopy}>
            <Text style={styles.sectionEyebrow}>Today&apos;s Look</Text>
            <Text style={styles.heroTitle}>
              {todayOutfit?.styleName || 'Wardrobe preview'}
            </Text>
            <Text style={styles.heroText}>{helperCopy}</Text>
          </View>

          <Pressable
            onPress={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'looks' })}
            style={styles.heroLink}
          >
            <Text style={styles.heroLinkText}>Open studio</Text>
            <Ionicons name="arrow-forward" size={16} color={theme.colors.accent} />
          </Pressable>
        </View>

        <View style={styles.heroCanvasWrap}>
          <ComingSoonStudioPanel />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{state.wardrobeItems.length}</Text>
          <Text style={styles.statLabel}>Wardrobe items</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{state.savedLooks.length}</Text>
          <Text style={styles.statLabel}>Saved looks</Text>
        </View>
      </View>
    </ScrollView>
  );
}

function ComingSoonStudioPanel() {
  const { theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1500,
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  const orbStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.2, 0.38],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.06],
        }),
      },
      {
        translateY: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [6, -6],
        }),
      },
    ],
  } as const;

  const signalStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45, 0.9],
    }),
    transform: [
      {
        scaleX: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.88, 1.04],
        }),
      },
    ],
  } as const;

  return (
    <View style={styles.comingSoonPanel}>
      <Animated.View style={[styles.comingSoonGlowLarge, orbStyle]} />
      <Animated.View style={[styles.comingSoonGlowSmall, orbStyle]} />
      <View style={styles.comingSoonBadge}>
        <Ionicons name="sparkles-outline" size={14} color={theme.colors.accent} />
        <Text style={styles.comingSoonBadgeText}>Coming soon</Text>
      </View>
      <Text style={styles.comingSoonTitle}>Studio refresh</Text>
      <Text style={styles.comingSoonText}>
        The large daily outfit preview is being rebuilt into a sharper editor-style scene.
      </Text>
      <Animated.View style={[styles.comingSoonSignal, signalStyle]} />
      <View style={styles.comingSoonIconRow}>
        <View style={styles.comingSoonIconChip}>
          <MaterialCommunityIcons name="hanger" size={20} color={theme.colors.text} />
        </View>
        <View style={styles.comingSoonIconChip}>
          <Ionicons name="sparkles" size={18} color={theme.colors.accent} />
        </View>
        <View style={styles.comingSoonIconChip}>
          <Ionicons name="layers-outline" size={18} color={theme.colors.textSecondary} />
        </View>
      </View>
    </View>
  );
}

function TabIcon({ tab, active, theme }: { tab: AppTab; active: boolean; theme: ThemeTokens }) {
  const color = active ? theme.colors.accentContrast : theme.colors.muted;

  switch (tab) {
    case 'home':
      return <Ionicons name={active ? 'home' : 'home-outline'} size={20} color={color} />;
    case 'wardrobe':
      return <MaterialCommunityIcons name="hanger" size={20} color={color} />;
    case 'looks':
      return <Ionicons name={active ? 'sparkles' : 'sparkles-outline'} size={20} color={color} />;
    case 'chat':
      return <Ionicons name={active ? 'chatbubble' : 'chatbubble-outline'} size={20} color={color} />;
    case 'profile':
      return <Ionicons name={active ? 'person' : 'person-outline'} size={20} color={color} />;
    default:
      return <Ionicons name="ellipse-outline" size={20} color={color} />;
  }
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    backgroundOrbOne: {
      position: 'absolute',
      top: 12,
      right: -54,
      width: 214,
      height: 214,
      borderRadius: 214,
      backgroundColor: theme.colors.accentMuted,
      opacity: 0.18,
    },
    backgroundOrbTwo: {
      position: 'absolute',
      bottom: 168,
      left: -72,
      width: 188,
      height: 188,
      borderRadius: 188,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.14,
    },
    gridGlow: {
      position: 'absolute',
      top: 160,
      left: 20,
      right: 20,
      height: 320,
      borderRadius: 40,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.04)',
      opacity: 0.24,
    },
    contentShell: {
      flex: 1,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    dashboardContent: {
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    weatherCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.xs,
    },
    heroCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      shadowColor: theme.colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 16 },
      elevation: 8,
    },
    heroHeader: {
      gap: theme.spacing.sm,
    },
    heroCopy: {
      gap: 8,
    },
    sectionEyebrow: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    heroTitle: {
      color: theme.colors.text,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
    },
    heroText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
    },
    heroLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      borderRadius: theme.radius.pill,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
    },
    heroLinkText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '700',
    },
    heroCanvasWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 4,
    },
    comingSoonPanel: {
      width: '100%',
      minHeight: 292,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: 'rgba(23, 28, 40, 0.9)',
      overflow: 'hidden',
      paddingHorizontal: 22,
      paddingVertical: 24,
      justifyContent: 'space-between',
      gap: 14,
    },
    comingSoonGlowLarge: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 999,
      right: -28,
      top: -18,
      backgroundColor: theme.colors.accentSoft,
    },
    comingSoonGlowSmall: {
      position: 'absolute',
      width: 144,
      height: 144,
      borderRadius: 999,
      left: -22,
      bottom: -40,
      backgroundColor: theme.colors.panelStrong,
    },
    comingSoonBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: 'rgba(12, 14, 21, 0.76)',
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
    },
    comingSoonBadgeText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    comingSoonTitle: {
      color: theme.colors.text,
      fontSize: 32,
      lineHeight: 36,
      fontWeight: '900',
    },
    comingSoonText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 280,
    },
    comingSoonSignal: {
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 0 },
    },
    comingSoonIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    comingSoonIconChip: {
      width: 50,
      height: 50,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(13, 15, 22, 0.84)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.06)',
    },
    statsRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    statCard: {
      flex: 1,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 18,
      alignItems: 'center',
      gap: 4,
    },
    statValue: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    tabBarWrap: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      paddingTop: theme.spacing.sm,
    },
    tabBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.xl,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    tabButton: {
      flex: 1,
      minHeight: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    tabButtonActive: {
      backgroundColor: theme.colors.accent,
    },
    tabText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
    },
    tabTextActive: {
      color: theme.colors.accentContrast,
    },
  });
}
