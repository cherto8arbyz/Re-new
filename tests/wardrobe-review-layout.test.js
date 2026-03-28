import { describe, expect, it } from './runner.js';
import {
  getWardrobeReviewLayoutMetrics,
  WARDROBE_REVIEW_LAYOUT,
} from '../src/native/screens/wardrobe-review-layout.js';

describe('Wardrobe review modal layout', () => {
  it('keeps the footer sticky and reachable on small multi-item screens', () => {
    const metrics = getWardrobeReviewLayoutMetrics(640, 3);

    expect(metrics.footerIsSticky).toBeTruthy();
    expect(metrics.requiresScroll).toBeTruthy();
    expect(metrics.thumbnailRailVisible).toBeTruthy();
    expect(metrics.cardHeight).toBeGreaterThan(500);
    expect(metrics.previewImageHeight).toBeGreaterThan(WARDROBE_REVIEW_LAYOUT.minimumPreviewImageHeight - 1);
    expect(metrics.detailsMinHeight).toBeGreaterThan(95);
  });

  it('allows a taller preview on roomy single-item review without forcing scroll', () => {
    const metrics = getWardrobeReviewLayoutMetrics(860, 1);

    expect(metrics.requiresScroll).toBeFalsy();
    expect(metrics.thumbnailRailVisible).toBeFalsy();
    expect(metrics.previewImageHeight).toBeGreaterThan(300);
    expect(metrics.cardMaxHeight).toBeGreaterThan(700);
  });

  it('preserves a readable visual preview while keeping the multi-upload CTA reachable', () => {
    const metrics = getWardrobeReviewLayoutMetrics(568, 5);

    expect(metrics.footerHeight).toBeGreaterThan(80);
    expect(metrics.previewImageHeight).toBeGreaterThan(200);
    expect(metrics.detailsMinHeight).toBeGreaterThan(95);
  });
});
