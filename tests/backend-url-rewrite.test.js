import { describe, expect, it } from './runner.js';
import {
  isPrivateNetworkHost,
  rewriteBackendBaseUrlHost,
  shouldRewriteBackendHost,
} from '../src/shared/backend-url-rewrite.js';

describe('backend url rewrite', () => {
  it('rewrites localhost to the current Expo host', () => {
    expect(rewriteBackendBaseUrlHost('http://127.0.0.1:8000/', '172.20.10.2'))
      .toBe('http://172.20.10.2:8000');
  });

  it('rewrites stale private LAN ips to the current Expo host', () => {
    expect(rewriteBackendBaseUrlHost('http://192.168.100.128:8000', '172.20.10.2'))
      .toBe('http://172.20.10.2:8000');
  });

  it('keeps public domains untouched', () => {
    expect(rewriteBackendBaseUrlHost('https://re-new-tan.vercel.app', '172.20.10.2'))
      .toBe('https://re-new-tan.vercel.app');
  });

  it('detects private-network hosts only when rewrite is safe', () => {
    expect(isPrivateNetworkHost('192.168.1.5')).toBeTruthy();
    expect(shouldRewriteBackendHost('192.168.1.5', '172.20.10.2')).toBeTruthy();
    expect(shouldRewriteBackendHost('re-new-tan.vercel.app', '172.20.10.2')).toBeFalsy();
  });
});
