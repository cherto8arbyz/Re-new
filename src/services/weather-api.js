import { createWeather } from '../models/weather.js';

/** @type {import('../models/weather.js').WeatherCondition[]} */
const CONDITIONS = ['sunny', 'cloudy', 'rainy', 'snowy', 'windy', 'stormy'];

/**
 * Deterministic hash from date string to produce consistent mock data.
 * @param {string} dateStr
 * @returns {number}
 */
function hashDate(dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash + dateStr.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/**
 * Stub: Fetches weather for a given city and date.
 * Returns deterministic mock data based on date hash.
 * API contract: forecastService.getOptimalOutfit(date, weather, calendarEvent)
 * @param {string} city
 * @param {string} isoDate - YYYY-MM-DD
 * @returns {Promise<import('../models/weather.js').Weather>}
 */
export async function fetchWeather(city, isoDate) {
  await new Promise(r => setTimeout(r, 300));

  const h = hashDate(isoDate + city);
  const month = parseInt(isoDate.slice(5, 7), 10);

  // Temperature varies by month: winter cold, summer hot
  const baseTempByMonth = [-10, -8, -2, 5, 14, 20, 25, 23, 16, 8, 0, -6];
  const baseTemp = baseTempByMonth[month - 1] ?? 10;
  const temperature = baseTemp + (h % 11) - 5;

  // Condition based on hash and temperature
  let conditionIdx = h % CONDITIONS.length;
  if (temperature > 20) conditionIdx = h % 3; // sunny/cloudy/rainy in summer
  if (temperature < -5) conditionIdx = 3; // snowy when very cold
  const condition = CONDITIONS[conditionIdx];

  return createWeather({
    temperature,
    condition,
    humidity: 30 + (h % 50),
    windSpeed: h % 25,
  });
}

/**
 * Stub: AI Trend scoring for cost-per-wear analysis.
 * @param {import('../models/garment.js').Garment} garment
 * @returns {Promise<{ trendScore: number, costPerWear: number }>}
 */
export async function checkTrendScore(garment) {
  await new Promise(r => setTimeout(r, 150));
  const score = 0.5 + Math.random() * 0.5;
  const cpw = garment.wearCount ? (100 / garment.wearCount) : 100;
  return { trendScore: parseFloat(score.toFixed(2)), costPerWear: parseFloat(cpw.toFixed(2)) };
}
