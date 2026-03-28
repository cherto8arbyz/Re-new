/**
 * @typedef {'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy' | 'stormy'} WeatherCondition
 */

/**
 * @typedef {Object} Weather
 * @property {number} temperature - Celsius
 * @property {WeatherCondition} condition
 * @property {number} humidity - Percentage 0-100
 * @property {number} windSpeed - km/h
 * @property {string} icon - Weather icon identifier
 */

/**
 * @param {Partial<Weather> & { temperature: number, condition: WeatherCondition }} data
 * @returns {Weather}
 */
export function createWeather(data) {
  return {
    temperature: data.temperature,
    condition: data.condition,
    humidity: data.humidity ?? 50,
    windSpeed: data.windSpeed ?? 0,
    icon: data.icon ?? getWeatherIcon(data.condition),
  };
}

/**
 * @param {WeatherCondition} condition
 * @returns {string}
 */
function getWeatherIcon(condition) {
  const icons = {
    sunny: '\u2600\uFE0F',
    cloudy: '\u2601\uFE0F',
    rainy: '\uD83C\uDF27\uFE0F',
    snowy: '\u2744\uFE0F',
    windy: '\uD83C\uDF2C\uFE0F',
    stormy: '\u26C8\uFE0F',
  };
  return icons[condition] || '\u2600\uFE0F';
}
