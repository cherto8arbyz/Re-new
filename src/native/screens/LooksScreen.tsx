import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';

import { buildDefaultTryOnOutfit, buildManualOutfit } from '../../shared/outfits';
import {
  normalizeWardrobeSelection,
  resolveWardrobeBodySlot,
} from '../../shared/wardrobe';
import type { WardrobeItem } from '../../types/models';
import { DayWeatherCarousel } from '../components/DayWeatherCarousel';
import {
  FullBodyOutfitCanvas,
  type BodySlotKey,
  type CanvasSlotControl,
} from '../components/FullBodyOutfitCanvas';
import { useAppContext } from '../context/AppContext';
import { generateLooksWithStylist } from '../services/stylist-service';
import type { ThemeTokens } from '../theme';
import {
  LOOK_CANVAS_CONTROL_POSITIONS,
  pickNextCycledOption,
  resolveLooksDisplayOutfit,
} from './looks-runtime.js';

const CANVAS_CONTROL_ORDER: BodySlotKey[] = ['head', 'accessory', 'torso', 'legs', 'socks', 'feet'];
const NONE_CYCLE_ID = '__none__';

export function LooksScreen() {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

  const activeTryOnIds = useMemo(() => (
    Array.isArray(activeOutfit?.garments)
      ? activeOutfit.garments.map((item: WardrobeItem) => item.id)
      : []
  ), [activeOutfit]);

  const activeZones = useMemo(() => buildActiveZones(activeOutfit?.garments || []), [activeOutfit?.garments]);
  const zoneOptions = useMemo(() => buildZoneOptions(state.wardrobeItems), [state.wardrobeItems]);
  const completionHints = useMemo(() => buildCompletionHints(activeOutfit), [activeOutfit]);

  const handleSelectZoneItem = (slotKey: BodySlotKey, itemId: string | null) => {
    const nextItem = itemId
      ? state.wardrobeItems.find(item => item.id === itemId) || null
      : null;

    dispatch({
      type: 'SET_MANUAL_SELECTION_IDS',
      payload: buildSelectionForControl(slotKey, nextItem, activeTryOnIds, state.wardrobeItems),
    });
  };

  const handleCycleSlot = (slotKey: BodySlotKey, direction: number) => {
    const options = zoneOptions[slotKey] || [];
    if (!options.length) return;

    const currentItem = slotKey === 'accessory'
      ? activeZones.accessoryItems[0] || null
      : activeZones.activeSlots[slotKey];
    const next = pickNextCycledOption(
      [{ id: NONE_CYCLE_ID }, ...options],
      currentItem?.id || NONE_CYCLE_ID,
      direction,
    );

    if (!next) return;
    handleSelectZoneItem(slotKey, next.id === NONE_CYCLE_ID ? null : String(next.id));
  };

  const canvasSlotControls = CANVAS_CONTROL_ORDER.reduce<CanvasSlotControl[]>((controls, slotKey) => {
    const options = zoneOptions[slotKey] || [];
    if (!options.length) return controls;

    controls.push({
      slot: slotKey,
      yPercent: Number(LOOK_CANVAS_CONTROL_POSITIONS?.[slotKey] || 50),
      enabled: options.length > 0,
      onPrev: () => handleCycleSlot(slotKey, -1),
      onNext: () => handleCycleSlot(slotKey, 1),
    });
    return controls;
  }, []);

  const handleGenerate = async () => {
    dispatch({ type: 'SET_AI_LOADING', payload: true });
    dispatch({ type: 'SET_AI_ERROR', payload: null });

    const result = await generateLooksWithStylist(state);
    if (result.outfits.length) {
      dispatch({ type: 'CLEAR_MANUAL_SELECTION' });
    }

    dispatch({ type: 'SET_GENERATED_LOOKS', payload: result.outfits });
    dispatch({ type: 'SET_AI_ERROR', payload: result.error });
    dispatch({ type: 'SET_AI_LOADING', payload: false });
  };

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
            activeSlots={activeZones.activeSlots}
            accessoryItems={activeZones.accessoryItems}
            avatarUrl={state.user?.lookFaceAssetUrl || state.user?.avatarUrl || ''}
            theme={theme}
            editable
            completionHints={completionHints}
            slotControls={canvasSlotControls}
            onPlacementChange={(itemId, patch) => {
              dispatch({ type: 'UPDATE_GARMENT_ADJUSTMENT', payload: { itemId, patch } });
            }}
          />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        {state.aiError ? <Text style={styles.errorText}>{state.aiError}</Text> : null}

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
            onPress={handleGenerate}
            disabled={state.aiLoading}
          >
            <Ionicons name="sparkles-outline" size={16} color={theme.colors.accentContrast} />
            <Text style={styles.actionBtnPrimaryText}>
              {state.aiLoading ? 'Generating...' : 'Generate'}
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
    </View>
  );
}

function buildActiveZones(items: WardrobeItem[]): {
  activeSlots: Partial<Record<Exclude<BodySlotKey, 'accessory'>, WardrobeItem>>;
  accessoryItems: WardrobeItem[];
} {
  return items.reduce<{
    activeSlots: Partial<Record<Exclude<BodySlotKey, 'accessory'>, WardrobeItem>>;
    accessoryItems: WardrobeItem[];
  }>((accumulator, item) => {
    if (!item || typeof item !== 'object') return accumulator;
    const slotKey = categoryToSlotKey(item);
    if (!slotKey) return accumulator;

    if (slotKey === 'accessory') {
      accumulator.accessoryItems.push(item);
      return accumulator;
    }

    if (!accumulator.activeSlots[slotKey]) {
      accumulator.activeSlots[slotKey] = item;
    }
    return accumulator;
  }, { activeSlots: {}, accessoryItems: [] });
}

function buildZoneOptions(items: WardrobeItem[]): Partial<Record<BodySlotKey, WardrobeItem[]>> {
  return items.reduce<Partial<Record<BodySlotKey, WardrobeItem[]>>>((accumulator, item) => {
    if (!item || typeof item !== 'object') return accumulator;
    const slotKey = categoryToSlotKey(item);
    if (!slotKey) return accumulator;
    accumulator[slotKey] = [...(accumulator[slotKey] || []), item];
    return accumulator;
  }, {});
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

function categoryToSlotKey(item: WardrobeItem): BodySlotKey | null {
  if (!item || typeof item !== 'object' || !item.category) return null;
  const bodySlot = resolveWardrobeBodySlot(item);

  if (bodySlot === 'head') return 'head';
  if (bodySlot === 'legs') return 'legs';
  if (bodySlot === 'socks') return 'socks';
  if (bodySlot === 'feet') return 'feet';
  if (bodySlot === 'accessory') return 'accessory';
  return 'torso';
}

function matchesSlot(item: WardrobeItem, slotKey: BodySlotKey): boolean {
  return categoryToSlotKey(item) === slotKey;
}

function buildSelectionForControl(
  slotKey: BodySlotKey,
  nextItem: WardrobeItem | null,
  activeIds: string[],
  wardrobeItems: WardrobeItem[],
): string[] {
  if (slotKey === 'accessory') {
    const accessoryIds = new Set(
      wardrobeItems
        .filter(item => matchesSlot(item, 'accessory'))
        .map(item => item.id),
    );
    const selection = new Set(activeIds.filter(id => !accessoryIds.has(id)));
    if (nextItem) selection.add(nextItem.id);
    return normalizeWardrobeSelection(wardrobeItems, Array.from(selection));
  }

  const selection = new Set(activeIds);
  const zoneIds = wardrobeItems.filter(item => matchesSlot(item, slotKey)).map(item => item.id);
  for (const zoneId of zoneIds) {
    selection.delete(zoneId);
  }

  if (!nextItem) {
    return normalizeWardrobeSelection(wardrobeItems, Array.from(selection));
  }

  if (slotKey === 'legs') {
    const torsoItem = wardrobeItems.find(item => selection.has(item.id) && matchesSlot(item, 'torso'));
    if (torsoItem?.category === 'dress') {
      selection.delete(torsoItem.id);
    }
  }

  if (slotKey === 'torso' && nextItem.category === 'dress') {
    for (const item of wardrobeItems) {
      if (matchesSlot(item, 'legs')) selection.delete(item.id);
    }
  }

  selection.add(nextItem.id);
  return normalizeWardrobeSelection(wardrobeItems, Array.from(selection));
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
    bottomBar: {
      gap: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
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
  });
}
