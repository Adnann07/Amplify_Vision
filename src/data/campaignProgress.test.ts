import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createEmptyCampaignProgress,
  isCampaignUnlockCode,
  loadCampaignProgress,
  saveCampaignProgress,
  unlockAllCampaignMissions,
  type CampaignProgress,
} from './campaignProgress'
import { createEventCampaignMission, type RealTimeEvent } from './realTimeEvents'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('campaign unlock code', () => {
  it('accepts only the exact four-digit access code', () => {
    expect(isCampaignUnlockCode('6767')).toBe(true)
    expect(isCampaignUnlockCode('676')).toBe(false)
    expect(isCampaignUnlockCode('67670')).toBe(false)
    expect(isCampaignUnlockCode(' 6767')).toBe(false)
  })

  it('unlocks missions without falsely marking any objective complete', () => {
    const initial = createEmptyCampaignProgress()
    const unlocked = unlockAllCampaignMissions(initial)
    expect(unlocked.allMissionsUnlocked).toBe(true)
    expect(unlocked.completedMissionIds).toEqual([])
    expect(unlocked.bestScores).toEqual({})
    expect(unlocked.attempts).toEqual([])
    expect(initial.allMissionsUnlocked).toBe(false)
  })

  it('preserves existing completed mission progress when loading the pre-catalogue save shape', () => {
    const stored = {
      version: 1,
      completedMissionIds: ['first-flight'],
      bestScores: { 'first-flight': 82 },
      attempts: [{
        id: 'first-flight-1',
        missionId: 'first-flight',
        attemptNumber: 1,
        score: 82,
        status: 'Successful',
        objectiveAchieved: true,
      }],
    }
    vi.stubGlobal('window', {
      localStorage: { getItem: () => JSON.stringify(stored) },
    })
    const loaded = loadCampaignProgress()
    expect(loaded.warning).toBeNull()
    expect(loaded.progress).toMatchObject({
      completedMissionIds: ['first-flight'],
      bestScores: { 'first-flight': 82 },
      attempts: stored.attempts,
      allMissionsUnlocked: false,
    })
  })

  it('persists event mission snapshots and accepts their completion records without losing static progress', () => {
      const values = new Map<string, string>()
      vi.stubGlobal('window', {
        localStorage: {
          getItem: (key: string) => values.get(key) ?? null,
          setItem: (key: string, value: string) => values.set(key, value),
        },
      })
      const event: RealTimeEvent = {
        id: 'eonet:EONET_25094',
        provider: 'eonet',
        providerLabel: 'NASA Earth Observatory Natural Event Tracker',
        providerEventId: 'EONET_25094',
        category: 'earth-observation',
        title: 'Wildfire observation exercise',
        description: 'A source-backed example.',
        eventTime: '2026-10-12T10:00:00.000Z',
        eventTimeScale: 'UTC',
        sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_25094',
        status: 'active',
        dataKind: 'observed-event',
        measurements: [],
        eligible: true,
        ineligibleReason: null,
        sourceFieldsUsed: ['id', 'title', 'geometry'],
        retrievedAt: '2026-10-12T12:00:00.000Z',
      }
      const mission = createEventCampaignMission(event)
      const initial = createEmptyCampaignProgress()
      const progress: CampaignProgress = {
        ...initial,
        completedMissionIds: ['first-flight', mission.id],
        bestScores: { 'first-flight': 82, [mission.id]: 91 },
        attempts: [{
          id: `${mission.id}-1`,
          missionId: mission.id,
          attemptNumber: 1,
          score: 91,
          status: 'Successful',
          objectiveAchieved: true,
        }],
        eventMissions: [mission],
      }
      expect(saveCampaignProgress(progress)).toBeNull()
      const loaded = loadCampaignProgress()
      expect(loaded.warning).toBeNull()
      expect(loaded.progress.eventMissions).toEqual([mission])
      expect(loaded.progress.completedMissionIds).toEqual(['first-flight', mission.id])
      expect(loaded.progress.bestScores[mission.id]).toBe(91)
      expect(loaded.progress.attempts[0].missionId).toBe(mission.id)
  })

  it('drops only malformed event snapshots and their dependent event progress', () => {
      const mission = createEventCampaignMission({
        id: 'eonet:EONET_BAD',
        provider: 'eonet',
        providerLabel: 'NASA Earth Observatory Natural Event Tracker',
        providerEventId: 'EONET_BAD',
        category: 'earth-observation',
        title: 'Malformed snapshot test',
        description: null,
        eventTime: null,
        eventTimeScale: 'UTC',
        sourceUrl: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_BAD',
        status: 'active',
        dataKind: 'observed-event',
        measurements: [],
        eligible: true,
        ineligibleReason: null,
        sourceFieldsUsed: ['id'],
        retrievedAt: '2026-10-12T12:00:00.000Z',
      })
      const corruptMission = {
        ...mission,
        eventProvenance: { ...mission.eventProvenance!, sourceUrl: 'https://attacker.example/' },
      }
      vi.stubGlobal('window', {
        localStorage: {
          getItem: () => JSON.stringify({
            version: 1,
            completedMissionIds: ['first-flight', mission.id],
            bestScores: { 'first-flight': 80, [mission.id]: 90 },
            attempts: [{
              id: `${mission.id}-1`,
              missionId: mission.id,
              attemptNumber: 1,
              score: 90,
              status: 'Successful',
              objectiveAchieved: true,
            }],
            allMissionsUnlocked: false,
            eventMissions: [corruptMission],
          }),
        },
      })
      const loaded = loadCampaignProgress()
      expect(loaded.warning).toMatch(/other campaign progress was preserved/)
      expect(loaded.progress.completedMissionIds).toEqual(['first-flight'])
      expect(loaded.progress.bestScores).toEqual({ 'first-flight': 80 })
      expect(loaded.progress.attempts).toEqual([])
  })
})
