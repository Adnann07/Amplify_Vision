export interface LaunchVehicleSpec {
  id: string
  name: string
  payloadCapacityKg: number
  launchCostMillions: number
  accent: string
  visualHeight: number
}

export const launchVehicles: LaunchVehicleSpec[] = [
  {
    id: 'small-launcher',
    name: 'Small Launcher',
    payloadCapacityKg: 1500,
    launchCostMillions: 60,
    accent: '#38bdf8',
    visualHeight: 104,
  },
  {
    id: 'medium-launcher',
    name: 'Medium Launcher',
    payloadCapacityKg: 5000,
    launchCostMillions: 100,
    accent: '#a78bfa',
    visualHeight: 124,
  },
  {
    id: 'heavy-launcher',
    name: 'Heavy Launcher',
    payloadCapacityKg: 15000,
    launchCostMillions: 180,
    accent: '#34d399',
    visualHeight: 144,
  },
]

export interface LaunchRecord {
  missionName: string
  destination: string
  spacecraftName: string
  spacecraftMassKg: number
  existingMissionCostMillions: number
  launchVehicle: LaunchVehicleSpec
  totalMissionCostMillions: number
  missionBudgetMillions: number
}
