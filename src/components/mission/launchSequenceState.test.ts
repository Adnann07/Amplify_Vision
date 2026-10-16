import { describe, expect, it } from 'vitest'
import {
  ARRIVAL_TIME,
  ASCENT_COMPLETE_TIME,
  CONFIGURATION_ERROR_TIME,
  DEPARTURE_TIME,
  FAIRING_SEPARATION_TIME,
  LAUNCH_FAILURE_COMPLETE_TIME,
  LAUNCH_FAILURE_TIME,
  MISSION_ACTIVE_TIME,
  MISSION_COMPLETE_TIME,
  MISSION_FAILURE_COMPLETE_TIME,
  MISSION_FAILURE_TIME,
  ORBITAL_INSERTION_TIME,
  SPACECRAFT_DEPLOYMENT_TIME,
  SPACECRAFT_INITIALIZATION_TIME,
  SPACE_TRANSITION_START_TIME,
  STAGE_SEPARATION_TIME,
  STABLE_ORBIT_TIME,
  TLI_BURN_TIME,
  TRANSFER_START_TIME,
  ORBITAL_SPACE_MIX,
  isStageSeparationReady,
  isSpacecraftDeploymentReady,
  sequencePhaseAt,
} from './launchSequenceState'

describe('launch and mission flight state machine', () => {
  it('separates the rocket stages only after the space transition is complete', () => {
    expect(SPACE_TRANSITION_START_TIME).toBeLessThan(STAGE_SEPARATION_TIME)
    expect(STAGE_SEPARATION_TIME).toBeLessThan(FAIRING_SEPARATION_TIME)
    expect(FAIRING_SEPARATION_TIME).toBeLessThan(ASCENT_COMPLETE_TIME)
    expect(ASCENT_COMPLETE_TIME).toBeLessThan(SPACECRAFT_DEPLOYMENT_TIME)
    expect(isStageSeparationReady(STAGE_SEPARATION_TIME, ORBITAL_SPACE_MIX - 0.01)).toBe(false)
    expect(isStageSeparationReady(STAGE_SEPARATION_TIME - 0.1, ORBITAL_SPACE_MIX)).toBe(false)
    expect(isStageSeparationReady(STAGE_SEPARATION_TIME, ORBITAL_SPACE_MIX)).toBe(true)
  })

  it('reaches low Earth orbit and deploys before beginning trans-lunar injection', () => {
    const times = [
      0,
      STAGE_SEPARATION_TIME,
      FAIRING_SEPARATION_TIME,
      ASCENT_COMPLETE_TIME,
      SPACECRAFT_DEPLOYMENT_TIME,
      SPACECRAFT_INITIALIZATION_TIME,
      MISSION_ACTIVE_TIME,
      TLI_BURN_TIME,
      DEPARTURE_TIME,
      TRANSFER_START_TIME,
      ARRIVAL_TIME,
      ORBITAL_INSERTION_TIME,
      STABLE_ORBIT_TIME,
      STABLE_ORBIT_TIME + 10,
    ]
    expect(times.map((time) => sequencePhaseAt(time, false))).toEqual([
      'countdown3',
      'stage_separation',
      'fairing_separation',
      'leo_coast',
      'spacecraft_deployment',
      'spacecraft_initialization',
      'mission_active',
      'tli_burn',
      'departure',
      'transfer',
      'approach',
      'orbital_insertion',
      'stable_orbit',
      'stable_orbit',
    ])
  })

  it('continues a flyby to a pass and mission completion without orbital insertion', () => {
    expect(sequencePhaseAt(ARRIVAL_TIME, false, false, 'flyby')).toBe('approach')
    expect(sequencePhaseAt(ORBITAL_INSERTION_TIME, false, false, 'flyby')).toBe('planetary_flyby')
    expect(sequencePhaseAt(MISSION_COMPLETE_TIME, false, false, 'flyby')).toBe('mission_complete')
  })

  it('reports a configuration error instead of pretending to reach an unsupported target', () => {
    expect(sequencePhaseAt(SPACECRAFT_DEPLOYMENT_TIME, false, false, 'planning', false)).toBe('spacecraft_deployment')
    expect(sequencePhaseAt(CONFIGURATION_ERROR_TIME, false, false, 'planning', false)).toBe('configuration_error')
  })

  it('keeps the spacecraft attached until both the deployment time and orbital transition are reached', () => {
    expect(isSpacecraftDeploymentReady(SPACECRAFT_DEPLOYMENT_TIME - 0.1, ORBITAL_SPACE_MIX)).toBe(false)
    expect(isSpacecraftDeploymentReady(SPACECRAFT_DEPLOYMENT_TIME, ORBITAL_SPACE_MIX - 0.01)).toBe(false)
    expect(isSpacecraftDeploymentReady(SPACECRAFT_DEPLOYMENT_TIME, ORBITAL_SPACE_MIX)).toBe(true)
  })

  it('aborts deployment phases on a deterministic launch failure', () => {
    expect(sequencePhaseAt(LAUNCH_FAILURE_TIME, true)).toBe('anomaly')
    expect(sequencePhaseAt(LAUNCH_FAILURE_COMPLETE_TIME - 0.1, true)).toBe('anomaly')
    expect(sequencePhaseAt(LAUNCH_FAILURE_COMPLETE_TIME, true)).toBe('complete')
  })

  it('reaches spacecraft deployment before showing a non-catastrophic in-space mission anomaly', () => {
    expect(sequencePhaseAt(SPACECRAFT_DEPLOYMENT_TIME, false, true)).toBe('spacecraft_deployment')
    expect(sequencePhaseAt(SPACECRAFT_INITIALIZATION_TIME, false, true)).toBe('spacecraft_initialization')
    expect(sequencePhaseAt(MISSION_FAILURE_TIME, false, true)).toBe('anomaly')
    expect(sequencePhaseAt(MISSION_FAILURE_COMPLETE_TIME, false, true)).toBe('complete')
  })

  it('does not skip ahead when elapsed time moves backwards', () => {
    expect(sequencePhaseAt(4.1, false)).toBe('ascent')
    expect(sequencePhaseAt(2, false)).toBe('countdown1')
  })
})
