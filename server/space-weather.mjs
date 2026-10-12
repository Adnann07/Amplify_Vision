export const NOAA_FEEDS = {
  alerts: {
    url: 'https://services.swpc.noaa.gov/products/alerts.json',
    ttlMs: 60_000,
  },
  kIndex: {
    url: 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json',
    ttlMs: 5 * 60_000,
  },
  forecast: {
    url: 'https://services.swpc.noaa.gov/json/45-day-forecast.json',
    ttlMs: 30 * 60_000,
  },
}

const MAX_RESPONSE_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 15_000
const MAX_CACHE_AGE_MS = 24 * 60 * 60_000
const feedNames = Object.keys(NOAA_FEEDS)

export class SpaceWeatherRequestError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'SpaceWeatherRequestError'
    this.statusCode = statusCode
  }
}

export function normalizeUtcTimestamp(value) {
  if (typeof value !== 'string' || value.length > 40) return null
  const timestamp = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value
  const milliseconds = Date.parse(timestamp)
  return Number.isFinite(milliseconds) ? new Date(milliseconds).toISOString() : null
}

export function normalizeNoaaAlerts(body, retrievedAt = new Date()) {
  if (!Array.isArray(body)) throw new SpaceWeatherRequestError('NOAA returned an unexpected alerts response.')
  const alerts = body.slice(0, 100).flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const productId = boundedString(record.product_id, 40)
    const message = boundedString(record.message, 12_000)
    const issueTime = normalizeUtcTimestamp(record.issue_datetime)
    if (!message && !productId && !issueTime) return []
    return [{
      id: productId,
      issueTime,
      message,
      raw: sanitizeRecord(record),
    }]
  })
  return {
    feed: 'alerts',
    records: alerts,
    truncated: body.length > 100,
    retrievedAt: retrievedAt.toISOString(),
  }
}

export function normalizeNoaaKIndex(body, retrievedAt = new Date()) {
  if (!Array.isArray(body)) throw new SpaceWeatherRequestError('NOAA returned an unexpected planetary K-index response.')
  const measurements = body.slice(-500).flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const time = normalizeUtcTimestamp(record.time_tag)
    const kp = finiteNumber(record.Kp)
    if (!time || kp === null || kp < 0 || kp > 9) return []
    return [{
      time,
      kp,
      aRunning: finiteNumber(record.a_running),
      stationCount: finiteNumber(record.station_count),
    }]
  })
  return {
    feed: 'kIndex',
    unit: 'Kp index (dimensionless, 0–9)',
    measurements,
    retrievedAt: retrievedAt.toISOString(),
  }
}

export function normalizeNoaaForecast(body, retrievedAt = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !Array.isArray(body.data)) {
    throw new SpaceWeatherRequestError('NOAA returned an unexpected 45-day forecast response.')
  }
  if (body.type !== 'SWPC-Forecast') {
    throw new SpaceWeatherRequestError('NOAA returned an unrecognized forecast product.')
  }
  const units = body.units && typeof body.units === 'object' && !Array.isArray(body.units) ? body.units : {}
  const allowedUnits = { ap: 'nT', f107: 'sfu' }
  if (units.ap !== allowedUnits.ap || units.f107 !== allowedUnits.f107) {
    throw new SpaceWeatherRequestError('NOAA forecast returned missing or unsupported Ap/F10.7 units.')
  }
  const values = body.data.slice(0, 300).flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const time = normalizeUtcTimestamp(record.time)
    const metric = record.metric
    const value = finiteNumber(record.value)
    if (!time || !Object.hasOwn(allowedUnits, metric) || value === null) return []
    const unit = units[metric]
    if (typeof unit !== 'string' || unit !== allowedUnits[metric]) return []
    return [{ time, metric, value, unit }]
  })
  return {
    feed: 'forecast',
    product: boundedString(body.product, 160),
    issued: normalizeUtcTimestamp(body.issued),
    description: boundedString(body.metadata?.description, 500),
    units: Object.fromEntries(Object.entries(allowedUnits).filter(([metric]) => units[metric] === allowedUnits[metric])),
    values,
    retrievedAt: retrievedAt.toISOString(),
  }
}

function boundedString(value, maxLength) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : null
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sanitizeRecord(record) {
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => !/api[_-]?key|authorization|token|secret/i.test(key))
      .slice(0, 30)
      .map(([key, value]) => [key.slice(0, 80), typeof value === 'string' ? value.slice(0, 12_000) : value]),
  )
}

export function createSpaceWeatherService({
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  cacheStore = new Map(),
  pendingRequests = new Map(),
} = {}) {
  const feedStatus = Object.fromEntries(feedNames.map((name) => [name, {
    lastSuccessfulRequestAt: null,
    lastFailedRequestAt: null,
    error: null,
  }]))

  async function getFeed(name, { force = false } = {}) {
    const config = NOAA_FEEDS[name]
    if (!config) throw new SpaceWeatherRequestError('Unknown NOAA Space Weather feed.', 404)
    const cached = cacheStore.get(name)
    const age = cached ? now().getTime() - cached.cachedAt : Infinity
    if (!force && cached && age < config.ttlMs) {
      return { ...cached.value, status: 'cached', lastFetchedAt: cached.lastFetchedAt }
    }
    if (pendingRequests.has(name)) return pendingRequests.get(name)

    const request = (async () => {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetchImpl(config.url, {
          headers: { Accept: 'application/json' },
          redirect: 'error',
          signal: controller.signal,
        })
        if (!response.ok) {
          throw new SpaceWeatherRequestError(`NOAA ${name} feed returned HTTP ${response.status}.`)
        }
        if (!(response.headers.get('content-type') ?? '').toLowerCase().includes('json')) {
          throw new SpaceWeatherRequestError(`NOAA ${name} feed returned a non-JSON response.`)
        }
        const length = Number(response.headers.get('content-length') ?? 0)
        if (length > MAX_RESPONSE_BYTES) throw new SpaceWeatherRequestError(`NOAA ${name} response exceeded the size limit.`)
        const text = await response.text()
        if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
          throw new SpaceWeatherRequestError(`NOAA ${name} response exceeded the size limit.`)
        }
        let body
        try {
          body = JSON.parse(text)
        } catch {
          throw new SpaceWeatherRequestError(`NOAA ${name} feed returned invalid JSON.`)
        }
        const retrievedAt = now()
        const value = normalizeFeed(name, body, retrievedAt)
        const entry = { value, cachedAt: retrievedAt.getTime(), lastFetchedAt: value.retrievedAt }
        cacheStore.set(name, entry)
        feedStatus[name] = { lastSuccessfulRequestAt: value.retrievedAt, lastFailedRequestAt: null, error: null }
        return { ...value, status: 'live', lastFetchedAt: entry.lastFetchedAt }
      } catch (cause) {
        const failure = controller.signal.aborted
          ? new SpaceWeatherRequestError(`NOAA ${name} request timed out.`, 504)
          : cause instanceof SpaceWeatherRequestError
            ? cause
            : new SpaceWeatherRequestError(`NOAA ${name} feed could not be reached.`)
        feedStatus[name] = { ...feedStatus[name], lastFailedRequestAt: now().toISOString(), error: failure.message }
        if (cached && now().getTime() - cached.cachedAt < MAX_CACHE_AGE_MS) {
          return { ...cached.value, status: 'stale', lastFetchedAt: cached.lastFetchedAt, error: failure.message }
        }
        throw failure
      } finally {
        clearTimeout(timeout)
        pendingRequests.delete(name)
      }
    })()
    pendingRequests.set(name, request)
    return request
  }

  async function getSummary(options) {
    const results = await Promise.allSettled(feedNames.map((name) => getFeed(name, options)))
    return Object.fromEntries(feedNames.map((name, index) => [
      name,
      results[index].status === 'fulfilled'
        ? results[index].value
        : { feed: name, status: 'unavailable', lastFetchedAt: null, error: results[index].reason.message },
    ]))
  }

  function getStatus() {
    return Object.fromEntries(feedNames.map((name) => {
      const entry = cacheStore.get(name)
      const current = feedStatus[name]
      const age = entry ? now().getTime() - entry.cachedAt : Infinity
      return [name, {
        status: current.error
          ? entry && age < MAX_CACHE_AGE_MS ? 'stale' : 'unavailable'
          : entry && age < NOAA_FEEDS[name].ttlMs ? 'cached' : 'unavailable',
        lastSuccessfulRequestAt: current.lastSuccessfulRequestAt,
        lastFetchedAt: entry?.lastFetchedAt ?? null,
        lastFailedRequestAt: current.lastFailedRequestAt,
        error: current.error,
      }]
    }))
  }

  return { getFeed, getSummary, getStatus }
}

function normalizeFeed(name, body, retrievedAt) {
  if (name === 'alerts') return normalizeNoaaAlerts(body, retrievedAt)
  if (name === 'kIndex') return normalizeNoaaKIndex(body, retrievedAt)
  return normalizeNoaaForecast(body, retrievedAt)
}

export function createSpaceWeatherHandler({ service = createSpaceWeatherService() } = {}) {
  return async function spaceWeatherHandler(request, response) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Use GET to retrieve NOAA Space Weather data.' })
      return
    }
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/space-weather/status') {
      sendJson(response, 200, service.getStatus())
      return
    }
    const force = url.searchParams.get('refresh') === '1'
    if ([...url.searchParams.keys()].some((key) => key !== 'refresh') || (url.searchParams.has('refresh') && !force)) {
      sendJson(response, 400, { error: 'Only refresh=1 is supported for this request.' })
      return
    }
    if (url.pathname === '/api/space-weather/summary') {
      sendJson(response, 200, await service.getSummary({ force }))
      return
    }
    const feed = url.pathname.match(/^\/api\/space-weather\/(alerts|k-index|forecast)$/)?.[1]
    if (!feed) {
      sendJson(response, 404, { error: 'Space-weather route not found.' })
      return
    }
    const name = feed === 'k-index' ? 'kIndex' : feed
    try {
      sendJson(response, 200, await service.getFeed(name, { force }))
    } catch (error) {
      sendJson(response, error instanceof SpaceWeatherRequestError ? error.statusCode : 502, {
        error: error instanceof SpaceWeatherRequestError ? error.message : 'NOAA Space Weather data could not be retrieved.',
      })
    }
  }
}

function sendJson(response, statusCode, body) {
  if (response.headersSent || response.destroyed) return
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}
