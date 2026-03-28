import { describe, it, expect } from './runner.js';
import {
  buildWardrobeUploadSummaryLabel,
  getBestWardrobeUploadReviewIndex,
  getReadyWardrobeUploadEntries,
  getWardrobeUploadPrimaryAction,
  isStrongBlockedUploadReason,
  runWardrobeUploadBatch,
  shouldRetryWardrobeUploadAsSingleItem,
} from '../src/services/wardrobe-upload-flow.js';

function createItem(id, category = 'shirt') {
  return {
    id,
    name: id,
    title: id,
    shortTitle: id,
    fullTitle: id,
    category,
    subcategory: '',
    imageUrl: 'asset://image',
    thumbnailUrl: 'asset://image',
    iconName: `icon-${category}`,
    sourceType: 'single_item',
    backgroundRemoved: false,
    extractionConfidence: 0.8,
    confidence: 0.8,
    requiresReview: false,
    reviewState: 'approved',
    colors: [],
    styleTags: [],
    seasonTags: [],
    occasionTags: [],
    createdAt: '2026-03-24T00:00:00.000Z',
    position: { x: 0, y: 0, width: 10, height: 10 },
    metadata: {},
  };
}

describe('Wardrobe Upload Flow — batch review', () => {
  it('should process multiple uploads independently without aborting on one invalid image', async () => {
    const assets = [
      { uri: 'file://hoodie.jpg', width: 100, height: 100, fileName: 'hoodie.jpg' },
      { uri: 'file://interior.jpg', width: 100, height: 100, fileName: 'interior.jpg' },
      { uri: 'file://cap.jpg', width: 100, height: 100, fileName: 'cap.jpg' },
    ];

    const progressSnapshots = [];
    const entries = await runWardrobeUploadBatch(assets, {
      analyze: async (asset) => {
        if (asset.fileName === 'interior.jpg') {
          return { success: false, error: 'Upload only clothing, shoes, or wearable accessories.' };
        }
        return {
          success: true,
          analysis: {
            item: createItem(asset.fileName || 'item', asset.fileName === 'cap.jpg' ? 'accessory' : 'sweater'),
            note: 'ready',
          },
        };
      },
      onProgress: (snapshot, summary) => {
        progressSnapshots.push({
          ready: summary.ready,
          invalid: summary.invalid,
          analyzing: summary.analyzing,
          total: snapshot.length,
        });
      },
    });

    expect(entries).toHaveLength(3);
    expect(entries[0].status).toBe('ready');
    expect(entries[1].status).toBe('invalid');
    expect(entries[2].status).toBe('ready');
    expect(getReadyWardrobeUploadEntries(entries)).toHaveLength(2);
    expect(progressSnapshots.some(snapshot => snapshot.invalid === 1)).toBeTruthy();
  });

  it('should build the correct add action label for valid batch items', () => {
    const entries = [
      { id: '1', asset: { uri: 'a', width: 1, height: 1 }, status: 'ready', item: createItem('hoodie', 'sweater'), note: '', error: '' },
      { id: '2', asset: { uri: 'b', width: 1, height: 1 }, status: 'invalid', item: null, note: '', error: 'bad' },
      { id: '3', asset: { uri: 'c', width: 1, height: 1 }, status: 'ready', item: createItem('shoes', 'shoes'), note: '', error: '' },
    ];

    const action = getWardrobeUploadPrimaryAction(entries);
    expect(action.enabled).toBeTruthy();
    expect(action.label).toBe('Add 2 items');
    expect(buildWardrobeUploadSummaryLabel(entries)).toBe('2 valid / 1 invalid');
  });

  it('should prefer the first ready review entry when choosing current index', () => {
    const entries = [
      { id: '1', asset: { uri: 'a', width: 1, height: 1 }, status: 'invalid', item: null, note: '', error: 'bad' },
      { id: '2', asset: { uri: 'b', width: 1, height: 1 }, status: 'ready', item: createItem('jeans', 'pants'), note: '', error: '' },
      { id: '3', asset: { uri: 'c', width: 1, height: 1 }, status: 'queued', item: null, note: '', error: '' },
    ];

    expect(getBestWardrobeUploadReviewIndex(entries, 2)).toBe(1);
  });

  it('should retry recoverable route failures as single-item uploads', () => {
    expect(shouldRetryWardrobeUploadAsSingleItem({
      inputType: 'unsupported',
      reason: 'Upload type could not be classified confidently.',
    }, false)).toBeTruthy();

    expect(shouldRetryWardrobeUploadAsSingleItem({
      inputType: 'person_outfit',
      reason: 'Image may contain a person but no clear face was found.',
    }, false)).toBeTruthy();
  });

  it('should keep strong blocked reasons invalid without retry', () => {
    expect(isStrongBlockedUploadReason({
      inputType: 'unsupported',
      reason: 'Face detected in upload. Treating as person outfit photo.',
    })).toBeTruthy();

    expect(isStrongBlockedUploadReason({
      inputType: 'unsupported',
      reason: 'Interior room photo detected.',
    })).toBeTruthy();

    expect(shouldRetryWardrobeUploadAsSingleItem({
      inputType: 'unsupported',
      reason: 'Interior room photo detected.',
    }, false)).toBeFalsy();
  });

  it('should keep batch state isolated when one image fails with a parser error', async () => {
    const assets = [
      { uri: 'file://bag.jpg', width: 100, height: 100, fileName: 'bag.jpg' },
      { uri: 'file://broken.jpg', width: 100, height: 100, fileName: 'broken.jpg' },
      { uri: 'file://hat.jpg', width: 100, height: 100, fileName: 'hat.jpg' },
    ];

    const entries = await runWardrobeUploadBatch(assets, {
      analyze: async (asset) => {
        if (asset.fileName === 'broken.jpg') {
          return { success: false, error: 'AI validation returned an unreadable result. Please try this upload again.' };
        }
        return {
          success: true,
          analysis: {
            item: createItem(asset.fileName || 'item', asset.fileName === 'hat.jpg' ? 'accessory' : 'shirt'),
            note: 'ready',
          },
        };
      },
    });

    expect(entries[0].status).toBe('ready');
    expect(entries[1].status).toBe('invalid');
    expect(entries[1].error).toBe('AI validation returned an unreadable result. Please try this upload again.');
    expect(entries[2].status).toBe('ready');
  });
});
