import React, { memo, useMemo } from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import type { ThemeTokens } from '../../theme';
import type { WardrobeSectionEntry } from './types';
import { WardrobeBackground } from './WardrobeBackground';
import { WardrobeRail } from './WardrobeRail';
import { WardrobeShelf } from './WardrobeShelf';
import { resolveWardrobeSceneAssets } from './wardrobeAssets';
import { buildWardrobeOverviewRenderModel } from './wardrobeSceneRuntime.js';

interface WardrobeOverviewProps {
  sections: WardrobeSectionEntry[];
  activeSectionKey: string;
  theme: ThemeTokens;
  onSelect: (sectionKey: WardrobeSectionEntry['key']) => void;
}

export const WardrobeOverview = memo(function WardrobeOverview({
  sections,
  activeSectionKey,
  theme,
  onSelect,
}: WardrobeOverviewProps) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.max(150, Math.min(220, (width - 16 - 16 - 12) / 2));
  const models = useMemo(() => buildWardrobeOverviewRenderModel(sections as never), [sections]);

  return (
    <View testID="wardrobe-overview" style={styles.grid}>
      {models.map(model => {
        const active = activeSectionKey === model.key;
        const section = sections.find(entry => entry.key === model.key);

        return (
          <Pressable
            key={model.key}
            testID={`wardrobe-overview-${model.key}`}
            onPress={() => onSelect(model.key as WardrobeSectionEntry['key'])}
            style={[
              styles.card,
              {
                width: cardWidth,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                backgroundColor: active ? 'rgba(32, 22, 38, 0.86)' : theme.colors.surface,
              },
            ]}
          >
            <View style={styles.cardHead}>
              <View>
                <Text style={[styles.title, { color: theme.colors.text }]}>{model.label}</Text>
                <Text style={[styles.meta, { color: theme.colors.textSecondary }]}>
                  {model.count > 0 ? `${model.count} piece${model.count === 1 ? '' : 's'}` : 'Empty section'}
                </Text>
              </View>
              <View style={[styles.countPill, { backgroundColor: active ? theme.colors.accentSoft : theme.colors.panelStrong }]}>
                <Text style={[styles.countText, { color: active ? theme.colors.accent : theme.colors.text }]}>{model.count}</Text>
              </View>
            </View>

            <WardrobeBackground storageMode={section?.storageMode || 'overview'} theme={theme} compact>
              <OverviewMiniScene layout={model.layout} storageMode={section?.storageMode || 'overview'} />
            </WardrobeBackground>

            <Text numberOfLines={2} style={[styles.hint, { color: theme.colors.textSecondary }]}>
              {model.description}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
});

function OverviewMiniScene({
  layout,
  storageMode,
}: {
  layout: string;
  storageMode: WardrobeSectionEntry['storageMode'];
}) {
  const bundle = resolveWardrobeSceneAssets(storageMode);

  if (layout === 'hanging' || layout === 'upper-rail') {
    return (
      <View style={styles.previewScene}>
        <WardrobeRail storageMode={storageMode} compact={layout === 'upper-rail'} />
        <View style={styles.previewHangerRow}>
          {[0, 1, 2].map(index => (
            <View key={index} style={styles.previewHangerSlot}>
              <View style={styles.previewHangerRig}>
                <View style={[styles.previewHangerStem, layout === 'upper-rail' && styles.previewHangerStemCompact]} />
                <Image source={bundle.hanger} resizeMode="contain" style={[styles.previewHanger, layout === 'upper-rail' && styles.previewHangerCompact]} />
              </View>
              <View style={[styles.previewGarment, layout === 'upper-rail' && styles.previewHat]} />
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (layout === 'drawer-tray' || layout === 'accessory-tray') {
    return (
      <View style={styles.previewScene}>
        <WardrobeShelf storageMode={storageMode} compact />
        <View style={styles.previewTrayRow}>
          {[0, 1, 2].map(index => (
            <View key={index} style={[styles.previewCompactItem, layout === 'accessory-tray' && styles.previewAccessory]} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.previewScene}>
      <WardrobeShelf storageMode={storageMode} compact />
      <View style={styles.previewShelfRow}>
        {[0, 1].map(index => (
          <View key={index} style={[styles.previewGarment, layout === 'shoe-shelf' && styles.previewShoe]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
  },
  meta: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 16,
  },
  countPill: {
    minWidth: 36,
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 13,
    fontWeight: '900',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
  },
  previewScene: {
    flex: 1,
    justifyContent: 'flex-start',
    gap: 8,
  },
  previewHangerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: -4,
  },
  previewHangerSlot: {
    flex: 1,
    alignItems: 'center',
  },
  previewHangerRig: {
    alignItems: 'center',
    marginBottom: -6,
  },
  previewHangerStem: {
    width: 2,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(194, 201, 214, 0.88)',
    marginBottom: -1,
  },
  previewHangerStemCompact: {
    height: 5,
  },
  previewHanger: {
    width: 40,
    height: 30,
  },
  previewHangerCompact: {
    width: 30,
    height: 22,
  },
  previewGarment: {
    width: '100%',
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(236, 241, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewHat: {
    height: 34,
    borderRadius: 999,
  },
  previewShelfRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 6,
  },
  previewShoe: {
    height: 34,
    borderRadius: 14,
  },
  previewTrayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 8,
  },
  previewCompactItem: {
    flex: 1,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(236, 241, 255, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  previewAccessory: {
    height: 32,
    borderRadius: 12,
  },
});
