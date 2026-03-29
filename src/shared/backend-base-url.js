import { readConfig } from '../api/backend-config.js';

const DEFAULT_LOCAL_PIPELINE_URL = 'http://127.0.0.1:8000';

/**
 * @param {string | null | undefined} value
 * @returns {string}
 */
function normalizeUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

/**
 * @returns {boolean}
 */
export function isDevelopmentRuntime() {
  const runtime = /** @type {any} */ (globalThis);

  if (typeof runtime?.__DEV__ === 'boolean') {
    return runtime.__DEV__;
  }

  const nodeEnv = String(runtime?.process?.env?.NODE_ENV || '').trim().toLowerCase();
  if (nodeEnv === 'development' || nodeEnv === 'test') return true;
  if (nodeEnv === 'production') return false;

  if (typeof window !== 'undefined' && window?.location?.hostname) {
    const host = String(window.location.hostname).trim().toLowerCase();
    return host === 'localhost' || host === '127.0.0.1';
  }

  return false;
}

/**
 * Resolves backend base URL from runtime config with a safe local fallback for dev only.
 *
 * @param {{
 *  preferProxy?: boolean,
 *  allowDevLocalFallback?: boolean,
 * } | undefined} [options]
 * @returns {string}
 */
export function resolveBackendBaseUrl(options = {}) {
  const preferProxy = options?.preferProxy !== false;
  const allowDevLocalFallback = options?.allowDevLocalFallback !== false;

  const configuredProxy = normalizeUrl(readConfig('AI_PROXY_URL'));
  const configuredPipeline = normalizeUrl(readConfig('IMAGE_PIPELINE_URL'));

  const configured = preferProxy
    ? (configuredProxy || configuredPipeline)
    : (configuredPipeline || configuredProxy);

  if (configured) return configured;
  if (allowDevLocalFallback && isDevelopmentRuntime()) return DEFAULT_LOCAL_PIPELINE_URL;
  return '';
}
