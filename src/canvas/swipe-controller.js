import { attachSwipe } from '../utils/gesture.js';
import { swipeOutfit } from '../state/actions.js';

/**
 * Swipe Controller — wraps the canvas with swipe gesture for outfit switching.
 */
export class SwipeController {
  /**
   * @param {HTMLElement} canvasWrapper
   * @param {import('../state/store.js').Store<import('../state/app-state.js').AppState, any>} store
   */
  constructor(canvasWrapper, store) {
    this.wrapper = canvasWrapper;
    this.store = store;
    /** @type {{ destroy: () => void } | null} */
    this.swipeHandler = null;

    this.init();
  }

  init() {
    this.swipeHandler = attachSwipe({
      element: this.wrapper,
      threshold: 50,
      onSwipe: (direction) => {
        this.store.dispatch(swipeOutfit(direction));
        this.animateTransition(direction);
      },
      onMove: (deltaX) => {
        const canvas = this.wrapper.querySelector('.outfit-canvas');
        if (canvas instanceof HTMLElement) {
          const clamped = Math.max(-80, Math.min(80, deltaX * 0.3));
          canvas.style.transform = `translateX(${clamped}px)`;
          canvas.style.opacity = String(1 - Math.abs(clamped) / 200);
        }
      },
      onEnd: () => {
        const canvas = this.wrapper.querySelector('.outfit-canvas');
        if (canvas instanceof HTMLElement) {
          canvas.style.transform = '';
          canvas.style.opacity = '';
        }
      },
    });
  }

  /**
   * @param {'left' | 'right'} direction
   */
  animateTransition(direction) {
    const canvas = this.wrapper.querySelector('.outfit-canvas');
    if (!(canvas instanceof HTMLElement)) return;

    const offset = direction === 'left' ? -100 : 100;
    canvas.style.transition = 'none';
    canvas.style.transform = `translateX(${offset}px)`;
    canvas.style.opacity = '0';

    requestAnimationFrame(() => {
      canvas.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
      canvas.style.transform = 'translateX(0)';
      canvas.style.opacity = '1';
    });
  }

  destroy() {
    this.swipeHandler?.destroy();
  }
}
