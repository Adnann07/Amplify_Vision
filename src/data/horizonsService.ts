import { getPlanetaryBody, heliocentricBodies } from './planetaryData'

export interface HorizonsPosition {
  bodyId: string
  bodyName: string
  targetId: string
  requestedDate: string
  julianDateTdb: number
  calendarDateTdb: string
  xAu: number
  yAu: number
  zAu: number
  vxAuPerDay: number
  vyAuPerDay: number
  vzAuPerDay: number
  distanceAu: number
  source: 'live' | 'cached'
}

interface CachedPosition {
  savedAt: number
  position: Omit<HorizonsPosition, 'source'>
}

interface HorizonsApiResponse {
  result?: unknown
  error?: unknown
}

export const HORIZONS_ENDPOINT = '/api/horizons'
export const HORIZONS_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000
const CACHE_PREFIX = 'amplify-vision-horizons-v1:'
const REQUEST_TIMEOUT_MS = 12000
const MAX_CONCURRENT_REQUESTS = 3
const MAX_TRANSIENT_RETRIES = 2
const memoryCache = new Map<string, CachedPosition>()
const pendingRequests = new Map<string, Promise<HorizonsPosition>>()
let runningRequests = 0
const waitingRequests: (() => void)[] = []

export function validateHorizonsDate(date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('Choose a launch date in YYYY-MM-DD format.')
  }
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`"${date}" is not a valid calendar date.`)
  }
  return date
}

export function buildHorizonsRequestUrl(targetId: string, date: string): string {
  validateHorizonsDate(date)
  if (!/^\d{1,6}$/.test(targetId) || targetId === '0') {
    throw new Error(`Unsupported Horizons target identifier "${targetId}".`)
  }

  const origin = typeof location === 'undefined' ? 'http://localhost' : location.origin
  const url = new URL(HORIZONS_ENDPOINT, origin)
  url.searchParams.set('target', targetId)
  url.searchParams.set('date', date)
  return url.toString()
}

export function parseHorizonsVectorResponse(
  response: unknown,
  bodyId: string,
  requestedDate: string,
): HorizonsPosition {
  validateHorizonsDate(requestedDate)
  const body = getPlanetaryBody(bodyId)
  if (!response || typeof response !== 'object') {
    throw new Error(`Horizons returned a malformed response for ${body.name}.`)
  }

  const payload = response as HorizonsApiResponse
  if (typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(`Horizons rejected ${body.name}: ${payload.error}`)
  }
  if (typeof payload.result !== 'string') {
    throw new Error(`Horizons returned no ephemeris result for ${body.name}.`)
  }

  const start = payload.result.indexOf('$$SOE')
  const end = payload.result.indexOf('$$EOE', start + 5)
  if (start < 0 || end < 0) {
    throw new Error(`Horizons returned an empty or incomplete ephemeris for ${body.name}.`)
  }

  const line = payload.result
    .slice(start + 5, end)
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.length > 0)
  if (!line) throw new Error(`Horizons returned no vector rows for ${body.name}.`)

  const columns = line.split(',').map((column) => column.trim())
  const numericValues = [columns[0], ...columns.slice(2, 8)].map(Number)
  if (
    numericValues.length !== 7 ||
    numericValues.some((value) => !Number.isFinite(value)) ||
    !columns[1]
  ) {
    throw new Error(`Horizons returned malformed vector values for ${body.name}.`)
  }

  const [julianDateTdb, xAu, yAu, zAu, vxAuPerDay, vyAuPerDay, vzAuPerDay] = numericValues

  return {
    bodyId: body.id,
    bodyName: body.name,
    targetId: body.horizonsTargetId,
    requestedDate,
    julianDateTdb,
    calendarDateTdb: columns[1],
    xAu,
    yAu,
    zAu,
    vxAuPerDay,
    vyAuPerDay,
    vzAuPerDay,
    distanceAu: Math.hypot(xAu, yAu, zAu),
    source: 'live',
  }
}

export async function getHorizonsPosition(
  bodyId: string,
  date: string,
  signal?: AbortSignal,
): Promise<HorizonsPosition> {
  validateHorizonsDate(date)
  const body = getPlanetaryBody(bodyId)
  const cacheKey = getCacheKey(body.horizonsTargetId, date)
  if (signal?.aborted) throw new DOMException('Ephemeris request cancelled.', 'AbortError')

  const cached = readCache(cacheKey, date, body.id)
  if (cached && Date.now() - cached.savedAt < HORIZONS_CACHE_TTL_MS) {
    return { ...cached.position, source: 'cached' }
  }

  let request = pendingRequests.get(cacheKey)
  if (!request) {
    request = requestPosition(body.id, body.horizonsTargetId, date, cacheKey)
    pendingRequests.set(cacheKey, request)
    void request.finally(() => pendingRequests.delete(cacheKey)).catch(() => {})
  }

  if (!signal) return request
  return raceAbort(request, signal)
}

export async function loadSolarSystemPositions(
  date: string,
  signal?: AbortSignal,
): Promise<{ positions: HorizonsPosition[]; errors: string[] }> {
  validateHorizonsDate(date)
  const results = await mapWithConcurrency(heliocentricBodies, MAX_CONCURRENT_REQUESTS, async (body) => {
    try {
      const position = await getHorizonsPosition(body.id, date, signal)
      return { position, error: null }
    } catch (error) {
      if (isAbortError(error)) throw error
      const cached = readCache(getCacheKey(body.horizonsTargetId, date), date, body.id)
      return {
        position: cached ? { ...cached.position, source: 'cached' as const } : null,
        error: error instanceof Error ? error.message : `Could not load ${body.name} from Horizons.`,
      }
    }
  })

  return {
    positions: results.flatMap((result) => result.position ? [result.position] : []),
    errors: results.flatMap((result) => result.error ? [result.error] : []),
  }
}

export function clearHorizonsMemoryCache() {
  memoryCache.clear()
}

async function requestPosition(
  bodyId: string,
  targetId: string,
  date: string,
  cacheKey: string,
): Promise<HorizonsPosition> {
  const oldCache = readCache(cacheKey, date, bodyId)
  try {
    const position = await withRequestSlot(() => fetchHorizonsPosition(bodyId, targetId, date))

    const cacheEntry: CachedPosition = {
      savedAt: Date.now(),
      position: stripPositionSource(position),
    }
    memoryCache.set(cacheKey, cacheEntry)
    try {
      localStorage.setItem(cacheKey, JSON.stringify(cacheEntry))
    } catch (error) {
      console.warn('Horizons ephemeris could not be cached in this browser.', error)
    }
    return position
  } catch (error) {
    if (oldCache) {
      console.warn(`Using cached Horizons data for ${getPlanetaryBody(bodyId).name}.`, error)
      return { ...oldCache.position, source: 'cached' }
    }
    throw error
  }
}

async function fetchHorizonsPosition(
  bodyId: string,
  targetId: string,
  date: string,
): Promise<HorizonsPosition> {
  const body = getPlanetaryBody(bodyId)
  for (let attempt = 0; attempt <= MAX_TRANSIENT_RETRIES; attempt += 1) {
    const controller = new AbortController()
    const timeoutId = globalThis.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let response: Response | null = null
    let data: unknown
    let retryableStatus = false
    try {
      response = await fetch(buildHorizonsRequestUrl(targetId, date), {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      retryableStatus =
        (response.status === 429 || response.status >= 500) && attempt < MAX_TRANSIENT_RETRIES
      if (retryableStatus) {
        await response.body?.cancel()
      } else {
        if (!response.ok) {
          throw new Error(`Horizons returned HTTP ${response.status} for ${body.name}.`)
        }
        data = await response.json()
      }
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Horizons timed out while loading ${body.name}.`)
      }
      if (!response && attempt < MAX_TRANSIENT_RETRIES) {
        await waitBeforeRetry(attempt)
        continue
      }
      throw error
    } finally {
      globalThis.clearTimeout(timeoutId)
    }

    if (retryableStatus) {
      await waitBeforeRetry(attempt)
      continue
    }
    return parseHorizonsVectorResponse(data, bodyId, date)
  }
  throw new Error(`Horizons could not load ${body.name} after retries.`)
}

function waitBeforeRetry(attempt: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 300 * (attempt + 1))
  })
}

async function withRequestSlot<T>(callback: () => Promise<T>): Promise<T> {
  if (runningRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => waitingRequests.push(resolve))
  }
  runningRequests += 1
  try {
    return await callback()
  } finally {
    runningRequests -= 1
    waitingRequests.shift()?.()
  }
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(values.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (true) {
      const index = nextIndex++
      if (index >= values.length) return
      output[index] = await mapper(values[index])
    }
  })
  await Promise.all(workers)
  return output
}

function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('Ephemeris request cancelled.', 'AbortError'))
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new DOMException('Ephemeris request cancelled.', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

function getCacheKey(targetId: string, date: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(JSON.stringify({
    target: targetId,
    center: '@sun',
    ephemeris: 'VECTORS',
    date,
    timeType: 'UT',
    referencePlane: 'ECLIPTIC',
    units: 'AU-D',
    vectorTable: '2',
  }))}`
}

function readCache(key: string, date: string, bodyId: string): CachedPosition | null {
  const inMemory = memoryCache.get(key)
  if (inMemory) return inMemory
  try {
    const stored = localStorage.getItem(key)
    if (!stored) return null
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return null
    const entry = parsed as Partial<CachedPosition>
    const position = entry.position
    if (
      typeof entry.savedAt !== 'number' ||
      !Number.isFinite(entry.savedAt) ||
      entry.savedAt < 0 ||
      !position ||
      position.requestedDate !== date ||
      position.bodyId !== bodyId ||
      position.targetId !== getPlanetaryBody(bodyId).horizonsTargetId ||
      typeof position.bodyName !== 'string' ||
      typeof position.calendarDateTdb !== 'string' ||
      ![
        position.julianDateTdb,
        position.xAu,
        position.yAu,
        position.zAu,
        position.vxAuPerDay,
        position.vyAuPerDay,
        position.vzAuPerDay,
        position.distanceAu,
      ].every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      localStorage.removeItem(key)
      return null
    }
    const cached = entry as CachedPosition
    memoryCache.set(key, cached)
    return cached
  } catch (error) {
    console.warn('Cached Horizons ephemeris could not be read.', error)
    return null
  }
}

function stripPositionSource(position: HorizonsPosition): Omit<HorizonsPosition, 'source'> {
  const { source: _source, ...cached } = position
  return cached
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
