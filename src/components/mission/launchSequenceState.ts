export type SequencePhase =
  | 'loading'
  | 'countdown3'
  | 'countdown2'
  | 'countdown1'
  | 'ignition'
  | 'ascent'
  | 'stage_separation'
  | 'fairing_separation'
  | 'leo_coast'
  | 'spacecraft_deployment'
  | 'spacecraft_initialization'
  | 'mission_active'
  | 'tli_burn'
  | 'departure'
  | 'transfer'
  | 'approach'
  | 'orbital_insertion'
  | 'stable_orbit'
  | 'planetary_flyby'
  | 'mission_complete'
  | 'configuration_error'
  | 'anomaly'
  | 'complete'

export const LIFTOFF_TIME = 4.1
export const SPACE_TRANSITION_START_TIME = 18
export const STAGE_SEPARATION_TIME = 21
export const FAIRING_SEPARATION_TIME = 23
export const ASCENT_COMPLETE_TIME = 24
export const SPACECRAFT_DEPLOYMENT_TIME = 26.5
export const SPACECRAFT_INITIALIZATION_TIME = 28.5
export const MISSION_ACTIVE_TIME = 29.5
export const TLI_BURN_TIME = 32
export const DEPARTURE_TIME = 35
export const TRANSFER_START_TIME = 37
export const ARRIVAL_TIME = 45
export const ORBITAL_INSERTION_TIME = 49
export const STABLE_ORBIT_TIME = 55
export const MISSION_COMPLETE_TIME = 51
export const CONFIGURATION_ERROR_TIME = 32
export const LAUNCH_FAILURE_TIME = 6.35
export const LAUNCH_FAILURE_COMPLETE_TIME = 13
export const MISSION_FAILURE_TIME = 31
export const MISSION_FAILURE_COMPLETE_TIME = 35
export const ORBITAL_SPACE_MIX = 0.995

export function isStageSeparationReady(elapsed: number, spaceMix: number) {
  return elapsed >= STAGE_SEPARATION_TIME && spaceMix >= ORBITAL_SPACE_MIX
}

export function isSpacecraftDeploymentReady(elapsed: number, spaceMix: number) {
  return elapsed >= SPACECRAFT_DEPLOYMENT_TIME && spaceMix >= ORBITAL_SPACE_MIX
}

const ASCENT_PHASES: { at: number; phase: SequencePhase }[] = [
  { at: 0, phase: 'countdown3' },
  { at: 0.85, phase: 'countdown2' },
  { at: 1.7, phase: 'countdown1' },
  { at: 2.55, phase: 'ignition' },
  { at: LIFTOFF_TIME, phase: 'ascent' },
  { at: STAGE_SEPARATION_TIME, phase: 'stage_separation' },
  { at: FAIRING_SEPARATION_TIME, phase: 'fairing_separation' },
  { at: ASCENT_COMPLETE_TIME, phase: 'leo_coast' },
  { at: SPACECRAFT_DEPLOYMENT_TIME, phase: 'spacecraft_deployment' },
  { at: SPACECRAFT_INITIALIZATION_TIME, phase: 'spacecraft_initialization' },
  { at: MISSION_ACTIVE_TIME, phase: 'mission_active' },
]

const FAILURE_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES.filter(({ at }) => at < LAUNCH_FAILURE_TIME),
  { at: LAUNCH_FAILURE_TIME, phase: 'anomaly' },
  { at: LAUNCH_FAILURE_COMPLETE_TIME, phase: 'complete' },
]

const MISSION_FAILURE_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES.filter(({ at }) => at < MISSION_FAILURE_TIME),
  { at: MISSION_FAILURE_TIME, phase: 'anomaly' },
  { at: MISSION_FAILURE_COMPLETE_TIME, phase: 'complete' },
]

const ORBITAL_MISSION_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES,
  { at: TLI_BURN_TIME, phase: 'tli_burn' },
  { at: DEPARTURE_TIME, phase: 'departure' },
  { at: TRANSFER_START_TIME, phase: 'transfer' },
  { at: ARRIVAL_TIME, phase: 'approach' },
  { at: ORBITAL_INSERTION_TIME, phase: 'orbital_insertion' },
  { at: STABLE_ORBIT_TIME, phase: 'stable_orbit' },
]

const FLYBY_MISSION_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES,
  { at: TLI_BURN_TIME, phase: 'tli_burn' },
  { at: DEPARTURE_TIME, phase: 'departure' },
  { at: TRANSFER_START_TIME, phase: 'transfer' },
  { at: ARRIVAL_TIME, phase: 'approach' },
  { at: ORBITAL_INSERTION_TIME, phase: 'planetary_flyby' },
  { at: MISSION_COMPLETE_TIME, phase: 'mission_complete' },
]

const CONFIGURATION_ERROR_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES,
  { at: CONFIGURATION_ERROR_TIME, phase: 'configuration_error' },
]

function phasesFor(
  launchFailed: boolean,
  missionFailed: boolean,
  missionProfile: 'orbiter' | 'flyby' | 'planning',
  destinationConfigured: boolean,
) {
  if (launchFailed) return FAILURE_PHASES
  if (missionFailed) return MISSION_FAILURE_PHASES
  if (!destinationConfigured || missionProfile === 'planning') return CONFIGURATION_ERROR_PHASES
  return missionProfile === 'flyby' ? FLYBY_MISSION_PHASES : ORBITAL_MISSION_PHASES
}

export function sequencePhaseAt(
  elapsed: number,
  launchFailed: boolean,
  missionFailed = false,
  missionProfile: 'orbiter' | 'flyby' | 'planning' = 'orbiter',
  destinationConfigured = true,
): SequencePhase {
  const phases = phasesFor(launchFailed, missionFailed, missionProfile, destinationConfigured)
  let phase: SequencePhase = 'loading'
  for (const entry of phases) {
    if (elapsed < entry.at) break
    phase = entry.phase
  }
  return phase
}

export function sequenceElapsedAt(
  phase: SequencePhase,
  launchFailed: boolean,
  missionFailed = false,
  missionProfile: 'orbiter' | 'flyby' | 'planning' = 'orbiter',
  destinationConfigured = true,
): number {
  const phases = phasesFor(launchFailed, missionFailed, missionProfile, destinationConfigured)
  return phases.find((entry) => entry.phase === phase)?.at ?? 0
}

export function isTerminalSequencePhase(phase: SequencePhase) {
  return phase === 'stable_orbit' ||
    phase === 'mission_complete' ||
    phase === 'configuration_error' ||
    phase === 'complete'
}
