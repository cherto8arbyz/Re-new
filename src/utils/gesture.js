/**
 * @typedef {Object} SwipeConfig
 * @property {HTMLElement} element
 * @property {(direction: 'left' | 'right') => void} onSwipe
 * @property {(deltaX: number) => void} [onMove]
 * @property {() => void} [onEnd]
 * @property {number} [threshold] - Minimum px to trigger swipe (default: 50)
 */

/**
 * Attaches horizontal swipe detection to an element.
 * Supports both mouse and touch via pointer events.
 * @param {SwipeConfig} config
 * @returns {{ destroy: () => void }}
 */
export function attachSwipe(config) {
  const { element, onSwipe, onMove, onEnd, threshold = 50 } = config;
  let startX = 0;
  let startY = 0;
  let isDragging = false;
  let isHorizontal = /** @type {boolean | null} */ (null);

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
    isHorizontal = null;
    element.setPointerCapture(e.pointerId);
  }

  /** @param {PointerEvent} e */
  function handlePointerMove(e) {
    if (!isDragging) return;
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;

    // Determine scroll direction lock on first significant move
    if (isHorizontal === null && (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10)) {
      isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
    }

    if (isHorizontal) {
      e.preventDefault();
      onMove?.(deltaX);
    }
  }

  /** @param {PointerEvent} e */
  function handlePointerUp(e) {
    if (!isDragging) return;
    isDragging = false;
    const deltaX = e.clientX - startX;

    if (isHorizontal && Math.abs(deltaX) >= threshold) {
      onSwipe(deltaX < 0 ? 'left' : 'right');
    }

    onEnd?.();
    isHorizontal = null;
  }

  element.addEventListener('pointerdown', handlePointerDown);
  element.addEventListener('pointermove', handlePointerMove);
  element.addEventListener('pointerup', handlePointerUp);
  element.addEventListener('pointercancel', handlePointerUp);
  element.style.touchAction = 'pan-y';

  return {
    destroy() {
      element.removeEventListener('pointerdown', handlePointerDown);
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerup', handlePointerUp);
      element.removeEventListener('pointercancel', handlePointerUp);
    },
  };
}
