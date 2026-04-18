import Constants from 'expo-constants';

import { resolveBackendBaseUrl } from '../../shared/backend-base-url.js';
import { rewriteBackendBaseUrlHost } from '../../shared/backend-url-rewrite.js';

export function resolveNativeBackendBaseUrl(
  options?: Parameters<typeof resolveBackendBaseUrl>[0],
): string {
  return rewriteBackendBaseUrlHost(
    resolveBackendBaseUrl(options),
    resolveExpoDevHost(),
  );
}

function resolveExpoDevHost(): string {
  const constantsAny = Constants as any;
  const candidates = [
    constantsAny?.expoConfig?.hostUri,
    constantsAny?.manifest?.debuggerHost,
    constantsAny?.manifest2?.extra?.expoGo?.debuggerHost,
    constantsAny?.manifest2?.extra?.expoClient?.hostUri,
  ];

  for (const candidate of candidates) {
    const normalized = String(candidate || '').trim();
    if (!normalized) continue;

    const hostPart = normalized.split('/')[0].split(':')[0].trim().toLowerCase();
    if (!hostPart) continue;
    if (hostPart === '127.0.0.1' || hostPart === 'localhost') continue;
    return hostPart;
  }

  return '';
}
