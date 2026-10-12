import { describe, expect, it, vi } from 'vitest'
import {
  createEventCampaignMission,
  fetchRealTimeEvents,
  filterRealTimeEvents,
  getEventCampaignMissionId,
  isStoredEventCampaignMission,
  type RealTimeEvent,
  type RealTimeEventsResponse,
} from './realTimeEvents'
import { campaignMissions, getCampaignMissionGoal, resolveCampaignMission } from './campaign'
import { destinations } from './spacecraft'
import { instrumentOptions } from './spacecraftBuild'

const eventBase: Omit<RealTimeEvent, 'id' | 'provider' | 'providerLabel' | 'providerEventId' | 'category' | 'title' | 'sourceUrl'> = {
  description: 'Provider-published event context.',
  eventTime: '2026-10-12T11:00:00.000Z',
  eventTimeScale: 'UTC',
  status: 'published',
  dataKind: 'observed-event',
  measurements: [{ label: 'Value', value: 4, unit: 'nT' }],
  eligible: true,
  ineligibleReason: null,
  sourceFieldsUsed: ['title', 'time'],
  retrievedAt: '2026-10-12T12:00:00.000Z',
}

function createEvent(provider: RealTimeEvent['provider'], providerEventId: string): RealTimeEvent {
  const specifics = {
    noaa: {
      providerLabel: 'NOAA Space Weather Prediction Center',
      category: 'space-weather',
      title: 'WARNING: Space weather exercise',
      sourceUrl: 'https://services.swpc.noaa.gov/products/alerts.json',
    },
    eonet: {
      providerLabel: 'NASA Earth Observatory Natural Event Tracker',
      category: 'earth-observation',
      title: 'Active wildfire',
      sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_1',
    },
    jpl: {
      providerLabel: 'NASA/JPL Small-Body Database',
      category: 'asteroid-investigation',
      title: '2026 AB close approach',
      sourceUrl: 'https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=2026%20AB',
    },
  }[provider]
  return {
    ...eventBase,
    id: `${provider}:${providerEventId}`,
    provider,
    providerEventId,
    ...specifics,
    category: specifics.category as RealTimeEvent['category'],
    ...(provider === 'jpl' ? { eventTime: '2026-10-15T12:00:00.000', eventTimeScale: 'TDB' as const } : {}),
  }
}

describe('event-driven design exercises', () => {
  it.each([
    ['noaa', 'WARNING-1', 'space-weather-readiness', 'Space weather'],
    ['eonet', 'EONET_1', 'climate-sentinel', 'Earth observation'],
    ['jpl', '2026 AB::2026-10-15T12:00:00.000', 'asteroid-observation-planning', 'Asteroid investigation'],
  ] as const)('creates a stable playable %s exercise using the existing campaign engine', (provider, eventId, goalId, category) => {
    const event = createEvent(provider, eventId)
    const mission = createEventCampaignMission(event)
    expect(getEventCampaignMissionId(event)).toBe(mission.id)
    expect(createEventCampaignMission(event)).toEqual(mission)
    expect(mission.missionGoalId).toBe(goalId)
    expect(mission.category).toBe(category)
    expect(mission.requiresMissionIds).toEqual([])
    expect(getCampaignMissionGoal(mission).requirements.maxBudget).toBeGreaterThan(0)
    expect(destinations.some((destination) => destination.id === getCampaignMissionGoal(mission).destinationId)).toBe(true)
    expect(instrumentOptions[mission.recommendedInstrumentType]).toBeDefined()
    expect(Object.values(mission.scoring).reduce((sum, score) => sum + score, 0)).toBe(100)
    expect(mission.briefing.objectives.join(' ')).toContain('Source:')
    expect(isStoredEventCampaignMission(mission)).toBe(true)
  })

  it('does not create a mission from ineligible or untrusted event data', () => {
    expect(() => createEventCampaignMission({ ...createEvent('eonet', 'EONET_2'), eligible: false }))
      .toThrow(/not eligible/i)
    expect(() => createEventCampaignMission({ ...createEvent('jpl', 'asteroid'), sourceUrl: 'https://attacker.example/' }))
      .toThrow(/not eligible/i)
  })

  it('accepts normalized JPL links and EONET events with up to twenty measurements', async () => {
    const timestamp = '2026-10-12T12:00:00.000Z'
    const eonetEvent = createEvent('eonet', 'EONET_many-measurements')
    eonetEvent.measurements = Array.from({ length: 20 }, (_, index) => ({
      label: `Magnitude ${index + 1}`,
      value: index + 1,
      unit: 'km',
    }))
    const response: RealTimeEventsResponse = {
      retrievedAt: timestamp,
      events: [
        eonetEvent,
        createEvent('jpl', '2026 AB::2026-10-15T12:00:00.000'),
      ],
      providers: {
        noaa: { provider: 'noaa', status: 'live', lastSuccessfulRequestAt: timestamp },
        eonet: { provider: 'eonet', status: 'live', lastSuccessfulRequestAt: timestamp },
        jpl: { provider: 'jpl', status: 'live', lastSuccessfulRequestAt: timestamp },
      },
    }
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(response), {
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await expect(fetchRealTimeEvents()).resolves.toEqual(response)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('resolves the generated snapshot through campaign selection without unlocking other flights', () => {
    const mission = createEventCampaignMission(createEvent('noaa', 'WARNING-2'))
    const allMissions = [...campaignMissions, mission]
    expect(resolveCampaignMission(mission.id, [], false, allMissions)).toEqual(mission)
    expect(() => resolveCampaignMission(campaignMissions[2].id, [], false, allMissions))
      .toThrow(/locked until/)
  })

  it('makes the simulated asteroid limitation explicit in the game mission', () => {
    const mission = createEventCampaignMission(createEvent('jpl', '2026 AB::2026-10-15T12:00:00.000'))
    expect(mission.briefing.scenario).toContain('does not calculate an asteroid intercept')
    expect(getCampaignMissionGoal(mission).destinationId).toBe('asteroid-planning')
    expect(destinations.find((destination) => destination.id === 'asteroid-planning')?.transfer)
      .toContain('No intercept')
  })

  it('filters provider/category/search results without changing the source list', () => {
    const events = [
      createEvent('noaa', 'WARNING-1'),
      createEvent('eonet', 'EONET_1'),
      createEvent('jpl', '2026 AB::2026-10-15T12:00:00.000'),
    ]
    expect(filterRealTimeEvents(events, 'asteroid-investigation', 'all', '').map((event) => event.provider))
      .toEqual(['jpl'])
    expect(filterRealTimeEvents(events, 'all', 'eonet', 'wildfire').map((event) => event.providerEventId))
      .toEqual(['EONET_1'])
    expect(filterRealTimeEvents(events, 'all', 'all', '').length).toBe(3)
    expect(events).toHaveLength(3)
  })
})
