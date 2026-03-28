/**
 * @fileoverview trends-tool — research_fashion_trends implementation.
 * Production path: replace with real scraping pipeline or a trends API (e.g. EDITED, Trendalytics).
 * Current state: returns curated mock trend data ranked by semantic relevance to the query.
 */

/**
 * @typedef {Object} TrendEntry
 * @property {string}   title       - Trend name
 * @property {string}   description - Brief description of the trend
 * @property {string[]} keyPieces   - Representative garment/category keywords
 * @property {string[]} celebrities - Celebrity/influencer references
 * @property {'rising' | 'peak' | 'declining'} status
 */

/**
 * @typedef {Object} TrendsResult
 * @property {string}       query         - The original query
 * @property {TrendEntry[]} trends        - Top matching trends (up to 5)
 * @property {string}       stylistAdvice - Synthesized actionable advice
 * @property {boolean}      isOfflineFallback
 */

/**
 * Curated trend database (mock Instagram/Pinterest intelligence, Q1 2026).
 * Each entry has `keywords` for matching against the user query.
 * @type {Array<TrendEntry & { keywords: string[] }>}
 */
const TREND_DATABASE = [
  {
    title: 'Quiet Luxury 2.0',
    description: 'Elevated minimalism with invisible branding — cashmere, neutral palettes, impeccable tailoring.',
    keyPieces: ['cashmere sweater', 'camel coat', 'straight-leg trousers', 'loafers'],
    celebrities: ['Sofia Richie Grainge', 'Carolyn Bessette-Kennedy (archive)'],
    status: 'peak',
    keywords: ['luxury', 'minimal', 'quiet', 'neutral', 'cashmere', 'tailoring', 'beige', 'camel'],
  },
  {
    title: 'Utility Maximalism',
    description: 'Cargo everything — multi-pocket silhouettes, technical fabrics, functional accessories.',
    keyPieces: ['cargo pants', 'cargo jacket', 'utility vest', 'chunky boots'],
    celebrities: ['Kendall Jenner', 'A$AP Rocky'],
    status: 'peak',
    keywords: ['cargo', 'utility', 'pocket', 'technical', 'functional', 'outdoor', 'streetwear'],
  },
  {
    title: 'Sheer Layering',
    description: 'Transparent fabrics over basics — organza, chiffon, mesh layered over bralettes or bodysuits.',
    keyPieces: ['sheer blouse', 'mesh top', 'organza skirt', 'bralette'],
    celebrities: ['Zendaya', 'Dua Lipa'],
    status: 'peak',
    keywords: ['sheer', 'transparent', 'mesh', 'organza', 'layer', 'chiffon'],
  },
  {
    title: 'Coastal Grandmother',
    description: 'Effortless nautical ease — linen, wide-brim hats, striped knits, relaxed silhouettes.',
    keyPieces: ['linen pants', 'striped sweater', 'wide-brim hat', 'espadrilles'],
    celebrities: ['Glenn Close (Succession styling)'],
    status: 'declining',
    keywords: ['coastal', 'linen', 'stripe', 'nautical', 'relaxed', 'summer', 'beach'],
  },
  {
    title: 'Oversized Tailoring',
    description: 'Power shoulders, roomie blazers, wide-leg trousers — structured but lived-in.',
    keyPieces: ['oversized blazer', 'wide-leg trousers', 'power shoulder coat', 'boyfriend shirt'],
    celebrities: ['Hailey Bieber', 'Rosé (BLACKPINK)'],
    status: 'peak',
    keywords: ['oversized', 'blazer', 'tailoring', 'shoulder', 'wide-leg', 'suit', 'structured'],
  },
  {
    title: 'Sport Luxe',
    description: 'Activewear codes in elevated fabrics — technical joggers with leather, cycling shorts dressed up.',
    keyPieces: ['technical joggers', 'cycling shorts', 'performance jacket', 'sleek sneakers'],
    celebrities: ['Kim Kardashian', 'Victoria Beckham'],
    status: 'rising',
    keywords: ['sport', 'athletic', 'activewear', 'jogger', 'sneaker', 'performance', 'gym'],
  },
  {
    title: 'Dopamine Dressing',
    description: 'Maximum color saturation — electric brights, clashing prints, unapologetic maximalism.',
    keyPieces: ['cobalt blue coat', 'chartreuse knit', 'color-blocked trousers', 'statement bag'],
    celebrities: ['Billy Porter', 'Lizzo'],
    status: 'declining',
    keywords: ['color', 'bright', 'vibrant', 'bold', 'print', 'pattern', 'maximalist', 'dopamine'],
  },
  {
    title: 'Dark Romance',
    description: 'Gothic influences meet feminine tailoring — corseted silhouettes, velvet, midnight tones.',
    keyPieces: ['corset top', 'velvet blazer', 'midi skirt', 'ankle boots'],
    celebrities: ['Olivia Rodrigo', 'Taylor Swift (Midnights era)'],
    status: 'rising',
    keywords: ['dark', 'gothic', 'velvet', 'corset', 'romance', 'black', 'midnight', 'evening'],
  },
];

/**
 * Scores a trend entry against a query string (simple keyword overlap).
 * @param {typeof TREND_DATABASE[0]} trend
 * @param {string} query
 * @returns {number} relevance score 0–N
 */
function _scoreRelevance(trend, query) {
  const tokens = query.toLowerCase().split(/\W+/).filter(Boolean);
  let score = 0;
  for (const token of tokens) {
    if (trend.keywords.some(kw => kw.includes(token) || token.includes(kw))) score += 2;
    if (trend.title.toLowerCase().includes(token)) score += 3;
    if (trend.description.toLowerCase().includes(token)) score += 1;
    if (trend.keyPieces.some(p => p.toLowerCase().includes(token))) score += 1;
  }
  // Boost peak trends
  if (trend.status === 'peak') score += 1;
  return score;
}

/**
 * Synthesizes actionable stylist advice from matched trends.
 * @param {TrendEntry[]} trends
 * @param {string} query
 * @returns {string}
 */
function _synthesizeAdvice(trends, query) {
  if (trends.length === 0) {
    return `No strong trend matches for "${query}" right now — focus on classic, timeless combinations.`;
  }
  const topTrend = trends[0];
  const keyPiecesStr = topTrend.keyPieces.slice(0, 2).join(' and ');
  const statusNote = topTrend.status === 'rising'
    ? 'This trend is gaining momentum — early adopter advantage.'
    : topTrend.status === 'declining'
    ? 'This trend is fading — interpret with a contemporary twist to stay fresh.'
    : 'This trend is at peak visibility — safe and stylish choice right now.';
  return `Top match: "${topTrend.title}". Key pieces: ${keyPiecesStr}. ${statusNote}`;
}

/**
 * Tool handler: research_fashion_trends.
 * @param {{ query: string }} args
 * @returns {Promise<TrendsResult>}
 */
export async function researchFashionTrends(args) {
  const { query } = args;

  // Score and sort all trends by relevance to query
  const scored = TREND_DATABASE
    .map(trend => ({ trend, score: _scoreRelevance(trend, query) }))
    .sort((a, b) => b.score - a.score);

  // Return top 3 (or fewer if low relevance)
  const topTrends = scored
    .filter(({ score }) => score > 0)
    .slice(0, 3)
    .map(({ trend }) => {
      // Strip internal keywords field from output
      const { keywords: _kw, ...publicTrend } = trend;
      void _kw;
      return publicTrend;
    });

  return {
    query,
    trends: topTrends,
    stylistAdvice: _synthesizeAdvice(topTrends, query),
    isOfflineFallback: true,
  };
}
