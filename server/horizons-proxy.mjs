import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMissionControlHandler } from './mission-control.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distributionRoot = resolve(projectRoot, 'dist')
const allowedTargets = new Set(['199', '299', '399', '499', '599', '699', '799', '899'])
const missionControlHandler = createMissionControlHandler()
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.gltf', 'model/gltf+json'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2'],
])

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost')
  if (url.pathname === '/api/mission-control/chat') {
    await missionControlHandler(request, response)
    return
  }
  if (url.pathname === '/api/horizons') {
    await proxyHorizons(request, response, url)
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Only GET and HEAD requests are supported.' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(url.pathname)
  } catch {
    sendJson(response, 400, { error: 'The requested path is malformed.' })
    return
  }
  const requestedPath = resolve(distributionRoot, `.${pathname}`)
  if (requestedPath !== distributionRoot && !requestedPath.startsWith(`${distributionRoot}${sep}`)) {
    sendJson(response, 403, { error: 'The requested path is not available.' })
    return
  }

  let filePath = requestedPath
  try {
    if (!(await stat(filePath)).isFile()) filePath = resolve(distributionRoot, 'index.html')
  } catch {
    if (extname(pathname)) {
      sendJson(response, 404, { error: 'The requested asset was not found.' })
      return
    }
    filePath = resolve(distributionRoot, 'index.html')
  }

  try {
    const fileInfo = await stat(filePath)
    response.writeHead(200, {
      'Content-Length': fileInfo.size,
      'Content-Type': mimeTypes.get(extname(filePath)) ?? 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    if (request.method === 'HEAD') response.end()
    else createReadStream(filePath).pipe(response)
  } catch {
    sendJson(response, 503, { error: 'The production build is not available. Run npm run build first.' })
  }
})

async function proxyHorizons(request, response, url) {
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

function sendJson(response, status, body) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}

const port = Number(process.env.PORT ?? 4173)
server.listen(port, '0.0.0.0', () => {
  console.log(`Amplify Vision is listening on port ${port}`)
})
