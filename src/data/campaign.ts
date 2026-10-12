import { earthObservationBriefing, type MissionBriefing } from './missionBriefing'
import { missionGoals, type MissionGoal } from './missionGoals'

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
  },
]

export function getCampaignMissionGoal(mission: CampaignMission): MissionGoal {
  const goal = missionGoals.find((candidate) => candidate.id === mission.missionGoalId)
  if (!goal) {
    throw new Error(`Campaign mission "${mission.id}" references unknown mission goal "${mission.missionGoalId}".`)
  }
  return goal
}

export const upcomingCampaignLevels = [
  {
    level: 2,
    title: 'Mass & Payload',
    summary: 'Compare spacecraft mass with launch vehicle capacity.',
  },
  {
    level: 3,
    title: 'Budget Trade-offs',
    summary: 'Balance launch cost against mission capability.',
  },
]
