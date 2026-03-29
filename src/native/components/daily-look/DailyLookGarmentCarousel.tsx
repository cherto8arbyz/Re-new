import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { WardrobeItem } from '../../../types/models';
import type { ThemeTokens } from '../../theme';
import { getDailyLookGarmentCaption, resolveDailyLookStorageMode } from '../../screens/daily-look.logic';
import { GarmentItem } from '../wardrobe/GarmentItem';

const CARD_WIDTH = 162;
const CARD_SPACING = 12;

export function DailyLookGarmentCarousel({
  items,
  theme,
}: {
  items: WardrobeItem[];
  theme: ThemeTokens;
}) {
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Pieces used in this look</Text>
      <FlatList
        horizontal
        data={items}
        keyExtractor={item => item.id}
        showsHorizontalScrollIndicator={false}
        snapToAlignment="start"
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        contentContainerStyle={styles.content}
        testID="daily-look-garment-carousel"
        renderItem={({ item }) => (
          <View style={styles.card}>
            <GarmentItem
              item={item}
              storageMode={resolveDailyLookStorageMode(item)}
              theme={theme}
              selected
              compact
              labelLines={2}
              onPress={() => {}}
            />
            <Text numberOfLines={2} style={styles.caption}>
              {getDailyLookGarmentCaption(item)}
            </Text>
          </View>
        )}
      />
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    root: {
      gap: theme.spacing.xs,
    },
    title: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    content: {
      gap: CARD_SPACING,
      paddingRight: theme.spacing.sm,
    },
    card: {
      width: CARD_WIDTH,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.sm,
      gap: theme.spacing.xs,
    },
    caption: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      minHeight: 32,
    },
  });
}
