import { lazy, Suspense } from 'react'
import { heliocentricBodies } from '../../data/planetaryData'
import { distanceBetween, estimateHohmannTransfer } from '../../data/missionPlanner'
import type { HorizonsPosition } from '../../data/horizonsService'

const SolarSystemScene = lazy(() =>
  import('./SolarSystemScene').then((module) => ({ default: module.SolarSystemScene })),
)

interface SolarSystemPlannerProps {
  mode: 'mission' | 'freeplay'
  launchDate: string
  onLaunchDateChange: (date: string) => void
  positions: HorizonsPosition[]
  loading: boolean
  errors: string[]
  selectedBodyId: string
  selectedDestinationId: string
  onSelectBody: (bodyId: string) => void
  onSetDestination: (destinationId: string) => void
  planningOnly?: boolean
  planningOnlyTitle?: string
  planningOnlySourceUrl?: string
  planningOnlyIsLiveEvent?: boolean
}

function formatAu(value: number) {
  return `${value.toFixed(3)} AU`
}

function shiftDate(date: string, days: number) {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)
  return shifted.toISOString().slice(0, 10)
}

export function SolarSystemPlanner({
  mode,
  launchDate,
  onLaunchDateChange,
  positions,
  loading,
  errors,
  selectedBodyId,
  selectedDestinationId,
  onSelectBody,
  onSetDestination,
  planningOnly = false,
  planningOnlyTitle,
  planningOnlySourceUrl,
  planningOnlyIsLiveEvent = false,
}: SolarSystemPlannerProps) {
  const byBody = new Map(positions.map((position) => [position.bodyId, position]))
  const earth = byBody.get('earth')
  const selectedBody = heliocentricBodies.find((body) => body.id === selectedBodyId) ?? heliocentricBodies[0]
  const selectedPosition = byBody.get(selectedBody.id)
  const earthSeparation = earth && selectedPosition ? distanceBetween(earth, selectedPosition) : null
  const estimate =
    earth && selectedPosition && selectedBody.id !== 'earth'
      ? estimateHohmannTransfer(earth, selectedPosition)
      : null

  if (planningOnly) {
    return (
      <section className="rounded-[28px] border border-amber-200/15 bg-slate-900/75 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-amber-200/80">
          {planningOnlyIsLiveEvent
            ? 'JPL close-approach context · no orbital solution'
            : 'Mission planning context · no trajectory solution'}
        </p>
        <h2 className="mt-2 text-xl font-semibold text-white">Small-body planning exercise</h2>
        {planningOnlyTitle && <p className="mt-2 text-xs text-slate-300">{planningOnlyTitle}</p>}
        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate-400">
          {planningOnlyIsLiveEvent
            ? 'The event record provides close-approach observations, not an asteroid trajectory for this spacecraft. Planetary vectors cannot substitute for that object’s orbit. This exercise calculates no asteroid orbit, transfer time, intercept, or launch window.'
            : 'The current planner provides planetary positions, not an orbit or trajectory for this small body. This exercise calculates no asteroid orbit, transfer time, intercept, or launch window; evaluate the spacecraft design using the listed engineering constraints only.'}
        </p>
        {planningOnlySourceUrl && (
          <a href={planningOnlySourceUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex text-[10px] font-medium text-sky-200 underline underline-offset-2">
            {planningOnlyIsLiveEvent ? 'Review the saved JPL source record ↗' : 'Review the official mission reference ↗'}
          </a>
        )}
      </section>
    )
  }

  return (
    <section className="rounded-[28px] border border-cyan-300/15 bg-slate-900/75 p-5 shadow-[0_15px_55px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-200/80">
            JPL Horizons · live planetary vectors
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Date-based mission planner</h2>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
            Heliocentric ecliptic J2000 positions for the chosen UTC date. Campaign destination and objectives remain fixed.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Show positions 30 days earlier"
            onClick={() => onLaunchDateChange(shiftDate(launchDate, -30))}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
          >
            −30 d
          </button>
          <label className="sr-only" htmlFor="planner-date">Planner UTC date</label>
          <input
            id="planner-date"
            type="date"
            value={launchDate}
            onChange={(event) => {
              if (event.target.value) onLaunchDateChange(event.target.value)
            }}
            className="min-w-0 rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-white"
          />
          <button
            type="button"
            aria-label="Show positions 30 days later"
            onClick={() => onLaunchDateChange(shiftDate(launchDate, 30))}
            className="rounded-xl border border-white/10 px-3 py-2 text-xs text-slate-200 hover:bg-white/5"
          >
            +30 d
          </button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div>
          <div
            className="relative aspect-[1.8] overflow-hidden rounded-2xl border border-white/8 bg-[#050d17]"
            role="group"
            aria-label={`Interactive 3D heliocentric positions for ${launchDate}; visual radii are compressed and planet sizes are not to scale`}
          >
            {positions.length > 0 && (
              <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-xs text-slate-300">Preparing 3D planetary scene…</div>}>
                <SolarSystemScene
                  positions={positions}
                  selectedBodyId={selectedBody.id}
                  onSelectBody={onSelectBody}
                />
              </Suspense>
            )}
            {loading && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/60 text-xs text-slate-200" role="status" aria-live="polite">
                Loading Horizons ephemerides…
              </div>
            )}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
            Visualization compresses radial distance logarithmically; it is not to scale. Calculations use the uncompressed Horizons vectors.
          </p>
          {errors.length > 0 && (
            <p className="mt-2 rounded-xl border border-amber-300/15 bg-amber-300/5 p-3 text-xs text-amber-100" role="status">
              Some positions could not be refreshed ({errors.length}). Cached matching-date data may be shown; planning remains optional and launches work offline.
              <span className="mt-1 block text-amber-100/75">{errors[0]}</span>
            </p>
          )}
        </div>

        <aside className="rounded-2xl border border-white/8 bg-slate-950/40 p-4">
          <label htmlFor="planner-body" className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
            Planetary target
          </label>
          <select
            id="planner-body"
            value={selectedBody.id}
            onChange={(event) => onSelectBody(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white"
          >
            {heliocentricBodies.map((body) => (
              <option key={body.id} value={body.id}>{body.name}</option>
            ))}
          </select>
          <dl className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Sun distance</dt>
              <dd className="text-right text-slate-100">{selectedPosition ? formatAu(selectedPosition.distanceAu) : '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Earth separation</dt>
              <dd className="text-right text-slate-100">{earthSeparation === null ? '—' : formatAu(earthSeparation)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-slate-400">Data source</dt>
              <dd className="text-right text-slate-100">{selectedPosition?.source === 'live' ? 'JPL Horizons' : selectedPosition ? 'Browser cache' : loading ? 'Loading' : 'Unavailable'}</dd>
            </div>
          </dl>
          {estimate && (
            <div className="mt-4 border-t border-white/8 pt-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-cyan-100">Preliminary transfer estimate</p>
              <p className="mt-2 text-xs text-white">~{Math.round(estimate.transferDays)} days · ~{estimate.totalDeltaVKmS.toFixed(2)} km/s heliocentric Δv</p>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">{estimate.assumption}</p>
              <p className="mt-2 text-[10px] text-amber-200/80">Not a launch window, flight plan, or game launch requirement.</p>
            </div>
          )}
          {selectedBody.id === 'earth' && (
            <p className="mt-4 text-[10px] leading-relaxed text-slate-400">
              Earth-orbit and lunar destinations are local mission targets and do not use this interplanetary transfer estimate.
            </p>
          )}
          {selectedBody.id === 'jupiter' && selectedDestinationId === 'europa' && (
            <p className="mt-3 text-[10px] leading-relaxed text-amber-100/80">
              Europa uses Jupiter’s planetary position as a proxy; this is not Europa’s ephemeris.
            </p>
          )}
          {mode === 'freeplay' ? (
            <button
              type="button"
              disabled={!selectedBody.destinationId || selectedDestinationId === selectedBody.destinationId}
              onClick={() => selectedBody.destinationId && onSetDestination(selectedBody.destinationId)}
              className="mt-4 w-full rounded-xl border border-cyan-300/20 bg-cyan-300/10 px-3 py-2.5 text-xs font-semibold text-cyan-50 transition hover:bg-cyan-300/15 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {selectedBody.destinationId ? 'Set as Freeplay destination' : 'No game destination for this body'}
            </button>
          ) : (
            <p className="mt-4 rounded-xl border border-violet-300/15 bg-violet-300/5 p-3 text-[10px] leading-relaxed text-violet-100">
              Inspection only — {selectedDestinationId} remains the campaign’s prescribed destination.
            </p>
          )}
        </aside>
      </div>
    </section>
  )
}
