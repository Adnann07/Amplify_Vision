export interface SyntheticOrbit {
  latitudeDegrees: number
  longitudeDegrees: number
  position: [number, number, number]
  nadir: [number, number, number]
  east: [number, number, number]
  north: [number, number, number]
}

const ORBIT_PERIOD_SIMULATION_SECONDS = 90 * 60
const ORBIT_INCLINATION_DEGREES = 28.5
const ORBIT_RADIUS_EARTH_RADII = 2.15

function normalize(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(...vector)
  return vector.map((component) => component / length) as [number, number, number]
}

export function computeSyntheticOrbit(
  elapsedSeconds: number,
  targetCoordinates: [longitude: number, latitude: number] | null,
): SyntheticOrbit {
  const [targetLongitude, targetLatitude] = targetCoordinates ?? [0, 0]
  const phase = (elapsedSeconds / ORBIT_PERIOD_SIMULATION_SECONDS) * Math.PI * 2
  const inclination = (ORBIT_INCLINATION_DEGREES * Math.PI) / 180
  const latitudeRadians = Math.asin(Math.sin(inclination) * Math.sin(phase))
  const longitudeRadians = (targetLongitude * Math.PI) / 180 +
    Math.atan2(Math.cos(inclination) * Math.sin(phase), Math.cos(phase))
  const latitudeDegrees = Math.max(
    -85,
    Math.min(85, targetLatitude + (latitudeRadians * 180) / Math.PI),
  )
  const longitudeDegrees = ((longitudeRadians * 180) / Math.PI + 540) % 360 - 180
  const latitude = (latitudeDegrees * Math.PI) / 180
  const longitude = (longitudeDegrees * Math.PI) / 180
  const surfaceNormal = normalize([
    Math.cos(latitude) * Math.sin(longitude),
    Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  ])
  return {
    latitudeDegrees,
    longitudeDegrees,
    position: surfaceNormal.map((component) => component * ORBIT_RADIUS_EARTH_RADII) as [
      number,
      number,
      number,
    ],
    nadir: surfaceNormal.map((component) => -component) as [number, number, number],
    east: normalize([Math.cos(longitude), 0, -Math.sin(longitude)]),
    north: normalize([
      -Math.sin(latitude) * Math.sin(longitude),
      Math.cos(latitude),
      -Math.sin(latitude) * Math.cos(longitude),
    ]),
  }
}

export function computeCameraDirection(
  orbit: SyntheticOrbit,
  azimuthDegrees: number,
  elevationDegrees: number,
): [number, number, number] {
  const azimuth = (azimuthDegrees * Math.PI) / 180
  const elevation = (elevationDegrees * Math.PI) / 180
  return normalize(orbit.nadir.map((component, index) =>
    component +
    orbit.east[index] * Math.tan(azimuth) -
    orbit.north[index] * Math.tan(elevation),
  ) as [number, number, number])
}

export function computeCameraGroundPoint(
  orbit: SyntheticOrbit,
  azimuthDegrees: number,
  elevationDegrees: number,
): [longitude: number, latitude: number] | null {
  const direction = computeCameraDirection(orbit, azimuthDegrees, elevationDegrees)
  const projection = orbit.position.reduce(
    (sum, component, index) => sum + component * direction[index],
    0,
  )
  const radiusSquared = orbit.position.reduce((sum, component) => sum + component ** 2, 0)
  const discriminant = projection ** 2 - radiusSquared + 1
  if (discriminant < 0) return null
  const distance = -projection - Math.sqrt(discriminant)
  if (distance <= 0) return null

  const point = orbit.position.map(
    (component, index) => component + direction[index] * distance,
  ) as [number, number, number]
  const latitude = (Math.asin(Math.max(-1, Math.min(1, point[1]))) * 180) / Math.PI
  const longitude = (Math.atan2(point[0], point[2]) * 180) / Math.PI
  return [longitude, latitude]
}

export function createGibsAimpointImageUrl(
  [longitude, latitude]: [number, number],
  date: string,
  fieldOfViewDegrees: number,
) {
  const snappedLatitude = Math.round(latitude / 10) * 10
  const snappedLongitude = Math.round(longitude / 10) * 10
  const halfHeight = Math.max(1, Math.min(8,
    Math.atan(1.15 * Math.tan((fieldOfViewDegrees * Math.PI) / 360)) *
      (180 / Math.PI) * 0.3,
  ))
  const halfWidth = Math.min(
    35,
    halfHeight * 1.5 / Math.max(0.25, Math.cos((snappedLatitude * Math.PI) / 180)),
  )
  const south = Math.max(-89, snappedLatitude - halfHeight)
  const north = Math.min(89, snappedLatitude + halfHeight)
  const west = Math.max(-180, snappedLongitude - halfWidth)
  const east = Math.min(180, snappedLongitude + halfWidth)
  const url = new URL('https://wvs.earthdata.nasa.gov/api/v1/snapshot')
  url.search = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: `${south},${west},${north},${east}`,
    CRS: 'EPSG:4326',
    LAYERS: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    FORMAT: 'image/jpeg',
    WIDTH: '1024',
    HEIGHT: '768',
  }).toString()
  return url.href
}
