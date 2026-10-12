import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import {
  createObservationImageryHandler,
  createObservationImageryService,
  normalizeEpicImages,
  normalizeLandsatItems,
  normalizeNasaArchive,
} from './observation-imagery.mjs'

const now = () => new Date('2026-10-13T12:00:00.000Z')

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/geo+json' },
  })
}

function landsatFeature(overrides = {}) {
  return {
    id: 'LC09_L2SP_015033_20261010_20261011_02_T1_SR',
    properties: {
      datetime: '2026-10-10T15:46:35.223224Z',
      'eo:cloud_cover': 100,
      platform: 'LANDSAT_9',
      instruments: ['OLI', 'TIRS'],
      'landsat:correction': 'L2SP',
      'proj:transform': [30, 0, 218085, 0, -30, 4426515],
    },
    assets: {
      thumbnail: {
        href: 'https://landsatlook.usgs.gov/data/scene_thumb.jpeg',
      },
    },
    ...overrides,
  }
}

async function withApi(handler, callback) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.')
  try {
    await callback(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

describe('observation imagery metadata', () => {
  it('preserves real Landsat date, provider metadata, cloud cover, resolution, and target center', () => {
    expect(normalizeLandsatItems({ type: 'FeatureCollection', features: [landsatFeature()] }, 'washington-dc'))
      .toEqual([{
        id: 'LC09_L2SP_015033_20261010_20261011_02_T1_SR',
        imageUrl: 'https://landsatlook.usgs.gov/data/scene_thumb.jpeg',
        acquiredAt: '2026-10-10T15:46:35.223Z',
        provider: 'USGS Landsat Collection 2',
        platform: 'LANDSAT 9',
        instrument: 'OLI, TIRS',
        processingLevel: 'L2SP',
        cloudCoverPercent: 100,
        resolutionMeters: 30,
        targetName: 'Washington, DC',
        targetCoordinates: [-77, 38.9],
        label: 'Archived observation',
        sourceUrl: 'https://landsatlook.usgs.gov/stac-server/collections/landsat-c2l2-sr/items/LC09_L2SP_015033_20261010_20261011_02_T1_SR',
      }])
  })

  it('drops malformed or untrusted preview URLs and rejects unexpected STAC payloads', () => {
    expect(normalizeLandsatItems({
      type: 'FeatureCollection',
      features: [landsatFeature({
        assets: { thumbnail: { href: 'https://images.example/other.jpg' } },
      })],
    }, 'washington-dc')).toEqual([])
    expect(() => normalizeLandsatItems({}, 'washington-dc')).toThrow(/unexpected response/)
  })

  it('labels EPIC imagery as an archived DSCOVR full-Earth product without inventing resolution', () => {
    expect(normalizeEpicImages([{
      identifier: '20261010004554',
      image: 'epic_1b_20261010004554',
      date: '2026-10-10 00:41:06',
      centroid_coordinates: { lat: 2.54, lon: 160.65 },
      caption: 'Image from NASA EPIC on NOAA DSCOVR.',
    }])).toEqual([{
      id: '20261010004554',
      imageUrl: 'https://epic.gsfc.nasa.gov/archive/natural/2026/10/10/thumbs/epic_1b_20261010004554.jpg',
      acquiredAt: '2026-10-10T00:41:06.000Z',
      provider: 'NASA EPIC on NOAA DSCOVR',
      platform: 'DSCOVR',
      instrument: 'Earth Polychromatic Imaging Camera (EPIC)',
      processingLevel: null,
      cloudCoverPercent: null,
      resolutionMeters: null,
      targetName: 'Full Earth disk',
      targetCoordinates: [160.65, 2.54],
      label: 'Archived full-disk Earth image',
      sourceUrl: 'https://epic.gsfc.nasa.gov/api/natural/date/2026-10-10',
    }])
  })

  it('returns target-matched NASA archive references but skips artist renderings and does not call catalog dates acquisitions', () => {
    const archive = normalizeNasaArchive({
      collection: {
        items: [
          {
            data: [{
              title: 'Device for Lowering Mars Science Laboratory Rover to the Surface',
              description: 'This is hardware for controlling a rover descent to the surface of Mars.',
            }],
            links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/hardware.jpg' }],
          },
          {
            data: [{ title: 'Mars rover artist concept', description: 'An illustration of Mars.' }],
            links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/a.jpg' }],
          },
          {
            nasa_id: 'PIA00001',
            data: [{
              title: 'Mars surface image',
              description: 'A camera image showing the surface of Mars.',
              date_created: '2020-02-01T00:00:00Z',
              center: 'JPL',
            }],
            links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/b.jpg' }],
          },
        ],
      },
    }, 'mars')
    expect(archive).toEqual([{
      id: 'PIA00001',
      imageUrl: 'https://images-assets.nasa.gov/image/b.jpg',
      catalogDate: '2020-02-01T00:00:00.000Z',
      provider: 'NASA Image and Video Library',
      platform: null,
      instrument: null,
      processingLevel: null,
      cloudCoverPercent: null,
      resolutionMeters: null,
      targetName: 'mars',
      targetCoordinates: null,
      label: 'Archived target-body reference image',
      title: 'Mars surface image',
      credit: 'JPL',
      sourceUrl: 'https://images.nasa.gov/search?q=mars&media_type=image',
    }])
  })
})

describe('observation imagery service and route', () => {
  it('searches Landsat across the preceding 30 days and returns a correctly ordered NASA map snapshot', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ type: 'FeatureCollection', features: [landsatFeature()] }))
    const service = createObservationImageryService({ fetchImpl, now })
    const first = await service.getLandsat('washington-dc', '2026-10-10')
    const second = await service.getLandsat('washington-dc', '2026-10-10')
    expect(first.results[0].cloudCoverPercent).toBe(100)
    expect(second).toBe(first)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const request = fetchImpl.mock.calls[0][1]
    expect(JSON.parse(request.body)).toMatchObject({
      collections: ['landsat-c2l2-sr'],
      bbox: [-77.2, 38.7, -76.8, 39.1],
      datetime: '2026-09-10T00:00:00Z/2026-10-10T23:59:59Z',
    })
    expect(first.queryStartDate).toBe('2026-09-10')
    const mapImage = new URL(first.mapImage.imageUrl)
    expect(mapImage.hostname).toBe('wvs.earthdata.nasa.gov')
    expect(mapImage.searchParams.get('TIME')).toBe('2026-10-10')
    expect(mapImage.searchParams.get('LAYERS')).toBe('MODIS_Terra_CorrectedReflectance_TrueColor')
    expect(mapImage.searchParams.get('CRS')).toBe('EPSG:4326')
    expect(mapImage.searchParams.get('BBOX')).toBe('36.7,-79.2,40.7,-75.2')
    expect(first.mapImage.attribution).toContain('Global Imagery Browse Services')
    const globeImage = new URL(first.mapImage.globeImageUrl)
    expect(globeImage.hostname).toBe('wvs.earthdata.nasa.gov')
    expect(globeImage.searchParams.get('TIME')).toBe('2026-10-10')
    expect(globeImage.searchParams.get('BBOX')).toBe('-90,-180,90,180')
    expect(globeImage.searchParams.get('WIDTH')).toBe('2048')
    expect(globeImage.searchParams.get('HEIGHT')).toBe('1024')
  })

  it('rejects unsupported targets and future/invalid dates before making provider calls', async () => {
    const fetchImpl = vi.fn()
    const service = createObservationImageryService({ fetchImpl, now })
    await expect(service.getLandsat('unknown', '2026-10-10')).rejects.toThrow(/Unsupported/)
    await expect(service.getEpic('2026-10-14')).rejects.toThrow(/non-future/)
    await expect(service.getEpic('not-a-date')).rejects.toThrow(/non-future/)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('searches NASA planetary archives using only a supported target body', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      collection: { items: [{
        data: [{ title: 'Jupiter observation', description: 'Juno returned a camera image of Jupiter clouds.' }],
        links: [{ rel: 'preview', render: 'image', href: 'https://images-assets.nasa.gov/image/jupiter.jpg' }],
      }] },
    }))
    const service = createObservationImageryService({ fetchImpl, now })
    expect((await service.getPlanetaryArchive('jupiter')).results[0].label)
      .toBe('Archived target-body reference image')
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('q')).toBe('Jupiter Juno image')
    await expect(service.getPlanetaryArchive('somebody')).rejects.toThrow(/configured for this target/)
  })

  it('returns provider errors explicitly and reports an empty archived-image result', async () => {
    const service = createObservationImageryService({
      fetchImpl: vi.fn(async () => jsonResponse({ type: 'FeatureCollection', features: [] })),
      now,
    })
    const empty = await service.getLandsat('sahara', '2026-10-10')
    expect(empty.results).toEqual([])
    expect(empty.mapImage.provider).toBe('NASA GIBS')

    const handler = createObservationImageryHandler({
      service: {
        getEpic: vi.fn(async () => { throw new Error('Provider unavailable.') }),
        getLandsat: vi.fn(),
      },
    })
    await withApi(handler, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/observations/epic?date=2026-10-10`)
      expect(response.status).toBe(502)
      expect(await response.json()).toEqual({ error: 'Provider unavailable.' })
    })
  })
})
