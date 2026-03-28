/**
 * @fileoverview calendar-tool — get_calendar_events implementation.
 * Production path: replace `_fetchFromGoogleCalendar` with OAuth 2.0 + Google Calendar API v3.
 * Current state: returns deterministic mock events that reflect realistic daily scenarios.
 */

/**
 * @typedef {Object} CalendarEvent
 * @property {string}  id            - Unique event ID
 * @property {string}  time          - HH:MM format (local time)
 * @property {string}  title         - Event name
 * @property {string}  location      - Where the event takes place (if known)
 * @property {'formal' | 'business_casual' | 'smart_casual' | 'casual' | 'athletic' | 'evening'} dressCode
 * @property {string}  dressSuggestion - AI-friendly hint for outfit selection
 */

/**
 * @typedef {Object} CalendarResult
 * @property {string}          date            - ISO 8601 date
 * @property {CalendarEvent[]} events          - Sorted by time ascending
 * @property {string}          daySummary      - Brief description of the day's dominant vibe
 * @property {boolean}         isOfflineFallback
 */

/**
 * Mock event scenarios keyed by day-of-week (0=Sun … 6=Sat).
 * In production, these are replaced by real Google Calendar data.
 * @type {Record<number, Omit<CalendarEvent, 'id'>[]>}
 */
const MOCK_SCENARIOS = {
  0: [ // Sunday
    {
      time: '11:00',
      title: 'Brunch with friends',
      location: 'Café Pushkin, Moscow',
      dressCode: 'smart_casual',
      dressSuggestion: 'Relaxed but put-together — nice jeans, a clean shirt or blouse.',
    },
  ],
  1: [ // Monday
    {
      time: '10:00',
      title: 'Investor meeting',
      location: 'Skolkovo Innovation Center',
      dressCode: 'business_casual',
      dressSuggestion: 'Sharp and professional — blazer, trousers/skirt, minimal accessories.',
    },
    {
      time: '19:00',
      title: 'Networking cocktail',
      location: 'The Ritz-Carlton Bar',
      dressCode: 'evening',
      dressSuggestion: 'Elevated evening look — dark tones, quality fabrics, statement piece.',
    },
  ],
  2: [ // Tuesday
    {
      time: '09:00',
      title: 'Morning run',
      location: 'Gorky Park',
      dressCode: 'athletic',
      dressSuggestion: 'Performance activewear — moisture-wicking fabrics, comfortable fit.',
    },
    {
      time: '14:00',
      title: 'Creative team standup',
      location: 'Re:new HQ',
      dressCode: 'casual',
      dressSuggestion: 'Comfortable creative casual — expressive pieces welcome.',
    },
  ],
  3: [ // Wednesday
    {
      time: '10:00',
      title: 'Board presentation',
      location: 'Central Office, Floor 12',
      dressCode: 'formal',
      dressSuggestion: 'Full formal attire — suit, tie or equivalent. Immaculate grooming.',
    },
  ],
  4: [ // Thursday
    {
      time: '13:00',
      title: 'Fashion show preview',
      location: 'Manege Exhibition Hall',
      dressCode: 'smart_casual',
      dressSuggestion: 'Fashion-forward but wearable — show personal style, avoid boring basics.',
    },
    {
      time: '20:00',
      title: 'Dinner date',
      location: 'Selfie Restaurant',
      dressCode: 'evening',
      dressSuggestion: 'Romantic evening look — refined, flattering, memorable.',
    },
  ],
  5: [ // Friday
    {
      time: '11:00',
      title: 'Casual team lunch',
      location: 'Local bistro',
      dressCode: 'casual',
      dressSuggestion: 'Weekend-ready casual — denim, sneakers, relaxed fit.',
    },
  ],
  6: [ // Saturday
    {
      time: '10:00',
      title: 'Yoga class',
      location: 'Studio Yoga Space',
      dressCode: 'athletic',
      dressSuggestion: 'Flexible activewear — leggings, sports top, minimal shoes.',
    },
    {
      time: '15:00',
      title: 'Gallery opening',
      location: 'Garage Museum of Contemporary Art',
      dressCode: 'smart_casual',
      dressSuggestion: 'Artsy and thoughtful — interesting textures or statement item.',
    },
  ],
};

/** Dominant vibe labels for daySummary */
const DAY_VIBE = {
  formal:           'High-formality day — professional attire throughout.',
  business_casual:  'Business-casual day — polished but not overly stiff.',
  evening:          'Evening-heavy day — plan a look that transitions from day to night.',
  athletic:         'Active day — prioritize comfort and performance.',
  smart_casual:     'Social and creative day — smart casual is your range.',
  casual:           'Relaxed day — comfort-first, personal expression welcome.',
};

/**
 * Determines the dominant dress code for the day.
 * Prioritizes highest-formality event.
 * @param {Omit<CalendarEvent, 'id'>[]} events
 * @returns {CalendarEvent['dressCode']}
 */
function _dominantDressCode(events) {
  const priority = ['formal', 'evening', 'business_casual', 'smart_casual', 'casual', 'athletic'];
  for (const code of priority) {
    if (events.some(e => e.dressCode === code)) {
      return /** @type {CalendarEvent['dressCode']} */ (code);
    }
  }
  return 'casual';
}

/**
 * Fetches events from Google Calendar API. Stub — always returns null.
 * @param {string} date
 * @param {string} [accessToken]
 * @returns {Promise<CalendarResult | null>}
 */
async function _fetchFromGoogleCalendar(date, accessToken) {
  // TODO: Implement OAuth 2.0 flow and Google Calendar API v3 call.
  // const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=...&timeMax=...`;
  void date; void accessToken;
  return null;
}

/**
 * Tool handler: get_calendar_events.
 * @param {{ date: string }} args
 * @param {{ googleAccessToken?: string }} [options]
 * @returns {Promise<CalendarResult>}
 */
export async function getCalendarEvents(args, options = {}) {
  const { date } = args;

  const real = await _fetchFromGoogleCalendar(date, options.googleAccessToken);
  if (real) return real;

  // Offline/stub fallback — deterministic per day-of-week
  const dayOfWeek = new Date(date).getDay();
  const rawEvents = MOCK_SCENARIOS[dayOfWeek] ?? [];

  const events = rawEvents.map((e, idx) => ({
    ...e,
    id: `mock-evt-${date}-${idx}`,
  }));

  const dominant = _dominantDressCode(rawEvents);

  return {
    date,
    events,
    daySummary: events.length === 0
      ? 'No events scheduled — a free, casual day.'
      : DAY_VIBE[dominant] ?? 'Mixed schedule today.',
    isOfflineFallback: true,
  };
}
