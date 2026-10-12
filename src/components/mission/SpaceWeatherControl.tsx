import { useCallback, useMemo, useState } from 'react'
import { createSpaceWeatherScenario, type SpaceWeatherScenario } from '../../data/spaceWeatherScenario'
import { prepareKIndexChart } from '../../data/noaaSpaceWeather'

type FeedStatus = 'live' | 'cached' | 'stale' | 'unavailable'

interface FeedBase {
  status: FeedStatus
  lastFetchedAt: string | null
  error?: string
}

interface AlertRecord {
  id: string | null
  issueTime: string | null
  message: string | null
  raw: Record<string, unknown>
}

interface AlertsFeed extends FeedBase {
  records: AlertRecord[]
  truncated?: boolean
}

interface KIndexFeed extends FeedBase {
  measurements: { time: string; kp: number; aRunning: number | null; stationCount: number | null }[]
}

interface ForecastFeed extends FeedBase {
  product: string | null
  issued: string | null
  description: string | null
  units: Record<string, string>
  values: { time: string; metric: 'ap' | 'f107'; value: number; unit: string }[]
}

interface WeatherSummary {
  alerts: AlertsFeed
  kIndex: KIndexFeed
  forecast: ForecastFeed
}

const EMPTY_SUMMARY: WeatherSummary = {
  alerts: { status: 'unavailable', lastFetchedAt: null, records: [] },
  kIndex: { status: 'unavailable', lastFetchedAt: null, measurements: [] },
  forecast: { status: 'unavailable', lastFetchedAt: null, product: null, issued: null, description: null, units: {}, values: [] },
}

function formatTimestamp(value: string | null | undefined) {
  if (!value) return 'Not provided'
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? `${date.toLocaleString(undefined, { timeZone: 'UTC' })} UTC`
    : value
}

function statusLabel(status: FeedStatus) {
  return { live: 'LIVE', cached: 'CACHED', stale: 'STALE', unavailable: 'UNAVAILABLE' }[status]
}

function groupedForecast(values: ForecastFeed['values']) {
  const days = new Map<string, { ap?: number; f107?: number }>()
  for (const entry of values) {
    const date = entry.time.slice(0, 10)
    const value = days.get(date) ?? {}
    value[entry.metric] = entry.value
    days.set(date, value)
  }
  return [...days].map(([date, valuesForDate]) => ({ date, ...valuesForDate }))
}

export function SpaceWeatherControl() {
  const [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<WeatherSummary>(EMPTY_SUMMARY)
  const [loading, setLoading] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [selectedAlert, setSelectedAlert] = useState<string | null>(null)
  const [scenario, setScenario] = useState<SpaceWeatherScenario | null>(null)
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null)
  const [scenarioComplete, setScenarioComplete] = useState(false)
  const chartPoints = useMemo(() => prepareKIndexChart(summary.kIndex.measurements), [summary.kIndex.measurements])
  const forecastDays = useMemo(() => groupedForecast(summary.forecast.values), [summary.forecast.values])

  const loadSummary = useCallback(async (force = false) => {
    setLoading(true)
    setRequestError(null)
    try {
      const response = await fetch(`/api/space-weather/summary${force ? '?refresh=1' : ''}`)
      const body: unknown = await response.json()
      if (!response.ok) {
        const message = body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
          ? body.error
          : 'NOAA Space Weather data could not be loaded.'
        throw new Error(message)
      }
      if (!body || typeof body !== 'object' || !('alerts' in body) || !('kIndex' in body) || !('forecast' in body)) {
        throw new Error('NOAA Space Weather service returned an invalid summary.')
      }
      setSummary(body as WeatherSummary)
      setHasLoaded(true)
    } catch (cause) {
      setRequestError(cause instanceof Error ? cause.message : 'NOAA Space Weather data could not be loaded.')
      setHasLoaded(true)
    } finally {
      setLoading(false)
    }
  }, [])

  function startScenario() {
    const alert = summary.alerts.records[0]
    const latest = summary.kIndex.measurements.at(-1)
    setScenario(createSpaceWeatherScenario({
      alertMessage: alert?.message ?? null,
      alertTime: alert?.issueTime ?? null,
      latestKp: latest?.kp ?? null,
    }))
    setSelectedDecision(null)
    setScenarioComplete(false)
  }

  return (
    <div className="fixed bottom-4 left-4 z-[100]">
      {open && (
        <section
          aria-label="NOAA Space Weather dashboard"
          aria-modal="false"
          className="fixed inset-x-3 bottom-3 flex h-[min(820px,calc(100dvh-24px))] flex-col overflow-hidden rounded-3xl border border-sky-200/15 bg-[#071321]/[.98] shadow-[0_28px_100px_rgba(0,0,0,.72)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-5 sm:left-5 sm:h-[min(820px,calc(100dvh-40px))] sm:w-[min(720px,calc(100vw-40px))]"
          role="dialog"
        >
          <header className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/70 px-4 py-4">
            <div>
              <p className="text-sm font-semibold text-white">Space Weather · NOAA SWPC</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-sky-200/65">Observations and forecasts · simulation is separate</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadSummary(true)}
                disabled={loading}
                className="rounded-lg border border-sky-200/15 px-3 py-2 text-[10px] font-semibold text-sky-100 disabled:opacity-50"
              >
                {loading ? 'Refreshing…' : 'Refresh feeds'}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white" aria-label="Close Space Weather">
                <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
                  <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </header>

          <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
            {scenario ? (
              <section aria-label="Space-weather readiness exercise">
                <button type="button" onClick={() => setScenario(null)} className="text-[10px] text-sky-200 hover:text-white">← Back to dashboard</button>
                <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-200/70">Optional readiness exercise · NOAA data context</p>
                <h2 className="mt-2 text-xl font-semibold text-white">{scenario.title}</h2>
                <p className="mt-3 text-xs leading-relaxed text-slate-300">{scenario.briefing}</p>
                {scenario.sourceTime && <p className="mt-2 text-[10px] text-slate-400">Latest alert issue time: {formatTimestamp(scenario.sourceTime)}</p>}
                <p className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/5 p-3 text-[10px] leading-relaxed text-amber-100">{scenario.simulationNotice}</p>
                {!scenarioComplete ? (
                  <>
                    <fieldset className="mt-4 space-y-2">
                      <legend className="mb-2 text-xs font-semibold text-white">Choose an operational approach</legend>
                      {scenario.decisions.map((decision) => (
                        <label key={decision.id} className={`block cursor-pointer rounded-xl border p-3 ${selectedDecision === decision.id ? 'border-sky-300/45 bg-sky-300/[.08]' : 'border-white/10 bg-slate-950/35'}`}>
                          <input type="radio" name="noaa-space-weather-decision" checked={selectedDecision === decision.id} onChange={() => setSelectedDecision(decision.id)} className="sr-only" />
                          <span className="text-xs font-semibold text-white">{decision.label}</span>
                        </label>
                      ))}
                    </fieldset>
                    <button type="button" onClick={() => setScenarioComplete(true)} disabled={!selectedDecision} className="mt-4 w-full rounded-xl bg-sky-300 px-4 py-3 text-[10px] font-bold uppercase tracking-[0.13em] text-slate-950 disabled:opacity-40">Review response</button>
                  </>
                ) : (
                  <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-300/[.04] p-4">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-emerald-200">Exercise review · not a campaign score</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200">{scenario.decisions.find((decision) => decision.id === selectedDecision)?.feedback}</p>
                    <p className="mt-2 text-[10px] leading-relaxed text-slate-400">This learning exercise has no spacecraft consequence and does not alter mission scoring or campaign progression.</p>
                    <button type="button" onClick={() => setScenario(null)} className="mt-4 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-200">Return to dashboard</button>
                  </div>
                )}
              </section>
            ) : (
              <>
                <p className="text-xs leading-relaxed text-slate-300">Live NOAA Space Weather Prediction Center alerts, measured planetary K-index, and 45-day forecast. Solar-weather data alone does not establish effects on a specific spacecraft.</p>
                {requestError && <div role="alert" className="rounded-xl border border-rose-300/20 bg-rose-400/5 p-3 text-xs text-rose-100">{requestError}<button type="button" onClick={() => void loadSummary(true)} className="ml-2 underline">Retry</button></div>}
                {loading && !hasLoaded && <p role="status" className="text-xs text-sky-100/75">Loading NOAA Space Weather feeds…</p>}

                <section className="rounded-2xl border border-sky-200/15 bg-slate-900/55 p-4" aria-label="NOAA alerts">
                  <FeedHeading title="Current alerts" feed={summary.alerts} />
                  {summary.alerts.error && <FeedError feed={summary.alerts} />}
                  {!summary.alerts.error && summary.alerts.records.length === 0 && <p className="mt-3 text-xs text-slate-400">No alerts were returned by this feed.</p>}
                  <div className="mt-3 space-y-2">
                    {summary.alerts.records.slice(0, 30).map((alert, index) => {
                      const key = alert.id ?? `${alert.issueTime ?? 'alert'}-${index}`
                      const expanded = selectedAlert === key
                      return (
                        <article key={key} className="rounded-xl border border-white/10 bg-slate-950/40">
                          <button type="button" aria-expanded={expanded} onClick={() => setSelectedAlert(expanded ? null : key)} className="flex w-full items-start justify-between gap-3 p-3 text-left">
                            <span className="min-w-0">
                              <span className="block text-xs font-semibold text-white">{alert.id ?? 'NOAA alert'}</span>
                              <span className="mt-1 block line-clamp-2 whitespace-pre-line text-[10px] leading-relaxed text-slate-300">{alert.message ?? 'Message not provided.'}</span>
                            </span>
                            <span className="shrink-0 text-right text-[9px] text-slate-500">{formatTimestamp(alert.issueTime)}<span className="mt-1 block text-sky-200">{expanded ? 'Hide' : 'Details'}</span></span>
                          </button>
                          {expanded && <pre className="max-h-64 overflow-auto border-t border-white/8 p-3 whitespace-pre-wrap break-words font-sans text-[10px] leading-relaxed text-slate-300">{alert.message ?? 'No full message was provided.'}</pre>}
                        </article>
                      )
                    })}
                  </div>
                  {summary.alerts.truncated && <p className="mt-2 text-[9px] text-slate-500">Showing the first 30 of the available alerts.</p>}
                </section>

                <section className="rounded-2xl border border-sky-200/15 bg-slate-900/55 p-4" aria-label="Planetary K-index measurements">
                  <FeedHeading title="Planetary K-index · measured" feed={summary.kIndex} />
                  {summary.kIndex.error && <FeedError feed={summary.kIndex} />}
                  <p className="mt-2 text-[10px] text-slate-400">Dimensionless index from 0 to 9. Higher values indicate stronger geomagnetic disturbance; this is not a spacecraft damage or radiation measurement.</p>
                  {chartPoints.length > 0 ? (
                    <div className="mt-3">
                      <svg viewBox="0 0 600 180" role="img" aria-label="Planetary K-index line chart, 0 to 9 scale" className="h-40 w-full overflow-visible">
                        {[0, 3, 6, 9].map((value) => {
                          const y = 150 - value * 14
                          return <g key={value}><line x1="42" x2="590" y1={y} y2={y} stroke="rgba(148,163,184,.18)" /><text x="8" y={y + 4} fill="#94a3b8" fontSize="11">{value}</text></g>
                        })}
                        <polyline points={chartPoints.map((point) => `${point.x},${point.y}`).join(' ')} fill="none" stroke="#7dd3fc" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                        {chartPoints.map((point) => <circle key={point.time} cx={point.x} cy={point.y} r="3" fill="#bae6fd"><title>{`${formatTimestamp(point.time)}: Kp ${point.kp}`}</title></circle>)}
                        <text x="42" y="174" fill="#94a3b8" fontSize="10">{chartPoints[0]?.time.slice(0, 10)}</text>
                        <text x="590" y="174" textAnchor="end" fill="#94a3b8" fontSize="10">{chartPoints.at(-1)?.time.slice(0, 10)}</text>
                      </svg>
                      <ul className="mt-2 grid grid-cols-2 gap-2 text-[9px] text-slate-400 sm:grid-cols-3">
                        {summary.kIndex.measurements.slice(-6).reverse().map((point) => <li key={point.time} className="rounded-lg bg-slate-950/45 p-2">{formatTimestamp(point.time)} · <span className="text-sky-100">Kp {point.kp}</span></li>)}
                      </ul>
                    </div>
                  ) : !summary.kIndex.error && <p className="mt-3 text-xs text-slate-400">No valid measurements are available.</p>}
                </section>

                <section className="rounded-2xl border border-sky-200/15 bg-slate-900/55 p-4" aria-label="NOAA 45-day forecast">
                  <FeedHeading title="45-day forecast · forecast, not observations" feed={summary.forecast} />
                  {summary.forecast.error && <FeedError feed={summary.forecast} />}
                  {summary.forecast.issued && <p className="mt-2 text-[10px] text-slate-400">{summary.forecast.product ?? 'NOAA forecast'} · issued {formatTimestamp(summary.forecast.issued)}</p>}
                  {summary.forecast.description && <p className="mt-1 text-[10px] text-slate-500">{summary.forecast.description}</p>}
                  {forecastDays.length > 0 ? (
                    <div className="mt-3 max-h-72 overflow-auto rounded-xl border border-white/8">
                      <table className="w-full text-left text-[10px]">
                        <thead className="sticky top-0 bg-slate-900 text-slate-400"><tr><th className="p-2">Date (UTC)</th><th className="p-2">Ap (nT)</th><th className="p-2">F10.7 (sfu)</th></tr></thead>
                        <tbody>{forecastDays.map((day) => <tr key={day.date} className="border-t border-white/5"><td className="p-2 text-slate-300">{day.date}</td><td className="p-2 text-sky-100">{day.ap ?? '—'}</td><td className="p-2 text-slate-200">{day.f107 ?? '—'}</td></tr>)}</tbody>
                      </table>
                    </div>
                  ) : !summary.forecast.error && <p className="mt-3 text-xs text-slate-400">No valid forecast values are available.</p>}
                </section>

                <section className="rounded-2xl border border-white/10 bg-slate-950/40 p-4">
                  <p className="text-xs font-semibold text-white">Optional readiness exercise</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">Use the currently retrieved alert and latest measured K-index to review an operational response. This does not change campaign scoring or imply spacecraft impact.</p>
                  <button type="button" onClick={startScenario} disabled={!hasLoaded} className="mt-3 rounded-lg border border-sky-200/15 px-3 py-2 text-[10px] font-semibold text-sky-100 disabled:opacity-40">Start readiness exercise</button>
                </section>
              </>
            )}
          </div>

          <footer className="border-t border-white/10 px-4 py-3 text-[9px] leading-relaxed text-slate-500">
            Source: NOAA Space Weather Prediction Center. Alert text is published information; Kp is measured geomagnetic activity; Ap and F10.7 in the 45-day product are forecasts. Game scenarios are educational simulations only.{' '}
            <a href="https://www.swpc.noaa.gov/" target="_blank" rel="noopener noreferrer" className="text-sky-200 underline underline-offset-2">NOAA SWPC</a>
            {' · '}<a href="https://services.swpc.noaa.gov/products/alerts.json" target="_blank" rel="noopener noreferrer" className="text-sky-200 underline underline-offset-2">Alerts</a>
            {' · '}<a href="https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json" target="_blank" rel="noopener noreferrer" className="text-sky-200 underline underline-offset-2">K-index</a>
            {' · '}<a href="https://services.swpc.noaa.gov/json/45-day-forecast.json" target="_blank" rel="noopener noreferrer" className="text-sky-200 underline underline-offset-2">45-day forecast</a>
          </footer>
        </section>
      )}
      <button
        type="button"
        onClick={() => {
          if (!open && !hasLoaded) void loadSummary()
          setOpen((value) => !value)
        }}
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-full border border-sky-200/20 bg-[#071321]/95 px-4 py-3 text-xs font-semibold text-sky-100 shadow-xl backdrop-blur transition hover:border-sky-200/40"
      >
        <span aria-hidden="true">☀</span>
        {open ? 'Close Space Weather' : 'Space Weather'}
      </button>
    </div>
  )
}

function FeedHeading({ title, feed }: { title: string; feed: FeedBase }) {
  const colors: Record<FeedStatus, string> = {
    live: 'text-emerald-200',
    cached: 'text-sky-200',
    stale: 'text-amber-200',
    unavailable: 'text-rose-200',
  }
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <h2 className="text-sm font-semibold text-white">{title}</h2>
      <div className="text-right">
        <span className={`text-[9px] font-bold tracking-[0.12em] ${colors[feed.status]}`}>{statusLabel(feed.status)}</span>
        <p className="mt-0.5 text-[9px] text-slate-500">Last success: {formatTimestamp(feed.lastFetchedAt)}</p>
      </div>
    </div>
  )
}

function FeedError({ feed }: { feed: FeedBase }) {
  return <p className={`mt-2 text-[10px] ${feed.status === 'stale' ? 'text-amber-200' : 'text-rose-200'}`}>{feed.status === 'stale' ? 'Refresh failed; showing cached data. ' : ''}{feed.error}</p>
}
