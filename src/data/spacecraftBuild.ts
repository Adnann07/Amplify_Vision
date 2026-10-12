import type { SpacecraftSpec } from './spacecraft'
import {
  assessSustainability,
  type SustainabilityChoices,
} from './sustainability'

export type BuildComponentId = 'solarPanel' | 'antenna' | 'engine' | 'instrument'
export type SolarPanelSize = 'small' | 'medium' | 'large'
export type AntennaType = 'standard' | 'highGain' | 'deepSpace'
export type EngineType = 'chemical' | 'ion' | 'nuclear'
export type InstrumentType = 'camera' | 'spectrometer' | 'radar'

export interface SpacecraftBuild {
  components: BuildComponentId[]
  solarPanelSize: SolarPanelSize
  antennaType: AntennaType
  engineType: EngineType
  instrumentType: InstrumentType
  instrumentCount: number
}

export interface SpacecraftBuildStats {
  mass: number
  power: number
  powerDemand: number
  powerMargin: number
  deltaV: number
  communication: number
  science: number
  instrumentCount: number
  reliability: number
  resourceEfficiency: number
  sustainabilityLevel: 'High' | 'Medium' | 'Low'
  sustainabilityExplanation: string
  missionCost: number
}

export const buildComponentLabels: Record<BuildComponentId, string> = {
  solarPanel: 'Solar panel',
  antenna: 'Antenna',
  engine: 'Engine',
  instrument: 'Science instrument',
}

export const solarPanelOptions: Record<
  SolarPanelSize,
  { label: string; power: number; mass: number; cost: number; scale: number }
> = {
  small: { label: 'Small', power: 500, mass: 25, cost: 12, scale: 0.65 },
  medium: { label: 'Medium', power: 1000, mass: 55, cost: 22, scale: 1 },
  large: { label: 'Large', power: 1500, mass: 90, cost: 38, scale: 1.4 },
}

export const antennaOptions: Record<
  AntennaType,
  { label: string; communication: number; mass: number; cost: number; scale: number }
> = {
  standard: { label: 'Standard', communication: 62, mass: 18, cost: 8, scale: 0.65 },
  highGain: { label: 'High-gain dish', communication: 86, mass: 35, cost: 18, scale: 1 },
  deepSpace: { label: 'Deep-space array', communication: 97, mass: 70, cost: 42, scale: 1.4 },
}

export const engineOptions: Record<
  EngineType,
  { label: string; deltaV: number; mass: number; cost: number; scale: number }
> = {
  chemical: { label: 'Chemical', deltaV: 10, mass: 80, cost: 60, scale: 1 },
  ion: { label: 'Ion electric', deltaV: 16, mass: 110, cost: 110, scale: 1.1 },
  nuclear: { label: 'Nuclear thermal', deltaV: 21, mass: 180, cost: 220, scale: 1.25 },
}

export const instrumentOptions: Record<
  InstrumentType,
  { label: string; science: number; power: number; mass: number; cost: number; scale: number }
> = {
  camera: { label: 'Survey camera', science: 18, power: 120, mass: 12, cost: 20, scale: 0.75 },
  spectrometer: {
    label: 'Spectrometer',
    science: 34,
    power: 240,
    mass: 32,
    cost: 58,
    scale: 1,
  },
  radar: { label: 'Mapping radar', science: 52, power: 390, mass: 75, cost: 125, scale: 1.35 },
}

export function createInitialBuild(): SpacecraftBuild {
  return {
    components: [],
    solarPanelSize: 'medium',
    antennaType: 'highGain',
    engineType: 'chemical',
    instrumentType: 'camera',
    instrumentCount: 1,
  }
}

export function calculateBuildStats(
  spacecraft: SpacecraftSpec,
  build: SpacecraftBuild,
  payloadKg: number,
  fuelKg: number,
  destinationRisk: number,
  propulsionCost: number,
  sustainabilityChoices: SustainabilityChoices,
  isEarthOrbitMission: boolean,
): SpacecraftBuildStats {
  const has = (component: BuildComponentId) => build.components.includes(component)
  const panel = has('solarPanel') ? solarPanelOptions[build.solarPanelSize] : undefined
  const antenna = has('antenna') ? antennaOptions[build.antennaType] : undefined
  const engine = has('engine') ? engineOptions[build.engineType] : undefined
  const instrumentCount = has('instrument') ? build.instrumentCount : 0
  const instrument = instrumentCount > 0 ? instrumentOptions[build.instrumentType] : undefined
  const sustainability = assessSustainability(sustainabilityChoices, isEarthOrbitMission)
  const reusableMass = sustainabilityChoices.propulsionLifecycle === 'reusable' ? 120 : 0
  const modularMass = sustainabilityChoices.architecture === 'modular' ? 85 : 0
  const sparesMass = sustainabilityChoices.spareParts === 'spares' ? 55 : 0
  const deorbitMass =
    isEarthOrbitMission && sustainabilityChoices.endOfLife === 'controlledDeorbit' ? 80 : 0
  const reusableCost = sustainabilityChoices.propulsionLifecycle === 'reusable' ? 40 : 0
  const modularCost = sustainabilityChoices.architecture === 'modular' ? 28 : 0
  const sparesCost = sustainabilityChoices.spareParts === 'spares' ? 18 : 0
  const deorbitCost =
    isEarthOrbitMission && sustainabilityChoices.endOfLife === 'controlledDeorbit' ? 20 : 0
  const componentMass =
    (panel?.mass ?? 0) +
    (antenna?.mass ?? 0) +
    (engine?.mass ?? 0) +
    (instrument?.mass ?? 0) * instrumentCount
  const mass =
    spacecraft.mass +
    payloadKg +
    fuelKg +
    componentMass +
    reusableMass +
    modularMass +
    sparesMass +
    deorbitMass
  const power = panel?.power ?? 0
  const powerDemand = 220 + (antenna ? 25 : 0) + (instrument?.power ?? 0) * instrumentCount
  const deltaV = engine
    ? engine.deltaV * Math.log1p(fuelKg / Math.max(mass - fuelKg, 1)) * 0.9
    : 0
  const communication = antenna
    ? Math.max(25, Math.round(antenna.communication - Math.max(0, mass - 5000) / 1500))
    : 18
  const science = (instrument?.science ?? 0) * instrumentCount + Math.round(payloadKg / 100)
  const componentCost =
    (panel?.cost ?? 0) +
    (antenna?.cost ?? 0) +
    (engine?.cost ?? 0) +
    (instrument?.cost ?? 0) * instrumentCount
  const missionCost = Math.round(
    spacecraft.cost +
      componentCost +
      reusableCost +
      modularCost +
      sparesCost +
      deorbitCost +
      payloadKg * 0.15 +
      fuelKg * 0.08 +
      destinationRisk * 18 +
      propulsionCost * 24,
  )

  return {
    mass: Math.round(mass),
    power,
    powerDemand,
    powerMargin: power - powerDemand,
    deltaV: Math.max(0, deltaV),
    communication,
    science,
    instrumentCount,
    reliability: Math.min(
      99,
      Math.max(
        35,
        spacecraft.reliability +
          (sustainabilityChoices.propulsionLifecycle === 'reusable' ? 4 : -3) +
          (sustainabilityChoices.architecture === 'modular' ? 3 : 0) +
          (sustainabilityChoices.spareParts === 'spares' ? 7 : 0) -
          (isEarthOrbitMission && sustainabilityChoices.endOfLife === 'leaveInOrbit' ? 2 : 0),
      ),
    ),
    resourceEfficiency: sustainability.resourceEfficiency,
    sustainabilityLevel: sustainability.level,
    sustainabilityExplanation: sustainability.explanation,
    missionCost,
  }
}
