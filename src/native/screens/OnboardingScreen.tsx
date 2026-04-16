import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useAppContext } from '../context/AppContext';
import { pickImageAssetAsync, type PickedImageAsset } from '../services/image-picker';
import { generateLookFaceAssetAsync } from '../services/look-face';
import { theme } from '../theme';
import { AVATAR_GENDERS, STYLE_PREFERENCES } from '../../types/models';
import { buildOnboardingAction } from '../state/app-reducer';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen(_: Props) {
  const { state, dispatch } = useAppContext();
  const [name, setName] = useState('');
  const [style, setStyle] = useState<(typeof STYLE_PREFERENCES)[number]>('casual');
  const [avatarGender, setAvatarGender] = useState<(typeof AVATAR_GENDERS)[number]>('female');
  const [avatarAsset, setAvatarAsset] = useState<PickedImageAsset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length > 0 && Boolean(avatarAsset?.uri) && !submitting;

  const handlePickAvatar = async () => {
    const asset = await pickImageAssetAsync('library');
    if (!asset) {
      setError('Photo access was not granted or no image was selected.');
      return;
    }
    setAvatarAsset(asset);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Name and avatar are required.');
      return;
    }

    if (!avatarAsset) return;

    setSubmitting(true);
    setError(null);

    const lookFace = await generateLookFaceAssetAsync(avatarAsset);

    dispatch(buildOnboardingAction({
      session: state.authSession,
      name,
      style,
      avatarUrl: avatarAsset.uri,
      avatarGender,
      ...(lookFace.success ? { lookFaceAssetUrl: lookFace.imageDataUrl } : {}),
    }));
    if (!lookFace.success) {
      setError('Avatar base could not be generated yet. You can refresh it later from Profile.');
    }
    setSubmitting(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.logo}>Re:new</Text>
        <Text style={styles.title}>Smart wardrobe, native foundation</Text>
        <Text style={styles.subtitle}>
          This staged Expo migration keeps the onboarding, avatar, and wardrobe core intact while moving product logic into TypeScript.
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Enter your name"
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Style preference</Text>
          <View style={styles.styleGrid}>
            {STYLE_PREFERENCES.map(item => (
              <Pressable
                key={item}
                onPress={() => setStyle(item)}
                style={[styles.styleChip, style === item && styles.styleChipActive]}
              >
                <Text style={[styles.styleText, style === item && styles.styleTextActive]}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Avatar gender</Text>
          <View style={styles.genderGrid}>
            {AVATAR_GENDERS.map(item => (
              <Pressable
                key={item}
                onPress={() => setAvatarGender(item)}
                style={[styles.genderChip, avatarGender === item && styles.genderChipActive]}
              >
                <Text style={[styles.genderText, avatarGender === item && styles.genderTextActive]}>
                  {item === 'male' ? 'Male' : 'Female'}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Avatar upload</Text>
          <Pressable onPress={handlePickAvatar} style={styles.avatarPicker}>
            {avatarAsset?.uri ? (
              <Image source={{ uri: avatarAsset.uri }} style={styles.avatarPreview} />
            ) : (
              <Text style={styles.avatarPlaceholder}>Choose profile photo</Text>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={() => void handleSubmit()} disabled={!canSubmit} style={[styles.submit, !canSubmit && styles.submitDisabled]}>
          {submitting ? <ActivityIndicator size="small" color={theme.colors.accentContrast} /> : null}
          <Text style={styles.submitText}>{submitting ? 'Building avatar...' : 'Create My Wardrobe'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  container: {
    padding: theme.spacing.lg,
    gap: theme.spacing.lg,
  },
  logo: {
    fontSize: 34,
    fontWeight: '800',
    color: theme.colors.text,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.text,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.muted,
  },
  field: {
    gap: theme.spacing.sm,
  },
  label: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: theme.colors.text,
    fontSize: 16,
  },
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  genderGrid: {
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  styleChip: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  styleChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  styleText: {
    color: theme.colors.text,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  styleTextActive: {
    color: theme.colors.accentContrast,
  },
  genderChip: {
    flex: 1,
    minHeight: 46,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 999,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  genderChipActive: {
    backgroundColor: theme.colors.accent,
    borderColor: theme.colors.accent,
  },
  genderText: {
    color: theme.colors.text,
    fontWeight: '700',
  },
  genderTextActive: {
    color: theme.colors.accentContrast,
  },
  avatarPicker: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: 'hidden',
  },
  avatarPreview: {
    width: '100%',
    height: 220,
  },
  avatarPlaceholder: {
    color: theme.colors.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  error: {
    color: theme.colors.danger,
    fontSize: 14,
  },
  submit: {
    backgroundColor: theme.colors.accent,
    borderRadius: theme.radius.md,
    paddingVertical: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: theme.colors.accentContrast,
    fontWeight: '700',
    fontSize: 16,
  },
});
