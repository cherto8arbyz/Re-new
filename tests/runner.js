/**
 * Minimal test runner for Node.js — no dependencies.
 */

let totalPassed = 0;
let totalFailed = 0;

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

/** @type {Array<() => Promise<void>>} */
const pendingDescribes = [];

/**
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function describe(name, fn) {
  pendingDescribes.push(async () => {
    console.log(`\n${COLORS.bold}${name}${COLORS.reset}`);
    await fn();
    // Run any async tests queued during this describe
    while (pendingTests.length > 0) {
      const test = pendingTests.shift();
      await test();
    }
  });
}

/** @type {Array<() => Promise<void>>} */
const pendingTests = [];

/**
 * @param {string} name
 * @param {() => void | Promise<void>} fn
 */
export function it(name, fn) {
  pendingTests.push(async () => {
    try {
      await fn();
      totalPassed++;
      console.log(`  ${COLORS.green}\u2713${COLORS.reset} ${COLORS.dim}${name}${COLORS.reset}`);
    } catch (/** @type {any} */ err) {
      totalFailed++;
      console.log(`  ${COLORS.red}\u2717 ${name}${COLORS.reset}`);
      console.log(`    ${COLORS.red}${err.message}${COLORS.reset}`);
    }
  });
}

/** Runs all queued describe blocks (called by main) */
export async function runAll() {
  while (pendingDescribes.length > 0) {
    const desc = pendingDescribes.shift();
    await desc();
  }
}

/**
 * @template T
 * @param {T} value
 */
export function expect(value) {
  return {
    /** @param {any} expected */
    toBe(expected) {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    /** @param {any} expected */
    toEqual(expected) {
      const a = JSON.stringify(value);
      const b = JSON.stringify(expected);
      if (a !== b) {
        throw new Error(`Expected ${b}, got ${a}`);
      }
    },
    toThrow() {
      if (typeof value !== 'function') throw new Error('Expected a function');
      let threw = false;
      try { /** @type {Function} */ (value)(); } catch { threw = true; }
      if (!threw) throw new Error('Expected function to throw, but it did not');
    },
    /** @param {number} len */
    toHaveLength(len) {
      const actual = /** @type {any} */ (value)?.length;
      if (actual !== len) {
        throw new Error(`Expected length ${len}, got ${actual}`);
      }
    },
    toBeTruthy() {
      if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
    },
    toBeFalsy() {
      if (value) throw new Error(`Expected falsy, got ${JSON.stringify(value)}`);
    },
    /** @param {any} expected */
    toBeGreaterThan(expected) {
      if (/** @type {any} */ (value) <= expected) {
        throw new Error(`Expected ${JSON.stringify(value)} > ${JSON.stringify(expected)}`);
      }
    },
    /** @param {any} expected */
    toBeLessThan(expected) {
      if (/** @type {any} */ (value) >= expected) {
        throw new Error(`Expected ${JSON.stringify(value)} < ${JSON.stringify(expected)}`);
      }
    },
    toBeNull() {
      if (value !== null) throw new Error(`Expected null, got ${JSON.stringify(value)}`);
    },
    toBeNotNull() {
      if (value === null) throw new Error(`Expected non-null value`);
    },
  };
}

export function printSummary() {
  console.log(`\n${COLORS.bold}Results:${COLORS.reset}`);
  console.log(`  ${COLORS.green}${totalPassed} passed${COLORS.reset}`);
  if (totalFailed > 0) {
    console.log(`  ${COLORS.red}${totalFailed} failed${COLORS.reset}`);
    process.exit(1);
  }
  console.log('');
}

// Import and run all test files
async function main() {
  console.log(`${COLORS.bold}Re:new Test Suite${COLORS.reset}`);
  console.log('='.repeat(40));

  await import('./garment.test.js');
  await runAll();
  await import('./garment-presentation.test.js');
  await runAll();
  await import('./z-index-manager.test.js');
  await runAll();
  await import('./outfit.test.js');
  await runAll();
  await import('./store.test.js');
  await runAll();
  await import('./reducers.test.js');
  await runAll();
  await import('./user.test.js');
  await runAll();
  await import('./profile-state.test.js');
  await runAll();
  await import('./wardrobe-upgrade.test.js');
  await runAll();
  await import('./cv-service.test.js');
  await runAll();
  await import('./wardrobe-upload-flow.test.js');
  await runAll();
  await import('./forecast-service.test.js');
  await runAll();
  await import('./backend-url-rewrite.test.js');
  await runAll();
  await import('./wardrobe-management.test.js');
  await runAll();
  await import('./wardrobe-layout.test.js');
  await runAll();
  await import('./wardrobe-review-layout.test.js');
  await runAll();
  await import('./identity-capture.logic.test.ts');
  await runAll();
  await import('./wardrobe-runtime.test.js');
  await runAll();
  await import('./wardrobe-scene-runtime.test.js');
  await runAll();
  await import('./wardrobe-visual-assets.test.js');
  await runAll();
  await import('./stylist-variation.test.js');
  await runAll();
  await import('./looks-runtime.test.js');
  await runAll();
  await import('./chat-state.test.js');
  await runAll();
  await import('./gemini-service.test.js');
  await runAll();
  await import('./ai-agent-service.test.js');
  await runAll();

  printSummary();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
