import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleApiRequest, sendJson } from './api-router.mjs'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const distributionRoot = resolve(projectRoot, 'dist')
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
  if (await handleApiRequest(request, response)) {
    return
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendJson(response, 405, { error: 'Only GET and HEAD requests are supported.' })
    return
  }

  let pathname
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname)
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

const port = Number(process.env.PORT ?? 4173)
server.listen(port, '0.0.0.0', () => {
  console.log(`Amplify Vision is listening on port ${port}`)
})
