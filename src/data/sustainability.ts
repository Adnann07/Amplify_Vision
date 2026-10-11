export type PropulsionLifecycle = 'disposable' | 'reusable'
export type SpacecraftArchitecture = 'integrated' | 'modular'
export type SparePartsPolicy = 'minimal' | 'spares'
export type EndOfLifeStrategy = 'controlledDeorbit' | 'leaveInOrbit'
export type SustainabilityLevel = 'High' | 'Medium' | 'Low'

export interface SustainabilityChoices {
  propulsionLifecycle: PropulsionLifecycle
  architecture: SpacecraftArchitecture
  spareParts: SparePartsPolicy
  endOfLife: EndOfLifeStrategy
}

export interface SustainabilityAssessment {
  reusability: number
  repairability: number
  resourceEfficiency: number
  endOfLifePlanning: number
  level: SustainabilityLevel
  explanation: string
}

export const defaultSustainabilityChoices: SustainabilityChoices = {
  propulsionLifecycle: 'disposable',
  architecture: 'integrated',
  spareParts: 'minimal',
  endOfLife: 'leaveInOrbit',
}

export function assessSustainability(
  choices: SustainabilityChoices,
  isEarthOrbitMission: boolean,
): SustainabilityAssessment {
  const reusability =
    (choices.propulsionLifecycle === 'reusable' ? 80 : 20) +
    (choices.architecture === 'modular' ? 15 : 0) +
    (choices.spareParts === 'spares' ? 5 : 0)
  const repairability =
    20 +
    (choices.architecture === 'modular' ? 50 : 0) +
    (choices.spareParts === 'spares' ? 30 : 0)
  const resourceEfficiency =
    65 +
    (choices.propulsionLifecycle === 'reusable' ? 15 : 0) +
    (choices.architecture === 'modular' ? 8 : 0) +
    (choices.spareParts === 'spares' ? 4 : 0) -
    (isEarthOrbitMission && choices.endOfLife === 'controlledDeorbit' ? 5 : 0)
  const endOfLifePlanning = !isEarthOrbitMission
    ? 65
    : choices.endOfLife === 'controlledDeorbit'
      ? 100
      : 20
  const rating =
    (reusability + repairability + resourceEfficiency + endOfLifePlanning) / 4
  const level: SustainabilityLevel = rating >= 75 ? 'High' : rating >= 50 ? 'Medium' : 'Low'

  const explanationParts = [
    choices.propulsionLifecycle === 'reusable'
      ? 'Reusable propulsion supports future flights.'
      : 'Disposable propulsion keeps this flight lighter and cheaper but cannot be reflown.',
    choices.architecture === 'modular'
      ? 'Modular construction makes repairs and upgrades easier.'
      : 'Integrated construction saves mass and cost but is harder to repair.',
    choices.spareParts === 'spares'
      ? 'Spare components improve repairability at extra mass and cost.'
      : 'Minimal spares save mass and cost but leave fewer repair options.',
  ]

  if (isEarthOrbitMission) {
    explanationParts.push(
      choices.endOfLife === 'controlledDeorbit'
        ? 'Controlled deorbit reduces the spacecraft’s orbital debris risk.'
        : 'Leaving the spacecraft in orbit is cheaper but increases debris risk.',
    )
  } else {
    explanationParts.push('Earth-orbit end-of-life planning does not apply to this mission.')
  }

  return {
    reusability,
    repairability,
    resourceEfficiency: Math.min(100, resourceEfficiency),
    endOfLifePlanning,
    level,
    explanation: explanationParts.join(' '),
  }
}
