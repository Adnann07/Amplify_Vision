import { createSpaceWeatherHandler, createSpaceWeatherService } from './space-weather.mjs'
import { createMissionControlHandler } from './mission-control.mjs'
import { createObservationImageryHandler } from './observation-imagery.mjs'
import { createRealTimeEventsHandler, createRealTimeEventsService } from './real-time-events.mjs'
import { createJunoTrajectoryHandler } from './juno-trajectory.mjs'

const allowedTargets = new Set(['199', '299', '399', '499', '599', '699', '799', '899'])
const spaceWeatherService = createSpaceWeatherService()
const missionControlHandler = createMissionControlHandler({
  getSpaceWeatherSummary: (options) => spaceWeatherService.getSummary(options),
})
const observationImageryHandler = createObservationImageryHandler()
const spaceWeatherHandler = createSpaceWeatherHandler({ service: spaceWeatherService })
const realTimeEventsHandler = createRealTimeEventsHandler({
  service: createRealTimeEventsService({ spaceWeatherService }),
})
const junoTrajectoryHandler = createJunoTrajectoryHandler()

export async function proxyHorizons(request, response, url) {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'Only GET requests are supported for Horizons data.' })
    return
  }

  const targetId = url.searchParams.get('target')
  const date = url.searchParams.get('date')
  const parsedDate =
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00Z`) : null
  if (
    !targetId ||
    !allowedTargets.has(targetId) ||
    !date ||
    !parsedDate ||
    !Number.isFinite(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    sendJson(response, 400, { error: 'A supported planetary target and valid YYYY-MM-DD date are required.' })
    return
  }

  const parameters = new URLSearchParams({
    format: 'json',
    COMMAND: targetId,
    CENTER: '@sun',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'VECTORS',
    START_TIME: `'${date} 00:00'`,
    STOP_TIME: `'${new Date(parsedDate.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10)} 00:00'`,
    TIME_TYPE: 'UT',
    STEP_SIZE: "'1 d'",
    REF_PLANE: 'ECLIPTIC',
    OUT_UNITS: 'AU-D',
    VEC_TABLE: '2',
    CSV_FORMAT: 'YES',
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15_000)
  let upstream
  let body
  try {
    upstream = await fetch(`https://ssd.jpl.nasa.gov/api/horizons.api?${parameters.toString()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    body = await upstream.arrayBuffer()
  } catch (error) {
    const message = controller.signal.aborted
      ? 'The JPL Horizons request timed out.'
      : error instanceof Error
        ? error.message
        : 'The JPL Horizons request failed.'
    sendJson(response, 502, { error: message })
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

export function sendJson(response, status, body) {
  if (response.headersSent || response.destroyed) return
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

export async function handleApiRequest(request, response) {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/api/mission-control/chat') {
    await missionControlHandler(request, response)
    return true
  }
  if (url.pathname.startsWith('/api/space-weather/')) {
    await spaceWeatherHandler(request, response)
    return true
  }
  if (url.pathname.startsWith('/api/real-time-events')) {
    await realTimeEventsHandler(request, response)
    return true
  }
  if (url.pathname.startsWith('/api/observations/')) {
    await observationImageryHandler(request, response)
    return true
  }
  if (url.pathname === '/api/horizons') {
    await proxyHorizons(request, response, url)
    return true
  }
  if (url.pathname === '/api/juno-trajectory') {
    await junoTrajectoryHandler(request, response)
    return true
  }
  return false
}

