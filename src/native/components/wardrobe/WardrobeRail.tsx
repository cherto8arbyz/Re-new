import React, { memo } from 'react';
import { Image, ImageBackground, StyleSheet, View } from 'react-native';

import { resolveWardrobeSceneAssets } from './wardrobeAssets';
import type { WardrobeStorageMode } from './types';

interface WardrobeRailProps {
  storageMode: WardrobeStorageMode;
  compact?: boolean;
  spacious?: boolean;
}

export const WardrobeRail = memo(function WardrobeRail({
  storageMode,
  compact = false,
  spacious = false,
}: WardrobeRailProps) {
  const bundle = resolveWardrobeSceneAssets(storageMode);

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <ImageBackground
        source={bundle.texture}
        resizeMode="cover"
        style={[
          styles.mountBoard,
          compact && styles.mountBoardCompact,
          spacious && styles.mountBoardSpacious,
        ]}
        imageStyle={styles.mountBoardImage}
      >
        <View style={styles.mountBoardTint} />
      </ImageBackground>
      <View
        style={[
          styles.railFrame,
          compact && styles.railFrameCompact,
          spacious && styles.railFrameSpacious,
        ]}
      >
        <Image
          source={bundle.rail}
          resizeMode="cover"
          style={styles.rail}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    height: 34,
    justifyContent: 'flex-start',
    paddingTop: 0,
  },
  wrapCompact: {
    height: 26,
  },
  mountBoard: {
    height: 18,
    marginHorizontal: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mountBoardCompact: {
    height: 14,
    marginHorizontal: 12,
  },
  mountBoardSpacious: {
    marginHorizontal: 8,
  },
  mountBoardImage: {
    borderRadius: 10,
  },
  mountBoardTint: {
    flex: 1,
    backgroundColor: 'rgba(16, 10, 11, 0.34)',
  },
  railFrame: {
    height: 10,
    marginHorizontal: 20,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: -4,
  },
  railFrameCompact: {
    height: 8,
    marginHorizontal: 18,
  },
  railFrameSpacious: {
    marginHorizontal: 14,
  },
  rail: {
    width: '100%',
    height: '100%',
    opacity: 0.98,
  },
});
