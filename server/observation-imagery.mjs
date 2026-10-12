const LANDSAT_ENDPOINT = 'https://landsatlook.usgs.gov/stac-server/search'
const EPIC_ENDPOINT = 'https://epic.gsfc.nasa.gov/api/natural/date/'
const NASA_IMAGES_ENDPOINT = 'https://images-api.nasa.gov/search'
const GIBS_SNAPSHOT_ENDPOINT = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot'
const MAX_RESPONSE_BYTES = 2_000_000
const REQUEST_TIMEOUT_MS = 15_000
const CACHE_TTL_MS = 30 * 60_000
const REGIONS = {
  'washington-dc': {
    label: 'Washington, DC',
    bbox: [-77.2, 38.7, -76.8, 39.1],
    gibsBbox: '36.7,-79.2,40.7,-75.2',
  },
  amazon: {
    label: 'Amazon Basin',
    bbox: [-61.1, -3.7, -60.7, -3.3],
    gibsBbox: '-5.5,-63.1,-1.5,-58.7',
  },
  sahara: {
    label: 'Sahara Desert',
    bbox: [12.8, 23.9, 13.2, 24.3],
    gibsBbox: '22.1,10.8,26.1,15.2',
  },
}
const PLANETARY_TARGETS = new Set([
  'earth', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
])
const PLANETARY_SEARCH_QUERIES = {
  earth: 'Earth satellite observation image',
  moon: 'Moon surface Apollo image',
  mercury: 'Mercury planetary surface image',
  venus: 'Venus surface radar image',
  mars: 'Mars surface rover image',
  jupiter: 'Jupiter Juno image',
  saturn: 'Saturn Cassini image',
  uranus: 'Uranus planetary image',
  neptune: 'Neptune planetary image',
}

export class ObservationImageryError extends Error {
  constructor(message, statusCode = 502) {
    super(message)
    this.name = 'ObservationImageryError'
    this.statusCode = statusCode
  }
}

function parseDate(value, now) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00Z`)
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null
  if (value > now().toISOString().slice(0, 10)) return null
  return date
}

function finiteNumber(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function trustedImageUrl(value, hostname) {
  if (typeof value !== 'string' || value.length > 2048) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === hostname && !url.username && !url.password
      ? url.href
      : null
  } catch {
    return null
  }
}

export function normalizeLandsatItems(body, targetId) {
  if (!body || body.type !== 'FeatureCollection' || !Array.isArray(body.features)) {
    throw new ObservationImageryError('USGS Landsat STAC returned an unexpected response.')
  }
  const target = REGIONS[targetId]
  if (!target) throw new ObservationImageryError('Unsupported Landsat target region.', 400)
  return body.features.slice(0, 100).flatMap((item) => {
    const properties = item?.properties
    const thumbnail = trustedImageUrl(item?.assets?.thumbnail?.href, 'landsatlook.usgs.gov')
    const acquiredAt = typeof properties?.datetime === 'string' &&
      Number.isFinite(Date.parse(properties.datetime))
      ? new Date(properties.datetime).toISOString()
      : null
    if (!thumbnail || !acquiredAt || typeof item.id !== 'string') return []
    const transform = properties['proj:transform']
    const pixelSize = Array.isArray(transform) && transform.length >= 5
      ? Math.max(Math.abs(finiteNumber(transform[0]) ?? 0), Math.abs(finiteNumber(transform[4]) ?? 0))
      : null
    return [{
      id: item.id.slice(0, 200),
      imageUrl: thumbnail,
      acquiredAt,
      provider: 'USGS Landsat Collection 2',
      platform: typeof properties.platform === 'string' ? properties.platform.replaceAll('_', ' ') : null,
      instrument: Array.isArray(properties.instruments)
        ? properties.instruments.filter((value) => typeof value === 'string').slice(0, 4).join(', ')
        : null,
      processingLevel: typeof properties['landsat:correction'] === 'string'
        ? properties['landsat:correction']
        : null,
      cloudCoverPercent: finiteNumber(properties['eo:cloud_cover']),
      resolutionMeters: pixelSize && pixelSize > 0 ? pixelSize : null,
      targetName: target.label,
      targetCoordinates: [
        Math.round(((target.bbox[0] + target.bbox[2]) / 2) * 10000) / 10000,
        Math.round(((target.bbox[1] + target.bbox[3]) / 2) * 10000) / 10000,
      ],
      label: 'Archived observation',
      sourceUrl: `https://landsatlook.usgs.gov/stac-server/collections/landsat-c2l2-sr/items/${encodeURIComponent(item.id)}`,
    }]
  })
}

export function normalizeEpicImages(body) {
  if (!Array.isArray(body)) {
    throw new ObservationImageryError('NASA EPIC returned an unexpected image response.')
  }
  return body.slice(0, 100).flatMap((item) => {
    if (
      !item ||
      typeof item.image !== 'string' ||
      !/^epic_[A-Za-z0-9_-]+$/.test(item.image) ||
      typeof item.date !== 'string' ||
      !Number.isFinite(Date.parse(item.date))
    ) return []
    const acquiredAt = new Date(item.date.includes('T') ? item.date : `${item.date.replace(' ', 'T')}Z`)
    if (!Number.isFinite(acquiredAt.getTime())) return []
    const dateParts = acquiredAt.toISOString().slice(0, 10).split('-')
    const imageUrl = `https://epic.gsfc.nasa.gov/archive/natural/${dateParts[0]}/${dateParts[1]}/${dateParts[2]}/thumbs/${item.image}.jpg`
    return [{
      id: item.identifier ?? item.image,
      imageUrl,
      acquiredAt: acquiredAt.toISOString(),
      provider: 'NASA EPIC on NOAA DSCOVR',
      platform: 'DSCOVR',
      instrument: 'Earth Polychromatic Imaging Camera (EPIC)',
      processingLevel: null,
      cloudCoverPercent: null,
      resolutionMeters: null,
      targetName: 'Full Earth disk',
      targetCoordinates: item.centroid_coordinates &&
        finiteNumber(item.centroid_coordinates.lat) !== null &&
        finiteNumber(item.centroid_coordinates.lon) !== null
        ? [finiteNumber(item.centroid_coordinates.lon), finiteNumber(item.centroid_coordinates.lat)]
        : null,
      label: 'Archived full-disk Earth image',
      sourceUrl: `${EPIC_ENDPOINT}${dateParts.join('-')}`,
    }]
  })
}

export function normalizeNasaArchive(body, targetBody) {
  const items = body?.collection?.items
  if (!Array.isArray(items)) {
    throw new ObservationImageryError('NASA Images API returned an unexpected image response.')
  }
  const disallowedDescription = /\b(artist(?:'s)? concept|artist impression|illustration|computer[- ]generated|rendering)\b/i
  const observationEvidence =
    /\b(image|photo|photograph|picture|panorama|mosaic|view)\b.{0,120}\b(captured|taken|obtained|acquired|collected|returned|shows|showing|of)\b|\b(captured|taken|obtained|acquired|collected|returned)\b.{0,120}\b(image|photo|photograph|picture|panorama|mosaic|view)\b/i
  const unrelatedContext = /\b(celebration|conference|exhibition|launch complex|training exercise)\b/i
  for (const item of items.slice(0, 100)) {
    const metadata = Array.isArray(item?.data) ? item.data[0] : null
    const preview = Array.isArray(item?.links)
      ? item.links.find((link) => link?.rel === 'preview' && link?.render === 'image')
      : null
    const imageUrl = trustedImageUrl(preview?.href, 'images-assets.nasa.gov')
    const title = typeof metadata?.title === 'string' ? metadata.title.trim() : ''
    const description = typeof metadata?.description === 'string' ? metadata.description.trim() : ''
    const searchableText = `${title} ${description}`
    if (
      !imageUrl ||
      !title ||
      !new RegExp(`\\b${targetBody}\\b`, 'i').test(searchableText) ||
      disallowedDescription.test(searchableText) ||
      unrelatedContext.test(searchableText) ||
      !observationEvidence.test(searchableText)
    ) continue
    const parsedDate = typeof metadata.date_created === 'string' && Number.isFinite(Date.parse(metadata.date_created))
      ? new Date(metadata.date_created).toISOString()
      : null
    return [{
      id: typeof item.nasa_id === 'string' ? item.nasa_id.slice(0, 200) : title.slice(0, 200),
      imageUrl,
      catalogDate: parsedDate,
      provider: 'NASA Image and Video Library',
      platform: null,
      instrument: null,
      processingLevel: null,
      cloudCoverPercent: null,
      resolutionMeters: null,
      targetName: targetBody,
      targetCoordinates: null,
      label: 'Archived target-body reference image',
      title,
      credit: [metadata.secondary_creator, metadata.center]
        .filter((value) => typeof value === 'string' && value.trim())
        .join(' / ') || 'NASA',
      sourceUrl: `https://images.nasa.gov/search?q=${encodeURIComponent(targetBody)}&media_type=image`,
    }]
  }
  return []
}

export function createObservationImageryService({
  fetchImpl = fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS,
  cache = new Map(),
} = {}) {
  async function fetchJson(url, options) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(url, {
        ...options,
        signal: controller.signal,
        redirect: 'error',
      })
      if (!response.ok) {
        throw new ObservationImageryError(`Imagery provider returned HTTP ${response.status}.`)
      }
      const contentType = response.headers.get('content-type') ?? ''
      if (!contentType.includes('json')) {
        throw new ObservationImageryError('Imagery provider returned an unsupported response type.')
      }
      const text = await response.text()
      if (text.length > MAX_RESPONSE_BYTES) {
        throw new ObservationImageryError('Imagery provider returned an oversized response.')
      }
      try {
        return JSON.parse(text)
      } catch {
        throw new ObservationImageryError('Imagery provider returned invalid JSON.')
      }
    } catch (error) {
      if (error instanceof ObservationImageryError) throw error
      throw new ObservationImageryError(
        controller.signal.aborted
          ? 'The imagery provider request timed out.'
          : error instanceof Error
            ? error.message
            : 'The imagery provider request failed.',
      )
    } finally {
      clearTimeout(timeout)
    }
  }

  async function getLandsat(targetId, date) {
    if (!REGIONS[targetId]) throw new ObservationImageryError('Unsupported Landsat target region.', 400)
    if (!parseDate(date, now)) throw new ObservationImageryError('A valid, non-future YYYY-MM-DD date is required.', 400)
    const key = `landsat:${targetId}:${date}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now().getTime()) return cached.value

    const [west, south, east, north] = REGIONS[targetId].bbox
    const windowStart = new Date(parseDate(date, now).getTime() - 30 * 24 * 60 * 60_000)
      .toISOString()
      .slice(0, 10)
    const payload = {
      collections: ['landsat-c2l2-sr'],
      bbox: [west, south, east, north],
      datetime: `${windowStart}T00:00:00Z/${date}T23:59:59Z`,
      limit: 10,
      sortby: [{ field: 'properties.datetime', direction: 'desc' }],
    }
    const body = await fetchJson(LANDSAT_ENDPOINT, {
      method: 'POST',
      headers: { Accept: 'application/geo+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const value = {
      source: 'USGS Landsat Collection 2 Level-2 Surface Reflectance',
      target: REGIONS[targetId].label,
      queriedDate: date,
      queryStartDate: windowStart,
      results: normalizeLandsatItems(body, targetId),
      mapImage: createGibsMapImage(targetId, date),
    }
    cache.set(key, { value, expiresAt: now().getTime() + CACHE_TTL_MS })
    return value
  }

  async function getEpic(date) {
    if (!parseDate(date, now)) throw new ObservationImageryError('A valid, non-future YYYY-MM-DD date is required.', 400)
    const key = `epic:${date}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now().getTime()) return cached.value
    const body = await fetchJson(`${EPIC_ENDPOINT}${date}`, {
      headers: { Accept: 'application/json' },
    })
    const value = {
      source: 'NASA EPIC on NOAA DSCOVR',
      target: 'Full Earth disk',
      queriedDate: date,
      results: normalizeEpicImages(body),
    }
    cache.set(key, { value, expiresAt: now().getTime() + CACHE_TTL_MS })
    return value
  }

  async function getPlanetaryArchive(targetBody) {
    const bodyName = typeof targetBody === 'string' ? targetBody.trim().toLowerCase() : ''
    if (!PLANETARY_TARGETS.has(bodyName)) {
      throw new ObservationImageryError('No NASA archive search is configured for this target body.', 400)
    }
    const key = `nasa-archive:${bodyName}`
    const cached = cache.get(key)
    if (cached && cached.expiresAt > now().getTime()) return cached.value
    const url = new URL(NASA_IMAGES_ENDPOINT)
    url.searchParams.set('q', PLANETARY_SEARCH_QUERIES[bodyName])
    url.searchParams.set('media_type', 'image')
    url.searchParams.set('page', '1')
    url.searchParams.set('page_size', '50')
    const body = await fetchJson(url, { headers: { Accept: 'application/json' } })
    const value = {
      source: 'NASA Image and Video Library',
      target: bodyName,
      queriedDate: null,
      results: normalizeNasaArchive(body, bodyName),
    }
    cache.set(key, { value, expiresAt: now().getTime() + CACHE_TTL_MS })
    return value
  }

  return { getLandsat, getEpic, getPlanetaryArchive }
}

function createGibsMapImage(targetId, date) {
  const target = REGIONS[targetId]
  const parameters = {
    REQUEST: 'GetSnapshot',
    TIME: date,
    CRS: 'EPSG:4326',
    LAYERS: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    FORMAT: 'image/jpeg',
  }
  const url = new URL(GIBS_SNAPSHOT_ENDPOINT)
  url.search = new URLSearchParams({
    ...parameters,
    BBOX: target.gibsBbox,
    WIDTH: '768',
    HEIGHT: '512',
  }).toString()
  const globeImageUrl = new URL(GIBS_SNAPSHOT_ENDPOINT)
  globeImageUrl.search = new URLSearchParams({
    ...parameters,
    BBOX: '-90,-180,90,180',
    WIDTH: '2048',
    HEIGHT: '1024',
  }).toString()
  return {
    imageUrl: url.href,
    globeImageUrl: globeImageUrl.href,
    date,
    provider: 'NASA GIBS',
    layer: 'MODIS Terra Corrected Reflectance True Color',
    platform: 'Terra',
    instrument: 'MODIS',
    label: 'Date-specific satellite map layer',
    attribution: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
    sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
  }
}

export function createObservationImageryHandler({ service = createObservationImageryService() } = {}) {
  return async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Only GET requests are supported for observation imagery.' })
      return
    }
    try {
      const date = url.searchParams.get('date')
      const data = url.pathname === '/api/observations/landsat'
        ? await service.getLandsat(url.searchParams.get('target'), date)
        : url.pathname === '/api/observations/epic'
          ? await service.getEpic(date)
          : url.pathname === '/api/observations/planetary'
            ? await service.getPlanetaryArchive(url.searchParams.get('target'))
            : null
      if (!data) {
        sendJson(response, 404, { error: 'The requested observation imagery source is not supported.' })
        return
      }
      sendJson(response, 200, data, 30 * 60)
    } catch (error) {
      const statusCode = error instanceof ObservationImageryError ? error.statusCode : 502
      sendJson(response, statusCode, {
        error: error instanceof Error ? error.message : 'The imagery provider request failed.',
      })
    }
  }
}

function sendJson(response, status, body, maxAge = 0) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': `public, max-age=${maxAge}`,
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(body))
}
