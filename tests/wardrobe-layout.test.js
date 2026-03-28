import { describe, expect, it } from './runner.js';
import {
  WARDROBE_CHIP_METRICS,
  WARDROBE_EMPTY_STATE_METRICS,
  WARDROBE_GRID_METRICS,
} from '../src/native/screens/wardrobe-layout.js';

describe('Wardrobe layout metrics', () => {
  it('keeps filter chips on a fixed height', () => {
    expect(WARDROBE_CHIP_METRICS.height).toBe(34);
    expect(WARDROBE_CHIP_METRICS.borderRadius).toBe(17);
    expect(WARDROBE_CHIP_METRICS.minWidth).toBe(64);
  });

  it('uses the same chip sizing contract for category chips', () => {
    expect(WARDROBE_CHIP_METRICS.fontSize).toBe(13);
    expect(WARDROBE_CHIP_METRICS.lineHeight).toBe(16);
    expect(WARDROBE_CHIP_METRICS.maxWidth).toBe(136);
  });

  it('keeps the wardrobe grid on stable mobile spacing', () => {
    expect(WARDROBE_GRID_METRICS.gap).toBe(12);
    expect(WARDROBE_GRID_METRICS.columns).toBe(2);
    expect(WARDROBE_GRID_METRICS.cardWidth).toBe('48%');
    expect(WARDROBE_GRID_METRICS.cardMinWidth).toBe(0);
  });

  it('centers empty state content and keeps its CTA compact', () => {
    expect(WARDROBE_EMPTY_STATE_METRICS.maxWidth).toBe(320);
    expect(WARDROBE_EMPTY_STATE_METRICS.iconSize).toBe(48);
    expect(WARDROBE_EMPTY_STATE_METRICS.actionMinWidth).toBe(108);
  });
});
