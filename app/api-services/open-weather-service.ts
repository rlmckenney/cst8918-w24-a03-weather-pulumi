const API_KEY = process.env.WEATHER_API_KEY
const TEN_MINUTES = 1000 * 60 * 10 // in milliseconds

const resultsCache: Record<string, {lastFetch: number; data: unknown}> = {}
function getCacheEntry(key: string) {
  return resultsCache[key]
}
function setCacheEntry(key: string, data: unknown) {
  resultsCache[key] = {lastFetch: Date.now(), data}
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

  const cacheEntry = getCacheEntry(queryString)
  if (cacheEntry && !isDataStale(cacheEntry.lastFetch)) {
    return cacheEntry.data
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
