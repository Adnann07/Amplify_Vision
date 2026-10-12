import { describe, expect, it } from 'vitest'
import { LAUNCH_SEQUENCE_DURATION, sequencePhaseAt } from './launchSequenceState'

describe('launch deployment state machine', () => {
  it('advances successful flights through separation, deployment, and initialization in order', () => {
    const times = [0, 4.1, 5.8, 7, 8.1, 9.35, 11, LAUNCH_SEQUENCE_DURATION]
    expect(times.map((time) => sequencePhaseAt(time, false))).toEqual([
      'countdown3',
      'ascent',
      'stage_separation',
      'fairing_separation',
      'spacecraft_deployment',
      'spacecraft_initialization',
      'mission_active',
      'complete',
    ])
  })

  it('aborts deployment phases on a deterministic launch failure', () => {
    expect(sequencePhaseAt(6.35, true)).toBe('anomaly')
    expect(sequencePhaseAt(8.1, true)).toBe('anomaly')
    expect(sequencePhaseAt(LAUNCH_SEQUENCE_DURATION, true)).toBe('complete')
  })

  it('does not skip ahead when elapsed time moves backwards', () => {
    expect(sequencePhaseAt(4.1, false)).toBe('ascent')
    expect(sequencePhaseAt(2, false)).toBe('countdown1')
  })
})
