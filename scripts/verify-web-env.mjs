const runtime = process.env;

const isVercel = String(runtime.VERCEL || '').trim() === '1';
const isCi = String(runtime.CI || '').trim().toLowerCase() === 'true';
const nodeEnv = String(runtime.NODE_ENV || '').trim().toLowerCase();
const shouldEnforce = isVercel || isCi || nodeEnv === 'production';

const imagePipelineUrl = String(runtime.EXPO_PUBLIC_IMAGE_PIPELINE_URL || '').trim();
const aiProxyUrl = String(runtime.EXPO_PUBLIC_AI_PROXY_URL || '').trim();

/** @type {string[]} */
const failures = [];
/** @type {string[]} */
const warnings = [];

if (!imagePipelineUrl) {
  failures.push('EXPO_PUBLIC_IMAGE_PIPELINE_URL is missing.');
} else if (!isValidBackendUrl(imagePipelineUrl)) {
  failures.push('EXPO_PUBLIC_IMAGE_PIPELINE_URL must be a valid public http(s) URL and not localhost/127.0.0.1/0.0.0.0.');
}

if (!aiProxyUrl) {
  warnings.push('EXPO_PUBLIC_AI_PROXY_URL is empty. It will fallback to EXPO_PUBLIC_IMAGE_PIPELINE_URL.');
} else if (!isValidBackendUrl(aiProxyUrl)) {
  failures.push('EXPO_PUBLIC_AI_PROXY_URL must be a valid public http(s) URL and not localhost/127.0.0.1/0.0.0.0.');
}

if (!shouldEnforce) {
  printSummary('warn', failures, warnings);
  process.exit(0);
}

if (failures.length > 0) {
  printSummary('error', failures, warnings);
  process.exit(1);
}

printSummary('ok', failures, warnings);
process.exit(0);

/**
 * @param {string} value
 * @returns {boolean}
 */
function isValidBackendUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = String(parsed.hostname || '').trim().toLowerCase();
    if (!host) return false;
    if (host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0') return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {'ok' | 'warn' | 'error'} level
 * @param {string[]} errorItems
 * @param {string[]} warningItems
 */
function printSummary(level, errorItems, warningItems) {
  const prefix = level === 'error'
    ? '[verify:web-env][ERROR]'
    : level === 'warn'
      ? '[verify:web-env][WARN]'
      : '[verify:web-env][OK]';

  if (errorItems.length > 0) {
    for (const item of errorItems) {
      console.error(`${prefix} ${item}`);
    }
  }
  if (warningItems.length > 0) {
    for (const item of warningItems) {
      const print = level === 'error' ? console.error : console.warn;
      print(`${prefix} ${item}`);
    }
  }
  if (errorItems.length === 0 && warningItems.length === 0) {
    console.log(`${prefix} Web env is valid.`);
  }
}
