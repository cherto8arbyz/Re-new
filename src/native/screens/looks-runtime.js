/**
 * Pure helpers for active Looks screen runtime behavior.
 */

export const LOOK_CANVAS_CONTROL_POSITIONS = Object.freeze({
  head: 16,
  accessory: 27,
  torso: 38,
  legs: 61,
  socks: 77,
  feet: 84,
});

/**
 * @param {{
 *  manualOutfit: any,
 *  generatedLooks: any[],
 *  activeOutfitIndex: number,
 *  fallbackOutfit: any,
 * }} input
 * @returns {any | null}
 */
export function resolveLooksDisplayOutfit(input) {
  if (input.manualOutfit) return input.manualOutfit;
  const generated = Array.isArray(input.generatedLooks)
    ? input.generatedLooks[Math.max(0, Number(input.activeOutfitIndex) || 0)] || null
    : null;
  return generated || input.fallbackOutfit || null;
}

/**
 * @param {Array<{ id?: string } | null | undefined>} options
 * @param {string | null | undefined} currentId
 * @param {number} direction
 * @returns {{ id?: string } | null}
 */
export function pickNextCycledOption(options, currentId, direction) {
  const list = Array.isArray(options)
    ? options.filter(option => option !== null && option !== undefined)
    : [];
  if (!list.length) return null;
  if (list.length === 1) return list[0];

  const currentIndex = list.findIndex(option => String(option?.id || '') === String(currentId || ''));
  if (currentIndex < 0) {
    return direction < 0 ? (list[list.length - 1] || null) : (list[0] || null);
  }

  const nextIndex = (currentIndex + (direction < 0 ? -1 : 1) + list.length) % list.length;
  return list[nextIndex] || null;
}
