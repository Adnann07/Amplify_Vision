import type { CampaignMission, EventMissionProvenance } from './campaign'
import { missionGoals } from './missionGoals'
import type { MissionBriefing } from './missionBriefing'

export type RealTimeEventProvider = 'noaa' | 'eonet' | 'jpl'
export type RealTimeEventCategory = 'space-weather' | 'earth-observation' | 'asteroid-investigation'
export type RealTimeProviderStatus = 'live' | 'cached' | 'stale' | 'unavailable'

export interface RealTimeEventMeasurement {
  label: string
  value: number
  unit: string | null
  uncertainty?: number | null
}
const providerSourceHosts = [
  'nasa.gov',
  'noaa.gov',
  'usgs.gov',
  'metoc.navy.mil',
  'doi.org',
]

export interface RealTimeEvent {
  id: string
  provider: RealTimeEventProvider
  providerLabel: string
  providerEventId: string
  category: RealTimeEventCategory
  title: string
  description: string | null
  eventTime: string | null
  eventTimeScale: 'UTC' | 'TDB'
  sourceUrl: string
  status: string
  dataKind: string
  categories?: { id: string; title: string }[]
  geometries?: {
    date: string | null
    type: string | null
    coordinates: number[] | null
    bounds: [number, number, number, number] | null
    hasCoordinates: boolean
    magnitudeValue: number | null
    magnitudeUnit: string | null
  }[]
  sources?: { id: string | null; url: string }[]
  measurements: RealTimeEventMeasurement[]
  uncertainty?: {
    distanceMinimumAu: number | null
    distanceMaximumAu: number | null
    diameterSigmaKm: number | null
    timeSigma: string | null
  }
  eligible: boolean
  ineligibleReason: string | null
  sourceFieldsUsed: string[]
  retrievedAt: string
  freshness?: RealTimeProviderStatus
  error?: string
}

function isAllowedProviderReference(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' &&
      providerSourceHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
  } catch {
    return false
  }
}

export interface RealTimeEventsResponse {
  retrievedAt: string
  events: RealTimeEvent[]
  providers: Record<RealTimeEventProvider, {
    provider: RealTimeEventProvider
    status: RealTimeProviderStatus
    lastSuccessfulRequestAt: string | null
    error?: string
    truncated?: boolean
    totalAvailable?: number | null
  }>
}

export const REAL_TIME_EVENTS_STORAGE_KEY = 'amplify-vision-real-time-events-v1'
const eventProviders: RealTimeEventProvider[] = ['noaa', 'eonet', 'jpl']
const eventGoalByProvider: Record<RealTimeEventProvider, string> = {
  noaa: 'space-weather-readiness',
  eonet: 'climate-sentinel',
  jpl: 'asteroid-observation-planning',
}
const eventCategoryByProvider: Record<RealTimeEventProvider, CampaignMission['category']> = {
  noaa: 'Space weather',
  eonet: 'Earth observation',
  jpl: 'Asteroid investigation',
}
const eventDifficultyByProvider: Record<RealTimeEventProvider, CampaignMission['difficulty']> = {
  noaa: 'Moderate',
  eonet: 'Moderate',
  jpl: 'Challenging',
}
const briefingDifficultyByProvider: Record<RealTimeEventProvider, MissionBriefing['difficulty']> = {
  noaa: 'Moderate',
  eonet: 'Moderate',
  jpl: 'Challenging',
}
const sourceHosts: Record<RealTimeEventProvider, string[]> = {
  noaa: ['services.swpc.noaa.gov'],
  eonet: ['eonet.gsfc.nasa.gov'],
  jpl: ['ssd.jpl.nasa.gov'],
}

const storedCacheIsValid = (value: unknown): value is RealTimeEventsResponse =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  typeof (value as RealTimeEventsResponse).retrievedAt === 'string' &&
  Array.isArray((value as RealTimeEventsResponse).events) &&
  (value as RealTimeEventsResponse).events.length <= 500 &&
  (value as RealTimeEventsResponse).events.every(isRealTimeEvent) &&
  !!(value as RealTimeEventsResponse).providers &&
  eventProviders.every((provider) => {
    const status = (value as RealTimeEventsResponse).providers[provider]
    return !!status &&
      status.provider === provider &&
      ['live', 'cached', 'stale', 'unavailable'].includes(status.status)
  })

function isRealTimeEvent(value: unknown): value is RealTimeEvent {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const event = value as Partial<RealTimeEvent>
  if (!event.provider || !eventProviders.includes(event.provider)) return false
  const validTimestamp = (timestamp: string | null | undefined) =>
    timestamp === null || timestamp === undefined || Number.isFinite(Date.parse(timestamp))
  const containsControlCharacter = (input: string) =>
    [...input].some((character) => character.charCodeAt(0) < 0x20 || character.charCodeAt(0) === 0x7f)
  return (
    typeof event.id === 'string' &&
    event.id.length <= 200 &&
    typeof event.providerEventId === 'string' &&
    event.providerEventId.length > 0 &&
    event.providerEventId.length <= 160 &&
    !containsControlCharacter(event.providerEventId) &&
    typeof event.title === 'string' &&
    event.title.length > 0 &&
    event.title.length <= 240 &&
    typeof event.providerLabel === 'string' &&
    event.providerLabel.length <= 160 &&
    (event.category === (event.provider === 'noaa' ? 'space-weather' :
      event.provider === 'eonet' ? 'earth-observation' : 'asteroid-investigation')) &&
    typeof event.sourceUrl === 'string' &&
    isAllowedSourceUrl(event.provider, event.sourceUrl) &&
    (event.description === null || (typeof event.description === 'string' && event.description.length <= 12_000)) &&
    (event.eventTime === null || typeof event.eventTime === 'string') &&
    validTimestamp(event.eventTime) &&
    typeof event.retrievedAt === 'string' &&
    validTimestamp(event.retrievedAt) &&
    typeof event.status === 'string' &&
    event.status.length <= 80 &&
    typeof event.dataKind === 'string' &&
    event.dataKind.length <= 80 &&
    (event.eventTimeScale === 'UTC' || event.eventTimeScale === 'TDB') &&
    typeof event.eligible === 'boolean' &&
    (event.ineligibleReason === null || (typeof event.ineligibleReason === 'string' && event.ineligibleReason.length <= 500)) &&
    Array.isArray(event.measurements) &&
    event.measurements.length <= 20 &&
    event.measurements.every((measurement) =>
      !!measurement &&
      typeof measurement.label === 'string' &&
      measurement.label.length <= 120 &&
      typeof measurement.value === 'number' &&
      Number.isFinite(measurement.value) &&
      (measurement.unit === null || (typeof measurement.unit === 'string' && measurement.unit.length <= 30)) &&
      (measurement.uncertainty === undefined || measurement.uncertainty === null ||
        (typeof measurement.uncertainty === 'number' && Number.isFinite(measurement.uncertainty))),
    ) &&
    Array.isArray(event.sourceFieldsUsed) &&
    event.sourceFieldsUsed.length <= 30 &&
    event.sourceFieldsUsed.every((field) => typeof field === 'string' && field.length <= 80) &&
    (event.categories === undefined || (
      Array.isArray(event.categories) &&
      event.categories.length <= 10 &&
      event.categories.every((category) =>
        !!category && typeof category.id === 'string' && category.id.length <= 80 &&
        typeof category.title === 'string' && category.title.length <= 120,
      )
    )) &&
    (event.geometries === undefined || (
      Array.isArray(event.geometries) &&
      event.geometries.length <= 100 &&
      event.geometries.every((geometry) =>
        !!geometry &&
        validTimestamp(geometry.date) &&
        (geometry.type === null || (typeof geometry.type === 'string' && geometry.type.length <= 40)) &&
        typeof geometry.hasCoordinates === 'boolean' &&
        (geometry.coordinates === null || (
          Array.isArray(geometry.coordinates) &&
          geometry.coordinates.length <= 8 &&
          geometry.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
        )) &&
        (geometry.bounds === null || (
          Array.isArray(geometry.bounds) &&
          geometry.bounds.length === 4 &&
          geometry.bounds.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
        )) &&
        (geometry.magnitudeValue === null || (typeof geometry.magnitudeValue === 'number' && Number.isFinite(geometry.magnitudeValue))) &&
        (geometry.magnitudeUnit === null || typeof geometry.magnitudeUnit === 'string')
      )
    )) &&
    (event.sources === undefined || (
      Array.isArray(event.sources) &&
      event.sources.length <= 10 &&
      event.sources.every((source) =>
        !!source &&
        (source.id === null || (typeof source.id === 'string' && source.id.length <= 80)) &&
        typeof source.url === 'string' &&
        isAllowedProviderReference(source.url),
      )
    )) &&
    (event.uncertainty === undefined || (
      !!event.uncertainty &&
      [event.uncertainty.distanceMinimumAu, event.uncertainty.distanceMaximumAu,
        event.uncertainty.diameterSigmaKm].every((number) =>
        number === null || (typeof number === 'number' && Number.isFinite(number)),
      ) &&
      (event.uncertainty.timeSigma === null ||
        (typeof event.uncertainty.timeSigma === 'string' && event.uncertainty.timeSigma.length <= 60))
    ))
  )
}

function hashEventId(value: string): string {
  const normalized = value.trim().toLowerCase()
  return [2166136261, 2246822519].map((seed) => {
    let hash = seed
    for (const character of normalized) {
      hash ^= character.charCodeAt(0)
      hash = Math.imul(hash, 16777619)
    }
    return (hash >>> 0).toString(16).padStart(8, '0')
  }).join('')
}

function isAllowedSourceUrl(provider: RealTimeEventProvider, value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && sourceHosts[provider].includes(url.hostname)
  } catch {
    return false
  }
}

export async function fetchRealTimeEvents(options: {
  signal?: AbortSignal
  force?: boolean
} = {}): Promise<RealTimeEventsResponse> {
  const response = options.force
    ? await fetch('/api/real-time-events/refresh', { method: 'POST', signal: options.signal })
    : await fetch('/api/real-time-events', { signal: options.signal })
  const body: unknown = await response.json()
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body &&
      typeof body.error === 'string'
      ? body.error
      : 'Live event feeds could not be loaded.'
    throw new Error(message)
  }
  if (!storedCacheIsValid(body)) throw new Error('The live event response did not match the supported data format.')
  return body
}

export function loadCachedRealTimeEvents(): RealTimeEventsResponse | null {
  try {
    const saved = window.localStorage.getItem(REAL_TIME_EVENTS_STORAGE_KEY)
    if (!saved) return null
    const parsed: unknown = JSON.parse(saved)
    return storedCacheIsValid(parsed) ? parsed : null
  } catch (error) {
    console.warn('Cached real-time events could not be loaded.', error)
    return null
  }
}

export function saveCachedRealTimeEvents(value: RealTimeEventsResponse): string | null {
  try {
    window.localStorage.setItem(REAL_TIME_EVENTS_STORAGE_KEY, JSON.stringify(value))
    return null
  } catch (error) {
    console.error('Real-time event cache could not be saved in this browser.', error)
    return 'The event board is available, but its offline cache could not be saved in this browser.'
  }
}

export function filterRealTimeEvents(
  events: RealTimeEvent[],
  category: RealTimeEventCategory | 'all',
  provider: RealTimeEventProvider | 'all',
  search: string,
): RealTimeEvent[] {
  const needle = search.trim().toLocaleLowerCase()
  return events.filter((event) =>
    (category === 'all' || event.category === category) &&
    (provider === 'all' || event.provider === provider) &&
    (!needle || `${event.title} ${event.description ?? ''} ${event.providerEventId}`.toLocaleLowerCase().includes(needle)),
  )
}

function toBriefing(event: RealTimeEvent, goalName: string, level: number): MissionBriefing {
  const scenario = event.provider === 'noaa'
    ? `Use a published NOAA Space Weather Prediction Center alert as context for a simulated spacecraft readiness design exercise. The game does not model the alert's physical effects on a spacecraft.`
    : event.provider === 'eonet'
      ? `Use this NASA EONET event and its reported location as context for a simulated Earth-observation spacecraft design exercise. The game does not verify image coverage, sensor access, or event evolution.`
      : `Use this JPL-listed close approach as context for a notional small-body characterization design exercise. This game does not calculate an asteroid intercept, trajectory, or launch window.`
  const measurements = event.measurements.map(({ label, value, unit, uncertainty }) =>
    `${label}: ${value}${unit ? ` ${unit}` : ''}${uncertainty === undefined || uncertainty === null ? '' : ` (uncertainty ${uncertainty}${unit ? ` ${unit}` : ''})`}`,
  )
  const sourceDate = !event.eventTime
    ? 'not reported'
    : event.eventTimeScale === 'TDB'
      ? `${event.eventTime.replace('T', ' ')} TDB`
      : new Date(event.eventTime).toLocaleString('en-US', { timeZone: 'UTC', timeZoneName: 'short' })
  const eonetDetails = event.provider === 'eonet'
    ? [
        ...(event.categories ?? []).map((category) => `EONET category: ${category.title}.`),
        ...(event.geometries ?? []).slice(-3).map((geometry) =>
          geometry.coordinates && geometry.coordinates.length >= 2
            ? `Reported ${geometry.type ?? 'point'} geometry: longitude ${geometry.coordinates[0]}, latitude ${geometry.coordinates[1]} degrees.`
            : geometry.bounds
              ? `Reported ${geometry.type ?? 'area'} bounds (west, south, east, north): ${geometry.bounds.join(', ')} degrees.`
            : `Reported ${geometry.type ?? 'area'} geometry is included in the saved event snapshot.`,
        ),
      ]
    : []
  return {
    id: `event-${event.provider}-${hashEventId(event.providerEventId)}`,
    level,
    title: `Live Event Exercise: ${event.title}`,
    missionName: goalName,
    difficulty: briefingDifficultyByProvider[event.provider],
    scenario,
    dialogueStages: [
      `Mission Control: this exercise is based on ${event.providerLabel} record "${event.title}" (${sourceDate}).`,
      'Configure a spacecraft for the selected engineering requirements. Live data supplies the exercise context; all mission outcomes and scores remain simulated.',
    ],
    objectives: [
      `Primary objective: complete the ${goalName.toLowerCase()} design exercise.`,
      ...measurements,
      ...eonetDetails,
      `Source: ${event.providerLabel}. Event facts were captured when this exercise was created and will not change if the live feed changes.`,
      'No event-specific sensing, intercept, weather effects, or orbital access are simulated unless explicitly listed by the game requirements.',
    ],
    avatarPath: '/models/advanced-crew-escape-suit.glb',
    sourceUrl: event.sourceUrl,
    sourceLabel: event.providerLabel,
    nasaImageQuery: event.provider === 'eonet'
      ? 'NASA Earth observation satellite'
      : event.provider === 'jpl'
        ? 'NASA asteroid spacecraft'
        : 'NASA space weather satellite',
  }
}

export function createEventCampaignMission(event: RealTimeEvent): CampaignMission {
  if (!isRealTimeEvent(event) || !event.eligible ||
      !isAllowedSourceUrl(event.provider, event.sourceUrl)) {
    throw new Error('This live event is not eligible for a verified, playable mission exercise.')
  }
  const provider = event.provider
  const missionGoalId = eventGoalByProvider[provider]
  const id = `event-${provider}-${hashEventId(event.providerEventId)}`
  const eventProvenance: EventMissionProvenance = {
    provider,
    providerEventId: event.providerEventId.slice(0, 160),
    category: event.category,
    title: event.title.slice(0, 240),
    description: event.description?.slice(0, 12_000) ?? null,
    eventTime: event.eventTime,
    eventTimeScale: event.eventTimeScale,
    retrievedAt: event.retrievedAt,
    status: event.status.slice(0, 80),
    sourceUrl: event.sourceUrl,
    providerLabel: event.providerLabel,
    categories: (event.categories ?? []).slice(0, 10).map(({ id, title }) => ({
      id: id.slice(0, 80),
      title: title.slice(0, 120),
    })),
    geometries: (event.geometries ?? []).slice(-100).map((geometry) => ({
      date: geometry.date,
      type: geometry.type,
      coordinates: geometry.coordinates,
      bounds: geometry.bounds,
      hasCoordinates: geometry.hasCoordinates,
      magnitudeValue: geometry.magnitudeValue,
      magnitudeUnit: geometry.magnitudeUnit,
    })),
    sourceReferences: (event.sources ?? []).slice(0, 10).map((source) => ({
      id: source.id?.slice(0, 80) ?? null,
      url: source.url,
    })),
    measurements: event.measurements.slice(0, 20).map((measurement) => ({
      label: measurement.label.slice(0, 120),
      value: measurement.value,
      unit: measurement.unit?.slice(0, 30) ?? null,
      ...(measurement.uncertainty === undefined ? {} : { uncertainty: measurement.uncertainty }),
    })),
    sourceFieldsUsed: [...new Set(event.sourceFieldsUsed)].slice(0, 30),
    uncertainty: event.uncertainty ? { ...event.uncertainty } : null,
    limitations: provider === 'noaa'
      ? ['The alert informs a design exercise only; no alert-specific spacecraft effects or predictions are simulated.']
      : provider === 'eonet'
        ? ['The feed location does not establish spacecraft observation access; no image coverage or event tracking is simulated.']
        : ['The listed close approach is not an intercept opportunity. The game computes no asteroid orbit, intercept, or launch window.'],
  }
  const level = 100
  const goal = missionGoals.find((candidate) => candidate.id === missionGoalId)
  if (!goal) throw new Error(`The ${provider} exercise goal is not configured.`)
  const briefing = toBriefing(event, goal.name, level)
  return {
    id,
    level,
    title: event.title,
    summary: `Design exercise based on a ${event.providerLabel} record. Mission results remain simulated.`,
    category: eventCategoryByProvider[provider],
    estimatedDuration: 'Engineering design exercise',
    recommendedInstrumentType: provider === 'eonet' ? 'camera' : provider === 'jpl' ? 'spectrometer' : 'camera',
    difficulty: eventDifficultyByProvider[provider],
    destination: goal.destination,
    objective: goal.description,
    briefing,
    missionGoalId,
    requiresMissionIds: [],
    scoring: {
      primaryObjective: 40,
      engineeringCompliance: 20,
      budgetEfficiency: 15,
      resourceEfficiency: 10,
      sciencePerformance: 10,
      optionalObjectives: 5,
    },
    scienceTarget: provider === 'jpl' ? 64 : 55,
    optionalObjective: { label: 'Reach 75% resource efficiency', resourceEfficiencyTarget: 75 },
    eventProvenance,
  }
}

export function getEventCampaignMissionId(event: RealTimeEvent): string {
  return `event-${event.provider}-${hashEventId(event.providerEventId)}`
}

export function isStoredEventCampaignMission(value: unknown): value is CampaignMission {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const mission = value as Partial<CampaignMission>
  const provenance = mission.eventProvenance
  if (!provenance || !eventProviders.includes(provenance.provider) ||
      typeof provenance.providerEventId !== 'string' ||
      provenance.providerEventId.length < 1 ||
      provenance.providerEventId.length > 160) return false
  const expectedId = `event-${provenance.provider}-${hashEventId(provenance.providerEventId)}`
  const sourceUrlValid = typeof provenance.sourceUrl === 'string' &&
    isAllowedSourceUrl(provenance.provider, provenance.sourceUrl)
  return (
    mission.id === expectedId &&
    mission.missionGoalId === eventGoalByProvider[provenance.provider] &&
    mission.category === eventCategoryByProvider[provenance.provider] &&
    mission.difficulty === eventDifficultyByProvider[provenance.provider] &&
    mission.requiresMissionIds?.length === 0 &&
    typeof mission.title === 'string' &&
    mission.title.length <= 240 &&
    typeof mission.summary === 'string' &&
    mission.summary.length <= 2000 &&
    typeof mission.level === 'number' &&
    Number.isInteger(mission.level) &&
    typeof mission.scienceTarget === 'number' &&
    Number.isFinite(mission.scienceTarget) &&
    !!mission.briefing &&
    mission.briefing.id === expectedId &&
    Array.isArray(mission.briefing.objectives) &&
    typeof provenance.providerEventId === 'string' &&
    provenance.providerEventId.length <= 160 &&
    typeof provenance.title === 'string' &&
    provenance.title.length <= 240 &&
    (provenance.description === null || (typeof provenance.description === 'string' && provenance.description.length <= 12_000)) &&
    validStoredTimestamp(provenance.eventTime) &&
    (provenance.eventTimeScale === 'UTC' || provenance.eventTimeScale === 'TDB') &&
    typeof provenance.retrievedAt === 'string' &&
    Number.isFinite(Date.parse(provenance.retrievedAt)) &&
    typeof provenance.providerLabel === 'string' &&
    typeof provenance.status === 'string' &&
    provenance.status.length <= 80 &&
    sourceUrlValid &&
    Array.isArray(provenance.categories) &&
    provenance.categories.length <= 10 &&
    provenance.categories.every((category) =>
      !!category && typeof category.id === 'string' && category.id.length <= 80 &&
      typeof category.title === 'string' && category.title.length <= 120,
    ) &&
    Array.isArray(provenance.geometries) &&
    provenance.geometries.length <= 100 &&
    provenance.geometries.every((geometry) =>
      !!geometry &&
      validStoredTimestamp(geometry.date) &&
      (geometry.type === null || typeof geometry.type === 'string') &&
      (geometry.bounds === null || (
        Array.isArray(geometry.bounds) &&
        geometry.bounds.length === 4 &&
        geometry.bounds.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
      )) &&
      (geometry.coordinates === null || (
        Array.isArray(geometry.coordinates) &&
        geometry.coordinates.length <= 8 &&
        geometry.coordinates.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate))
      )) &&
      typeof geometry.hasCoordinates === 'boolean' &&
      (geometry.magnitudeValue === null || (typeof geometry.magnitudeValue === 'number' && Number.isFinite(geometry.magnitudeValue))) &&
      (geometry.magnitudeUnit === null || typeof geometry.magnitudeUnit === 'string'),
    ) &&
    Array.isArray(provenance.sourceReferences) &&
    provenance.sourceReferences.length <= 10 &&
    provenance.sourceReferences.every((source) =>
      !!source &&
      (source.id === null || typeof source.id === 'string') &&
      typeof source.url === 'string' &&
      isAllowedProviderReference(source.url),
    ) &&
    (provenance.uncertainty === null || (
      !!provenance.uncertainty &&
      [provenance.uncertainty.distanceMinimumAu, provenance.uncertainty.distanceMaximumAu,
        provenance.uncertainty.diameterSigmaKm].every((number) =>
        number === null || (typeof number === 'number' && Number.isFinite(number)),
      ) &&
      (provenance.uncertainty.timeSigma === null || typeof provenance.uncertainty.timeSigma === 'string')
    )) &&
    Array.isArray(provenance.measurements) &&
    provenance.measurements.length <= 20 &&
    provenance.measurements.every((measurement) =>
      !!measurement &&
      typeof measurement.label === 'string' &&
      measurement.label.length <= 120 &&
      typeof measurement.value === 'number' &&
      Number.isFinite(measurement.value) &&
      (measurement.unit === null || typeof measurement.unit === 'string') &&
      (measurement.uncertainty === undefined || measurement.uncertainty === null ||
        (typeof measurement.uncertainty === 'number' && Number.isFinite(measurement.uncertainty))),
    ) &&
    Array.isArray(provenance.sourceFieldsUsed) &&
    provenance.sourceFieldsUsed.length <= 30 &&
    provenance.sourceFieldsUsed.every((field) => typeof field === 'string') &&
    Array.isArray(provenance.limitations) &&
    provenance.limitations.length > 0 &&
    provenance.limitations.every((limitation) => typeof limitation === 'string')
  )
}

function validStoredTimestamp(value: string | null | undefined) {
  return value === null || value === undefined || (typeof value === 'string' && Number.isFinite(Date.parse(value)))
}
