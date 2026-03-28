const DAY_NAMES_SHORT_RU = ['ВС', 'ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ'];

/**
 * Adds days to an ISO date string and returns a new ISO date string.
 * @param {string} isoDate - YYYY-MM-DD
 * @param {number} days
 * @returns {string} - YYYY-MM-DD
 */
export function addDays(isoDate, days) {
  const d = new Date(isoDate + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Formats an ISO date as "DD.MM".
 * @param {string} isoDate
 * @returns {string}
 */
export function formatDateShort(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}.${month}`;
}

/**
 * Returns the short Russian day name (ПН, ВТ, ...).
 * @param {string} isoDate
 * @returns {string}
 */
export function getDayNameRu(isoDate) {
  const d = new Date(isoDate + 'T12:00:00');
  return DAY_NAMES_SHORT_RU[d.getDay()];
}

/**
 * Checks if an ISO date string is today.
 * @param {string} isoDate
 * @returns {boolean}
 */
export function isToday(isoDate) {
  return isoDate === new Date().toISOString().slice(0, 10);
}

/**
 * Returns an array of ISO date strings centered around the given date.
 * @param {string} centerDate
 * @param {number} [range=3] - How many days before and after
 * @returns {string[]}
 */
export function getDateRange(centerDate, range = 3) {
  const result = [];
  for (let i = -range; i <= range; i++) {
    result.push(addDays(centerDate, i));
  }
  return result;
}
