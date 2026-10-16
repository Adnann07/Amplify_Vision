import { heliocentricBodies } from '../../data/planetaryData'

export type MissionFlightProfile = 'orbiter' | 'flyby' | 'planning'

export interface FlightPoint {
  x: number
  y: number
  z: number
}

export interface FlightDestination {
  id: string
  name: string
  color: string
  radius: number
  center: FlightPoint
}

export const FLIGHT_DESTINATION_CENTER: FlightPoint = { x: 0, y: 190, z: -245 }

const destinationRadii: Record<string, number> = {
  mercury: 25,
  venus: 34,
  earth: 46,
  mars: 31,
  jupiter: 51,
  saturn: 48,
  uranus: 36,
  neptune: 35,
  moon: 20,
}

export function resolveFlightDestination(
  destinationId: string | undefined,
  destinationBodyId: string | null,
  destinationLabel: string,
): FlightDestination | null {
  let bodyId = destinationId
  if (bodyId === 'earth-orbit') bodyId = 'earth'
  if (bodyId === 'europa') bodyId = 'jupiter'

  if (!bodyId && destinationBodyId) bodyId = destinationBodyId
  if (!bodyId) {
    const label = destinationLabel.toLocaleLowerCase()
    if (label.includes('earth')) bodyId = 'earth'
    else if (label.includes('moon')) bodyId = 'moon'
    else if (label.includes('europa')) bodyId = 'jupiter'
    else bodyId = heliocentricBodies.find((body) => label.includes(body.name.toLocaleLowerCase()))?.id
  }

  if (!bodyId || bodyId === 'asteroid-planning') return null
  if (bodyId === 'moon') {
    return {
      id: 'moon',
      name: 'Moon',
      color: '#b8b9b5',
      radius: destinationRadii.moon,
      center: FLIGHT_DESTINATION_CENTER,
    }
  }

  const body = heliocentricBodies.find((candidate) => candidate.id === bodyId)
  if (!body) return null
  return {
    id: body.id,
    name: body.name,
    color: body.color,
    radius: destinationRadii[body.id] ?? 34,
    center: FLIGHT_DESTINATION_CENTER,
  }
}

export function getTransferPosition(
  start: FlightPoint,
  end: FlightPoint,
  progress: number,
): FlightPoint {
  const t = Math.max(0, Math.min(1, progress))
  const control = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 + 90,
    z: (start.z + end.z) / 2 - 35,
  }
  const inverse = 1 - t
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    z: inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
  }
}

export function getOrbitPosition(
  center: FlightPoint,
  radius: number,
  angle: number,
): FlightPoint {
  return {
    x: center.x + radius * Math.cos(angle),
    y: center.y,
    z: center.z + radius * Math.sin(angle),
  }
}
