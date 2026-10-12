import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createRealTimeEventsHandler,
  createRealTimeEventsService,
  normalizeEonetEvents,
  normalizeJplCad,
} from './real-time-events.mjs'

const fixedNow = new Date('2026-10-12T12:00:00.000Z')

function jsonResponse(body, contentType = 'application/json') {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': contentType } })
}

function eonetResponse(id = 'EONET_1') {
  return {
    title: 'EONET Events',
    events: [{
      id,
      title: 'Test wildfire',
      description: 'A structured active event.',
      link: `https://eonet.gsfc.nasa.gov/api/v3/events/${id}`,
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      sources: [{ id: 'NOAA', url: 'https://www.noaa.gov/example' }],
      geometry: [{
        date: '2026-10-12T11:00:00Z',
        type: 'Point',
        coordinates: [-90, 35],
        magnitudeValue: null,
        magnitudeUnit: null,
      }],
    }],
  }
}

function cadResponse() {
  return {
    signature: { version: '1.5', source: 'NASA/JPL SBDB Close Approach Data API' },
    fields: ['des', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'diameter', 'diameter_sigma', 'h', 't_sigma_f', 'fullname'],
    data: [['2026 AB', '2026-Oct-15 12:00', '0.02', '0.01', '0.03', '12.5', null, null, '21.2', '00:00', '2026 AB (test)']],
  }
}

function makeService({ fetchImpl, spaceWeatherService, now } = {}) {
  return createRealTimeEventsService({
    fetchImpl: fetchImpl ?? vi.fn(async (url) => String(url).includes('eonet')
      ? jsonResponse(eonetResponse(), 'application/rss+xml; charset=utf-8')
      : jsonResponse(cadResponse())),
    spaceWeatherService: spaceWeatherService ?? {
      getFeed: vi.fn(async () => ({
        feed: 'alerts',
        status: 'live',
        lastFetchedAt: fixedNow.toISOString(),
        records: [{
          id: 'ALERT-1',
          issueTime: fixedNow.toISOString(),
          message: 'WARNING: Test space weather alert',
          raw: {},
        }],
      })),
    },
    now: now ?? (() => new Date(fixedNow)),
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('real-time event normalization', () => {
  it('normalizes EONET JSON even when the provider labels the body as RSS', () => {
    const normalized = normalizeEonetEvents(eonetResponse(), fixedNow)
    expect(normalized).toHaveLength(1)
    expect(normalized[0]).toMatchObject({
      id: 'eonet:EONET_1',
      category: 'earth-observation',
      eligible: true,
      geometries: [{ coordinates: [-90, 35] }],
      sources: [{ id: 'NOAA', url: 'https://www.noaa.gov/example' }],
    })
  })

  it('rejects unsupported EONET categories and untrusted URLs as mission provenance', () => {
    const body = eonetResponse()
    body.events[0].categories = [{ id: 'unsupported', title: 'Unsupported' }]
    body.events[0].link = 'https://attacker.example/event'
    body.events[0].sources = [{ id: 'unknown', url: 'https://attacker.example/source' }]
    const [event] = normalizeEonetEvents(body, fixedNow)
    expect(event.eligible).toBe(false)
    expect(event.sourceUrl).toContain('eonet.gsfc.nasa.gov')
    expect(event.sources).toEqual([])
  })

  it('keeps polygon event geometry as bounded area extents rather than inventing a point', () => {
    const body = eonetResponse()
    body.events[0].geometry = [{
      date: '2026-10-12T11:00:00Z',
      type: 'Polygon',
      coordinates: [[[-91, 34], [-89, 34], [-89, 36], [-91, 36], [-91, 34]]],
      magnitudeValue: null,
      magnitudeUnit: null,
    }]
    const [event] = normalizeEonetEvents(body, fixedNow)
    expect(event.eligible).toBe(true)
    expect(event.geometries[0]).toMatchObject({
      coordinates: null,
      bounds: [-91, 34, -89, 36],
      hasCoordinates: true,
    })
  })

  it('limits EONET magnitude measurements to the most recent twenty samples', () => {
    const body = eonetResponse()
    body.events[0].geometry = Array.from({ length: 25 }, (_, index) => ({
      date: new Date(fixedNow.getTime() - (24 - index) * 60_000).toISOString(),
      type: 'Point',
      coordinates: [-90 + index / 100, 35],
      magnitudeValue: index + 1,
      magnitudeUnit: 'km',
    }))

    const [event] = normalizeEonetEvents(body, fixedNow)

    expect(event.measurements).toHaveLength(20)
    expect(event.measurements[0].value).toBe(6)
    expect(event.measurements.at(-1).value).toBe(25)
  })

  it('maps CAD rows by field name and preserves distance, velocity and uncertainty units', () => {
    const [event] = normalizeJplCad(cadResponse(), fixedNow)
    expect(event).toMatchObject({
      providerEventId: '2026 AB::2026-10-15T12:00:00.000',
      eventTime: '2026-10-15T12:00:00.000',
      eventTimeScale: 'TDB',
      category: 'asteroid-investigation',
      eligible: true,
      measurements: [
        { label: 'Nominal distance', value: 0.02, unit: 'au' },
        { label: 'Relative velocity', value: 12.5, unit: 'km/s' },
        { label: 'Absolute magnitude', value: 21.2, unit: 'H' },
      ],
      uncertainty: { distanceMinimumAu: 0.01, distanceMaximumAu: 0.03, diameterSigmaKm: null },
    })
  })

  it('rejects CAD payloads with an unexpected signature', () => {
    expect(() => normalizeJplCad({ ...cadResponse(), signature: { source: 'other' } }, fixedNow))
      .toThrow(/unexpected response signature/i)
  })
})

describe('real-time event service', () => {
  it('loads all providers, exposes status, and deduplicates concurrent source requests', async () => {
    let eonetCalls = 0
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes('eonet')) {
        eonetCalls += 1
        await Promise.resolve()
        const body = eonetResponse()
        body.events.push({ ...body.events[0] })
        return jsonResponse(body, 'application/rss+xml; charset=utf-8')
      }
      return jsonResponse(cadResponse())
    })
    const service = makeService({ fetchImpl })
    const [first, second] = await Promise.all([service.getAll(), service.getAll()])
    expect(first.events).toHaveLength(3)
    expect(second.providers.eonet.status).toBe('live')
    expect(eonetCalls).toBe(1)
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining('kind=a'),
      expect.objectContaining({ redirect: 'error' }),
    )
    expect((await service.getAll()).providers.eonet.status).toBe('cached')
    expect(service.getStatus().jpl.status).toBe('cached')
  })

  it('retains a last-good feed as stale data when a provider fails later', async () => {
    let current = fixedNow.getTime()
    let shouldFail = false
    const fetchImpl = vi.fn(async (url) => {
      if (shouldFail) throw new Error('offline')
      return String(url).includes('eonet') ? jsonResponse(eonetResponse()) : jsonResponse(cadResponse())
    })
    const service = makeService({ fetchImpl, now: () => new Date(current) })
    await service.getAll()
    current += 61 * 60_000
    shouldFail = true
    const refreshed = await service.getAll()
    expect(refreshed.providers.eonet.status).toBe('stale')
    expect(refreshed.events.some((event) => event.id === 'eonet:EONET_1')).toBe(true)
    expect(service.getStatus().eonet.status).toBe('stale')
  })

  it('limits manual refresh frequency and serves allowlisted event verification', async () => {
    const service = makeService()
    const handler = createRealTimeEventsHandler({ service })
    const createResponse = () => {
      const headers = new Map()
      const response = {
        headersSent: false,
        destroyed: false,
        setHeader(name, value) { headers.set(name, value) },
        writeHead(statusCode, values) { this.statusCode = statusCode; Object.entries(values).forEach(([key, value]) => headers.set(key, value)) },
        end(body) { this.body = body; this.headers = headers },
      }
      return response
    }
    const request = { method: 'GET', url: '/api/real-time-events/eonet/EONET_1' }
    const response = createResponse()
    await handler(request, response)
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).event.eligible).toBe(true)
    const asteroidResponse = createResponse()
    await handler({
      method: 'GET',
      url: `/api/real-time-events/jpl/${encodeURIComponent('2026 AB::2026-10-15T12:00:00.000')}`,
    }, asteroidResponse)
    expect(asteroidResponse.statusCode).toBe(200)
    expect(JSON.parse(asteroidResponse.body).event.eventTimeScale).toBe('TDB')
    const refresh = createResponse()
    await handler({ method: 'POST', url: '/api/real-time-events/refresh' }, refresh)
    expect(refresh.statusCode).toBe(200)
    const tooSoon = createResponse()
    await handler({ method: 'POST', url: '/api/real-time-events/refresh' }, tooSoon)
    expect(tooSoon.statusCode).toBe(429)
  })
})
