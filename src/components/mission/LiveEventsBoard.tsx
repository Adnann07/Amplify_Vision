import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createEventCampaignMission,
  fetchRealTimeEvents,
  filterRealTimeEvents,
  getEventCampaignMissionId,
  loadCachedRealTimeEvents,
  saveCachedRealTimeEvents,
  type RealTimeEvent,
  type RealTimeEventCategory,
  type RealTimeEventProvider,
  type RealTimeEventsResponse,
  type RealTimeProviderStatus,
} from '../../data/realTimeEvents'
import type { CampaignMission } from '../../data/campaign'
import { formatTimestamp } from './liveEventFormatting'

interface LiveEventsBoardProps {
  onBack: () => void
  onOpenCampaign: () => void
  onCreateMission: (mission: CampaignMission) => void
  savedMissionIds: string[]
}

const providerNames: Record<RealTimeEventProvider, string> = {
  noaa: 'NOAA Space Weather',
  eonet: 'NASA EONET',
  jpl: 'NASA/JPL Close Approaches',
}
const categoryNames: Record<RealTimeEventCategory, string> = {
  'space-weather': 'Space weather',
  'earth-observation': 'Earth events',
  'asteroid-investigation': 'Asteroid close approaches',
}
const statusLabels: Record<RealTimeProviderStatus, string> = {
  live: 'Live',
  cached: 'Cached',
  stale: 'Stale · last good data',
  unavailable: 'Unavailable',
}
const emptyStatus = (): RealTimeEventsResponse['providers'] => ({
  noaa: { provider: 'noaa', status: 'unavailable', lastSuccessfulRequestAt: null },
  eonet: { provider: 'eonet', status: 'unavailable', lastSuccessfulRequestAt: null },
  jpl: { provider: 'jpl', status: 'unavailable', lastSuccessfulRequestAt: null },
})

function asStaleCache(cache: RealTimeEventsResponse): RealTimeEventsResponse {
  return {
    ...cache,
    providers: Object.fromEntries(
      Object.entries(cache.providers).map(([provider, state]) => [
        provider,
        { ...state, status: state.status === 'unavailable' ? 'unavailable' : 'stale' },
      ]),
    ) as RealTimeEventsResponse['providers'],
    events: cache.events.map((event) => ({
      ...event,
      freshness: cache.providers[event.provider].status === 'unavailable' ? 'unavailable' : 'stale',
    })),
  }
}

function formatMeasurement(value: number, unit: string | null) {
  return `${value.toLocaleString(undefined, { maximumSignificantDigits: 7 })}${unit ? ` ${unit}` : ''}`
}

export function LiveEventsBoard({
  onBack,
  onOpenCampaign,
  onCreateMission,
  savedMissionIds,
}: LiveEventsBoardProps) {
  const [data, setData] = useState<RealTimeEventsResponse>(() => loadCachedRealTimeEvents() ?? {
    retrievedAt: '',
    events: [],
    providers: emptyStatus(),
  })
  const [category, setCategory] = useState<RealTimeEventCategory | 'all'>('all')
  const [provider, setProvider] = useState<RealTimeEventProvider | 'all'>('all')
  const [search, setSearch] = useState('')
  const [selectedEvent, setSelectedEvent] = useState<RealTimeEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [storageNotice, setStorageNotice] = useState<string | null>(null)

  const refreshEvents = useCallback(async (force = false, signal?: AbortSignal, showLoading = true) => {
    if (showLoading) setLoading(true)
    setError(null)
    try {
      const response = await fetchRealTimeEvents({ force, signal })
      setData(response)
      const notice = saveCachedRealTimeEvents(response)
      setStorageNotice(notice)
    } catch (cause) {
      if (signal?.aborted) return
      const message = cause instanceof Error ? cause.message : 'Live event feeds could not be loaded.'
      setError(message)
      setData((current) => {
        if (current.events.length) return asStaleCache(current)
        const saved = loadCachedRealTimeEvents()
        return saved ? asStaleCache(saved) : current
      })
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const initialRequest = window.setTimeout(() => {
      void refreshEvents(false, controller.signal, false)
    }, 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshEvents(false)
    }, 60 * 60_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void refreshEvents(false)
    }
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => {
      controller.abort()
      window.clearTimeout(initialRequest)
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [refreshEvents])

  const visibleEvents = useMemo(() => {
    return filterRealTimeEvents(data.events, category, provider, search)
  }, [category, data.events, provider, search])
  const savedMissionIdSet = useMemo(() => new Set(savedMissionIds), [savedMissionIds])

  const createMission = async (event: RealTimeEvent) => {
    setCreating(true)
    setError(null)
    try {
      const response = await fetch(
        `/api/real-time-events/${event.provider}/${encodeURIComponent(event.providerEventId)}`,
      )
      const body: unknown = await response.json()
      if (!response.ok || !body || typeof body !== 'object' || !('event' in body)) {
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : 'The selected event could not be verified against its provider feed.'
        throw new Error(message)
      }
      const verified = (body as { event: RealTimeEvent }).event
      if (!verified.eligible) throw new Error(verified.ineligibleReason ?? 'This event is no longer eligible for a mission exercise.')
      onCreateMission(createEventCampaignMission(verified))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The design exercise could not be created.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <main className="min-h-screen bg-[#020912] px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-7 flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white">
            ← Game modes
          </button>
          <button type="button" onClick={onOpenCampaign} className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-white/25 hover:text-white">
            Mission campaign
          </button>
          <button
            type="button"
            onClick={() => void refreshEvents(true)}
            disabled={loading}
            className="ml-auto rounded-lg border border-emerald-200/20 bg-emerald-200/10 px-4 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-200/15 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'Refreshing feeds…' : 'Refresh feeds'}
          </button>
        </div>

        <header className="mb-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-emerald-300">Live data · simulated mission exercises</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Real-Time Events</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400">
            Browse NOAA space-weather alerts, NASA EONET Earth events, and JPL close approaches. Provider observations are kept separate from the game’s spacecraft assessments and mission outcomes.
          </p>
          <p className="mt-2 text-[11px] text-slate-500" aria-live="polite">
            Last board update: {formatTimestamp(data.retrievedAt || null)} · feeds refresh hourly while this board is open.
          </p>
        </header>

        <section aria-label="Provider freshness" className="mb-5 grid gap-3 sm:grid-cols-3">
          {(['noaa', 'eonet', 'jpl'] as const).map((name) => {
            const state = data.providers[name]
            const status = state.status
            return (
              <article key={name} className="rounded-2xl border border-white/10 bg-slate-900/65 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xs font-semibold text-white">{providerNames[name]}</h2>
                  <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${status === 'live' ? 'bg-emerald-300/10 text-emerald-200' : status === 'stale' ? 'bg-amber-300/10 text-amber-200' : status === 'unavailable' ? 'bg-rose-300/10 text-rose-200' : 'bg-sky-300/10 text-sky-200'}`}>
                    {statusLabels[status]}
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-slate-500">Last successful fetch: {formatTimestamp(state.lastSuccessfulRequestAt)}</p>
                {state.error && <p className="mt-2 text-[10px] text-amber-200">{state.error}</p>}
                {state.truncated && <p className="mt-2 text-[10px] text-amber-200">Showing a bounded provider result ({state.totalAvailable ?? 'more'} records available).</p>}
              </article>
            )
          })}
        </section>

        {(error || storageNotice) && (
          <div role="status" className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs text-amber-100">
            {error && <p>{error} {data.events.length ? 'Showing the last saved events as stale.' : 'Try refreshing when the feeds are reachable.'}</p>}
            {storageNotice && <p>{storageNotice}</p>}
          </div>
        )}

        <section aria-label="Live event filters" className="mb-5 grid gap-3 rounded-2xl border border-white/10 bg-slate-900/55 p-4 sm:grid-cols-[minmax(180px,1fr)_210px_230px_auto] sm:items-end">
          <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Title, source, event ID"
              className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs normal-case tracking-normal text-white placeholder:text-slate-600"
            />
          </label>
          <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Event category
            <select value={category} onChange={(event) => setCategory(event.target.value as typeof category)} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs normal-case tracking-normal text-white">
              <option value="all">All categories</option>
              {Object.entries(categoryNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          <label className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Data provider
            <select value={provider} onChange={(event) => setProvider(event.target.value as typeof provider)} className="mt-1 block w-full rounded-lg border border-white/10 bg-slate-950 px-3 py-2.5 text-xs normal-case tracking-normal text-white">
              <option value="all">All providers</option>
              {Object.entries(providerNames).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>
          {(category !== 'all' || provider !== 'all' || search !== '') && (
            <button type="button" onClick={() => { setCategory('all'); setProvider('all'); setSearch('') }} className="rounded-lg border border-white/10 px-3 py-2.5 text-[10px] font-semibold text-slate-300 hover:text-white">
              Clear filters
            </button>
          )}
        </section>

        <p className="mb-3 text-[10px] text-slate-500" aria-live="polite">{visibleEvents.length} events shown · {visibleEvents.filter((event) => event.eligible).length} can become a design exercise</p>
        {visibleEvents.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-slate-900/55 p-6 text-sm text-slate-400">
            {loading ? 'Loading provider feeds…' : data.events.length ? 'No events match these filters.' : 'No live events are available yet. Refresh the feeds or try again later.'}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibleEvents.map((event) => {
              const alreadySaved = savedMissionIdSet.has(getEventCampaignMissionId(event))
              const state = data.providers[event.provider]
              return (
                <article key={event.id} className="flex min-h-[240px] flex-col rounded-2xl border border-white/10 bg-slate-900/75 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-full bg-sky-300/10 px-2.5 py-1 text-[9px] font-medium text-sky-100">{categoryNames[event.category]}</span>
                    <span className={`rounded-full px-2 py-1 text-[9px] ${state.status === 'stale' ? 'bg-amber-300/10 text-amber-200' : 'bg-white/5 text-slate-400'}`}>{statusLabels[state.status]}</span>
                  </div>
                  <h2 className="mt-3 text-sm font-semibold leading-snug text-white">{event.title}</h2>
                  <p className="mt-1 text-[10px] text-slate-500">{event.providerLabel} · {formatTimestamp(event.eventTime, event.eventTimeScale)}</p>
                  {event.categories && event.categories.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {event.categories.map((eventCategory) => (
                        <span key={eventCategory.id} className="rounded bg-white/[.04] px-2 py-1 text-[9px] text-slate-400">{eventCategory.title}</span>
                      ))}
                    </div>
                  )}
                  <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed text-slate-300">{event.description || 'The provider did not include a description.'}</p>
                  {event.measurements.length > 0 && (
                    <ul className="mt-3 space-y-1 text-[10px] text-slate-400">
                      {event.measurements.slice(0, 3).map((measurement, index) => (
                        <li key={`${measurement.label}-${index}`}>{measurement.label}: {formatMeasurement(measurement.value, measurement.unit)}</li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <a href={event.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] font-medium text-sky-200 underline decoration-sky-200/30 underline-offset-2">
                      Provider record ↗
                    </a>
                    <button
                      type="button"
                      disabled={!event.eligible}
                      onClick={() => setSelectedEvent(event)}
                      className="rounded-lg bg-emerald-200 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-950 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
                    >
                      {event.eligible ? alreadySaved ? 'Open saved exercise' : 'Review exercise' : 'Not playable'}
                    </button>
                  </div>
                  {!event.eligible && <p className="mt-2 text-[9px] text-amber-200/80">{event.ineligibleReason}</p>}
                </article>
              )
            })}
          </div>
        )}
      </div>

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedEvent(null) }}>
          <section role="dialog" aria-modal="true" aria-labelledby="event-detail-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#071321] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200">{providerNames[selectedEvent.provider]} · mission exercise preview</p>
                <h2 id="event-detail-title" className="mt-2 text-xl font-semibold text-white">{selectedEvent.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300" aria-label="Close event details">Close</button>
            </div>
            <p className="mt-4 whitespace-pre-line text-xs leading-relaxed text-slate-300">{selectedEvent.description || 'The provider did not include a description.'}</p>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-white/[.03] p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-500">Event time</dt><dd className="mt-1 text-[11px] text-slate-200">{formatTimestamp(selectedEvent.eventTime, selectedEvent.eventTimeScale)}</dd></div>
              <div className="rounded-xl bg-white/[.03] p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-500">Retrieved</dt><dd className="mt-1 text-[11px] text-slate-200">{formatTimestamp(selectedEvent.retrievedAt)}</dd></div>
              {selectedEvent.measurements.map((measurement, index) => (
                <div key={`${measurement.label}-${index}`} className="rounded-xl bg-white/[.03] p-3"><dt className="text-[9px] uppercase tracking-wider text-slate-500">{measurement.label}</dt><dd className="mt-1 text-[11px] text-slate-200">{formatMeasurement(measurement.value, measurement.unit)}{measurement.uncertainty == null ? '' : ` ± ${formatMeasurement(measurement.uncertainty, measurement.unit)}`}</dd></div>
              ))}
            </dl>
            {selectedEvent.geometries && selectedEvent.geometries.length > 0 && (
              <section className="mt-4 rounded-xl border border-white/[.06] bg-white/[.02] p-4">
                <h3 className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Reported event geometry</h3>
                <ul className="mt-2 space-y-2">
                  {selectedEvent.geometries.slice(-3).reverse().map((geometry, index) => (
                    <li key={`${geometry.date ?? 'undated'}-${index}`} className="text-[10px] text-slate-300">
                      {geometry.type ?? 'Geometry'} · {formatTimestamp(geometry.date)}
                      {geometry.coordinates && geometry.coordinates.length >= 2
                        ? ` · longitude ${geometry.coordinates[0]}, latitude ${geometry.coordinates[1]}°`
                        : geometry.bounds
                          ? ` · reported bounds: ${geometry.bounds[0]}, ${geometry.bounds[1]} to ${geometry.bounds[2]}, ${geometry.bounds[3]} degrees (west, south to east, north)`
                          : geometry.hasCoordinates ? ' · provider geometry available; no representative point derived' : ''}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {selectedEvent.sources && selectedEvent.sources.length > 0 && (
              <section className="mt-4">
                <h3 className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">Event source references</h3>
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {selectedEvent.sources.map((source, index) => (
                    <li key={`${source.id ?? 'source'}-${index}`}>
                      <a href={source.url} target="_blank" rel="noreferrer" className="text-[10px] text-sky-200 underline underline-offset-2">
                        {source.id ?? 'Source record'} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="mt-5 rounded-xl border border-amber-200/15 bg-amber-200/[.04] p-4 text-[10px] leading-relaxed text-amber-100/90">
              <p className="font-semibold">Design exercise, not a live mission prediction</p>
              <p className="mt-1">
                {selectedEvent.provider === 'noaa'
                  ? 'The alert provides scenario context only. Spacecraft-specific weather effects are not simulated.'
                  : selectedEvent.provider === 'eonet'
                    ? 'A reported event location does not prove that a spacecraft can observe it. Sensor access and imagery are not simulated.'
                    : 'A close approach is not an intercept opportunity. No asteroid orbit, intercept trajectory, or launch window is calculated.'}
                {' '}Engineering scoring and outcomes use the existing game simulation.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <a href={selectedEvent.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-sky-200 underline underline-offset-2">Verify provider record ↗</a>
              <button
                type="button"
                disabled={creating}
                onClick={() => void createMission(selectedEvent)}
                className="rounded-xl bg-emerald-200 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-950 transition hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-60"
              >
                {creating ? 'Verifying event…' : savedMissionIdSet.has(getEventCampaignMissionId(selectedEvent)) ? 'Open saved exercise' : 'Verify and start exercise'}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
