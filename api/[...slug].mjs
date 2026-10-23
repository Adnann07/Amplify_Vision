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

  if (request.url && !request.url.includes('[...')) {
    return request.url
  }

  const urlObj = new URL(request.url ?? '/', 'http://localhost')
  const slug = request.query?.slug ?? urlObj.searchParams.getAll('slug')
  const slugArray = Array.isArray(slug) ? slug : (slug ? [slug] : [])
  const pathname = `/api/${slugArray.join('/')}`

  urlObj.searchParams.delete('slug')
  const search = urlObj.searchParams.toString()
  return `${pathname}${search ? `?${search}` : ''}`
}

export default async function handler(req, res) {
  req.url = normalizeRequestUrl(req)
  const handled = await handleApiRequest(req, res)
  if (!handled && !res.headersSent) {
    res.writeHead(404, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(JSON.stringify({ error: 'API route not found' }))
  }
}

