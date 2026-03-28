import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppContext } from '../context/AppContext';
import { theme } from '../theme';

export function HistoryScreen() {
  const { state } = useAppContext();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>Saved looks</Text>
        {state.savedLooks.length === 0 ? (
          <Text style={styles.empty}>No saved looks yet.</Text>
        ) : (
          state.savedLooks.map(entry => (
            <View key={entry.id} style={styles.card}>
              <Text style={styles.cardTitle}>{entry.outfit.styleName || entry.outfit.name}</Text>
              <Text style={styles.cardMeta}>{entry.date} · {entry.source}</Text>
              <Text style={styles.cardItems}>
                {entry.outfit.garments.map(item => item.title).join(', ')}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: theme.spacing.xl,
  },
  panel: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  title: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: '800',
  },
  empty: {
    color: theme.colors.muted,
  },
  card: {
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.sm,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  cardMeta: {
    color: theme.colors.muted,
    textTransform: 'capitalize',
  },
  cardItems: {
    color: theme.colors.text,
    lineHeight: 20,
  },
});
