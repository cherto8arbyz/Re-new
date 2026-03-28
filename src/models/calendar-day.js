/**
 * @typedef {Object} CalendarDay
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {import('./weather.js').Weather | null} weather
 * @property {string[]} events - Calendar event names
 * @property {string | null} outfitId - Linked outfit ID
 */

/**
 * @param {{ date: string, weather?: import('./weather.js').Weather | null, events?: string[], outfitId?: string | null }} data
 * @returns {CalendarDay}
 */
export function createCalendarDay(data) {
  return {
    date: data.date,
    weather: data.weather ?? null,
    events: data.events ?? [],
    outfitId: data.outfitId ?? null,
  };
}
