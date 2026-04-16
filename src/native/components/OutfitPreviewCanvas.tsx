import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getLookPreviewLayer } from '../../shared/look-preview';
import {
  resolvePreferredWardrobeVisualAsset,
  resolveWardrobeClothingSlot,
  resolveWardrobePlacement,
} from '../../shared/wardrobe';
import type { Outfit, WardrobeItem } from '../../types/models';
import type { ThemeTokens } from '../theme';

type PreviewSize = 'large' | 'compact';

interface OutfitPreviewCanvasProps {
  outfit: Outfit | null;
  avatarUrl?: string;
  theme: ThemeTokens;
  editable?: boolean;
  size?: PreviewSize;
  label?: string;
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}

const PRESETS: Record<PreviewSize, { width: number; height: number; head: number; labelSize: number }> = {
  large: { width: 188, height: 292, head: 66, labelSize: 13 },
  compact: { width: 126, height: 188, head: 46, labelSize: 11 },
};

export function OutfitPreviewCanvas({
  outfit,
  avatarUrl = '',
  theme,
  editable = false,
  size = 'large',
  label,
  onPlacementChange,
}: OutfitPreviewCanvasProps) {
  const preset = PRESETS[size];
  const styles = useMemo(() => createStyles(theme, preset), [theme, preset]);
  const garments = useMemo(() => (
    [...(outfit?.garments || [])].sort((left, right) => getLookPreviewLayer(left) - getLookPreviewLayer(right))
  ), [outfit?.garments]);

  return (
    <View style={[styles.card, editable && styles.cardEditable]}>
      <View style={styles.stage}>
        <View style={styles.backGlow} />
        {avatarUrl ? (
          <View style={styles.avatarPortraitWrap}>
            <Image source={{ uri: avatarUrl }} style={styles.avatarPortraitImage} resizeMode="cover" />
            <View style={styles.avatarPortraitScrim} />
          </View>
        ) : null}
        <View style={styles.headWrap}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarHead} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarPlaceholderText}>Face</Text>
            </View>
          )}
        </View>

        <View style={styles.neck} />
        <View style={styles.shoulders} />
        <View style={styles.waist} />
        <View style={styles.hips} />
        <View style={[styles.arm, styles.armLeft]} />
        <View style={[styles.arm, styles.armRight]} />
        <View style={[styles.leg, styles.legLeft]} />
        <View style={[styles.leg, styles.legRight]} />
        <View style={[styles.foot, styles.footLeft]} />
        <View style={[styles.foot, styles.footRight]} />

        {renderGarmentLayers({
          garments,
          editable,
          stageHeight: preset.height,
          stageWidth: preset.width,
          styles,
          onPlacementChange,
        })}
      </View>

      <Text style={styles.labelText}>
        {label || outfit?.styleName || outfit?.name || 'Try-on preview'}
      </Text>
      {editable ? <Text style={styles.helperText}>Drag to fine-tune the fit</Text> : null}
    </View>
  );
}

function DraggableGarmentLayer({
  editable,
  item,
  slotIndex,
  stageHeight,
  stageWidth,
  styles,
  onPlacementChange,
}: {
  editable: boolean;
  item: WardrobeItem;
  slotIndex: number;
  stageHeight: number;
  stageWidth: number;
  styles: ReturnType<typeof createStyles>;
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}) {
  const image = resolvePreferredWardrobeVisualAsset(item).url;
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
      style={[
        styles.garmentLayer,
        editable && styles.garmentLayerEditable,
        {
          left: `${placement.x}%`,
          top: `${placement.y}%`,
          width: `${placement.width}%`,
          height: `${placement.height}%`,
          zIndex: Math.round(getLookPreviewLayer(item)),
          transform: [{ rotate: `${item.rotation || 0}deg` }],
        },
      ]}
      resizeMode="contain"
      {...(editable ? panResponder.panHandlers : {})}
    />
  );
}

function renderGarmentLayers({
  garments,
  editable,
  stageHeight,
  stageWidth,
  styles,
  onPlacementChange,
}: {
  garments: WardrobeItem[];
  editable: boolean;
  stageHeight: number;
  stageWidth: number;
  styles: ReturnType<typeof createStyles>;
  onPlacementChange?: (
    itemId: string,
    patch: Partial<Pick<WardrobeItem, 'positionOffsetX' | 'positionOffsetY' | 'scale' | 'rotation'>>,
  ) => void;
}) {
  const slotCounters = new Map<string, number>();

  return garments.map(item => {
    const slotKey = `${resolveWardrobeClothingSlot(item)}:${item.accessoryRole || ''}`;
    const slotIndex = slotCounters.get(slotKey) || 0;
    slotCounters.set(slotKey, slotIndex + 1);

    return (
      <DraggableGarmentLayer
        key={item.id}
        editable={editable}
        item={item}
        slotIndex={slotIndex}
        stageHeight={stageHeight}
        stageWidth={stageWidth}
        styles={styles}
        onPlacementChange={onPlacementChange}
      />
    );
  });
}

function clampOffset(value: number) {
  return Math.max(-18, Math.min(18, value));
}

function createStyles(theme: ThemeTokens, preset: { width: number; height: number; head: number; labelSize: number }) {
  const stageWidth = preset.width;
  const stageHeight = preset.height;

  return StyleSheet.create({
    card: {
      width: stageWidth + 22,
      backgroundColor: theme.colors.surfaceElevated,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 11,
      gap: 6,
    },
    cardEditable: {
      backgroundColor: theme.colors.card,
      borderColor: theme.colors.borderStrong,
    },
    stage: {
      width: stageWidth,
      height: stageHeight,
      position: 'relative',
      alignItems: 'center',
      justifyContent: 'flex-start',
      overflow: 'hidden',
      backgroundColor: theme.colors.surface,
      borderRadius: 18,
    },
    backGlow: {
      position: 'absolute',
      top: 28,
      alignSelf: 'center',
      width: stageWidth * 0.56,
      height: stageHeight * 0.48,
      borderRadius: 120,
      backgroundColor: theme.colors.accentSoft,
    },
    headWrap: {
      position: 'absolute',
      top: 6,
      zIndex: 30,
    },
    avatarPortraitWrap: {
      position: 'absolute',
      top: 34,
      alignSelf: 'center',
      width: stageWidth * 0.46,
      height: stageHeight * 0.66,
      borderRadius: 26,
      overflow: 'hidden',
      opacity: 0.3,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      zIndex: 4,
    },
    avatarPortraitImage: {
      width: '100%',
      height: '100%',
    },
    avatarPortraitScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(18, 22, 32, 0.36)',
    },
    avatarHead: {
      width: preset.head,
      height: preset.head,
      borderRadius: preset.head / 2,
      borderWidth: 2,
      borderColor: theme.colors.surfaceElevated,
    },
    avatarPlaceholder: {
      width: preset.head,
      height: preset.head,
      borderRadius: preset.head / 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panelStrong,
    },
    avatarPlaceholderText: {
      color: theme.colors.textSecondary,
      fontSize: 10,
      fontWeight: '700',
    },
    neck: {
      position: 'absolute',
      top: preset.head + 6,
      width: stageWidth * 0.08,
      height: stageHeight * 0.05,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.9,
    },
    shoulders: {
      position: 'absolute',
      top: preset.head + 14,
      width: stageWidth * 0.38,
      height: stageHeight * 0.17,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      borderBottomLeftRadius: 18,
      borderBottomRightRadius: 18,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.7,
    },
    waist: {
      position: 'absolute',
      top: stageHeight * 0.42,
      width: stageWidth * 0.22,
      height: stageHeight * 0.1,
      borderRadius: 24,
      backgroundColor: theme.colors.panel,
      opacity: 0.74,
    },
    hips: {
      position: 'absolute',
      top: stageHeight * 0.5,
      width: stageWidth * 0.3,
      height: stageHeight * 0.11,
      borderRadius: 28,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.66,
    },
    arm: {
      position: 'absolute',
      top: stageHeight * 0.28,
      width: stageWidth * 0.08,
      height: stageHeight * 0.28,
      borderRadius: 999,
      backgroundColor: theme.colors.panel,
      opacity: 0.5,
    },
    armLeft: {
      left: stageWidth * 0.23,
      transform: [{ rotate: '10deg' }],
    },
    armRight: {
      right: stageWidth * 0.23,
      transform: [{ rotate: '-10deg' }],
    },
    leg: {
      position: 'absolute',
      top: stageHeight * 0.61,
      width: stageWidth * 0.08,
      height: stageHeight * 0.2,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.62,
    },
    legLeft: {
      left: stageWidth * 0.4,
    },
    legRight: {
      right: stageWidth * 0.4,
    },
    foot: {
      position: 'absolute',
      bottom: 14,
      width: stageWidth * 0.11,
      height: 12,
      borderRadius: 999,
      backgroundColor: theme.colors.panel,
      opacity: 0.72,
    },
    footLeft: {
      left: stageWidth * 0.34,
    },
    footRight: {
      right: stageWidth * 0.34,
    },
    garmentLayer: {
      position: 'absolute',
    },
    garmentLayerEditable: {
      borderRadius: 12,
    },
    labelText: {
      color: theme.colors.text,
      fontSize: preset.labelSize,
      fontWeight: '800',
      textAlign: 'center',
    },
    helperText: {
      color: theme.colors.muted,
      fontSize: 11,
      textAlign: 'center',
      lineHeight: 15,
    },
  });
}
