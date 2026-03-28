import React, { memo } from 'react';
import {
  Image,
  ImageBackground,
  StyleSheet,
  View,
} from 'react-native';

import type { ThemeTokens } from '../../theme';
import { resolveWardrobeSceneAssets } from './wardrobeAssets';
import type { WardrobeStorageMode } from './types';

interface WardrobeBackgroundProps {
  storageMode: WardrobeStorageMode;
  theme: ThemeTokens;
  compact?: boolean;
  children?: React.ReactNode;
  testID?: string;
}

export const WardrobeBackground = memo(function WardrobeBackground({
  storageMode,
  theme,
  compact = false,
  children,
  testID,
}: WardrobeBackgroundProps) {
  const bundle = resolveWardrobeSceneAssets(storageMode);

  return (
    <View
      testID={testID}
      style={[
        styles.frame,
        compact ? styles.frameCompact : styles.frameFull,
        { borderColor: theme.colors.borderStrong },
      ]}
    >
      <ImageBackground
        source={bundle.gradient}
        resizeMode="cover"
        style={styles.backdrop}
        imageStyle={[styles.imageRound, compact && styles.imageRoundCompact]}
      >
        <Image
          source={bundle.texture}
          resizeMode="cover"
          style={[
            StyleSheet.absoluteFill,
            styles.textureLayer,
            { opacity: compact ? bundle.textureOpacity * 0.8 : bundle.textureOpacity },
          ]}
        />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: bundle.tint }]} />
        <View style={styles.vignetteTop} />
        <View style={styles.vignetteBottom} />
        <View style={[styles.glowOrbA, { backgroundColor: theme.colors.accentSoft }]} />
        <View style={[styles.glowOrbB, { backgroundColor: theme.colors.panelStrong }]} />
        <View style={styles.topBoard} />
        {!compact ? (
          <>
            <View style={styles.sidePanelLeft} />
            <View style={styles.sidePanelRight} />
          </>
        ) : null}
        <View style={[styles.content, compact && styles.contentCompact]}>{children}</View>
      </ImageBackground>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: '#121722',
  },
  frameFull: {
    borderRadius: 32,
    minHeight: 420,
  },
  frameCompact: {
    borderRadius: 24,
    minHeight: 150,
  },
  backdrop: {
    width: '100%',
    minHeight: '100%',
  },
  imageRound: {
    borderRadius: 32,
  },
  imageRoundCompact: {
    borderRadius: 24,
  },
  textureLayer: {
    transform: [{ scale: 1.08 }],
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '18%',
    backgroundColor: 'rgba(8, 9, 14, 0.34)',
  },
  vignetteBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '22%',
    backgroundColor: 'rgba(5, 6, 10, 0.44)',
  },
  glowOrbA: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 999,
    right: -42,
    top: -24,
    opacity: 0.34,
  },
  glowOrbB: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 999,
    left: -44,
    bottom: -62,
    opacity: 0.28,
  },
  topBoard: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 16,
    backgroundColor: 'rgba(14, 18, 26, 0.84)',
  },
  sidePanelLeft: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    left: 0,
    width: 18,
    backgroundColor: 'rgba(13, 16, 24, 0.42)',
  },
  sidePanelRight: {
    position: 'absolute',
    top: 18,
    bottom: 18,
    right: 0,
    width: 18,
    backgroundColor: 'rgba(13, 16, 24, 0.42)',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    gap: 12,
  },
  contentCompact: {
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 12,
    gap: 8,
  },
});
