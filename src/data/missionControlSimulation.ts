import type { LaunchRecord } from './launchVehicles'
import type { SpacecraftBuild } from './spacecraftBuild'
import { getObservationTargets } from './observationTargets'

export const MISSION_CONTROL_STORAGE_KEY = 'amplify-vision-mission-control-v1'
export const SIMULATION_SECONDS_PER_TICK = 15
export const BATTERY_CAPACITY_WH = 1200
export const STORAGE_CAPACITY_MB = 1024

export type MissionEventSeverity = 'info' | 'warning' | 'critical'
export type MissionCommand =
  | { type: 'set-paused'; paused: boolean }
  | { type: 'set-instrument'; active: boolean }
  | { type: 'set-power-save'; enabled: boolean }
  | { type: 'perform-observation' }
  | { type: 'set-observation-target'; targetId: string }
  | { type: 'schedule-observation' }
  | { type: 'cancel-observation' }
  | { type: 'postpone-observation' }
  | { type: 'downlink' }

export interface MissionControlEvent {
  id: number
  elapsedSeconds: number
  severity: MissionEventSeverity
  subsystem: string
  message: string
}

function rejectCommand(
  current: MissionControlState,
  message: string,
  severity: MissionEventSeverity,
  subsystem = 'Command',
): MissionCommandResult {
  return {
    state: addEvent(current, current.elapsedSeconds, severity, subsystem, message),
    message,
    severity,
  }
}

export interface TelemetrySample {
  elapsedSeconds: number
  batteryPercent: number
  generatedPowerW: number
  consumedPowerW: number
  instrumentTemperatureC: number
  storagePercent: number
}

export interface ObservationProduct {
  id: number
  targetId: string
  targetName: string
  body: string
  acquiredAtMetSeconds: number
  dataMb: number
  status: 'onboard' | 'downlinked'
}

export interface MissionControlState {
  elapsedSeconds: number
  paused: boolean
  batteryWh: number
  batteryCapacityWh: number
  powerSave: boolean
  instrumentActive: boolean
  instrumentTemperatureC: number
  storageUsedMb: number
  storageCapacityMb: number
  scienceDataMb: number
  dataDownlinkedMb: number
  observationsCompleted: number
  observationTargetId: string
  observationScheduled: boolean
  observationProducts: ObservationProduct[]
  observationDelayMinutes: number
  downlinkQueued: boolean
  communicationEstablished: boolean
  communicationWarningIssued: boolean
  batteryWarningIssued: boolean
  batteryCriticalIssued: boolean
  storageWarningIssued: boolean
  instrumentOverheatIssued: boolean
  nextEventId: number
  events: MissionControlEvent[]
  history: TelemetrySample[]
}

export interface MissionControlSession {
  version: 1
  missionId: string
  missionTitle: string
  missionObjective: string
  missionGoalId: string
  campaignMissionId: string | null
  record: LaunchRecord
  state: MissionControlState
}

export interface MissionControlMissionInfo {
  missionId: string
  missionTitle: string
  missionObjective: string
  missionGoalId: string
  campaignMissionId: string | null
}

export interface MissionCommandResult {
  state: MissionControlState
  message: string
  severity: MissionEventSeverity
}

const instrumentPowerW = {
  camera: 120,
  spectrometer: 240,
  radar: 390,
} as const

const BASE_POWER_LOAD_W = 180
const COMMUNICATION_POWER_LOAD_W = 25
const INSTRUMENT_STANDBY_POWER_W = 18
const OBSERVATION_DATA_MB = 128
const OBSERVATION_WINDOW_START_MINUTES = 5
const OBSERVATION_WINDOW_PERIOD_MINUTES = 20
const OBSERVATION_WINDOW_DURATION_MINUTES = 3

export function getDefaultObservationTargetId(record: LaunchRecord) {
  return getObservationTargets(record.spacecraftId, record.destination)[0].id
}

function addEvent(
  state: MissionControlState,
  elapsedSeconds: number,
  severity: MissionEventSeverity,
  subsystem: string,
  message: string,
): MissionControlState {
  return {
    ...state,
    nextEventId: state.nextEventId + 1,
    events: [
      {
        id: state.nextEventId,
        elapsedSeconds,
        severity,
        subsystem,
        message,
      },
      ...state.events,
    ].slice(0, 100),
  }
}

export function hasScienceInstrument(record: LaunchRecord) {
  return record.missionTelemetry.instruments > 0
}

export function getInstrumentOperatingPowerW(record: LaunchRecord) {
  if (!hasScienceInstrument(record)) return 0
  return instrumentPowerW[record.missionTelemetry.instrumentType] *
    record.missionTelemetry.instruments
}

export function getPowerConsumptionW(record: LaunchRecord, state: MissionControlState) {
  const baseLoad = state.powerSave ? BASE_POWER_LOAD_W * 0.65 : BASE_POWER_LOAD_W
  const communicationLoad =
    record.missionTelemetry.communication > 0 ? COMMUNICATION_POWER_LOAD_W : 0
  const instrumentLoad = state.instrumentActive
    ? getInstrumentOperatingPowerW(record)
    : hasScienceInstrument(record)
      ? INSTRUMENT_STANDBY_POWER_W
      : 0
  return Math.round(baseLoad + communicationLoad + instrumentLoad)
}

export function isObservationWindow(elapsedSeconds: number, delayMinutes = 0) {
  const elapsedMinutes = elapsedSeconds / 60
  const firstStart = OBSERVATION_WINDOW_START_MINUTES + delayMinutes
  if (elapsedMinutes < firstStart) return false
  const positionInCycle = (elapsedMinutes - firstStart) % OBSERVATION_WINDOW_PERIOD_MINUTES
  return positionInCycle < OBSERVATION_WINDOW_DURATION_MINUTES
}

export function getNextObservationWindowMinute(
  elapsedSeconds: number,
  delayMinutes = 0,
) {
  const elapsedMinutes = elapsedSeconds / 60
  const firstStart = OBSERVATION_WINDOW_START_MINUTES + delayMinutes
  if (elapsedMinutes < firstStart) return firstStart
  const cycles = Math.ceil(
    (elapsedMinutes - firstStart) / OBSERVATION_WINDOW_PERIOD_MINUTES,
  )
  return firstStart + cycles * OBSERVATION_WINDOW_PERIOD_MINUTES
}

export function isCommunicationAvailable(record: LaunchRecord, elapsedSeconds: number) {
  if (record.missionTelemetry.communication <= 0) return false
  const minuteInCycle = (elapsedSeconds / 60) % 10
  return minuteInCycle >= 4 && minuteInCycle < 7
}

function makeSample(
  record: LaunchRecord,
  state: MissionControlState,
  elapsedSeconds: number,
): TelemetrySample {
  return {
    elapsedSeconds,
    batteryPercent: Math.round((state.batteryWh / state.batteryCapacityWh) * 100),
    generatedPowerW: record.missionTelemetry.power,
    consumedPowerW: getPowerConsumptionW(record, state),
    instrumentTemperatureC: Math.round(state.instrumentTemperatureC * 10) / 10,
    storagePercent: Math.round((state.storageUsedMb / state.storageCapacityMb) * 100),
  }
}

export function createMissionControlSession(
  record: LaunchRecord,
  mission: MissionControlMissionInfo,
): MissionControlSession {
  if (record.outcome !== 'success') {
    throw new Error('Mission Control is only available after a successful launch and deployment.')
  }

  const initialState: MissionControlState = {
    elapsedSeconds: 0,
    paused: false,
    batteryWh: BATTERY_CAPACITY_WH * 0.72,
    batteryCapacityWh: BATTERY_CAPACITY_WH,
    powerSave: false,
    instrumentActive: false,
    instrumentTemperatureC: 20,
    storageUsedMb: 0,
    storageCapacityMb: STORAGE_CAPACITY_MB,
    scienceDataMb: 0,
    dataDownlinkedMb: 0,
    observationsCompleted: 0,
    observationTargetId: getDefaultObservationTargetId(record),
    observationScheduled: false,
    observationProducts: [],
    observationDelayMinutes: 0,
    downlinkQueued: false,
    communicationEstablished: false,
    communicationWarningIssued: false,
    batteryWarningIssued: false,
    batteryCriticalIssued: false,
    storageWarningIssued: false,
    instrumentOverheatIssued: false,
    nextEventId: 2,
    events: [
      {
        id: 1,
        elapsedSeconds: 0,
        severity: 'info',
        subsystem: 'Mission operations',
        message: `${record.spacecraftName} deployment confirmed. Operations simulation initialized.`,
      },
    ],
    history: [],
  }
  const state = {
    ...initialState,
    history: [makeSample(record, initialState, 0)],
  }

  return {
    version: 1,
    ...mission,
    record,
    state,
  }
}

export function executeMissionCommand(
  record: LaunchRecord,
  current: MissionControlState,
  command: MissionCommand,
): MissionCommandResult {
  if (command.type === 'set-paused') {
    return {
      state: { ...current, paused: command.paused },
      message: command.paused ? 'Simulation clock paused.' : 'Simulation clock resumed.',
      severity: 'info',
    }
  }

  if (current.paused) {
    return rejectCommand(
      current,
      'Resume the simulation clock before issuing spacecraft commands.',
      'warning',
    )
  }

  if (command.type === 'set-instrument') {
    if (!hasScienceInstrument(record)) {
      return rejectCommand(
        current,
        'No science instrument is installed in this spacecraft configuration.',
        'warning',
        'Science instrument',
      )
    }
    if (command.active && current.batteryWh <= 0) {
      return rejectCommand(
        current,
        'Instrument start rejected: the spacecraft battery is depleted.',
        'critical',
        'Science instrument',
      )
    }
    const next = { ...current, instrumentActive: command.active }
    return {
      state: addEvent(
        next,
        current.elapsedSeconds,
        'info',
        'Science instrument',
        command.active
          ? `Started ${record.missionTelemetry.instrumentType} instrument.`
          : 'Science instrument placed in standby.',
      ),
      message: command.active
        ? `Instrument started; operating load is ${getInstrumentOperatingPowerW(record)} W.`
        : 'Instrument stopped; standby power draw remains.',
      severity: 'info',
    }
  }

  if (command.type === 'set-power-save') {
    const next = { ...current, powerSave: command.enabled }
    return {
      state: addEvent(
        next,
        current.elapsedSeconds,
        'info',
        'Power system',
        command.enabled
          ? 'Power-saving mode enabled; modeled base load reduced by 35%.'
          : 'Power-saving mode disabled; normal base load restored.',
      ),
      message: command.enabled
        ? 'Power-saving mode enabled; modeled base load reduced by 35%.'
        : 'Power-saving mode disabled; normal base load restored.',
      severity: 'info',
    }
  }

  if (command.type === 'set-observation-target') {
    const target = getObservationTargets(record.spacecraftId, record.destination)
      .find((option) => option.id === command.targetId)
    if (!target) {
      return rejectCommand(
        current,
        'Target selection rejected: this mission does not support that observation target.',
        'warning',
        'Science schedule',
      )
    }
    if (current.observationScheduled) {
      return rejectCommand(
        current,
        'Cancel or complete the scheduled observation before changing its target.',
        'warning',
        'Science schedule',
      )
    }
    const next = { ...current, observationTargetId: target.id }
    return {
      state: addEvent(next, current.elapsedSeconds, 'info', 'Science schedule', `Observation target set to ${target.name}.`),
      message: `Observation target set to ${target.name}.`,
      severity: 'info',
    }
  }

  if (command.type === 'schedule-observation') {
    if (!hasScienceInstrument(record)) {
      return rejectCommand(
        current,
        'Observation scheduling rejected: no science instrument is installed.',
        'warning',
        'Science instrument',
      )
    }
    if (current.observationScheduled) {
      return rejectCommand(
        current,
        'An observation is already scheduled for the next available opportunity.',
        'warning',
        'Science schedule',
      )
    }
    const target = getObservationTargets(record.spacecraftId, record.destination)
      .find((option) => option.id === current.observationTargetId)
    const next = { ...current, observationScheduled: true }
    return {
      state: addEvent(
        next,
        current.elapsedSeconds,
        'info',
        'Science schedule',
        `Observation of ${target?.name ?? 'the selected target'} scheduled for the next available window.`,
      ),
      message: 'Observation scheduled. It will acquire simulated data during the next open window when the instrument is active.',
      severity: 'info',
    }
  }

  if (command.type === 'cancel-observation') {
    if (!current.observationScheduled) {
      return rejectCommand(current, 'There is no pending observation to cancel.', 'warning', 'Science schedule')
    }
    const next = { ...current, observationScheduled: false }
    return {
      state: addEvent(next, current.elapsedSeconds, 'warning', 'Science schedule', 'Scheduled observation cancelled.'),
      message: 'Scheduled observation cancelled.',
      severity: 'warning',
    }
  }

  if (command.type === 'postpone-observation') {
    const next = {
      ...current,
      observationDelayMinutes: current.observationDelayMinutes + OBSERVATION_WINDOW_PERIOD_MINUTES,
    }
    return {
      state: addEvent(
        next,
        current.elapsedSeconds,
        'warning',
        'Science schedule',
        'Observation postponed to the next scheduled window.',
      ),
      message: 'Observation postponed; it will be available in the next scheduled window.',
      severity: 'warning',
    }
  }

  if (command.type === 'perform-observation') {
    if (!hasScienceInstrument(record)) {
      return rejectCommand(
        current,
        'Observation rejected: no science instrument is installed.',
        'warning',
        'Science instrument',
      )
    }
    if (!current.instrumentActive) {
      return rejectCommand(
        current,
        'Start the science instrument before beginning an observation.',
        'warning',
        'Science instrument',
      )
    }
    if (!isObservationWindow(current.elapsedSeconds, current.observationDelayMinutes)) {
      return rejectCommand(
        current,
        'Observation rejected: the scheduled observation window is not open.',
        'warning',
        'Science schedule',
      )
    }
    if (current.instrumentTemperatureC >= 65) {
      return rejectCommand(
        current,
        'Observation rejected: instrument temperature is above its operating limit.',
        'critical',
        'Science instrument',
      )
    }
    const remainingStorage = current.storageCapacityMb - current.storageUsedMb
    if (remainingStorage < OBSERVATION_DATA_MB) {
      return rejectCommand(
        current,
        'Observation rejected: insufficient onboard storage for the expected data.',
        'warning',
        'Data storage',
      )
    }

    const target = getObservationTargets(record.spacecraftId, record.destination)
      .find((option) => option.id === current.observationTargetId)
    const product: ObservationProduct = {
      id: current.observationsCompleted + 1,
      targetId: current.observationTargetId,
      targetName: target?.name ?? 'Mission target',
      body: target?.body ?? record.destination,
      acquiredAtMetSeconds: current.elapsedSeconds,
      dataMb: OBSERVATION_DATA_MB,
      status: 'onboard',
    }
    const next = {
      ...current,
      observationsCompleted: current.observationsCompleted + 1,
      observationScheduled: false,
      observationProducts: [...current.observationProducts, product].slice(-100),
      scienceDataMb: current.scienceDataMb + OBSERVATION_DATA_MB,
      storageUsedMb: current.storageUsedMb + OBSERVATION_DATA_MB,
    }
    return {
      state: addEvent(
        next,
        current.elapsedSeconds,
        'info',
        'Science instrument',
        `Observation completed; ${OBSERVATION_DATA_MB} MB of simulated science data recorded.`,
      ),
      message: `Observation completed. ${OBSERVATION_DATA_MB} MB added to onboard storage.`,
      severity: 'info',
    }
  }

  if (current.scienceDataMb <= 0) {
    return rejectCommand(
      current,
      'No recorded science data is available to downlink.',
      'warning',
      'Communications',
    )
  }

  if (!isCommunicationAvailable(record, current.elapsedSeconds)) {
    const next = current.downlinkQueued
      ? current
      : addEvent(
          { ...current, downlinkQueued: true },
          current.elapsedSeconds,
          'warning',
          'Communications',
          'Science-data downlink queued; no communications window is currently available.',
        )
    return {
      state: next,
      message: current.downlinkQueued
        ? 'Downlink is already queued and will transmit during the next available communications window.'
        : 'No link is available. Downlink queued for the next communications window.',
      severity: 'warning',
    }
  }

  const transmittedMb = current.scienceDataMb
  const next = {
    ...current,
    scienceDataMb: 0,
    storageUsedMb: Math.max(0, current.storageUsedMb - transmittedMb),
    dataDownlinkedMb: current.dataDownlinkedMb + transmittedMb,
    downlinkQueued: false,
    observationProducts: current.observationProducts.map((product) =>
      product.status === 'onboard' ? { ...product, status: 'downlinked' as const } : product,
    ),
  }
  return {
    state: addEvent(
      next,
      current.elapsedSeconds,
      'info',
      'Communications',
      `${transmittedMb} MB of science data downlinked successfully.`,
    ),
    message: `${transmittedMb} MB downlinked; onboard storage released.`,
    severity: 'info',
  }
}

export function advanceMissionControl(
  record: LaunchRecord,
  current: MissionControlState,
): MissionControlState {
  if (current.paused) return current

  const elapsedSeconds = current.elapsedSeconds + SIMULATION_SECONDS_PER_TICK
  const provisional = { ...current, elapsedSeconds }
  const generatedPowerW = record.missionTelemetry.power
  const consumedPowerW = getPowerConsumptionW(record, provisional)
  const energyDeltaWh =
    ((generatedPowerW - consumedPowerW) * SIMULATION_SECONDS_PER_TICK) / 3600
  let next: MissionControlState = {
    ...provisional,
    batteryWh: Math.min(
      current.batteryCapacityWh,
      Math.max(0, current.batteryWh + energyDeltaWh),
    ),
    instrumentTemperatureC: current.instrumentActive
      ? Math.min(100, current.instrumentTemperatureC + (SIMULATION_SECONDS_PER_TICK / 60) * 1.7)
      : Math.max(20, current.instrumentTemperatureC - (SIMULATION_SECONDS_PER_TICK / 60) * 1.1),
  }

  if (
    next.observationScheduled &&
    next.instrumentActive &&
    next.batteryWh > 0 &&
    isObservationWindow(elapsedSeconds, next.observationDelayMinutes) &&
    next.instrumentTemperatureC < 65 &&
    next.storageCapacityMb - next.storageUsedMb >= OBSERVATION_DATA_MB
  ) {
    const target = getObservationTargets(record.spacecraftId, record.destination)
      .find((option) => option.id === next.observationTargetId)
    const product: ObservationProduct = {
      id: next.observationsCompleted + 1,
      targetId: next.observationTargetId,
      targetName: target?.name ?? 'Mission target',
      body: target?.body ?? record.destination,
      acquiredAtMetSeconds: elapsedSeconds,
      dataMb: OBSERVATION_DATA_MB,
      status: 'onboard',
    }
    next = {
      ...next,
      observationsCompleted: next.observationsCompleted + 1,
      observationScheduled: false,
      observationProducts: [...next.observationProducts, product].slice(-100),
      scienceDataMb: next.scienceDataMb + OBSERVATION_DATA_MB,
      storageUsedMb: next.storageUsedMb + OBSERVATION_DATA_MB,
    }
    next = addEvent(
      next,
      elapsedSeconds,
      'info',
      'Science instrument',
      `Observation completed; ${OBSERVATION_DATA_MB} MB of simulated ${target?.name ?? 'mission-target'} data recorded.`,
    )
  }

  if (!current.communicationEstablished && isCommunicationAvailable(record, elapsedSeconds)) {
    next = {
      ...next,
      communicationEstablished: true,
    }
    next = addEvent(
      next,
      elapsedSeconds,
      'info',
      'Communications',
      'Simulated communications link established during the scheduled contact window.',
    )
  }

  if (
    !next.communicationEstablished &&
    !next.communicationWarningIssued &&
    elapsedSeconds >= 7 * 60
  ) {
    next = { ...next, communicationWarningIssued: true }
    next = addEvent(
      next,
      elapsedSeconds,
      'warning',
      'Communications',
      record.missionTelemetry.communication <= 0
        ? 'No communications capability was configured; a ground link cannot be established.'
        : 'No communications contact was established during the first scheduled window.',
    )
  }

  const batteryPercent = (next.batteryWh / next.batteryCapacityWh) * 100
  if (!next.batteryWarningIssued && batteryPercent <= 20) {
    next = { ...next, batteryWarningIssued: true }
    next = addEvent(
      next,
      elapsedSeconds,
      'warning',
      'Power system',
      'Battery reserve is at or below the 20% operational warning threshold.',
    )
  }
  if (!next.batteryCriticalIssued && batteryPercent <= 8) {
    next = { ...next, batteryCriticalIssued: true }
    next = addEvent(
      next,
      elapsedSeconds,
      'critical',
      'Power system',
      'Battery reserve is critically low; stop nonessential loads and enable power-saving mode.',
    )
  }

  if (
    next.instrumentActive &&
    next.instrumentTemperatureC >= 70 &&
    !next.instrumentOverheatIssued
  ) {
    next = {
      ...next,
      instrumentActive: false,
      instrumentOverheatIssued: true,
    }
    next = addEvent(
      next,
      elapsedSeconds,
      'critical',
      'Science instrument',
      'Instrument overheated at 70°C and was automatically placed in standby.',
    )
  }

  const storagePercent = (next.storageUsedMb / next.storageCapacityMb) * 100
  if (!next.storageWarningIssued && storagePercent >= 80) {
    next = { ...next, storageWarningIssued: true }
    next = addEvent(
      next,
      elapsedSeconds,
      'warning',
      'Data storage',
      'Onboard data storage has reached 80% capacity.',
    )
  }

  if (
    next.downlinkQueued &&
    next.scienceDataMb > 0 &&
    isCommunicationAvailable(record, elapsedSeconds)
  ) {
    const transmittedMb = next.scienceDataMb
    next = {
      ...next,
      scienceDataMb: 0,
      storageUsedMb: Math.max(0, next.storageUsedMb - transmittedMb),
      dataDownlinkedMb: next.dataDownlinkedMb + transmittedMb,
      downlinkQueued: false,
      observationProducts: next.observationProducts.map((product) =>
          product.status === 'onboard' ? { ...product, status: 'downlinked' as const } : product,
      ),
    }
    next = addEvent(
      next,
      elapsedSeconds,
      'info',
      'Communications',
      `Queued downlink transmitted ${transmittedMb} MB during the available contact window.`,
    )
  }

  const sample = makeSample(record, next, elapsedSeconds)
  return { ...next, history: [...next.history, sample].slice(-60) }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isValidSpacecraftBuild(value: unknown): value is SpacecraftBuild {
  if (!value || typeof value !== 'object') return false
  const build = value as Partial<SpacecraftBuild>
  return (
    Array.isArray(build.components) &&
    build.components.every((component) =>
      component === 'solarPanel' ||
      component === 'antenna' ||
      component === 'engine' ||
      component === 'instrument',
    ) &&
    new Set(build.components).size === build.components.length &&
    (build.solarPanelSize === 'small' || build.solarPanelSize === 'medium' || build.solarPanelSize === 'large') &&
    (build.antennaType === 'standard' || build.antennaType === 'highGain' || build.antennaType === 'deepSpace') &&
    (build.engineType === 'chemical' || build.engineType === 'ion' || build.engineType === 'nuclear') &&
    (build.instrumentType === 'camera' || build.instrumentType === 'spectrometer' || build.instrumentType === 'radar') &&
    typeof build.instrumentCount === 'number' &&
    Number.isInteger(build.instrumentCount) &&
    build.instrumentCount >= 1 &&
    build.instrumentCount <= 4
  )
}

function isValidLaunchRecord(value: unknown): value is LaunchRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<LaunchRecord>
  const telemetry = record.missionTelemetry
  const planning = record.planningSnapshot
  const vehicle = record.launchVehicle
  return (
    record.outcome === 'success' &&
    (record.mode === 'mission' || record.mode === 'freeplay') &&
    typeof record.missionName === 'string' &&
    typeof record.spacecraftName === 'string' &&
    typeof record.spacecraftType === 'string' &&
    !!record.spacecraftModel &&
    typeof record.spacecraftModel === 'object' &&
    ('format' in record.spacecraftModel) &&
    (record.spacecraftModel.format === 'glb' ||
      record.spacecraftModel.format === 'stl' ||
      record.spacecraftModel.format === 'unavailable') &&
    isFiniteNumber(record.attemptId) &&
    Number.isInteger(record.attemptId) &&
    record.attemptId > 0 &&
    isFiniteNumber(record.spacecraftMassKg) &&
    record.spacecraftMassKg >= 0 &&
    isFiniteNumber(record.spacecraftReliability) &&
    record.spacecraftReliability >= 0 &&
    record.spacecraftReliability <= 100 &&
    isFiniteNumber(record.totalMissionCostMillions) &&
    isFiniteNumber(record.missionBudgetMillions) &&
    !!planning &&
    typeof planning.launchDate === 'string' &&
    (planning.destinationBodyId === null || typeof planning.destinationBodyId === 'string') &&
    Array.isArray(planning.ephemerides) &&
    (planning.transferEstimate === null || typeof planning.transferEstimate === 'object') &&
    !!telemetry &&
    isFiniteNumber(telemetry.power) &&
    telemetry.power >= 0 &&
    isFiniteNumber(telemetry.deltaV) &&
    isFiniteNumber(telemetry.communication) &&
    telemetry.communication >= 0 &&
    telemetry.communication <= 100 &&
    isFiniteNumber(telemetry.instruments) &&
    Number.isInteger(telemetry.instruments) &&
    telemetry.instruments >= 0 &&
    telemetry.instruments <= 4 &&
    (telemetry.instrumentType === 'camera' ||
      telemetry.instrumentType === 'spectrometer' ||
      telemetry.instrumentType === 'radar') &&
    isFiniteNumber(telemetry.science) &&
    isFiniteNumber(telemetry.resourceEfficiency) &&
    (telemetry.sustainabilityLevel === 'High' ||
      telemetry.sustainabilityLevel === 'Medium' ||
      telemetry.sustainabilityLevel === 'Low') &&
    !!vehicle &&
    typeof vehicle.id === 'string' &&
    typeof vehicle.name === 'string' &&
    isFiniteNumber(vehicle.payloadCapacityKg) &&
    isFiniteNumber(vehicle.launchCostMillions) &&
    Array.isArray(record.missionRequirementResults) &&
    (record.spacecraftBuild === undefined || isValidSpacecraftBuild(record.spacecraftBuild))
  )
}

function isValidSession(value: unknown): value is MissionControlSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<MissionControlSession>
  if (
    session.version !== 1 ||
    typeof session.missionId !== 'string' ||
    typeof session.missionTitle !== 'string' ||
    typeof session.missionObjective !== 'string' ||
    typeof session.missionGoalId !== 'string' ||
    !(session.campaignMissionId === null || typeof session.campaignMissionId === 'string') ||
    !isValidLaunchRecord(session.record) ||
    !session.state ||
    !isFiniteNumber(session.state.elapsedSeconds) ||
    typeof session.state.paused !== 'boolean' ||
    !isFiniteNumber(session.state.batteryWh) ||
    !isFiniteNumber(session.state.batteryCapacityWh) ||
    typeof session.state.powerSave !== 'boolean' ||
    typeof session.state.instrumentActive !== 'boolean' ||
    !isFiniteNumber(session.state.instrumentTemperatureC) ||
    !isFiniteNumber(session.state.storageUsedMb) ||
    !isFiniteNumber(session.state.storageCapacityMb) ||
    !isFiniteNumber(session.state.scienceDataMb) ||
    !isFiniteNumber(session.state.dataDownlinkedMb) ||
    !isFiniteNumber(session.state.observationsCompleted) ||
    !isFiniteNumber(session.state.observationDelayMinutes) ||
    typeof session.state.downlinkQueued !== 'boolean' ||
    typeof session.state.communicationEstablished !== 'boolean' ||
    typeof session.state.communicationWarningIssued !== 'boolean' ||
    typeof session.state.batteryWarningIssued !== 'boolean' ||
    typeof session.state.batteryCriticalIssued !== 'boolean' ||
    typeof session.state.storageWarningIssued !== 'boolean' ||
    typeof session.state.instrumentOverheatIssued !== 'boolean' ||
    !isFiniteNumber(session.state.nextEventId) ||
    !Array.isArray(session.state.events) ||
    !Array.isArray(session.state.history)
  ) return false
  const savedObservationTargetId = session.state.observationTargetId
  return (
    session.state.elapsedSeconds >= 0 &&
    session.state.batteryCapacityWh > 0 &&
    session.state.batteryWh >= 0 &&
    session.state.batteryWh <= session.state.batteryCapacityWh &&
    session.state.instrumentTemperatureC >= 20 &&
    session.state.instrumentTemperatureC <= 100 &&
    session.state.storageCapacityMb > 0 &&
    session.state.storageUsedMb >= 0 &&
    session.state.storageUsedMb <= session.state.storageCapacityMb &&
    session.state.scienceDataMb >= 0 &&
    session.state.scienceDataMb <= session.state.storageUsedMb &&
    session.state.dataDownlinkedMb >= 0 &&
    Number.isInteger(session.state.observationsCompleted) &&
    session.state.observationsCompleted >= 0 &&
    (session.state.observationTargetId === undefined ||
      (typeof session.state.observationTargetId === 'string' &&
        getObservationTargets(session.record.spacecraftId, session.record.destination)
          .some((target) => target.id === savedObservationTargetId))) &&
    (session.state.observationScheduled === undefined ||
      typeof session.state.observationScheduled === 'boolean') &&
    (session.state.observationProducts === undefined ||
      (Array.isArray(session.state.observationProducts) &&
        session.state.observationProducts.length <= 100 &&
        session.state.observationProducts.every((product) =>
          !!product &&
          Number.isInteger(product.id) &&
          product.id > 0 &&
          typeof product.targetId === 'string' &&
          typeof product.targetName === 'string' &&
          typeof product.body === 'string' &&
          isFiniteNumber(product.acquiredAtMetSeconds) &&
          product.acquiredAtMetSeconds >= 0 &&
          isFiniteNumber(product.dataMb) &&
          product.dataMb > 0 &&
          (product.status === 'onboard' || product.status === 'downlinked'),
        ))) &&
    Number.isInteger(session.state.observationDelayMinutes) &&
    session.state.observationDelayMinutes >= 0 &&
    Number.isInteger(session.state.nextEventId) &&
    session.state.events.length <= 100 &&
    session.state.history.length <= 60 &&
    session.state.events.every((event) =>
      !!event &&
      Number.isInteger(event.id) &&
      typeof event.subsystem === 'string' &&
      isFiniteNumber(event.elapsedSeconds) &&
      event.elapsedSeconds >= 0 &&
      (event.severity === 'info' || event.severity === 'warning' || event.severity === 'critical') &&
      typeof event.message === 'string',
    ) &&
    session.state.history.every((sample) =>
      !!sample &&
      isFiniteNumber(sample.elapsedSeconds) &&
      sample.elapsedSeconds >= 0 &&
      isFiniteNumber(sample.batteryPercent) &&
      sample.batteryPercent >= 0 &&
      sample.batteryPercent <= 100 &&
      isFiniteNumber(sample.generatedPowerW) &&
      sample.generatedPowerW >= 0 &&
      isFiniteNumber(sample.consumedPowerW) &&
      sample.consumedPowerW >= 0 &&
      isFiniteNumber(sample.instrumentTemperatureC) &&
      sample.instrumentTemperatureC >= 20 &&
      sample.instrumentTemperatureC <= 100 &&
      isFiniteNumber(sample.storagePercent),
    )
  )
}

export function loadMissionControlSession(): {
  session: MissionControlSession | null
  warning: string | null
} {
  try {
    const stored = window.localStorage.getItem(MISSION_CONTROL_STORAGE_KEY)
    if (!stored) return { session: null, warning: null }
    const parsed: unknown = JSON.parse(stored)
    if (!isValidSession(parsed)) {
      const warning = 'Saved Mission Control state was invalid and could not be restored.'
      console.warn(warning)
      return { session: null, warning }
    }
    return {
      session: {
        ...parsed,
        state: {
          ...parsed.state,
          observationTargetId: parsed.state.observationTargetId ?? getDefaultObservationTargetId(parsed.record),
          observationScheduled: parsed.state.observationScheduled ?? false,
          observationProducts: parsed.state.observationProducts ?? [],
        },
      },
      warning: null,
    }
  } catch (error) {
    const warning = 'Mission Control state could not be loaded from this browser.'
    console.error(warning, error)
    return { session: null, warning }
  }
}

export function saveMissionControlSession(session: MissionControlSession): string | null {
  try {
    window.localStorage.setItem(MISSION_CONTROL_STORAGE_KEY, JSON.stringify(session))
    return null
  } catch (error) {
    console.error('Mission Control state could not be saved to this browser.', error)
    return 'Mission Control progress could not be saved. Check this browser’s storage settings.'
  }
}

export function clearMissionControlSession(): string | null {
  try {
    window.localStorage.removeItem(MISSION_CONTROL_STORAGE_KEY)
    return null
  } catch (error) {
    console.error('Mission Control state could not be removed from this browser.', error)
    return 'The previous Mission Control session could not be cleared from this browser.'
  }
}
