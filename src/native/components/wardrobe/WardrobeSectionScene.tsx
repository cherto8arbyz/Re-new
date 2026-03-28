import React, { memo, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
} from 'react-native';

import type { WardrobeItem } from '../../../types/models';
import type { ThemeTokens } from '../../theme';
import { HangingSection } from './HangingSection';
import { ShelfSection } from './ShelfSection';
import type { WardrobeSectionEntry } from './types';
import { WardrobeBackground } from './WardrobeBackground';
import { buildWardrobeSectionSceneRenderModel } from './wardrobeSceneRuntime.js';

interface WardrobeSectionSceneProps {
  section: WardrobeSectionEntry;
  rows: WardrobeItem[][];
  selectedItemId: string | null;
  theme: ThemeTokens;
  minHeight?: number;
  onSelect: (id: string) => void;
}

export const WardrobeSectionScene = memo(function WardrobeSectionScene({
  section,
  rows,
  selectedItemId,
  theme,
  minHeight,
  onSelect,
}: WardrobeSectionSceneProps) {
  const allItems = useMemo(() => rows.flat(), [rows]);
  const scene = useMemo(
    () => buildWardrobeSectionSceneRenderModel(section as never, allItems as never, selectedItemId),
    [allItems, section, selectedItemId],
  );
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, section.key, translateY]);

  const usesHangingLayout = scene.layout === 'hanging' || scene.layout === 'upper-rail';

  return (
    <Animated.View
      testID={`wardrobe-section-scene-${section.key}`}
      style={[
        styles.scene,
        minHeight ? { minHeight } : null,
        {
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <WardrobeBackground storageMode={section.storageMode} theme={theme}>
        <View style={styles.innerScene}>
          {usesHangingLayout ? (
            <HangingSection
              section={section}
              rows={rows}
              selectedItemId={scene.selectedItemId}
              theme={theme}
              onSelect={onSelect}
            />
          ) : (
            <ShelfSection
              section={section}
              rows={rows}
              selectedItemId={scene.selectedItemId}
              theme={theme}
              onSelect={onSelect}
            />
          )}
        </View>
      </WardrobeBackground>
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  scene: {
    minHeight: 420,
  },
  innerScene: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 20,
    paddingTop: 10,
  },
});
