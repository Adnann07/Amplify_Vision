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
  {
    id: 'climate-sentinel',
    name: 'Climate Sentinel',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Track changing land and atmosphere indicators from a repeatable orbital survey.',
    requirements: { power: 1500, deltaV: 2, communication: 75, instruments: 2, maxBudget: 3600, maxMass: 6000 },
  },
  {
    id: 'orbital-relay',
    name: 'Orbital Relay',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Deploy a communications spacecraft with a robust ground link and operational margin.',
    requirements: { power: 500, deltaV: 1.5, communication: 86, instruments: 1, maxBudget: 3000, maxMass: 5500 },
  },
  {
    id: 'space-telescope',
    name: 'Space Telescope',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Place a power-rich observatory in orbit with two instruments for astronomical surveys.',
    requirements: { power: 1500, deltaV: 2, communication: 86, instruments: 2, maxBudget: 4200, maxMass: 6500 },
  },
  {
    id: 'lunar-polar-mapper',
    name: 'Lunar Polar Mapper',
    destination: 'Moon',
    destinationId: 'moon',
    description: 'Map polar terrain and shadowed regions with an orbital remote-sensing payload.',
    requirements: { power: 1000, deltaV: 2.5, communication: 75, instruments: 1, maxBudget: 3900, maxMass: 6000 },
  },
  {
    id: 'lunar-resource-survey',
    name: 'Lunar Resource Survey',
    destination: 'Moon',
    destinationId: 'moon',
    description: 'Combine complementary observations to compare surface composition and terrain.',
    requirements: { power: 1500, deltaV: 3, communication: 75, instruments: 2, maxBudget: 4500, maxMass: 7000 },
  },
  {
    id: 'mars-atmosphere',
    name: 'Mars Atmosphere Observer',
    destination: 'Mars',
    destinationId: 'mars',
    description: 'Study atmospheric structure from a Mars-orbiting science platform.',
    requirements: { power: 1000, deltaV: 5.5, communication: 86, instruments: 2, maxBudget: 4800, maxMass: 7000 },
  },
  {
    id: 'mars-surface-imager',
    name: 'Mars Surface Imager',
    destination: 'Mars',
    destinationId: 'mars',
    description: 'Deliver an orbital camera with the energy and communications for repeat imaging.',
    requirements: { power: 1500, deltaV: 6, communication: 86, instruments: 1, maxBudget: 5000, maxMass: 7000 },
  },
  {
    id: 'venus-cloud-study',
    name: 'Venus Cloud Study',
    destination: 'Venus',
    destinationId: 'venus',
    description: 'Characterize cloud-layer composition using a spectrometer-equipped science orbiter.',
    requirements: { power: 1000, deltaV: 4.5, communication: 80, instruments: 1, maxBudget: 4500, maxMass: 6500 },
  },
  {
    id: 'mercury-solar-monitor',
    name: 'Mercury Solar Monitor',
    destination: 'Mercury',
    destinationId: 'mercury',
    description: 'Plan a high-energy inner-solar-system survey with ample power and a deep-space link.',
    requirements: { power: 1500, deltaV: 7, communication: 86, instruments: 2, maxBudget: 5600, maxMass: 7500 },
  },
  {
    id: 'europa-plume-survey',
    name: 'Europa Plume Survey',
    destination: 'Europa',
    destinationId: 'europa',
    description: 'Prepare a deep-space flyby study with multiple instruments and a long-range communications link.',
    requirements: { power: 1500, deltaV: 5, communication: 97, instruments: 2, maxBudget: 6500, maxMass: 8500 },
  },
  {
    id: 'saturn-ring-survey',
    name: 'Saturn Ring Survey',
    destination: 'Saturn',
    destinationId: 'saturn',
    description: 'Survey ring structure from the Saturn system using a robust science and communications package.',
    requirements: { power: 1500, deltaV: 6.5, communication: 97, instruments: 2, maxBudget: 7200, maxMass: 9000 },
  },
  {
    id: 'deep-space-technology-demo',
    name: 'Deep-Space Technology Demonstrator',
    destination: 'Neptune',
    destinationId: 'neptune',
    description: 'Exercise high-efficiency propulsion, deep-space communications, and a compact technology payload.',
    requirements: { power: 1000, deltaV: 8, communication: 97, instruments: 1, maxBudget: 8000, maxMass: 9500 },
  },
  {
    id: 'space-weather-readiness',
    name: 'Space-Weather Readiness Exercise',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Configure an Earth-orbiting platform for a simulated response exercise informed by a published NOAA alert.',
    requirements: { power: 1000, deltaV: 1.5, communication: 86, instruments: 1, maxBudget: 3200, maxMass: 5500 },
  },
  {
    id: 'asteroid-observation-planning',
    name: 'Asteroid Observation Planning Exercise',
    destination: 'Asteroid observation planning target',
    destinationId: 'asteroid-planning',
    description: 'Prepare a notional spacecraft design for small-body characterization; this exercise does not calculate an intercept or trajectory.',
    requirements: { power: 1000, deltaV: 4, communication: 86, instruments: 2, maxBudget: 5200, maxMass: 7000 },
  },
  {
    id: 'orion-crew-safe-lunar',
    name: 'Crew-Safe Lunar Flight',
    destination: 'Moon',
    destinationId: 'moon',
    description: 'Prepare a crew-capable spacecraft for a lunar-vicinity flight and safe Earth-return design review.',
    requirements: { power: 1000, deltaV: 3, communication: 86, instruments: 1, maxBudget: 7500, maxMass: 15000 },
  },
  {
    id: 'perseverance-jezero-science',
    name: 'Jezero Surface Science',
    destination: 'Mars',
    destinationId: 'mars',
    description: 'Configure a Mars mission with power, instruments, and communications for a surface-science exercise.',
    requirements: { power: 1000, deltaV: 5.5, communication: 86, instruments: 2, maxBudget: 7000, maxMass: 6000 },
  },
  {
    id: 'osiris-bennu-sample-return',
    name: 'Bennu Sample-Return Planning',
    destination: 'Asteroid observation planning target',
    destinationId: 'asteroid-planning',
    description: 'Review a notional Bennu sample-return spacecraft design; no intercept or sample-return trajectory is calculated.',
    requirements: { power: 1500, deltaV: 5, communication: 97, instruments: 2, maxBudget: 7000, maxMass: 7000 },
  },
  {
    id: 'psyche-deep-space-study',
    name: 'Psyche Deep-Space Science',
    destination: 'Asteroid observation planning target',
    destinationId: 'asteroid-planning',
    description: 'Assess a long-duration asteroid science spacecraft design without calculating a transfer or orbit insertion.',
    requirements: { power: 1500, deltaV: 6.5, communication: 97, instruments: 2, maxBudget: 8000, maxMass: 8000 },
  },
  {
    id: 'lucy-trojan-flyby',
    name: 'Trojan Flyby Planning',
    destination: 'Asteroid observation planning target',
    destinationId: 'asteroid-planning',
    description: 'Evaluate a spacecraft design for notional multiple-asteroid flyby science; encounter trajectories are not simulated.',
    requirements: { power: 1000, deltaV: 8, communication: 97, instruments: 1, maxBudget: 7500, maxMass: 7500 },
  },
  {
    id: 'landsat9-land-imaging',
    name: 'Landsat 9 Land Imaging',
    destination: 'Earth orbit',
    destinationId: 'earth-orbit',
    description: 'Configure an Earth-orbiting optical and thermal imaging platform using the game’s science and telemetry constraints.',
    requirements: { power: 1500, deltaV: 2, communication: 86, instruments: 2, maxBudget: 5000, maxMass: 6500 },
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
