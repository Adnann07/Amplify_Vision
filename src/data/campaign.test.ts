import { describe, expect, it } from 'vitest'
import {
  campaignMissions,
  filterCampaignMissions,
  getCampaignMissionGoal,
  isCampaignMissionUnlocked,
  resolveCampaignMission,
} from './campaign'
import { destinations } from './spacecraft'
import { instrumentOptions } from './spacecraftBuild'

describe('campaign mission catalogue', () => {
  it('contains at least 12 unique, playable templates backed by existing goals and destinations', () => {
    expect(campaignMissions.length).toBeGreaterThanOrEqual(12)
    expect(new Set(campaignMissions.map((mission) => mission.id)).size).toBe(campaignMissions.length)
    expect(new Set(campaignMissions.map((mission) => mission.missionGoalId)).size).toBe(campaignMissions.length)
    for (const mission of campaignMissions) {
      const goal = getCampaignMissionGoal(mission)
      expect(destinations.some((destination) => destination.id === goal.destinationId)).toBe(true)
      expect(mission.briefing.id).toBe(goal.id)
      expect(mission.briefing.title).toContain(mission.title)
      expect(mission.briefing.objectives.length).toBeGreaterThanOrEqual(4)
      expect(mission.estimatedDuration).not.toBe('')
      expect(instrumentOptions[mission.recommendedInstrumentType]).toBeDefined()
      expect(goal.requirements.maxBudget).toBeGreaterThan(0)
      expect(Object.values(mission.scoring).reduce((sum, score) => sum + score, 0)).toBe(100)
    }
  })

  it('preserves original mission IDs and establishes a prerequisite for every later flight', () => {
    expect(campaignMissions.slice(0, 2).map((mission) => mission.id)).toEqual(['first-flight', 'lunar-survey'])
    expect(campaignMissions[0].requiresMissionIds).toEqual([])
    for (let index = 1; index < campaignMissions.length; index++) {
      expect(campaignMissions[index].requiresMissionIds).toEqual([campaignMissions[index - 1].id])
      expect(isCampaignMissionUnlocked(campaignMissions[index], [])).toBe(false)
      expect(isCampaignMissionUnlocked(campaignMissions[index], [campaignMissions[index - 1].id])).toBe(true)
    }
    expect(isCampaignMissionUnlocked(campaignMissions.at(-1)!, [], true)).toBe(true)
    expect(campaignMissions.filter((mission) => isCampaignMissionUnlocked(mission, []))).toHaveLength(1)
    expect(campaignMissions.filter((mission) => !isCampaignMissionUnlocked(mission, []))).toHaveLength(19)
  })

  it('filters by category, difficulty, and searchable mission fields without mutating the full catalogue', () => {
    const originalIds = campaignMissions.map((mission) => mission.id)
    expect(filterCampaignMissions(campaignMissions, {
      category: 'Lunar exploration',
      difficulty: 'All',
      search: '',
    }).map((mission) => mission.id)).toEqual([
      'lunar-survey',
      'lunar-polar-mapper',
      'lunar-resource-survey',
      'orion-crew-safe-lunar',
    ])
    expect(filterCampaignMissions(campaignMissions, {
      category: 'All',
      difficulty: 'Challenging',
      search: 'mars',
    }).map((mission) => mission.id)).toEqual([
      'mars-atmosphere',
      'mars-surface-imager',
      'perseverance-jezero-science',
    ])
    expect(filterCampaignMissions(campaignMissions, {
      category: 'All',
      difficulty: 'All',
      search: '  telescope ',
    }).map((mission) => mission.id)).toEqual(['space-telescope'])
    expect(filterCampaignMissions(campaignMissions, { category: 'All', difficulty: 'All', search: '' }))
      .toHaveLength(campaignMissions.length)
    expect(campaignMissions.map((mission) => mission.id)).toEqual(originalIds)
  })

  it('adds six spacecraft-specific exercises without claiming unsupported mission operations', () => {
    const addedIds = [
      'orion-crew-safe-lunar',
      'perseverance-jezero-science',
      'osiris-bennu-sample-return',
      'psyche-deep-space-study',
      'lucy-trojan-flyby',
      'landsat9-land-imaging',
    ]
    const additions = campaignMissions.filter((mission) => addedIds.includes(mission.id))

    expect(additions).toHaveLength(6)
    expect(additions.map((mission) => mission.recommendedSpacecraftId)).toEqual([
      'orion',
      'perseverance',
      'osiris-rex',
      'psyche',
      'lucy',
      'landsat-9',
    ])
    expect(additions.every((mission) => mission.briefing.sourceUrl.startsWith('https://'))).toBe(true)
    expect(additions.every((mission) => mission.briefing.objectives.length >= 6)).toBe(true)
    expect(additions.filter((mission) => mission.planningOnly)).toHaveLength(3)
    expect(additions.find((mission) => mission.id === 'orion-crew-safe-lunar')?.briefing.objectives.join(' '))
      .toContain('not a lunar lander')
    expect(additions.find((mission) => mission.id === 'lucy-trojan-flyby')?.briefing.objectives.join(' '))
      .toContain('flybys')
    expect(additions.find((mission) => mission.id === 'osiris-bennu-sample-return')?.briefing.objectives.join(' '))
      .toContain('delivered it in 2023')
  })

  it('resolves each unlocked selection to its own briefing and mission requirements', () => {
    for (const mission of campaignMissions) {
      expect(resolveCampaignMission(mission.id, [], true)).toMatchObject({
        id: mission.id,
        briefing: mission.briefing,
        missionGoalId: mission.missionGoalId,
      })
      expect(getCampaignMissionGoal(resolveCampaignMission(mission.id, [], true)).id).toBe(mission.missionGoalId)
    }
    expect(() => resolveCampaignMission(campaignMissions[2].id, [])).toThrow(/locked until/)
    expect(() => resolveCampaignMission('unknown-mission', [], true)).toThrow(/Unknown campaign mission/)
  })
})
