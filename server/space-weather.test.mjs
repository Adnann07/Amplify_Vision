import { createServer } from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createSpaceWeatherHandler,
  createSpaceWeatherService,
  normalizeNoaaAlerts,
  normalizeNoaaForecast,
  normalizeNoaaKIndex,
  normalizeUtcTimestamp,
  NOAA_FEEDS,
} from './space-weather.mjs'

function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

function createCache() {
  return { cacheStore: new Map(), pendingRequests: new Map() }
}

async function withApi(handler, callback) {
  const server = createServer((request, response) => { void handler(request, response) })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.')
  try {
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

const forecastFixture = {
  type: 'SWPC-Forecast',
  issued: '2026-10-12T00:00:00Z',
  product: '45 Day Forecast',
  metadata: { description: 'Daily geomagnetic Ap index and solar radio flux F10.7.' },
  units: { ap: 'nT', f107: 'sfu' },
  data: [
    { time: '2026-10-12T00:00:00Z', metric: 'ap', value: 16 },
    { time: '2026-10-12T00:00:00Z', metric: 'f107', value: 120 },
  ],
}

afterEach(() => vi.restoreAllMocks())

describe('verified NOAA SWPC response normalization', () => {
  it('normalizes NOAA alert fixture fields and empty feeds', () => {
    const result = normalizeNoaaAlerts([{
      product_id: 'A20F',
      issue_datetime: '2026-10-11 19:11:07.000',
      message: 'WATCH: Geomagnetic Storm Category G1 Predicted',
    }], new Date('2026-10-12T10:00:00Z'))
    expect(result.records[0]).toMatchObject({
      id: 'A20F',
      issueTime: '2026-10-11T19:11:07.000Z',
      message: 'WATCH: Geomagnetic Storm Category G1 Predicted',
    })
    expect(normalizeNoaaAlerts([]).records).toEqual([])
    expect(() => normalizeNoaaAlerts({ alerts: [] })).toThrow(/unexpected alerts/)
  })

  it('normalizes Kp index measurements while skipping malformed measurements', () => {
    const result = normalizeNoaaKIndex([
      { time_tag: '2026-10-05T00:00:00', Kp: 4, a_running: 27, station_count: 8 },
      { time_tag: 'bad', Kp: 14 },
    ])
    expect(result).toMatchObject({
      unit: 'Kp index (dimensionless, 0–9)',
      measurements: [{ time: '2026-10-05T00:00:00.000Z', kp: 4, aRunning: 27, stationCount: 8 }],
    })
    expect(normalizeUtcTimestamp('2026-10-11 19:11:07.000')).toBe('2026-10-11T19:11:07.000Z')
    expect(normalizeUtcTimestamp('invalid')).toBeNull()
    expect(() => normalizeNoaaKIndex({ data: [] })).toThrow(/unexpected planetary K-index/)
  })

  it('normalizes the actual forecast data, product issue time and declared units', () => {
    expect(normalizeNoaaForecast(forecastFixture)).toMatchObject({
      product: '45 Day Forecast',
      issued: '2026-10-12T00:00:00.000Z',
      units: { ap: 'nT', f107: 'sfu' },
      values: [
        { metric: 'ap', value: 16, unit: 'nT' },
        { metric: 'f107', value: 120, unit: 'sfu' },
      ],
    })
    expect(() => normalizeNoaaForecast({ ...forecastFixture, type: 'unknown' })).toThrow(/unrecognized forecast/)
    expect(() => normalizeNoaaForecast({ ...forecastFixture, units: {} })).toThrow(/unsupported Ap\/F10.7 units/)
    expect(normalizeNoaaForecast({ ...forecastFixture, data: [{ time: 'bad', metric: 'ap', value: 1 }] }).values).toEqual([])
  })
})

describe('NOAA server-side client and caching', () => {
  it('uses only the three fixed NOAA URLs and serves fresh cached data', async () => {
    const fetchImpl = vi.fn(async (url) => {
      expect(Object.values(NOAA_FEEDS).map(({ url }) => url)).toContain(String(url))
      if (String(url) === NOAA_FEEDS.alerts.url) return jsonResponse([])
      throw new Error('Unexpected feed requested')
    })
    const service = createSpaceWeatherService({ fetchImpl, ...createCache() })
    const first = await service.getFeed('alerts')
    const second = await service.getFeed('alerts')
    expect(first.status).toBe('live')
    expect(second.status).toBe('cached')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('coalesces simultaneous requests and marks cached results stale after an upstream error', async () => {
    let current = new Date('2026-10-12T10:00:00Z')
    let fail = false
    const fetchImpl = vi.fn(async () => {
      if (fail) throw new Error('network unavailable')
      return jsonResponse([])
    })
    const service = createSpaceWeatherService({ fetchImpl, now: () => current, ...createCache() })
    const [first, concurrent] = await Promise.all([service.getFeed('alerts'), service.getFeed('alerts')])
    expect(first).toEqual(concurrent)
    fail = true
    current = new Date('2026-10-12T10:02:00Z')
    const stale = await service.getFeed('alerts', { force: true })
    expect(stale.status).toBe('stale')
    expect(stale.error).toMatch(/could not be reached/)
    expect(service.getStatus().alerts.status).toBe('stale')
  })

  it('marks a feed unavailable on malformed JSON and times out requests clearly', async () => {
    const service = createSpaceWeatherService({
      fetchImpl: vi.fn(async () => jsonResponse({ not: 'an alerts array' })),
      ...createCache(),
    })
    await expect(service.getFeed('alerts')).rejects.toThrow(/unexpected alerts/)
    const timeoutService = createSpaceWeatherService({
      fetchImpl: vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      })),
      timeoutMs: 5,
      ...createCache(),
    })
    await expect(timeoutService.getFeed('alerts')).rejects.toMatchObject({ statusCode: 504, message: 'NOAA alerts request timed out.' })
  })
})

describe('NOAA routes', () => {
  it('serves individual feeds, a partial summary, and status without API keys', async () => {
    const service = createSpaceWeatherService({
      fetchImpl: vi.fn(async (url) => {
        if (String(url) === NOAA_FEEDS.alerts.url) return jsonResponse([])
        if (String(url) === NOAA_FEEDS.kIndex.url) return jsonResponse([])
        return jsonResponse({ ...forecastFixture, data: [] })
      }),
      ...createCache(),
    })
    await withApi(createSpaceWeatherHandler({ service }), async (origin) => {
      const alerts = await fetch(`${origin}/api/space-weather/alerts`).then((response) => response.json())
      const status = await fetch(`${origin}/api/space-weather/status`).then((response) => response.json())
      const summary = await fetch(`${origin}/api/space-weather/summary`).then((response) => response.json())
      expect(alerts).toMatchObject({ feed: 'alerts', records: [], status: 'live' })
      expect(status.alerts.lastFetchedAt).toBeTruthy()
      expect(summary.forecast).toMatchObject({ feed: 'forecast', status: 'live', values: [] })
      const unknown = await fetch(`${origin}/api/space-weather/unknown`)
      expect(unknown.status).toBe(404)
    })
  })
})
