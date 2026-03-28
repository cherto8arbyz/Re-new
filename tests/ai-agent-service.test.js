/**
 * @fileoverview Unit tests for AIAgentService — Agentic Workflow.
 *
 * Strategy: mock globalThis.fetch to simulate the full multi-turn
 * function-calling conversation without hitting real APIs.
 *
 * Test scenarios:
 *  1. Happy path: agent calls weather + calendar, gets outfit JSON
 *  2. Agent requests a trends tool in addition
 *  3. Empty wardrobe guard
 *  4. Gemini API error on first call
 *  5. Gemini API error mid-loop (after tool execution)
 *  6. Agent returns malformed JSON → error surfaced
 *  7. Agent exceeds MAX_TOOL_ROUNDS → error surfaced
 *  8. Tool execution error is surfaced to agent (not thrown)
 *  9. Parallel tool calls are all dispatched
 * 10. Offline fallback: network error handled gracefully
 */

import { describe, it, expect } from './runner.js';

// ─── Mock Fetch Infrastructure ────────────────────────────────────────────────

/** Queue of responses: each call to fetch() consumes the next entry. */
let fetchResponseQueue = [];
let fetchCallLog = [];

globalThis.fetch = async (url, options) => {
  fetchCallLog.push({ url, body: JSON.parse(options?.body ?? '{}') });
  const next = fetchResponseQueue.shift();
  if (!next) throw new Error('Test: fetch called more times than responses were queued');
  return {
    ok:     next.ok ?? true,
    status: next.status ?? 200,
    json:   async () => next.json ?? {},
    text:   async () => next.text ?? '',
  };
};

function resetMocks() {
  fetchResponseQueue = [];
  fetchCallLog = [];
}

/**
 * Builds a Gemini response that asks to call one or more tools.
 * @param {Array<{ name: string, args: Record<string, any> }>} calls
 */
function makeFunctionCallResponse(calls) {
  return {
    ok: true,
    json: {
      candidates: [{
        content: {
          role: 'model',
          parts: calls.map(c => ({ functionCall: { name: c.name, args: c.args } })),
        },
        finishReason: 'STOP',
      }],
    },
  };
}

/**
 * Builds a Gemini response with the final outfit JSON.
 * @param {object} outfit
 */
function makeFinalOutfitResponse(outfit) {
  return {
    ok: true,
    json: {
      candidates: [{
        content: {
          role: 'model',
          parts: [{ text: JSON.stringify(outfit) }],
        },
        finishReason: 'STOP',
      }],
    },
  };
}

// ─── Test Wardrobe ────────────────────────────────────────────────────────────

const MOCK_WARDROBE = [
  { id: 'shirt-white',       name: 'White Oxford Shirt',   category: 'shirt',     zIndex: 1, color: '#FFFFFF' },
  { id: 'pants-chino',       name: 'Navy Chino Pants',     category: 'pants',     zIndex: 1, color: '#1B3A6B' },
  { id: 'shoes-loafers',     name: 'Brown Leather Loafers',category: 'shoes',     zIndex: 1, color: '#7B4F2E' },
  { id: 'sweater-grey',      name: 'Grey Merino Sweater',  category: 'sweater',   zIndex: 2, color: '#9E9E9E' },
  { id: 'coat-camel',        name: 'Camel Trench Coat',    category: 'outerwear', zIndex: 3, color: '#C19A6B' },
  { id: 'watch-silver',      name: 'Silver Watch',         category: 'accessory', zIndex: 4, color: '#C0C0C0' },
];

const EXPECTED_OUTFIT = {
  selectedIds: ['shirt-white', 'pants-chino', 'shoes-loafers', 'coat-camel'],
  styleName:   'Smart Winter Casual',
  reasoning:   'Cold weather (2°C) and an investor meeting call for a polished look with outerwear.',
  contextUsed: {
    weather: { temperature: 2, condition: 'Overcast' },
    events:  [{ time: '10:00', title: 'Investor meeting', dressCode: 'business_casual' }],
  },
};

// ─── Import service and tools after fetch mock is in place ───────────────────

const { AIAgentService }                            = await import('../src/agents/ai-agent-service.js');
const { executeToolCall, executeToolCallsParallel } = await import('../src/agents/tool-executor.js');
const { getRegionalWeather }                        = await import('../src/agents/tools/weather-tool.js');
const { getCalendarEvents }                         = await import('../src/agents/tools/calendar-tool.js');
const { researchFashionTrends }                     = await import('../src/agents/tools/trends-tool.js');

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AIAgentService — initialization', () => {
  it('should create instance with valid API key', () => {
    const service = new AIAgentService('test-key');
    expect(service).toBeTruthy();
  });

  it('should throw when constructed without API key', () => {
    expect(() => new AIAgentService('')).toThrow();
  });
});

describe('AIAgentService — empty wardrobe guard', () => {
  it('should return error immediately without calling Gemini', async () => {
    resetMocks();
    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What should I wear?', []);
    expect(result.success).toBeFalsy();
    expect(result.toolCallCount).toBe(0);
    expect(fetchCallLog.length).toBe(0);
  });
});

describe('AIAgentService — happy path (weather + calendar)', () => {
  it('should execute 2-round pipeline: tool calls → final outfit JSON', async () => {
    resetMocks();

    // Round 1: agent requests weather + calendar in parallel
    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.7558, longitude: 37.6173, date: '2026-03-22' } },
      { name: 'get_calendar_events',  args: { date: '2026-03-22' } },
    ]));

    // Round 2: agent receives tool results and returns final outfit
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    const result = await service.processRequest(
      'What should I wear today?',
      MOCK_WARDROBE,
      { date: '2026-03-22', latitude: 55.7558, longitude: 37.6173 },
    );

    expect(result.success).toBeTruthy();
    if (!result.success) return; // type narrowing

    expect(result.outfit.selectedIds).toHaveLength(4);
    expect(result.outfit.styleName).toBe('Smart Winter Casual');
    expect(result.outfit.reasoning).toBeTruthy();
    // 2 tool calls were dispatched
    expect(result.toolCallCount).toBe(2);
  });

  it('should include tool responses in the second Gemini request', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
      { name: 'get_calendar_events',  args: { date: '2026-03-22' } },
    ]));
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    await service.processRequest('Собери лук на завтра', MOCK_WARDROBE, { date: '2026-03-22' });

    // Second fetch (round 2) should have functionResponse parts in contents
    const round2Body = fetchCallLog[1].body;
    const allParts = round2Body.contents.flatMap((/** @type {any} */ c) => c.parts);
    const hasWeatherResponse = allParts.some(
      (/** @type {any} */ p) => p.functionResponse?.name === 'get_regional_weather',
    );
    const hasCalendarResponse = allParts.some(
      (/** @type {any} */ p) => p.functionResponse?.name === 'get_calendar_events',
    );
    expect(hasWeatherResponse).toBeTruthy();
    expect(hasCalendarResponse).toBeTruthy();
  });

  it('should pass tool declarations in every Gemini request', async () => {
    resetMocks();
    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
    ]));
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    await service.processRequest('Outfit for today', MOCK_WARDROBE, { date: '2026-03-22' });

    // Both requests should contain tools declarations
    for (const call of fetchCallLog) {
      const tools = call.body.tools;
      expect(Array.isArray(tools)).toBeTruthy();
      expect(tools.length).toBeGreaterThan(0);
    }
  });
});

describe('AIAgentService — trends tool integration', () => {
  it('should handle 3-tool request (weather + calendar + trends)', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather',    args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
      { name: 'get_calendar_events',     args: { date: '2026-03-22' } },
      { name: 'research_fashion_trends', args: { query: 'cargo pants 2026' } },
    ]));
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    const result = await service.processRequest(
      'С чем сейчас носят карго? Подбери мне образ.',
      MOCK_WARDROBE,
      { date: '2026-03-22' },
    );

    expect(result.success).toBeTruthy();
    expect(result.toolCallCount).toBe(3);
  });
});

describe('AIAgentService — error handling: Gemini API failure', () => {
  it('should return error if first Gemini call fails', async () => {
    resetMocks();
    fetchResponseQueue.push({ ok: false, status: 503, text: 'Service Unavailable' });

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What to wear?', MOCK_WARDROBE);

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
    expect(result.toolCallCount).toBe(0);
  });

  it('should return error if Gemini fails mid-loop (after tool execution)', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
    ]));
    // Second call fails
    fetchResponseQueue.push({ ok: false, status: 429, text: 'Rate Limited' });

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What to wear?', MOCK_WARDROBE, { date: '2026-03-22' });

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
    expect(result.toolCallCount).toBe(1);
  });

  it('should handle network-level fetch() exception gracefully', async () => {
    resetMocks();
    // Override fetch to throw (simulates offline)
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error('Network offline'); };

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What to wear?', MOCK_WARDROBE);

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();

    globalThis.fetch = originalFetch; // restore
  });
});

describe('AIAgentService — error handling: bad final response', () => {
  it('should error when agent returns plain text instead of JSON', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
    ]));
    // Final response is prose, not JSON
    fetchResponseQueue.push({
      ok: true,
      json: {
        candidates: [{
          content: { role: 'model', parts: [{ text: 'I suggest wearing your coat today!' }] },
          finishReason: 'STOP',
        }],
      },
    });

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('Outfit for today', MOCK_WARDROBE, { date: '2026-03-22' });

    expect(result.success).toBeFalsy();
    expect(result.error).toBeTruthy();
  });

  it('should error when JSON is missing required fields', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_calendar_events', args: { date: '2026-03-22' } },
    ]));
    fetchResponseQueue.push({
      ok: true,
      json: {
        candidates: [{
          content: { role: 'model', parts: [{ text: JSON.stringify({ styleName: 'Cool Look' }) }] },
          finishReason: 'STOP',
        }],
      },
    });

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('Outfit?', MOCK_WARDROBE, { date: '2026-03-22' });

    expect(result.success).toBeFalsy();
  });

  it('should accept JSON wrapped in markdown code fences', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
    ]));
    fetchResponseQueue.push({
      ok: true,
      json: {
        candidates: [{
          content: {
            role: 'model',
            parts: [{ text: '```json\n' + JSON.stringify(EXPECTED_OUTFIT) + '\n```' }],
          },
          finishReason: 'STOP',
        }],
      },
    });

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('Outfit?', MOCK_WARDROBE, { date: '2026-03-22' });

    expect(result.success).toBeTruthy();
  });
});

describe('AIAgentService — MAX_TOOL_ROUNDS guard', () => {
  it('should stop and return error after exceeding max tool rounds', async () => {
    resetMocks();

    // Agent keeps requesting tools forever — simulate 4 rounds
    const infiniteToolCall = makeFunctionCallResponse([
      { name: 'get_regional_weather', args: { latitude: 55.0, longitude: 37.0, date: '2026-03-22' } },
    ]);
    // Push 4 responses (MAX_TOOL_ROUNDS = 4)
    fetchResponseQueue.push(infiniteToolCall, infiniteToolCall, infiniteToolCall, infiniteToolCall);

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What to wear?', MOCK_WARDROBE, { date: '2026-03-22' });

    expect(result.success).toBeFalsy();
    expect(result.toolCallCount).toBeGreaterThan(0);
  });
});

describe('AIAgentService — tool error resilience', () => {
  it('should forward tool error to agent instead of crashing', async () => {
    resetMocks();

    // Agent calls an unknown tool
    fetchResponseQueue.push(makeFunctionCallResponse([
      { name: 'nonexistent_tool', args: {} },
    ]));
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    const result = await service.processRequest('What to wear?', MOCK_WARDROBE, { date: '2026-03-22' });

    // Should NOT crash; agent received error info and still returned an outfit
    expect(result.success).toBeTruthy();
    expect(result.toolCallCount).toBe(1);
  });
});

describe('AIAgentService — wardrobe Z-index in system prompt', () => {
  it('should include all wardrobe items with zIndex in the system prompt', async () => {
    resetMocks();

    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    await service.processRequest('Quick outfit', MOCK_WARDROBE, { date: '2026-03-22' });

    const systemInstruction = fetchCallLog[0].body.system_instruction.parts[0].text;
    expect(systemInstruction.includes('coat-camel')).toBeTruthy();
    expect(systemInstruction.includes('zIndex')).toBeTruthy();
    expect(systemInstruction.includes('outerwear')).toBeTruthy();
  });
});

describe('AIAgentService — tool schemas validation', () => {
  it('should declare all 3 tools in every Gemini request', async () => {
    resetMocks();
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    await service.processRequest('Outfit', MOCK_WARDROBE, { date: '2026-03-22' });

    const tools = fetchCallLog[0].body.tools;
    const declarations = tools[0].functionDeclarations;
    const names = declarations.map((/** @type {any} */ d) => d.name);
    expect(names.includes('get_regional_weather')).toBeTruthy();
    expect(names.includes('get_calendar_events')).toBeTruthy();
    expect(names.includes('research_fashion_trends')).toBeTruthy();
  });

  it('should set function_calling_config mode to AUTO', async () => {
    resetMocks();
    fetchResponseQueue.push(makeFinalOutfitResponse(EXPECTED_OUTFIT));

    const service = new AIAgentService('test-key');
    await service.processRequest('Outfit', MOCK_WARDROBE, { date: '2026-03-22' });

    const toolConfig = fetchCallLog[0].body.tool_config;
    expect(toolConfig.function_calling_config.mode).toBe('AUTO');
  });
});

describe('Tool Executor — standalone unit tests', () => {

  it('get_regional_weather should return temperature and condition', async () => {
    const result = await executeToolCall({
      name: 'get_regional_weather',
      args: { latitude: 55.75, longitude: 37.62, date: '2026-03-22' },
    });
    expect(result.name).toBe('get_regional_weather');
    expect(result.response.result).toBeTruthy();
    expect(typeof result.response.result.temperature).toBe('number');
    expect(typeof result.response.result.condition).toBe('string');
  });

  it('get_calendar_events should return events array', async () => {
    const result = await executeToolCall({
      name: 'get_calendar_events',
      args: { date: '2026-03-22' }, // Saturday → gallery + yoga
    });
    expect(result.name).toBe('get_calendar_events');
    expect(Array.isArray(result.response.result.events)).toBeTruthy();
  });

  it('research_fashion_trends should return trend list', async () => {
    const result = await executeToolCall({
      name: 'research_fashion_trends',
      args: { query: 'cargo pants styling 2026' },
    });
    expect(result.name).toBe('research_fashion_trends');
    expect(Array.isArray(result.response.result.trends)).toBeTruthy();
  });

  it('unknown tool should return error response without throwing', async () => {
    const result = await executeToolCall({ name: 'destroy_everything', args: {} });
    expect(result.response.error).toBeTruthy();
  });

  it('parallel execution should resolve all calls', async () => {
    const results = await executeToolCallsParallel([
      { name: 'get_regional_weather', args: { latitude: 48.8, longitude: 2.35, date: '2026-03-22' } },
      { name: 'get_calendar_events',  args: { date: '2026-03-22' } },
    ]);
    expect(results.length).toBe(2);
    expect(results[0].name).toBe('get_regional_weather');
    expect(results[1].name).toBe('get_calendar_events');
  });
});

describe('Weather Tool — edge cases', () => {
  it('should return valid result for extreme northern coordinates', async () => {
    const result = await getRegionalWeather({ latitude: 89.0, longitude: 0.0, date: '2026-01-15' });
    expect(typeof result.temperature).toBe('number');
    expect(result.temperature).toBeLessThan(40);
    expect(result.isOfflineFallback).toBeTruthy();
  });

  it('should return valid result for equatorial coordinates', async () => {
    const result = await getRegionalWeather({ latitude: 1.3, longitude: 103.8, date: '2026-07-01' });
    expect(typeof result.temperature).toBe('number');
    expect(result.summary).toBeTruthy();
  });

  it('should include precipitation probability between 0 and 100', async () => {
    const result = await getRegionalWeather({ latitude: 55.75, longitude: 37.62, date: '2026-03-22' });
    expect(result.precipitationPct).toBeGreaterThan(-1);
    expect(result.precipitationPct).toBeLessThan(101);
  });
});

describe('Calendar Tool — edge cases', () => {
  it('should return events for Monday (investor meeting scenario)', async () => {
    // 2026-03-23 is a Monday
    const result = await getCalendarEvents({ date: '2026-03-23' });
    expect(result.events.length).toBeGreaterThan(0);
    const hasFormalEvent = result.events.some(e =>
      e.dressCode === 'business_casual' || e.dressCode === 'formal',
    );
    expect(hasFormalEvent).toBeTruthy();
  });

  it('should return daySummary string for any date', async () => {
    const result = await getCalendarEvents({ date: '2026-03-22' });
    expect(typeof result.daySummary).toBe('string');
    expect(result.daySummary.length).toBeGreaterThan(0);
  });
});

describe('Trends Tool — relevance scoring', () => {
  it('cargo query should match Utility Maximalism trend', async () => {
    const result = await researchFashionTrends({ query: 'cargo pants 2026' });
    expect(result.trends.length).toBeGreaterThan(0);
    expect(result.trends[0].title).toBe('Utility Maximalism');
  });

  it('blazer query should match Oversized Tailoring trend', async () => {
    const result = await researchFashionTrends({ query: 'oversized blazer wide shoulder' });
    expect(result.trends[0].title).toBe('Oversized Tailoring');
  });

  it('obscure query should return stylistAdvice even with no matches', async () => {
    const result = await researchFashionTrends({ query: 'xyzzy123 unknown item' });
    expect(typeof result.stylistAdvice).toBe('string');
    expect(result.stylistAdvice.length).toBeGreaterThan(0);
  });

  it('should not exceed 3 trend results', async () => {
    const result = await researchFashionTrends({ query: 'fashion style outfit look wear' });
    expect(result.trends.length).toBeLessThan(4);
  });
});
