import React, { useMemo } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import type { WeatherModel } from '../../types/models';
import { type ThemeTokens } from '../theme';

interface DayWeatherCarouselProps {
  selectedDate: string;
  onChangeDate: (date: string) => void;
  theme: ThemeTokens;
  city?: string;
  weather?: WeatherModel | null;
}

const MOCK_SEQUENCE = [
  { temp: 16, feelsLike: 15, icon: 'partly-sunny-outline', label: 'Soft sun' },
  { temp: 14, feelsLike: 12, icon: 'cloud-outline', label: 'Cloudy' },
  { temp: 12, feelsLike: 9, icon: 'rainy-outline', label: 'Light rain' },
  { temp: 18, feelsLike: 19, icon: 'sunny-outline', label: 'Bright' },
  { temp: 10, feelsLike: 7, icon: 'thunderstorm-outline', label: 'Windy' },
  { temp: 8, feelsLike: 5, icon: 'snow-outline', label: 'Cold' },
] as const;

export function DayWeatherCarousel({
  selectedDate,
  onChangeDate,
  theme,
  city = '',
  weather = null,
}: DayWeatherCarouselProps) {
  const styles = useMemo(() => createStyles(theme), [theme]);
  const summary = useMemo(() => buildWeatherSummary(selectedDate, weather), [selectedDate, weather]);

  return (
    <View style={styles.bar}>
      <Pressable
        onPress={() => onChangeDate(addDays(selectedDate, -1))}
        style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
      >
        <Ionicons name="chevron-back" size={16} color={theme.colors.accent} />
      </Pressable>

      <View style={styles.summary}>
        <View style={styles.metaRow}>
          <Text numberOfLines={1} style={styles.dateLabel}>
            {`${summary.relativeLabel} · ${summary.dayLabel}`}
          </Text>
          <View style={styles.locationWrap}>
            <Ionicons name={summary.icon} size={14} color={theme.colors.accent} />
            <Text numberOfLines={1} style={styles.cityLabel}>
              {city.trim() || 'Your city'}
            </Text>
          </View>
        </View>

        <View style={styles.detailsRow}>
          <Text style={styles.temperature}>{`${summary.temp}°`}</Text>
          <Text numberOfLines={1} style={styles.condition}>{summary.label}</Text>
          <Text numberOfLines={1} style={styles.feelsLike}>{`Feels like ${summary.feelsLike}°`}</Text>
        </View>
      </View>

      <Pressable
        onPress={() => onChangeDate(addDays(selectedDate, 1))}
        style={({ pressed }) => [styles.navButton, pressed && styles.navButtonPressed]}
      >
        <Ionicons name="chevron-forward" size={16} color={theme.colors.accent} />
      </Pressable>
    </View>
  );
}

function buildWeatherSummary(selectedDate: string, weather: WeatherModel | null) {
  const safeDate = isValidDateString(selectedDate) ? selectedDate : new Date().toISOString().slice(0, 10);
  const template = MOCK_SEQUENCE[Math.abs(getDayNumber(safeDate)) % MOCK_SEQUENCE.length] || MOCK_SEQUENCE[0];
  const temp = weather?.temperature ?? template.temp;
  const label = weather?.condition
    ? formatCondition(weather.condition)
    : template.label;
  const icon = iconForCondition(weather?.condition || inferConditionFromIcon(template.icon));
  const feelsLike = weather?.temperature != null
    ? Math.round(weather.temperature + estimateFeelsLikeOffset(weather))
    : template.feelsLike;

  return {
    temp,
    feelsLike,
    label,
    icon,
    dayLabel: formatDay(safeDate),
    relativeLabel: relativeDayLabel(safeDate),
  };
}

function estimateFeelsLikeOffset(weather: WeatherModel): number {
  if (weather.condition === 'wind') return -2;
  if (weather.condition === 'rain' || weather.condition === 'snow') return -3;
  if (weather.condition === 'clear') return 1;
  return 0;
}

function formatCondition(condition: WeatherModel['condition']): string {
  switch (condition) {
    case 'clear':
      return 'Clear';
    case 'cloudy':
      return 'Cloudy';
    case 'rain':
      return 'Rain';
    case 'snow':
      return 'Snow';
    case 'wind':
      return 'Windy';
    default:
      return 'Weather';
  }
}

function iconForCondition(condition: WeatherModel['condition']): keyof typeof Ionicons.glyphMap {
  switch (condition) {
    case 'clear':
      return 'sunny-outline';
    case 'cloudy':
      return 'cloud-outline';
    case 'rain':
      return 'rainy-outline';
    case 'snow':
      return 'snow-outline';
    case 'wind':
      return 'thunderstorm-outline';
    default:
      return 'partly-sunny-outline';
  }
}

function inferConditionFromIcon(icon: string): WeatherModel['condition'] {
  if (icon.includes('rain')) return 'rain';
  if (icon.includes('snow')) return 'snow';
  if (icon.includes('thunder')) return 'wind';
  if (icon.includes('cloud')) return 'cloudy';
  if (icon.includes('sunny')) return 'clear';
  return 'unknown';
}

function addDays(date: string, delta: number): string {
  const safeDate = isValidDateString(date) ? date : new Date().toISOString().slice(0, 10);
  const base = new Date(`${safeDate}T12:00:00`);
  base.setDate(base.getDate() + delta);
  return base.toISOString().slice(0, 10);
}

function formatDay(date: string): string {
  const safeDate = isValidDateString(date) ? date : new Date().toISOString().slice(0, 10);
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${safeDate}T12:00:00`));
  } catch {
    return safeDate;
  }
}

function relativeDayLabel(date: string): string {
  const delta = getDayNumber(date) - getDayNumber(new Date().toISOString().slice(0, 10));
  if (delta === 0) return 'Today';
  if (delta === 1) return 'Tomorrow';
  if (delta === -1) return 'Yesterday';
  return delta > 0 ? `In ${delta} days` : `${Math.abs(delta)} days ago`;
}

function getDayNumber(date: string): number {
  const safeDate = isValidDateString(date) ? date : new Date().toISOString().slice(0, 10);
  return Math.floor(new Date(`${safeDate}T12:00:00`).getTime() / 86400000);
}

function isValidDateString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.xs,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    navButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
    },
    navButtonPressed: {
      backgroundColor: theme.colors.accentMuted,
      borderColor: theme.colors.accent,
    },
    summary: {
      flex: 1,
      gap: 3,
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.xs,
    },
    dateLabel: {
      flex: 1,
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    locationWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '42%',
    },
    cityLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    detailsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    temperature: {
      color: theme.colors.text,
      fontSize: 22,
      lineHeight: 24,
      fontWeight: '900',
    },
    condition: {
      flexShrink: 1,
      color: theme.colors.textSecondary,
      fontSize: 13,
      fontWeight: '700',
    },
    feelsLike: {
      flexShrink: 1,
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '700',
    },
  });
}
