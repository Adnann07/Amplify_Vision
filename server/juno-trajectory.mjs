const HORIZONS_ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const MAX_TRAJECTORY_DAYS = 57
const REQUEST_TIMEOUT_MS = 30_000
const DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

export function createJunoTrajectoryHandler({ fetchImpl = fetch } = {}) {
  return async (request, response) => {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Only GET requests are supported for Juno trajectory data.' })
      return
    }

    const url = new URL(request.url ?? '/', 'http://localhost')
    const start = parseUtcMinute(url.searchParams.get('start'))
    const stop = parseUtcMinute(url.searchParams.get('stop'))
    if (!start || !stop || stop <= start || stop - start > MAX_TRAJECTORY_DAYS * 24 * 60 * 60 * 1000) {
      sendJson(response, 400, {
        error: `Valid UTC start and stop times spanning no more than ${MAX_TRAJECTORY_DAYS} days are required.`,
      })
      return
    }

    const parameters = new URLSearchParams({
      format: 'json',
      COMMAND: "'-61'",
      OBJ_DATA: 'NO',
      MAKE_EPHEM: 'YES',
      EPHEM_TYPE: 'VECTORS',
      CENTER: "'500@599'",
      START_TIME: `'${formatHorizonsTime(start)}'`,
      STOP_TIME: `'${formatHorizonsTime(stop)}'`,
      TIME_TYPE: 'UT',
      STEP_SIZE: "'3 h'",
      REF_PLANE: 'ECLIPTIC',
      OUT_UNITS: 'KM-S',
      VEC_TABLE: '1',
      CSV_FORMAT: 'YES',
    })
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    let upstream
    let body
    try {
      upstream = await fetchImpl(`${HORIZONS_ENDPOINT}?${parameters}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      })
      body = await upstream.arrayBuffer()
    } catch (error) {
      sendJson(response, 502, {
        error: controller.signal.aborted
          ? 'The JPL Horizons Juno trajectory request timed out.'
          : error instanceof Error
            ? error.message
            : 'The JPL Horizons Juno trajectory request failed.',
      })
      return
    } finally {
      clearTimeout(timeout)
    }

    response.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(Buffer.from(body))
  }
}

function parseUtcMinute(value) {
  if (!value || !DATE_TIME_PATTERN.test(value)) return null
  const timestamp = Date.parse(`${value}:00Z`)
  if (!Number.isFinite(timestamp)) return null
  const date = new Date(timestamp)
  return date.toISOString().slice(0, 16) === value ? timestamp : null
}

function formatHorizonsTime(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 16).replace('T', ' ')
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}
