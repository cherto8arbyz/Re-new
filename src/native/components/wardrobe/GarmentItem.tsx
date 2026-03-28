import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { getWardrobeItemShortTitle, selectBestImageUri } from '../../../shared/wardrobe';
import type { WardrobeItem } from '../../../types/models';
import type { ThemeTokens } from '../../theme';
import type { WardrobeStorageMode } from './types';

interface GarmentItemProps {
  item: WardrobeItem;
  storageMode: WardrobeStorageMode;
  theme: ThemeTokens;
  selected: boolean;
  compact?: boolean;
  labelLines?: number;
  hangingOffset?: number;
  onPress: (id: string) => void;
}

export const GarmentItem = memo(function GarmentItem({
  item,
  storageMode,
  theme,
  selected,
  compact = false,
  labelLines = 2,
  hangingOffset = 0,
  onPress,
}: GarmentItemProps) {
  const imageUri = useMemo(() => selectBestImageUri(item), [item]);
  const emphasis = useRef(new Animated.Value(selected ? 1 : 0)).current;
  const isHanging = storageMode === 'hanger' || storageMode === 'headwear-rail';

  useEffect(() => {
    Animated.spring(emphasis, {
      toValue: selected ? 1 : 0,
      tension: 120,
      friction: 14,
      useNativeDriver: true,
    }).start();
  }, [emphasis, selected]);

  const animatedStyle = {
    transform: [
      {
        translateY: emphasis.interpolate({
          inputRange: [0, 1],
          outputRange: [0, -6 - hangingOffset],
        }),
      },
      {
        scale: emphasis.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.025],
        }),
      },
    ],
  } as const;

  return (
    <Pressable
      onPress={() => onPress(item.id)}
      testID={`wardrobe-garment-${item.id}`}
      style={[styles.pressable, isHanging && styles.pressableHanging]}
    >
      <Animated.View style={animatedStyle}>
        <View
          style={[
            styles.assetFrame,
            isHanging && styles.assetFrameHanging,
            compact ? styles.assetFrameCompact : styles.assetFrameRegular,
            {
              borderColor: selected ? theme.colors.accent : 'transparent',
              borderWidth: selected ? 1 : 0,
              backgroundColor: 'transparent',
            },
          ]}
        >
          {selected ? (
            <View
              style={[
                styles.selectionGlow,
                { backgroundColor: theme.colors.accentSoft },
              ]}
            />
          ) : null}
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              resizeMode="contain"
              style={[
                styles.assetImage,
                isHanging && styles.assetImageHanging,
                compact && styles.assetImageCompact,
                compact && isHanging && styles.assetImageHangingCompact,
              ]}
            />
          ) : (
            <View style={styles.assetFallback} />
          )}
        </View>
        <Text
          numberOfLines={labelLines}
          style={[
            styles.label,
            isHanging && styles.labelHanging,
            compact && styles.labelCompact,
            { color: theme.colors.text },
          ]}
        >
          {getWardrobeItemShortTitle(item)}
        </Text>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  pressable: {
    width: '100%',
  },
  pressableHanging: {
    position: 'relative',
    zIndex: 3,
  },
  assetFrame: {
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  assetFrameRegular: {
    minHeight: 164,
    borderRadius: 26,
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  assetFrameHanging: {
    marginTop: -28,
  },
  assetFrameCompact: {
    minHeight: 92,
    borderRadius: 22,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  selectionGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    top: 12,
    opacity: 0.16,
  },
  assetImage: {
    width: '100%',
    height: 148,
  },
  assetImageHanging: {
    width: '90%',
    height: 182,
  },
  assetImageCompact: {
    height: 76,
  },
  assetImageHangingCompact: {
    width: '92%',
    height: 90,
  },
  assetFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  label: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    textAlign: 'center',
    minHeight: 30,
  },
  labelHanging: {
    marginTop: 1,
  },
  labelCompact: {
    fontSize: 11,
    lineHeight: 15,
    minHeight: 24,
  },
});
