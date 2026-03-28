/**
 * @fileoverview AIAgentService — Agentic Workflow Orchestrator for Re:new.
 *
 * Architecture: Contract-First Function Calling.
 * The LLM (Gemini) drives its own tool usage. This service implements the
 * request → tool execution → context re-injection → final generation loop.
 *
 * Pipeline per request:
 *   1. Build initial prompt with wardrobe Z-index state + user request
 *   2. POST to Gemini with AGENT_TOOLS declared
 *   3. If response contains functionCall parts → execute tools in parallel
 *   4. Re-inject tool results as `functionResponse` parts
 *   5. POST again → receive final outfit JSON + reasoning
 *   6. Validate and return structured AgentResult
 *
 * Max agentic loop iterations: MAX_TOOL_ROUNDS (guards against infinite loops).
 */

import { AGENT_TOOLS } from './schemas/tool-schemas.js';
import { executeToolCallsParallel } from './tool-executor.js';

const GEMINI_API_BASE =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

/**
 * Maximum number of tool-call rounds before forcing a final answer.
 * Prevents runaway loops if the model keeps requesting more tools.
 */
const MAX_TOOL_ROUNDS = 4;

// ─── Type Definitions ────────────────────────────────────────────────────────

/**
 * @typedef {Object} WardrobeItem
 * @property {string}  id
 * @property {string}  name
 * @property {string}  category  - GarmentCategory
 * @property {number}  zIndex
 * @property {string}  [color]
 * @property {string}  [brand]
 * @property {string[]} [styleTags]
 */

/**
 * @typedef {Object} AgentOutfit
 * @property {string[]} selectedIds   - IDs of chosen garments from the wardrobe
 * @property {string}   styleName     - Creative name for the look
 * @property {string}   reasoning     - Why these items were chosen (weather + events + trends)
 * @property {Object}   contextUsed   - Snapshot of tool data that informed the decision
 * @property {any}      [contextUsed.weather]
 * @property {any}      [contextUsed.events]
 * @property {any}      [contextUsed.trends]
 */

/**
 * @typedef {{ success: true, outfit: AgentOutfit, toolCallCount: number }
 *         | { success: false, error: string, toolCallCount: number }} AgentResult
 */

/**
 * @typedef {Object} AgentRequestOptions
 * @property {number}  [latitude]           - User location (for weather tool)
 * @property {number}  [longitude]
 * @property {string}  [date]               - ISO 8601 date (defaults to today)
 * @property {string}  [openWeatherApiKey]
 * @property {string}  [googleAccessToken]
 */

/**
 * @typedef {Object} GeminiPart
 * @property {string}  [text]
 * @property {{ name: string, args: Record<string, any> }}  [functionCall]
 * @property {{ name: string, response: Record<string, any> }} [functionResponse]
 */

/**
 * @typedef {Object} GeminiContent
 * @property {'user' | 'model'} role
 * @property {GeminiPart[]} parts
 */

// ─── System Prompt ────────────────────────────────────────────────────────────

/**
 * Builds the system instruction for the stylist agent.
 * @param {WardrobeItem[]} wardrobe
 * @returns {string}
 */
function _buildSystemPrompt(wardrobe) {
  const wardrobeJSON = JSON.stringify(
    wardrobe.map(({ id, name, category, zIndex, color, styleTags }) => ({
      id, name, category, zIndex, color, styleTags,
    })),
    null,
    2,
  );

  return `You are Re:new AI Stylist — an autonomous fashion agent with access to real-time tools.

## YOUR WARDROBE DATABASE (Z-index JSON)
${wardrobeJSON}

## YOUR MISSION
When the user asks for outfit advice or a "look of the day":
1. ALWAYS call get_regional_weather and get_calendar_events BEFORE answering.
2. Call research_fashion_trends if the user asks about styling specific items or current trends.
3. After collecting context, select items ONLY from the wardrobe above (use their exact IDs).
4. Return your answer as a STRICT JSON object — no prose, no markdown.

## OUTPUT JSON CONTRACT
{
  "selectedIds":  ["id1", "id2", ...],
  "styleName":    "Creative look name",
  "reasoning":    "2-3 sentences: why these items, referencing weather/events/trends data",
  "contextUsed": {
    "weather": { ...snapshot of weather tool result },
    "events":  [ ...snapshot of top calendar events ],
    "trends":  "...key trend insight used (if applicable)"
  }
}

## Z-INDEX RULES (MUST ENFORCE)
- base (z=0) ALWAYS under everything
- pants/shirt/shoes (z=1) ALWAYS above base
- sweater/hoodie (z=2) ALWAYS above shirt
- outerwear (z=3) ALWAYS outermost layered garment
- accessory (z=4) ALWAYS topmost layer
- NEVER suggest outerwear under a shirt. NEVER suggest base on top of pants.

## RULES
- Select items ONLY from the provided wardrobe (use their exact IDs).
- If the wardrobe is missing a key category (e.g. no shoes), note it in reasoning.
- Respond in the SAME LANGUAGE the user wrote in.
- Return ONLY the JSON. No markdown fences. No explanation text outside the JSON.`;
}

// ─── Response Parsing ─────────────────────────────────────────────────────────

/**
 * Extracts all functionCall parts from a Gemini candidate response.
 * @param {any} candidate
 * @returns {Array<{ name: string, args: Record<string, any> }>}
 */
function _extractFunctionCalls(candidate) {
  const parts = candidate?.content?.parts ?? [];
  return parts
    .filter((/** @type {GeminiPart} */ p) => p.functionCall != null)
    .map((/** @type {GeminiPart} */ p) => p.functionCall);
}

/**
 * Extracts plain text from the first candidate.
 * @param {any} responseData
 * @returns {string}
 */
function _extractText(responseData) {
  return responseData?.candidates?.[0]?.content?.parts
    ?.find((/** @type {GeminiPart} */ p) => typeof p.text === 'string')
    ?.text ?? '';
}

/**
 * Parses the agent's final JSON response from raw text.
 * Strips markdown code fences if present.
 * @param {string} text
 * @returns {AgentOutfit | null}
 */
function _parseOutfitJSON(text) {
  if (!text) return null;

  // Strip markdown code fences
  const clean = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Find first { ... } block
  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed.selectedIds) || !parsed.styleName || !parsed.reasoning) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

// ─── AIAgentService ───────────────────────────────────────────────────────────

export class AIAgentService {
  /**
   * @param {string} geminiApiKey
   */
  constructor(geminiApiKey) {
    if (!geminiApiKey) throw new Error('AIAgentService requires a Gemini API key');
    this.endpoint = `${GEMINI_API_BASE}?key=${geminiApiKey}`;
  }

  /**
   * Main entry point: processes a user request through the full agentic pipeline.
   *
   * @param {string}               userMessage  - e.g. "What should I wear today?"
   * @param {WardrobeItem[]}       wardrobe      - Current wardrobe Z-index state
   * @param {AgentRequestOptions}  [options]
   * @returns {Promise<AgentResult>}
   */
  async processRequest(userMessage, wardrobe, options = {}) {
    if (!wardrobe || wardrobe.length === 0) {
      return { success: false, error: 'Wardrobe is empty. Add items first.', toolCallCount: 0 };
    }

    const systemPrompt = _buildSystemPrompt(wardrobe);
    const date = options.date ?? new Date().toISOString().slice(0, 10);

    /** @type {GeminiContent[]} */
    const contents = [
      {
        role: 'user',
        parts: [{
          text: `${userMessage}\n\n[Context: date=${date}, ` +
                `lat=${options.latitude ?? 55.7558}, lon=${options.longitude ?? 37.6173}]`,
        }],
      },
    ];

    let toolCallCount = 0;

    // ── Agentic Loop ──────────────────────────────────────────────────────────
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await this._callGemini(systemPrompt, contents);
      if (!response.success) {
        return { success: false, error: response.error, toolCallCount };
      }

      const candidate = response.data?.candidates?.[0];
      if (!candidate) {
        return { success: false, error: 'No candidate in Gemini response.', toolCallCount };
      }

      // Append model's turn to conversation history
      contents.push({
        role: 'model',
        parts: candidate.content.parts,
      });

      const functionCalls = _extractFunctionCalls(candidate);

      // ── No more tool calls → parse final answer ───────────────────────────
      if (functionCalls.length === 0) {
        const text = _extractText(response.data);
        const outfit = _parseOutfitJSON(text);

        if (!outfit) {
          return {
            success: false,
            error: `Agent returned unparseable response: "${text.slice(0, 200)}"`,
            toolCallCount,
          };
        }

        return { success: true, outfit, toolCallCount };
      }

      // ── Execute all requested tools in parallel ───────────────────────────
      toolCallCount += functionCalls.length;

      const toolResponses = await executeToolCallsParallel(
        functionCalls.map(fc => ({ name: fc.name, args: fc.args })),
        {
          openWeatherApiKey: options.openWeatherApiKey,
          googleAccessToken: options.googleAccessToken,
        },
      );

      // Inject tool results back as a single user turn with multiple functionResponse parts
      contents.push({
        role: 'user',
        parts: toolResponses.map(tr => ({
          functionResponse: {
            name: tr.name,
            response: tr.response,
          },
        })),
      });
    }

    // Exceeded MAX_TOOL_ROUNDS — force a final answer without further tool access
    return {
      success: false,
      error: `Agent exceeded maximum tool rounds (${MAX_TOOL_ROUNDS}). Last state preserved.`,
      toolCallCount,
    };
  }

  /**
   * POST to Gemini generateContent endpoint.
   * @param {string}           systemPrompt
   * @param {GeminiContent[]}  contents
   * @returns {Promise<{ success: true, data: any } | { success: false, error: string }>}
   */
  async _callGemini(systemPrompt, contents) {
    const body = {
      system_instruction: { parts: [{ text: systemPrompt }] },
      tools: AGENT_TOOLS,
      tool_config: {
        function_calling_config: { mode: 'AUTO' },
      },
      contents,
    };

    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        return { success: false, error: `Gemini API error (${res.status}): ${errText}` };
      }

      const data = await res.json();
      return { success: true, data };
    } catch (/** @type {any} */ err) {
      return { success: false, error: `Network error: ${err?.message ?? 'Unknown'}` };
    }
  }
}
