import { describe, expect, it } from './runner.js';
import {
  buildLookVariationRequest,
  buildOutfitSignature,
  describeCalendarEvents,
  describeTrendSignals,
  pickDistinctLeadOutfit,
} from '../src/services/stylist-variation.js';

describe('Stylist variation helpers', () => {
  it('builds stable outfit signatures from garment ids', () => {
    const signature = buildOutfitSignature({
      garments: [{ id: 'pants' }, { id: 'shirt' }, { id: 'shoes' }],
    });

    expect(signature).toBe('pants|shirt|shoes');
  });

  it('prefers a lead outfit that does not repeat the previous combination', () => {
    const previous = [{ garments: [{ id: 'shirt' }, { id: 'pants' }, { id: 'shoes' }] }];
    const repeated = { garments: [{ id: 'shirt' }, { id: 'pants' }, { id: 'shoes' }] };
    const fresh = { garments: [{ id: 'dress' }, { id: 'heels' }] };

    const lead = pickDistinctLeadOutfit([repeated, fresh], previous);

    expect(lead).toBe(fresh);
  });

  it('returns a concrete variation direction and remembers previous outfits', () => {
    const variation = buildLookVariationRequest(
      [{ garments: [{ id: 'shirt' }, { id: 'pants' }], styleName: 'Clean City Minimal' }],
      '2026-03-25',
      'minimalist',
      123456,
    );

    expect(variation.direction).toBeTruthy();
    expect(variation.previousSignatures).toHaveLength(1);
    expect(variation.previousStyleNames).toHaveLength(1);
  });

  it('summarizes trend and calendar context for Gemini prompts', () => {
    expect(describeTrendSignals({
      signals: [{ tag: 'soft tailoring', score: 0.92 }, { tag: 'wide leg', score: 0.84 }],
    })).toBe('soft tailoring (0.92), wide leg (0.84)');

    expect(describeCalendarEvents([
      { title: 'Team meeting', dressCode: 'business casual' },
      { title: 'Dinner', dressCode: 'smart casual' },
    ])).toBe('Team meeting [business casual]; Dinner [smart casual]');
  });
});
