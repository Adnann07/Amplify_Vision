export type SequencePhase =
  | 'loading'
  | 'countdown3'
  | 'countdown2'
  | 'countdown1'
  | 'ignition'
  | 'ascent'
  | 'stage_separation'
  | 'fairing_separation'
  | 'spacecraft_deployment'
  | 'spacecraft_initialization'
  | 'mission_active'
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

export const LAUNCH_SEQUENCE_DURATION = 13
export const STABLE_ORBIT_TIME = 32
export const MISSION_COMPLETE_TIME = 30
export const CONFIGURATION_ERROR_TIME = 14

const ASCENT_PHASES: { at: number; phase: SequencePhase }[] = [
  { at: 0, phase: 'countdown3' },
  { at: 0.85, phase: 'countdown2' },
  { at: 1.7, phase: 'countdown1' },
  { at: 2.55, phase: 'ignition' },
  { at: 4.1, phase: 'ascent' },
  { at: 5.8, phase: 'stage_separation' },
  { at: 7, phase: 'fairing_separation' },
  { at: 8.1, phase: 'spacecraft_deployment' },
  { at: 9.35, phase: 'spacecraft_initialization' },
  { at: 11, phase: 'mission_active' },
]

const FAILURE_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES.filter(({ at }) => at < 5.8),
  { at: 6.35, phase: 'anomaly' },
  { at: LAUNCH_SEQUENCE_DURATION, phase: 'complete' },
]

const MISSION_FAILURE_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES.filter(({ at }) => at < 11),
  { at: 11, phase: 'anomaly' },
  { at: LAUNCH_SEQUENCE_DURATION, phase: 'complete' },
]

const ORBITAL_MISSION_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES,
  { at: 13, phase: 'departure' },
  { at: 15, phase: 'transfer' },
  { at: 22, phase: 'approach' },
  { at: 27, phase: 'orbital_insertion' },
  { at: STABLE_ORBIT_TIME, phase: 'stable_orbit' },
]

const FLYBY_MISSION_PHASES: { at: number; phase: SequencePhase }[] = [
  ...ASCENT_PHASES,
  { at: 13, phase: 'departure' },
  { at: 15, phase: 'transfer' },
  { at: 22, phase: 'approach' },
  { at: 27, phase: 'planetary_flyby' },
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
