import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildHorizonsRequestUrl,
  clearHorizonsMemoryCache,
  getHorizonsPosition,
  parseHorizonsVectorResponse,
  validateHorizonsDate,
} from './horizonsService'
import { distanceBetween, estimateHohmannTransfer } from './missionPlanner'

const DATE = '2026-10-15'
const storage = new Map<string, string>()

function vectorResponse(
  x: number,
  y: number,
  z = 0,
  vx = 0,
  vy = 0,
  vz = 0,
) {
  return {
    result: `JDTDB, Calendar Date (TDB), X, Y, Z, VX, VY, VZ\n$$SOE\n2461328.5, A.D. 2026-Oct-15 00:00:00.0000, ${x}, ${y}, ${z}, ${vx}, ${vy}, ${vz}\n$$EOE`,
  }
}

function response(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => body,
  } as Response
}

beforeEach(() => {
  storage.clear()
  clearHorizonsMemoryCache()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('Horizons request validation and parsing', () => {
  it('validates real calendar dates instead of accepting malformed dates', () => {
    expect(validateHorizonsDate(DATE)).toBe(DATE)
    expect(() => validateHorizonsDate('2026-02-30')).toThrow(/valid calendar date/)
    expect(() => validateHorizonsDate('15-10-2026')).toThrow(/YYYY-MM-DD/)
  })

  it('builds a heliocentric, date-specific JPL vector request', () => {
    const url = new URL(buildHorizonsRequestUrl('399', DATE))
    expect(url.pathname).toBe('/api/horizons')
    expect(url.searchParams.get('target')).toBe('399')
    expect(url.searchParams.get('date')).toBe(DATE)
    expect(() => buildHorizonsRequestUrl('not-a-target', DATE)).toThrow(/Unsupported/)
  })

  it('uses the Jupiter planetary center as a direct planner destination', () => {
    const jupiter = parseHorizonsVectorResponse(vectorResponse(5.2, 0.1), 'jupiter', DATE)
    expect(jupiter).toMatchObject({ bodyId: 'jupiter', targetId: '599' })
  })

  it('parses the timestamp separately from the six numeric state-vector fields', () => {
    const parsed = parseHorizonsVectorResponse(vectorResponse(1, 0.5, 0.25, -0.01, 0.02, 0), 'earth', DATE)
    expect(parsed).toMatchObject({
      bodyId: 'earth',
      targetId: '399',
      requestedDate: DATE,
      julianDateTdb: 2461328.5,
      calendarDateTdb: 'A.D. 2026-Oct-15 00:00:00.0000',
      xAu: 1,
      yAu: 0.5,
      vxAuPerDay: -0.01,
      vyAuPerDay: 0.02,
      source: 'live',
    })
    expect(parsed.distanceAu).toBeCloseTo(Math.sqrt(1.3125))
  })

  it('rejects unsupported bodies, incomplete responses, and malformed vectors', () => {
    expect(() => parseHorizonsVectorResponse(vectorResponse(1, 0), 'pluto', DATE)).toThrow(/Unsupported/)
    expect(() => parseHorizonsVectorResponse({ result: 'no vector data' }, 'earth', DATE)).toThrow(/incomplete/)
    expect(() => parseHorizonsVectorResponse(vectorResponse(Number.NaN, 0), 'earth', DATE)).toThrow(/malformed/)
  })
})

describe('Horizons request and cache behavior', () => {
  it('deduplicates concurrent requests and caches a successful response', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockImplementation(async () => {
      await Promise.resolve()
      return response(vectorResponse(1, 0, 0))
    })

    const [first, second] = await Promise.all([
      getHorizonsPosition('earth', DATE),
      getHorizonsPosition('earth', DATE),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(first.source).toBe('live')
    expect(second.source).toBe('live')
    expect((await getHorizonsPosition('earth', DATE)).source).toBe('cached')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries transient JPL service responses without making launch outcomes random', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(response({ error: 'temporarily unavailable' }, false, 503))
      .mockResolvedValueOnce(response(vectorResponse(1, 0, 0)))
    const position = await getHorizonsPosition('earth', DATE)
    expect(position.source).toBe('live')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('returns matching-date cached vectors after the network request fails', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(response(vectorResponse(1.01, 0.02, 0)))
    const original = await getHorizonsPosition('earth', DATE)
    for (const [key, value] of storage) {
      const cached = JSON.parse(value) as { savedAt: number }
      cached.savedAt -= 31 * 24 * 60 * 60 * 1000
      storage.set(key, JSON.stringify(cached))
    }
    clearHorizonsMemoryCache()
    fetchMock.mockRejectedValue(new Error('offline'))

    const fallback = await getHorizonsPosition('earth', DATE)
    expect(fallback.source).toBe('cached')
    expect(fallback.xAu).toBe(original.xAu)
  })

  it('does not return a cancelled consumer’s result', async () => {
    const fetchMock = vi.mocked(fetch)
    let resolveFetch: ((value: Response) => void) | undefined
    fetchMock.mockImplementation(
      () => new Promise<Response>((resolve) => { resolveFetch = resolve }),
    )
    const controller = new AbortController()
    const pending = getHorizonsPosition('earth', DATE, controller.signal)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    resolveFetch?.(response(vectorResponse(1, 0, 0)))
  })
})

describe('preliminary transfer estimate', () => {
  it('computes a bounded Earth-to-Mars Hohmann estimate from matching-date vectors', () => {
    const earth = parseHorizonsVectorResponse(vectorResponse(1, 0, 0), 'earth', DATE)
    const mars = parseHorizonsVectorResponse(vectorResponse(1.52, 0.02, 0), 'mars', DATE)
    const estimate = estimateHohmannTransfer(earth, mars)
    expect(distanceBetween(earth, mars)).toBeCloseTo(Math.hypot(0.52, 0.02))
    expect(estimate.transferDays).toBeGreaterThan(200)
    expect(estimate.transferDays).toBeLessThan(400)
    expect(estimate.totalDeltaVKmS).toBeGreaterThan(0)
    expect(estimate.assumption).toContain('circular, coplanar')
    expect(() =>
      estimateHohmannTransfer(earth, { ...mars, requestedDate: '2026-10-16' }),
    ).toThrow(/same date/)
  })
})
