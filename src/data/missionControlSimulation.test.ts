import { afterEach, describe, expect, it, vi } from 'vitest'
import { launchVehicles, type LaunchRecord } from './launchVehicles'
import {
  advanceMissionControl,
  BATTERY_CAPACITY_WH,
  clearMissionControlSession,
  createMissionControlSession,
  executeMissionCommand,
  getDefaultObservationTargetId,
  getPowerConsumptionW,
  isObservationWindow,
  loadMissionControlSession,
  MISSION_CONTROL_STORAGE_KEY,
  saveMissionControlSession,
  SIMULATION_SECONDS_PER_TICK,
} from './missionControlSimulation'

function createRecord(overrides: Partial<LaunchRecord> = {}): LaunchRecord {
  return {
    attemptId: 1,
    mode: 'mission',
    missionName: 'Earth Observation',
    destination: 'Earth orbit',
    planningSnapshot: {
      launchDate: '2026-01-01',
      destinationBodyId: 'earth',
      ephemerides: [],
      transferEstimate: null,
    },
    spacecraftName: 'Test spacecraft',
    spacecraftId: 'test-spacecraft',
    spacecraftType: 'Earth-observation satellite',
    spacecraftModel: { format: 'unavailable', sourceUrl: '', reason: 'Test fixture' },
    spacecraftMassKg: 1000,
    existingMissionCostMillions: 100,
    launchVehicle: launchVehicles[0],
    totalMissionCostMillions: 160,
    missionBudgetMillions: 1000,
    spacecraftReliability: 90,
    missionTelemetry: {
      power: 1000,
      deltaV: 4,
      communication: 80,
      instruments: 1,
      instrumentType: 'camera',
      science: 30,
      resourceEfficiency: 70,
      sustainabilityLevel: 'Medium',
    },
    missionRequirementResults: [],
    outcome: 'success',
    riskLevel: 'Low',
    riskScore: 10,
    failureTitle: null,
    failureCause: null,
    failureParameter: null,
    failureActual: null,
    failureExpected: null,
    suggestedChange: null,
    commanderMessage: null,
    ...overrides,
  }
}

function createSession(record = createRecord()) {
  return createMissionControlSession(record, {
    missionId: 'earth-observation',
    missionTitle: 'Earth Observation',
    missionObjective: 'Collect high-resolution Earth imagery.',
    missionGoalId: 'earth-observation',
    campaignMissionId: 'first-flight',
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('mission control simulation', () => {
  it('only creates a mission operations session after successful deployment', () => {
    expect(() =>
      createSession(createRecord({ outcome: 'failure' })),
    ).toThrow('Mission Control is only available after a successful launch and deployment.')
  })

  it('keeps resource bounds and advances the simulation clock in fixed steps', () => {
    const record = createRecord({
      missionTelemetry: {
        ...createRecord().missionTelemetry,
        power: 0,
      },
    })
    const state = createSession(record).state
    const depleted = advanceMissionControl(record, {
      ...state,
      batteryWh: 0.01,
    })
    expect(depleted.elapsedSeconds).toBe(SIMULATION_SECONDS_PER_TICK)
    expect(depleted.batteryWh).toBe(0)

    const charged = advanceMissionControl(
      createRecord({ missionTelemetry: { ...record.missionTelemetry, power: 5000 } }),
      { ...state, batteryWh: BATTERY_CAPACITY_WH - 0.01 },
    )
    expect(charged.batteryWh).toBe(BATTERY_CAPACITY_WH)
  })

  it('makes power-saving mode and instrument operation change the modeled load', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const active = executeMissionCommand(record, initial, {
      type: 'set-instrument',
      active: true,
    }).state
    const saving = executeMissionCommand(record, active, {
      type: 'set-power-save',
      enabled: true,
    }).state

    expect(getPowerConsumptionW(record, active)).toBeGreaterThan(
      getPowerConsumptionW(record, initial),
    )
    expect(getPowerConsumptionW(record, saving)).toBeLessThan(
      getPowerConsumptionW(record, active),
    )
  })

  it('only records observations during the scheduled window with an active instrument', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const active = executeMissionCommand(record, initial, {
      type: 'set-instrument',
      active: true,
    }).state
    const beforeWindow = executeMissionCommand(record, active, {
      type: 'perform-observation',
    })
    expect(beforeWindow.state.observationsCompleted).toBe(0)

    const windowState = { ...active, elapsedSeconds: 5 * 60 }
    expect(isObservationWindow(windowState.elapsedSeconds)).toBe(true)
    const result = executeMissionCommand(record, windowState, {
      type: 'perform-observation',
    })
    expect(result.state.observationsCompleted).toBe(1)
    expect(result.state.scienceDataMb).toBeGreaterThan(0)
    expect(result.state.storageUsedMb).toBe(result.state.scienceDataMb)
  })

  it('schedules a target-specific capture for the next eligible window and stores a simulated product', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const active = executeMissionCommand(record, {
      ...initial,
      elapsedSeconds: 4 * 60 + 45,
    }, { type: 'set-instrument', active: true }).state
    const scheduled = executeMissionCommand(record, active, { type: 'schedule-observation' })
    expect(scheduled.state.observationScheduled).toBe(true)

    const acquired = advanceMissionControl(record, scheduled.state)
    expect(acquired.elapsedSeconds).toBe(5 * 60)
    expect(acquired.observationScheduled).toBe(false)
    expect(acquired.observationsCompleted).toBe(1)
    expect(acquired.observationProducts).toEqual([{
      id: 1,
      targetId: getDefaultObservationTargetId(record),
      targetName: 'Earth mission target',
      body: 'Earth',
      acquiredAtMetSeconds: 5 * 60,
      dataMb: 128,
      status: 'onboard',
    }])
    expect(acquired.storageUsedMb).toBe(128)
  })

  it('validates mission observation targets and prevents changing a scheduled target', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const invalid = executeMissionCommand(record, initial, {
      type: 'set-observation-target',
      targetId: 'not-a-mission-target',
    })
    expect(invalid.state.observationTargetId).toBe(initial.observationTargetId)
    expect(invalid.severity).toBe('warning')

    const scheduled = executeMissionCommand(record, initial, { type: 'schedule-observation' }).state
    const changed = executeMissionCommand(record, scheduled, {
      type: 'set-observation-target',
      targetId: 'another-target',
    })
    expect(changed.state.observationTargetId).toBe(initial.observationTargetId)
    expect(changed.state.observationScheduled).toBe(true)
  })

  it('marks acquired products downlinked while keeping reference imagery outside spacecraft data accounting', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const product = {
      id: 1,
      targetId: initial.observationTargetId,
      targetName: 'Earth mission target',
      body: 'Earth',
      acquiredAtMetSeconds: 300,
      dataMb: 128,
      status: 'onboard' as const,
    }
    const queued = {
      ...initial,
      elapsedSeconds: 4 * 60,
      scienceDataMb: 128,
      storageUsedMb: 128,
      observationsCompleted: 1,
      observationProducts: [product],
    }
    const downlinked = executeMissionCommand(record, queued, { type: 'downlink' }).state
    expect(downlinked.dataDownlinkedMb).toBe(128)
    expect(downlinked.scienceDataMb).toBe(0)
    expect(downlinked.observationProducts[0].status).toBe('downlinked')
  })

  it('queues a downlink without communications and transmits it when a window opens', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const queued = executeMissionCommand(record, {
      ...initial,
      elapsedSeconds: 3 * 60,
      scienceDataMb: 128,
      storageUsedMb: 128,
    }, { type: 'downlink' })

    expect(queued.state.downlinkQueued).toBe(true)
    expect(queued.state.dataDownlinkedMb).toBe(0)
    const transmitted = advanceMissionControl(record, {
      ...queued.state,
      elapsedSeconds: 4 * 60 - SIMULATION_SECONDS_PER_TICK,
    })
    expect(transmitted.downlinkQueued).toBe(false)
    expect(transmitted.scienceDataMb).toBe(0)
    expect(transmitted.storageUsedMb).toBe(0)
    expect(transmitted.dataDownlinkedMb).toBe(128)
  })

  it('emits a low-battery alert only after crossing the configured threshold', () => {
    const record = createRecord({ missionTelemetry: { ...createRecord().missionTelemetry, power: 0 } })
    const initial = createSession(record).state
    const lowBattery = advanceMissionControl(record, {
      ...initial,
      batteryWh: initial.batteryCapacityWh * 0.2,
    })
    const updated = advanceMissionControl(record, lowBattery)
    expect(lowBattery.batteryWarningIssued).toBe(true)
    expect(updated.events.filter((event) => event.message.includes('20% operational warning')).length).toBe(1)
  })

  it('stops an overheated instrument and records the anomaly', () => {
    const record = createRecord()
    const initial = createSession(record).state
    const overheated = advanceMissionControl(record, {
      ...initial,
      instrumentActive: true,
      instrumentTemperatureC: 69.8,
    })
    expect(overheated.instrumentActive).toBe(false)
    expect(overheated.instrumentOverheatIssued).toBe(true)
    expect(overheated.events[0]).toMatchObject({
      severity: 'critical',
      subsystem: 'Science instrument',
    })
  })

  it('reports a missing communications configuration instead of silently showing no link', () => {
    const record = createRecord({
      missionTelemetry: { ...createRecord().missionTelemetry, communication: 0 },
    })
    let state = createSession(record).state
    for (let tick = 0; tick < (7 * 60) / SIMULATION_SECONDS_PER_TICK; tick += 1) {
      state = advanceMissionControl(record, state)
    }
    expect(state.communicationWarningIssued).toBe(true)
    expect(state.events[0]).toMatchObject({
      severity: 'warning',
      subsystem: 'Communications',
      message: expect.stringContaining('No communications capability'),
    })
  })

  it('pauses all automatic resource updates', () => {
    const record = createRecord()
    const state = { ...createSession(record).state, paused: true }
    expect(advanceMissionControl(record, state)).toBe(state)
  })

  it('persists and restores the deployed mission and operations state', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
    const session = createSession()
    expect(saveMissionControlSession(session)).toBeNull()
    expect(loadMissionControlSession().session).toEqual(session)
    expect(clearMissionControlSession()).toBeNull()
    expect(loadMissionControlSession().session).toBeNull()
  })

  it('migrates existing saved mission sessions without losing their operations state', () => {
    const session = createSession()
    const legacy = JSON.parse(JSON.stringify(session)) as typeof session
    const legacyState = legacy.state as Partial<typeof legacy.state>
    delete legacyState.observationTargetId
    delete legacyState.observationScheduled
    delete legacyState.observationProducts
    const storage = new Map([[MISSION_CONTROL_STORAGE_KEY, JSON.stringify(legacy)]])
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })

    const restored = loadMissionControlSession()
    expect(restored.warning).toBeNull()
    expect(restored.session?.state).toMatchObject({
      observationTargetId: getDefaultObservationTargetId(session.record),
      observationScheduled: false,
      observationProducts: [],
      batteryWh: session.state.batteryWh,
    })
  })

  it('rejects corrupted persisted resource values rather than restoring them', () => {
    const session = createSession()
    const storage = new Map<string, string>([
      [MISSION_CONTROL_STORAGE_KEY, JSON.stringify({
        ...session,
        state: { ...session.state, batteryWh: -1 },
      })],
    ])
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key),
      },
    })
    expect(loadMissionControlSession()).toMatchObject({
      session: null,
      warning: 'Saved Mission Control state was invalid and could not be restored.',
    })
  })
})
