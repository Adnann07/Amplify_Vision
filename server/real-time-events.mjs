import { createSpaceWeatherService } from './space-weather.mjs'

export const REAL_TIME_EVENT_PROVIDERS = {
  noaa: {
    attribution: 'NOAA Space Weather Prediction Center',
    sourceUrl: 'https://services.swpc.noaa.gov/products/alerts.json',
    ttlMs: 60 * 60_000,
  },
  eonet: {
    attribution: 'NASA Earth Observatory Natural Event Tracker',
    sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events',
    ttlMs: 60 * 60_000,
  },
  jpl: {
    attribution: 'NASA/JPL Small-Body Database',
    sourceUrl: 'https://ssd-api.jpl.nasa.gov/cad.api',
    ttlMs: 60 * 60_000,
  },
}

const MAX_RESPONSE_BYTES = 4_000_000
const REQUEST_TIMEOUT_MS = 20_000
const REFRESH_INTERVAL_MS = 60 * 60_000
const MAX_STALE_AGE_MS = 7 * 24 * 60 * 60_000
const ALLOWED_EONET_CATEGORIES = new Set([
  'severeStorms',
  'wildfires',
  'volcanoes',
  'floods',
  'drought',
  'seaLakeIce',
])
const PROVIDER_IDS = Object.keys(REAL_TIME_EVENT_PROVIDERS)

export class RealTimeEventsError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'RealTimeEventsError'
    this.statusCode = statusCode
  }
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : null
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || value.length > 50) return null
  const cadDate = value.match(/^(\d{4})-([A-Za-z]{3})-(\d{2}) (\d{2}):(\d{2})$/)
  if (cadDate) {
    const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      .indexOf(cadDate[2])
    if (month < 0) return null
    const year = Number(cadDate[1])
    const day = Number(cadDate[3])
    const hour = Number(cadDate[4])
    const minute = Number(cadDate[5])
    const timestamp = new Date(Date.UTC(year, month, day, hour, minute))
    if (timestamp.getUTCFullYear() !== year || timestamp.getUTCMonth() !== month ||
        timestamp.getUTCDate() !== day || timestamp.getUTCHours() !== hour ||
        timestamp.getUTCMinutes() !== minute) return null
    return timestamp.toISOString().slice(0, -1)
  }
  const raw = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z`
    : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)
      ? `${value}Z`
      : value
  const timestamp = Date.parse(raw)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null
}

function stableFingerprint(...values) {
  const normalized = values.map((value) => String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase())
  const value = normalized.join('|')
  const hashes = [2166136261, 2246822519].map((seed) => {
    let hash = seed
    for (const character of value) {
      hash ^= character.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  })
  return hashes.join('')
}

function geometryBounds(value) {
  const stack = [{ value, depth: 0 }]
  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity }
  let coordinateCount = 0
  let visitedNodes = 0
  while (stack.length && coordinateCount < 10_000 && visitedNodes < 20_000) {
    const current = stack.pop()
    visitedNodes += 1
    if (!Array.isArray(current.value)) continue
    const [longitude, latitude] = current.value
    if (typeof longitude === 'number' && typeof latitude === 'number') {
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
          Math.abs(longitude) > 180 || Math.abs(latitude) > 90) continue
      bounds.west = Math.min(bounds.west, longitude)
      bounds.south = Math.min(bounds.south, latitude)
      bounds.east = Math.max(bounds.east, longitude)
      bounds.north = Math.max(bounds.north, latitude)
      coordinateCount += 1
      continue
    }
    if (current.depth >= 10) continue
    for (const child of current.value.slice(0, 500)) {
      stack.push({ value: child, depth: current.depth + 1 })
    }
  }
  return coordinateCount
    ? [bounds.west, bounds.south, bounds.east, bounds.north]
    : null
}

function trustedUrl(value, hosts) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      hosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
      ? url.href
      : null
  } catch {
    return null
  }
}

function hasControlCharacter(value) {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 0x20 || code === 0x7f
  })
}

export function normalizeEonetEvents(body, retrievedAt = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || body.title !== 'EONET Events' || !Array.isArray(body.events)) {
    throw new RealTimeEventsError('NASA EONET returned an unexpected events response.')
  }
  return body.events.slice(0, 200).flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const providerEventId = typeof record.id === 'string' && record.id.trim() ? record.id.trim().slice(0, 100) : null
    const title = typeof record.title === 'string' && record.title.trim() ? record.title.trim().slice(0, 240) : null
    if (!title) return []
    const categories = Array.isArray(record.categories)
      ? record.categories.slice(0, 10).flatMap((category) =>
          category && typeof category.id === 'string' && typeof category.title === 'string'
            ? [{ id: category.id.slice(0, 80), title: category.title.slice(0, 120) }]
            : [],
        )
      : []
    const geometries = Array.isArray(record.geometry)
      ? record.geometry.slice(0, 100).flatMap((geometry) => {
          if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return []
          const coordinates = Array.isArray(geometry.coordinates) ? geometry.coordinates : null
          const bounds = geometryBounds(coordinates)
          const normalizedCoordinates = coordinates?.length >= 2 &&
            typeof coordinates[0] === 'number' &&
            typeof coordinates[1] === 'number' &&
            bounds
            ? coordinates.slice(0, 8).map(finiteNumber)
            : null
          if (normalizedCoordinates?.some((coordinate) => coordinate === null)) return []
          return [{
            date: parseTimestamp(geometry.date),
            type: typeof geometry.type === 'string' ? geometry.type.slice(0, 40) : null,
            coordinates: normalizedCoordinates,
            bounds,
            hasCoordinates: bounds !== null,
            magnitudeValue: finiteNumber(geometry.magnitudeValue),
            magnitudeUnit: typeof geometry.magnitudeUnit === 'string' ? geometry.magnitudeUnit.slice(0, 30) : null,
          }]
        })
      : []
    const sources = Array.isArray(record.sources)
      ? record.sources.slice(0, 10).flatMap((source) => {
          const url = trustedUrl(source?.url, ['nasa.gov', 'noaa.gov', 'usgs.gov', 'metoc.navy.mil', 'doi.org'])
          return url ? [{ id: typeof source.id === 'string' ? source.id.slice(0, 80) : null, url }] : []
        })
      : []
    const latestGeometry = geometries.reduce((latest, geometry) =>
      geometry.date && (!latest || geometry.date > latest) ? geometry.date : latest, null)
    const active = !record.closed
    const sourceUrl = trustedUrl(record.link, ['eonet.gsfc.nasa.gov']) ??
      `https://eonet.gsfc.nasa.gov/api/v3/events/${encodeURIComponent(providerEventId ?? title)}`
    const eligibleCategory = categories.some((category) => ALLOWED_EONET_CATEGORIES.has(category.id))
    const eligible = Boolean(active && providerEventId && eligibleCategory && geometries.some((geometry) => geometry.bounds))
    return [{
      id: `eonet:${providerEventId ?? stableFingerprint(title, latestGeometry)}`,
      provider: 'eonet',
      providerLabel: REAL_TIME_EVENT_PROVIDERS.eonet.attribution,
      providerEventId,
      category: 'earth-observation',
      title,
      description: typeof record.description === 'string' ? record.description.slice(0, 1500) : null,
      eventTime: latestGeometry,
      eventTimeScale: 'UTC',
      sourceUrl,
      status: active ? 'active' : record.closed ? 'closed' : 'uncertain',
      dataKind: 'observed-event',
      categories,
      geometries,
      sources,
      measurements: geometries
        .filter((geometry) => geometry.magnitudeValue !== null)
        .slice(-20)
        .map((geometry) => ({
          label: 'Reported event magnitude',
          value: geometry.magnitudeValue,
          unit: geometry.magnitudeUnit,
        })),
      eligible,
      ineligibleReason: eligible
        ? null
        : !active
          ? 'Closed EONET events remain visible as historical context but cannot create a new exercise.'
          : 'Playable Earth-observation planning needs a supported event category and location geometry.',
      sourceFieldsUsed: ['id', 'title', 'description', 'categories', 'geometry', 'sources', 'closed'],
      retrievedAt: retrievedAt.toISOString(),
    }]
  })
}

export function normalizeJplCad(body, retrievedAt = new Date()) {
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      body.signature?.source !== 'NASA/JPL SBDB Close Approach Data API' ||
      !Array.isArray(body.fields) || !Array.isArray(body.data)) {
    throw new RealTimeEventsError('JPL CAD returned an unexpected response signature or schema.')
  }
  const indexes = new Map(body.fields.map((field, index) => [field, index]))
  for (const required of ['des', 'cd', 'dist', 'v_rel']) {
    if (!indexes.has(required)) throw new RealTimeEventsError(`JPL CAD response is missing the ${required} field.`)
  }
  return body.data.slice(0, 200).flatMap((row) => {
    if (!Array.isArray(row) || row.length !== body.fields.length) return []
    const value = (field) => row[indexes.get(field)]
    const designation = typeof value('des') === 'string' && value('des').trim() ? value('des').trim().slice(0, 120) : null
    const approachTime = parseTimestamp(value('cd'))
    const distanceAu = finiteNumber(value('dist'))
    const velocityKmS = finiteNumber(value('v_rel'))
    if (!designation || !approachTime || distanceAu === null || velocityKmS === null) return []
    const providerEventId = `${designation}::${approachTime}`
    const fullname = typeof value('fullname') === 'string' && value('fullname').trim() ? value('fullname').trim().slice(0, 180) : designation
    const diameterKm = finiteNumber(value('diameter'))
    const diameterSigmaKm = finiteNumber(value('diameter_sigma'))
    const sourceUrl = `https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=${encodeURIComponent(designation)}`
    return [{
      id: `jpl:${stableFingerprint(providerEventId, approachTime)}`,
      provider: 'jpl',
      providerLabel: REAL_TIME_EVENT_PROVIDERS.jpl.attribution,
      providerEventId,
      category: 'asteroid-investigation',
      title: `${fullname} close approach`,
      description: `JPL lists a close approach at ${distanceAu} au with relative velocity ${velocityKmS} km/s.${typeof value('t_sigma_f') === 'string' ? ` The reported close-approach time uncertainty is ${value('t_sigma_f')} (3-sigma).` : ''} This record does not provide an intercept trajectory or launch window.`,
      eventTime: approachTime,
      eventTimeScale: 'TDB',
      sourceUrl,
      status: 'scheduled-approach',
      dataKind: 'predicted-close-approach',
      measurements: [
        { label: 'Nominal distance', value: distanceAu, unit: 'au' },
        { label: 'Relative velocity', value: velocityKmS, unit: 'km/s' },
        ...(diameterKm === null ? [] : [{
          label: 'Estimated diameter',
          value: diameterKm,
          unit: 'km',
          uncertainty: diameterSigmaKm,
        }]),
        ...(finiteNumber(value('h')) === null ? [] : [{ label: 'Absolute magnitude', value: finiteNumber(value('h')), unit: 'H' }]),
      ],
      uncertainty: {
        distanceMinimumAu: finiteNumber(value('dist_min')),
        distanceMaximumAu: finiteNumber(value('dist_max')),
        diameterSigmaKm,
        timeSigma: typeof value('t_sigma_f') === 'string' ? value('t_sigma_f').slice(0, 60) : null,
      },
      eligible: true,
      ineligibleReason: null,
      sourceFieldsUsed: ['des', 'fullname', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'diameter', 'diameter_sigma', 'h', 't_sigma_f'],
      retrievedAt: retrievedAt.toISOString(),
    }]
  })
}

function parseNoaaAlerts(records, retrievedAt) {
  if (!Array.isArray(records)) throw new RealTimeEventsError('NOAA returned an unexpected alerts response.')
  return records.slice(0, 100).flatMap((record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return []
    const message = typeof record.message === 'string' ? record.message.trim().slice(0, 12_000) : ''
    const eventTime = parseTimestamp(record.issue_datetime)
    if (!message || !eventTime) return []
    const productId = typeof record.product_id === 'string' ? record.product_id.trim() : ''
    const providerEventId = productId || stableFingerprint(eventTime, message.slice(0, 500))
    const sourceSignal = /\b(?:WATCH|WARNING|ALERT|CANCEL|SUMMARY|OUTLOOK):/i.test(message)
    const cancelled = /\bCANCEL(?:LED|ATION)?\b/i.test(message)
    const ageMs = retrievedAt.getTime() - Date.parse(eventTime)
    return [{
      id: `noaa:${providerEventId}`,
      provider: 'noaa',
      providerLabel: REAL_TIME_EVENT_PROVIDERS.noaa.attribution,
      providerEventId,
      category: 'space-weather',
      title: message.match(/\b(?:WATCH|WARNING|ALERT|CANCEL|SUMMARY|OUTLOOK):[^\r\n]*/i)?.[0]?.slice(0, 180) ?? 'NOAA Space Weather alert',
      description: message,
      eventTime,
      eventTimeScale: 'UTC',
      sourceUrl: REAL_TIME_EVENT_PROVIDERS.noaa.sourceUrl,
      status: cancelled ? 'cancelled' : 'published',
      dataKind: 'published-alert',
      measurements: [],
      eligible: sourceSignal && !cancelled && ageMs >= -86_400_000 && ageMs <= 7 * 24 * 60 * 60_000 && Boolean(providerEventId),
      ineligibleReason: cancelled
        ? 'Cancelled NOAA alerts are retained for context but cannot create a new exercise.'
        : !sourceSignal
          ? 'This NOAA record does not contain a recognized alert or warning suitable for a readiness briefing.'
          : ageMs > 7 * 24 * 60 * 60_000
            ? 'This NOAA alert is more than seven days old and is not eligible for a new exercise.'
            : ageMs < -86_400_000
              ? 'This NOAA record is dated too far in the future to create an exercise.'
              : null,
      sourceFieldsUsed: ['product_id', 'issue_datetime', 'message'],
      retrievedAt: retrievedAt.toISOString(),
    }]
  })
}

function createProviderFetch(fetchImpl, timeoutMs) {
  return async (url, provider) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      })
      if (!response.ok) throw new RealTimeEventsError(`${provider} returned HTTP ${response.status}.`)
      const contentType = response.headers.get('content-type') ?? ''
      const EONET_JSON_MIME_COMPATIBILITY = provider === 'NASA EONET' &&
        contentType.toLowerCase().includes('rss+xml')
      if (contentType && !contentType.toLowerCase().includes('json') && !EONET_JSON_MIME_COMPATIBILITY) {
        throw new RealTimeEventsError(`${provider} returned a non-JSON response.`)
      }
      const contentLength = Number(response.headers.get('content-length') ?? 0)
      if (contentLength > MAX_RESPONSE_BYTES) throw new RealTimeEventsError(`${provider} response exceeded the size limit.`)
      const reader = response.body?.getReader()
      let text
      if (reader) {
        const chunks = []
        let totalBytes = 0
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          totalBytes += value.byteLength
          if (totalBytes > MAX_RESPONSE_BYTES) {
            await reader.cancel()
            throw new RealTimeEventsError(`${provider} response exceeded the size limit.`)
          }
          chunks.push(Buffer.from(value))
        }
        text = Buffer.concat(chunks, totalBytes).toString('utf8')
      } else {
        text = await response.text()
        if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) {
          throw new RealTimeEventsError(`${provider} response exceeded the size limit.`)
        }
      }
      try {
        return JSON.parse(text)
      } catch {
        throw new RealTimeEventsError(`${provider} returned invalid JSON.`)
      }
    } catch (error) {
      if (controller.signal.aborted) throw new RealTimeEventsError(`${provider} request timed out.`, 504)
      if (error instanceof RealTimeEventsError) throw error
      throw new RealTimeEventsError(`${provider} could not be reached.`)
    } finally {
      clearTimeout(timeout)
    }
  }
}

export function createRealTimeEventsService({
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  cacheStore = new Map(),
  pendingRequests = new Map(),
  spaceWeatherService = createSpaceWeatherService({ fetchImpl, now, timeoutMs }),
} = {}) {
  const getJson = createProviderFetch(fetchImpl, timeoutMs)
  const status = Object.fromEntries(PROVIDER_IDS.map((provider) => [provider, {
    lastSuccessfulRequestAt: null,
    lastFailedRequestAt: null,
    error: null,
  }]))
  let lastForcedRefreshAt = null

  async function refreshProvider(provider, force = false) {
    const config = REAL_TIME_EVENT_PROVIDERS[provider]
    if (!config) throw new RealTimeEventsError('Unknown real-time event provider.', 404)
    const cached = cacheStore.get(provider)
    const age = cached ? now().getTime() - cached.cachedAt : Infinity
    if (!force && cached && age < config.ttlMs) {
      return { provider, status: 'cached', lastSuccessfulRequestAt: cached.lastSuccessfulRequestAt, events: cached.events }
    }
    if (pendingRequests.has(provider)) return pendingRequests.get(provider)

    const task = (async () => {
      try {
        const retrievedAt = now()
        let events
        let truncated = false
        let totalAvailable = null
        if (provider === 'noaa') {
          const feed = await spaceWeatherService.getFeed('alerts', { force })
          events = parseNoaaAlerts(feed.records?.map((record) => ({
            product_id: record.id,
            issue_datetime: record.raw?.issue_datetime ?? record.issueTime,
            message: record.message,
          })), retrievedAt)
          truncated = feed.truncated === true
          totalAvailable = typeof feed.total === 'number' ? feed.total : null
          if (feed.status === 'stale') {
            const cachedAt = Date.parse(feed.lastFetchedAt ?? '') || retrievedAt.getTime()
            const lastSuccessfulRequestAt = feed.lastFetchedAt ?? retrievedAt.toISOString()
            cacheStore.set(provider, {
              events,
              cachedAt,
              lastSuccessfulRequestAt,
              truncated,
              totalAvailable,
            })
            status[provider] = {
              ...status[provider],
              lastSuccessfulRequestAt,
              lastFailedRequestAt: retrievedAt.toISOString(),
              error: feed.error ?? 'NOAA alerts are stale.',
            }
            return {
              provider,
              status: 'stale',
              lastSuccessfulRequestAt,
              error: feed.error ?? 'NOAA alerts are stale.',
              truncated,
              totalAvailable,
              events,
            }
          }
        } else if (provider === 'eonet') {
          const start = new Date(retrievedAt.getTime() - 30 * 86_400_000).toISOString().slice(0, 10)
          const query = new URLSearchParams({ status: 'open', limit: '200', start, sort: 'date' })
          const body = await getJson(`https://eonet.gsfc.nasa.gov/api/v3/events?${query}`, 'NASA EONET')
          events = normalizeEonetEvents(body, retrievedAt)
          totalAvailable = body.events.length
          truncated = body.events.length >= 200
        } else {
          const start = retrievedAt.toISOString().slice(0, 10)
          const end = new Date(retrievedAt.getTime() + 45 * 86_400_000).toISOString().slice(0, 10)
          const query = new URLSearchParams({
            'date-min': start,
            'date-max': end,
            'dist-max': '0.05',
            kind: 'a',
            fullname: 'true',
            diameter: 'true',
            sort: 'date',
          })
          const body = await getJson(`https://ssd-api.jpl.nasa.gov/cad.api?${query}`, 'JPL CAD')
          events = normalizeJplCad(body, retrievedAt)
          totalAvailable = Number.isFinite(body.count) ? body.count : body.data.length
          truncated = body.data.length > 200 || (Number.isFinite(body.count) && body.count > body.data.length)
        }
        const lastSuccessfulRequestAt = retrievedAt.toISOString()
        cacheStore.set(provider, { events, cachedAt: retrievedAt.getTime(), lastSuccessfulRequestAt, truncated, totalAvailable })
        status[provider] = { lastSuccessfulRequestAt, lastFailedRequestAt: null, error: null }
        return { provider, status: 'live', lastSuccessfulRequestAt, truncated, totalAvailable, events }
      } catch (error) {
        const failure = error instanceof RealTimeEventsError
          ? error
          : new RealTimeEventsError(`${config.attribution} data could not be retrieved.`)
        const failedAt = now().toISOString()
        status[provider] = { ...status[provider], lastFailedRequestAt: failedAt, error: failure.message }
        const cachedAfterFailure = cacheStore.get(provider)
        if (cachedAfterFailure && now().getTime() - cachedAfterFailure.cachedAt <= MAX_STALE_AGE_MS) {
          return {
            provider,
            status: 'stale',
            lastSuccessfulRequestAt: cachedAfterFailure.lastSuccessfulRequestAt,
            error: failure.message,
            truncated: cachedAfterFailure.truncated === true,
            totalAvailable: cachedAfterFailure.totalAvailable ?? null,
            events: cachedAfterFailure.events,
          }
        }
        return { provider, status: 'unavailable', lastSuccessfulRequestAt: null, error: failure.message, truncated: false, totalAvailable: null, events: [] }
      } finally {
        pendingRequests.delete(provider)
      }
    })()
    pendingRequests.set(provider, task)
    return task
  }

  async function getAll({ force = false } = {}) {
    const providers = await Promise.all(PROVIDER_IDS.map((provider) => refreshProvider(provider, force)))
    const events = new Map()
    for (const result of providers) {
      for (const event of result.events) {
        const current = events.get(event.id)
        if (!current || event.retrievedAt >= current.retrievedAt) events.set(event.id, event)
      }
    }
    return {
      retrievedAt: now().toISOString(),
      events: [...events.values()].sort((first, second) =>
        (second.eventTime ?? '').localeCompare(first.eventTime ?? '')),
      providers: Object.fromEntries(providers.map(({ events: _events, ...result }) => [result.provider, result])),
    }
  }

  async function getEvent(provider, providerEventId) {
    const feed = await refreshProvider(provider)
    if (feed.status === 'unavailable') throw new RealTimeEventsError(feed.error, 503)
    const event = feed.events.find((candidate) => candidate.providerEventId === providerEventId)
    if (!event) throw new RealTimeEventsError('The event is not present in the current provider feed.', 404)
    return { ...event, freshness: feed.status }
  }

  async function refresh({ force = true } = {}) {
    const timestamp = now().getTime()
    if (force && lastForcedRefreshAt !== null && timestamp - lastForcedRefreshAt < 10_000) {
      throw new RealTimeEventsError('Please wait before manually refreshing the event feeds again.', 429)
    }
    if (force) lastForcedRefreshAt = timestamp
    return getAll({ force })
  }

  function getStatus() {
    return Object.fromEntries(PROVIDER_IDS.map((provider) => {
      const cached = cacheStore.get(provider)
      const age = cached ? now().getTime() - cached.cachedAt : Infinity
      return [provider, {
        provider,
        status: status[provider].error
          ? cached && age <= MAX_STALE_AGE_MS ? 'stale' : 'unavailable'
          : cached && age < REAL_TIME_EVENT_PROVIDERS[provider].ttlMs ? 'cached' : 'unavailable',
        lastSuccessfulRequestAt: cached?.lastSuccessfulRequestAt ?? null,
        lastFailedRequestAt: status[provider].lastFailedRequestAt,
        error: status[provider].error,
        truncated: cached?.truncated === true,
        totalAvailable: cached?.totalAvailable ?? null,
      }]
    }))
  }
  const backgroundRefreshTimer = setInterval(() => {
    void getAll().catch((error) => {
      console.error('Scheduled real-time event refresh failed.', error)
    })
  }, REFRESH_INTERVAL_MS)
  backgroundRefreshTimer.unref?.()
  return { getAll, getEvent, refresh, getStatus }
}

export function createRealTimeEventsHandler({ service = createRealTimeEventsService() } = {}) {
  return async function realTimeEventsHandler(request, response) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (url.pathname === '/api/real-time-events/status') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Use GET for provider status.' })
      return sendJson(response, 200, service.getStatus())
    }
    if (url.pathname === '/api/real-time-events/refresh') {
      if (request.method !== 'POST') return sendJson(response, 405, { error: 'Use POST to refresh event feeds.' })
      try {
        return sendJson(response, 200, await service.refresh({ force: true }))
      } catch (error) {
        return sendJson(response, error instanceof RealTimeEventsError ? error.statusCode : 502, {
          error: error instanceof RealTimeEventsError ? error.message : 'Event feeds could not be refreshed.',
        })
      }
    }
    const createMatch = url.pathname.match(/^\/api\/real-time-events\/(noaa|eonet|jpl)\/([^/]+)$/)
    if (url.pathname === '/api/real-time-events') {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Use GET to retrieve real-time events.' })
      const allowedQuery = new Set(['category', 'provider', 'search', 'limit'])
      if ([...url.searchParams.keys()].some((key) => !allowedQuery.has(key))) {
        return sendJson(response, 400, { error: 'One or more event filters are unsupported.' })
      }
      const category = url.searchParams.get('category') ?? 'all'
      if (!['all', 'space-weather', 'earth-observation', 'asteroid-investigation'].includes(category)) {
        return sendJson(response, 400, { error: 'Unsupported event category.' })
      }
      const provider = url.searchParams.get('provider') ?? 'all'
      if (!['all', ...PROVIDER_IDS].includes(provider)) return sendJson(response, 400, { error: 'Unsupported event provider.' })
      const search = url.searchParams.get('search') ?? ''
      if (search.length > 100 || hasControlCharacter(search)) return sendJson(response, 400, { error: 'Search text must be at most 100 printable characters.' })
      const limitText = url.searchParams.get('limit') ?? '500'
      if (!/^\d{1,3}$/.test(limitText) || Number(limitText) < 1 || Number(limitText) > 500) {
        return sendJson(response, 400, { error: 'Event limit must be an integer from 1 to 500.' })
      }
      try {
        const result = await service.getAll()
        const events = result.events.filter((event) =>
          (category === 'all' || event.category === category) &&
          (provider === 'all' || event.provider === provider) &&
          (!search || `${event.title} ${event.description ?? ''} ${event.providerEventId}`.toLowerCase().includes(search.toLowerCase())),
        ).slice(0, Number(limitText))
        return sendJson(response, 200, { ...result, events })
      } catch {
        return sendJson(response, 502, { error: 'Real-time events could not be retrieved.' })
      }
    }
    if (createMatch) {
      if (request.method !== 'GET') return sendJson(response, 405, { error: 'Use GET to verify an event before mission creation.' })
      let providerEventId
      try {
        providerEventId = decodeURIComponent(createMatch[2])
      } catch {
        return sendJson(response, 400, { error: 'The event identifier is malformed.' })
      }
      if (providerEventId.length < 1 || providerEventId.length > 160 || hasControlCharacter(providerEventId)) {
        return sendJson(response, 400, { error: 'The event identifier is invalid.' })
      }
      try {
        const event = await service.getEvent(createMatch[1], providerEventId)
        if (!event.eligible) return sendJson(response, 409, { error: event.ineligibleReason, event })
        return sendJson(response, 200, { event })
      } catch (error) {
        return sendJson(response, error instanceof RealTimeEventsError ? error.statusCode : 502, {
          error: error instanceof RealTimeEventsError ? error.message : 'The selected event could not be verified.',
        })
      }
    }
    return sendJson(response, 404, { error: 'Real-time events route not found.' })
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
