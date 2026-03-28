/**
 * @fileoverview JSON Schema declarations for AI Agent tools.
 * These schemas are passed verbatim to the Gemini API as `functionDeclarations`.
 * The model uses them to decide *when* and *how* to call each tool.
 *
 * Spec: https://ai.google.dev/api/generate-content#v1beta.FunctionDeclaration
 */

/**
 * @typedef {Object} FunctionDeclaration
 * @property {string} name
 * @property {string} description
 * @property {{ type: string, properties: Record<string, any>, required: string[] }} parameters
 */

/** @type {FunctionDeclaration} */
export const GET_REGIONAL_WEATHER_SCHEMA = {
  name: 'get_regional_weather',
  description: `Fetches real-time weather data for a geographic location on a specific date.
Call this tool whenever the user asks what to wear, wants an outfit suggestion, or the system
generates a morning "Outfit of the Day". Returns temperature (°C), weather condition, precipitation
probability, wind speed, and a human-readable summary.`,
  parameters: {
    type: 'object',
    properties: {
      latitude: {
        type: 'number',
        description: 'Geographic latitude of the user\'s location (e.g. 55.7558 for Moscow).',
      },
      longitude: {
        type: 'number',
        description: 'Geographic longitude of the user\'s location (e.g. 37.6173 for Moscow).',
      },
      date: {
        type: 'string',
        description: 'ISO 8601 date string (YYYY-MM-DD). Use today\'s date if not specified.',
      },
    },
    required: ['latitude', 'longitude', 'date'],
  },
};

/** @type {FunctionDeclaration} */
export const GET_CALENDAR_EVENTS_SCHEMA = {
  name: 'get_calendar_events',
  description: `Retrieves the user's calendar events for a specific date from Google Calendar.
Call this tool to understand the social context of the day (formal meeting, casual hangout, date night,
gym session, etc.) before recommending an outfit. The dress code implied by events MUST influence
outfit formality and style.`,
  parameters: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'ISO 8601 date string (YYYY-MM-DD) for which to fetch events.',
      },
    },
    required: ['date'],
  },
};

/** @type {FunctionDeclaration} */
export const RESEARCH_FASHION_TRENDS_SCHEMA = {
  name: 'research_fashion_trends',
  description: `Researches current fashion trends by scanning social media (Instagram, Pinterest)
and fashion publications. Call this tool when:
- The user uploads an unfamiliar garment and asks how to style it
- The user asks "What's trendy right now?" or "How do people wear [item]?"
- You need to validate that a suggested combination is on-trend.
Returns a curated list of trend descriptions and styling tips.`,
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Fashion query string (e.g. "cargo pants 2026 styling", "quiet luxury trend").',
      },
    },
    required: ['query'],
  },
};

/**
 * All tool declarations bundled for the Gemini API `tools` field.
 * @type {{ functionDeclarations: FunctionDeclaration[] }[]}
 */
export const AGENT_TOOLS = [
  {
    functionDeclarations: [
      GET_REGIONAL_WEATHER_SCHEMA,
      GET_CALENDAR_EVENTS_SCHEMA,
      RESEARCH_FASHION_TRENDS_SCHEMA,
    ],
  },
];
