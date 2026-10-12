import type { MissionRequirementResult } from './missionGoals'

export interface LaunchVehicleSpec {
  id: string
  name: string
  visualClass: 'small' | 'medium' | 'heavy'
  payloadCapacityKg: number
  launchCostMillions: number
  accent: string
}

export const launchVehicles: LaunchVehicleSpec[] = [
  {
    id: 'small-launcher',
    name: 'Small Launcher',
    visualClass: 'small',
    payloadCapacityKg: 1500,
    launchCostMillions: 60,
    accent: '#38bdf8',
  },
  {
    id: 'medium-launcher',
    name: 'Medium Launcher',
    visualClass: 'medium',
    payloadCapacityKg: 5000,
    launchCostMillions: 100,
    accent: '#a78bfa',
  },
  {
    id: 'heavy-launcher',
    name: 'Heavy Launcher',
    visualClass: 'heavy',
    payloadCapacityKg: 15000,
    launchCostMillions: 180,
    accent: '#34d399',
  },
]

export interface LaunchRecord {
  attemptId: number
  mode: 'mission' | 'freeplay'
  missionName: string
  destination: string
  spacecraftName: string
  spacecraftMassKg: number
  existingMissionCostMillions: number
  launchVehicle: LaunchVehicleSpec
  totalMissionCostMillions: number
  missionBudgetMillions: number
  spacecraftReliability: number
  missionRequirementResults: MissionRequirementResult[]
  outcome: 'success' | 'failure'
  riskLevel: 'Low' | 'Moderate' | 'High'
  riskScore: number
  failureTitle: string | null
  failureCause: string | null
  failureParameter: string | null
  failureActual: string | null
  failureExpected: string | null
  suggestedChange: string | null
  commanderMessage: string | null
}
