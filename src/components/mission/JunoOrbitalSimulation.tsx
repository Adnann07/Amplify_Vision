import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  createApproximateJunoTrajectory,
  extendJunoHorizonsTrajectory,
  JUNO_NASA_REFERENCE_URL,
  JUNO_TRAJECTORY_DAYS,
  loadJunoHorizonsTrajectory,
  type JunoTrajectory,
  type JunoTrajectoryPosition,
} from '../../data/junoTrajectory'

const JunoOrbitalScene = lazy(() =>
  import('./JunoOrbitalScene').then((module) => ({ default: module.JunoOrbitalScene })),
)

const simulationSpeeds = [1, 60, 3_600, 86_400]
const EXTEND_TRAJECTORY_REMAINING_SECONDS =
  (JUNO_TRAJECTORY_DAYS - 14) * 24 * 60 * 60

function formatUtc(timestamp: number) {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(timestamp) + ' UTC'
}

function formatKilometers(value: number) {
  return `${Math.round(value).toLocaleString()} km`
}

function formatSpeed(speed: number) {
  return `${speed.toLocaleString()}×`
}

function TelemetryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] gap-3 border-b border-white/8 py-3 last:border-0">
      <dt className="text-[10px] uppercase tracking-[0.13em] text-slate-400">{label}</dt>
      <dd className="break-words text-right text-xs tabular-nums text-slate-100">{value}</dd>
    </div>
  )
}

export function JunoOrbitalSimulation({ onBack }: { onBack: () => void }) {
  const [trajectory, setTrajectory] = useState<JunoTrajectory>(() =>
    createApproximateJunoTrajectory(),
  )
  const [simulationTimeMs, setSimulationTimeMs] = useState(trajectory.startTimeMs)
  const [currentUtcMs, setCurrentUtcMs] = useState(() => Date.now())
  const [position, setPosition] = useState<JunoTrajectoryPosition>(() =>
    trajectory.samples[0],
  )
  const [playing, setPlaying] = useState(true)
  const [speed, setSpeed] = useState(3_600)
  const [resetKey, setResetKey] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const [fetching, setFetching] = useState(true)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [extensionFailed, setExtensionFailed] = useState(false)
  const [coverageEnded, setCoverageEnded] = useState(false)
  const [extensionRetryKey, setExtensionRetryKey] = useState(0)
  const resumeAfterExtensionRef = useRef(false)
  const extensionControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void loadJunoHorizonsTrajectory(Date.now(), controller.signal)
      .then((updatedTrajectory) => {
        if (controller.signal.aborted) return
        setTrajectory(updatedTrajectory)
        setSimulationTimeMs(updatedTrajectory.startTimeMs)
        setPosition(updatedTrajectory.samples[0])
        setResetKey((current) => current + 1)
        setCoverageEnded(false)
        setPlaying(true)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setRequestError(
          error instanceof Error
            ? error.message
            : 'JPL Horizons vectors are unavailable; the documented approximate orbit is active.',
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setFetching(false)
      })

    return () => controller.abort()
  }, [refreshKey])

  const lastTrajectorySample = trajectory.samples[trajectory.samples.length - 1]
  const remainingTrajectorySeconds =
    lastTrajectorySample.elapsedSeconds - (simulationTimeMs - trajectory.startTimeMs) / 1000
  const shouldExtendTrajectory = trajectory.mode === 'horizons' &&
    remainingTrajectorySeconds > 0 &&
    remainingTrajectorySeconds <= EXTEND_TRAJECTORY_REMAINING_SECONDS
  const extending = shouldExtendTrajectory && !extensionFailed

  useEffect(() => {
    if (!shouldExtendTrajectory) return

    const controller = new AbortController()
    extensionControllerRef.current = controller
    void extendJunoHorizonsTrajectory(trajectory, controller.signal)
      .then((extendedTrajectory) => {
        if (controller.signal.aborted) return
        setTrajectory(extendedTrajectory)
        setExtensionFailed(false)
        setRequestError(null)
        setCoverageEnded(false)
        setPlaying((currentlyPlaying) => {
          const shouldResume = currentlyPlaying || resumeAfterExtensionRef.current
          resumeAfterExtensionRef.current = false
          return shouldResume
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setExtensionFailed(true)
        setRequestError(
          error instanceof Error
            ? error.message
            : 'JPL Horizons could not extend the Juno ephemeris interval.',
        )
      })

    return () => {
      controller.abort()
      if (extensionControllerRef.current === controller) {
        extensionControllerRef.current = null
      }
    }
  }, [extensionRetryKey, shouldExtendTrajectory, trajectory])

  useEffect(() => {
    if (!extensionFailed || !shouldExtendTrajectory) return
    const retryTimer = window.setTimeout(
      () => setExtensionRetryKey((current) => current + 1),
      5_000,
    )
    return () => window.clearTimeout(retryTimer)
  }, [extensionFailed, extensionRetryKey, shouldExtendTrajectory])

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentUtcMs(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  const updateTelemetry = useCallback((
    nextSimulationTime: number,
    nextPosition: JunoTrajectoryPosition,
    ended: boolean,
  ) => {
    setSimulationTimeMs(nextSimulationTime)
    setPosition(nextPosition)
    if (ended) {
      setCoverageEnded(true)
      setPlaying((currentlyPlaying) => {
        resumeAfterExtensionRef.current = currentlyPlaying
        return false
      })
    }
  }, [])

  const resetSimulation = () => {
    setSimulationTimeMs(trajectory.startTimeMs)
    setPosition(trajectory.samples[0])
    setCoverageEnded(false)
    setPlaying(false)
    setResetKey((current) => current + 1)
  }

  const refreshTrajectory = () => {
    extensionControllerRef.current?.abort()
    setExtensionFailed(false)
    setFetching(true)
    setRequestError(null)
    setRefreshKey((current) => current + 1)
  }

  const approximate = trajectory.mode === 'approximate'
  const simulationUtc = formatUtc(simulationTimeMs)

  return (
    <main className="min-h-screen bg-[#030912] px-4 py-6 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <button
          type="button"
          onClick={onBack}
          className="mb-5 border border-white/15 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/40 hover:text-white"
        >
          ← Game modes
        </button>

        <header className="mb-5 flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-cyan-200/75">
              Jupiter-centered mission visualization
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Juno orbital simulation
            </h1>
            <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-400">
              Juno moves along a Jupiter-relative trajectory. Its displayed orbital distances are
              compressed so the spacecraft and planet remain visible together; telemetry distances
              remain in kilometers.
            </p>
          </div>
          <span className={`w-fit border px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em] ${
            approximate
              ? 'border-amber-200/25 bg-amber-300/5 text-amber-100'
              : 'border-cyan-200/25 bg-cyan-300/5 text-cyan-100'
          }`}>
            {approximate ? 'Approximate orbital simulation' : 'JPL Horizons ephemeris'}
          </span>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section
            className="relative min-h-[430px] overflow-hidden border border-white/10 bg-[#030912] sm:aspect-[1.55] sm:min-h-[540px]"
            aria-label="Juno spacecraft moving along its Jupiter-centered orbital trajectory"
          >
            <Suspense fallback={
              <div className="absolute inset-0 grid place-items-center text-xs text-slate-300">
                Preparing Juno orbital scene…
              </div>
            }>
              <JunoOrbitalScene
                trajectory={trajectory}
                simulationStartTimeMs={trajectory.startTimeMs}
                playing={playing}
                speed={speed}
                resetKey={resetKey}
                onTelemetry={updateTelemetry}
              />
            </Suspense>
            <div className="pointer-events-none absolute left-4 top-4 border border-white/10 bg-slate-950/75 px-3 py-2 backdrop-blur">
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-100">Jupiter</p>
              <p className="mt-1 text-[9px] text-slate-400">Planet and distances not to scale</p>
            </div>
            <div className="pointer-events-none absolute bottom-4 left-4 border border-cyan-200/20 bg-slate-950/75 px-3 py-2 text-[9px] text-cyan-100 backdrop-blur">
              Drag to rotate · scroll to zoom
            </div>
          </section>

          <aside className="flex flex-col gap-4 border border-white/10 bg-[#07111d] p-4 sm:p-5">
            <section>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-cyan-200/75">
                Mission telemetry
              </p>
              <dl className="mt-2">
                <TelemetryRow label="Spacecraft" value="Juno" />
                <TelemetryRow label="Target" value="Jupiter" />
                <TelemetryRow label="Current UTC" value={formatUtc(currentUtcMs)} />
                <TelemetryRow label="Simulation time" value={simulationUtc} />
                <TelemetryRow
                  label="Trajectory mode"
                  value={approximate ? 'Approximate simulation' : 'Horizons ephemeris vectors'}
                />
                <TelemetryRow label="Distance from Jupiter" value={formatKilometers(position.distanceKm)} />
                <TelemetryRow label="X position" value={formatKilometers(position.xKm)} />
                <TelemetryRow label="Y position" value={formatKilometers(position.yKm)} />
                <TelemetryRow label="Z position" value={formatKilometers(position.zKm)} />
                <TelemetryRow label="Data source" value={trajectory.source} />
                <TelemetryRow label="Last update" value={formatUtc(trajectory.fetchedAt)} />
              </dl>
            </section>

            {approximate && (
              <p className="border border-amber-200/15 bg-amber-300/[0.04] p-3 text-[10px] leading-relaxed text-amber-100/90" role="status">
                These are modeled positions, not NASA spacecraft coordinates. The fallback uses a
                simplified 53-day polar orbit and a nominal 4,200 km perijove altitude from NASA’s
                mission description.
                {' '}
                <a
                  href={JUNO_NASA_REFERENCE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  NASA Juno mission reference
                </a>
              </p>
            )}

            {requestError && (
              <p className="border border-amber-200/15 bg-amber-300/[0.04] p-3 text-[10px] leading-relaxed text-amber-100/90" role="status">
                {extensionFailed
                  ? 'Horizons extension failed; retrying automatically while the current trajectory remains available.'
                  : approximate
                  ? 'Horizons ephemeris is unavailable; showing the clearly labeled approximate orbit.'
                  : 'Horizons refresh failed; continuing with the last valid ephemeris data.'}
                <span className="mt-1 block text-amber-100/70">{requestError}</span>
              </p>
            )}

            {!approximate && (
              <p className="text-[10px] leading-relaxed text-slate-400">
                Positions are NASA/JPL Horizons geometric vectors for target -61 relative to Jupiter
                center 599, interpolated between the returned three-hour samples. They are not a
                live spacecraft telemetry stream.
              </p>
            )}

            <section className="mt-auto border-t border-white/10 pt-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[9px] font-semibold uppercase tracking-[0.17em] text-slate-400">
                  Simulation controls
                </span>
                <label className="flex items-center gap-2 text-[10px] text-slate-300">
                  Time scale
                  <select
                    aria-label="Simulation time scale"
                    value={speed}
                    onChange={(event) => setSpeed(Number(event.target.value))}
                    className="border border-white/15 bg-slate-950 px-2 py-1.5 text-xs text-white"
                  >
                    {simulationSpeeds.map((option) => (
                      <option key={option} value={option}>{formatSpeed(option)}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setPlaying((value) => !value)}
                  disabled={coverageEnded}
                  className="border border-cyan-200/25 bg-cyan-300/[0.08] px-2 py-2.5 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/[0.15]"
                >
                  {coverageEnded
                    ? extending ? 'Extending…' : extensionFailed ? 'Retrying…' : 'Window end'
                    : playing ? 'Pause' : 'Resume'}
                </button>
                <button
                  type="button"
                  onClick={resetSimulation}
                  className="border border-white/15 px-2 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/35"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={refreshTrajectory}
                  disabled={fetching}
                  className="border border-white/15 px-2 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-white/35 disabled:opacity-50"
                >
                  {fetching ? 'Updating…' : 'Refresh data'}
                </button>
              </div>
              {extending && (
                <p className="mt-3 text-[9px] text-cyan-100/70" role="status">
                  Extending the Horizons trajectory ahead of playback…
                </p>
              )}
              {approximate && (
                <p className="mt-3 text-[9px] text-slate-500">
                  {fetching
                    ? 'Checking JPL Horizons; the approximate model is moving in the meantime.'
                    : 'The approximate fallback repeats its modeled orbit until Horizons data is available.'}
                </p>
              )}
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
