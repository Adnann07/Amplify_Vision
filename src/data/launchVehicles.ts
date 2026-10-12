import type { MissionRequirementResult } from './missionGoals'
import type { InstrumentType } from './spacecraftBuild'
import type { HorizonsPosition } from './horizonsService'
import type { PreliminaryTransferEstimate } from './missionPlanner'
import type { SpacecraftModel } from './spacecraft'
import type { SpacecraftBuild } from './spacecraftBuild'

export interface LaunchVehicleModel {
  format: 'stl'
  modelPath: string
  sourceUrl: string
}

export interface LaunchVehicleSpec {
  id: string
  name: string
  visualClass: 'small' | 'medium' | 'heavy'
  payloadCapacityKg: number
  launchCostMillions: number
  accent: string
  model?: LaunchVehicleModel
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
    name: 'NASA SLS Block 1',
    visualClass: 'heavy',
    payloadCapacityKg: 15000,
    launchCostMillions: 180,
    accent: '#34d399',
    model: {
      format: 'stl',
      modelPath: '/models/nasa-sls-block1/SLSBlock1.stl',
      sourceUrl:
        'https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Printing/Space%20Launch%20System%20(SLS)%20Block%201',
    },
  },
]

export interface LaunchRecord {
  attemptId: number
  mode: 'mission' | 'freeplay'
  missionName: string
  destination: string
  planningSnapshot: {
    launchDate: string
    destinationBodyId: string | null
    ephemerides: HorizonsPosition[]
    transferEstimate: PreliminaryTransferEstimate | null
  }
  spacecraftName: string
  spacecraftId?: string
  spacecraftType: string
  spacecraftModel: SpacecraftModel
  spacecraftBuild?: SpacecraftBuild
  spacecraftMassKg: number
  existingMissionCostMillions: number
  launchVehicle: LaunchVehicleSpec
  totalMissionCostMillions: number
  missionBudgetMillions: number
  spacecraftReliability: number
  missionTelemetry: {
    power: number
    deltaV: number
    communication: number
    instruments: number
    instrumentType: InstrumentType
    science: number
    resourceEfficiency: number
    sustainabilityLevel: 'High' | 'Medium' | 'Low'
  }
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
