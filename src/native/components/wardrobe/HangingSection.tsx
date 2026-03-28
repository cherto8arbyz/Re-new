import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import type { WardrobeItem } from '../../../types/models';
import type { ThemeTokens } from '../../theme';
import { resolveWardrobeSceneAssets } from './wardrobeAssets';
import { GarmentItem } from './GarmentItem';
import { WardrobeRail } from './WardrobeRail';
import type { WardrobeSectionEntry } from './types';

interface HangingSectionProps {
  section: WardrobeSectionEntry;
  rows: WardrobeItem[][];
  selectedItemId: string | null;
  theme: ThemeTokens;
  onSelect: (id: string) => void;
}

export const HangingSection = memo(function HangingSection({
  section,
  rows,
  selectedItemId,
  theme,
  onSelect,
}: HangingSectionProps) {
  const compact = section.storageMode === 'headwear-rail';
  const spacious = section.key === 'outerwear';
  const bundle = resolveWardrobeSceneAssets(section.storageMode);
  const slotStyle = compact
    ? styles.slotCompact
    : spacious
      ? styles.slotSpacious
      : styles.slotRegular;

  return (
    <View testID="wardrobe-hanging-section" style={styles.stack}>
      {rows.map((row, rowIndex) => (
        <View key={`${section.key}-${rowIndex}`} style={styles.rowBlock}>
          <WardrobeRail storageMode={section.storageMode} compact={compact} spacious={spacious} />
          <View
            style={[
              styles.itemRow,
              styles.itemRowMounted,
              compact && styles.itemRowCompact,
              spacious && styles.itemRowSpacious,
            ]}
          >
            {row.map(item => (
              <View key={item.id} style={[styles.slot, slotStyle]}>
                <View style={styles.hangerRig}>
                  <View style={[styles.hangerStem, compact && styles.hangerStemCompact]} />
                  <Image
                    source={bundle.hanger}
                    resizeMode="contain"
                    style={[styles.hanger, compact && styles.hangerCompact]}
                  />
                </View>
                <GarmentItem
                  item={item}
                  storageMode={section.storageMode}
                  theme={theme}
                  selected={item.id === selectedItemId}
                  compact={compact}
                  labelLines={compact ? 1 : 2}
                  hangingOffset={0}
                  onPress={onSelect}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  stack: {
    gap: 26,
  },
  rowBlock: {
    gap: 8,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-evenly',
    gap: 18,
    paddingHorizontal: 6,
  },
  itemRowMounted: {
    marginTop: -18,
  },
  itemRowCompact: {
    gap: 12,
    marginTop: -12,
  },
  itemRowSpacious: {
    gap: 24,
  },
  slot: {
    alignItems: 'center',
  },
  slotRegular: {
    width: '42%',
    flexGrow: 0,
    flexShrink: 0,
  },
  slotSpacious: {
    width: '40%',
    flexGrow: 0,
    flexShrink: 0,
  },
  slotCompact: {
    width: '29%',
    flexGrow: 0,
    flexShrink: 0,
  },
  hangerRig: {
    alignItems: 'center',
    marginBottom: -52,
    zIndex: 1,
    position: 'relative',
  },
  hangerStem: {
    width: 2,
    height: 20,
    borderRadius: 999,
    backgroundColor: 'rgba(178, 184, 198, 0.92)',
    marginBottom: -2,
  },
  hangerStemCompact: {
    height: 14,
  },
  hanger: {
    width: 90,
    height: 70,
    opacity: 1,
  },
  hangerCompact: {
    width: 60,
    height: 44,
  },
});
