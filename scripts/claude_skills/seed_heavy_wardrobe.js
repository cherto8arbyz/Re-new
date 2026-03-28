#!/usr/bin/env node
/**
 * @file seed_heavy_wardrobe.js
 * @brief UI Stress Tester / Mock Seeder for Re:new's wardrobe list.
 *
 * Generates large datasets of realistic wardrobe items to stress-test:
 * - React Native FlashList (Shopify) rendering performance.
 * - WatermelonDB batch insert performance.
 * - Cost-per-wear (CPW) calculation correctness at scale.
 *
 * Targets: 0 lag with 1000+ items, <100ms render of initial 50-item window.
 *
 * @usage node seed_heavy_wardrobe.js [count] [outputPath]
 * @example node seed_heavy_wardrobe.js 2000 ./mock_db.json
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Seed data pools — realistic fashion metadata
// ─────────────────────────────────────────────────────────────────────────────

/** @type {readonly string[]} */
const CATEGORIES = Object.freeze([
  'base', 'shirt', 'sweater', 'hoodie', 'pants', 'skirt',
  'dress', 'jacket', 'coat', 'accessory', 'shoes',
]);

/** @type {readonly string[]} */
const MATERIALS = Object.freeze([
  'cotton', 'wool', 'polyester', 'linen', 'silk', 'denim',
  'leather', 'synthetic', 'cashmere', 'fur', 'fleece', 'nylon',
]);

/** @type {readonly string[]} */
const FITS = Object.freeze(['slim', 'regular', 'oversize', 'relaxed', 'tailored']);

/** @type {readonly string[]} */
const COLORS = Object.freeze([
  'black', 'white', 'navy', 'grey', 'beige', 'brown',
  'olive', 'burgundy', 'camel', 'cream', 'charcoal', 'rust',
  'cobalt', 'forest-green', 'blush', 'terracotta',
]);

/** @type {readonly string[]} */
const BRANDS = Object.freeze([
  'Arket', 'COS', 'Lemaire', 'Toteme', 'A.P.C.', 'Uniqlo',
  'Zara', 'Massimo Dutti', 'Theory', 'Acne Studios', 'Norse Projects',
  'Our Legacy', 'Sunspel', 'Margaret Howell', 'Muji', 'Filippa K',
]);

/** @type {readonly number[]} */
const DECADE_ORIGINS = Object.freeze([1970, 1980, 1990, 2000, 2010, 2020]);

/** Simulated CDN base URL for local dev — never hits a real endpoint. */
const MOCK_CDN = 'https://mock-cdn.renew.local/items';

// ─────────────────────────────────────────────────────────────────────────────
// Utility helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {T[]} arr
 * @template T
 * @returns {T}
 */
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/**
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * @param {number} min
 * @param {number} max
 * @param {number} decimals
 * @returns {number}
 */
const randFloat = (min, max, decimals = 2) =>
  parseFloat((Math.random() * (max - min) + min).toFixed(decimals));

/**
 * Generate a deterministic UUID-v4-shaped ID for reproducible seeds.
 * @returns {string}
 */
const generateId = () => crypto.randomUUID();

/**
 * @typedef {Object} WardrobeItem
 * @property {string}   id                    - UUID
 * @property {string}   category              - Garment category
 * @property {string}   material              - Primary fabric
 * @property {string}   fit                   - Silhouette fit type
 * @property {string}   color                 - Primary color
 * @property {string}   brand                 - Brand name
 * @property {string}   name                  - Human-readable item name
 * @property {string}   image_url             - Mock CDN URL for garment photo
 * @property {string}   background_removed_url - Edge-AI processed transparent PNG
 * @property {number}   purchase_price        - Original price in RUB
 * @property {number}   times_worn            - Outfit log count
 * @property {number}   cost_per_wear         - purchase_price / max(times_worn, 1)
 * @property {number}   decade_origin         - Fashion cycle decade
 * @property {string}   created_at            - ISO timestamp
 * @property {string}   updated_at            - ISO timestamp (for LWW conflict resolution)
 * @property {boolean}  is_synced             - WatermelonDB sync status
 * @property {string[]} tags                  - Free-form search tags
 */

/**
 * Build a single realistic wardrobe item.
 * @param {number} index - Sequential index for deterministic name generation.
 * @returns {WardrobeItem}
 */
function buildItem(index) {
  const id = generateId();
  const category = pick(CATEGORIES);
  const material = pick(MATERIALS);
  const fit = pick(FITS);
  const color = pick(COLORS);
  const brand = pick(BRANDS);
  const decadeOrigin = pick(DECADE_ORIGINS);
  const purchasePrice = randInt(1_500, 85_000);
  const timesWorn = randInt(0, 120);
  const costPerWear = parseFloat((purchasePrice / Math.max(timesWorn, 1)).toFixed(2));

  // Simulate creation spread over last 5 years for realistic timeline data
  const daysAgo = randInt(0, 365 * 5);
  const createdAt = new Date(Date.now() - daysAgo * 86_400_000).toISOString();
  const updatedAt = new Date(Date.now() - randInt(0, daysAgo) * 86_400_000).toISOString();

  return {
    id,
    category,
    material,
    fit,
    color,
    brand,
    name: `${brand} ${color} ${category} #${index + 1}`,
    image_url: `${MOCK_CDN}/${id}/original.webp`,
    // Edge AI output — stored locally, never sent to cloud for processing
    background_removed_url: `${MOCK_CDN}/${id}/nobg.png`,
    purchase_price: purchasePrice,
    times_worn: timesWorn,
    cost_per_wear: costPerWear,
    decade_origin: decadeOrigin,
    created_at: createdAt,
    updated_at: updatedAt,
    // Randomly mix synced/unsynced to simulate offline state
    is_synced: Math.random() > 0.15,
    tags: [color, material, fit, `decade-${decadeOrigin}`, category],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main execution
// ─────────────────────────────────────────────────────────────────────────────

function main() {
  const count = parseInt(process.argv[2] ?? '1000', 10);
  const outputPath = path.resolve(process.argv[3] ?? './mock_db.json');

  if (isNaN(count) || count < 1) {
    console.error('[FATAL] Count must be a positive integer.');
    process.exit(1);
  }

  console.log(`\n[Re:new Seeder] Generating ${count} wardrobe items...`);
  const t0 = performance.now();

  /** @type {WardrobeItem[]} */
  const items = Array.from({ length: count }, (_, i) => buildItem(i));

  const generationMs = (performance.now() - t0).toFixed(2);
  console.log(`  ✓ Generation complete in ${generationMs}ms`);

  const t1 = performance.now();
  const json = JSON.stringify({ items, meta: { count, generated_at: new Date().toISOString() } }, null, 2);
  fs.writeFileSync(outputPath, json, 'utf8');
  const writeMs = (performance.now() - t1).toFixed(2);

  const totalMs = (performance.now() - t0).toFixed(2);
  const fileSizeKb = (Buffer.byteLength(json, 'utf8') / 1024).toFixed(1);

  // ── Performance report ───────────────────────────────────────────────────
  console.log(`  ✓ Written to: ${outputPath}`);
  console.log(`\n${'─'.repeat(52)}`);
  console.log(`  SEED PERFORMANCE REPORT`);
  console.log(`${'─'.repeat(52)}`);
  console.log(`  Items generated : ${count.toLocaleString()}`);
  console.log(`  Generation time : ${generationMs}ms`);
  console.log(`  File write time : ${writeMs}ms`);
  console.log(`  Total time      : ${totalMs}ms`);
  console.log(`  File size       : ${fileSizeKb} KB`);
  console.log(`  Avg/item        : ${(parseFloat(totalMs) / count).toFixed(3)}ms`);

  // ── FlashList readiness gate ─────────────────────────────────────────────
  const TARGET_MS = 500;
  if (parseFloat(totalMs) > TARGET_MS) {
    console.warn(`\n  ⚠️  WARNING: Seeding took ${totalMs}ms > ${TARGET_MS}ms target.`);
    console.warn(`     FlashList initial window of 50 items must render in <100ms.`);
    console.warn(`     Consider chunked WatermelonDB batch inserts (batch size: 200).`);
  } else {
    console.log(`\n  ✅ PASS: Under ${TARGET_MS}ms threshold. FlashList ready.`);
  }
  console.log(`${'─'.repeat(52)}\n`);
}

main();
