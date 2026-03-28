/**
 * @fileoverview weather-tool — get_regional_weather implementation.
 * Production path: replace `_fetchFromOpenWeather` with a real OpenWeatherMap API call.
 * Current state: stub that returns deterministic mock data derived from coordinates + date.
 */

/**
 * @typedef {Object} WeatherResult
 * @property {number}  temperature       - Feels-like temperature in °C
 * @property {number}  temperatureMax    - Daytime high in °C
 * @property {number}  temperatureMin    - Overnight low in °C
 * @property {string}  condition         - Human-readable condition (e.g. "Partly Cloudy")
 * @property {number}  precipitationPct  - Probability of precipitation 0–100
 * @property {number}  windKph           - Wind speed in km/h
 * @property {string}  summary           - One-sentence stylist-friendly summary
 * @property {boolean} isOfflineFallback - True when real API was unavailable
 */

const MOCK_CONDITIONS = [
  { condition: 'Sunny',         precipitationPct: 5,  windKph: 10 },
  { condition: 'Partly Cloudy', precipitationPct: 20, windKph: 15 },
  { condition: 'Overcast',      precipitationPct: 40, windKph: 20 },
  { condition: 'Light Rain',    precipitationPct: 75, windKph: 25 },
  { condition: 'Heavy Rain',    precipitationPct: 95, windKph: 35 },
  { condition: 'Snow',          precipitationPct: 80, windKph: 18 },
];

/**
 * Derives a deterministic "temperature" from lat/lon/date for offline stub.
 * Formula is intentionally simple — not scientific.
 * @param {number} lat
 * @param {number} lon
 * @param {string} date
 * @returns {number}
 */
function _deriveTemperature(lat, lon, date) {
  const month = new Date(date).getMonth(); // 0–11
  // Seasonal base: warm in summer, cold in winter (Northern Hemisphere)
  const seasonalBase = Math.round(20 * Math.sin(((month - 3) / 12) * 2 * Math.PI));
  // Latitude adjustment: further from equator = colder
  const latAdjust = Math.round((45 - Math.abs(lat)) / 3);
  return Math.max(-30, Math.min(40, seasonalBase + latAdjust));
}

/**
 * Picks a mock condition index deterministically from coordinates.
 * @param {number} lat
 * @param {number} lon
 * @returns {number}
 */
function _deriveConditionIndex(lat, lon) {
  return Math.abs(Math.round(lat + lon)) % MOCK_CONDITIONS.length;
}

/**
 * Generates a stylist-friendly summary from weather data.
 * @param {Omit<WeatherResult, 'summary' | 'isOfflineFallback'>} w
 * @returns {string}
 */
function _buildSummary(w) {
  const parts = [`${w.condition}, ${w.temperature}°C`];
  if (w.precipitationPct > 60) parts.push('rain likely — bring a waterproof layer');
  else if (w.precipitationPct > 30) parts.push('possible showers — pack an umbrella');
  if (w.temperature < 0) parts.push('freezing — heavy winter outerwear essential');
  else if (w.temperature < 10) parts.push('cold — warm layers recommended');
  else if (w.temperature < 18) parts.push('cool — light jacket advised');
  else if (w.temperature > 28) parts.push('hot — breathable fabrics only');
  if (w.windKph > 30) parts.push('windy — secure loose accessories');
  return parts.join('; ');
}

/**
 * Fetches real weather from OpenWeatherMap. Stub implementation.
 * @param {number} lat
 * @param {number} lon
 * @param {string} date
 * @param {string} [apiKey]
 * @returns {Promise<WeatherResult | null>} null on failure
 */
async function _fetchFromOpenWeather(lat, lon, date, apiKey) {
  // TODO: Replace with actual fetch when API key is provisioned.
  // const url = `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`;
  void lat; void lon; void date; void apiKey;
  return null; // Stub: always fall through to mock
}

/**
 * Tool handler: get_regional_weather.
 * @param {{ latitude: number, longitude: number, date: string }} args
 * @param {{ openWeatherApiKey?: string }} [options]
 * @returns {Promise<WeatherResult>}
 */
export async function getRegionalWeather(args, options = {}) {
  const { latitude, longitude, date } = args;

  // Attempt real API first
  const real = await _fetchFromOpenWeather(latitude, longitude, date, options.openWeatherApiKey);
  if (real) return real;

  // Offline/stub fallback
  const temp = _deriveTemperature(latitude, longitude, date);
  const condIdx = _deriveConditionIndex(latitude, longitude);
  const mock = MOCK_CONDITIONS[condIdx];

  /** @type {Omit<WeatherResult, 'summary' | 'isOfflineFallback'>} */
  const partial = {
    temperature:      temp,
    temperatureMax:   temp + 3,
    temperatureMin:   temp - 5,
    condition:        mock.condition,
    precipitationPct: mock.precipitationPct,
    windKph:          mock.windKph,
  };

  return {
    ...partial,
    summary:           _buildSummary(partial),
    isOfflineFallback: true,
  };
}
