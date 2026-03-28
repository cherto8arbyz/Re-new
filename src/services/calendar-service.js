import { readConfig } from '../api/backend-config.js';

/**
 * @typedef {Object} CalendarEvent
 * @property {string} id
 * @property {string} title
 * @property {string} start
 * @property {string} [end]
 * @property {string} [dressCode]
 */

/**
 * Calendar service placeholder.
 * Real integration requires:
 * - GCP_CALENDAR_KEY (or OAuth access token scope for calendar.readonly)
 */
export class CalendarService {
  constructor() {
    this.apiKey = readConfig('GCP_CALENDAR_KEY');
    this.calendarId = readConfig('GOOGLE_CALENDAR_ID', 'primary');
    this.timeZone = readConfig('USER_TIMEZONE', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  /**
   * @param {string} date - YYYY-MM-DD
   * @param {string} [accessToken]
   * @returns {Promise<CalendarEvent[]>}
   */
  async getUserCalendarEvents(date, accessToken) {
    const remote = await this._tryGoogleCalendar(date, accessToken);
    if (remote) return remote;
    return this._fallbackEvents(date);
  }

  /**
   * @param {string} date
   * @param {string} [accessToken]
   * @returns {Promise<CalendarEvent[] | null>}
   */
  async _tryGoogleCalendar(date, accessToken) {
    if (!accessToken && !this.apiKey) return null;

    const start = `${date}T00:00:00`;
    const end = `${date}T23:59:59`;
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: new Date(`${start}Z`).toISOString(),
      timeMax: new Date(`${end}Z`).toISOString(),
      timeZone: this.timeZone,
      maxResults: '20',
    });
    if (this.apiKey) params.set('key', this.apiKey);

    const calendarId = encodeURIComponent(this.calendarId || 'primary');
    const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?${params.toString()}`;

    const res = await fetch(url, {
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) return null;

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];
    return items.map((/** @type {any} */ item, /** @type {number} */ index) => ({
      id: item.id || `gc-${date}-${index}`,
      title: item.summary || 'Untitled event',
      start: item?.start?.dateTime || item?.start?.date || `${date}T00:00:00`,
      end: item?.end?.dateTime || item?.end?.date,
      dressCode: this._inferDressCode(item.summary || ''),
      source: 'google-calendar',
    }));
  }

  /**
   * @param {string} summary
   * @returns {string}
   */
  _inferDressCode(summary) {
    const text = summary.toLowerCase();
    if (text.includes('dinner') || text.includes('restaurant') || text.includes('cocktail')) {
      return 'smart casual';
    }
    if (text.includes('meeting') || text.includes('presentation')) {
      return 'business casual';
    }
    if (text.includes('gym') || text.includes('run') || text.includes('yoga')) {
      return 'sport';
    }
    return 'casual';
  }

  /**
   * @param {string} date
   * @returns {CalendarEvent[]}
   */
  _fallbackEvents(date) {
    const day = new Date(`${date}T12:00:00`).getDay();
    if (day === 5) {
      return [{
        id: `fallback-${date}-1`,
        title: '19:00 - Restaurant, dress-code: Smart Casual',
        start: `${date}T19:00:00`,
        end: `${date}T21:00:00`,
        dressCode: 'smart casual',
      }];
    }

    if (day === 1) {
      return [{
        id: `fallback-${date}-1`,
        title: '10:00 - Team meeting',
        start: `${date}T10:00:00`,
        end: `${date}T11:00:00`,
        dressCode: 'business casual',
      }];
    }

    return [];
  }
}
