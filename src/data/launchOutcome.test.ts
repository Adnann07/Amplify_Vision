import { describe, expect, it } from 'vitest'
import type { LaunchVehicleSpec } from './launchVehicles'
import { assessLaunchOutcome } from './launchOutcome'

describe('assessLaunchOutcome', () => {
  const vehicle: LaunchVehicleSpec = {
    id: 'medium-launcher',
    name: 'Medium Launcher',
    visualClass: 'medium',
    payloadCapacityKg: 5000,
    launchCostMillions: 100,
    accent: '#a78bfa',
  }

  it('returns success when the configured mission capacity, power, and delta-v are sufficient', () => {
    const assessment = assessLaunchOutcome(3200, 91, vehicle, {
      destination: 'Jupiter',
      missionType: 'deep-space',
      availableDeltaV: 8.4,
      requiredDeltaV: 6.5,
      availablePowerW: 1500,
      requiredPowerW: 1200,
      availableCommunication: 92,
      requiredCommunication: 86,
      availableInstruments: 2,
      requiredInstruments: 2,
      maxMassKg: 4000,
      trajectoryFeasible: true,
    })

    expect(assessment.outcome).toBe('success')
    expect(assessment.failureTitle).toBeNull()
    expect(assessment.riskLevel).toBe('Low')
  })

  it('fails for a payload overload with a mission-specific explanation', () => {
    const assessment = assessLaunchOutcome(6100, 90, vehicle, {
      destination: 'Mars',
      requiredDeltaV: 5.5,
      availableDeltaV: 7,
      availablePowerW: 1200,
      requiredPowerW: 1000,
      availableCommunication: 86,
      requiredCommunication: 86,
      availableInstruments: 1,
      requiredInstruments: 1,
      maxMassKg: 4500,
    })

    expect(assessment.outcome).toBe('failure')
    expect(assessment.failureTitle).toBe('PAYLOAD OVERLOAD')
    expect(assessment.failureCause).toContain('payload capacity')
  })

  it('allows launch when the spacecraft lacks delta-v and reports a mission failure', () => {
    const assessment = assessLaunchOutcome(2800, 88, vehicle, {
      destination: 'Europa',
      availableDeltaV: 3.8,
      requiredDeltaV: 5.5,
      availablePowerW: 1500,
      requiredPowerW: 1000,
      availableCommunication: 85,
      requiredCommunication: 80,
      availableInstruments: 2,
      requiredInstruments: 2,
      trajectoryFeasible: true,
    })

    expect(assessment.outcome).toBe('success')
    expect(assessment.failureCategory).toBe('trajectory')
    expect(assessment.failureTitle).toBe('INSUFFICIENT DELTA-V')
    expect(assessment.failureExpected).toContain('5.5')
  })

  it('allows launch when spacecraft reliability is low and reports a spacecraft system issue', () => {
    const assessment = assessLaunchOutcome(2800, 30, vehicle, {
      destination: 'Mars',
      availableDeltaV: 7,
      requiredDeltaV: 5.5,
    })

    expect(assessment.outcome).toBe('success')
    expect(assessment.failureCategory).toBe('system')
    expect(assessment.failureTitle).toBe('SPACECRAFT RELIABILITY FAILURE')
  })

  it('reports an infeasible spacecraft trajectory without aborting launch', () => {
    const assessment = assessLaunchOutcome(2800, 90, vehicle, {
      destination: 'Europa',
      trajectoryFeasible: false,
    })

    expect(assessment.outcome).toBe('success')
    expect(assessment.failureCategory).toBe('trajectory')
    expect(assessment.failureTitle).toBe('TRAJECTORY NOT FEASIBLE')
  })

  it('fails launch only when spacecraft mass exceeds rocket payload capacity', () => {
    const assessment = assessLaunchOutcome(5100, 90, vehicle, {
      destination: 'Mars',
      availableDeltaV: 2,
      requiredDeltaV: 8,
      trajectoryFeasible: false,
    })

    expect(assessment.outcome).toBe('failure')
    expect(assessment.failureCategory).toBe('launch')
    expect(assessment.failureTitle).toBe('PAYLOAD OVERLOAD')
  })
})
