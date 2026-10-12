import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { availableSpacecraftCatalog } from '../../data/spacecraft'
import { createInitialBuild } from '../../data/spacecraftBuild'
import { ObservationConsole } from './ObservationConsole'
import {
  executeMissionCommand,
  getInstrumentOperatingPowerW,
  getNextObservationWindowMinute,
  getPowerConsumptionW,
  hasScienceInstrument,
  isCommunicationAvailable,
  isObservationWindow,
  type MissionCommand,
  type MissionControlSession,
  type MissionEventSeverity,
} from '../../data/missionControlSimulation'

const SpacecraftViewer = lazy(() =>
  import('../3d/SpacecraftViewer').then((module) => ({ default: module.SpacecraftViewer })),
)

type MissionControlTab =
  | 'Overview'
  | 'Telemetry'
  | 'Commands'
  | 'Observation Console'
  | 'Science Data'
  | 'Events'
  | 'Mission Settings'

interface MissionControlProps {
  initialSession: MissionControlSession
  onSessionChange: (session: MissionControlSession) => void
  onReturnToOverview: () => void
  onRunMissionAssessment: () => void
  persistenceWarning: string | null
}

const tabs: MissionControlTab[] = [
  'Overview',
  'Telemetry',
  'Commands',
  'Observation Console',
  'Science Data',
  'Events',
  'Mission Settings',
]

const severityStyles: Record<MissionEventSeverity, string> = {
  info: 'border-sky-300/15 bg-sky-300/[0.04] text-sky-100',
  warning: 'border-amber-300/25 bg-amber-300/[0.06] text-amber-100',
  critical: 'border-rose-300/30 bg-rose-300/[0.08] text-rose-100',
}

function formatMet(seconds: number) {
  const totalSeconds = Math.floor(seconds)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  return `${days ? `D+${days} ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function formatDuration(seconds: number) {
  return `${Math.max(0, Math.ceil(seconds / 60))} min`
}

function getPhase(session: MissionControlSession) {
  if (session.state.elapsedSeconds < 120) return 'SPACECRAFT COMMISSIONING'
  if (session.state.elapsedSeconds < 300) return 'EARLY OPERATIONS'
  return 'MISSION OPERATIONS'
}

function getSpacecraft(session: MissionControlSession) {
  return availableSpacecraftCatalog.find(
    (spacecraft) =>
      spacecraft.id === session.record.spacecraftId ||
      spacecraft.name === session.record.spacecraftName,
  )
}

function getEventTime(seconds: number) {
  return `MET ${formatMet(seconds)}`
}

function Panel({
  title,
  eyebrow,
  children,
  className = '',
}: {
  title: string
  eyebrow?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`min-w-0 border border-slate-700/60 bg-[#07111d] ${className}`}>
      <header className="border-b border-slate-700/50 px-4 py-3">
        {eyebrow && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.22em] text-cyan-300/75">
            {eyebrow}
          </p>
        )}
        <h2 className="mt-1 text-xs font-semibold uppercase tracking-[0.13em] text-slate-100">
          {title}
        </h2>
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Metric({
  label,
  value,
  detail,
  accent = 'text-slate-50',
}: {
  label: string
  value: string
  detail: string
  accent?: string
}) {
  return (
    <div className="border-l border-slate-700/70 pl-3">
      <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${accent}`}>{value}</p>
      <p className="mt-1 text-[10px] text-slate-500">{detail}</p>
    </div>
  )
}

function TelemetryChart({
  samples,
  value,
  color,
  label,
  unit,
}: {
  samples: number[]
  value: number
  color: string
  label: string
  unit: string
}) {
  const points = samples.length ? samples : [value]
  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = Math.max(max - min, 1)
  const path = points
    .map((sample, index) => {
      const x = points.length === 1 ? 100 : (index / (points.length - 1)) * 100
      const y = 34 - ((sample - min) / range) * 26
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`
    })
    .join(' ')

  return (
    <div className="border border-slate-800 bg-[#050c14] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-400">{label}</p>
        <p className="text-xs font-semibold tabular-nums text-white">{value.toLocaleString()} {unit}</p>
      </div>
      <svg
        viewBox="0 0 100 40"
        preserveAspectRatio="none"
        className="mt-2 h-14 w-full"
        role="img"
        aria-label={`${label} trend, current value ${value} ${unit}`}
      >
        <path d="M 0 36 H 100 M 0 20 H 100" stroke="#334155" strokeWidth="0.4" />
        <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <p className="mt-1 text-[9px] text-slate-600">Recent simulated samples · MET</p>
    </div>
  )
}

function MissionObjectives({ session }: { session: MissionControlSession }) {
  const { state } = session
  const operations = [
    { label: 'Launch vehicle deployed spacecraft', complete: true },
    { label: 'Establish communications contact', complete: state.communicationEstablished },
    { label: 'Collect a scheduled science observation', complete: state.observationsCompleted > 0 },
    { label: 'Downlink recorded science data', complete: state.dataDownlinkedMb > 0 },
  ]

  return (
    <ol className="space-y-3">
      {operations.map((item, index) => (
        <li key={item.label} className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center border text-[10px] ${
              item.complete
                ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200'
                : 'border-slate-700 text-slate-500'
            }`}
            aria-label={item.complete ? 'Complete' : 'Pending'}
          >
            {item.complete ? '✓' : String(index + 1).padStart(2, '0')}
          </span>
          <span className={`text-xs leading-relaxed ${item.complete ? 'text-slate-100' : 'text-slate-400'}`}>
            {item.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

function MissionCommands({
  session,
  dispatch,
  result,
}: {
  session: MissionControlSession
  dispatch: (command: MissionCommand) => void
  result: { message: string; severity: MissionEventSeverity } | null
}) {
  const { state, record } = session
  const instrumentInstalled = hasScienceInstrument(record)
  const observationOpen = isObservationWindow(
    state.elapsedSeconds,
    state.observationDelayMinutes,
  )
  const communicationsOpen = isCommunicationAvailable(record, state.elapsedSeconds)
  const nextWindow = getNextObservationWindowMinute(
    state.elapsedSeconds,
    state.observationDelayMinutes,
  )
  const canObserve =
    instrumentInstalled &&
    state.instrumentActive &&
    observationOpen &&
    state.instrumentTemperatureC < 65 &&
    state.storageCapacityMb - state.storageUsedMb >= 128 &&
    !state.paused

  const buttonClass =
    'flex min-h-11 w-full items-center justify-between gap-3 border px-3 py-2.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40'

  return (
    <div className="space-y-3">
      <div className="border border-slate-700/60 bg-[#050c14] p-3">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Current operational constraints
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-300">
          {observationOpen
            ? 'Science observation window is open.'
            : `Next observation window opens in approximately ${formatDuration(nextWindow * 60 - state.elapsedSeconds)}.`}
          {' '}
          {communicationsOpen ? 'Communications link is available.' : 'No communications contact at this MET.'}
        </p>
      </div>

      <button
        type="button"
        disabled={state.paused || !instrumentInstalled || state.batteryWh <= 0}
        onClick={() => dispatch({ type: 'set-instrument', active: !state.instrumentActive })}
        className={`${buttonClass} border-slate-700 bg-slate-900/70 text-slate-100 hover:border-cyan-300/35 hover:bg-slate-800`}
      >
        <span>
          <strong className="block font-semibold">
            {state.instrumentActive ? 'Stand by science instrument' : 'Start science instrument'}
          </strong>
          <span className="mt-1 block text-[10px] text-slate-500">
            {instrumentInstalled
              ? `${state.instrumentActive ? 'Operating' : 'Standby'} load · ${state.instrumentActive ? getInstrumentOperatingPowerW(record) : 18 * record.missionTelemetry.instruments} W`
              : 'No instrument in the saved spacecraft configuration'}
          </span>
        </span>
        <span className="text-cyan-200">{state.instrumentActive ? 'STOP' : 'START'}</span>
      </button>

      <button
        type="button"
        disabled={state.paused || state.powerSave}
        onClick={() => dispatch({ type: 'set-power-save', enabled: true })}
        className={`${buttonClass} border-emerald-300/20 bg-emerald-300/[0.04] text-emerald-50 hover:bg-emerald-300/[0.08]`}
      >
        <span>
          <strong className="block font-semibold">Enable power-saving mode</strong>
          <span className="mt-1 block text-[10px] text-slate-500">
            Reduces modeled base load by 35%; instrument remains independently controlled.
          </span>
        </span>
        <span className="text-emerald-200">{state.powerSave ? 'ON' : 'SAVE'}</span>
      </button>

      <button
        type="button"
      disabled={state.paused || !instrumentInstalled || state.observationsCompleted > 0}
        onClick={() => dispatch({ type: 'postpone-observation' })}
        className={`${buttonClass} border-amber-300/20 bg-amber-300/[0.035] text-amber-50 hover:bg-amber-300/[0.08]`}
      >
        <span>
          <strong className="block font-semibold">Postpone next observation</strong>
          <span className="mt-1 block text-[10px] text-slate-500">
            Move the planned window to the next scheduled opportunity.
          </span>
        </span>
        <span className="text-amber-200">DEFER</span>
      </button>

      <button
        type="button"
        disabled={!canObserve}
        onClick={() => dispatch({ type: 'perform-observation' })}
        className={`${buttonClass} border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50 hover:bg-cyan-300/[0.13]`}
      >
        <span>
          <strong className="block font-semibold">Run scheduled observation</strong>
          <span className="mt-1 block text-[10px] text-slate-500">
            Requires an active instrument, open window, and 128 MB free storage.
          </span>
        </span>
        <span className="text-cyan-200">SCIENCE</span>
      </button>

      <button
        type="button"
        disabled={state.paused || state.scienceDataMb <= 0 || state.downlinkQueued}
        onClick={() => dispatch({ type: 'downlink' })}
        className={`${buttonClass} border-sky-300/20 bg-sky-300/[0.04] text-sky-50 hover:bg-sky-300/[0.09]`}
      >
        <span>
          <strong className="block font-semibold">
            {state.downlinkQueued ? 'Science downlink queued' : 'Transmit stored science data'}
          </strong>
          <span className="mt-1 block text-[10px] text-slate-500">
            {communicationsOpen
              ? 'Link open · available data can be transmitted now.'
              : 'If the link is unavailable, the request queues for the next contact.'}
          </span>
        </span>
        <span className="text-sky-200">{state.downlinkQueued ? 'QUEUED' : 'DOWNLINK'}</span>
      </button>

      {result && (
        <p
          className={`border p-3 text-xs leading-relaxed ${severityStyles[result.severity]}`}
          role="status"
          aria-live="polite"
        >
          {result.message}
        </p>
      )}

      <p className="text-[10px] leading-relaxed text-slate-600">
        Commands change this mission’s shared simulation state. They do not control or communicate with a real spacecraft.
      </p>
    </div>
  )
}

function EventList({ events }: { events: MissionControlSession['state']['events'] }) {
  if (events.length === 0) {
    return <p className="text-xs text-slate-500">No mission events have been recorded.</p>
  }
  return (
    <ol className="space-y-2">
      {events.map((event) => (
        <li key={event.id} className={`border p-3 ${severityStyles[event.severity]}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[9px] font-bold uppercase tracking-[0.16em]">
              {event.severity} · {event.subsystem}
            </span>
            <time className="text-[9px] tabular-nums text-slate-500">{getEventTime(event.elapsedSeconds)}</time>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-slate-200">{event.message}</p>
        </li>
      ))}
    </ol>
  )
}

export function MissionControl({
  initialSession,
  onSessionChange,
  onReturnToOverview,
  onRunMissionAssessment,
  persistenceWarning,
}: MissionControlProps) {
  const session = initialSession
  const [activeTab, setActiveTab] = useState<MissionControlTab>('Overview')
  const [commandResult, setCommandResult] = useState<{
    message: string
    severity: MissionEventSeverity
  } | null>(null)
  const [eventSeverity, setEventSeverity] = useState<'all' | MissionEventSeverity>('all')
  const [eventSubsystem, setEventSubsystem] = useState('all')
  const { state, record } = session
  const spacecraft = getSpacecraft(session)
  const spacecraftBuild = record.spacecraftBuild ?? createInitialBuild()
  const communicationOpen = isCommunicationAvailable(record, state.elapsedSeconds)
  const consumptionW = getPowerConsumptionW(record, state)
  const batteryPercent = Math.round((state.batteryWh / state.batteryCapacityWh) * 100)
  const storagePercent = Math.round((state.storageUsedMb / state.storageCapacityMb) * 100)
  const linkLabel = record.missionTelemetry.communication <= 0
    ? 'NO LINK CONFIGURED'
    : communicationOpen
      ? 'CONTACT AVAILABLE'
      : state.communicationEstablished
        ? 'BETWEEN CONTACTS'
        : 'ACQUIRING SIGNAL'
  const health = Math.max(
    0,
    Math.min(
      100,
      record.spacecraftReliability -
        (batteryPercent <= 8 ? 22 : batteryPercent <= 20 ? 10 : 0) -
        (state.instrumentTemperatureC >= 65 ? 8 : 0),
    ),
  )
  const isSurfaceMission = /rover|helicopter|lander/i.test(record.spacecraftType)
  const trendSamples = useMemo(() => state.history, [state.history])
  const visibleEvents = state.events.filter(
    (event) =>
      (eventSeverity === 'all' || event.severity === eventSeverity) &&
      (eventSubsystem === 'all' || event.subsystem === eventSubsystem),
  )
  const subsystems = [...new Set(state.events.map((event) => event.subsystem))]
  const observationEvents = state.events
    .filter(
      (event) =>
        event.subsystem === 'Science instrument' &&
        event.message.startsWith('Observation completed'),
    )
    .reverse()

  const dispatch = (command: MissionCommand) => {
    const result = executeMissionCommand(record, state, command)
    onSessionChange({ ...session, state: result.state })
    setCommandResult({ message: result.message, severity: result.severity })
  }

  const header = (
    <>
      <header className="border-b border-cyan-300/15 bg-[#050c14]/95">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center border border-cyan-300/30 bg-cyan-300/[0.06] text-xs font-bold tracking-widest text-cyan-100">
                MC
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.27em] text-cyan-300/70">
                  AMPLIFY VISION · FLIGHT OPERATIONS
                </p>
                <h1 className="mt-1 truncate text-lg font-semibold tracking-wide text-white sm:text-xl">
                  {session.missionTitle}
                </h1>
                <p className="mt-1 truncate text-xs text-slate-400">
                  {record.spacecraftName} <span className="px-1 text-slate-700">/</span> {record.destination}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4 lg:min-w-[580px] lg:gap-6">
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-500">Mission elapsed</p>
                <p className="mt-1 font-mono text-sm tabular-nums text-slate-100">{formatMet(state.elapsedSeconds)}</p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-500">Flight phase</p>
                <p className="mt-1 text-[10px] font-semibold tracking-wide text-cyan-100">{getPhase(session)}</p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-500">Spacecraft health</p>
                <p className={`mt-1 text-xs font-semibold ${health >= 70 ? 'text-emerald-300' : health >= 40 ? 'text-amber-300' : 'text-rose-300'}`}>
                  {health}% · {health >= 70 ? 'NOMINAL' : health >= 40 ? 'DEGRADED' : 'CRITICAL'}
                </p>
              </div>
              <div>
                <p className="text-[8px] font-semibold uppercase tracking-[0.15em] text-slate-500">Communications</p>
                <p className={`mt-1 text-[10px] font-semibold ${communicationOpen ? 'text-emerald-300' : 'text-amber-200'}`}>
                  {linkLabel}
                </p>
              </div>
            </div>
          </div>

          <nav aria-label="Mission Control sections" className="-mb-4 flex gap-1 overflow-x-auto border-t border-slate-800/80 pt-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                aria-current={activeTab === tab ? 'page' : undefined}
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 border-b-2 px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
                  activeTab === tab
                    ? 'border-cyan-300 text-cyan-100'
                    : 'border-transparent text-slate-500 hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
            <button
              type="button"
              onClick={onReturnToOverview}
              className="ml-auto shrink-0 border-b-2 border-transparent px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 transition hover:text-white"
            >
              Return to Mission Overview
            </button>
          </nav>
        </div>
      </header>
    </>
  )

  const content = (() => {
    if (activeTab === 'Overview') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
          <div className="space-y-4">
            <Panel title="Spacecraft flight deck" eyebrow="Live model · configuration preserved">
              {spacecraft ? (
                <Suspense fallback={<div className="grid h-[430px] place-items-center bg-[#020912] text-xs text-slate-400">Loading selected spacecraft asset…</div>}>
                  <SpacecraftViewer spacecraft={spacecraft} build={spacecraftBuild} />
                </Suspense>
              ) : (
                <div className="grid h-[300px] place-items-center border border-slate-800 bg-[#020912] p-6 text-center">
                  <div>
                    <p className="text-sm font-semibold text-white">{record.spacecraftName}</p>
                    <p className="mt-2 text-xs text-slate-400">
                      The saved mission contains a model reference, but this spacecraft is not in the current model catalogue.
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                Drag to rotate and scroll to zoom. Rendered model follows the selected spacecraft asset; unsupported components are not inferred.
              </p>
            </Panel>

            <Panel title="Mission objectives" eyebrow="Operational milestones · campaign assessment remains separate">
              <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.8fr)]">
                <MissionObjectives session={session} />
                <div className="border-l border-slate-800 pl-4">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                    Primary objective
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-200">{session.missionObjective}</p>
                  <p className="mt-3 border-t border-slate-800 pt-3 text-[10px] leading-relaxed text-amber-100/75">
                    Mission completion is not inferred from deployment or this simplified operations checklist. Use the separate mission assessment for campaign scoring.
                  </p>
                </div>
              </div>
            </Panel>
          </div>

          <div className="space-y-4">
            <Panel title={isSurfaceMission ? 'Surface operations context' : 'Mission geometry'} eyebrow="Simplified simulation · not flight navigation">
              <div className="grid grid-cols-2 gap-4">
                <Metric label={isSurfaceMission ? 'Operating environment' : 'Destination'} value={record.destination} detail={isSurfaceMission ? 'Surface mission profile' : 'Selected mission target'} accent="text-cyan-100" />
                <Metric label="Launch vehicle" value={record.launchVehicle.name} detail={`${record.spacecraftMassKg.toLocaleString()} kg recorded launch mass`} />
              </div>
              <div className="mt-4 border border-slate-800 bg-[#050c14] p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {isSurfaceMission ? 'Surface link' : 'Trajectory state'}
                  </span>
                  <span className={`text-[9px] font-bold uppercase tracking-wide ${communicationOpen ? 'text-emerald-300' : 'text-amber-200'}`}>
                    {communicationOpen ? 'CONTACT WINDOW OPEN' : 'CONTACT WINDOW CLOSED'}
                  </span>
                </div>
                <div className="relative mt-4 h-14 overflow-hidden border-y border-slate-800/70">
                  <div className="absolute inset-x-3 top-1/2 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
                  <span className="absolute left-[10%] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,.65)]" />
                  <span className="absolute right-[12%] top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-amber-200/70 bg-amber-200/20" />
                  <span className="absolute left-[10%] top-1 mt-1 text-[8px] uppercase tracking-wider text-slate-600">Spacecraft</span>
                  <span className="absolute right-[5%] top-1 mt-1 text-[8px] uppercase tracking-wider text-slate-600">Target</span>
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                  This diagram shows mission context only. Orbital altitude, velocity, distance, and a propagated trajectory are not modeled here.
                </p>
              </div>
            </Panel>

            <Panel title="Telemetry snapshot" eyebrow="Illustrative operations model">
              <div className="grid grid-cols-2 gap-y-5">
                <Metric label="Battery reserve" value={`${batteryPercent}%`} detail={`${state.batteryWh.toFixed(0)} / ${state.batteryCapacityWh} Wh`} accent={batteryPercent <= 20 ? 'text-amber-200' : 'text-emerald-200'} />
                <Metric label="Power balance" value={`${record.missionTelemetry.power - consumptionW} W`} detail={`${record.missionTelemetry.power} W generation · ${consumptionW} W load`} />
                <Metric label="Instrument temp." value={`${state.instrumentTemperatureC.toFixed(1)}°C`} detail={state.instrumentActive ? 'Instrument operating' : 'Instrument standby'} accent={state.instrumentTemperatureC >= 65 ? 'text-amber-200' : 'text-slate-100'} />
                <Metric label="Data storage" value={`${storagePercent}%`} detail={`${state.storageUsedMb} / ${state.storageCapacityMb} MB`} />
              </div>
            </Panel>

            <Panel title="Latest operations events" eyebrow="Simulation clock">
              <EventList events={state.events.slice(0, 4)} />
            </Panel>
          </div>
        </div>
      )
    }

    if (activeTab === 'Telemetry') {
      const batterySamples = trendSamples.map((sample) => sample.batteryPercent)
      const loadSamples = trendSamples.map((sample) => sample.consumedPowerW)
      const temperatureSamples = trendSamples.map((sample) => sample.instrumentTemperatureC)
      const storageSamples = trendSamples.map((sample) => sample.storagePercent)
      return (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Panel title="Power reserve"><TelemetryChart samples={batterySamples} value={batteryPercent} color="#34d399" label="Battery" unit="%" /></Panel>
            <Panel title="Electrical load"><TelemetryChart samples={loadSamples} value={consumptionW} color="#67e8f9" label="Spacecraft load" unit="W" /></Panel>
            <Panel title="Thermal"><TelemetryChart samples={temperatureSamples} value={Math.round(state.instrumentTemperatureC * 10) / 10} color="#fbbf24" label="Instrument temperature" unit="°C" /></Panel>
            <Panel title="Data system"><TelemetryChart samples={storageSamples} value={storagePercent} color="#a78bfa" label="Storage utilization" unit="%" /></Panel>
          </div>
          <Panel title="Subsystem state table" eyebrow="Current mission configuration and modeled telemetry">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead className="border-b border-slate-700 text-[9px] uppercase tracking-[0.14em] text-slate-500">
                  <tr><th className="py-2 pr-4">Subsystem</th><th className="py-2 pr-4">Measurement</th><th className="py-2 pr-4">Current value</th><th className="py-2">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  <tr><th className="py-3 pr-4 font-medium text-slate-200">Power</th><td className="py-3 pr-4 text-slate-400">Generation / load</td><td className="py-3 pr-4 tabular-nums text-white">{record.missionTelemetry.power} / {consumptionW} W</td><td className="py-3 text-emerald-200">SIMULATED</td></tr>
                  <tr><th className="py-3 pr-4 font-medium text-slate-200">Battery</th><td className="py-3 pr-4 text-slate-400">Stored energy</td><td className="py-3 pr-4 tabular-nums text-white">{state.batteryWh.toFixed(1)} Wh</td><td className={`py-3 ${batteryPercent <= 20 ? 'text-amber-200' : 'text-emerald-200'}`}>{batteryPercent <= 20 ? 'LOW RESERVE' : 'NOMINAL'}</td></tr>
                  <tr><th className="py-3 pr-4 font-medium text-slate-200">Communications</th><td className="py-3 pr-4 text-slate-400">Design capability</td><td className="py-3 pr-4 tabular-nums text-white">{record.missionTelemetry.communication}% link margin</td><td className={`py-3 ${communicationOpen ? 'text-emerald-200' : 'text-amber-200'}`}>{linkLabel}</td></tr>
                  <tr><th className="py-3 pr-4 font-medium text-slate-200">Science instrument</th><td className="py-3 pr-4 text-slate-400">Operating state</td><td className="py-3 pr-4 text-white">{hasScienceInstrument(record) ? record.missionTelemetry.instrumentType : 'Not installed'}</td><td className="py-3 text-cyan-100">{state.instrumentActive ? 'ACTIVE' : 'STANDBY'}</td></tr>
                  <tr><th className="py-3 pr-4 font-medium text-slate-200">Data storage</th><td className="py-3 pr-4 text-slate-400">Used / capacity</td><td className="py-3 pr-4 tabular-nums text-white">{state.storageUsedMb} / {state.storageCapacityMb} MB</td><td className={`py-3 ${storagePercent >= 80 ? 'text-amber-200' : 'text-emerald-200'}`}>{storagePercent >= 80 ? 'CAPACITY WARNING' : 'AVAILABLE'}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-600">
              These values are generated by the game’s simplified model from the saved build and commands. They are not real-world spacecraft telemetry.
            </p>
          </Panel>
        </div>
      )
    }

    if (activeTab === 'Commands') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.7fr)]">
          <Panel title="Command console" eyebrow="Validated against current mission state">
            <MissionCommands session={session} dispatch={dispatch} result={commandResult} />
          </Panel>
          <div className="space-y-4">
            <Panel title="Command authorization" eyebrow="Mission systems">
              <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                <p>Instrument commands require an installed instrument and available spacecraft power.</p>
                <p>Observations require an open schedule window, an active instrument, acceptable temperature, and adequate storage.</p>
                <p>Data transmission requires stored science data. When contact is unavailable, the downlink is queued and sent during the next modeled window.</p>
              </div>
            </Panel>
            <Panel title="Recent command history" eyebrow="Operations log">
              <EventList events={state.events.filter((event) => ['Science instrument', 'Power system', 'Science schedule', 'Communications'].includes(event.subsystem)).slice(0, 6)} />
            </Panel>
          </div>
        </div>
      )
    }

    if (activeTab === 'Science Data') {
      return (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.75fr)]">
          <Panel title="Science instrument status" eyebrow="Selected mission payload">
            <div className="grid gap-5 sm:grid-cols-2">
              <Metric label="Configured instrument" value={hasScienceInstrument(record) ? record.missionTelemetry.instrumentType : 'None'} detail={`${record.missionTelemetry.instruments} installed`} accent="text-cyan-100" />
              <Metric label="Instrument state" value={state.instrumentActive ? 'ACTIVE' : 'STANDBY'} detail={`${state.instrumentTemperatureC.toFixed(1)}°C · operating limit 65°C`} accent={state.instrumentTemperatureC >= 65 ? 'text-amber-200' : 'text-slate-100'} />
              <Metric label="Observations completed" value={String(state.observationsCompleted)} detail="Scheduled observation opportunities" />
              <Metric label="Science data stored" value={`${state.scienceDataMb} MB`} detail={`${state.dataDownlinkedMb} MB downlinked`} />
            </div>
            <div className="mt-5 border-t border-slate-800 pt-4">
              <MissionCommands session={session} dispatch={dispatch} result={commandResult} />
            </div>
          </Panel>
          <div className="space-y-4">
            <Panel title="Storage allocation" eyebrow="Onboard recorder">
              <div className="flex items-end justify-between gap-4">
                <p className="font-mono text-2xl tabular-nums text-white">{state.storageUsedMb}<span className="text-sm text-slate-500"> / {state.storageCapacityMb} MB</span></p>
                <p className={`text-xs font-bold ${storagePercent >= 80 ? 'text-amber-200' : 'text-emerald-200'}`}>{storagePercent}%</p>
              </div>
              <div className="mt-3 h-2 overflow-hidden bg-slate-800">
                <div className={`h-full transition-all ${storagePercent >= 80 ? 'bg-amber-300' : 'bg-cyan-300'}`} style={{ width: `${storagePercent}%` }} />
              </div>
              <p className="mt-3 text-[10px] leading-relaxed text-slate-500">
                A completed observation records 128 MB of illustrative data. A successful downlink transfers data and releases its onboard storage.
              </p>
            </Panel>
            <Panel title="Data products" eyebrow="Mission record">
              {state.observationsCompleted > 0 ? (
                <ul className="space-y-2">
                  {observationEvents.map((event, index) => (
                    <li key={event.id} className="flex justify-between gap-3 border-b border-slate-800 pb-2 text-xs last:border-0">
                      <span className="text-slate-200">Science observation {String(index + 1).padStart(2, '0')}</span>
                      <span className="text-slate-500">128 MB · {getEventTime(event.elapsedSeconds)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs leading-relaxed text-slate-500">
                  No science data recorded yet. Start the configured instrument and run an observation during its scheduled window.
                </p>
              )}
            </Panel>
          </div>
        </div>
      )
    }

    if (activeTab === 'Observation Console') {
      return <ObservationConsole session={session} dispatch={dispatch} result={commandResult} />
    }

    if (activeTab === 'Events') {
      return (
        <Panel title="Mission event log" eyebrow={`${state.events.length} recorded events · timestamps use MET`}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <label className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Severity
              <select value={eventSeverity} onChange={(event) => setEventSeverity(event.target.value as typeof eventSeverity)} className="mt-1 block w-full border border-slate-700 bg-[#050c14] px-3 py-2 text-xs normal-case tracking-normal text-slate-100">
                <option value="all">All severities</option>
                <option value="info">Informational</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              Subsystem
              <select value={eventSubsystem} onChange={(event) => setEventSubsystem(event.target.value)} className="mt-1 block w-full border border-slate-700 bg-[#050c14] px-3 py-2 text-xs normal-case tracking-normal text-slate-100">
                <option value="all">All subsystems</option>
                {subsystems.map((subsystem) => <option key={subsystem} value={subsystem}>{subsystem}</option>)}
              </select>
            </label>
          </div>
          <EventList events={visibleEvents} />
        </Panel>
      )
    }

    return (
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Mission configuration snapshot" eyebrow="Read-only · recorded at launch">
          <dl className="grid gap-3 sm:grid-cols-2">
            {[
              ['Mission', session.missionTitle],
              ['Objective', session.missionObjective],
              ['Spacecraft', record.spacecraftName],
              ['Spacecraft class', record.spacecraftType],
              ['Destination', record.destination],
              ['Launch vehicle', record.launchVehicle.name],
              ['Configured generation', `${record.missionTelemetry.power.toLocaleString()} W`],
              ['Communications design', `${record.missionTelemetry.communication}%`],
              ['Installed instruments', `${record.missionTelemetry.instruments} · ${record.missionTelemetry.instrumentType}`],
              ['Launch mass', `${record.spacecraftMassKg.toLocaleString()} kg`],
            ].map(([label, value]) => (
              <div key={label} className="border-b border-slate-800 pb-2">
                <dt className="text-[9px] uppercase tracking-[0.12em] text-slate-500">{label}</dt>
                <dd className="mt-1 text-xs leading-relaxed text-slate-100">{value}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <div className="space-y-4">
          <Panel title="Simulation assumptions" eyebrow="Transparent game model">
            <ul className="space-y-2 text-[10px] leading-relaxed text-slate-400">
              <li>Mission elapsed time advances 15 simulated seconds per real second while the clock is running.</li>
              <li>Battery capacity is an illustrative 1,200 Wh. Charge changes from configured power generation minus modeled subsystem load.</li>
              <li>Communications use repeating contact windows; this is not a propagated ground-station schedule.</li>
              <li>Instrument thermal response, storage, and science data volumes are simplified gameplay variables.</li>
              <li>Orbital mechanics, propellant usage, fuel limits, and spacecraft navigation are not simulated in Mission Control.</li>
            </ul>
          </Panel>
          <Panel title="Operations controls" eyebrow="Clock and assessment">
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => dispatch({ type: 'set-paused', paused: !state.paused })}
                className="w-full border border-cyan-300/25 bg-cyan-300/[0.06] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-cyan-100 transition hover:bg-cyan-300/[0.1]"
              >
                {state.paused ? 'Resume simulation clock' : 'Pause simulation clock'}
              </button>
              {record.mode === 'mission' && (
                <button
                  type="button"
                  onClick={onRunMissionAssessment}
                  className="w-full border border-emerald-300/30 bg-emerald-300/[0.07] px-4 py-3 text-xs font-bold uppercase tracking-[0.14em] text-emerald-100 transition hover:bg-emerald-300/[0.12]"
                >
                  Run separate campaign assessment
                </button>
              )}
              <p className="text-[10px] leading-relaxed text-slate-600">
                The assessment evaluates recorded design requirements; it does not convert launch or operations into an automatic mission success.
              </p>
            </div>
          </Panel>
        </div>
      </div>
    )
  })()

  return (
    <main className="min-h-screen bg-[#03080e] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 opacity-[0.035]" style={{ backgroundImage: 'linear-gradient(rgba(148,163,184,.65) 1px,transparent 1px),linear-gradient(90deg,rgba(148,163,184,.65) 1px,transparent 1px)', backgroundSize: '52px 52px' }} />
      <div className="relative">
        {header}
        <div className="mx-auto max-w-[1800px] space-y-4 px-4 py-5 sm:px-6 lg:px-8">
          {persistenceWarning && (
            <p className="border border-amber-300/30 bg-amber-300/[0.06] p-3 text-xs text-amber-100" role="status">
              {persistenceWarning}
            </p>
          )}
          {state.events[0]?.severity !== 'info' && (
            <div className={`flex flex-col justify-between gap-2 border px-4 py-3 sm:flex-row sm:items-center ${severityStyles[state.events[0].severity]}`} role="status">
              <p className="text-xs font-semibold">{state.events[0].severity.toUpperCase()} · {state.events[0].message}</p>
              <span className="text-[9px] text-slate-400">{getEventTime(state.events[0].elapsedSeconds)}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-800/80 py-2">
            <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">
              Mission status <span className="ml-2 text-cyan-100">{getPhase(session)}</span>
              <span className="mx-2 text-slate-700">/</span>
              Operations simulation <span className="text-amber-200">ILLUSTRATIVE</span>
            </p>
            <button
              type="button"
              onClick={() => dispatch({ type: 'set-paused', paused: !state.paused })}
              className={`border px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.12em] transition ${
                state.paused
                  ? 'border-amber-300/30 bg-amber-300/[0.06] text-amber-100'
                  : 'border-slate-700 text-slate-400 hover:border-cyan-300/30 hover:text-cyan-100'
              }`}
            >
              {state.paused ? 'Resume clock' : 'Pause clock'}
            </button>
          </div>
          {content}
          <footer className="flex flex-col justify-between gap-3 border-t border-slate-800 pt-4 text-[9px] text-slate-600 sm:flex-row sm:items-center">
            <span>AMPLIFY VISION · SIMULATED SPACECRAFT OPERATIONS</span>
            <span>Mission elapsed time: {formatMet(state.elapsedSeconds)} · {record.mode === 'mission' ? 'Campaign design assessment remains distinct' : 'Freeplay operations record'}</span>
          </footer>
        </div>
      </div>
    </main>
  )
}
