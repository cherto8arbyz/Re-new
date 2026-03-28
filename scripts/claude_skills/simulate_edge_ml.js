#!/usr/bin/env node
/**
 * @file simulate_edge_ml.js
 * @brief Edge AI Latency Simulator for Re:new's on-device background removal.
 *
 * ARCHITECTURAL CONTRACT:
 * Background removal is performed ON-DEVICE using ONNX Runtime (React Native)
 * or CoreML (iOS). It MUST NOT be sent to any cloud endpoint (AWS Lambda,
 * Google Cloud Vision, Azure Cognitive Services, etc.).
 *
 * This script enforces that contract by:
 * 1. Simulating the ~1.5s NPU processing latency for a local image file.
 * 2. FAILING with a FATAL error if a cloud API URL is detected in the input,
 *    which would indicate an architectural violation during code review.
 *
 * @usage node simulate_edge_ml.js <image_path_or_url>
 * @exitcode 0  On-device processing simulated successfully.
 * @exitcode 1  Cloud API violation detected — fix the architecture before proceeding.
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─────────────────────────────────────────────────────────────────────────────
// Cloud provider detection patterns — architectural violation triggers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @type {readonly {pattern: RegExp, name: string}[]}
 * Any match here means an ARCHITECTURAL VIOLATION has been coded.
 */
const CLOUD_API_PATTERNS = Object.freeze([
  { pattern: /amazonaws\.com/i,          name: 'AWS (S3/Lambda/Rekognition)' },
  { pattern: /googleapis\.com/i,         name: 'Google Cloud Vision API' },
  { pattern: /azure\.com/i,              name: 'Azure Cognitive Services' },
  { pattern: /remove\.bg/i,              name: 'remove.bg (paid cloud API)' },
  { pattern: /photoroom\.com/i,          name: 'PhotoRoom Cloud API' },
  { pattern: /clipdrop\.co/i,            name: 'Clipdrop Cloud API' },
  { pattern: /claid\.ai/i,               name: 'Claid.ai Cloud API' },
  { pattern: /api\.replicate\.com/i,     name: 'Replicate Cloud API' },
  { pattern: /huggingface\.co\/api/i,    name: 'HuggingFace Inference API' },
  { pattern: /openai\.com/i,             name: 'OpenAI API' },
  // Generic cloud function patterns
  { pattern: /\/lambda\//i,              name: 'Serverless function endpoint' },
  { pattern: /\/functions\//i,           name: 'Cloud Functions endpoint' },
  { pattern: /\/inference\//i,           name: 'Remote inference endpoint' },
  { pattern: /\/remove.?bg/i,            name: 'Background removal cloud endpoint' },
]);

/** Simulated NPU processing time in milliseconds (iPhone 15 Pro, A17 Pro chip). */
const NPU_LATENCY_MS = 1_500;

/** Target SLA from CLAUDE.md: background removal must complete within 2 seconds. */
const SLA_TARGET_MS = 2_000;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Artificial async delay to simulate NPU processing.
 * @param {number} ms
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Check if the input looks like a cloud API URL rather than a local file path.
 * @param {string} input
 * @returns {{ isViolation: boolean, serviceName?: string }}
 */
function detectCloudViolation(input) {
  for (const { pattern, name } of CLOUD_API_PATTERNS) {
    if (pattern.test(input)) {
      return { isViolation: true, serviceName: name };
    }
  }
  return { isViolation: false };
}

/**
 * Validate that the input looks like a plausible local image path.
 * @param {string} filePath
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateLocalPath(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const supportedExts = ['.jpg', '.jpeg', '.png', '.heic', '.heif', '.webp', '.bmp', '.tiff'];

  if (!supportedExts.includes(ext)) {
    return {
      valid: false,
      reason: `Unsupported extension '${ext}'. Supported: ${supportedExts.join(', ')}`,
    };
  }

  // In real usage this would be an actual file; in dev we allow mock paths
  const isMockPath = filePath.includes('mock') || filePath.includes('test') || filePath.includes('fixture');
  if (!fs.existsSync(filePath) && !isMockPath) {
    return {
      valid: false,
      reason: `File not found: '${filePath}'. For mock/test paths, include 'mock', 'test', or 'fixture' in the path.`,
    };
  }

  return { valid: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main execution
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const input = process.argv[2];

  if (!input) {
    console.error('[FATAL] No input provided.');
    console.error('Usage: simulate_edge_ml.js <local_image_path>');
    console.error('Example: simulate_edge_ml.js ./test/fixtures/jacket_mock.jpg');
    process.exit(1);
  }

  console.log(`\n${'═'.repeat(58)}`);
  console.log('  Re:new  |  Edge AI Background Removal Simulator');
  console.log(`${'═'.repeat(58)}`);
  console.log(`  Input   : ${input}`);

  // ── STEP 1: Architectural guard — reject cloud API calls ──────────────────
  const { isViolation, serviceName } = detectCloudViolation(input);

  if (isViolation) {
    console.error(`\n${'█'.repeat(58)}`);
    console.error('  🚫  ARCHITECTURAL VIOLATION DETECTED');
    console.error(`${'█'.repeat(58)}`);
    console.error(`\n  Cloud service targeted: ${serviceName}`);
    console.error(`  Input received       : ${input}`);
    console.error(`\n  ❌ FATAL: You are attempting to send an image to a CLOUD API`);
    console.error(`     for background removal. This VIOLATES the Re:new architecture.`);
    console.error(`\n  📋 RULE (from CLAUDE.md §2):`);
    console.error(`     "Edge AI over Cloud AI: Background removal and basic image`);
    console.error(`     tagging MUST happen on the device (CoreML/ONNX) to save`);
    console.error(`     server costs and ensure instant feedback."`);
    console.error(`\n  🔧 FIX: Use ONNX Runtime (React Native) or CoreML (iOS).`);
    console.error(`     Reference model: u2net.onnx or rembg ONNX export.`);
    console.error(`     Do NOT call any remote inference endpoint.`);
    console.error(`\n${'█'.repeat(58)}\n`);
    process.exit(1);
  }

  // ── STEP 2: Validate local path ───────────────────────────────────────────
  const { valid, reason } = validateLocalPath(input);
  if (!valid) {
    console.error(`\n  [FATAL] Invalid input: ${reason}`);
    process.exit(1);
  }

  // ── STEP 3: Simulate NPU processing ──────────────────────────────────────
  console.log(`  Device  : iPhone 15 Pro (A17 Pro NPU — simulated)`);
  console.log(`  Model   : u2net.onnx (on-device, no network call)`);
  console.log(`\n  [1/3] Loading ONNX model from local bundle...     ✓ (cached)`);
  console.log(`  [2/3] Running inference on NPU...`);

  const t0 = performance.now();
  await sleep(NPU_LATENCY_MS);
  const elapsedMs = Math.round(performance.now() - t0);

  console.log(`         → Inference complete in ${elapsedMs}ms`);
  console.log(`  [3/3] Post-processing alpha mask...                ✓`);

  // ── STEP 4: Build mock result ─────────────────────────────────────────────
  const inputName = path.basename(input, path.extname(input));
  const outputPath = path.join(path.dirname(input), `${inputName}_nobg.png`);

  /** @type {object} */
  const result = {
    status: 'success',
    processing_location: 'on_device',
    device_model: 'iPhone 15 Pro (simulated)',
    ml_model: 'u2net.onnx',
    inference_ms: elapsedMs,
    sla_target_ms: SLA_TARGET_MS,
    sla_met: elapsedMs <= SLA_TARGET_MS,
    input_path: input,
    output_path: outputPath,
    network_calls_made: 0,
    note: 'Background removal executed entirely on-device. Zero bytes sent to any cloud endpoint.',
  };

  // ── STEP 5: SLA validation ────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  RESULT`);
  console.log(`${'─'.repeat(58)}`);
  console.log(JSON.stringify(result, null, 2));

  if (!result.sla_met) {
    console.warn(`\n  ⚠️  SLA WARNING: ${elapsedMs}ms exceeded ${SLA_TARGET_MS}ms target.`);
    console.warn(`     On real hardware, consider model quantization (INT8).`);
  } else {
    console.log(`\n  ✅ SLA MET: ${elapsedMs}ms ≤ ${SLA_TARGET_MS}ms`);
    console.log(`  ✅ ARCHITECTURE: 0 cloud API calls made.`);
  }

  console.log(`${'═'.repeat(58)}\n`);
  process.exit(0);
}

main().catch((err) => {
  console.error(`[FATAL] Unexpected error: ${err.message}`);
  process.exit(1);
});
