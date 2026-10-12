import type { SpacecraftBuildStats } from './spacecraftBuild'

export interface MissionRequirements {
  power: number
  deltaV: number
  communication: number
  instruments: number
  maxBudget: number
  maxMass?: number
}

export interface MissionGoal {
  id: string
  name: string
  destination: string
  destinationId: string
  description: string
  requirements: MissionRequirements
}

export const missionGoals: MissionGoal[] = [
  {
    id: 'mars-flyby',
    name: 'Mars Flyby',
    destination: 'Mars',
    destinationId: 'mars',
    description: 'Carry a lean science payload past the Red Planet.',
    requirements: { power: 1000, deltaV: 5.5, communication: 70, instruments: 1, maxBudget: 3500 },
  },
  {
    id: 'europa-recon',
    name: 'Europa Reconnaissance',
    destination: 'Europa',
    destinationId: 'europa',
    description: 'Map the icy moon and relay close-flyby science home.',
    requirements: { power: 1000, deltaV: 4.5, communication: 80, instruments: 2, maxBudget: 5000 },
  },
  {
    id: 'lunar-survey',
    name: 'Lunar Survey',
    destination: 'Moon',
    destinationId: 'moon',
    description: 'Survey lunar terrain with a compact orbital platform.',
    requirements: { power: 500, deltaV: 2, communication: 60, instruments: 2, maxBudget: 3000 },
  },
  {
    id: 'earth-observation',
    name: 'Earth Observation',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Collect high-resolution data from a low-orbit vantage.',
    requirements: {
      power: 1500,
      deltaV: 1.5,
      communication: 75,
      instruments: 1,
      maxBudget: 2600,
      maxMass: 5000,
    },
  },
]

export interface MissionRequirementResult {
  id: keyof MissionRequirements
  label: string
  actual: number
  target: number
  passed: boolean
  displayActual: string
  displayTarget: string
  problem: string
}

export function evaluateMissionRequirements(
  mission: MissionGoal,
  stats: SpacecraftBuildStats,
): MissionRequirementResult[] {
  const { requirements } = mission
  const results: MissionRequirementResult[] = [
    {
      id: 'power',
      label: 'Power',
      actual: stats.power,
      target: requirements.power,
      passed: stats.power >= requirements.power,
      displayActual: `${stats.power.toLocaleString()} W`,
      displayTarget: `${requirements.power.toLocaleString()} W`,
      problem: 'Insufficient power',
    },
    {
      id: 'deltaV',
      label: 'Delta-V',
      actual: stats.deltaV,
      target: requirements.deltaV,
      passed: stats.deltaV >= requirements.deltaV,
      displayActual: `${stats.deltaV.toFixed(1)} km/s`,
      displayTarget: `${requirements.deltaV.toFixed(1)} km/s`,
      problem: 'Insufficient Delta-V',
    },
    {
      id: 'communication',
      label: 'Communication',
      actual: stats.communication,
      target: requirements.communication,
      passed: stats.communication >= requirements.communication,
      displayActual: `${stats.communication}%`,
      displayTarget: `${requirements.communication}%`,
      problem: 'Communication range is too low',
    },
    {
      id: 'instruments',
      label: 'Instruments',
      actual: stats.instrumentCount,
      target: requirements.instruments,
      passed: stats.instrumentCount >= requirements.instruments,
      displayActual: `${stats.instrumentCount}`,
      displayTarget: requirements.instruments > 1 ? `${requirements.instruments}+` : `${requirements.instruments}`,
      problem: 'Not enough science instruments',
    },
    {
      id: 'maxBudget',
      label: 'Budget',
      actual: stats.missionCost,
      target: requirements.maxBudget,
      passed: stats.missionCost <= requirements.maxBudget,
      displayActual: formatBudget(stats.missionCost),
      displayTarget: formatBudget(requirements.maxBudget),
      problem: 'Mission cost exceeds the budget',
    },
  ]

  if (requirements.maxMass !== undefined) {
    results.splice(results.length - 1, 0, {
      id: 'maxMass',
      label: 'Mass',
      actual: stats.mass,
      target: requirements.maxMass,
      passed: stats.mass <= requirements.maxMass,
      displayActual: `${stats.mass.toLocaleString()} kg`,
      displayTarget: `${requirements.maxMass.toLocaleString()} kg`,
      problem: 'Spacecraft exceeds the mass limit',
    })
  }

  return results
}

function formatBudget(value: number) {
  return `$${value.toLocaleString()}M`
}
