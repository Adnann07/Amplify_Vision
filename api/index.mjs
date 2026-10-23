import { handleApiRequest } from '../server/api-router.mjs'

function normalizeRequestUrl(request) {
  const forwardedUrl = request.headers['x-forwarded-url']
  if (forwardedUrl && typeof forwardedUrl === 'string' && forwardedUrl.startsWith('/api')) {
    return forwardedUrl
  }

  const matchedPath = request.headers['x-matched-path']
  if (matchedPath && typeof matchedPath === 'string' && matchedPath.startsWith('/api')) {
    const urlObj = new URL(request.url ?? '/', 'http://localhost')
    return `${matchedPath}${urlObj.search}`
  }

  const urlObj = new URL(request.url ?? '/', 'http://localhost')
  const pathParam = urlObj.searchParams.get('__path')
  if (pathParam !== null) {
    urlObj.searchParams.delete('__path')
    const pathname = `/api/${pathParam.replace(/^\/+/, '')}`
    const search = urlObj.searchParams.toString()
    return `${pathname}${search ? `?${search}` : ''}`
  }

  return request.url ?? '/'
}

export default async function handler(req, res) {
  req.url = normalizeRequestUrl(req)

  const url = new URL(req.url, 'http://localhost')
  if (url.pathname === '/api' || url.pathname === '/api/') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify({ status: 'ok', name: 'Amplify Vision API' }))
    return
  }

  const handled = await handleApiRequest(req, res)
  if (!handled && !res.headersSent) {
    res.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify({ error: `API route not found: ${url.pathname}` }))
  }
}

