import { SupabaseApi } from '../api/supabase-api.js';

/**
 * @typedef {Object} TrendSignal
 * @property {string} tag
 * @property {number} score
 * @property {string} [source]
 */

/**
 * @typedef {Object} TrendSnapshot
 * @property {string} date
 * @property {string} region
 * @property {TrendSignal[]} signals
 * @property {'supabase' | 'fallback'} source
 */

const FALLBACK_SIGNALS = {
  winter: ['quiet luxury', 'wool layering', 'structured coat', 'monochrome knitwear'],
  spring: ['light layering', 'wide leg', 'denim skirt', 'soft tailoring'],
  summer: ['linen set', 'coastal minimal', 'relaxed shirt', 'sport luxe'],
  autumn: ['earth palette', 'trench core', 'chunky knit', 'dark romance'],
};

export class TrendService {
  constructor() {
    this.supabase = new SupabaseApi();
  }

  /**
   * @param {string} date
   * @param {string} region
   * @param {string} [accessToken]
   * @returns {Promise<TrendSnapshot>}
   */
  async getTrendSignals(date, region, accessToken) {
    const normalizedRegion = (region || 'global').trim() || 'global';
    const remote = await this.supabase.getTrendSnapshots(date, normalizedRegion, accessToken);

    if (Array.isArray(remote) && remote.length > 0) {
      const signals = this._normalizeSignals(remote[0]?.signals);
      if (signals.length > 0) {
        return {
          date,
          region: normalizedRegion,
          signals,
          source: 'supabase',
        };
      }
    }

    return {
      date,
      region: normalizedRegion,
      signals: this._seasonalFallbackSignals(date),
      source: 'fallback',
    };
  }

  /**
   * @param {any} raw
   * @returns {TrendSignal[]}
   */
  _normalizeSignals(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((/** @type {any} */ entry) => ({
        tag: String(entry?.tag || ''),
        score: Number(entry?.score ?? 0),
        source: entry?.source ? String(entry.source) : undefined,
      }))
      .filter(signal => signal.tag.length > 0)
      .slice(0, 12);
  }

  /**
   * @param {string} date
   * @returns {TrendSignal[]}
   */
  _seasonalFallbackSignals(date) {
    const month = Number(date.slice(5, 7));
    const season =
      month === 12 || month <= 2 ? 'winter' :
      month <= 5 ? 'spring' :
      month <= 8 ? 'summer' :
      'autumn';

    return FALLBACK_SIGNALS[season].map((tag, index) => ({
      tag,
      score: Number((1 - index * 0.1).toFixed(2)),
      source: 'seasonal-fallback',
    }));
  }
}
