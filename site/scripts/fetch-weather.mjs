import config from "../site.config.mjs";
import { fetchJson, writeData, warn } from "./lib/util.mjs";

const WMO = {
  0: ["Clear", "☀️"], 1: ["Mainly clear", "🌤️"], 2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"], 45: ["Fog", "🌫️"], 48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"], 53: ["Drizzle", "🌦️"], 55: ["Heavy drizzle", "🌧️"],
  61: ["Light rain", "🌦️"], 63: ["Rain", "🌧️"], 65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"], 67: ["Freezing rain", "🌧️"],
  71: ["Light snow", "🌨️"], 73: ["Snow", "🌨️"], 75: ["Heavy snow", "❄️"],
  77: ["Snow grains", "🌨️"], 80: ["Showers", "🌦️"], 81: ["Showers", "🌧️"],
  82: ["Heavy showers", "🌧️"], 85: ["Snow showers", "🌨️"], 86: ["Snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"], 96: ["Thunderstorm", "⛈️"], 99: ["Thunderstorm", "⛈️"]
};
const label = (code) => (WMO[code] || ["—", "🌡️"]);

export async function fetchWeather() {
  const { latitude, longitude, timezone } = config.weather;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
    `&current=temperature_2m,apparent_temperature,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max` +
    `&forecast_days=6&timezone=${encodeURIComponent(timezone)}`;
  try {
    const j = await fetchJson(url);
    const days = (j.daily?.time || []).map((date, i) => {
      const [text, icon] = label(j.daily.weather_code?.[i]);
      return {
        date,
        max: Math.round(j.daily.temperature_2m_max?.[i]),
        min: Math.round(j.daily.temperature_2m_min?.[i]),
        precipChance: j.daily.precipitation_probability_max?.[i] ?? null,
        text, icon
      };
    });
    const [curText, curIcon] = label(j.current?.weather_code);
    return writeData("weather.json", {
      updatedAt: new Date().toISOString(),
      source: "Open-Meteo",
      sourceUrl: "https://open-meteo.com/",
      current: {
        temp: Math.round(j.current?.temperature_2m),
        feelsLike: Math.round(j.current?.apparent_temperature),
        text: curText, icon: curIcon
      },
      days
    }, { keepOldIfEmpty: false });
  } catch (e) {
    warn(`weather: fetch failed (${e.message}) — keeping previous data`);
    return false;
  }
}
