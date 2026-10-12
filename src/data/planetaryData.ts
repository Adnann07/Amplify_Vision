export interface PlanetaryBody {
  id: string
  name: string
  horizonsTargetId: string
  color: string
  destinationId: string | null
}

export const heliocentricBodies: PlanetaryBody[] = [
  { id: 'mercury', name: 'Mercury', horizonsTargetId: '199', color: '#b6a99a', destinationId: 'mercury' },
  { id: 'venus', name: 'Venus', horizonsTargetId: '299', color: '#e7b66b', destinationId: 'venus' },
  { id: 'earth', name: 'Earth', horizonsTargetId: '399', color: '#60a5fa', destinationId: 'earth-orbit' },
  { id: 'mars', name: 'Mars', horizonsTargetId: '499', color: '#fb806a', destinationId: 'mars' },
  { id: 'jupiter', name: 'Jupiter', horizonsTargetId: '599', color: '#d6a878', destinationId: 'europa' },
  { id: 'saturn', name: 'Saturn', horizonsTargetId: '699', color: '#ead39a', destinationId: 'saturn' },
  { id: 'uranus', name: 'Uranus', horizonsTargetId: '799', color: '#78d3d4', destinationId: 'uranus' },
  { id: 'neptune', name: 'Neptune', horizonsTargetId: '899', color: '#7395fa', destinationId: 'neptune' },
]

export const solarSystemCenter = {
  id: 'sun',
  name: 'Sun',
  horizonsTargetId: '10',
  color: '#fbbf24',
} as const

export function getPlanetaryBody(bodyId: string): PlanetaryBody {
  const body = heliocentricBodies.find((candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`Unsupported Horizons planetary target "${bodyId}".`)
  return body
}
