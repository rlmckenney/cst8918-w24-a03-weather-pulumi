import Redis from 'ioredis';

const API_KEY = process.env.WEATHER_API_KEY
const TEN_MINUTES = 1000 * 60 * 10 // in milliseconds
const REDIS_HOST = process.env.REDIS_HOST
const REDIS_KEY = process.env.REDIS_KEY

// Create a Redis client
// REDIS_HOST="myRedisInstance15813d52.redis.cache.windows.net"
// REDIS_KEY="KRVmBdHeRsQwKFvfkiJV8uQDde9oNYJK8AzCaJRfIRo="
const redisClient = new Redis({
  host: REDIS_HOST,
  //  "myRedisInstance15813d52.redis.cache.windows.net", // Replace with your Azure Redis Cache name
  port: 6380,
  password: REDIS_KEY,
  //  "KRVmBdHeRsQwKFvfkiJV8uQDde9oNYJK8AzCaJRfIRo=", // Replace with your Redis Cache access key
  tls: { servername: REDIS_HOST }, 
  //  "myRedisInstance15813d52.redis.cache.windows.net" },
});



// Handle errors
redisClient.on('error', (err) => {
  console.error(`Redis Error: ${err}`);
});

async function getCacheEntry(key: string) {
  const cachedData = await redisClient.get(key);
  return cachedData ? JSON.parse(cachedData) : null;
}

async function setCacheEntry(key: string, data: unknown) {
  await redisClient.set(key, JSON.stringify({ data, lastFetch: Date.now() }));
}


function isDataStale(lastFetch: number) {
  return Date.now() - lastFetch > TEN_MINUTES
}

interface FetchWeatherDataParams {
  lat: number
  lon: number
  units: string
}
export async function fetchWeatherData({
  lat,
  lon,
  units
}: FetchWeatherDataParams) {
  const baseURL = 'https://api.openweathermap.org/data/3.0/onecall'
  const queryString = `lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`

  const cacheEntry = await getCacheEntry(queryString);
  if (cacheEntry && !isDataStale(cacheEntry.lastFetch)) {
    return cacheEntry.data;
  }
  const response = await fetch(`${baseURL}?${queryString}`)
  const data = await response.json()
  setCacheEntry(queryString, data)
  return data
}

export async function getGeoCoordsForPostalCode(
  postalCode: string,
  countryCode: string
) {
  const url = `http://api.openweathermap.org/geo/1.0/zip?zip=${postalCode},${countryCode}&appid=${API_KEY}`
  const response = await fetch(url)
  const data = response.json()
  return data
}
