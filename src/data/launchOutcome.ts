import type { LaunchVehicleSpec } from './launchVehicles'

export interface LaunchAssessment {
  riskLevel: 'Low' | 'Moderate' | 'High'
  riskScore: number
  outcome: 'success' | 'failure'
  failureTitle: string | null
  failureCause: string | null
  failureParameter: string | null
  failureActual: string | null
  failureExpected: string | null
  suggestedChange: string | null
  commanderMessage: string | null
}

export function assessLaunchOutcome(
  spacecraftMassKg: number,
  spacecraftReliability: number,
  vehicle: LaunchVehicleSpec,
): LaunchAssessment {
  const excessMassKg = Math.max(0, spacecraftMassKg - vehicle.payloadCapacityKg)
  const overloadRatio = excessMassKg / vehicle.payloadCapacityKg
  let riskScore = 0

  if (excessMassKg > 0) {
    riskScore += overloadRatio >= 0.25 ? 70 : 45
  }
  if (spacecraftReliability < 60) {
    riskScore += spacecraftReliability < 45 ? 60 : 18
  }

  const riskLevel = riskScore >= 45 ? 'High' : riskScore >= 20 ? 'Moderate' : 'Low'
  const outcome = riskScore >= 60 ? 'failure' : 'success'

  if (outcome === 'success') {
    return {
      riskLevel,
      riskScore,
      outcome,
      failureTitle: null,
      failureCause: null,
      failureParameter: null,
      failureActual: null,
      failureExpected: null,
      suggestedChange: null,
      commanderMessage: null,
    }
  }

  if (excessMassKg > 0) {
    return {
      riskLevel,
      riskScore,
      outcome,
      failureTitle: 'PAYLOAD OVERLOAD',
      failureCause: `The spacecraft exceeded ${vehicle.name}'s rated payload capacity during ascent.`,
      failureParameter: 'Spacecraft mass',
      failureActual: `${spacecraftMassKg.toLocaleString()} kg`,
      failureExpected: `At most ${vehicle.payloadCapacityKg.toLocaleString()} kg`,
      suggestedChange: 'Reduce the spacecraft mass or select a more capable rocket.',
      commanderMessage:
        "We exceeded the launch vehicle's payload capacity. Reduce the spacecraft's mass or select a more capable rocket.",
    }
  }

  return {
    riskLevel,
    riskScore,
    outcome,
    failureTitle: 'SPACECRAFT RELIABILITY FAILURE',
    failureCause: 'A critical spacecraft reliability fault disrupted vehicle control during ascent.',
    failureParameter: 'Spacecraft reliability',
    failureActual: `${spacecraftReliability}%`,
    failureExpected: 'At least 45%',
    suggestedChange: 'Improve spacecraft reliability with a sturdier design and added spare parts.',
    commanderMessage:
      'A critical spacecraft fault disrupted ascent control. Improve spacecraft reliability and review the design before retrying.',
  }
}
