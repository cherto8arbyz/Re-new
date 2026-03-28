/**
 * Helpers for keeping Gemini look generation varied across repeated taps.
 */

export const LOOK_VARIATION_DIRECTIONS = Object.freeze([
  'clean city minimal',
  'soft elevated casual',
  'sport-luxe edge',
  'relaxed weekend denim',
  'sharp smart-casual',
  'textured monochrome',
  'streetwear contrast',
  'light layered polish',
]);

/**
 * @param {Array<{ garments?: Array<{ id?: string }>, styleName?: string, name?: string }>} previousOutfits
 * @param {string} selectedDate
 * @param {string} userStyle
 * @param {number} [nowValue]
 * @returns {{ direction: string, previousSignatures: string[], previousStyleNames: string[] }}
 */
export function buildLookVariationRequest(previousOutfits, selectedDate, userStyle, nowValue = Date.now()) {
  const previousSignatures = (previousOutfits || [])
    .map(outfit => buildOutfitSignature(outfit))
    .filter(Boolean);
  const previousStyleNames = (previousOutfits || [])
    .map(outfit => String(outfit?.styleName || outfit?.name || '').trim())
    .filter(Boolean);
  const rotationSource = [
    selectedDate,
    userStyle,
    previousStyleNames.join('|'),
    previousSignatures.join('|'),
    String(nowValue),
  ].join('|');
  const startIndex = Math.abs(simpleHash(rotationSource)) % LOOK_VARIATION_DIRECTIONS.length;
  const lastStyleMarker = String(previousStyleNames[0] || '').toLowerCase();

  let direction = LOOK_VARIATION_DIRECTIONS[startIndex];
  for (let index = 0; index < LOOK_VARIATION_DIRECTIONS.length; index += 1) {
    const candidate = LOOK_VARIATION_DIRECTIONS[(startIndex + index) % LOOK_VARIATION_DIRECTIONS.length];
    if (!lastStyleMarker || !lastStyleMarker.includes(candidate.split(' ')[0])) {
      direction = candidate;
      break;
    }
  }

  return {
    direction,
    previousSignatures,
    previousStyleNames,
  };
}

/**
 * @param {Array<{ garments?: Array<{ id?: string }> }>} candidates
 * @param {Array<{ garments?: Array<{ id?: string }> }>} previousOutfits
 * @returns {any | null}
 */
export function pickDistinctLeadOutfit(candidates, previousOutfits) {
  const previousSignatures = new Set((previousOutfits || []).map(outfit => buildOutfitSignature(outfit)).filter(Boolean));
  const validCandidates = (candidates || []).filter(candidate => Array.isArray(candidate?.garments) && candidate.garments.length > 0);
  if (!validCandidates.length) return null;

  const distinct = validCandidates.find(candidate => !previousSignatures.has(buildOutfitSignature(candidate)));
  return distinct || validCandidates[0];
}

/**
 * @param {{ signals?: Array<{ tag?: string, score?: number }> } | null | undefined} snapshot
 * @returns {string}
 */
export function describeTrendSignals(snapshot) {
  const signals = Array.isArray(snapshot?.signals) ? snapshot.signals : [];
  if (!signals.length) return 'No fresh trend signals available.';

  return signals
    .slice(0, 4)
    .map(signal => `${String(signal?.tag || '').trim()} (${Number(signal?.score ?? 0).toFixed(2)})`)
    .filter(Boolean)
    .join(', ');
}

/**
 * @param {Array<{ title?: string, dressCode?: string }> | null | undefined} events
 * @returns {string}
 */
export function describeCalendarEvents(events) {
  const entries = Array.isArray(events) ? events : [];
  if (!entries.length) return 'No important calendar constraints.';

  return entries
    .slice(0, 3)
    .map(event => {
      const title = String(event?.title || '').trim() || 'Untitled event';
      const dressCode = String(event?.dressCode || '').trim();
      return dressCode ? `${title} [${dressCode}]` : title;
    })
    .join('; ');
}

/**
 * @param {{ garments?: Array<{ id?: string }> } | Array<{ id?: string }> | null | undefined} input
 * @returns {string}
 */
export function buildOutfitSignature(input) {
  const garments = Array.isArray(input)
    ? input
    : Array.isArray(input?.garments)
      ? input.garments
      : [];

  return garments
    .map(item => String(item?.id || '').trim())
    .filter(Boolean)
    .sort()
    .join('|');
}

/**
 * @param {string} value
 * @returns {number}
 */
function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash;
}
