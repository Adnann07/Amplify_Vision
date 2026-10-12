export type ObservationImagerySource = 'landsat' | 'epic' | 'nasa' | 'simulated'

export interface ObservationTargetPreset {
  id: string
  name: string
  body: string
  coordinates: [longitude: number, latitude: number] | null
  imagerySource: ObservationImagerySource
}

const landsatRegions: ObservationTargetPreset[] = [
  {
    id: 'washington-dc',
    name: 'Washington, DC',
    body: 'Earth',
    coordinates: [-77, 38.9],
    imagerySource: 'landsat',
  },
  {
    id: 'amazon',
    name: 'Amazon Basin',
    body: 'Earth',
    coordinates: [-60.9, -3.5],
    imagerySource: 'landsat',
  },
  {
    id: 'sahara',
    name: 'Sahara Desert',
    body: 'Earth',
    coordinates: [13, 24.1],
    imagerySource: 'landsat',
  },
]

export function getObservationTargets(spacecraftId: string | undefined, destination: string): ObservationTargetPreset[] {
  if (spacecraftId === 'landsat-8' || spacecraftId === 'landsat-9') return landsatRegions
  if (spacecraftId === 'dscovr') {
    return [{
      id: 'earth-full-disk',
      name: 'Full Earth disk',
      body: 'Earth',
      coordinates: null,
      imagerySource: 'epic',
    }]
  }

  const body = /mars|martian/i.test(destination) ? 'Mars'
    : /jupiter/i.test(destination) ? 'Jupiter'
      : /saturn/i.test(destination) ? 'Saturn'
        : /moon|lunar/i.test(destination) ? 'Moon'
          : /earth|orbit/i.test(destination) ? 'Earth'
            : destination || 'Mission target'
  return [{
    id: `mission-target-${body.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name: `${body} mission target`,
    body,
    coordinates: null,
    imagerySource: ['Mars', 'Moon', 'Jupiter', 'Saturn'].includes(body) ? 'nasa' : 'simulated',
  }]
}
