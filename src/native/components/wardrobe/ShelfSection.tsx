import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { WardrobeItem } from '../../../types/models';
import type { ThemeTokens } from '../../theme';
import { GarmentItem } from './GarmentItem';
import { WardrobeShelf } from './WardrobeShelf';
import type { WardrobeSectionEntry } from './types';

interface ShelfSectionProps {
  section: WardrobeSectionEntry;
  rows: WardrobeItem[][];
  selectedItemId: string | null;
  theme: ThemeTokens;
  onSelect: (id: string) => void;
}

export const ShelfSection = memo(function ShelfSection({
  section,
  rows,
  selectedItemId,
  theme,
  onSelect,
}: ShelfSectionProps) {
  const compact = section.storageMode === 'drawer' || section.storageMode === 'accessory-hooks' || section.storageMode === 'shoe-shelf';
  const tray = section.storageMode === 'drawer' || section.storageMode === 'accessory-hooks';

  return (
    <View testID="wardrobe-shelf-section" style={styles.stack}>
      {rows.map((row, rowIndex) => (
        <View key={`${section.key}-${rowIndex}`} style={styles.rowBlock}>
          <WardrobeShelf storageMode={section.storageMode} compact={compact} />
          <View style={[styles.itemRow, compact && styles.itemRowCompact]}>
            {row.map(item => (
              <View
                key={item.id}
                style={[
                  styles.slot,
                  tray && styles.slotTray,
                  section.storageMode === 'shoe-shelf' && styles.slotShoe,
                ]}
              >
                <GarmentItem
                  item={item}
                  storageMode={section.storageMode}
                  theme={theme}
                  selected={item.id === selectedItemId}
                  compact={compact}
                  labelLines={1}
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
    gap: 18,
  },
  rowBlock: {
    gap: 10,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 14,
  },
  itemRowCompact: {
    gap: 10,
  },
  slot: {
    flex: 1,
  },
  slotTray: {
    alignSelf: 'stretch',
  },
  slotShoe: {
    justifyContent: 'flex-end',
  },
});

