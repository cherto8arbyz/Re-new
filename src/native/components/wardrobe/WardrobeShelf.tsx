import React, { memo } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

import { resolveWardrobeSceneAssets } from './wardrobeAssets';
import type { WardrobeStorageMode } from './types';

interface WardrobeShelfProps {
  storageMode: WardrobeStorageMode;
  compact?: boolean;
}

export const WardrobeShelf = memo(function WardrobeShelf({
  storageMode,
  compact = false,
}: WardrobeShelfProps) {
  const bundle = resolveWardrobeSceneAssets(storageMode);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <ImageBackground source={bundle.texture} resizeMode="cover" style={[styles.board, compact && styles.boardCompact]} imageStyle={styles.boardImage}>
        <View style={styles.boardTint} />
      </ImageBackground>
      <View style={[styles.lip, compact && styles.lipCompact]} />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    height: 26,
    justifyContent: 'center',
  },
  wrapCompact: {
    height: 22,
  },
  board: {
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  boardCompact: {
    height: 10,
  },
  boardImage: {
    borderRadius: 999,
  },
  boardTint: {
    flex: 1,
    backgroundColor: 'rgba(16, 11, 10, 0.28)',
  },
  lip: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 16,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(33, 25, 21, 0.82)',
  },
  lipCompact: {
    top: 13,
    height: 3,
  },
});
