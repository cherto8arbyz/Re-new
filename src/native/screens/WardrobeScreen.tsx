import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Ionicons from 'expo/node_modules/@expo/vector-icons/Ionicons';

import {
  getWardrobeItemCategoryPreview,
  getWardrobeItemColor,
  getWardrobeItemShortTitle,
  selectBestImageUri,
} from '../../shared/wardrobe';
import {
  buildWardrobeUploadSummaryLabel,
  getBestWardrobeUploadReviewIndex,
  getReadyWardrobeUploadEntries,
  getWardrobeUploadPrimaryAction,
} from '../../services/wardrobe-upload-flow.js';
import { type WardrobeItem } from '../../types/models';
import { useAppContext } from '../context/AppContext';
import {
  pickImageAssetAsync,
  pickImageAssetsAsync,
  type PickedImageAsset,
} from '../services/image-picker';
import {
  analyzeWardrobeUploadBatch,
  type WardrobeUploadReviewEntry,
} from '../services/wardrobe-upload';
import { WardrobeSectionScene } from '../components/wardrobe/WardrobeSectionScene';
import { wardrobeAssets } from '../components/wardrobe/wardrobeAssets';
import {
  getWardrobeSceneColumnCount,
} from '../components/wardrobe/wardrobeSceneRuntime.js';
import type {
  WardrobeSectionEntry,
  WardrobeSectionKey,
  WardrobeStorageMode,
} from '../components/wardrobe/types';
import { type ThemeTokens } from '../theme';
import {
  WARDROBE_CHIP_METRICS,
  WARDROBE_EMPTY_STATE_METRICS,
  WARDROBE_GRID_METRICS,
} from './wardrobe-layout.js';
import { getWardrobeReviewLayoutMetrics } from './wardrobe-review-layout.js';
import {
  buildWardrobeSectionEntries,
  chunkWardrobeItems,
  getWardrobeSectionDefinition,
  getWardrobeSectionItems,
} from './wardrobe-runtime.js';

export function WardrobeScreen() {
  const { state, dispatch, theme } = useAppContext();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { height: screenHeight } = useWindowDimensions();

  const [modalVisible, setModalVisible] = useState(false);
  const [pickerMessage, setPickerMessage] = useState('');
  const [reviewEntries, setReviewEntries] = useState<WardrobeUploadReviewEntry[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [activeSectionKey, setActiveSectionKey] = useState<WardrobeSectionKey>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const sectionEntries = useMemo(
    () => buildWardrobeSectionEntries(state.wardrobeItems) as WardrobeSectionEntry[],
    [state.wardrobeItems],
  );
  const activeSection = useMemo(
    () => getWardrobeSectionDefinition(activeSectionKey) as WardrobeSectionEntry,
    [activeSectionKey],
  );
  const isOverview = activeSectionKey === 'all';
  const sceneSections = useMemo(
    () => {
      const visibleSections = isOverview
        ? sectionEntries.filter(section => section.key !== 'all' && section.count > 0)
        : [activeSection];

      return visibleSections.map(section => {
        const items = getWardrobeSectionItems(state.wardrobeItems, section.key) as WardrobeItem[];
        return {
          section,
          items,
          rows: chunkWardrobeItems(items, getWardrobeSceneColumnCount(section.storageMode)) as WardrobeItem[][],
        };
      });
    },
    [activeSection, isOverview, sectionEntries, state.wardrobeItems],
  );
  const hasSceneItems = sceneSections.some(scene => scene.items.length > 0);

  const currentReviewIndex = reviewEntries.length
    ? getBestWardrobeUploadReviewIndex(reviewEntries, reviewIndex)
    : 0;
  const selectedEntry = reviewEntries[currentReviewIndex] || null;
  const selectedItem = selectedEntry?.item || null;
  const reviewSummaryLabel = buildWardrobeUploadSummaryLabel(reviewEntries);
  const primaryAction = analyzing
    ? { enabled: false, label: 'Analyzing...' }
    : getWardrobeUploadPrimaryAction(reviewEntries);
  const reviewLayout = useMemo(
    () => getWardrobeReviewLayoutMetrics(screenHeight, reviewEntries.length),
    [reviewEntries.length, screenHeight],
  );

  const openModal = () => {
    resetReviewState();
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    resetReviewState();
  };

  const resetReviewState = () => {
    setPickerMessage('');
    setReviewEntries([]);
    setReviewIndex(0);
    setAnalyzing(false);
  };

  const handleComingSoon = () => {
    setPickerMessage('Manual add is still not wired. Upload photos for now.');
  };

  const startReviewFlow = async (assets: PickedImageAsset[]) => {
    if (!assets.length) return;

    setPickerMessage('');
    setReviewEntries([]);
    setReviewIndex(0);
    setAnalyzing(true);

    try {
      const finalEntries = await analyzeWardrobeUploadBatch(assets, (nextEntries) => {
        setReviewEntries(nextEntries);
        setReviewIndex(current => getBestWardrobeUploadReviewIndex(nextEntries, current));
      });

      setReviewEntries(finalEntries);
      setReviewIndex(current => getBestWardrobeUploadReviewIndex(finalEntries, current));
    } catch {
      setPickerMessage('Upload only clothing, shoes, or wearable accessories.');
      setReviewEntries([]);
    } finally {
      setAnalyzing(false);
    }
  };

  const handlePickFromLibrary = async () => {
    const assets = await pickImageAssetsAsync({ source: 'library', allowsMultipleSelection: true });
    await startReviewFlow(assets);
  };

  const handleTakePhoto = async () => {
    const asset = await pickImageAssetAsync('camera');
    await startReviewFlow(asset ? [asset] : []);
  };

  const handleConfirmAdd = () => {
    const readyEntries = getReadyWardrobeUploadEntries(reviewEntries);
    if (!readyEntries.length || analyzing) return;

    const items = readyEntries
      .map(entry => entry.item)
      .filter((item): item is WardrobeItem => Boolean(item));

    if (items.length === 1) {
      dispatch({ type: 'ADD_WARDROBE_ITEM', payload: items[0] });
    } else if (items.length > 1) {
      dispatch({ type: 'ADD_WARDROBE_ITEMS', payload: items });
    }

    closeModal();
  };

  const modalTitle = reviewEntries.length > 1
    ? 'Review items'
    : reviewEntries.length === 1
      ? 'Review item'
      : 'Add to wardrobe';

  return (
    <SafeAreaView style={styles.screen}>
      <ImageBackground
        source={wardrobeAssets.textures.wood1}
        resizeMode="cover"
        style={styles.closetShell}
        imageStyle={styles.closetShellImage}
      >
        <View style={styles.closetShellTint} />
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={styles.screenScrollContent}
          stickyHeaderIndices={[1]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>Wardrobe</Text>
              <Text style={styles.subtitle}>
                Scroll the closet and open filters from the pinned menu.
              </Text>
            </View>

            <Pressable onPress={openModal} style={styles.addButton}>
              <Ionicons name="add" size={18} color={theme.colors.accentContrast} />
              <Text style={styles.addButtonText}>Add item</Text>
            </Pressable>
          </View>

          <View style={styles.stickyHeader}>
            <View style={styles.stickyFilterBar}>
              <Pressable onPress={() => setFiltersOpen(current => !current)} style={styles.filterToggleButton}>
                <Ionicons name="menu-outline" size={18} color={theme.colors.text} />
                <Text numberOfLines={1} style={styles.filterToggleText}>
                  {activeSection.label}
                </Text>
                {activeSection.key !== 'all' ? (
                  <View style={styles.filterToggleBadge}>
                    <Text style={styles.filterToggleBadgeText}>{sceneSections[0]?.items.length || activeSection.count}</Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            {filtersOpen ? (
              <View style={styles.filterDrawer}>
                {sectionEntries.map(section => (
                  <Pressable
                    key={section.key}
                    onPress={() => {
                      setActiveSectionKey(section.key);
                      setFiltersOpen(false);
                    }}
                    style={[styles.filterChip, activeSectionKey === section.key && styles.filterChipActive]}
                  >
                    <View style={styles.filterChipInner}>
                      <Text numberOfLines={1} style={[styles.filterText, activeSectionKey === section.key && styles.filterTextActive]}>
                        {section.label}
                      </Text>
                      {section.key !== 'all' ? (
                        <View style={[styles.filterCountBadge, activeSectionKey === section.key && styles.filterCountBadgeActive]}>
                          <Text style={[styles.filterCountText, activeSectionKey === section.key && styles.filterCountTextActive]}>
                            {section.count}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>

          <View style={[styles.content, !isOverview && styles.contentSection]}>
            {hasSceneItems ? (
              <>
                {sceneSections.map(scene => (
                  <View key={scene.section.key} style={styles.sceneBleed}>
                    <WardrobeSectionScene
                      section={scene.section}
                      rows={scene.rows}
                      selectedItemId={null}
                      theme={theme}
                      minHeight={getWardrobeSceneMinHeight(
                        scene.section.storageMode,
                        scene.rows.length,
                        screenHeight,
                        isOverview,
                      )}
                      onSelect={() => {}}
                    />
                  </View>
                ))}
              </>
            ) : (
              <>
                <View
                  style={[
                    styles.closetEmptyState,
                    styles.sceneBleed,
                    { minHeight: getWardrobeSceneMinHeight(activeSection.storageMode, 1, screenHeight, isOverview) },
                  ]}
                >
                  <Text style={styles.closetEmptyTitle}>
                    {isOverview ? 'Your wardrobe is empty' : 'This section is empty'}
                  </Text>
                  <Text style={styles.closetEmptyText}>
                    {isOverview
                      ? 'Add clothing, shoes, or wearable accessories and they will appear directly inside the scrollable wardrobe.'
                      : 'Add a few pieces and they will appear on the matching rail or shelf automatically.'}
                  </Text>
                  <Pressable onPress={openModal} style={styles.emptyAction}>
                    <Text style={styles.emptyActionText}>Add item</Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </ImageBackground>

      <Modal
        animationType="fade"
        visible={modalVisible}
        transparent
        onRequestClose={closeModal}
      >
        <View style={styles.modalBackdrop}>
          <View style={[
            styles.modalCard,
            {
              maxHeight: reviewLayout.cardMaxHeight,
              ...(reviewEntries.length ? { height: reviewLayout.cardHeight } : {}),
            },
          ]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modalTitle}</Text>
              <Pressable onPress={closeModal} style={styles.modalClose}>
                <Ionicons name="close" size={18} color={theme.colors.text} />
              </Pressable>
            </View>

            {!reviewEntries.length ? (
              <>
                <View style={styles.modalOptions}>
                  <Pressable onPress={() => void handlePickFromLibrary()} style={styles.modalOption}>
                    <Ionicons name="images-outline" size={18} color={theme.colors.text} />
                    <Text style={styles.modalOptionText}>Upload photos</Text>
                    <Text style={styles.modalOptionMeta}>Multi-select</Text>
                  </Pressable>

                  <Pressable onPress={() => void handleTakePhoto()} style={styles.modalOption}>
                    <Ionicons name="camera-outline" size={18} color={theme.colors.text} />
                    <Text style={styles.modalOptionText}>Take photo</Text>
                  </Pressable>

                  <Pressable onPress={handleComingSoon} style={styles.modalOption}>
                    <Ionicons name="create-outline" size={18} color={theme.colors.text} />
                    <Text style={styles.modalOptionText}>Add manually</Text>
                    <Text style={styles.modalOptionMeta}>Coming soon</Text>
                  </Pressable>
                </View>

                {pickerMessage ? <Text style={styles.analysisNote}>{pickerMessage}</Text> : null}
              </>
            ) : (
              <>
                <View style={styles.previewShell}>
                  <View style={styles.previewHero}>
                    <View style={styles.batchSummaryCard}>
                      <Text style={styles.batchSummaryTitle}>{reviewSummaryLabel || 'Review uploads'}</Text>
                      <Text style={styles.batchSummaryMeta}>
                        {reviewEntries.length > 1
                          ? `Item ${currentReviewIndex + 1} of ${reviewEntries.length}`
                          : 'Single upload review'}
                      </Text>
                    </View>

                    <View style={[styles.previewImageFrame, { height: reviewLayout.previewImageHeight }]}>
                      {selectedEntry ? (
                        <Image source={{ uri: selectedEntry.asset.uri }} style={styles.previewImage} resizeMode="contain" />
                      ) : (
                        <View style={[styles.previewImage, styles.previewImageFallback]}>
                          <ActivityIndicator size="small" color={theme.colors.accent} />
                        </View>
                      )}
                    </View>

                    {reviewLayout.thumbnailRailVisible ? (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.reviewRail}
                      >
                        {reviewEntries.map((entry, index) => {
                          const active = index === currentReviewIndex;
                          return (
                            <Pressable
                              key={entry.id}
                              onPress={() => setReviewIndex(index)}
                              style={[
                                styles.reviewThumb,
                                active && styles.reviewThumbActive,
                                entry.status === 'ready' && styles.reviewThumbReady,
                                entry.status === 'invalid' && styles.reviewThumbInvalid,
                              ]}
                            >
                              <Image source={{ uri: entry.asset.uri }} style={styles.reviewThumbImage} resizeMode="cover" />
                              <View style={[styles.reviewThumbBadge, active && styles.reviewThumbBadgeActive]}>
                                <Text style={[styles.reviewThumbBadgeText, active && styles.reviewThumbBadgeTextActive]}>
                                  {index + 1}
                                </Text>
                              </View>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    ) : null}
                  </View>

                  <ScrollView
                    style={styles.previewDetailsScroll}
                    contentContainerStyle={[styles.previewDetailsContent, { minHeight: reviewLayout.detailsMinHeight }]}
                    showsVerticalScrollIndicator={reviewLayout.requiresScroll}
                  >
                    {selectedEntry?.status === 'analyzing' ? (
                      <View style={styles.statusCard}>
                        <ActivityIndicator size="small" color={theme.colors.accent} />
                        <Text style={styles.statusText}>Checking upload, classifying the item, and preparing a clean wardrobe asset...</Text>
                      </View>
                    ) : null}

                    {selectedEntry?.status === 'queued' ? (
                      <View style={styles.statusCard}>
                        <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
                        <Text style={styles.statusText}>Waiting in batch queue...</Text>
                      </View>
                    ) : null}

                    {selectedEntry?.status === 'invalid' ? (
                      <View style={[styles.statusCard, styles.statusCardError]}>
                        <Ionicons name="alert-circle-outline" size={16} color={theme.colors.danger} />
                        <Text style={styles.statusTextError}>{selectedEntry.error}</Text>
                      </View>
                    ) : null}

                    {selectedItem ? (
                      <>
                        <View style={styles.detectedRow}>
                          <Text style={styles.detectedTitle}>{getWardrobeItemShortTitle(selectedItem)}</Text>
                          <Text style={styles.detectedMeta}>
                            {[
                              getWardrobeItemCategoryPreview(selectedItem),
                              getWardrobeItemColor(selectedItem) ? formatMetaLabel(getWardrobeItemColor(selectedItem)) : '',
                              selectedItem.requiresReview ? 'Needs review' : 'Ready to save',
                            ].filter(Boolean).join(' / ')}
                          </Text>
                        </View>

                        {selectedEntry?.note ? <Text style={styles.analysisNote}>{selectedEntry.note}</Text> : null}
                      </>
                    ) : null}
                  </ScrollView>
                </View>

                <SafeAreaView style={styles.previewFooterSafe}>
                  <View style={styles.previewActions}>
                    <Pressable onPress={resetReviewState} style={styles.previewSecondary}>
                      <Text style={styles.previewSecondaryText}>Choose again</Text>
                    </Pressable>
                    <Pressable
                      onPress={handleConfirmAdd}
                      style={[styles.previewPrimary, !primaryAction.enabled && styles.previewPrimaryDisabled]}
                      disabled={!primaryAction.enabled}
                    >
                      <Text style={styles.previewPrimaryText}>{primaryAction.label}</Text>
                    </Pressable>
                  </View>
                </SafeAreaView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getWardrobeSectionRowSize(storageMode: WardrobeStorageMode): number {
  switch (storageMode) {
    case 'shoe-shelf':
    case 'drawer':
    case 'headwear-rail':
    case 'accessory-hooks':
      return 3;
    default:
      return 2;
  }
}

function getWardrobeSceneMinHeight(
  storageMode: WardrobeStorageMode,
  rowCount: number,
  viewportHeight: number,
  overviewMode: boolean,
): number {
  const safeRows = Math.max(1, rowCount || 1);

  let perRowHeight = 220;
  let chromeHeight = 74;

  if (storageMode === 'hanger') {
    perRowHeight = 248;
    chromeHeight = 84;
  } else if (storageMode === 'headwear-rail') {
    perRowHeight = 180;
    chromeHeight = 76;
  } else if (storageMode === 'folded') {
    perRowHeight = 196;
    chromeHeight = 74;
  } else if (storageMode === 'shoe-shelf') {
    perRowHeight = 172;
    chromeHeight = 70;
  } else if (storageMode === 'drawer' || storageMode === 'accessory-hooks') {
    perRowHeight = 156;
    chromeHeight = 68;
  }

  const estimatedHeight = chromeHeight + safeRows * perRowHeight;
  const viewportFloor = overviewMode
    ? Math.max(Math.round(viewportHeight * 0.36), 300)
    : Math.max(Math.round(viewportHeight * 0.42), 340);

  return Math.max(estimatedHeight, viewportFloor);
}

function renderSectionPreview(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
  theme: ThemeTokens,
) {
  const backdrop = renderPreviewTextureBackdrop(storageMode, styles);
  if (storageMode === 'hanger') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={styles.previewRail} />
        <View style={styles.previewHangerRow}>
          <View style={styles.previewHangerItem} />
          <View style={[styles.previewHangerItem, styles.previewHangerItemTall]} />
          <View style={styles.previewHangerItem} />
        </View>
      </View>
    );
  }

  if (storageMode === 'folded') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={styles.previewShelf} />
        <View style={styles.previewFoldRow}>
          <View style={styles.previewFoldBlock} />
          <View style={[styles.previewFoldBlock, styles.previewFoldBlockWide]} />
        </View>
        <View style={[styles.previewShelf, styles.previewShelfLower]} />
      </View>
    );
  }

  if (storageMode === 'shoe-shelf') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={[styles.previewShelf, styles.previewShelfLower]} />
        <View style={styles.previewShoeRow}>
          <View style={styles.previewShoe} />
          <View style={styles.previewShoe} />
          <View style={styles.previewShoe} />
        </View>
      </View>
    );
  }

  if (storageMode === 'drawer') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={styles.previewDrawerFront} />
        <View style={styles.previewDrawerRow}>
          <View style={styles.previewSock} />
          <View style={styles.previewSock} />
          <View style={styles.previewSock} />
        </View>
      </View>
    );
  }

  if (storageMode === 'headwear-rail') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={styles.previewRail} />
        <View style={styles.previewHatRow}>
          <View style={styles.previewHat} />
          <View style={styles.previewHat} />
          <View style={styles.previewHat} />
        </View>
      </View>
    );
  }

  if (storageMode === 'accessory-hooks') {
    return (
      <View style={styles.previewScene}>
        {backdrop}
        <View style={styles.previewHookBar}>
          <View style={styles.previewHook} />
          <View style={styles.previewHook} />
          <View style={styles.previewHook} />
        </View>
        <View style={styles.previewAccessoryRow}>
          <View style={styles.previewAccessoryDot} />
          <View style={[styles.previewAccessoryDot, { backgroundColor: theme.colors.accentSoft }]} />
          <View style={styles.previewAccessoryDot} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.previewScene}>
      {backdrop}
      <View style={styles.previewRail} />
      <View style={styles.previewFoldRow}>
        <View style={styles.previewFoldBlock} />
        <View style={styles.previewFoldBlock} />
      </View>
    </View>
  );
}

function renderPreviewTextureBackdrop(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
) {
  if (storageMode === 'hanger' || storageMode === 'headwear-rail') {
    return (
      <View style={styles.previewTextureWall}>
        <View style={styles.previewTextureColumn} />
        <View style={[styles.previewTextureColumn, styles.previewTextureColumnCenter]} />
        <View style={styles.previewTextureColumn} />
      </View>
    );
  }

  if (storageMode === 'folded' || storageMode === 'shoe-shelf') {
    return (
      <View style={styles.previewTextureWood}>
        <View style={styles.previewTextureWoodLine} />
        <View style={[styles.previewTextureWoodLine, styles.previewTextureWoodLineMid]} />
        <View style={styles.previewTextureWoodLine} />
      </View>
    );
  }

  if (storageMode === 'drawer') {
    return (
      <View style={styles.previewTextureDrawer}>
        <View style={styles.previewTextureDrawerInset} />
      </View>
    );
  }

  if (storageMode === 'accessory-hooks') {
    return (
      <View style={styles.previewTexturePegboard}>
        {[0, 1, 2, 3].map(row => (
          <View key={`preview-peg-${row}`} style={styles.previewPegRow}>
            <View style={styles.previewPegDot} />
            <View style={styles.previewPegDot} />
            <View style={styles.previewPegDot} />
            <View style={styles.previewPegDot} />
          </View>
        ))}
      </View>
    );
  }

  return null;
}

function renderClosetTextureBackdrop(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
) {
  if (storageMode === 'hanger' || storageMode === 'headwear-rail') {
    return (
      <View pointerEvents="none" style={styles.closetTextureWall}>
        <View style={styles.closetTextureColumn} />
        <View style={[styles.closetTextureColumn, styles.closetTextureColumnCenter]} />
        <View style={styles.closetTextureColumn} />
      </View>
    );
  }

  if (storageMode === 'folded' || storageMode === 'shoe-shelf') {
    return (
      <View pointerEvents="none" style={styles.closetTextureWood}>
        <View style={styles.closetTextureWoodLine} />
        <View style={styles.closetTextureWoodLine} />
        <View style={styles.closetTextureWoodLine} />
      </View>
    );
  }

  if (storageMode === 'drawer') {
    return (
      <View pointerEvents="none" style={styles.closetTextureDrawer}>
        <View style={styles.closetTextureDrawerInset} />
      </View>
    );
  }

  if (storageMode === 'accessory-hooks') {
    return (
      <View pointerEvents="none" style={styles.closetTexturePegboard}>
        {[0, 1, 2, 3, 4].map(row => (
          <View key={`closet-peg-${row}`} style={styles.closetPegRow}>
            <View style={styles.closetPegDot} />
            <View style={styles.closetPegDot} />
            <View style={styles.closetPegDot} />
            <View style={styles.closetPegDot} />
            <View style={styles.closetPegDot} />
          </View>
        ))}
      </View>
    );
  }

  return null;
}

function getClosetFrameModeStyle(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
) {
  if (storageMode === 'drawer') return styles.closetFrameDrawer;
  if (storageMode === 'folded' || storageMode === 'shoe-shelf') return styles.closetFrameShelf;
  if (storageMode === 'accessory-hooks') return styles.closetFrameAccessory;
  return styles.closetFrameHanger;
}

function renderClosetRow({
  row,
  rowIndex,
  section,
  selectedItemId,
  onSelect,
  styles,
}: {
  row: WardrobeItem[];
  rowIndex: number;
  section: WardrobeSectionEntry;
  selectedItemId: string | null;
  onSelect: React.Dispatch<React.SetStateAction<string | null>>;
  styles: ReturnType<typeof createStyles>;
}) {
  const mode = section.storageMode;
  const laneStyle = getClosetLaneStyle(mode, styles);
  const slotStyle = getClosetSlotStyle(mode, styles);
  const assetWrapStyle = getClosetAssetWrapStyle(mode, styles);
  const assetStyle = getClosetAssetStyle(mode, styles);

  return (
    <View key={`${section.key}-${rowIndex}`} style={styles.closetLaneWrap}>
      {renderClosetHardware(mode, styles)}
      <View style={laneStyle}>
        {row.map(item => {
          const active = item.id === selectedItemId;
          const image = selectBestImageUri(item);

          return (
            <Pressable
              key={item.id}
              onPress={() => onSelect(item.id)}
              style={[slotStyle, active && styles.storageSlotActive]}
            >
              {renderClosetSlotTopper(mode, styles)}
              <View style={assetWrapStyle}>
                {image ? (
                  <Image source={{ uri: image }} style={assetStyle} resizeMode="contain" />
                ) : (
                  <View style={styles.storageFallback}>
                    <Ionicons name="image-outline" size={18} color="#8f98ab" />
                  </View>
                )}
              </View>
              <Text numberOfLines={1} style={styles.storageItemLabel}>
                {getWardrobeItemShortTitle(item)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function renderClosetHardware(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
) {
  if (storageMode === 'hanger' || storageMode === 'headwear-rail') {
    return (
      <View style={styles.railHardware}>
        <View style={styles.railHardwareShadow} />
        <View style={styles.railHardwareBar} />
      </View>
    );
  }

  if (storageMode === 'accessory-hooks') {
    return (
      <View style={styles.hookHardware}>
        <View style={styles.hookHardwareBar} />
        <View style={styles.hookHardwareRow}>
          <View style={styles.hookHardwarePeg} />
          <View style={styles.hookHardwarePeg} />
          <View style={styles.hookHardwarePeg} />
        </View>
      </View>
    );
  }

  if (storageMode === 'drawer') {
    return (
      <View style={styles.drawerHardware}>
        <View style={styles.drawerHardwareFront} />
        <View style={styles.drawerHardwareHandle} />
      </View>
    );
  }

  return (
    <View style={styles.shelfHardware}>
      <View style={styles.shelfHardwareTop} />
      <View style={styles.shelfHardwareLip} />
    </View>
  );
}

function renderClosetSlotTopper(
  storageMode: WardrobeStorageMode,
  styles: ReturnType<typeof createStyles>,
) {
  if (storageMode === 'hanger' || storageMode === 'headwear-rail') {
    return (
      <View style={styles.slotHookWrap}>
        <View style={styles.slotHookDot} />
        <View style={styles.slotHookStem} />
      </View>
    );
  }

  if (storageMode === 'accessory-hooks') {
    return <View style={styles.slotPeg} />;
  }

  return null;
}

function getClosetLaneStyle(storageMode: WardrobeStorageMode, styles: ReturnType<typeof createStyles>) {
  if (storageMode === 'hanger') return styles.closetLaneHanger;
  if (storageMode === 'headwear-rail') return styles.closetLaneHeadwear;
  if (storageMode === 'accessory-hooks') return styles.closetLaneAccessories;
  if (storageMode === 'drawer') return styles.closetLaneDrawer;
  if (storageMode === 'shoe-shelf') return styles.closetLaneShelfCompact;
  return styles.closetLaneShelf;
}

function getClosetSlotStyle(storageMode: WardrobeStorageMode, styles: ReturnType<typeof createStyles>) {
  if (storageMode === 'hanger') return styles.storageSlotHanger;
  if (storageMode === 'headwear-rail') return styles.storageSlotHeadwear;
  if (storageMode === 'accessory-hooks') return styles.storageSlotAccessory;
  if (storageMode === 'drawer') return styles.storageSlotDrawer;
  if (storageMode === 'shoe-shelf') return styles.storageSlotShoe;
  return styles.storageSlotFolded;
}

function getClosetAssetWrapStyle(storageMode: WardrobeStorageMode, styles: ReturnType<typeof createStyles>) {
  if (storageMode === 'hanger') return styles.storageAssetWrapHanger;
  if (storageMode === 'headwear-rail') return styles.storageAssetWrapHeadwear;
  if (storageMode === 'accessory-hooks') return styles.storageAssetWrapAccessory;
  if (storageMode === 'drawer') return styles.storageAssetWrapDrawer;
  if (storageMode === 'shoe-shelf') return styles.storageAssetWrapShoe;
  return styles.storageAssetWrapFolded;
}

function getClosetAssetStyle(storageMode: WardrobeStorageMode, styles: ReturnType<typeof createStyles>) {
  if (storageMode === 'drawer') return styles.storageAssetImageDrawer;
  if (storageMode === 'shoe-shelf') return styles.storageAssetImageShoe;
  if (storageMode === 'headwear-rail') return styles.storageAssetImageHeadwear;
  if (storageMode === 'accessory-hooks') return styles.storageAssetImageAccessory;
  return styles.storageAssetImage;
}

function formatMetaLabel(value: string): string {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    closetShell: {
      flex: 1,
    },
    closetShellImage: {
      opacity: 0.34,
    },
    closetShellTint: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(11, 11, 16, 0.78)',
    },
    screenScroll: {
      flex: 1,
    },
    screenScrollContent: {
      paddingHorizontal: theme.spacing.md,
      paddingBottom: theme.spacing.xl + 20,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
      paddingTop: theme.spacing.xs,
      paddingBottom: theme.spacing.sm,
    },
    headerCopy: {
      flex: 1,
      gap: 4,
    },
    title: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: '900',
    },
    subtitle: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    addButtonText: {
      color: theme.colors.accentContrast,
      fontSize: 13,
      fontWeight: '800',
    },
    filterRail: {
      flexGrow: 0,
    },
    stickyHeader: {
      backgroundColor: 'rgba(12, 12, 18, 0.88)',
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.06)',
      paddingTop: 6,
      paddingBottom: theme.spacing.sm,
      gap: 10,
      zIndex: 6,
    },
    stickyFilterBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
    },
    filterToggleButton: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      minHeight: 42,
      borderRadius: theme.radius.pill,
      backgroundColor: 'rgba(23, 28, 40, 0.94)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
    },
    filterToggleText: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
    },
    filterToggleBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panelStrong,
    },
    filterToggleBadgeText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },
    filterDrawer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 10,
      paddingTop: 2,
    },
    filterRow: {
      alignItems: 'center',
      gap: WARDROBE_CHIP_METRICS.iconGap + 2,
      paddingRight: theme.spacing.sm,
      paddingBottom: 6,
    },
    filterChip: {
      flexShrink: 0,
      alignItems: 'center',
      alignSelf: 'center',
      justifyContent: 'center',
      height: WARDROBE_CHIP_METRICS.height,
      minWidth: WARDROBE_CHIP_METRICS.minWidth,
      maxWidth: WARDROBE_CHIP_METRICS.maxWidth,
      borderRadius: WARDROBE_CHIP_METRICS.borderRadius,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: WARDROBE_CHIP_METRICS.horizontalPadding,
      paddingVertical: 0,
      overflow: 'hidden',
    },
    filterChipActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    filterChipInner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    filterText: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: WARDROBE_CHIP_METRICS.fontSize,
      lineHeight: WARDROBE_CHIP_METRICS.lineHeight,
      includeFontPadding: false,
      textAlignVertical: 'center',
    },
    filterTextActive: {
      color: theme.colors.accentContrast,
    },
    filterCountBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panelStrong,
    },
    filterCountBadgeActive: {
      backgroundColor: 'rgba(255,255,255,0.18)',
    },
    filterCountText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },
    filterCountTextActive: {
      color: theme.colors.accentContrast,
    },
    sectionStickyMeta: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      paddingTop: 2,
    },
    sectionStickyCopy: {
      flex: 1,
      gap: 4,
      paddingRight: 6,
    },
    sectionStickyTitle: {
      color: theme.colors.text,
      fontSize: 20,
      lineHeight: 24,
      fontWeight: '900',
    },
    sectionStickyText: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    content: {
      paddingTop: 6,
      paddingBottom: theme.spacing.xl,
      gap: 8,
    },
    contentSection: {
      gap: 8,
    },
    sceneBleed: {
      marginHorizontal: -theme.spacing.md,
    },
    hubHero: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      gap: 8,
    },
    hubHeroGlowPrimary: {
      position: 'absolute',
      width: 240,
      height: 240,
      borderRadius: 999,
      right: -60,
      top: -24,
      backgroundColor: theme.colors.accentSoft,
    },
    hubHeroGlowSecondary: {
      position: 'absolute',
      width: 180,
      height: 180,
      borderRadius: 999,
      left: -32,
      bottom: -70,
      backgroundColor: theme.colors.panel,
      opacity: 0.56,
    },
    hubEyebrow: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    hubTitle: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 28,
      maxWidth: '78%',
    },
    hubText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      maxWidth: '88%',
    },
    sectionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    sectionCard: {
      width: '48.2%',
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 12,
      overflow: 'hidden',
    },
    sectionCardMuted: {
      opacity: 0.72,
    },
    sectionCardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    sectionCardTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    sectionCardMeta: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      marginTop: 2,
    },
    sectionCountPill: {
      minWidth: 32,
      height: 32,
      borderRadius: 16,
      paddingHorizontal: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panelStrong,
    },
    sectionCountPillMuted: {
      backgroundColor: theme.colors.panel,
    },
    sectionCountPillText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    sectionPreviewFrame: {
      height: 122,
      borderRadius: 22,
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      overflow: 'hidden',
    },
    sectionCardHint: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
    },
    previewScene: {
      flex: 1,
      position: 'relative',
      justifyContent: 'center',
    },
    previewTextureWall: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    previewTextureColumn: {
      width: '29%',
      borderRadius: 18,
      backgroundColor: 'rgba(50, 58, 77, 0.5)',
      borderWidth: 1,
      borderColor: 'rgba(90, 103, 130, 0.2)',
    },
    previewTextureColumnCenter: {
      backgroundColor: 'rgba(61, 71, 93, 0.6)',
    },
    previewTextureWood: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-between',
      paddingVertical: 16,
      paddingHorizontal: 6,
    },
    previewTextureWoodLine: {
      height: 14,
      borderRadius: 999,
      backgroundColor: 'rgba(122, 105, 90, 0.24)',
    },
    previewTextureWoodLineMid: {
      opacity: 0.7,
    },
    previewTextureDrawer: {
      ...StyleSheet.absoluteFillObject,
      padding: 8,
    },
    previewTextureDrawerInset: {
      flex: 1,
      borderRadius: 18,
      backgroundColor: 'rgba(109, 88, 109, 0.18)',
      borderWidth: 1,
      borderColor: 'rgba(174, 146, 177, 0.14)',
    },
    previewTexturePegboard: {
      ...StyleSheet.absoluteFillObject,
      paddingHorizontal: 10,
      paddingVertical: 16,
      justifyContent: 'space-between',
    },
    previewPegRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    previewPegDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(189, 196, 214, 0.18)',
    },
    previewRail: {
      position: 'absolute',
      top: 18,
      left: 10,
      right: 10,
      height: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
    },
    previewHangerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: 22,
      gap: 10,
      paddingHorizontal: 8,
    },
    previewHangerItem: {
      flex: 1,
      height: 62,
      borderRadius: 18,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewHangerItemTall: {
      height: 74,
    },
    previewShelf: {
      position: 'absolute',
      left: 6,
      right: 6,
      height: 10,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      top: 34,
    },
    previewShelfLower: {
      top: undefined,
      bottom: 18,
    },
    previewFoldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 30,
      paddingHorizontal: 4,
    },
    previewFoldBlock: {
      flex: 1,
      height: 34,
      borderRadius: 14,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewFoldBlockWide: {
      flex: 1.3,
    },
    previewShoeRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 50,
      paddingHorizontal: 2,
    },
    previewShoe: {
      flex: 1,
      height: 30,
      borderRadius: 14,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewDrawerFront: {
      position: 'absolute',
      top: 26,
      left: 4,
      right: 4,
      height: 54,
      borderRadius: 18,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.76,
    },
    previewDrawerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 42,
      paddingHorizontal: 8,
    },
    previewSock: {
      flex: 1,
      height: 36,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewHatRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 28,
      paddingHorizontal: 6,
    },
    previewHat: {
      flex: 1,
      height: 46,
      borderRadius: 999,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewHookBar: {
      position: 'absolute',
      top: 24,
      left: 10,
      right: 10,
      height: 28,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    previewHook: {
      width: 6,
      height: 28,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
    },
    previewAccessoryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 54,
      paddingHorizontal: 14,
    },
    previewAccessoryDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.card,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    closetToolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.sm,
    },
    closetBackButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    closetBackText: {
      color: theme.colors.text,
      fontSize: 13,
      fontWeight: '700',
    },
    closetCountChip: {
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.panelStrong,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    closetCountText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    closetHeadlineCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: 6,
    },
    closetTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '900',
    },
    closetText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
    },
    closetFrame: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: theme.radius.xl,
      backgroundColor: '#131925',
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      paddingHorizontal: 14,
      paddingTop: 22,
      paddingBottom: 16,
      gap: 18,
    },
    closetFrameHanger: {
      backgroundColor: '#151b27',
    },
    closetFrameShelf: {
      backgroundColor: '#18181b',
    },
    closetFrameDrawer: {
      backgroundColor: '#171421',
    },
    closetFrameAccessory: {
      backgroundColor: '#141923',
    },
    closetTextureWall: {
      ...StyleSheet.absoluteFillObject,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 18,
    },
    closetTextureColumn: {
      width: '29%',
      borderRadius: 24,
      backgroundColor: 'rgba(44, 52, 68, 0.58)',
      borderWidth: 1,
      borderColor: 'rgba(102, 116, 144, 0.16)',
    },
    closetTextureColumnCenter: {
      backgroundColor: 'rgba(58, 68, 88, 0.66)',
    },
    closetTextureWood: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'space-evenly',
      paddingHorizontal: 12,
      paddingVertical: 18,
    },
    closetTextureWoodLine: {
      height: 26,
      borderRadius: 16,
      backgroundColor: 'rgba(120, 100, 86, 0.12)',
    },
    closetTextureDrawer: {
      ...StyleSheet.absoluteFillObject,
      padding: 12,
    },
    closetTextureDrawerInset: {
      flex: 1,
      borderRadius: 28,
      backgroundColor: 'rgba(107, 84, 109, 0.18)',
      borderWidth: 1,
      borderColor: 'rgba(170, 143, 176, 0.16)',
    },
    closetTexturePegboard: {
      ...StyleSheet.absoluteFillObject,
      paddingHorizontal: 18,
      paddingVertical: 24,
      justifyContent: 'space-between',
    },
    closetPegRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    closetPegDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: 'rgba(198, 206, 224, 0.12)',
    },
    closetGlowA: {
      position: 'absolute',
      top: 24,
      right: -40,
      width: 180,
      height: 180,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
      opacity: 0.72,
    },
    closetGlowB: {
      position: 'absolute',
      left: -42,
      bottom: -60,
      width: 200,
      height: 200,
      borderRadius: 999,
      backgroundColor: theme.colors.panelStrong,
      opacity: 0.46,
    },
    closetTopBoard: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 14,
      backgroundColor: '#2b3142',
    },
    closetLaneWrap: {
      gap: 10,
    },
    railHardware: {
      height: 16,
      justifyContent: 'center',
    },
    railHardwareShadow: {
      position: 'absolute',
      left: 6,
      right: 6,
      height: 10,
      borderRadius: 999,
      backgroundColor: '#151a24',
      top: 4,
    },
    railHardwareBar: {
      marginHorizontal: 4,
      height: 6,
      borderRadius: 999,
      backgroundColor: '#707b8f',
    },
    shelfHardware: {
      height: 18,
      justifyContent: 'center',
    },
    shelfHardwareTop: {
      height: 7,
      borderRadius: 999,
      backgroundColor: '#6b5e56',
      marginHorizontal: 4,
    },
    shelfHardwareLip: {
      marginTop: 1,
      marginHorizontal: 10,
      height: 3,
      borderRadius: 999,
      backgroundColor: '#3d342f',
      opacity: 0.8,
    },
    drawerHardware: {
      height: 20,
      justifyContent: 'center',
      alignItems: 'center',
    },
    drawerHardwareFront: {
      position: 'absolute',
      left: 4,
      right: 4,
      height: 18,
      borderRadius: 10,
      backgroundColor: '#4b4252',
    },
    drawerHardwareHandle: {
      width: 40,
      height: 4,
      borderRadius: 999,
      backgroundColor: '#b3a1b5',
      opacity: 0.9,
    },
    hookHardware: {
      gap: 6,
    },
    hookHardwareBar: {
      height: 6,
      borderRadius: 999,
      backgroundColor: '#707b8f',
      marginHorizontal: 10,
    },
    hookHardwareRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 16,
    },
    hookHardwarePeg: {
      width: 6,
      height: 18,
      borderRadius: 999,
      backgroundColor: '#707b8f',
    },
    closetLaneHanger: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    closetLaneHeadwear: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    closetLaneAccessories: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    closetLaneDrawer: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    closetLaneShelf: {
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    closetLaneShelfCompact: {
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    storageSlotHanger: {
      width: '47%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotHeadwear: {
      width: '31%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotAccessory: {
      width: '31%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotDrawer: {
      width: '31%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotShoe: {
      width: '31%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotFolded: {
      width: '47%',
      gap: 8,
      alignItems: 'center',
    },
    storageSlotActive: {
      transform: [{ translateY: -2 }],
    },
    slotHookWrap: {
      alignItems: 'center',
      gap: 4,
    },
    slotHookDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#c5cad8',
    },
    slotHookStem: {
      width: 2,
      height: 14,
      borderRadius: 999,
      backgroundColor: '#8e98ab',
    },
    slotPeg: {
      width: 8,
      height: 20,
      borderRadius: 999,
      backgroundColor: '#8e98ab',
    },
    storageAssetWrapHanger: {
      width: '100%',
      height: 164,
      borderRadius: 28,
      backgroundColor: 'rgba(28, 35, 49, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetWrapHeadwear: {
      width: '100%',
      height: 96,
      borderRadius: 24,
      backgroundColor: 'rgba(28, 35, 49, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetWrapAccessory: {
      width: '100%',
      height: 96,
      borderRadius: 24,
      backgroundColor: 'rgba(28, 35, 49, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetWrapDrawer: {
      width: '100%',
      height: 78,
      borderRadius: 18,
      backgroundColor: 'rgba(40, 46, 60, 0.94)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 8,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetWrapShoe: {
      width: '100%',
      height: 92,
      borderRadius: 20,
      backgroundColor: 'rgba(28, 35, 49, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetWrapFolded: {
      width: '100%',
      height: 112,
      borderRadius: 22,
      backgroundColor: 'rgba(28, 35, 49, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageAssetImage: {
      width: '100%',
      height: '100%',
    },
    storageAssetImageDrawer: {
      width: '96%',
      height: '96%',
    },
    storageAssetImageShoe: {
      width: '100%',
      height: '88%',
    },
    storageAssetImageHeadwear: {
      width: '100%',
      height: '92%',
    },
    storageAssetImageAccessory: {
      width: '86%',
      height: '86%',
    },
    storageFallback: {
      flex: 1,
      width: '100%',
      borderRadius: 16,
      backgroundColor: theme.colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
    },
    storageItemLabel: {
      color: theme.colors.text,
      fontSize: 11,
      lineHeight: 15,
      fontWeight: '700',
      textAlign: 'center',
      minHeight: 30,
    },
    closetEmptyState: {
      borderRadius: theme.radius.lg,
      backgroundColor: 'rgba(23, 29, 41, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    closetEmptyTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    closetEmptyText: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 20,
      textAlign: 'center',
      maxWidth: 280,
    },
    detailCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
    },
    detailPreviewWrap: {
      width: 88,
      height: 88,
      borderRadius: 24,
      backgroundColor: theme.colors.backgroundSecondary,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 10,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    detailPreviewImage: {
      width: '100%',
      height: '100%',
    },
    detailPreviewFallback: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panel,
    },
    detailCopy: {
      flex: 1,
      gap: 6,
    },
    detailTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    detailTag: {
      borderRadius: theme.radius.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: theme.colors.panel,
    },
    detailTagText: {
      color: theme.colors.textSecondary,
      fontSize: 11,
      fontWeight: '800',
    },
    detailTagWarn: {
      backgroundColor: theme.colors.accentSoft,
    },
    detailTagWarnText: {
      color: theme.colors.accent,
    },
    detailTitle: {
      color: theme.colors.text,
      fontSize: 16,
      lineHeight: 20,
      fontWeight: '800',
    },
    detailMeta: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 17,
    },
    detailRemoveButton: {
      alignSelf: 'stretch',
      minWidth: 94,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: 10,
    },
    detailRemoveText: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      alignItems: 'stretch',
      columnGap: WARDROBE_GRID_METRICS.gap,
      rowGap: WARDROBE_GRID_METRICS.gap,
    },
    card: {
      flexGrow: 0,
      flexShrink: 0,
      width: WARDROBE_GRID_METRICS.cardWidth,
      maxWidth: WARDROBE_GRID_METRICS.cardWidth,
      flexBasis: WARDROBE_GRID_METRICS.cardWidth,
      minWidth: WARDROBE_GRID_METRICS.cardMinWidth,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      gap: 10,
    },
    removeButton: {
      position: 'absolute',
      top: 8,
      right: 8,
      zIndex: 2,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    imageWrap: {
      aspectRatio: 0.86,
      borderRadius: 18,
      backgroundColor: theme.colors.surfaceElevated,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 10,
      overflow: 'hidden',
    },
    image: {
      width: '100%',
      height: '100%',
    },
    imageFallback: {
      flex: 1,
      width: '100%',
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.panel,
    },
    itemTitle: {
      color: theme.colors.text,
      fontSize: 14,
      fontWeight: '800',
      lineHeight: 18,
      minHeight: 36,
    },
    itemMeta: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      lineHeight: 16,
    },
    emptyCard: {
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.lg,
      gap: 8,
      maxWidth: WARDROBE_EMPTY_STATE_METRICS.maxWidth,
      alignSelf: 'center',
      width: '100%',
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.colors.text,
      fontSize: 22,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyText: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    emptyAction: {
      alignSelf: 'center',
      minHeight: 36,
      minWidth: WARDROBE_EMPTY_STATE_METRICS.actionMinWidth,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      paddingHorizontal: 14,
    },
    emptyActionText: {
      color: theme.colors.accentContrast,
      fontSize: 13,
      fontWeight: '800',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.colors.overlay,
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.md,
    },
    modalCard: {
      width: '100%',
      maxWidth: 420,
      borderRadius: theme.radius.xl,
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      maxHeight: '92%',
      minHeight: 0,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    modalTitle: {
      color: theme.colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    modalClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    modalOptions: {
      gap: theme.spacing.sm,
    },
    modalOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.spacing.sm,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 16,
    },
    modalOptionText: {
      flex: 1,
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    modalOptionMeta: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: '700',
    },
    previewShell: {
      flex: 1,
      minHeight: 0,
    },
    previewHero: {
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.md,
      flexShrink: 0,
    },
    previewDetailsScroll: {
      flex: 1,
      minHeight: 0,
    },
    previewDetailsContent: {
      flexGrow: 1,
      gap: theme.spacing.md,
      paddingBottom: theme.spacing.sm,
    },
    batchSummaryCard: {
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      gap: 2,
    },
    batchSummaryTitle: {
      color: theme.colors.text,
      fontSize: 15,
      fontWeight: '800',
    },
    batchSummaryMeta: {
      color: theme.colors.muted,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
    },
    previewImageFrame: {
      width: '100%',
      borderRadius: 22,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    previewImageFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    statusCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: theme.radius.lg,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    statusCardError: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.surfaceElevated,
    },
    statusText: {
      flex: 1,
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    statusTextError: {
      flex: 1,
      color: theme.colors.danger,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '700',
    },
    detectedRow: {
      gap: 2,
    },
    detectedTitle: {
      color: theme.colors.text,
      fontSize: 18,
      fontWeight: '900',
    },
    detectedMeta: {
      color: theme.colors.muted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    analysisNote: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      lineHeight: 18,
    },
    reviewRail: {
      gap: 10,
      paddingBottom: 2,
    },
    reviewThumb: {
      width: 62,
      height: 84,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
      position: 'relative',
    },
    reviewThumbActive: {
      borderColor: theme.colors.accent,
      borderWidth: 2,
    },
    reviewThumbReady: {
      backgroundColor: theme.colors.surfaceElevated,
    },
    reviewThumbInvalid: {
      borderColor: theme.colors.danger,
    },
    reviewThumbImage: {
      width: '100%',
      height: '100%',
    },
    reviewThumbBadge: {
      position: 'absolute',
      right: 6,
      bottom: 6,
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 4,
    },
    reviewThumbBadgeActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    reviewThumbBadgeText: {
      color: theme.colors.text,
      fontSize: 11,
      fontWeight: '800',
    },
    reviewThumbBadgeTextActive: {
      color: theme.colors.accentContrast,
    },
    previewFooterSafe: {
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      paddingTop: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceElevated,
    },
    previewActions: {
      flexDirection: 'row',
      gap: theme.spacing.sm,
    },
    previewSecondary: {
      flex: 1,
      minHeight: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
    },
    previewSecondaryText: {
      color: theme.colors.text,
      fontWeight: '700',
      fontSize: 14,
    },
    previewPrimary: {
      flex: 1,
      minHeight: 48,
      borderRadius: theme.radius.pill,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 13,
    },
    previewPrimaryDisabled: {
      opacity: 0.45,
    },
    previewPrimaryText: {
      color: theme.colors.accentContrast,
      fontWeight: '800',
      fontSize: 14,
    },
  });
}
