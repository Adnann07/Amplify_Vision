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
  | 'anomaly'
  | 'complete'

export const LAUNCH_SEQUENCE_DURATION = 13

const SUCCESS_PHASES: { at: number; phase: SequencePhase }[] = [
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
  { at: LAUNCH_SEQUENCE_DURATION, phase: 'complete' },
]

const FAILURE_PHASES: { at: number; phase: SequencePhase }[] = [
  ...SUCCESS_PHASES.filter(({ at }) => at < 5.8),
  { at: 6.35, phase: 'anomaly' },
  { at: LAUNCH_SEQUENCE_DURATION, phase: 'complete' },
]

export function sequencePhaseAt(elapsed: number, failed: boolean): SequencePhase {
  const phases = failed ? FAILURE_PHASES : SUCCESS_PHASES
  let phase: SequencePhase = 'loading'
  for (const entry of phases) {
    if (elapsed < entry.at) break
    phase = entry.phase
  }
  return phase
}

export function sequenceElapsedAt(phase: SequencePhase, failed: boolean): number {
  const phases = failed ? FAILURE_PHASES : SUCCESS_PHASES
  return phases.find((entry) => entry.phase === phase)?.at ?? 0
}
