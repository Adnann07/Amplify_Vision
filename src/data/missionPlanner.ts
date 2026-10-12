import type { HorizonsPosition } from './horizonsService'

const ASTRONOMICAL_UNIT_KM = 149_597_870.7
const SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 = 132_712_440_018
const SECONDS_PER_DAY = 86_400

export interface PreliminaryTransferEstimate {
  departureBody: string
  destinationBody: string
  departureDate: string
  currentSeparationAu: number
  phaseAngleDegrees: number
  transferDays: number
  departureDeltaVKmS: number
  arrivalDeltaVKmS: number
  totalDeltaVKmS: number
  idealPhaseAngleDegrees: number
  phaseDifferenceDegrees: number
  assumption: string
}

export function estimateHohmannTransfer(
  departure: HorizonsPosition,
  destination: HorizonsPosition,
): PreliminaryTransferEstimate {
  if (departure.bodyId === destination.bodyId) {
    throw new Error('Choose two different planetary bodies for a transfer estimate.')
  }
  if (departure.requestedDate !== destination.requestedDate) {
    throw new Error('Transfer estimates require ephemerides requested for the same date.')
  }
  if (departure.bodyId !== 'earth') {
    throw new Error('The preliminary transfer estimator currently supports Earth departure only.')
  }

  const r1Au = departure.distanceAu
  const r2Au = destination.distanceAu
  const r1Km = r1Au * ASTRONOMICAL_UNIT_KM
  const r2Km = r2Au * ASTRONOMICAL_UNIT_KM
  const transferSemiMajorAxisKm = (r1Km + r2Km) / 2
  const transferDays =
    Math.PI *
    Math.sqrt(
      (transferSemiMajorAxisKm ** 3) / SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2,
    ) /
    SECONDS_PER_DAY

  const earthCircularVelocity = Math.sqrt(SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 / r1Km)
  const destinationCircularVelocity = Math.sqrt(SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 / r2Km)
  const transferDepartureVelocity = Math.sqrt(
    SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 *
      (2 / r1Km - 1 / transferSemiMajorAxisKm),
  )
  const transferArrivalVelocity = Math.sqrt(
    SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 *
      (2 / r2Km - 1 / transferSemiMajorAxisKm),
  )
  const departureDeltaVKmS = Math.abs(transferDepartureVelocity - earthCircularVelocity)
  const arrivalDeltaVKmS = Math.abs(transferArrivalVelocity - destinationCircularVelocity)
  const phaseAngleDegrees = wrapSignedDegrees(
    (Math.atan2(destination.yAu, destination.xAu) -
      Math.atan2(departure.yAu, departure.xAu)) *
      (180 / Math.PI),
  )
  const destinationMeanMotionRadiansPerDay =
    Math.sqrt(SOLAR_GRAVITATIONAL_PARAMETER_KM3_S2 / r2Km ** 3) * SECONDS_PER_DAY
  const destinationSweepDegrees = destinationMeanMotionRadiansPerDay * transferDays * (180 / Math.PI)
  const idealPhaseAngleDegrees = wrapSignedDegrees(
    Math.sign(r2Au - r1Au) * (180 - destinationSweepDegrees),
  )

  return {
    departureBody: departure.bodyName,
    destinationBody: destination.bodyName,
    departureDate: departure.requestedDate,
    currentSeparationAu: distanceBetween(departure, destination),
    phaseAngleDegrees,
    transferDays,
    departureDeltaVKmS,
    arrivalDeltaVKmS,
    totalDeltaVKmS: departureDeltaVKmS + arrivalDeltaVKmS,
    idealPhaseAngleDegrees,
    phaseDifferenceDegrees: Math.abs(wrapSignedDegrees(phaseAngleDegrees - idealPhaseAngleDegrees)),
    assumption:
      'Preliminary heliocentric Hohmann estimate using circular, coplanar orbits and each body’s instantaneous Horizons radius. Excludes planet departure/arrival, inclination, gravity assists, launch constraints, and trajectory optimization.',
  }
}

export function distanceBetween(first: HorizonsPosition, second: HorizonsPosition): number {
  if (first.requestedDate !== second.requestedDate) {
    throw new Error('Planetary separation requires positions for the same requested date.')
  }
  return Math.hypot(
    first.xAu - second.xAu,
    first.yAu - second.yAu,
    first.zAu - second.zAu,
  )
}

function wrapSignedDegrees(angle: number): number {
  return ((angle + 180) % 360 + 360) % 360 - 180
}
