import { earthObservationBriefing, lunarSurveyBriefing, type MissionBriefing } from './missionBriefing'
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

export interface CampaignMission {
  id: string
  level: number
  title: string
  summary: string
  difficulty: 'Introductory' | 'Easy' | 'Moderate' | 'Challenging'
  destination: string
  objective: string
  briefing: MissionBriefing
  missionGoalId: string
  requiresMissionIds: string[]
  scoring: CampaignScoringWeights
  scienceTarget: number
  requiredInstrumentType?: InstrumentType
  optionalObjective: {
    label: string
    resourceEfficiencyTarget: number
  }
}

const standardScoring: CampaignScoringWeights = {
  primaryObjective: 40,
  engineeringCompliance: 20,
  budgetEfficiency: 15,
  resourceEfficiency: 10,
  sciencePerformance: 10,
  optionalObjectives: 5,
}

export const campaignMissions: CampaignMission[] = [
  {
    id: 'first-flight',
    level: 1,
    title: 'First Flight',
    summary: 'Place a compact Earth-observation spacecraft into low Earth orbit.',
    difficulty: 'Introductory',
    destination: 'Earth orbit',
    objective: 'Deploy an imaging spacecraft that can collect and relay Earth-observation data.',
    briefing: earthObservationBriefing,
    missionGoalId: 'earth-observation',
    requiresMissionIds: [],
    scoring: { ...standardScoring },
    scienceTarget: 36,
    requiredInstrumentType: 'camera',
    optionalObjective: {
      label: 'Reach 75% resource efficiency',
      resourceEfficiencyTarget: 75,
    },
  },
  {
    id: 'lunar-survey',
    level: 2,
    title: 'Lunar Survey',
    summary: 'Configure a two-instrument spacecraft for a lunar terrain survey.',
    difficulty: 'Moderate',
    destination: 'Moon',
    objective: 'Deliver a survey-ready spacecraft with the power, propulsion, communications, and instruments required for lunar reconnaissance.',
    briefing: lunarSurveyBriefing,
    missionGoalId: 'lunar-survey',
    requiresMissionIds: ['first-flight'],
    scoring: { ...standardScoring },
    scienceTarget: 48,
    optionalObjective: {
      label: 'Reach 75% resource efficiency',
      resourceEfficiencyTarget: 75,
    },
  },
]

export function getCampaignMissionGoal(mission: CampaignMission): MissionGoal {
  const goal = missionGoals.find((candidate) => candidate.id === mission.missionGoalId)
  if (!goal) {
    throw new Error(`Campaign mission "${mission.id}" references unknown mission goal "${mission.missionGoalId}".`)
  }
  return goal
}
