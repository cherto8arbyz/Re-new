/**
 * @fileoverview tool-executor — Routes Gemini function calls to their concrete implementations.
 * Decoupled from the LLM layer: AIAgentService hands off `functionCall` objects here,
 * and gets back `functionResponse` payloads to inject into the conversation.
 */

import { getRegionalWeather } from './tools/weather-tool.js';
import { getCalendarEvents }  from './tools/calendar-tool.js';
import { researchFashionTrends } from './tools/trends-tool.js';

/**
 * @typedef {Object} FunctionCall
 * @property {string} name
 * @property {Record<string, any>} args
 */

/**
 * @typedef {Object} FunctionResponse
 * @property {string} name
 * @property {{ result: any } | { error: string }} response
 */

/**
 * @typedef {Object} ToolExecutorOptions
 * @property {string} [openWeatherApiKey]
 * @property {string} [googleAccessToken]
 */

/**
 * Executes a single tool call dispatched by the LLM.
 * Wraps all errors so the agent always receives a structured response (never throws).
 *
 * @param {FunctionCall} call
 * @param {ToolExecutorOptions} [options]
 * @returns {Promise<FunctionResponse>}
 */
export async function executeToolCall(call, options = {}) {
  try {
    let result;

    switch (call.name) {
      case 'get_regional_weather':
        result = await getRegionalWeather(
          /** @type {any} */ (call.args),
          { openWeatherApiKey: options.openWeatherApiKey },
        );
        break;

      case 'get_calendar_events':
        result = await getCalendarEvents(
          /** @type {any} */ (call.args),
          { googleAccessToken: options.googleAccessToken },
        );
        break;

      case 'research_fashion_trends':
        result = await researchFashionTrends(/** @type {any} */ (call.args));
        break;

      default:
        return {
          name: call.name,
          response: { error: `Unknown tool: "${call.name}"` },
        };
    }

    return { name: call.name, response: { result } };
  } catch (/** @type {any} */ err) {
    // Surface the error to the agent rather than crashing the orchestrator
    return {
      name: call.name,
      response: { error: `Tool "${call.name}" failed: ${err?.message ?? 'Unknown error'}` },
    };
  }
}

/**
 * Executes multiple tool calls in parallel, preserving order in the returned array.
 * Gemini may request several tools simultaneously — we honour that for latency.
 *
 * @param {FunctionCall[]} calls
 * @param {ToolExecutorOptions} [options]
 * @returns {Promise<FunctionResponse[]>}
 */
export async function executeToolCallsParallel(calls, options = {}) {
  return Promise.all(calls.map(call => executeToolCall(call, options)));
}
