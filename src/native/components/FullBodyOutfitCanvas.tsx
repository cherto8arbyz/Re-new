import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';

import { resolvePreferredVisualAsset } from '../../models/garment-presentation.js';
import { getLayer, resolveWardrobeBodySlot, resolveWardrobePlacement } from '../../shared/wardrobe';
import type { WardrobeItem } from '../../types/models';
import type { ThemeTokens } from '../theme';

export type BodySlotKey =
  | 'head'
  | 'torso'
  | 'legs'
  | 'socks'
  | 'feet'
  | 'accessory';

export interface CanvasSlotControl {
  slot: BodySlotKey;
  yPercent: number;
  enabled: boolean;
  onPrev: () => void;
  onNext: () => void;
}

interface FullBodyOutfitCanvasProps {
  activeSlots: Partial<Record<Exclude<BodySlotKey, 'accessory'>, WardrobeItem>>;
  accessoryItems?: WardrobeItem[];
  avatarUrl?: string;
  theme: ThemeTokens;
  editable?: boolean;
  completionHints?: string[];
  slotControls?: CanvasSlotControl[];
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}

export function FullBodyOutfitCanvas({
  activeSlots,
  accessoryItems = [],
  avatarUrl = '',
  theme,
  editable = false,
  completionHints = [],
  slotControls = [],
  onPlacementChange,
}: FullBodyOutfitCanvasProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });

  return (
    <View
      style={styles.canvas}
      onLayout={event => setCanvasSize({
        width: event.nativeEvent.layout.width,
        height: event.nativeEvent.layout.height,
      })}
    >
      <View pointerEvents="none" style={styles.backGlow} />
      <View pointerEvents="none" style={styles.floorGlow} />

      <MannequinSilhouette avatarUrl={avatarUrl} theme={theme} />

      {canvasSize.width > 0 && renderGarmentLayers({
        activeSlots,
        accessoryItems,
        editable,
        stageWidth: canvasSize.width,
        stageHeight: canvasSize.height,
        onPlacementChange,
      })}

      {slotControls.map(control => (
        <React.Fragment key={control.slot}>
          <Pressable
            style={[
              styles.slotArrow,
              styles.slotArrowLeft,
              { top: `${control.yPercent}%` },
              !control.enabled && styles.slotArrowDisabled,
            ]}
            onPress={control.onPrev}
            disabled={!control.enabled}
          >
            <Ionicons name="chevron-back" size={18} color="#ffffff" />
          </Pressable>

          <Pressable
            style={[
              styles.slotArrow,
              styles.slotArrowRight,
              { top: `${control.yPercent}%` },
              !control.enabled && styles.slotArrowDisabled,
            ]}
            onPress={control.onNext}
            disabled={!control.enabled}
          >
            <Ionicons name="chevron-forward" size={18} color="#ffffff" />
          </Pressable>
        </React.Fragment>
      ))}

      {completionHints.length > 0 ? (
        <View style={styles.hintsRow} pointerEvents="none">
          {completionHints.slice(0, 2).map((hint, index) => (
            <View key={`${hint}-${index}`} style={styles.hintBadge}>
              <Text numberOfLines={2} style={styles.hintText}>{hint}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function MannequinSilhouette({ avatarUrl, theme }: { avatarUrl: string; theme: ThemeTokens }) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <>
      <View style={styles.headShell}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.headImage} resizeMode="cover" />
        ) : (
          <View style={styles.headFill} />
        )}
      </View>

      <View pointerEvents="none" style={styles.neck} />
      <View pointerEvents="none" style={styles.shoulders} />
      <View pointerEvents="none" style={styles.waist} />
      <View pointerEvents="none" style={styles.hips} />
      <View pointerEvents="none" style={[styles.arm, styles.armLeft]} />
      <View pointerEvents="none" style={[styles.arm, styles.armRight]} />
      <View pointerEvents="none" style={[styles.leg, styles.legLeft]} />
      <View pointerEvents="none" style={[styles.leg, styles.legRight]} />
      <View pointerEvents="none" style={[styles.foot, styles.footLeft]} />
      <View pointerEvents="none" style={[styles.foot, styles.footRight]} />
    </>
  );
}

function GarmentLayer({
  item,
  slotIndex,
  editable,
  stageWidth,
  stageHeight,
  onPlacementChange,
}: {
  item: WardrobeItem;
  slotIndex: number;
  editable: boolean;
  stageWidth: number;
  stageHeight: number;
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}) {
  const image = resolvePreferredVisualAsset(item).url;
  const [offset, setOffset] = useState({
    x: item.positionOffsetX || 0,
    y: item.positionOffsetY || 0,
  });
  const offsetRef = useRef(offset);
  const startRef = useRef(offset);

  useEffect(() => {
    const next = {
      x: item.positionOffsetX || 0,
      y: item.positionOffsetY || 0,
    };
    setOffset(next);
    offsetRef.current = next;
    startRef.current = next;
  }, [item.positionOffsetX, item.positionOffsetY]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => editable,
    onMoveShouldSetPanResponder: () => editable,
    onPanResponderGrant: () => {
      startRef.current = offsetRef.current;
    },
    onPanResponderMove: (_, gestureState) => {
      if (!editable) return;
      const next = {
        x: clampOffset(startRef.current.x + (gestureState.dx / stageWidth) * 100),
        y: clampOffset(startRef.current.y + (gestureState.dy / stageHeight) * 100),
      };
      offsetRef.current = next;
      setOffset(next);
    },
    onPanResponderRelease: () => {
      if (!editable) return;
      onPlacementChange?.(item.id, {
        positionOffsetX: offsetRef.current.x,
        positionOffsetY: offsetRef.current.y,
      });
    },
    onPanResponderTerminate: () => {
      if (!editable) return;
      onPlacementChange?.(item.id, {
        positionOffsetX: offsetRef.current.x,
        positionOffsetY: offsetRef.current.y,
      });
    },
  }), [editable, item.id, onPlacementChange, stageHeight, stageWidth]);

  if (!image) return null;

  const placement = resolveWardrobePlacement({
    ...item,
    positionOffsetX: offset.x,
    positionOffsetY: offset.y,
  }, slotIndex);

  return (
    <Image
      source={{ uri: image }}
      style={{
        position: 'absolute',
        left: `${placement.x}%`,
        top: `${placement.y}%`,
        width: `${placement.width}%`,
        height: `${placement.height}%`,
        zIndex: resolveCanvasLayer(item),
        transform: [{ rotate: `${item.rotation || 0}deg` }],
        shadowColor: '#000000',
        shadowOpacity: 0.12,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 8 },
      }}
      resizeMode="contain"
      {...(editable ? panResponder.panHandlers : {})}
    />
  );
}

function renderGarmentLayers({
  activeSlots,
  accessoryItems,
  editable,
  stageWidth,
  stageHeight,
  onPlacementChange,
}: {
  activeSlots: Partial<Record<Exclude<BodySlotKey, 'accessory'>, WardrobeItem>>;
  accessoryItems: WardrobeItem[];
  editable: boolean;
  stageWidth: number;
  stageHeight: number;
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}) {
  const orderedItems: WardrobeItem[] = [
    ...(activeSlots.head ? [activeSlots.head] : []),
    ...(activeSlots.torso ? [activeSlots.torso] : []),
    ...(activeSlots.legs ? [activeSlots.legs] : []),
    ...(activeSlots.socks ? [activeSlots.socks] : []),
    ...(activeSlots.feet ? [activeSlots.feet] : []),
    ...accessoryItems,
  ]
    .filter((item, index, list) => list.findIndex(candidate => candidate.id === item.id) === index)
    .sort((left, right) => resolveCanvasLayer(left) - resolveCanvasLayer(right));

  /** @type {Map<string, number>} */
  const slotCounters = new Map();
  return orderedItems.map(item => {
    const slotKey = resolveWardrobeBodySlot(item);
    const slotIndex = slotCounters.get(slotKey) || 0;
    slotCounters.set(slotKey, slotIndex + 1);
    return (
      <GarmentLayer
        key={item.id}
        item={item}
        slotIndex={slotIndex}
        editable={editable}
        stageWidth={stageWidth}
        stageHeight={stageHeight}
        onPlacementChange={onPlacementChange}
      />
    );
  });
}

function clampOffset(value: number) {
  return Math.max(-18, Math.min(18, value));
}

function resolveCanvasLayer(item: WardrobeItem) {
  const slot = resolveWardrobeBodySlot(item);
  const base = 20 + getLayer(item);
  if (slot === 'socks') return base;
  if (slot === 'feet') return base + 2;
  if (slot === 'accessory') return base + 4;
  return base + 1;
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    canvas: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.radius.xl,
      overflow: 'hidden',
    },
    backGlow: {
      position: 'absolute',
      top: 74,
      alignSelf: 'center',
      width: '60%',
      height: '60%',
      borderRadius: 220,
      backgroundColor: theme.colors.accentSoft,
    },
    floorGlow: {
      position: 'absolute',
      bottom: 26,
      alignSelf: 'center',
      width: '44%',
      height: 30,
      borderRadius: 999,
      backgroundColor: theme.colors.panel,
      opacity: 0.48,
    },
    headShell: {
      position: 'absolute',
      top: '5.2%',
      alignSelf: 'center',
      width: '19.5%',
      aspectRatio: 1,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 3,
      borderColor: theme.colors.surfaceElevated,
      zIndex: 16,
    },
    headImage: {
      width: '100%',
      height: '100%',
    },
    headFill: {
      flex: 1,
      backgroundColor: theme.colors.panelStrong,
    },
    neck: {
      position: 'absolute',
      top: '18.3%',
      alignSelf: 'center',
      width: '6.8%',
      height: '5.8%',
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.94,
    },
    shoulders: {
      position: 'absolute',
      top: '21.6%',
      alignSelf: 'center',
      width: '38%',
      height: '17%',
      borderTopLeftRadius: 78,
      borderTopRightRadius: 78,
      borderBottomLeftRadius: 54,
      borderBottomRightRadius: 54,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.82,
    },
    waist: {
      position: 'absolute',
      top: '36.8%',
      alignSelf: 'center',
      width: '22%',
      height: '17%',
      borderRadius: 48,
      backgroundColor: theme.colors.panel,
      opacity: 0.84,
    },
    hips: {
      position: 'absolute',
      top: '52.4%',
      alignSelf: 'center',
      width: '31%',
      height: '14%',
      borderRadius: 58,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.76,
    },
    arm: {
      position: 'absolute',
      top: '23.4%',
      width: '9%',
      height: '38%',
      borderRadius: 999,
      backgroundColor: theme.colors.panel,
      opacity: 0.58,
    },
    armLeft: {
      left: '24.5%',
      transform: [{ rotate: '6deg' }],
    },
    armRight: {
      right: '24.5%',
      transform: [{ rotate: '-6deg' }],
    },
    leg: {
      position: 'absolute',
      top: '61%',
      width: '10.2%',
      height: '27%',
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.72,
    },
    legLeft: {
      left: '39.6%',
    },
    legRight: {
      right: '39.6%',
    },
    foot: {
      position: 'absolute',
      bottom: '10%',
      width: '13.5%',
      height: '3.8%',
      borderRadius: 999,
      backgroundColor: theme.colors.panel,
      opacity: 0.82,
    },
    footLeft: {
      left: '35.8%',
    },
    footRight: {
      right: '35.8%',
    },
    slotArrow: {
      position: 'absolute',
      width: 40,
      height: 40,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.overlay,
      borderWidth: 1,
      borderColor: theme.colors.border,
      transform: [{ translateY: -20 }],
      zIndex: 60,
    },
    slotArrowLeft: {
      left: 10,
    },
    slotArrowRight: {
      right: 10,
    },
    slotArrowDisabled: {
      opacity: 0.35,
    },
    hintsRow: {
      position: 'absolute',
      bottom: 12,
      left: 12,
      right: 12,
      gap: 6,
    },
    hintBadge: {
      alignSelf: 'center',
      maxWidth: '92%',
      backgroundColor: theme.colors.overlay,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    hintText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 16,
    },
  });
}
