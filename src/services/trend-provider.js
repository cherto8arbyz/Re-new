import { TrendService } from './trend-service.js';

const JSON_TREND_FEED = [
  { tag: 'quiet luxury', score: 0.95, source: 'json-feed' },
  { tag: 'wide leg', score: 0.88, source: 'json-feed' },
  { tag: 'structured outerwear', score: 0.81, source: 'json-feed' },
  { tag: 'monochrome', score: 0.78, source: 'json-feed' },
  { tag: 'sport luxe', score: 0.69, source: 'json-feed' },
];

/**
 * @interface
 */
export class TrendProvider {
  /**
   * @param {{ date: string, region: string, accessToken?: string }} input
   * @returns {Promise<import('../models/domain-models.js').TrendSignal[]>}
   */
  async getSignals(input) {
    void input;
    throw new Error('Not implemented');
  }
}

/**
 * Trend provider backed by app TrendService (remote/supabase + fallback).
 */
export class ServiceTrendProvider extends TrendProvider {
  constructor() {
    super();
    this.service = new TrendService();
  }

  /**
   * @param {{ date: string, region: string, accessToken?: string }} input
   */
  async getSignals(input) {
    const snapshot = await this.service.getTrendSignals(input.date, input.region, input.accessToken);
    if (Array.isArray(snapshot?.signals) && snapshot.signals.length > 0) {
      return snapshot.signals;
    }
    return getJsonTrendSignals();
  }
}

/**
 * JSON-backed trend provider fallback.
 */
export class JsonTrendProvider extends TrendProvider {
  /**
   * @param {{ date: string, region: string }} _input
   */
  async getSignals(_input) {
    return getJsonTrendSignals();
  }
}

/**
 * @returns {import('../models/domain-models.js').TrendSignal[]}
 */
export function getJsonTrendSignals() {
  return Array.isArray(JSON_TREND_FEED)
    ? JSON_TREND_FEED
      .map((/** @type {any} */ row) => ({
        tag: String(row?.tag || '').trim(),
        score: Number(row?.score ?? 0),
        source: String(row?.source || 'json-feed'),
      }))
      .filter(signal => signal.tag.length > 0)
    : [];
}
