/**
 * @typedef {Object} DevicePreset
 * @property {string} name
 * @property {number} width - CSS pixels
 * @property {number} height - CSS pixels
 * @property {number} pixelRatio
 */

/** @type {DevicePreset[]} */
export const DEVICES = [
  { name: 'iPhone 15 Pro', width: 393, height: 852, pixelRatio: 3 },
  { name: 'iPhone SE', width: 375, height: 667, pixelRatio: 2 },
  { name: 'Pixel 8', width: 412, height: 915, pixelRatio: 2.625 },
  { name: 'Samsung S24', width: 360, height: 780, pixelRatio: 3 },
];

export const DEFAULT_DEVICE = DEVICES[0];
