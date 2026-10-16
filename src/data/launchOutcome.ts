import type { LaunchVehicleSpec } from './launchVehicles'

export interface LaunchAssessmentContext {
  destination?: string
  missionType?: 'orbital' | 'flyby' | 'lander' | 'sample-return' | 'deep-space' | 'unknown'
  availableDeltaV?: number
  requiredDeltaV?: number
  availablePowerW?: number
  requiredPowerW?: number
  availableCommunication?: number
  requiredCommunication?: number
  availableInstruments?: number
  requiredInstruments?: number
  fuelRemainingKg?: number
  requiredFuelKg?: number
  maxMassKg?: number
  trajectoryFeasible?: boolean
}

export type LaunchFailureCategory =
  | 'launch'
  | 'mission'
  | 'deployment'
  | 'communication'
  | 'power'
  | 'trajectory'
  | 'science'
  | 'system'

export interface LaunchAssessment {
  riskLevel: 'Low' | 'Moderate' | 'High'
  riskScore: number
  outcome: 'success' | 'failure'
  failureCategory: LaunchFailureCategory | null
  failureTitle: string | null
  failureCause: string | null
  failureParameter: string | null
  failureActual: string | null
  failureExpected: string | null
  suggestedChange: string | null
  commanderMessage: string | null
}

function clampRisk(value: number) {
  return Math.min(100, Math.max(0, value))
}

export function assessLaunchOutcome(
  spacecraftMassKg: number,
  spacecraftReliability: number,
  vehicle: LaunchVehicleSpec,
  context: LaunchAssessmentContext = {},
): LaunchAssessment {
  const excessMassKg = Math.max(0, spacecraftMassKg - vehicle.payloadCapacityKg)
  const overloadRatio = vehicle.payloadCapacityKg > 0 ? excessMassKg / vehicle.payloadCapacityKg : 0
  const hasMissionConfig = Object.keys(context).length > 0

  const marginIssues: Array<{ title: string; cause: string; parameter: string; actual: string; expected: string; suggestedChange: string; message: string; risk: number }> = []

  if (excessMassKg > 0) {
    marginIssues.push({
      title: 'PAYLOAD OVERLOAD',
      cause: `The spacecraft exceeded ${vehicle.name}'s payload capacity during ascent.`,
      parameter: 'Spacecraft mass',
      actual: `${spacecraftMassKg.toLocaleString()} kg`,
      expected: `At most ${vehicle.payloadCapacityKg.toLocaleString()} kg`,
      suggestedChange: 'Reduce the spacecraft mass or select a more capable rocket.',
      message: "We exceeded the launch vehicle's payload capacity. Reduce the spacecraft's mass or select a more capable rocket.",
      risk: 78 + Math.round(overloadRatio * 25),
    })
  }

  if (context.maxMassKg !== undefined && spacecraftMassKg > context.maxMassKg) {
    marginIssues.push({
      title: 'MISSION MASS LIMIT',
      cause: 'The spacecraft design exceeded the mission mass envelope required for the selected trajectory.',
      parameter: 'Mission mass',
      actual: `${spacecraftMassKg.toLocaleString()} kg`,
      expected: `At most ${context.maxMassKg.toLocaleString()} kg`,
      suggestedChange: 'Trim payload mass or use a lighter propulsion and avionics package.',
      message: 'The mission mass target was exceeded, leaving insufficient margin for the planned transfer and insertion sequence.',
      risk: 66,
    })
  }

  if (context.requiredDeltaV !== undefined && context.availableDeltaV !== undefined) {
    const deltaVShortfall = Math.max(0, context.requiredDeltaV - context.availableDeltaV)
    if (deltaVShortfall > 0) {
      marginIssues.push({
        title: 'INSUFFICIENT DELTA-V',
        cause: 'The spacecraft cannot complete the required transfer and insertion burns with its current propulsion system.',
        parameter: 'Available delta-v',
        actual: `${context.availableDeltaV.toFixed(1)} km/s`,
        expected: `At least ${context.requiredDeltaV.toFixed(1)} km/s`,
        suggestedChange: 'Increase propellant margin or switch to a higher-efficiency propulsion system.',
        message: `The spacecraft does not have enough delta-v for the ${context.destination ?? 'assigned mission'} trajectory.`,
        risk: 70 + Math.round(deltaVShortfall * 18),
      })
    }
  }

  if (context.requiredFuelKg !== undefined && context.fuelRemainingKg !== undefined) {
    const fuelShortfall = Math.max(0, context.requiredFuelKg - context.fuelRemainingKg)
    if (fuelShortfall > 0) {
      marginIssues.push({
        title: 'INSUFFICIENT PROPELLANT',
        cause: 'Fuel reserves are too low to finish the required delta-v profile and orbital insertion.' ,
        parameter: 'Propellant remaining',
        actual: `${context.fuelRemainingKg.toFixed(0)} kg`,
        expected: `At least ${context.requiredFuelKg.toFixed(0)} kg`,
        suggestedChange: 'Carry more propellant or reduce mission mass and required maneuvering.',
        message: 'Mission fuel reserves are below the minimum needed for the transfer and insertion maneuver.',
        risk: 74,
      })
    }
  }

  if (context.requiredPowerW !== undefined && context.availablePowerW !== undefined) {
    const powerShortfall = Math.max(0, context.requiredPowerW - context.availablePowerW)
    if (powerShortfall > 0) {
      marginIssues.push({
        title: 'POWER SHORTFALL',
        cause: 'The power system cannot support the spacecraft during cruise and orbital operations.',
        parameter: 'Power generation',
        actual: `${context.availablePowerW.toLocaleString()} W`,
        expected: `At least ${context.requiredPowerW.toLocaleString()} W`,
        suggestedChange: 'Increase solar-array area or reduce power draw from science and communications payloads.',
        message: 'Power generation is insufficient to sustain the mission through transfer, insertion, and operations.',
        risk: 62 + Math.round(powerShortfall / 30),
      })
    }
  }

  if (context.requiredCommunication !== undefined && context.availableCommunication !== undefined) {
    const communicationShortfall = Math.max(0, context.requiredCommunication - context.availableCommunication)
    if (communicationShortfall > 0) {
      marginIssues.push({
        title: 'COMMUNICATION LINK MARGIN',
        cause: 'The spacecraft cannot maintain the required communications link at the planned range.',
        parameter: 'Communications capability',
        actual: `${context.availableCommunication}%`,
        expected: `At least ${context.requiredCommunication}%`,
        suggestedChange: 'Upgrade the antenna system or reduce the design’s range and data requirements.',
        message: 'The communications architecture does not provide enough link margin for the mission plan.',
        risk: 54,
      })
    }
  }

  if (context.requiredInstruments !== undefined && context.availableInstruments !== undefined) {
    const instrumentShortfall = Math.max(0, context.requiredInstruments - context.availableInstruments)
    if (instrumentShortfall > 0) {
      marginIssues.push({
        title: 'INSUFFICIENT SCIENCE PACKAGE',
        cause: 'The spacecraft does not carry the instruments required for the assigned mission profile.',
        parameter: 'Science instrument count',
        actual: `${context.availableInstruments}`,
        expected: `At least ${context.requiredInstruments}`,
        suggestedChange: 'Add the required instruments or simplify the mission to fit the current payload.',
        message: 'The current payload does not include the instrument set needed for the selected mission objective.',
        risk: 52,
      })
    }
  }

  if (context.trajectoryFeasible === false) {
    marginIssues.push({
      title: 'TRAJECTORY NOT FEASIBLE',
      cause: 'The selected launch profile, spacecraft mass, and propulsion capability cannot support a viable transfer to the destination.',
      parameter: 'Mission trajectory',
      actual: 'Not feasible',
      expected: 'Viable transfer and insertion profile',
      suggestedChange: 'Choose a lighter spacecraft, a stronger launch vehicle, or a mission profile more compatible with the design.',
      message: 'The configured trajectory is not feasible with the current spacecraft, propulsion, and launch profile.',
      risk: 80,
    })
  }

  if (spacecraftReliability < 45) {
    const reliabilityIssue = {
      title: 'SPACECRAFT RELIABILITY FAILURE',
      cause: 'A critical spacecraft reliability fault disrupted vehicle control during ascent.',
      parameter: 'Spacecraft reliability',
      actual: `${spacecraftReliability}%`,
      expected: 'At least 45%',
      suggestedChange: 'Improve spacecraft reliability with a sturdier design and added spare parts.',
      message: 'A critical spacecraft fault disrupted ascent control. Improve reliability and review the design before retrying.',
      risk: 62,
    }
    marginIssues.push(reliabilityIssue)
  }

  if (marginIssues.length > 0) {
    const launchFailure = excessMassKg > 0
    const primaryIssue = launchFailure
      ? marginIssues.find((issue) => issue.title === 'PAYLOAD OVERLOAD')!
      : marginIssues.reduce((worst, candidate) =>
          candidate.risk > worst.risk ? candidate : worst,
        )
    const riskScore = clampRisk(primaryIssue.risk)
    const riskLevel = riskScore >= 60 ? 'High' : riskScore >= 30 ? 'Moderate' : 'Low'
    const failureCategory: LaunchFailureCategory = launchFailure
      ? 'launch'
      : primaryIssue.title.includes('DELTA-V') || primaryIssue.title.includes('PROPELLANT') || primaryIssue.title.includes('TRAJECTORY') || primaryIssue.title.includes('MISSION MASS')
          ? 'trajectory'
          : primaryIssue.title.includes('POWER')
            ? 'power'
            : primaryIssue.title.includes('COMMUNICATION')
              ? 'communication'
              : primaryIssue.title.includes('SCIENCE')
                ? 'science'
                : primaryIssue.title.includes('RELIABILITY')
                  ? 'system'
                  : 'mission'

    return {
      riskLevel,
      riskScore,
      outcome: launchFailure ? 'failure' : 'success',
      failureCategory,
      failureTitle: primaryIssue.title,
      failureCause: primaryIssue.cause,
      failureParameter: primaryIssue.parameter,
      failureActual: primaryIssue.actual,
      failureExpected: primaryIssue.expected,
      suggestedChange: primaryIssue.suggestedChange,
      commanderMessage: primaryIssue.message,
    }
  }

  if (!hasMissionConfig) {
    const fallbackRiskScore =
      (excessMassKg > 0 ? (overloadRatio >= 0.25 ? 70 : 45) : 0) +
      (spacecraftReliability < 60 ? (spacecraftReliability < 45 ? 60 : 18) : 0)
    const riskLevel = fallbackRiskScore >= 45 ? 'High' : fallbackRiskScore >= 20 ? 'Moderate' : 'Low'
    const outcome = excessMassKg > 0 ? 'failure' : 'success'

    if (outcome === 'failure') {
      if (excessMassKg > 0) {
        return {
          riskLevel,
          riskScore: fallbackRiskScore,
          outcome,
          failureCategory: 'launch',
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
        riskScore: fallbackRiskScore,
        outcome,
        failureCategory: 'system',
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
  }

  return {
    riskLevel: 'Low',
    riskScore: 0,
    outcome: 'success',
    failureCategory: null,
    failureTitle: null,
    failureCause: null,
    failureParameter: null,
    failureActual: null,
    failureExpected: null,
    suggestedChange: null,
    commanderMessage: null,
  }
}
