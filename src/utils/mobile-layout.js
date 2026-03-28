/**
 * Safe-area + keyboard inset coordinator.
 * Updates CSS variables:
 * - --keyboard-inset-height
 */

/**
 * @param {HTMLElement} root
 * @returns {() => void}
 */
export function installMobileLayout(root) {
  if (typeof window === 'undefined') return () => {};

  const vv = window.visualViewport;
  if (!vv) return () => {};

  /** @param {number} px */
  const setKeyboardInset = (px) => {
    const value = `${Math.max(0, Math.round(px))}px`;
    document.documentElement.style.setProperty('--keyboard-inset-height', value);
    root.classList.toggle('app-screen--keyboard-open', px > 12);
  };

  const update = () => {
    const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    setKeyboardInset(keyboardInset);
  };

  /** @param {FocusEvent} event */
  const onFocusIn = (event) => {
    const target = /** @type {HTMLElement | null} */ (event.target instanceof HTMLElement ? event.target : null);
    if (!target) return;

    if (target.matches('input, textarea, [contenteditable="true"]')) {
      setTimeout(() => {
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch {
          // no-op
        }
      }, 100);
    }
  };

  const onFocusOut = () => {
    setTimeout(update, 120);
  };

  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('focusout', onFocusOut);
  update();

  return () => {
    vv.removeEventListener('resize', update);
    vv.removeEventListener('scroll', update);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('focusout', onFocusOut);
    setKeyboardInset(0);
  };
}
