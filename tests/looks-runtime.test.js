import { describe, expect, it } from './runner.js';
import {
  LOOK_CANVAS_CONTROL_POSITIONS,
  pickNextCycledOption,
  resolveLooksDisplayOutfit,
} from '../src/native/screens/looks-runtime.js';

describe('Looks runtime', () => {
  it('prefers manual outfit over generated and fallback looks', () => {
    const manual = { id: 'manual-look' };
    const generated = [{ id: 'generated-look' }];
    const fallback = { id: 'fallback-look' };

    const resolved = resolveLooksDisplayOutfit({
      manualOutfit: manual,
      generatedLooks: generated,
      activeOutfitIndex: 0,
      fallbackOutfit: fallback,
    });

    expect(resolved).toEqual(manual);
  });

  it('uses the active generated look when manual overrides are empty', () => {
    const generated = [{ id: 'look-a' }, { id: 'look-b' }];
    const fallback = { id: 'fallback-look' };

    const resolved = resolveLooksDisplayOutfit({
      manualOutfit: null,
      generatedLooks: generated,
      activeOutfitIndex: 1,
      fallbackOutfit: fallback,
    });

    expect(resolved).toEqual(generated[1]);
  });

  it('falls back to the default try-on outfit when there is no manual or generated look', () => {
    const fallback = { id: 'fallback-look' };

    const resolved = resolveLooksDisplayOutfit({
      manualOutfit: null,
      generatedLooks: [],
      activeOutfitIndex: 0,
      fallbackOutfit: fallback,
    });

    expect(resolved).toEqual(fallback);
  });

  it('cycles forward through slot options and wraps around', () => {
    const options = [{ id: 'none' }, { id: 'shirt-a' }, { id: 'shirt-b' }];

    expect(pickNextCycledOption(options, 'shirt-a', 1)).toEqual(options[2]);
    expect(pickNextCycledOption(options, 'shirt-b', 1)).toEqual(options[0]);
  });

  it('cycles backward through slot options and wraps around', () => {
    const options = [{ id: 'none' }, { id: 'pants-a' }, { id: 'pants-b' }];

    expect(pickNextCycledOption(options, 'pants-a', -1)).toEqual(options[0]);
    expect(pickNextCycledOption(options, 'none', -1)).toEqual(options[2]);
  });

  it('exposes control positions for accessory and socks lanes', () => {
    expect(LOOK_CANVAS_CONTROL_POSITIONS.accessory).toBeGreaterThan(LOOK_CANVAS_CONTROL_POSITIONS.head);
    expect(LOOK_CANVAS_CONTROL_POSITIONS.socks).toBeLessThan(LOOK_CANVAS_CONTROL_POSITIONS.feet);
  });
});
