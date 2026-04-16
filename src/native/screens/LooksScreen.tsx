import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { buildDefaultTryOnOutfit, buildManualOutfit } from '../../shared/outfits';
import {
  buildLookPreviewComposition,
  buildLookSelectionForControl,
  buildLookSlotOptions,
  getLookControlSlotLabel,
  LOOK_CANVAS_CONTROL_POSITIONS,
  LOOK_CONTROL_SLOT_ORDER,
  type LookControlSlot,
} from '../../shared/look-preview';
import { getWardrobeItemShortTitle } from '../../shared/wardrobe';
import { DayWeatherCarousel } from '../components/DayWeatherCarousel';
import {
  FullBodyOutfitCanvas,
  type CanvasSlotControl,
} from '../components/FullBodyOutfitCanvas';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { generateLooksWithStylist } from '../services/stylist-service';
import type { ThemeTokens } from '../theme';
import {
  AI_LOOK_UPGRADE_PRICE_USD,
  EXPANDED_AI_LOOK_LIMIT,
  FREE_AI_LOOK_LIMIT,
  STRIPE_AI_LOOK_UPGRADE_URL,
  UPGRADE_CONTEXT_AI_LOOKS,
  buildAiLookUpgradeStorageKey,
  buildAiLookUsageStorageKey,
  buildStripeCheckoutUrl,
  buildUpgradePendingContextStorageKey,
  buildUpgradePendingPaymentStorageKey,
  createPendingUpgradePaymentRecord,
  createUpgradeCheckoutReferenceId,
  getAiLookLimit,
  isPendingUpgradePaymentExpired,
  isUpgradeSuccessUrl,
  isWardrobeUpgradeStoredValue,
  parsePendingUpgradePayment,
  parseUsageCount,
} from '../../shared/wardrobe-upgrade.js';
import { verifyStripeUpgradePayment } from '../services/upgrade-payment';
import {
  pickNextCycledOption,
  resolveLooksDisplayOutfit,
} from './looks-runtime.js';

const NONE_CYCLE_ID = '__none__';
const AI_LOOKS_CHECKOUT_IS_STRIPE_TEST = /buy\.stripe\.com\/test_/i.test(STRIPE_AI_LOOK_UPGRADE_URL);
const STRIPE_TEST_RETURN_UNLOCK_MIN_AGE_MS = 12000;

interface AvatarReadinessUi {
  title: string;
  copy: string;
  ctaLabel: string | null;
  action: 'profile' | 'identity' | null;
}

export function LooksScreen() {
  const { state, dispatch, theme } = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [aiUpgradeUnlocked, setAiUpgradeUnlocked] = useState(false);
  const [aiGenerationUsage, setAiGenerationUsage] = useState(0);
  const [aiUpgradeModalVisible, setAiUpgradeModalVisible] = useState(false);
  const [aiUpgradeNotice, setAiUpgradeNotice] = useState('');
  const verificationInFlightRef = useRef(false);

  const userId = state.authSession?.user?.id || state.user?.id || 'anonymous';
  const userEmail = state.authSession?.user?.email || '';
  const aiUpgradeStorageKey = useMemo(
    () => buildAiLookUpgradeStorageKey(userId),
    [userId],
  );
  const aiUsageStorageKey = useMemo(
    () => buildAiLookUsageStorageKey(userId),
    [userId],
  );
  const pendingUpgradeContextStorageKey = useMemo(
    () => buildUpgradePendingContextStorageKey(userId),
    [userId],
  );
  const pendingUpgradePaymentStorageKey = useMemo(
    () => buildUpgradePendingPaymentStorageKey(userId),
    [userId],
  );
  const aiGenerationLimit = getAiLookLimit(aiUpgradeUnlocked);
  const aiGenerationsRemaining = Math.max(0, aiGenerationLimit - aiGenerationUsage);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [storedUpgrade, storedUsage] = await Promise.all([
        AsyncStorage.getItem(aiUpgradeStorageKey),
        AsyncStorage.getItem(aiUsageStorageKey),
      ]);
      if (cancelled) return;
      setAiUpgradeUnlocked(isWardrobeUpgradeStoredValue(storedUpgrade));
      setAiGenerationUsage(parseUsageCount(storedUsage));
    })();

    return () => {
      cancelled = true;
    };
  }, [aiUpgradeStorageKey, aiUsageStorageKey]);

  const unlockAiLookUpgrade = useCallback(async () => {
    if (aiUpgradeUnlocked) return;
    await AsyncStorage.setItem(aiUpgradeStorageKey, 'expanded');
    await AsyncStorage.multiRemove([
      pendingUpgradeContextStorageKey,
      pendingUpgradePaymentStorageKey,
    ]);
    setAiUpgradeUnlocked(true);
    setAiUpgradeNotice(`Payment confirmed. AI generation limit expanded to ${EXPANDED_AI_LOOK_LIMIT}.`);
    setAiUpgradeModalVisible(false);
  }, [aiUpgradeStorageKey, aiUpgradeUnlocked, pendingUpgradeContextStorageKey, pendingUpgradePaymentStorageKey]);

  const markPendingAiUpgradeAsReturnedToApp = useCallback(async () => {
    const [pendingContextRaw, pendingPaymentRaw] = await Promise.all([
      AsyncStorage.getItem(pendingUpgradeContextStorageKey),
      AsyncStorage.getItem(pendingUpgradePaymentStorageKey),
    ]);
    const pendingContext = String(pendingContextRaw || '').trim().toLowerCase();
    if (pendingContext !== UPGRADE_CONTEXT_AI_LOOKS) return;

    const pendingPayment = parsePendingUpgradePayment(pendingPaymentRaw);
    if (!pendingPayment || pendingPayment.context !== UPGRADE_CONTEXT_AI_LOOKS || pendingPayment.returnedToApp) {
      return;
    }

    const nextPending = createPendingUpgradePaymentRecord({
      context: pendingPayment.context,
      referenceId: pendingPayment.referenceId,
      createdAt: pendingPayment.createdAt,
      customerEmail: pendingPayment.customerEmail || '',
      returnedToApp: true,
    });
    if (!nextPending) return;
    await AsyncStorage.setItem(pendingUpgradePaymentStorageKey, JSON.stringify(nextPending));
  }, [pendingUpgradeContextStorageKey, pendingUpgradePaymentStorageKey]);

  const verifyPendingAiUpgradePayment = useCallback(async (
    source: 'initial' | 'return' | 'deeplink' = 'initial',
  ) => {
    if (verificationInFlightRef.current) return false;
    verificationInFlightRef.current = true;

    try {
      const [pendingContextRaw, pendingPaymentRaw] = await Promise.all([
        AsyncStorage.getItem(pendingUpgradeContextStorageKey),
        AsyncStorage.getItem(pendingUpgradePaymentStorageKey),
      ]);
      const pendingContext = String(pendingContextRaw || '').trim().toLowerCase();
      if (pendingContext !== UPGRADE_CONTEXT_AI_LOOKS) return false;

      const pendingPayment = parsePendingUpgradePayment(pendingPaymentRaw);
      if (!pendingPayment || pendingPayment.context !== UPGRADE_CONTEXT_AI_LOOKS) {
        await AsyncStorage.multiRemove([
          pendingUpgradeContextStorageKey,
          pendingUpgradePaymentStorageKey,
        ]);
        return false;
      }
      if (isPendingUpgradePaymentExpired(pendingPayment)) {
        await AsyncStorage.multiRemove([
          pendingUpgradeContextStorageKey,
          pendingUpgradePaymentStorageKey,
        ]);
        return false;
      }

      const verification = await verifyStripeUpgradePayment({
        context: UPGRADE_CONTEXT_AI_LOOKS,
        referenceId: pendingPayment.referenceId,
        customerEmail: pendingPayment.customerEmail || userEmail,
        createdAfter: Math.max(0, Math.floor((pendingPayment.createdAt - (10 * 60 * 1000)) / 1000)),
      });

      if (verification.paid) {
        await unlockAiLookUpgrade();
        return true;
      }

      const allowTestFallbackUnlock = AI_LOOKS_CHECKOUT_IS_STRIPE_TEST
        && !verification.configured
        && pendingPayment.returnedToApp
        && (Date.now() - pendingPayment.createdAt) >= STRIPE_TEST_RETURN_UNLOCK_MIN_AGE_MS;
      if (allowTestFallbackUnlock) {
        await unlockAiLookUpgrade();
        return true;
      }

      if (!verification.configured) {
        setAiUpgradeNotice('Payment verification is unavailable right now.');
      } else if (source !== 'initial') {
        setAiUpgradeNotice('Payment is not confirmed yet. Complete checkout and return to the app.');
      }
      return false;
    } finally {
      verificationInFlightRef.current = false;
    }
  }, [
    pendingUpgradeContextStorageKey,
    pendingUpgradePaymentStorageKey,
    unlockAiLookUpgrade,
    userEmail,
  ]);

  useEffect(() => {
    void verifyPendingAiUpgradePayment('initial');
  }, [verifyPendingAiUpgradePayment]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void (async () => {
          await markPendingAiUpgradeAsReturnedToApp();
          await verifyPendingAiUpgradePayment('return');
        })();
      }
    });
    return () => {
      subscription.remove();
    };
  }, [markPendingAiUpgradeAsReturnedToApp, verifyPendingAiUpgradePayment]);

  useEffect(() => {
    const handleUrl = (url: string | null) => {
      if (!url || !isUpgradeSuccessUrl(url)) return;
      void verifyPendingAiUpgradePayment('deeplink');
    };

    void Linking.getInitialURL().then(url => {
      handleUrl(url);
    });

    const subscription = Linking.addEventListener('url', event => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [verifyPendingAiUpgradePayment]);

  const autoTryOnOutfit = useMemo(() => buildDefaultTryOnOutfit({
    wardrobe: state.wardrobeItems,
    weather: state.weather,
    userStyle: state.user?.style || '',
    selectedDate: state.selectedDate,
  }), [state.selectedDate, state.user?.style, state.wardrobeItems, state.weather]);

  const manualOutfit = useMemo(() => (
    state.manualSelectionIds.length
      ? buildManualOutfit(state.wardrobeItems, state.manualSelectionIds)
      : null
  ), [state.manualSelectionIds, state.wardrobeItems]);

  const activeOutfit = useMemo(() => resolveLooksDisplayOutfit({
    manualOutfit,
    generatedLooks: state.generatedLooks,
    activeOutfitIndex: state.activeOutfitIndex,
    fallbackOutfit: autoTryOnOutfit,
  }), [autoTryOnOutfit, manualOutfit, state.activeOutfitIndex, state.generatedLooks]);

  const composition = useMemo(
    () => buildLookPreviewComposition(activeOutfit?.garments || [], state.user),
    [activeOutfit?.garments, state.user],
  );
  const activeTryOnIds = useMemo(
    () => composition.visibleItems.map(item => item.id),
    [composition.visibleItems],
  );
  const slotOptions = useMemo(
    () => buildLookSlotOptions(state.wardrobeItems),
    [state.wardrobeItems],
  );
  const completionHints = useMemo(() => buildCompletionHints(activeOutfit), [activeOutfit]);
  const avatarReadiness = useMemo(
    () => resolveAvatarReadinessUi(composition.avatarState),
    [composition.avatarState],
  );
  const visibleSlotCards = useMemo(() => LOOK_CONTROL_SLOT_ORDER.filter(slot => {
    const optionCount = slotOptions[slot]?.length || 0;
    return optionCount > 0
      || Boolean(composition.activeSlots[slot])
      || composition.missingCoreSlots.includes(slot);
  }), [composition.activeSlots, composition.missingCoreSlots, slotOptions]);

  const handleSelectSlotItem = useCallback((slot: LookControlSlot, itemId: string | null) => {
    const nextItem = itemId
      ? state.wardrobeItems.find(item => item.id === itemId) || null
      : null;

    dispatch({
      type: 'SET_MANUAL_SELECTION_IDS',
      payload: buildLookSelectionForControl(slot, nextItem, activeTryOnIds, state.wardrobeItems),
    });
  }, [activeTryOnIds, dispatch, state.wardrobeItems]);

  const handleCycleSlot = useCallback((slot: LookControlSlot, direction: number) => {
    const options = slotOptions[slot] || [];
    if (!options.length) return;

    const next = pickNextCycledOption(
      [{ id: NONE_CYCLE_ID }, ...options],
      composition.activeSlots[slot]?.id || NONE_CYCLE_ID,
      direction,
    );
    if (!next) return;

    handleSelectSlotItem(slot, next.id === NONE_CYCLE_ID ? null : String(next.id));
  }, [composition.activeSlots, handleSelectSlotItem, slotOptions]);

  const canvasSlotControls = LOOK_CONTROL_SLOT_ORDER.reduce<CanvasSlotControl[]>((controls, slot) => {
    const options = slotOptions[slot] || [];
    const enabled = options.length > 0;
    if (!enabled) return controls;

    controls.push({
      slot,
      yPercent: Number(LOOK_CANVAS_CONTROL_POSITIONS[slot] || 50),
      enabled,
      onPrev: () => handleCycleSlot(slot, -1),
      onNext: () => handleCycleSlot(slot, 1),
    });
    return controls;
  }, []);

  const handleGenerate = async () => {
    if (aiGenerationsRemaining <= 0) {
      setAiUpgradeNotice(`Free AI limit is ${FREE_AI_LOOK_LIMIT}. Upgrade to unlock ${EXPANDED_AI_LOOK_LIMIT} generations.`);
      setAiUpgradeModalVisible(true);
      return;
    }

    dispatch({ type: 'SET_AI_LOADING', payload: true });
    dispatch({ type: 'SET_AI_ERROR', payload: null });

    const result = await generateLooksWithStylist(state);
    if (result.outfits.length > 0) {
      const nextUsage = aiGenerationUsage + 1;
      setAiGenerationUsage(nextUsage);
      await AsyncStorage.setItem(aiUsageStorageKey, String(nextUsage));
    }

    if (result.outfits.length) {
      dispatch({ type: 'CLEAR_MANUAL_SELECTION' });
    }

    dispatch({ type: 'SET_GENERATED_LOOKS', payload: result.outfits });
    dispatch({ type: 'SET_AI_ERROR', payload: result.error });
    dispatch({ type: 'SET_AI_LOADING', payload: false });
  };

  const handleUpgradeCheckout = useCallback(async () => {
    const existingPendingRaw = await AsyncStorage.getItem(pendingUpgradePaymentStorageKey);
    const existingPending = parsePendingUpgradePayment(existingPendingRaw);
    if (
      existingPending
      && existingPending.context === UPGRADE_CONTEXT_AI_LOOKS
      && !isPendingUpgradePaymentExpired(existingPending)
      && Date.now() - existingPending.createdAt >= 12000
    ) {
      const resolved = await verifyPendingAiUpgradePayment('return');
      if (resolved) return;
    }

    const referenceId = createUpgradeCheckoutReferenceId(userId, UPGRADE_CONTEXT_AI_LOOKS);
    const pendingPayment = createPendingUpgradePaymentRecord({
      context: UPGRADE_CONTEXT_AI_LOOKS,
      referenceId,
      createdAt: Date.now(),
      customerEmail: userEmail,
    });
    if (!pendingPayment) {
      setAiUpgradeNotice('Could not prepare checkout session.');
      return;
    }

    setAiUpgradeNotice('Complete Stripe checkout. The app will unlock automatically after payment.');
    const checkoutUrl = buildStripeCheckoutUrl(STRIPE_AI_LOOK_UPGRADE_URL, {
      referenceId: pendingPayment.referenceId,
      customerEmail: pendingPayment.customerEmail || userEmail,
    });

    try {
      await AsyncStorage.multiSet([
        [pendingUpgradeContextStorageKey, UPGRADE_CONTEXT_AI_LOOKS],
        [pendingUpgradePaymentStorageKey, JSON.stringify(pendingPayment)],
      ]);
      await Linking.openURL(checkoutUrl || STRIPE_AI_LOOK_UPGRADE_URL);
    } catch {
      setAiUpgradeNotice('Could not open checkout. Please try again.');
    }
  }, [
    pendingUpgradeContextStorageKey,
    pendingUpgradePaymentStorageKey,
    verifyPendingAiUpgradePayment,
    userEmail,
    userId,
  ]);

  const handleReset = () => {
    dispatch({ type: 'CLEAR_MANUAL_SELECTION' });
    dispatch({ type: 'SET_GENERATED_LOOKS', payload: [] });
    dispatch({ type: 'SET_ACTIVE_OUTFIT_INDEX', payload: 0 });
    dispatch({ type: 'SET_AI_ERROR', payload: null });
  };

  const handleSave = () => {
    if (!activeOutfit) return;
    dispatch({ type: 'SAVE_OUTFIT', payload: { outfit: activeOutfit } });
  };

  const handleAvatarCta = useCallback(() => {
    if (avatarReadiness.action === 'profile') {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'profile' });
      return;
    }
    if (avatarReadiness.action === 'identity') {
      navigation.navigate('IdentityCapture');
    }
  }, [avatarReadiness.action, dispatch, navigation]);

  return (
    <View style={styles.root}>
      <DayWeatherCarousel
        selectedDate={state.selectedDate}
        onChangeDate={date => dispatch({ type: 'SET_SELECTED_DATE', payload: date })}
        theme={theme}
        city={state.city}
        weather={state.weather}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.canvasWrap}>
          <FullBodyOutfitCanvas
            items={composition.visibleItems}
            avatarUrl={composition.avatarUrl}
            avatarState={composition.avatarState}
            theme={theme}
            editable
            completionHints={completionHints}
            slotControls={canvasSlotControls}
            onPlacementChange={(itemId, patch) => {
              dispatch({ type: 'UPDATE_GARMENT_ADJUSTMENT', payload: { itemId, patch } });
            }}
          />
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusCopy}>
            <Text style={styles.statusTitle}>{avatarReadiness.title}</Text>
            <Text style={styles.statusText}>{avatarReadiness.copy}</Text>
          </View>
          {avatarReadiness.ctaLabel ? (
            <Pressable onPress={handleAvatarCta} style={styles.statusAction}>
              <Text style={styles.statusActionText}>{avatarReadiness.ctaLabel}</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.slotRail}>
          {visibleSlotCards.map(slot => {
            const activeItem = composition.activeSlots[slot];
            const missing = composition.missingCoreSlots.includes(slot);
            return (
              <View key={slot} style={[styles.slotCard, missing && styles.slotCardMissing]}>
                <Text style={styles.slotLabel}>{getLookControlSlotLabel(slot)}</Text>
                <Text numberOfLines={1} style={[styles.slotValue, !activeItem && styles.slotValueMuted]}>
                  {activeItem ? getWardrobeItemShortTitle(activeItem) : missing ? 'Missing' : 'Optional'}
                </Text>
                <Text style={styles.slotHelp}>
                  {(slotOptions[slot]?.length || 0) > 1 ? 'Use canvas arrows to cycle' : 'Current slot state'}
                </Text>
              </View>
            );
          })}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {state.aiError ? <Text style={styles.errorText}>{state.aiError}</Text> : null}
        <Text style={styles.usageText}>
          {`AI generations: ${aiGenerationUsage}/${aiGenerationLimit}`}
        </Text>

        <View style={styles.actionRow}>
          <Pressable
            style={[styles.actionBtn, styles.actionBtnSecondary]}
            onPress={handleReset}
          >
            <Ionicons name="refresh-outline" size={16} color={theme.colors.text} />
            <Text style={styles.actionBtnSecondaryText}>Reset</Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.actionBtnPrimary, state.aiLoading && styles.actionBtnDisabled]}
            onPress={() => void handleGenerate()}
            disabled={state.aiLoading}
          >
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.accentContrast} />
            <Text style={styles.actionBtnPrimaryText}>
              {state.aiLoading ? 'Generating...' : aiGenerationsRemaining <= 0 ? 'Upgrade' : 'Generate'}
            </Text>
          </Pressable>

          <Pressable
            style={[styles.actionBtn, styles.actionBtnSecondary, !activeOutfit && styles.actionBtnDisabled]}
            onPress={handleSave}
            disabled={!activeOutfit}
          >
            <Ionicons name="bookmark-outline" size={16} color={theme.colors.text} />
            <Text style={styles.actionBtnSecondaryText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <Modal
        animationType="fade"
        visible={aiUpgradeModalVisible}
        transparent
        onRequestClose={() => setAiUpgradeModalVisible(false)}
      >
        <View style={styles.upgradeBackdrop}>
          <View style={styles.upgradeCard}>
            <View style={styles.upgradeGlowA} />
            <View style={styles.upgradeGlowB} />

            <Pressable onPress={() => setAiUpgradeModalVisible(false)} style={styles.upgradeClose}>
              <Ionicons name="close" size={16} color={theme.colors.text} />
            </Pressable>

            <Text style={styles.upgradeEyebrow}>AI Looks Plus</Text>
            <Text style={styles.upgradeTitle}>Unlock 20 AI generations</Text>
            <Text style={styles.upgradeCopy}>
              {`You already used ${aiGenerationUsage}/${aiGenerationLimit} AI looks. Upgrade for $${AI_LOOK_UPGRADE_PRICE_USD} and expand the limit to ${EXPANDED_AI_LOOK_LIMIT}.`}
            </Text>
            {aiUpgradeNotice ? <Text style={styles.upgradeNote}>{aiUpgradeNotice}</Text> : null}

            <Pressable onPress={() => void handleUpgradeCheckout()} style={styles.upgradePayBtn}>
              <Text style={styles.upgradePayBtnText}>{`Pay $${AI_LOOK_UPGRADE_PRICE_USD}`}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function buildCompletionHints(outfit: { renderMetadata?: Record<string, unknown> } | null): string[] {
  if (!outfit) return [];

  const hints: string[] = [];
  const prompt = String(outfit.renderMetadata?.completionPrompt || '').trim();
  if (prompt) hints.push(prompt);

  const warnings = Array.isArray(outfit.renderMetadata?.warnings)
    ? outfit.renderMetadata?.warnings.map(entry => String(entry).trim()).filter(Boolean)
    : [];
  for (const warning of warnings) {
    if (!hints.includes(warning)) hints.push(warning);
  }

  return hints.slice(0, 2);
}

function resolveAvatarReadinessUi(state: 'ready' | 'needs_identity' | 'missing'): AvatarReadinessUi {
  switch (state) {
    case 'ready':
      return {
        title: 'Avatar is driving the preview',
        copy: 'Looks now composes real wardrobe layers around your avatar base instead of floating items.',
        ctaLabel: null,
        action: null,
      };
    case 'needs_identity':
      return {
        title: 'Avatar base is ready',
        copy: 'Add the full set of 5 identity photos so generation locks onto your face more reliably across AI flows.',
        ctaLabel: 'Capture 5 photos',
        action: 'identity',
      };
    default:
      return {
        title: 'Add an avatar first',
        copy: 'Upload a profile photo so Looks has a visual base. After that, wardrobe items will render around your avatar.',
        ctaLabel: 'Open Profile',
        action: 'profile',
      };
  }
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: {
      flex: 1,
      gap: theme.spacing.sm,
    },
    content: {
      paddingBottom: theme.spacing.md,
      gap: theme.spacing.md,
    },
    canvasWrap: {
      height: 648,
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.xs,
    },
    statusCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
    },
    statusCopy: {
      gap: 6,
    },
    statusTitle: {
      color: theme.colors.text,
      fontSize: 18,
      lineHeight: 22,
      fontWeight: '900',
    },
    statusText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    statusAction: {
      alignSelf: 'flex-start',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    statusActionText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '800',
    },
    slotRail: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    slotCard: {
      flexGrow: 1,
      minWidth: 140,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 11,
      gap: 4,
    },
    slotCardMissing: {
      borderColor: theme.colors.accentMuted,
      backgroundColor: theme.colors.accentSoft,
    },
    slotLabel: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    slotValue: {
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '800',
    },
    slotValueMuted: {
      color: theme.colors.textSecondary,
    },
    slotHelp: {
      color: theme.colors.muted,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
    },
    bottomBar: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
    },
    usageText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 17,
      fontWeight: '700',
    },
    errorText: {
      color: theme.colors.danger,
      fontSize: 12,
      textAlign: 'center',
      lineHeight: 17,
    },
    actionRow: {
      flexDirection: 'row',
      gap: theme.spacing.xs,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: theme.radius.pill,
      paddingVertical: 14,
    },
    actionBtnPrimary: {
      backgroundColor: theme.colors.accent,
    },
    actionBtnSecondary: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    actionBtnPrimaryText: {
      color: theme.colors.accentContrast,
      fontWeight: '800',
      fontSize: 14,
    },
    actionBtnSecondaryText: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: 14,
    },
    actionBtnDisabled: {
      opacity: 0.45,
    },
    upgradeBackdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.md,
    },
    upgradeCard: {
      width: '100%',
      maxWidth: 410,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.md,
      gap: theme.spacing.sm,
      overflow: 'hidden',
    },
    upgradeGlowA: {
      position: 'absolute',
      top: -28,
      right: -20,
      width: 130,
      height: 130,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
      opacity: 0.88,
    },
    upgradeGlowB: {
      position: 'absolute',
      left: -26,
      bottom: -42,
      width: 140,
      height: 140,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.44,
    },
    upgradeClose: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      zIndex: 2,
    },
    upgradeEyebrow: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    upgradeTitle: {
      color: theme.colors.text,
      fontSize: 24,
      lineHeight: 29,
      fontWeight: '900',
      maxWidth: 280,
    },
    upgradeCopy: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
    },
    upgradeNote: {
      color: theme.colors.text,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    upgradePayBtn: {
      minHeight: 48,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      marginTop: 4,
      paddingHorizontal: 16,
    },
    upgradePayBtnText: {
      color: theme.colors.accentContrast,
      fontSize: 14,
      fontWeight: '900',
    },
  });
}
