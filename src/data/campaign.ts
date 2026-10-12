import {
  earthObservationBriefing,
  lunarSurveyBriefing,
  type MissionBriefing,
} from './missionBriefing'
import { missionGoals, type MissionGoal } from './missionGoals'
import type { InstrumentType } from './spacecraftBuild'

export type MissionRequirementId = keyof MissionGoal['requirements']

export interface CampaignScoringWeights {
  primaryObjective: number
  engineeringCompliance: number
  budgetEfficiency: number
  resourceEfficiency: number
  sciencePerformance: number
  optionalObjectives: number
}

export type MissionCategory =
  | 'Training'
  | 'Earth observation'
  | 'Space weather'
  | 'Asteroid investigation'
  | 'Communications'
  | 'Astronomy'
  | 'Lunar exploration'
  | 'Planetary science'
  | 'Deep-space technology'

export interface CampaignMission {
  id: string
  level: number
  title: string
  summary: string
  category: MissionCategory
  estimatedDuration: string
  recommendedInstrumentType: InstrumentType
  difficulty: 'Introductory' | 'Easy' | 'Moderate' | 'Challenging'
  destination: string
  objective: string
  briefing: MissionBriefing
  missionGoalId: string
  requiresMissionIds: string[]
  scoring: CampaignScoringWeights
  scienceTarget: number
  requiredInstrumentType?: InstrumentType
  recommendedSpacecraftId?: string
  planningOnly?: boolean
  optionalObjective: {
    label: string
    resourceEfficiencyTarget: number
  }
  eventProvenance?: EventMissionProvenance
}

export interface EventMissionProvenance {
  provider: 'noaa' | 'eonet' | 'jpl'
  providerEventId: string
  category: string
  title: string
  description: string | null
  eventTime: string | null
  eventTimeScale: 'UTC' | 'TDB'
  retrievedAt: string
  status: string
  sourceUrl: string
  providerLabel: string
  categories: { id: string; title: string }[]
  geometries: {
    date: string | null
    type: string | null
    coordinates: number[] | null
    bounds: [number, number, number, number] | null
    hasCoordinates: boolean
    magnitudeValue: number | null
    magnitudeUnit: string | null
  }[]
  sourceReferences: { id: string | null; url: string }[]
  measurements: {
    label: string
    value: number
    unit: string | null
    uncertainty?: number | null
  }[]
  uncertainty: {
    distanceMinimumAu: number | null
    distanceMaximumAu: number | null
    diameterSigmaKm: number | null
    timeSigma: string | null
  } | null
  sourceFieldsUsed: string[]
  limitations: string[]
}

export interface CampaignMissionFilters {
  category: MissionCategory | 'All'
  difficulty: CampaignMission['difficulty'] | 'All'
  search: string
}

const standardScoring: CampaignScoringWeights = {
  primaryObjective: 40,
  engineeringCompliance: 20,
  budgetEfficiency: 15,
  resourceEfficiency: 10,
  sciencePerformance: 10,
  optionalObjectives: 5,
}

interface MissionTemplate {
  id: string
  title: string
  summary: string
  category: MissionCategory
  estimatedDuration: string
  difficulty: CampaignMission['difficulty']
  missionGoalId: string
  recommendedInstrumentType: InstrumentType
  scienceTarget: number
  requiredInstrumentType?: InstrumentType
  nasaImageQuery: string
  recommendedSpacecraftId?: string
  planningOnly?: boolean
  missionSpecificNote?: string
  sourceUrl?: string
  sourceLabel?: string
}

const missionTemplates: MissionTemplate[] = [
  {
    id: 'first-flight',
    title: 'First Flight',
    summary: 'Place a compact Earth-observation spacecraft into low Earth orbit.',
    category: 'Training',
    estimatedDuration: '1 orbital deployment',
    difficulty: 'Introductory',
    missionGoalId: 'earth-observation',
    recommendedInstrumentType: 'camera',
    scienceTarget: 36,
    requiredInstrumentType: 'camera',
    nasaImageQuery: 'NASA Earth observation satellite',
  },
  {
    id: 'lunar-survey',
    title: 'Lunar Survey',
    summary: 'Configure a two-instrument spacecraft for a lunar terrain survey.',
    category: 'Lunar exploration',
    estimatedDuration: '3–5 day transfer',
    difficulty: 'Moderate',
    missionGoalId: 'lunar-survey',
    recommendedInstrumentType: 'radar',
    scienceTarget: 48,
    nasaImageQuery: 'Lunar Reconnaissance Orbiter Moon',
  },
  {
    id: 'climate-sentinel',
    title: 'Climate Sentinel',
    summary: 'Track land and atmospheric indicators using a power-rich orbital survey platform.',
    category: 'Earth observation',
    estimatedDuration: '90-minute orbit',
    difficulty: 'Easy',
    missionGoalId: 'climate-sentinel',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 54,
    nasaImageQuery: 'NASA Earth climate satellite',
  },
  {
    id: 'orbital-relay',
    title: 'Orbital Relay',
    summary: 'Deploy a communications spacecraft with a robust ground link and operating margin.',
    category: 'Communications',
    estimatedDuration: '90-minute orbit',
    difficulty: 'Easy',
    missionGoalId: 'orbital-relay',
    recommendedInstrumentType: 'camera',
    scienceTarget: 38,
    nasaImageQuery: 'NASA communications satellite Earth orbit',
  },
  {
    id: 'space-telescope',
    title: 'Space Telescope',
    summary: 'Place a two-instrument observatory in orbit with strong power and communications.',
    category: 'Astronomy',
    estimatedDuration: '90-minute orbit',
    difficulty: 'Moderate',
    missionGoalId: 'space-telescope',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 62,
    nasaImageQuery: 'NASA space telescope observatory',
  },
  {
    id: 'lunar-polar-mapper',
    title: 'Lunar Polar Mapper',
    summary: 'Map polar terrain and shadowed regions with an orbital remote-sensing payload.',
    category: 'Lunar exploration',
    estimatedDuration: '3–5 day transfer',
    difficulty: 'Moderate',
    missionGoalId: 'lunar-polar-mapper',
    recommendedInstrumentType: 'radar',
    scienceTarget: 54,
    nasaImageQuery: 'NASA lunar polar mapping spacecraft',
  },
  {
    id: 'lunar-resource-survey',
    title: 'Lunar Resource Survey',
    summary: 'Pair complementary observations to investigate lunar surface materials and terrain.',
    category: 'Lunar exploration',
    estimatedDuration: '3–5 day transfer',
    difficulty: 'Challenging',
    missionGoalId: 'lunar-resource-survey',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 64,
    nasaImageQuery: 'NASA Moon resource mapping mission',
  },
  {
    id: 'mars-atmosphere',
    title: 'Mars Atmosphere Observer',
    summary: 'Plan a Mars-orbiting science platform to study the planet’s atmosphere.',
    category: 'Planetary science',
    estimatedDuration: '6–8 month transfer',
    difficulty: 'Challenging',
    missionGoalId: 'mars-atmosphere',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 68,
    nasaImageQuery: 'NASA Mars atmosphere orbiter',
  },
  {
    id: 'mars-surface-imager',
    title: 'Mars Surface Imager',
    summary: 'Deliver an orbital camera with the energy and communications for repeat imaging.',
    category: 'Planetary science',
    estimatedDuration: '6–8 month transfer',
    difficulty: 'Challenging',
    missionGoalId: 'mars-surface-imager',
    recommendedInstrumentType: 'camera',
    scienceTarget: 58,
    nasaImageQuery: 'NASA Mars orbiter high resolution camera',
  },
  {
    id: 'venus-cloud-study',
    title: 'Venus Cloud Study',
    summary: 'Characterize cloud-layer composition using a spectrometer-equipped science orbiter.',
    category: 'Planetary science',
    estimatedDuration: 'Preliminary transfer estimate',
    difficulty: 'Challenging',
    missionGoalId: 'venus-cloud-study',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 52,
    nasaImageQuery: 'NASA Venus atmospheric science spacecraft',
  },
  {
    id: 'mercury-solar-monitor',
    title: 'Mercury Solar Monitor',
    summary: 'Plan a high-energy inner-system survey with ample power and a deep-space link.',
    category: 'Planetary science',
    estimatedDuration: 'Preliminary transfer estimate',
    difficulty: 'Challenging',
    missionGoalId: 'mercury-solar-monitor',
    recommendedInstrumentType: 'radar',
    scienceTarget: 72,
    nasaImageQuery: 'NASA MESSENGER Mercury spacecraft',
  },
  {
    id: 'europa-plume-survey',
    title: 'Europa Plume Survey',
    summary: 'Prepare a multi-instrument deep-space flyby study with a long-range communications link.',
    category: 'Planetary science',
    estimatedDuration: '2–5 year transfer',
    difficulty: 'Challenging',
    missionGoalId: 'europa-plume-survey',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 76,
    nasaImageQuery: 'NASA Europa Clipper spacecraft Europa',
  },
  {
    id: 'saturn-ring-survey',
    title: 'Saturn Ring Survey',
    summary: 'Survey ring structure using a deep-space science and communications package.',
    category: 'Planetary science',
    estimatedDuration: '6–8 year transfer',
    difficulty: 'Challenging',
    missionGoalId: 'saturn-ring-survey',
    recommendedInstrumentType: 'radar',
    scienceTarget: 78,
    nasaImageQuery: 'NASA Cassini Saturn rings',
  },
  {
    id: 'deep-space-technology-demo',
    title: 'Deep-Space Technology Demonstrator',
    summary: 'Exercise high-delta-v propulsion and deep-space communications on a distant-system trajectory.',
    category: 'Deep-space technology',
    estimatedDuration: 'Preliminary transfer estimate',
    difficulty: 'Challenging',
    missionGoalId: 'deep-space-technology-demo',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 62,
    nasaImageQuery: 'NASA deep space technology demonstration spacecraft',
  },
  {
    id: 'orion-crew-safe-lunar',
    title: 'Orion Crew-Safe Lunar Flight',
    summary: 'Plan a crewed lunar-vicinity flight with a safe Earth-return design margin.',
    category: 'Lunar exploration',
    estimatedDuration: 'Crewed lunar-vicinity mission',
    difficulty: 'Challenging',
    missionGoalId: 'orion-crew-safe-lunar',
    recommendedInstrumentType: 'camera',
    scienceTarget: 48,
    nasaImageQuery: 'NASA Orion spacecraft Artemis',
    recommendedSpacecraftId: 'orion',
    missionSpecificNote:
      'Orion carries crew to lunar vicinity and returns to Earth; it is not a lunar lander. Crew consumables, life support, thermal protection, and safe-return operations are not modeled by this game.',
    sourceUrl: 'https://www.nasa.gov/humans-in-space/orion-spacecraft/orion-overview/',
    sourceLabel: 'NASA Orion Overview',
  },
  {
    id: 'perseverance-jezero-science',
    title: 'Perseverance Jezero Science Exercise',
    summary: 'Configure a Mars surface science campaign to study rocks and the crater’s ancient watery past.',
    category: 'Planetary science',
    estimatedDuration: 'Mars surface science exercise',
    difficulty: 'Challenging',
    missionGoalId: 'perseverance-jezero-science',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 72,
    nasaImageQuery: 'NASA Perseverance rover Jezero Crater',
    recommendedSpacecraftId: 'perseverance',
    missionSpecificNote:
      'This is a hypothetical simplified campaign using the Mars mission requirements. Mars entry, descent and landing, surface driving, sample caching, and relay operations are not simulated.',
    sourceUrl: 'https://science.nasa.gov/mission/mars-2020-perseverance/',
    sourceLabel: 'NASA Mars 2020 Perseverance',
  },
  {
    id: 'osiris-bennu-sample-return',
    title: 'OSIRIS-REx Bennu Sample-Return Recreation',
    summary: 'Recreate the engineering trade-offs of a Bennu characterization and sample-return mission.',
    category: 'Asteroid investigation',
    estimatedDuration: 'Notional small-body planning exercise',
    difficulty: 'Challenging',
    missionGoalId: 'osiris-bennu-sample-return',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 76,
    nasaImageQuery: 'NASA OSIRIS-REx Bennu spacecraft',
    recommendedSpacecraftId: 'osiris-rex',
    planningOnly: true,
    missionSpecificNote:
      'The original OSIRIS-REx primary mission collected a sample in 2020 and delivered it in 2023. This is a hypothetical planning recreation; the game does not calculate a Bennu intercept, perform sample collection, or model Earth return.',
    sourceUrl: 'https://science.nasa.gov/mission/osiris-rex/',
    sourceLabel: 'NASA OSIRIS-REx Mission',
  },
  {
    id: 'psyche-deep-space-study',
    title: 'Psyche Deep-Space Science Planning',
    summary: 'Plan a power-aware long cruise and science package for a metal-rich asteroid investigation.',
    category: 'Deep-space technology',
    estimatedDuration: 'Long-duration deep-space planning exercise',
    difficulty: 'Challenging',
    missionGoalId: 'psyche-deep-space-study',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 70,
    nasaImageQuery: 'NASA Psyche spacecraft asteroid',
    recommendedSpacecraftId: 'psyche',
    planningOnly: true,
    missionSpecificNote:
      'NASA’s Psyche spacecraft is en route to its target with arrival planned for 2029. The game does not calculate a Psyche transfer, asteroid orbit insertion, or solar-electric propulsion performance.',
    sourceUrl: 'https://science.nasa.gov/mission/psyche/',
    sourceLabel: 'NASA Psyche Mission',
  },
  {
    id: 'lucy-trojan-flyby',
    title: 'Lucy Trojan Flyby Planning',
    summary: 'Balance a long-duration asteroid flyby campaign around navigation, communications, and science priorities.',
    category: 'Asteroid investigation',
    estimatedDuration: 'Multiple-encounter planning exercise',
    difficulty: 'Challenging',
    missionGoalId: 'lucy-trojan-flyby',
    recommendedInstrumentType: 'camera',
    scienceTarget: 66,
    nasaImageQuery: 'NASA Lucy Trojan asteroid spacecraft',
    recommendedSpacecraftId: 'lucy',
    planningOnly: true,
    missionSpecificNote:
      'Lucy’s target encounters are flybys, not routine asteroid orbit insertions. Multiple-target trajectories, encounter timing, and observation scheduling are not simulated.',
    sourceUrl: 'https://science.nasa.gov/mission/lucy/',
    sourceLabel: 'NASA Lucy Mission',
  },
  {
    id: 'landsat9-land-imaging',
    title: 'Landsat 9 Land-Imaging Campaign',
    summary: 'Configure an Earth-orbiting imaging mission with optical and thermal observation requirements.',
    category: 'Earth observation',
    estimatedDuration: 'Earth-orbit imaging exercise',
    difficulty: 'Moderate',
    missionGoalId: 'landsat9-land-imaging',
    recommendedInstrumentType: 'camera',
    scienceTarget: 64,
    nasaImageQuery: 'NASA USGS Landsat 9 satellite',
    recommendedSpacecraftId: 'landsat-9',
    missionSpecificNote:
      'Landsat 9 carries OLI-2 and TIRS-2. This game does not simulate spectral-band resolution, image data volume, revisit coverage, or ground-station scheduling.',
    sourceUrl: 'https://science.nasa.gov/mission/landsat-9/',
    sourceLabel: 'NASA Landsat 9 Mission',
  },
  {
    id: 'jwst-observatory-design',
    title: 'Webb Infrared Observatory Design Study',
    summary: 'Configure a high-power infrared observatory concept with multiple instruments and a deep-space communications link.',
    category: 'Astronomy',
    estimatedDuration: 'Observatory systems design exercise',
    difficulty: 'Challenging',
    missionGoalId: 'jwst-observatory-design',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 82,
    nasaImageQuery: 'NASA James Webb Space Telescope',
    recommendedSpacecraftId: 'jwst',
    missionSpecificNote:
      'This is a generic engineering design study. The game uses Earth orbit as a supported proxy and does not model Webb’s Sun-Earth L2 orbit, launch/deployment sequence, station-keeping, cryogenic conditions, or infrared science performance.',
    sourceUrl: 'https://science.nasa.gov/mission/webb/',
    sourceLabel: 'NASA James Webb Space Telescope',
  },
  {
    id: 'parker-solar-science-study',
    title: 'Parker Solar Probe Systems Design Study',
    summary: 'Review power, communications, and instrument trade-offs for a notional solar-science probe.',
    category: 'Deep-space technology',
    estimatedDuration: 'Inner-system engineering design exercise',
    difficulty: 'Challenging',
    missionGoalId: 'parker-solar-science-study',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 80,
    nasaImageQuery: 'NASA Parker Solar Probe',
    recommendedSpacecraftId: 'parker-solar-probe',
    planningOnly: true,
    missionSpecificNote:
      'Mercury is only a supported inner-solar-system destination proxy. This exercise does not model Parker’s solar passes, perihelion, thermal protection, solar-wind science, or actual flight trajectory.',
    sourceUrl: 'https://science.nasa.gov/mission/parker-solar-probe/',
    sourceLabel: 'NASA Parker Solar Probe',
  },
  {
    id: 'juno-jupiter-science',
    title: 'Juno Jupiter Science Design',
    summary: 'Plan the power, science-instrument, and communications needs of a Jupiter-system observatory.',
    category: 'Planetary science',
    estimatedDuration: 'Preliminary Earth-to-Jupiter transfer estimate',
    difficulty: 'Challenging',
    missionGoalId: 'juno-jupiter-science',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 84,
    nasaImageQuery: 'NASA Juno Jupiter spacecraft',
    recommendedSpacecraftId: 'juno',
    missionSpecificNote:
      'Jupiter has a supported Horizons planetary vector, but transfer estimates remain simplified. The game does not model Jupiter orbit insertion, radiation exposure, or Juno science operations.',
    sourceUrl: 'https://science.nasa.gov/mission/juno/',
    sourceLabel: 'NASA Juno Mission',
  },
  {
    id: 'roman-observatory-design',
    title: 'Roman Wide-Field Observatory Design Study',
    summary: 'Configure a high-power, multi-instrument observatory concept for infrared astronomy and survey science.',
    category: 'Astronomy',
    estimatedDuration: 'Observatory systems design exercise',
    difficulty: 'Challenging',
    missionGoalId: 'roman-observatory-design',
    recommendedInstrumentType: 'camera',
    scienceTarget: 82,
    nasaImageQuery: 'NASA Nancy Grace Roman Space Telescope',
    recommendedSpacecraftId: 'roman',
    missionSpecificNote:
      'This is a generic engineering design study. Earth orbit is only a supported proxy; the game does not model Roman’s Sun-Earth L2 orbit, deployment, station-keeping, or wide-field/coronagraph performance.',
    sourceUrl: 'https://science.nasa.gov/mission/roman-space-telescope/',
    sourceLabel: 'NASA Nancy Grace Roman Space Telescope',
  },
  {
    id: 'ingenuity-flight-technology-study',
    title: 'Ingenuity Mars Flight Technology Study',
    summary: 'Review a Mars technology-demonstration spacecraft design with communications and a compact science/navigation package.',
    category: 'Planetary science',
    estimatedDuration: 'Mars technology design exercise',
    difficulty: 'Challenging',
    missionGoalId: 'ingenuity-flight-technology-study',
    recommendedInstrumentType: 'camera',
    scienceTarget: 68,
    nasaImageQuery: 'NASA Ingenuity Mars Helicopter',
    recommendedSpacecraftId: 'ingenuity',
    missionSpecificNote:
      'Ingenuity’s powered flight is not simulated. The mission only evaluates generic Mars-transfer and spacecraft engineering constraints; it does not model atmospheric flight, rotor performance, surface mobility, or rover relay operations.',
    sourceUrl: 'https://science.nasa.gov/mission/mars-2020-ingenuity-helicopter/',
    sourceLabel: 'NASA Ingenuity Mars Helicopter',
  },
  {
    id: 'landsat8-land-imaging',
    title: 'Landsat 8 Earth Imaging Design',
    summary: 'Configure an Earth-orbiting multispectral imaging mission with optical and thermal observation objectives.',
    category: 'Earth observation',
    estimatedDuration: 'Earth-orbit imaging exercise',
    difficulty: 'Moderate',
    missionGoalId: 'landsat8-land-imaging',
    recommendedInstrumentType: 'camera',
    scienceTarget: 70,
    nasaImageQuery: 'NASA USGS Landsat 8 satellite',
    recommendedSpacecraftId: 'landsat-8',
    missionSpecificNote:
      'The builder evaluates generic power, instrument-count, communications, mass, and budget constraints only. Landsat spectral bands, image quality, revisit coverage, and ground-station scheduling are not simulated.',
    sourceUrl: 'https://landsat.gsfc.nasa.gov/satellites/landsat-8/',
    sourceLabel: 'NASA / USGS Landsat 8',
  },
  {
    id: 'dscovr-climate-monitoring-study',
    title: 'DSCOVR Earth and Space-Weather Design Study',
    summary: 'Review a combined Earth-observation and solar-wind monitoring payload with a robust deep-space link.',
    category: 'Space weather',
    estimatedDuration: 'Earth and space-weather systems design exercise',
    difficulty: 'Challenging',
    missionGoalId: 'dscovr-climate-monitoring-study',
    recommendedInstrumentType: 'spectrometer',
    scienceTarget: 74,
    nasaImageQuery: 'NASA DSCOVR Earth observatory',
    recommendedSpacecraftId: 'dscovr',
    planningOnly: true,
    missionSpecificNote:
      'Earth orbit is only a supported proxy for Sun-Earth L1. The game does not calculate the L1 transfer or model EPIC Earth images, solar-wind instruments, or NOAA operational forecasting.',
    sourceUrl: 'https://science.nasa.gov/mission/dscovr/',
    sourceLabel: 'NASA DSCOVR Mission',
  },
]

function createMissionBriefing(template: MissionTemplate, goal: MissionGoal, level: number): MissionBriefing {
  const missionName = template.title
  const objectives = [
    `Primary objective: ${template.summary.toLowerCase()}`,
    `Reach the ${goal.destination} target with at least ${goal.requirements.power.toLocaleString()} W and ${goal.requirements.deltaV.toFixed(1)} km/s Delta-V.`,
    `Provide ${goal.requirements.communication}% communications and at least ${goal.requirements.instruments} science instrument${goal.requirements.instruments === 1 ? '' : 's'}.`,
    `Keep the design within the $${goal.requirements.maxBudget.toLocaleString()}M mission budget${goal.requirements.maxMass === undefined ? '.' : ` and ${goal.requirements.maxMass.toLocaleString()} kg mass limit.`}`,
    'A successful launch is only the first milestone; the recorded spacecraft must satisfy every mission requirement.',
  ]
  return {
    id: goal.id,
    level,
    title: `Mission ${String(level).padStart(2, '0')}: ${missionName}`,
    missionName,
    difficulty: template.difficulty === 'Introductory' || template.difficulty === 'Easy'
      ? 'Easy'
      : template.difficulty,
    scenario: `${template.summary} The mission uses the existing game spacecraft builder and recorded engineering constraints; orbital mechanics and science collection are not simulated.`,
    dialogueStages: [
      `Mission Control: ${goal.description}`,
      `Review the ${goal.destination} destination, mission requirements, spacecraft telemetry, and the launch vehicle's payload capacity before launch.`,
    ],
    objectives: [
      ...objectives,
      ...(template.recommendedSpacecraftId
        ? [`Recommended spacecraft preset: ${template.recommendedSpacecraftId}.`]
        : []),
      ...(template.missionSpecificNote ? [template.missionSpecificNote] : []),
    ],
    avatarPath: '/models/advanced-crew-escape-suit.glb',
    sourceUrl: template.sourceUrl ?? 'https://science.nasa.gov/3d-resources/advanced-crew-escape-suit/',
    sourceLabel: template.sourceLabel ?? 'NASA 3D Resources — Advanced Crew Escape Suit',
    nasaImageQuery: template.nasaImageQuery,
  }
}

export const campaignMissions: CampaignMission[] = missionTemplates.map((template, index, templates) => {
  const goal = missionGoals.find((candidate) => candidate.id === template.missionGoalId)
  if (!goal) throw new Error(`Campaign mission "${template.id}" references missing goal "${template.missionGoalId}".`)
  const previousMission = templates[index - 1]
  return {
    id: template.id,
    level: index + 1,
    title: template.title,
    summary: template.summary,
    category: template.category,
    estimatedDuration: template.estimatedDuration,
    recommendedInstrumentType: template.recommendedInstrumentType,
    difficulty: template.difficulty,
    destination: goal.destination,
    objective: goal.description,
    briefing: template.id === 'first-flight'
      ? { ...earthObservationBriefing }
      : template.id === 'lunar-survey'
        ? { ...lunarSurveyBriefing }
        : createMissionBriefing(template, goal, index + 1),
    missionGoalId: template.missionGoalId,
    requiresMissionIds: previousMission ? [previousMission.id] : [],
    scoring: { ...standardScoring },
    scienceTarget: template.scienceTarget,
    ...(template.recommendedSpacecraftId
      ? { recommendedSpacecraftId: template.recommendedSpacecraftId }
      : {}),
    ...(template.planningOnly ? { planningOnly: true } : {}),
    ...(template.requiredInstrumentType ? { requiredInstrumentType: template.requiredInstrumentType } : {}),
    optionalObjective: {
      label: 'Reach 75% resource efficiency',
      resourceEfficiencyTarget: 75,
    },
  }
})

export const campaignMissionCategories: MissionCategory[] = [
  ...new Set(campaignMissions.map((mission) => mission.category)),
]

export function filterCampaignMissions(
  missions: CampaignMission[],
  filters: CampaignMissionFilters,
): CampaignMission[] {
  const search = filters.search.trim().toLocaleLowerCase()
  return missions.filter((mission) => {
    if (filters.category !== 'All' && mission.category !== filters.category) return false
    if (filters.difficulty !== 'All' && mission.difficulty !== filters.difficulty) return false
    if (!search) return true
    return [
      mission.title,
      mission.summary,
      mission.destination,
      mission.category,
      mission.objective,
    ].some((value) => value.toLocaleLowerCase().includes(search))
  })
}

export function isCampaignMissionUnlocked(
  mission: CampaignMission,
  completedMissionIds: string[],
  allMissionsUnlocked = false,
): boolean {
  return allMissionsUnlocked || mission.requiresMissionIds.every((id) => completedMissionIds.includes(id))
}

export function resolveCampaignMission(
  missionId: string,
  completedMissionIds: string[],
  allMissionsUnlocked = false,
  missions: CampaignMission[] = campaignMissions,
): CampaignMission {
  const mission = missions.find((candidate) => candidate.id === missionId)
  if (!mission) throw new Error(`Unknown campaign mission "${missionId}".`)
  if (!isCampaignMissionUnlocked(mission, completedMissionIds, allMissionsUnlocked)) {
    const missing = mission.requiresMissionIds.filter((id) => !completedMissionIds.includes(id))
    throw new Error(`Campaign mission "${mission.id}" is locked until these missions are completed: ${missing.join(', ')}.`)
  }
  return mission
}

export function getCampaignMissionGoal(mission: CampaignMission): MissionGoal {
  const goal = missionGoals.find((candidate) => candidate.id === mission.missionGoalId)
  if (!goal) {
    throw new Error(`Campaign mission "${mission.id}" references unknown mission goal "${mission.missionGoalId}".`)
  }
  return goal
}
