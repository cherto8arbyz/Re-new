/**
 * Creates a DOM element with attributes and children.
 * @param {string} tag
 * @param {Record<string, string>} [attrs]
 * @param {(HTMLElement | string)[]} [children]
 * @returns {HTMLElement}
 */
export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'className') {
      element.className = value;
    } else if (key.startsWith('data-')) {
      element.setAttribute(key, value);
    } else {
      element.setAttribute(key, value);
    }
  }
  for (const child of children) {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else {
      element.appendChild(child);
    }
  }
  return element;
}

/**
 * Shortcut for querySelector.
 * @param {string} selector
 * @param {Element | Document} [root]
 * @returns {HTMLElement | null}
 */
export function qs(selector, root = document) {
  return /** @type {HTMLElement | null} */ (root.querySelector(selector));
}

/**
 * Shortcut for querySelectorAll.
 * @param {string} selector
 * @param {Element | Document} [root]
 * @returns {HTMLElement[]}
 */
export function qsa(selector, root = document) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(selector)]);
}

/**
 * Sets innerHTML and returns the element.
 * @param {HTMLElement} element
 * @param {string} html
 * @returns {HTMLElement}
 */
export function setHTML(element, html) {
  element.innerHTML = html;
  return element;
}
