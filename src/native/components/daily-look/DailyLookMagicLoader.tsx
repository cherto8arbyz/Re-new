import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { formatDailyLookLoaderLabel } from '../../screens/daily-look.logic';
import type { DailyLookJobStatus } from '../../services/daily-look';
import type { ThemeTokens } from '../../theme';

const FUN_FACTS = [
  'Styling layers to match the weather, not just the wardrobe.',
  'Balancing silhouette, light, and mood before the final reveal.',
  'Checking which garments look strongest together on camera.',
  'Blending your identity references into a cleaner fashion frame.',
] as const;

export function DailyLookMagicLoader({
  status,
  syncedGarmentCount,
  theme,
}: {
  status: DailyLookJobStatus;
  syncedGarmentCount: number;
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const orbMotion = useRef(new Animated.Value(0)).current;
  const factOpacity = useRef(new Animated.Value(1)).current;
  const [factIndex, setFactIndex] = useState(0);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbMotion, {
          toValue: 1,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(orbMotion, {
          toValue: 0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [orbMotion]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      Animated.sequence([
        Animated.timing(factOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(factOpacity, {
          toValue: 1,
          duration: 260,
          useNativeDriver: true,
        }),
      ]).start();
      setFactIndex(current => (current + 1) % FUN_FACTS.length);
    }, 2600);

    return () => {
      clearInterval(intervalId);
    };
  }, [factOpacity]);

  const orbLargeStyle = {
    opacity: orbMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.45, 0.92],
    }),
    transform: [
      {
        scale: orbMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.9, 1.08],
        }),
      },
      {
        translateY: orbMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [10, -10],
        }),
      },
    ],
  } as const;

  const orbSmallStyle = {
    opacity: orbMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.24, 0.7],
    }),
    transform: [
      {
        scale: orbMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [1.04, 0.94],
        }),
      },
      {
        translateY: orbMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [-6, 12],
        }),
      },
    ],
  } as const;

  const pulseLineStyle = {
    opacity: orbMotion.interpolate({
      inputRange: [0, 1],
      outputRange: [0.4, 1],
    }),
    transform: [
      {
        scaleX: orbMotion.interpolate({
          inputRange: [0, 1],
          outputRange: [0.84, 1.04],
        }),
      },
    ],
  } as const;

  const factStyle = {
    opacity: factOpacity,
    transform: [
      {
        translateY: factOpacity.interpolate({
          inputRange: [0, 1],
          outputRange: [6, 0],
        }),
      },
    ],
  } as const;

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.orbLarge, orbLargeStyle]} />
      <Animated.View style={[styles.orbSmall, orbSmallStyle]} />

      <View style={styles.badge}>
        <Text style={styles.badgeText}>{`${Math.max(0, syncedGarmentCount)} synced pieces ready`}</Text>
      </View>
      <Text style={styles.title}>{formatDailyLookLoaderLabel(status)}</Text>
      <Text style={styles.subtitle}>
        Heavy image generation can take up to 30-40 seconds. Keep this screen open while the stylist works.
      </Text>
      <Animated.View style={[styles.signalLine, pulseLineStyle]} />
      <Animated.View style={factStyle}>
        <Text style={styles.fact}>{FUN_FACTS[factIndex]}</Text>
      </Animated.View>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.lg,
      paddingVertical: theme.spacing.xl,
      overflow: 'hidden',
      justifyContent: 'center',
      gap: theme.spacing.md,
    },
    orbLarge: {
      position: 'absolute',
      top: 48,
      right: -42,
      width: 212,
      height: 212,
      borderRadius: 212,
      backgroundColor: theme.colors.accentSoft,
    },
    orbSmall: {
      position: 'absolute',
      left: -34,
      bottom: 42,
      width: 170,
      height: 170,
      borderRadius: 170,
      backgroundColor: theme.colors.panelStrong,
    },
    badge: {
      alignSelf: 'flex-start',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    badgeText: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    title: {
      color: theme.colors.text,
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '900',
      maxWidth: 280,
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 320,
    },
    signalLine: {
      height: 12,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 0 },
    },
    fact: {
      color: theme.colors.text,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
      maxWidth: 300,
    },
  });
}
