import { describe, expect, it } from 'vitest'
import {
  CONFIGURATION_ERROR_TIME,
  LAUNCH_SEQUENCE_DURATION,
  MISSION_COMPLETE_TIME,
  STABLE_ORBIT_TIME,
  sequencePhaseAt,
} from './launchSequenceState'

describe('launch and mission flight state machine', () => {
  it('continues a successful orbital mission from launch through stable orbit', () => {
    const times = [0, 4.1, 5.8, 7, 8.1, 9.35, 11, 13, 15, 22, 27, STABLE_ORBIT_TIME, STABLE_ORBIT_TIME + 10]
    expect(times.map((time) => sequencePhaseAt(time, false))).toEqual([
      'countdown3',
      'ascent',
      'stage_separation',
      'fairing_separation',
      'spacecraft_deployment',
      'spacecraft_initialization',
      'mission_active',
      'departure',
      'transfer',
      'approach',
      'orbital_insertion',
      'stable_orbit',
      'stable_orbit',
    ])
  })

  it('continues a flyby to a pass and mission completion without orbital insertion', () => {
    expect(sequencePhaseAt(22, false, false, 'flyby')).toBe('approach')
    expect(sequencePhaseAt(27, false, false, 'flyby')).toBe('planetary_flyby')
    expect(sequencePhaseAt(MISSION_COMPLETE_TIME, false, false, 'flyby')).toBe('mission_complete')
  })

  it('reports a configuration error instead of pretending to reach an unsupported target', () => {
    expect(sequencePhaseAt(CONFIGURATION_ERROR_TIME, false, false, 'planning', false)).toBe('configuration_error')
  })

  it('aborts deployment phases on a deterministic launch failure', () => {
    expect(sequencePhaseAt(6.35, true)).toBe('anomaly')
    expect(sequencePhaseAt(8.1, true)).toBe('anomaly')
    expect(sequencePhaseAt(LAUNCH_SEQUENCE_DURATION, true)).toBe('complete')
  })

  it('reaches spacecraft deployment before showing a non-catastrophic in-space mission anomaly', () => {
    expect(sequencePhaseAt(8.1, false, true)).toBe('spacecraft_deployment')
    expect(sequencePhaseAt(9.35, false, true)).toBe('spacecraft_initialization')
    expect(sequencePhaseAt(11, false, true)).toBe('anomaly')
    expect(sequencePhaseAt(LAUNCH_SEQUENCE_DURATION, false, true)).toBe('complete')
  })

  it('does not skip ahead when elapsed time moves backwards', () => {
    expect(sequencePhaseAt(4.1, false)).toBe('ascent')
    expect(sequencePhaseAt(2, false)).toBe('countdown1')
  })
})
