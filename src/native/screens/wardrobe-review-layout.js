export const WARDROBE_REVIEW_LAYOUT = Object.freeze({
  modalVerticalMargin: 16,
  compactBreakpoint: 780,
  crampedBreakpoint: 700,
  minimumCardHeight: 520,
  footerMinHeight: 88,
  crampedFooterMinHeight: 92,
  summaryHeight: 64,
  thumbnailRailHeight: 92,
  regularDetailsReserve: 132,
  compactDetailsReserve: 112,
  minimumDetailsReserve: 96,
  minimumPreviewImageHeight: 210,
  maximumPreviewImageHeight: 340,
});

/**
 * @param {number} screenHeight
 * @param {number} entryCount
 */
export function getWardrobeReviewLayoutMetrics(screenHeight, entryCount = 1) {
  const safeHeight = Math.max(568, Math.round(Number(screenHeight) || 760));
  const cardMaxHeight = Math.max(440, safeHeight - (WARDROBE_REVIEW_LAYOUT.modalVerticalMargin * 2));
  const cardHeight = Math.min(
    cardMaxHeight,
    Math.max(WARDROBE_REVIEW_LAYOUT.minimumCardHeight, Math.round(safeHeight * 0.82)),
  );
  const compact = safeHeight <= WARDROBE_REVIEW_LAYOUT.compactBreakpoint;
  const cramped = safeHeight <= WARDROBE_REVIEW_LAYOUT.crampedBreakpoint;
  const thumbnailRailVisible = entryCount > 1;
  const footerHeight = cramped
    ? WARDROBE_REVIEW_LAYOUT.crampedFooterMinHeight
    : WARDROBE_REVIEW_LAYOUT.footerMinHeight;
  const detailsReserve = compact
    ? WARDROBE_REVIEW_LAYOUT.compactDetailsReserve
    : WARDROBE_REVIEW_LAYOUT.regularDetailsReserve;
  const computedPreviewHeight = cardMaxHeight
    - Math.max(0, cardMaxHeight - cardHeight)
    - footerHeight
    - WARDROBE_REVIEW_LAYOUT.summaryHeight
    - (thumbnailRailVisible ? WARDROBE_REVIEW_LAYOUT.thumbnailRailHeight : 0)
    - detailsReserve;
  const previewImageHeight = Math.max(
    WARDROBE_REVIEW_LAYOUT.minimumPreviewImageHeight,
    Math.min(WARDROBE_REVIEW_LAYOUT.maximumPreviewImageHeight, computedPreviewHeight),
  );
  const detailsMinHeight = Math.max(
    WARDROBE_REVIEW_LAYOUT.minimumDetailsReserve,
    cardMaxHeight
      - footerHeight
      - WARDROBE_REVIEW_LAYOUT.summaryHeight
      - previewImageHeight
      - (thumbnailRailVisible ? WARDROBE_REVIEW_LAYOUT.thumbnailRailHeight : 0),
  );

  return {
    compact,
    cramped,
    footerHeight,
    footerIsSticky: true,
    requiresScroll: compact || entryCount > 1,
    cardMaxHeight,
    cardHeight,
    previewImageHeight,
    detailsMinHeight,
    thumbnailRailVisible,
  };
}
