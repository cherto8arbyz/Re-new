/**
 * Rewrites locally configured backend URLs so Expo devices can reach the
 * current development machine even when the saved LAN IP has changed.
 *
 * @param {string | null | undefined} baseUrl
 * @param {string | null | undefined} runtimeHost
 * @returns {string}
 */
export function rewriteBackendBaseUrlHost(baseUrl, runtimeHost) {
  const normalizedBaseUrl = String(baseUrl || '').trim();
  const normalizedRuntimeHost = String(runtimeHost || '').trim().toLowerCase();
  if (!normalizedBaseUrl) return '';

  try {
    const parsed = new URL(normalizedBaseUrl);
    if (!shouldRewriteBackendHost(parsed.hostname, normalizedRuntimeHost)) {
      return normalizedBaseUrl.replace(/\/+$/, '');
    }

    parsed.hostname = normalizedRuntimeHost;
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return normalizedBaseUrl.replace(/\/+$/, '');
  }
}

/**
 * @param {string | null | undefined} hostname
 * @param {string | null | undefined} runtimeHost
 * @returns {boolean}
 */
export function shouldRewriteBackendHost(hostname, runtimeHost) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  const normalizedRuntimeHost = String(runtimeHost || '').trim().toLowerCase();

  if (!normalizedHost || !normalizedRuntimeHost) return false;
  if (normalizedHost === normalizedRuntimeHost) return false;
  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '0.0.0.0') {
    return true;
  }

  return isPrivateNetworkHost(normalizedHost);
}

/**
 * @param {string | null | undefined} hostname
 * @returns {boolean}
 */
export function isPrivateNetworkHost(hostname) {
  const normalizedHost = String(hostname || '').trim().toLowerCase();
  if (!normalizedHost) return false;
  if (normalizedHost === 'localhost' || normalizedHost === '127.0.0.1' || normalizedHost === '0.0.0.0') {
    return true;
  }

  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(normalizedHost);
  if (!match) return false;

  const octets = match.slice(1).map(Number);
  if (octets.some(value => value < 0 || value > 255)) return false;

  if (octets[0] === 10) return true;
  if (octets[0] === 127) return true;
  if (octets[0] === 169 && octets[1] === 254) return true;
  if (octets[0] === 192 && octets[1] === 168) return true;
  if (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) return true;
  return false;
}
