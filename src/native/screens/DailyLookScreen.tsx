import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  ToastAndroid,
  View,
} from 'react-native';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { resolveAuthAccessToken } from '../../shared/onboarding';
import { DailyLookGarmentCarousel } from '../components/daily-look/DailyLookGarmentCarousel';
import { DailyLookMagicLoader } from '../components/daily-look/DailyLookMagicLoader';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import type { ThemeTokens } from '../theme';
import {
  buildDailyLookAvailableGarments,
  buildDailyLookWeatherContext,
  buildSavedDailyLookOutfit,
  selectDailyLookUsedItems,
} from './daily-look.logic';
import { useDailyLookPolling } from './useDailyLookPolling';

type Props = NativeStackScreenProps<RootStackParamList, 'DailyLook'>;

interface FailureUiContent {
  title: string;
  message: string;
  retryLabel: string;
}

function showSavedLookToast(): void {
  const message = '\u041e\u0431\u0440\u0430\u0437 \u0441\u043e\u0445\u0440\u0430\u043d\u0435\u043d \u0432 \u0433\u0430\u0440\u0434\u0435\u0440\u043e\u0431';
  if (Platform.OS === 'android') {
    ToastAndroid.show(message, ToastAndroid.SHORT);
  } else {
    console.info(message);
  }
}

export function DailyLookScreen({ navigation }: Props) {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accessToken = resolveAuthAccessToken(state.authSession, state.user?.id);
  const availableGarments = useMemo(
    () => buildDailyLookAvailableGarments(state.wardrobeItems),
    [state.wardrobeItems],
  );
  const weatherContext = useMemo(
    () => buildDailyLookWeatherContext(state.weather, state.city),
    [state.city, state.weather],
  );
  const {
    jobId,
    status,
    selectedGarmentIds,
    finalImageUrl,
    prompt,
    errorMessage,
    isLoading,
    generateAnotherVariant,
  } = useDailyLookPolling({
    enabled: true,
    accessToken,
    availableGarments,
    weatherContext,
  });

  const usedItems = useMemo(
    () => selectDailyLookUsedItems(state.wardrobeItems, selectedGarmentIds),
    [selectedGarmentIds, state.wardrobeItems],
  );
  const resultReveal = useRef(new Animated.Value(finalImageUrl ? 1 : 0)).current;
  const failureUi = useMemo(
    () => resolveFailureUi(errorMessage),
    [errorMessage],
  );

  useEffect(() => {
    Animated.timing(resultReveal, {
      toValue: finalImageUrl ? 1 : 0,
      duration: 420,
      useNativeDriver: true,
    }).start();
  }, [finalImageUrl, resultReveal]);

  const resultStyle = {
    opacity: resultReveal,
    transform: [
      {
        translateY: resultReveal.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  } as const;

  const handleSaveLook = useCallback(() => {
    if (!finalImageUrl) return;

    const outfit = buildSavedDailyLookOutfit({
      selectedItems: usedItems,
      finalImageUrl,
      jobId,
      prompt,
      status,
    });

    dispatch({
      type: 'SAVE_OUTFIT',
      payload: {
        outfit,
        source: 'ai',
      },
    });
    showSavedLookToast();
  }, [dispatch, finalImageUrl, jobId, prompt, status, usedItems]);

  return (
    <SafeAreaView style={styles.safe}>
      <View pointerEvents="none" style={styles.backgroundOrbOne} />
      <View pointerEvents="none" style={styles.backgroundOrbTwo} />

      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={18} color={theme.colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>Daily look</Text>
          <Text style={styles.headerTitle}>AI-styled photo</Text>
        </View>
        <View style={styles.headerSpacer} />
      </View>

      {status === 'failed' ? (
        <View style={styles.failureCard}>
          <Text style={styles.failureTitle}>{failureUi.title}</Text>
          <Text style={styles.failureText}>{failureUi.message}</Text>
          <View style={styles.actionRow}>
            <Pressable onPress={() => navigation.goBack()} style={[styles.actionButton, styles.secondaryButton]}>
              <Text style={styles.secondaryButtonText}>Back</Text>
            </Pressable>
            <Pressable onPress={() => void generateAnotherVariant()} style={[styles.actionButton, styles.primaryButton]}>
              <Text style={styles.primaryButtonText}>{failureUi.retryLabel}</Text>
            </Pressable>
          </View>
        </View>
      ) : isLoading || !finalImageUrl ? (
        <DailyLookMagicLoader
          status={status}
          syncedGarmentCount={availableGarments.length}
          theme={theme}
        />
      ) : (
        <Animated.View style={[styles.resultShell, resultStyle]}>
          <ScrollView contentContainerStyle={styles.resultContent} showsVerticalScrollIndicator={false}>
            <View style={styles.photoFrame}>
              <Image source={{ uri: finalImageUrl }} style={styles.photo} resizeMode="cover" />
              <View style={styles.photoOverlay} />
            </View>

            <View style={styles.overlayCard}>
              <Text style={styles.resultTitle}>Today&apos;s generated look</Text>
              <Text style={styles.resultText}>
                {usedItems.length
                  ? 'These are the real wardrobe pieces the stylist used in the final image.'
                  : 'This variant was styled from weather context because no synced garments were selected.'}
              </Text>

              {usedItems.length ? (
                <DailyLookGarmentCarousel items={usedItems} theme={theme} />
              ) : null}

              <View style={styles.actionRow}>
                <Pressable onPress={handleSaveLook} style={[styles.actionButton, styles.secondaryButton]}>
                  <Ionicons name="bookmark-outline" size={16} color={theme.colors.text} />
                  <Text style={styles.secondaryButtonText}>Save look</Text>
                </Pressable>
                <Pressable onPress={() => void generateAnotherVariant()} style={[styles.actionButton, styles.primaryButton]}>
                  <Ionicons name="sparkles-outline" size={16} color={theme.colors.accentContrast} />
                  <Text style={styles.primaryButtonText}>Generate another variant</Text>
                </Pressable>
              </View>
            </View>
          </ScrollView>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function resolveFailureUi(errorMessage: string | null): FailureUiContent {
  const message = String(errorMessage || '').trim();
  const normalized = message.toLowerCase();

  if (normalized.includes('timed out after') || normalized.includes('request ') || normalized.includes('fal')) {
    return {
      title: 'Provider queue timed out.',
      message: message || 'The generation stayed in the provider queue too long. Starting again will create a new paid attempt.',
      retryLabel: 'Start new paid attempt',
    };
  }

  return {
    title: 'AI stylist needs more data.',
    message: message || 'Please try again after syncing more wardrobe photos.',
    retryLabel: 'Generate another variant',
  };
}

/* eslint-disable-next-line no-unused-vars, @typescript-eslint/no-unused-vars */
function _showSavedToastLegacy(): void {
  if (Platform.OS === 'android') {
    ToastAndroid.show('Образ сохранен в гардероб', ToastAndroid.SHORT);
  } else {
    console.info('Образ сохранен в гардероб');
  }
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: theme.colors.background,
      paddingHorizontal: theme.spacing.md,
      paddingTop: theme.spacing.sm,
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.md,
    },
    backgroundOrbOne: {
      position: 'absolute',
      top: 24,
      right: -70,
      width: 220,
      height: 220,
      borderRadius: 220,
      backgroundColor: theme.colors.accentSoft,
      opacity: 0.18,
    },
    backgroundOrbTwo: {
      position: 'absolute',
      bottom: 110,
      left: -48,
      width: 180,
      height: 180,
      borderRadius: 180,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.14,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    headerButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    headerCopy: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    headerEyebrow: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    headerTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    headerSpacer: {
      width: 42,
      height: 42,
    },
    resultShell: {
      flex: 1,
    },
    resultContent: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
    },
    photoFrame: {
      minHeight: 460,
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    photo: {
      width: '100%',
      height: 520,
      backgroundColor: theme.colors.surfaceElevated,
    },
    photoOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(11, 14, 20, 0.08)',
    },
    overlayCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
    },
    resultTitle: {
      color: theme.colors.text,
      fontSize: 22,
      lineHeight: 26,
      fontWeight: '900',
    },
    resultText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    failureCard: {
      flex: 1,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'flex-start',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      gap: theme.spacing.md,
    },
    failureTitle: {
      color: theme.colors.text,
      fontSize: 28,
      lineHeight: 32,
      fontWeight: '900',
      maxWidth: 280,
    },
    failureText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      maxWidth: 320,
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
      width: '100%',
    },
    actionButton: {
      minHeight: 52,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      flex: 1,
    },
    primaryButton: {
      backgroundColor: theme.colors.accent,
    },
    secondaryButton: {
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    primaryButtonText: {
      color: theme.colors.accentContrast,
      fontSize: 13,
      fontWeight: '800',
    },
    secondaryButtonText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
  });
}
