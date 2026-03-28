/**
 * Gemini function declarations used by AgentOrchestrator.
 * Tool names are intentionally strict and match business requirements.
 */

export const GEMINI_FUNCTION_DECLARATIONS = [
  {
    name: 'getCurrentWeather',
    description: 'Get current weather for the user location by latitude and longitude.',
    parameters: {
      type: 'OBJECT',
      properties: {
        latitude: {
          type: 'NUMBER',
          description: 'Latitude in decimal format, e.g. 53.9023',
        },
        longitude: {
          type: 'NUMBER',
          description: 'Longitude in decimal format, e.g. 27.5619',
        },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'getUserCalendarEvents',
    description: 'Get user calendar events for a specific date.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: {
          type: 'STRING',
          description: 'Target date in YYYY-MM-DD format.',
        },
      },
      required: ['date'],
    },
  },
  {
    name: 'getWardrobeState',
    description: 'Get full JSON wardrobe state (all user garments).',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'getTrendSignals',
    description: 'Get normalized daily fashion trend signals for a region.',
    parameters: {
      type: 'OBJECT',
      properties: {
        date: {
          type: 'STRING',
          description: 'Target date in YYYY-MM-DD format.',
        },
        region: {
          type: 'STRING',
          description: 'Region or city (for example: Minsk, Belarus).',
        },
      },
      required: ['date', 'region'],
    },
  },
];

export const GEMINI_TOOLS = [{ functionDeclarations: GEMINI_FUNCTION_DECLARATIONS }];
