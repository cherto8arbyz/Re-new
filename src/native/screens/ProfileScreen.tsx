import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { OutfitPreviewCanvas } from '../components/OutfitPreviewCanvas';
import { useAppContext } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/types';
import { pickImageAssetAsync } from '../services/image-picker';
import { generateLookFaceAssetAsync } from '../services/look-face';
import { resolveAvatarPreviewUrl } from '../../shared/look-preview';
import {
  PROFILE_BIO_MAX_LENGTH,
  PROFILE_BIO_MAX_LINES,
  normalizeCustomAccentHex,
  normalizeProfileBio,
} from '../../shared/profile';
import { ACCENT_PALETTE_OPTIONS, type ThemeTokens } from '../theme';

const BIO_INPUT_HEIGHT = 124;
const CUSTOM_ACCENT_SWATCHES = [
  '#FF88E7', '#F66AC2', '#C35BFF', '#9B7BFF', '#78B7FF', '#4D93FF',
  '#5ED9FF', '#73E1BF', '#4FD7A7', '#38C9B4', '#C7F36B', '#94E05D',
  '#FFE36E', '#FFC85A', '#FFB26B', '#FF9A7D', '#FF7B6B', '#F45B69',
  '#E04747', '#B85C3A', '#9F7A5B', '#7C879A', '#5B6275', '#FFFFFF',
  '#D8D0C5', '#A890FF', '#7BE4D7', '#66C2A5', '#F98F6F', '#F36F96',
] as const;

export function ProfileScreen() {
  const { state, dispatch, theme } = useAppContext();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const profile = state.user;
  const profileName = String(profile?.name || '').trim() || 'User';
  const profileBio = typeof profile?.bio === 'string' ? profile.bio : '';
  const profileStyle = formatProfileStyle(profile?.style);
  const avatarGender = profile?.avatarGender || 'female';
  const identityReferenceCount = profile?.identityReferenceUrls?.length || 0;
  const generatedAvatarUrl = resolveAvatarPreviewUrl(profile);
  const savedLooks = state.savedLooks.filter(entry => entry && entry.outfit);

  const [settingsMenuVisible, setSettingsMenuVisible] = useState(false);
  const [outfitsVisible, setOutfitsVisible] = useState(false);
  const [stylizationVisible, setStylizationVisible] = useState(false);
  const [paletteVisible, setPaletteVisible] = useState(false);
  const [hexDraft, setHexDraft] = useState(state.customAccentColor || theme.colors.accent);
  const [avatarUpdating, setAvatarUpdating] = useState(false);
  const [avatarStatusText, setAvatarStatusText] = useState('');

  const accentPreview = state.accentPalette === 'custom' && state.customAccentColor
    ? state.customAccentColor
    : theme.colors.accent;
  const normalizedHexDraft = normalizeCustomAccentHex(hexDraft);

  useEffect(() => {
    setHexDraft(accentPreview);
  }, [accentPreview]);

  const handleChangeAvatar = async () => {
    const asset = await pickImageAssetAsync('library');
    if (!asset) return;

    setAvatarUpdating(true);
    setAvatarStatusText('');
    const previousGeneratedAvatarUrl = resolveAvatarPreviewUrl(profile);
    const lookFace = await generateLookFaceAssetAsync(asset);
    dispatch({
      type: 'SET_PROFILE_AVATAR_ASSETS',
      payload: {
        avatarUrl: asset.uri,
        ...(lookFace.success ? { lookFaceAssetUrl: lookFace.imageDataUrl } : {}),
      },
    });
    setAvatarStatusText(
      lookFace.success
        ? 'Avatar base updated for Looks.'
        : previousGeneratedAvatarUrl
          ? 'Profile photo changed. Previous avatar base was kept.'
          : 'Profile photo changed. Avatar base is still missing.',
    );
    setAvatarUpdating(false);
  };

  const applyCustomAccent = (value: string | null) => {
    if (!value) return;
    dispatch({ type: 'SET_CUSTOM_ACCENT_COLOR', payload: value });
  };

  const closeStylization = () => {
    setStylizationVisible(false);
    setPaletteVisible(false);
  };

  if (!profile) {
    return (
      <View style={styles.emptyPanel}>
        <Text style={styles.emptyText}>Profile details appear here after onboarding.</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerCard}>
          <View style={styles.profileRow}>
            <View style={styles.identityColumn}>
              {profile.avatarUrl ? (
                <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarPlaceholder]}>
                  <Text style={styles.avatarInitial}>{profileName.slice(0, 1).toUpperCase()}</Text>
                </View>
              )}

              <Text numberOfLines={1} style={styles.name}>
                {profileName}
              </Text>
              <Text style={styles.meta}>{`${profileStyle} / ${formatAvatarGender(avatarGender)}`}</Text>
              <Text style={styles.metaSecondary}>{generatedAvatarUrl ? 'Avatar base ready' : 'Avatar base missing'}</Text>
              <Text style={styles.metaSecondary}>{`Identity ${identityReferenceCount}/5`}</Text>

              <Pressable
                onPress={() => void handleChangeAvatar()}
                style={[styles.avatarAction, avatarUpdating && styles.avatarActionDisabled]}
                disabled={avatarUpdating}
              >
                {avatarUpdating ? (
                  <ActivityIndicator size="small" color={theme.colors.accent} />
                ) : (
                  <Ionicons name="image-outline" size={12} color={theme.colors.accent} />
                )}
                <Text style={styles.avatarActionText}>{avatarUpdating ? 'Updating' : 'Change'}</Text>
              </Pressable>
            </View>

            <View style={styles.bioColumn}>
              <Text style={styles.bioLabel}>About me</Text>
              <TextInput
                value={profileBio}
                onChangeText={text => dispatch({ type: 'SET_PROFILE_BIO', payload: normalizeProfileBio(text) })}
                multiline
                scrollEnabled={false}
                numberOfLines={PROFILE_BIO_MAX_LINES}
                maxLength={PROFILE_BIO_MAX_LENGTH}
                style={styles.bioInput}
              />
            </View>
          </View>
        </View>

        <View style={styles.actionStack}>
          {avatarStatusText ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{avatarStatusText}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => navigation.navigate('IdentityCapture')}
            style={styles.primaryActionButton}
          >
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentContrast} />
            <Text style={styles.primaryActionText}>
              {identityReferenceCount >= 5 ? 'Identity Ready (5/5)' : `Capture Identity (${identityReferenceCount}/5)`}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setSettingsMenuVisible(true)}
            style={styles.secondaryActionButton}
          >
            <Ionicons name="settings-outline" size={18} color={theme.colors.text} />
            <Text style={styles.secondaryActionText}>Settings</Text>
          </Pressable>

          <Pressable
            onPress={() => setOutfitsVisible(true)}
            style={styles.secondaryActionButton}
          >
            <Ionicons name="bookmark-outline" size={18} color={theme.colors.text} />
            <Text style={styles.secondaryActionText}>My Outfits</Text>
          </Pressable>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        transparent
        visible={settingsMenuVisible}
        onRequestClose={() => setSettingsMenuVisible(false)}
      >
        <View style={[styles.modalRoot, styles.menuModalRoot]}>
          <Pressable style={styles.modalBackdrop} onPress={() => setSettingsMenuVisible(false)} />

          <View style={[styles.menuCard, styles.menuCardFloating]}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHeaderCopy}>
                <Text style={styles.menuTitle}>Settings</Text>
                <Text style={styles.menuSubtitle}>Pick a settings section.</Text>
              </View>
              <Pressable onPress={() => setSettingsMenuVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.settingsBlock}>
              <Text style={styles.groupLabel}>Avatar gender</Text>
              <Text style={styles.groupHint}>Affects avatar generation and daily look rendering.</Text>
              <View style={styles.themeToggle}>
                <Pressable
                  onPress={() => dispatch({ type: 'SET_PROFILE_AVATAR_GENDER', payload: 'female' })}
                  style={[styles.themeChip, avatarGender === 'female' && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, avatarGender === 'female' && styles.themeChipTextActive]}>
                    Female
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => dispatch({ type: 'SET_PROFILE_AVATAR_GENDER', payload: 'male' })}
                  style={[styles.themeChip, avatarGender === 'male' && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, avatarGender === 'male' && styles.themeChipTextActive]}>
                    Male
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.menuList}>
              <Pressable
                onPress={() => {
                  setSettingsMenuVisible(false);
                  setStylizationVisible(true);
                }}
                style={styles.menuItemButton}
              >
                <View style={styles.menuItemLeading}>
                  <Ionicons name="color-palette-outline" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.menuItemCopy}>
                  <Text style={styles.menuItemTitle}>Stylization</Text>
                  <Text style={styles.menuItemText}>Theme mode, accent presets, and custom palette.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
              </Pressable>

              <ComingSoonMenuItem
                icon="notifications-outline"
                title="Notifications"
                subtitle="Coming soon"
                styles={styles}
                theme={theme}
              />
              <ComingSoonMenuItem
                icon="shield-checkmark-outline"
                title="Privacy"
                subtitle="Coming soon"
                styles={styles}
                theme={theme}
              />
              <ComingSoonMenuItem
                icon="layers-outline"
                title="More tools"
                subtitle="Coming soon"
                styles={styles}
                theme={theme}
              />
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={outfitsVisible}
        onRequestClose={() => setOutfitsVisible(false)}
      >
        <View style={[styles.modalRoot, styles.menuModalRoot]}>
          <Pressable style={styles.modalBackdrop} onPress={() => setOutfitsVisible(false)} />

          <View style={[styles.menuCard, styles.menuCardFloating, styles.outfitsCard]}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHeaderCopy}>
                <Text style={styles.menuTitle}>My Outfits</Text>
                <Text style={styles.menuSubtitle}>Saved looks stay here for quick reload into the builder.</Text>
              </View>
              <Pressable onPress={() => setOutfitsVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <ScrollView
              style={styles.outfitsScroll}
              contentContainerStyle={styles.outfitsScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {savedLooks.length === 0 ? (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyText}>Save a look from the Looks tab and it will appear here.</Text>
                </View>
              ) : (
                <View style={styles.savedList}>
                  {savedLooks.map(entry => (
                    <View key={entry.id} style={styles.savedCard}>
                      <OutfitPreviewCanvas
                        outfit={entry.outfit}
                        avatarUrl={resolveAvatarPreviewUrl(profile)}
                        theme={theme}
                        size="compact"
                      />

                      <View style={styles.savedMeta}>
                        <Text numberOfLines={2} style={styles.savedTitle}>
                          {entry.outfit.styleName || entry.outfit.name || 'Saved look'}
                        </Text>
                        <Text style={styles.savedDetail}>{`${entry.date} / ${entry.source}`}</Text>
                        <Pressable
                          onPress={() => {
                            setOutfitsVisible(false);
                            dispatch({ type: 'LOAD_OUTFIT_IN_BUILDER', payload: entry.outfit });
                          }}
                          style={styles.savedAction}
                        >
                          <Text style={styles.savedActionText}>Open in Looks</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={stylizationVisible}
        onRequestClose={closeStylization}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={closeStylization} />

          <View style={styles.stylizationCard}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHeaderCopy}>
                <Text style={styles.menuTitle}>Stylization</Text>
                <Text style={styles.menuSubtitle}>Adjust the app look from here.</Text>
              </View>
              <Pressable onPress={closeStylization} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.settingsBlock}>
              <Text style={styles.groupLabel}>Theme mode</Text>
              <View style={styles.themeToggle}>
                <Pressable
                  onPress={() => dispatch({ type: 'SET_THEME_MODE', payload: 'dark' })}
                  style={[styles.themeChip, state.themeMode === 'dark' && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, state.themeMode === 'dark' && styles.themeChipTextActive]}>
                    Dark
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => dispatch({ type: 'SET_THEME_MODE', payload: 'light' })}
                  style={[styles.themeChip, state.themeMode === 'light' && styles.themeChipActive]}
                >
                  <Text style={[styles.themeChipText, state.themeMode === 'light' && styles.themeChipTextActive]}>
                    Light
                  </Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.settingsBlock}>
              <Text style={styles.groupLabel}>Accent color</Text>
              <View style={styles.paletteRow}>
                {ACCENT_PALETTE_OPTIONS.map(option => {
                  const active = state.accentPalette === option.key;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => dispatch({ type: 'SET_ACCENT_PALETTE', payload: option.key })}
                      style={[styles.paletteSwatch, active && styles.paletteSwatchActive]}
                    >
                      <View style={[styles.paletteDot, { backgroundColor: option.color }]} />
                      <Text style={[styles.paletteLabel, active && styles.paletteLabelActive]}>
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}

                <Pressable
                  onPress={() => {
                    setHexDraft(accentPreview);
                    setPaletteVisible(true);
                  }}
                  style={[
                    styles.paletteSwatch,
                    styles.paletteSwatchWide,
                    state.accentPalette === 'custom' && styles.paletteSwatchActive,
                  ]}
                >
                  <View style={[styles.paletteDot, { backgroundColor: accentPreview }]} />
                  <Text style={[styles.paletteLabel, state.accentPalette === 'custom' && styles.paletteLabelActive]}>
                    Palette
                  </Text>
                  <Text numberOfLines={1} style={styles.paletteValueText}>
                    {accentPreview}
                  </Text>
                </Pressable>
              </View>

              <Pressable
                onPress={() => {
                  setHexDraft(accentPreview);
                  setPaletteVisible(true);
                }}
                style={styles.openPaletteButton}
              >
                <Ionicons name="color-palette-outline" size={16} color={theme.colors.accent} />
                <Text style={styles.openPaletteText}>Open full palette</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent
        visible={paletteVisible}
        onRequestClose={() => setPaletteVisible(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.modalBackdrop} onPress={() => setPaletteVisible(false)} />

          <View style={styles.paletteCard}>
            <View style={styles.menuHeader}>
              <View style={styles.menuHeaderCopy}>
                <Text style={styles.menuTitle}>Accent Palette</Text>
                <Text style={styles.menuSubtitle}>Choose any color and apply it across the app.</Text>
              </View>
              <Pressable onPress={() => setPaletteVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            <View style={styles.palettePreviewCard}>
              <View style={[styles.palettePreviewDot, { backgroundColor: normalizedHexDraft || accentPreview }]} />
              <View style={styles.menuItemCopy}>
                <Text style={styles.menuItemTitle}>Current accent</Text>
                <Text style={styles.menuItemText}>{normalizedHexDraft || accentPreview}</Text>
              </View>
            </View>

            <View style={styles.customInputRow}>
              <TextInput
                value={hexDraft}
                onChangeText={setHexDraft}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="#FF88E7"
                placeholderTextColor={theme.colors.muted}
                style={styles.customHexInput}
              />
              <Pressable
                onPress={() => {
                  applyCustomAccent(normalizedHexDraft);
                  if (normalizedHexDraft) setPaletteVisible(false);
                }}
                style={[
                  styles.customApplyButton,
                  !normalizedHexDraft && styles.customApplyButtonDisabled,
                ]}
                disabled={!normalizedHexDraft}
              >
                <Text style={styles.customApplyButtonText}>Apply</Text>
              </Pressable>
            </View>

            <View style={styles.customPaletteGrid}>
              {CUSTOM_ACCENT_SWATCHES.map(color => (
                <Pressable
                  key={color}
                  onPress={() => {
                    setHexDraft(color);
                    applyCustomAccent(color);
                    setPaletteVisible(false);
                  }}
                  style={[
                    styles.customSwatchButton,
                    accentPreview === color && styles.customSwatchButtonActive,
                  ]}
                >
                  <View style={[styles.customSwatchFill, { backgroundColor: color }]} />
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

function ComingSoonMenuItem({
  icon,
  title,
  subtitle,
  styles,
  theme,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  styles: ReturnType<typeof createStyles>;
  theme: ThemeTokens;
}) {
  return (
    <View style={[styles.menuItemButton, styles.menuItemComingSoon]}>
      <View style={styles.menuItemLeading}>
        <Ionicons name={icon} size={18} color={theme.colors.textSecondary} />
      </View>
      <View style={styles.menuItemCopy}>
        <Text style={styles.menuItemTitle}>{title}</Text>
        <Text style={styles.menuItemText}>{subtitle}</Text>
      </View>
      <View style={styles.comingSoonBadge}>
        <Text style={styles.comingSoonBadgeText}>Soon</Text>
      </View>
    </View>
  );
}

function formatProfileStyle(value: string | undefined): string {
  const safe = String(value || '').trim() || 'Style';
  return safe.charAt(0).toUpperCase() + safe.slice(1);
}

function formatAvatarGender(value: string | undefined): string {
  return String(value || '').trim().toLowerCase() === 'male' ? 'Male' : 'Female';
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      paddingBottom: theme.spacing.xl,
      gap: theme.spacing.md,
    },
    headerCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 4,
    },
    identityColumn: {
      width: 84,
      alignItems: 'flex-start',
      gap: 8,
    },
    avatar: {
      width: 74,
      height: 74,
      borderRadius: 37,
      backgroundColor: theme.colors.panel,
    },
    avatarPlaceholder: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '800',
    },
    name: {
      color: theme.colors.text,
      fontSize: 24,
      lineHeight: 28,
      fontWeight: '900',
      textAlign: 'left',
    },
    meta: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      fontWeight: '700',
      textTransform: 'capitalize',
      textAlign: 'left',
    },
    metaSecondary: {
      color: theme.colors.muted,
      fontSize: 11,
      fontWeight: '800',
      textAlign: 'left',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    avatarAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      paddingHorizontal: 8,
      paddingVertical: 5,
    },
    avatarActionDisabled: {
      opacity: 0.7,
    },
    avatarActionText: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '800',
    },
    bioColumn: {
      flex: 1,
      minWidth: 0,
      marginLeft: -8,
      gap: 8,
      paddingTop: 4,
    },
    bioLabel: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      textAlign: 'center',
      alignSelf: 'stretch',
    },
    bioInput: {
      width: '100%',
      height: BIO_INPUT_HEIGHT,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: theme.colors.text,
      fontSize: 14,
      lineHeight: 19,
      textAlignVertical: 'top',
    },
    actionStack: {
      gap: 10,
    },
    statusPill: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    statusPillText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    primaryActionButton: {
      minHeight: 54,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 10,
      paddingHorizontal: 18,
    },
    primaryActionText: {
      color: theme.colors.accentContrast,
      fontSize: 13,
      fontWeight: '800',
    },
    secondaryActionButton: {
      minHeight: 54,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      gap: 10,
      paddingHorizontal: 18,
    },
    secondaryActionText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    savedList: {
      gap: theme.spacing.md,
    },
    savedCard: {
      flexDirection: 'row',
      gap: theme.spacing.md,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
    },
    savedMeta: {
      flex: 1,
      gap: 8,
      justifyContent: 'center',
    },
    savedTitle: {
      color: theme.colors.text,
      fontSize: 15,
      lineHeight: 21,
      fontWeight: '800',
    },
    savedDetail: {
      color: theme.colors.muted,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    savedAction: {
      alignSelf: 'flex-start',
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    savedActionText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '800',
    },
    emptyPanel: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
    },
    menuModalRoot: {
      justifyContent: 'flex-start',
      paddingTop: 132,
    },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.colors.overlay,
    },
    menuCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      alignSelf: 'stretch',
    },
    menuCardFloating: {
      alignSelf: 'stretch',
    },
    outfitsCard: {
      maxHeight: '72%',
    },
    stylizationCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      alignSelf: 'stretch',
    },
    paletteCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.sm,
      alignSelf: 'stretch',
    },
    menuHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    menuHeaderCopy: {
      flex: 1,
      gap: 3,
    },
    menuTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    menuSubtitle: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    menuList: {
      gap: 10,
    },
    outfitsScroll: {
      maxHeight: '100%',
    },
    outfitsScrollContent: {
      gap: theme.spacing.md,
      paddingBottom: 4,
    },
    menuItemButton: {
      minHeight: 74,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    menuItemComingSoon: {
      opacity: 0.94,
    },
    menuItemLeading: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    menuItemCopy: {
      flex: 1,
      gap: 3,
    },
    menuItemTitle: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    menuItemText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    comingSoonBadge: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.panelStrong,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    comingSoonBadgeText: {
      color: theme.colors.textSecondary,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    settingsBlock: {
      gap: 10,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
    },
    groupLabel: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    groupHint: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 17,
    },
    themeToggle: {
      flexDirection: 'column',
      gap: 8,
    },
    themeChip: {
      width: '100%',
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    themeChipActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    themeChipText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    themeChipTextActive: {
      color: theme.colors.accentContrast,
    },
    paletteRow: {
      flexDirection: 'column',
      gap: 8,
    },
    paletteSwatch: {
      width: '100%',
      minHeight: 58,
      borderRadius: theme.radius.lg,
      alignItems: 'center',
      justifyContent: 'flex-start',
      flexDirection: 'row',
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    paletteSwatchWide: {
      minWidth: 0,
    },
    paletteSwatchActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    paletteDot: {
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    paletteLabel: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 12,
      fontWeight: '800',
    },
    paletteLabelActive: {
      color: theme.colors.text,
    },
    paletteValueText: {
      color: theme.colors.muted,
      fontSize: 10,
      fontWeight: '700',
    },
    openPaletteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 12,
      paddingVertical: 10,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accentMuted,
    },
    openPaletteText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '800',
    },
    palettePreviewCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
    },
    palettePreviewDot: {
      width: 28,
      height: 28,
      borderRadius: 14,
    },
    customInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    customHexInput: {
      flex: 1,
      minHeight: 46,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      paddingHorizontal: 12,
      fontSize: 14,
      fontWeight: '700',
    },
    customApplyButton: {
      minHeight: 46,
      borderRadius: theme.radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      backgroundColor: theme.colors.accent,
    },
    customApplyButtonDisabled: {
      backgroundColor: theme.colors.panelStrong,
    },
    customApplyButtonText: {
      color: theme.colors.accentContrast,
      fontSize: 12,
      fontWeight: '800',
    },
    customPaletteGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    customSwatchButton: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    customSwatchButtonActive: {
      borderColor: theme.colors.text,
      transform: [{ scale: 1.04 }],
    },
    customSwatchFill: {
      width: 26,
      height: 26,
      borderRadius: 13,
    },
  });
}
