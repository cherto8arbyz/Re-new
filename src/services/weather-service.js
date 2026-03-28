import { readConfig } from '../api/backend-config.js';
import { createWeather } from '../models/weather.js';

/**
 * @typedef {Object} WeatherSnapshot
 * @property {number} temperature
 * @property {import('../models/weather.js').WeatherCondition} condition
 * @property {number} humidity
 * @property {number} windSpeed
 * @property {string} summary
 * @property {'xweather' | 'open-meteo' | 'openweather' | 'fallback'} source
 * @property {number | null} latitude
 * @property {number | null} longitude
 */

/**
 * @typedef {Object} GeoPoint
 * @property {string} city
 * @property {string} region
 * @property {string} country
 * @property {number} latitude
 * @property {number} longitude
 */

const OPEN_METEO_WEATHER_CODE = {
  0: 'sunny',
  1: 'cloudy',
  2: 'cloudy',
  3: 'cloudy',
  45: 'cloudy',
  48: 'cloudy',
  51: 'rainy',
  53: 'rainy',
  55: 'rainy',
  56: 'rainy',
  57: 'rainy',
  61: 'rainy',
  63: 'rainy',
  65: 'rainy',
  66: 'rainy',
  67: 'rainy',
  71: 'snowy',
  73: 'snowy',
  75: 'snowy',
  77: 'snowy',
  80: 'rainy',
  81: 'rainy',
  82: 'stormy',
  85: 'snowy',
  86: 'snowy',
  95: 'stormy',
  96: 'stormy',
  99: 'stormy',
};

const OPEN_WEATHER_MAP = {
  Clear: 'sunny',
  Clouds: 'cloudy',
  Rain: 'rainy',
  Drizzle: 'rainy',
  Thunderstorm: 'stormy',
  Snow: 'snowy',
  Mist: 'cloudy',
  Smoke: 'cloudy',
  Haze: 'cloudy',
  Dust: 'windy',
  Fog: 'cloudy',
  Sand: 'windy',
  Ash: 'windy',
  Squall: 'windy',
  Tornado: 'stormy',
};

export class WeatherService {
  constructor() {
    this.xweatherClientId = readConfig('XWEATHER_CLIENT_ID');
    this.xweatherClientSecret = readConfig('XWEATHER_CLIENT_SECRET');
    this.openWeatherApiKey = readConfig('OPENWEATHER_API_KEY');
  }

  /**
   * @param {number | null | undefined} latitude
   * @param {number | null | undefined} longitude
   * @returns {Promise<WeatherSnapshot>}
   */
  async getCurrentWeather(latitude, longitude) {
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      return this._fallbackWeather(null, null);
    }

    const xweather = await this._tryXWeather(latitude, longitude);
    if (xweather) return xweather;

    const openMeteo = await this._tryOpenMeteo(latitude, longitude);
    if (openMeteo) return openMeteo;

    const openWeather = await this._tryOpenWeather(latitude, longitude);
    if (openWeather) return openWeather;

    return this._fallbackWeather(latitude, longitude);
  }

  /**
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<WeatherSnapshot | null>}
   */
  async _tryXWeather(latitude, longitude) {
    if (!this.xweatherClientId || !this.xweatherClientSecret) return null;

    try {
      const place = `${latitude},${longitude}`;
      const params = new URLSearchParams({
        format: 'json',
        filter: 'day',
        limit: '1',
        client_id: this.xweatherClientId,
        client_secret: this.xweatherClientSecret,
      });

      const url = `https://data.api.xweather.com/forecasts/${encodeURIComponent(place)}?${params.toString()}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      const block = Array.isArray(data?.response) ? data.response[0] : null;
      const period = Array.isArray(block?.periods) ? block.periods[0] : null;
      if (!period) return null;

      const maxTempC = Number(period.maxTempC);
      const minTempC = Number(period.minTempC);
      const avgTempC = Number(period.avgTempC);
      const rawTempC = Number(period.tempC);
      const temperature = Number.isFinite(rawTempC)
        ? rawTempC
        : Number.isFinite(avgTempC)
        ? avgTempC
        : Number.isFinite(maxTempC) && Number.isFinite(minTempC)
        ? (maxTempC + minTempC) / 2
        : Number(period.temp);

      const humidityRaw = Number(period.humidity ?? period.rh);
      const windSpeedKphRaw = Number(
        period.windSpeedKPH ??
        period.windSpeedKPHMax ??
        period.windSpeedKPHAvg,
      );
      const windSpeedFromMph = Number(period.windSpeedMPH) * 1.60934;
      const windSpeed = Number.isFinite(windSpeedKphRaw)
        ? windSpeedKphRaw
        : Number.isFinite(windSpeedFromMph)
        ? windSpeedFromMph
        : 0;

      const summary = String(
        period.weather ||
        period.summary ||
        period.icon ||
        period.type ||
        'cloudy',
      );
      const condition = this._mapTextCondition(summary);

      return {
        temperature: Math.round(Number.isFinite(temperature) ? temperature : 0),
        condition,
        humidity: Math.round(Number.isFinite(humidityRaw) ? humidityRaw : 50),
        windSpeed: Math.round(Number.isFinite(windSpeed) ? windSpeed : 0),
        summary: `${summary}, ${Math.round(Number.isFinite(temperature) ? temperature : 0)}\u00B0C`,
        source: 'xweather',
        latitude,
        longitude,
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {string} city
   * @returns {Promise<GeoPoint | null>}
   */
  async geocodeCity(city) {
    const trimmed = city.trim();
    if (!trimmed) return null;

    const openMeteo = await this._tryOpenMeteoGeocoding(trimmed);
    if (openMeteo) return openMeteo;

    const openWeather = await this._tryOpenWeatherGeocoding(trimmed);
    if (openWeather) return openWeather;

    return null;
  }

  /**
   * @param {WeatherSnapshot} weather
   * @returns {import('../models/weather.js').Weather}
   */
  toWeatherModel(weather) {
    return createWeather({
      temperature: weather.temperature,
      condition: weather.condition,
      humidity: weather.humidity,
      windSpeed: weather.windSpeed,
    });
  }

  /**
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<WeatherSnapshot | null>}
   */
  async _tryOpenMeteo(latitude, longitude) {
    try {
      const params = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
        timezone: 'auto',
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
      if (!res.ok) return null;

      const data = await res.json();
      const current = data?.current;
      if (!current) return null;

      const weatherCode = Number(current.weather_code ?? 3);
      const mapped = /** @type {import('../models/weather.js').WeatherCondition} */ (
        OPEN_METEO_WEATHER_CODE[/** @type {keyof typeof OPEN_METEO_WEATHER_CODE} */ (weatherCode)] || 'cloudy'
      );
      const temperature = Math.round(Number(current.temperature_2m ?? 0));
      const humidity = Math.round(Number(current.relative_humidity_2m ?? 0));
      const windSpeed = Math.round(Number(current.wind_speed_10m ?? 0));

      return {
        temperature,
        condition: mapped,
        humidity,
        windSpeed,
        summary: `${mapped}, ${temperature}\u00B0C`,
        source: 'open-meteo',
        latitude,
        longitude,
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<WeatherSnapshot | null>}
   */
  async _tryOpenWeather(latitude, longitude) {
    if (!this.openWeatherApiKey) return null;

    try {
      const params = new URLSearchParams({
        lat: String(latitude),
        lon: String(longitude),
        appid: this.openWeatherApiKey,
        units: 'metric',
      });
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();

      const mainCondition = String(data?.weather?.[0]?.main || '');
      const mapped = /** @type {import('../models/weather.js').WeatherCondition} */ (
        OPEN_WEATHER_MAP[/** @type {keyof typeof OPEN_WEATHER_MAP} */ (mainCondition)] || 'cloudy'
      );
      const temperature = Math.round(Number(data?.main?.temp ?? 0));
      const humidity = Math.round(Number(data?.main?.humidity ?? 0));
      const windSpeed = Math.round(Number(data?.wind?.speed ?? 0) * 3.6);
      const description = String(data?.weather?.[0]?.description || mapped);

      return {
        temperature,
        condition: mapped,
        humidity,
        windSpeed,
        summary: `${description}, ${temperature}\u00B0C`,
        source: 'openweather',
        latitude,
        longitude,
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {string} city
   * @returns {Promise<GeoPoint | null>}
   */
  async _tryOpenMeteoGeocoding(city) {
    try {
      const params = new URLSearchParams({
        name: city,
        count: '1',
        language: 'ru',
        format: 'json',
      });
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      const hit = Array.isArray(data?.results) ? data.results[0] : null;
      if (!hit) return null;

      return {
        city: String(hit.name || city),
        region: String(hit.admin1 || hit.country || ''),
        country: String(hit.country || ''),
        latitude: Number(hit.latitude),
        longitude: Number(hit.longitude),
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {string} city
   * @returns {Promise<GeoPoint | null>}
   */
  async _tryOpenWeatherGeocoding(city) {
    if (!this.openWeatherApiKey) return null;

    try {
      const params = new URLSearchParams({
        q: city,
        limit: '1',
        appid: this.openWeatherApiKey,
      });
      const res = await fetch(`https://api.openweathermap.org/geo/1.0/direct?${params.toString()}`);
      if (!res.ok) return null;
      const data = await res.json();
      const hit = Array.isArray(data) ? data[0] : null;
      if (!hit) return null;

      return {
        city: String(hit.name || city),
        region: String(hit.state || hit.country || ''),
        country: String(hit.country || ''),
        latitude: Number(hit.lat),
        longitude: Number(hit.lon),
      };
    } catch {
      return null;
    }
  }

  /**
   * @param {number | null} latitude
   * @param {number | null} longitude
   * @returns {WeatherSnapshot}
   */
  _fallbackWeather(latitude, longitude) {
    const now = new Date();
    const month = now.getUTCMonth();
    const seasonal = Math.round(15 * Math.sin(((month - 2) / 12) * Math.PI * 2));
    const latAdjust = isFiniteNumber(latitude)
      ? Math.round((45 - Math.abs(latitude)) / 3)
      : 0;
    const lonScore = isFiniteNumber(longitude) ? Math.round(longitude * 10) : 0;
    const latScore = isFiniteNumber(latitude) ? Math.round(latitude * 10) : 0;
    const seed = Math.abs(latScore + lonScore + now.getUTCDate());
    const temperature = Math.max(-20, Math.min(34, seasonal + latAdjust + (seed % 7) - 3));

    /** @type {import('../models/weather.js').WeatherCondition} */
    const condition =
      temperature <= -2 ? 'snowy' :
      temperature <= 6 ? 'cloudy' :
      seed % 5 === 0 ? 'rainy' :
      seed % 7 === 0 ? 'windy' :
      'sunny';

    return {
      temperature,
      condition,
      humidity: 35 + (seed % 50),
      windSpeed: 5 + (seed % 25),
      summary: `Fallback weather: ${condition}, ${temperature}\u00B0C`,
      source: 'fallback',
      latitude,
      longitude,
    };
  }

  /**
   * @param {string} text
   * @returns {import('../models/weather.js').WeatherCondition}
   */
  _mapTextCondition(text) {
    const normalized = text.toLowerCase();
    if (normalized.includes('thunder') || normalized.includes('storm')) return 'stormy';
    if (normalized.includes('snow') || normalized.includes('sleet') || normalized.includes('ice')) return 'snowy';
    if (normalized.includes('rain') || normalized.includes('drizzle') || normalized.includes('shower')) return 'rainy';
    if (normalized.includes('wind') || normalized.includes('gust')) return 'windy';
    if (normalized.includes('clear') || normalized.includes('sun')) return 'sunny';
    return 'cloudy';
  }
}

/**
 * @param {number | null | undefined} value
 * @returns {value is number}
 */
function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}
