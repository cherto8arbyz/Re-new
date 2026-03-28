import { CONFIG } from '../config.js';

/**
 * Runtime config resolver.
 * Priority:
 * 1) window.__RENEW_ENV__ (injected at runtime, e.g. by hosting platform)
 * 2) src/config.js (local development file)
 */

/** @type {Record<string, string>} */
const localConfig = { ...(CONFIG || {}) };

/**
 * @returns {Record<string, string>}
 */
export function getRuntimeConfig() {
  const runtime = /** @type {any} */ (globalThis);
  const runtimeEnv = /** @type {Record<string, string> | undefined} */ (
    runtime?.__RENEW_ENV__ && typeof runtime.__RENEW_ENV__ === 'object'
      ? runtime.__RENEW_ENV__
      : typeof window !== 'undefined' && /** @type {any} */ (window)?.__RENEW_ENV__ && typeof /** @type {any} */ (window).__RENEW_ENV__ === 'object'
        ? /** @type {any} */ (window).__RENEW_ENV__
        : undefined
  );
  const processEnv = /** @type {Record<string, string> | undefined} */ (
    runtime?.process?.env && typeof runtime.process.env === 'object'
      ? /** @type {Record<string, string>} */ (runtime.process.env)
      : undefined
  );

  return {
    ...localConfig,
    ...(processEnv || {}),
    ...(runtimeEnv || {}),
  };
}

/**
 * @param {string} key
 * @param {string} [fallback]
 * @returns {string}
 */
export function readConfig(key, fallback = '') {
  const cfg = getRuntimeConfig();
  const direct = typeof cfg[key] === 'string' ? cfg[key] : '';
  const expoPublic = typeof cfg[`EXPO_PUBLIC_${key}`] === 'string' ? cfg[`EXPO_PUBLIC_${key}`] : '';
  return (direct || expoPublic || fallback).trim();
}
