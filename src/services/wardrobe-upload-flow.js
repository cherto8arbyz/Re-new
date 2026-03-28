/**
 * @typedef {Object} UploadAssetLike
 * @property {string} uri
 * @property {number} width
 * @property {number} height
 * @property {string | null | undefined} [base64]
 * @property {string | null | undefined} [mimeType]
 * @property {string | null | undefined} [fileName]
 */

/**
 * @typedef {Object} UploadAnalysisLike
 * @property {import('../types/models').WardrobeItem} item
 * @property {string} note
 */

/**
 * @typedef {{ success: true, analysis: UploadAnalysisLike } | { success: false, error: string }} UploadAnalysisResult
 */

/**
 * @typedef {'queued' | 'analyzing' | 'ready' | 'invalid'} WardrobeUploadReviewStatus
 */

/**
 * @typedef {Object} WardrobeUploadReviewEntry
 * @property {string} id
 * @property {UploadAssetLike} asset
 * @property {WardrobeUploadReviewStatus} status
 * @property {import('../types/models').WardrobeItem | null} item
 * @property {string} note
 * @property {string} error
 */

/**
 * @typedef {Object} WardrobeUploadBatchSummary
 * @property {number} total
 * @property {number} ready
 * @property {number} invalid
 * @property {number} analyzing
 * @property {number} queued
 */

const STRONG_BLOCKED_UPLOAD_REASON = /\b(face detected|selfie|portrait|face only|full person|person outfit|full-body|room|interior|living room|bedroom|kitchen|pet|dog|cat|food|meal|landscape|mountain|beach|sunset|screenshot|screen grab|keyboard|monitor|mug|bottle)\b/i;
const WEARABLE_UPLOAD_REASON = /\b(top|t[\s-]?shirt|tee|shirt|blouse|hoodie|sweatshirt|sweater|cardigan|knitwear|jacket|coat|blazer|outerwear|dress|jumpsuit|romper|jeans|trousers?|pants|shorts?|skirt|leggings|sneakers?|shoes?|boots?|heels?|sandals?|loafers?|flats?|slippers?|hat|cap|beanie|bag|handbag|shoulder bag|backpack|mini bag|scarf|belt|jewelry|jewellery|sunglasses|eyewear|gloves)\b/i;

/**
 * @param {UploadAssetLike[]} assets
 * @returns {WardrobeUploadReviewEntry[]}
 */
export function createWardrobeUploadReviewEntries(assets) {
  return assets.map((asset, index) => ({
    id: `upload-${index}-${String(asset.fileName || asset.uri || 'asset').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`,
    asset,
    status: 'queued',
    item: null,
    note: '',
    error: '',
  }));
}

/**
 * @param {{ inputType?: string, reason?: string }} input
 * @returns {boolean}
 */
export function isStrongBlockedUploadReason(input) {
  const marker = `${String(input?.inputType || '')} ${String(input?.reason || '')}`.toLowerCase();
  return STRONG_BLOCKED_UPLOAD_REASON.test(marker) && !WEARABLE_UPLOAD_REASON.test(marker);
}

/**
 * @param {{ inputType?: string, reason?: string }} input
 * @param {boolean} hasCandidate
 * @returns {boolean}
 */
export function shouldRetryWardrobeUploadAsSingleItem(input, hasCandidate = false) {
  if (hasCandidate) return false;
  const inputType = String(input?.inputType || '').toLowerCase();
  if (!['unsupported', 'uncertain', 'person_outfit'].includes(inputType)) {
    return false;
  }
  return !isStrongBlockedUploadReason(input);
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @returns {WardrobeUploadBatchSummary}
 */
export function summarizeWardrobeUploadEntries(entries) {
  return entries.reduce((summary, entry) => {
    summary.total += 1;
    if (entry.status === 'ready') summary.ready += 1;
    if (entry.status === 'invalid') summary.invalid += 1;
    if (entry.status === 'analyzing') summary.analyzing += 1;
    if (entry.status === 'queued') summary.queued += 1;
    return summary;
  }, {
    total: 0,
    ready: 0,
    invalid: 0,
    analyzing: 0,
    queued: 0,
  });
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @returns {WardrobeUploadReviewEntry[]}
 */
export function getReadyWardrobeUploadEntries(entries) {
  return entries.filter(entry => entry.status === 'ready' && Boolean(entry.item));
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @returns {{ enabled: boolean, label: string }}
 */
export function getWardrobeUploadPrimaryAction(entries) {
  const readyEntries = getReadyWardrobeUploadEntries(entries);
  const count = readyEntries.length;
  if (count <= 0) {
    return {
      enabled: false,
      label: 'Add item',
    };
  }

  return {
    enabled: true,
    label: count === 1 ? 'Add item' : `Add ${count} items`,
  };
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @param {number} currentIndex
 * @returns {number}
 */
export function getBestWardrobeUploadReviewIndex(entries, currentIndex = 0) {
  if (!entries.length) return 0;
  const currentEntry = entries[currentIndex];
  if (currentEntry && (currentEntry.status === 'ready' || currentEntry.status === 'invalid')) {
    return currentIndex;
  }

  const preferred = entries.findIndex(entry => entry.status === 'ready');
  if (preferred >= 0) return preferred;

  const fallback = entries.findIndex(entry => entry.status === 'invalid');
  if (fallback >= 0) return fallback;

  const queued = entries.findIndex(entry => entry.status === 'queued' || entry.status === 'analyzing');
  return queued >= 0 ? queued : 0;
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @returns {string}
 */
export function buildWardrobeUploadSummaryLabel(entries) {
  const summary = summarizeWardrobeUploadEntries(entries);
  if (summary.total <= 0) return '';
  if (summary.total === 1 && summary.analyzing > 0) return 'Analyzing item...';
  if (summary.analyzing > 0 || summary.queued > 0) {
    return `Analyzed ${summary.ready + summary.invalid} of ${summary.total}`;
  }
  if (summary.invalid <= 0) {
    return summary.ready === 1 ? '1 valid item ready' : `${summary.ready} valid items ready`;
  }
  if (summary.ready <= 0) {
    return `${summary.invalid} invalid ${summary.invalid === 1 ? 'image' : 'images'}`;
  }
  return `${summary.ready} valid / ${summary.invalid} invalid`;
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @param {number} index
 * @param {Partial<WardrobeUploadReviewEntry>} patch
 * @returns {WardrobeUploadReviewEntry[]}
 */
export function patchWardrobeUploadEntry(entries, index, patch) {
  return entries.map((entry, entryIndex) => (
    entryIndex === index
      ? { ...entry, ...patch }
      : entry
  ));
}

/**
 * @param {WardrobeUploadReviewEntry[]} entries
 * @param {number} index
 * @param {import('../types/models').GarmentCategory} category
 * @param {(item: import('../types/models').WardrobeItem, category: import('../types/models').GarmentCategory) => import('../types/models').WardrobeItem} rebuild
 * @returns {WardrobeUploadReviewEntry[]}
 */
export function overrideWardrobeUploadEntryCategory(entries, index, category, rebuild) {
  const target = entries[index];
  if (!target?.item) return entries;
  return patchWardrobeUploadEntry(entries, index, {
    item: rebuild(target.item, category),
  });
}

/**
 * @param {UploadAssetLike[]} assets
 * @param {{
 *   analyze: (asset: UploadAssetLike) => Promise<UploadAnalysisResult>,
 *   onProgress?: (entries: WardrobeUploadReviewEntry[], summary: WardrobeUploadBatchSummary, activeIndex: number) => void,
 * }} options
 * @returns {Promise<WardrobeUploadReviewEntry[]>}
 */
export async function runWardrobeUploadBatch(assets, options) {
  const analyze = options?.analyze;
  if (typeof analyze !== 'function') {
    throw new Error('runWardrobeUploadBatch requires an analyze function.');
  }

  let entries = createWardrobeUploadReviewEntries(assets);
  emitBatchProgress(options?.onProgress, entries, 0);

  for (let index = 0; index < assets.length; index += 1) {
    entries = patchWardrobeUploadEntry(entries, index, {
      status: 'analyzing',
      error: '',
      note: '',
    });
    emitBatchProgress(options?.onProgress, entries, index);

    try {
      const result = await analyze(assets[index]);
      entries = patchWardrobeUploadEntry(entries, index, result.success
        ? {
            status: 'ready',
            item: result.analysis.item,
            note: result.analysis.note || '',
            error: '',
          }
        : {
            status: 'invalid',
            item: null,
            note: '',
            error: result.error || 'Upload only clothing, shoes, or wearable accessories.',
          });
    } catch (error) {
      entries = patchWardrobeUploadEntry(entries, index, {
        status: 'invalid',
        item: null,
        note: '',
        error: error instanceof Error
          ? error.message
          : 'Upload only clothing, shoes, or wearable accessories.',
      });
    }

    emitBatchProgress(options?.onProgress, entries, index);
  }

  return entries;
}

/**
 * @param {((entries: WardrobeUploadReviewEntry[], summary: WardrobeUploadBatchSummary, activeIndex: number) => void) | undefined} onProgress
 * @param {WardrobeUploadReviewEntry[]} entries
 * @param {number} activeIndex
 */
function emitBatchProgress(onProgress, entries, activeIndex) {
  if (typeof onProgress !== 'function') return;
  onProgress(entries, summarizeWardrobeUploadEntries(entries), activeIndex);
}
