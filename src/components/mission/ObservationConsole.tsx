import { useEffect, useMemo, useState } from 'react'
import { getObservationTargets } from '../../data/observationTargets'
import {
  getNextObservationWindowMinute,
  getInstrumentOperatingPowerW,
  hasScienceInstrument,
  isCommunicationAvailable,
  isObservationWindow,
  type MissionCommand,
  type MissionControlSession,
  type MissionEventSeverity,
} from '../../data/missionControlSimulation'
import { OnboardObservationCamera } from './OnboardObservationCamera'

interface ImageryResult {
  id: string
  imageUrl: string
  acquiredAt: string | null
  catalogDate?: string | null
  provider: string
  platform: string | null
  instrument: string | null
  processingLevel: string | null
  cloudCoverPercent: number | null
  resolutionMeters: number | null
  targetName: string
  targetCoordinates: [number, number] | null
  label: string
  title?: string
  credit?: string
  sourceUrl: string
}

interface MapImage {
  imageUrl: string
  globeImageUrl?: string
  date: string
  provider: string
  layer: string
  platform: string
  instrument: string
  attribution: string
  sourceUrl: string
}

const GIBS_TARGET_BOUNDS: Record<string, string> = {
  'washington-dc': '36.7,-79.2,40.7,-75.2',
  amazon: '-5.5,-63.1,-1.5,-58.7',
  sahara: '22.1,10.8,26.1,15.2',
}

interface ObservationConsoleProps {
  session: MissionControlSession
  dispatch: (command: MissionCommand) => void
  result: { message: string; severity: MissionEventSeverity } | null
}

function recentArchiveDate() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 3)
  return date.toISOString().slice(0, 10)
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Not reported'
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : 'Not reported'
}

function formatAge(value: string) {
  const ageHours = Math.max(0, (Date.now() - Date.parse(value)) / 3_600_000)
  if (ageHours < 48) return `${Math.floor(ageHours)} hours old`
  return `${Math.floor(ageHours / 24)} days old`
}

function createGibsGlobeImageUrl(date: string) {
  const url = new URL('https://wvs.earthdata.nasa.gov/api/v1/snapshot')
  url.search = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: '-90,-180,90,180',
    CRS: 'EPSG:4326',
    LAYERS: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    FORMAT: 'image/jpeg',
    WIDTH: '2048',
    HEIGHT: '1024',
  }).toString()
  return url.href
}

function Button({
  children,
  disabled,
  onClick,
  accent = 'cyan',
}: {
  children: string
  disabled?: boolean
  onClick: () => void
  accent?: 'cyan' | 'sky' | 'amber'
}) {
  const colors = {
    cyan: 'border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-50 hover:bg-cyan-300/[0.13]',
    sky: 'border-sky-300/25 bg-sky-300/[0.06] text-sky-50 hover:bg-sky-300/[0.11]',
    amber: 'border-amber-300/25 bg-amber-300/[0.05] text-amber-50 hover:bg-amber-300/[0.1]',
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`min-h-10 border px-3 py-2 text-[10px] font-bold uppercase tracking-[0.12em] transition disabled:cursor-not-allowed disabled:opacity-40 ${colors[accent]}`}
    >
      {children}
    </button>
  )
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-slate-700/70 pl-3">
      <dt className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-[10px] text-slate-200">{value}</dd>
    </div>
  )
}

export function ObservationConsole({ session, dispatch, result }: ObservationConsoleProps) {
  const { state, record } = session
  const targets = useMemo(
    () => getObservationTargets(record.spacecraftId, record.destination),
    [record.destination, record.spacecraftId],
  )
  const target = targets.find((item) => item.id === state.observationTargetId) ?? targets[0]
  const [today] = useState(() => new Date().toISOString().slice(0, 10))
  const [date, setDate] = useState(recentArchiveDate)
  const [cameraAzimuth, setCameraAzimuth] = useState(0)
  const [cameraElevation, setCameraElevation] = useState(0)
  const [cameraFieldOfView, setCameraFieldOfView] = useState(32)
  const [imageryState, setImageryState] = useState<{
    key: string
    image: ImageryResult | null
    mapImage: MapImage | null
    mapImageFailed: boolean
    status: 'loading' | 'ready' | 'empty' | 'error'
    message: string
  }>({ key: '', image: null, mapImage: null, mapImageFailed: false, status: 'loading', message: '' })
  const [retry, setRetry] = useState(0)
  const instrumentInstalled = hasScienceInstrument(record)
  const observationOpen = isObservationWindow(state.elapsedSeconds, state.observationDelayMinutes)
  const nextWindow = getNextObservationWindowMinute(state.elapsedSeconds, state.observationDelayMinutes)
  const communicationOpen = isCommunicationAvailable(record, state.elapsedSeconds)
  const currentProduct = state.observationProducts.at(-1)
  const source = target.imagerySource
  const requestUrl = source === 'landsat'
    ? `/api/observations/landsat?target=${encodeURIComponent(target.id)}&date=${encodeURIComponent(date)}`
    : source === 'epic'
      ? `/api/observations/epic?date=${encodeURIComponent(date)}`
      : source === 'nasa'
        ? `/api/observations/planetary?target=${encodeURIComponent(target.body)}`
        : ''
  const requestKey = `${source}:${target.id}:${date}:${retry}`
  const imageryStatus = source === 'simulated'
    ? 'simulated'
    : imageryState.key === requestKey
      ? imageryState.status
      : 'loading'
  const imagery = imageryState.key === requestKey ? imageryState.image : null
  const mapImage = imageryState.key === requestKey ? imageryState.mapImage : null
  const mapImageFailed = imageryState.key === requestKey && imageryState.mapImageFailed
  const imageryMessage = imageryState.key === requestKey ? imageryState.message : ''
  const archiveTargetCoordinates = imagery?.targetCoordinates ?? target.coordinates
  const earthTextureUrl = target.body.toLowerCase() === 'earth'
    ? mapImage?.globeImageUrl ?? createGibsGlobeImageUrl(date)
    : null

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    if (source === 'simulated') return () => controller.abort()
    const request = async () => {
      try {
        const response = await fetch(requestUrl, { signal: controller.signal })
        const payload: unknown = await response.json()
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && 'error' in payload &&
            typeof payload.error === 'string'
            ? payload.error
            : `Imagery request failed with HTTP ${response.status}.`
          throw new Error(message)
        }
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('results' in payload) ||
          !Array.isArray(payload.results)
        ) throw new Error('Imagery service returned an invalid response.')
        if (!active) return
        const returnedMapImage = source === 'landsat' &&
          'mapImage' in payload &&
          isMapImage(payload.mapImage)
          ? payload.mapImage
          : source === 'landsat' ? createFallbackGibsMapImage(target.id, date) : null
        const first = payload.results[0]
        if (!first) {
          setImageryState({
            key: requestKey,
            image: null,
            mapImage: returnedMapImage,
            mapImageFailed: false,
            status: 'empty',
            message: source === 'landsat'
              ? `No Landsat scene was found from ${'queryStartDate' in payload && typeof payload.queryStartDate === 'string' ? payload.queryStartDate : 'the preceding 30 days'} through ${date}. The NASA map layer is separate reference imagery, not a Landsat scene.`
              : 'No matching archive image was returned for this target and date.',
          })
          return
        }
        if (!isImageryResult(first)) throw new Error('Imagery service returned incomplete image metadata.')
        setImageryState({
          key: requestKey,
          image: first,
          mapImage: returnedMapImage,
          mapImageFailed: false,
          status: 'ready',
          message: '',
        })
      } catch (error) {
        if (!active || controller.signal.aborted) return
        setImageryState({
          key: requestKey,
          image: null,
          mapImage: null,
          mapImageFailed: false,
          status: 'error',
          message: error instanceof Error ? error.message : 'Imagery could not be loaded.',
        })
      }
    }
    void request()
    return () => {
      active = false
      controller.abort()
    }
  }, [date, requestKey, requestUrl, source, target.body, target.id])

  const canCaptureNow =
    instrumentInstalled &&
    state.instrumentActive &&
    observationOpen &&
    state.instrumentTemperatureC < 65 &&
    state.storageCapacityMb - state.storageUsedMb >= 128 &&
    !state.paused
  const canDownlink = state.scienceDataMb > 0 && !state.downlinkQueued && !state.paused
  const cameraCoordinates = target.coordinates ?? imagery?.targetCoordinates ?? null

  return (
    <div className="space-y-4">
      <div className="grid gap-4">
        <section className="min-w-0 border border-slate-700/60 bg-[#07111d]">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-700/50 px-4 py-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300/75">Onboard camera · simulated observation</p>
              <h2 className="mt-1 text-xs font-semibold uppercase tracking-[0.13em] text-slate-100">{target.name}</h2>
            </div>
            <span className={`border px-2 py-1 text-[8px] font-bold uppercase tracking-[0.12em] ${
              'border-cyan-300/30 bg-cyan-300/[0.06] text-cyan-100'
            }`}>
              Simulated camera · not spacecraft-captured data
            </span>
          </header>
          <OnboardObservationCamera
            body={target.body}
            coordinates={cameraCoordinates}
            textureUrl={earthTextureUrl}
            imageryDate={date}
            imageryRetry={retry}
            onRetryImagery={() => setRetry((value) => value + 1)}
            elapsedSeconds={state.elapsedSeconds}
            paused={state.paused}
            azimuthDegrees={cameraAzimuth}
            elevationDegrees={cameraElevation}
            fieldOfViewDegrees={cameraFieldOfView}
          />
          <div className="grid gap-3 border-t border-slate-800 p-4 md:grid-cols-3">
            <label className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Azimuth · {cameraAzimuth}°
              <input
                aria-label="Camera azimuth"
                type="range"
                min="-45"
                max="45"
                step="1"
                value={cameraAzimuth}
                onChange={(event) => setCameraAzimuth(Number(event.target.value))}
                className="mt-2 block w-full accent-cyan-300"
              />
            </label>
            <label className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Elevation · {cameraElevation}°
              <input
                aria-label="Camera elevation"
                type="range"
                min="-45"
                max="45"
                step="1"
                value={cameraElevation}
                onChange={(event) => setCameraElevation(Number(event.target.value))}
                className="mt-2 block w-full accent-cyan-300"
              />
            </label>
            <label className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Field of view · {cameraFieldOfView}°
              <input
                aria-label="Camera field of view"
                type="range"
                min="8"
                max="65"
                step="1"
                value={cameraFieldOfView}
                onChange={(event) => setCameraFieldOfView(Number(event.target.value))}
                className="mt-2 block w-full accent-cyan-300"
              />
            </label>
          </div>
          <p className="border-t border-slate-800 px-4 py-3 text-[9px] leading-relaxed text-slate-500">
            The moving 3D surface is textured by a date-specific NASA GIBS API image: MODIS Terra Corrected Reflectance True Color, fetched for {date} and projected onto the globe. It is a real satellite imagery layer, not a live feed or a capture by this simulated spacecraft. Daily swath gaps and cloud cover may be visible. Orbit altitude, period, attitude, and instrument field of view remain illustrative because the simulator has no flight geometry.
          </p>
          {target.body.toLowerCase() === 'earth' && (
            <div className="grid gap-3 border-t border-slate-800 px-4 py-3 sm:grid-cols-2">
              <MetadataItem label="Globe texture provider" value="NASA Global Imagery Browse Services (GIBS)" />
              <MetadataItem label="Satellite / instrument" value="Terra / MODIS" />
              <MetadataItem label="Imagery layer date" value={`${date} · daily reference layer; not a spacecraft acquisition`} />
              <MetadataItem label="Surface texture" value="Fetched globally at 2048 × 1024 display size; product resolution varies by source" />
              <a
                className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200 underline"
                href="https://nasa-gibs.github.io/gibs-api-docs/"
                target="_blank"
                rel="noreferrer"
              >
                NASA GIBS layer and service documentation
              </a>
              <p className="text-[9px] leading-relaxed text-slate-500">
                NASA MODIS daily products contain cloud and orbital-coverage gaps; missing pixels are not synthesized.
              </p>
              <p className="text-[9px] leading-relaxed text-slate-500 sm:col-span-2">
                {mapImage?.attribution ?? "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."}
              </p>
            </div>
          )}
          {(imageryStatus === 'error' || imageryStatus === 'empty') && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3" role="status">
              <p className="text-[9px] leading-relaxed text-slate-400">
                Separate archive provider: {imageryStatus === 'error' ? 'unavailable' : 'no matching image'}.
                {imageryMessage ? ` ${imageryMessage}` : ''}
              </p>
              {imageryStatus === 'error' && (
                <button
                  type="button"
                  onClick={() => setRetry((value) => value + 1)}
                  className="border border-cyan-300/30 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-cyan-100"
                >
                  Retry archive request
                </button>
              )}
            </div>
          )}
          {(mapImage || (imagery && source !== 'landsat')) && (
            <details className="border-t border-slate-800 px-4 py-3">
              <summary className="cursor-pointer text-[9px] font-semibold uppercase tracking-wide text-cyan-200">
                Separate real archived/reference imagery · not spacecraft-captured
              </summary>
              {mapImage && (
                <div className="mt-3 space-y-2">
                  <p className="text-[9px] text-slate-400">
                    {mapImage.provider} · {mapImage.layer} · {mapImage.date} · {mapImage.platform}/{mapImage.instrument}
                  </p>
                  <img
                    src={mapImage.imageUrl}
                    alt={`${mapImage.provider} ${mapImage.layer} map layer for ${target.name}, ${mapImage.date}`}
                    className="max-h-[320px] w-full bg-[#020912] object-contain"
                    loading="lazy"
                    onError={() => {
                      setImageryState((current) => current.key === requestKey
                        ? { ...current, mapImageFailed: true }
                        : current)
                    }}
                  />
                  <p className="text-[9px] leading-relaxed text-slate-500">{mapImage.attribution}</p>
                  {mapImageFailed && <p className="text-[9px] text-amber-200">The separate NASA map layer could not be loaded; the onboard simulation remains available.</p>}
                </div>
              )}
              {imagery && source !== 'landsat' && (
                <div className="mt-3 space-y-2">
                  <p className="text-[9px] text-slate-400">
                    {imagery.provider} · {imagery.label} · {formatDate(imagery.catalogDate ?? imagery.acquiredAt)}
                  </p>
                  <img
                    src={imagery.imageUrl}
                    alt={`${imagery.label}: ${imagery.title ?? imagery.targetName}`}
                    className="max-h-[320px] w-full bg-[#020912] object-contain"
                    loading="lazy"
                    onError={() => setImageryState((current) => current.key === requestKey
                      ? { ...current, message: 'Provider preview unavailable; archive metadata remains available.' }
                      : current)}
                  />
                </div>
              )}
            </details>
          )}
          {imagery && (
            <>
              <dl className="grid gap-4 border-t border-slate-800 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <MetadataItem label={imagery.catalogDate ? 'Catalog record date' : 'Acquisition date'} value={formatDate(imagery.catalogDate ?? imagery.acquiredAt)} />
                <MetadataItem label="Image source" value={imagery.provider} />
                <MetadataItem label="Provider record ID" value={imagery.id} />
                <MetadataItem label="Spacecraft / platform" value={imagery.platform ?? 'Not specified by provider'} />
                <MetadataItem label="Instrument" value={imagery.instrument ?? 'Not specified by provider'} />
                <MetadataItem label="Resolution" value={imagery.resolutionMeters ? `${imagery.resolutionMeters} m/pixel` : 'Not reported'} />
                <MetadataItem label="Cloud coverage" value={imagery.cloudCoverPercent === null ? 'Not reported' : `${imagery.cloudCoverPercent}%`} />
                <MetadataItem label="Processing level" value={imagery.processingLevel ?? 'Not reported'} />
                {imagery.acquiredAt && <MetadataItem label="Image age" value={formatAge(imagery.acquiredAt)} />}
                {archiveTargetCoordinates && (
                  <MetadataItem label={source === 'epic' ? 'Provider image-center coordinates' : 'Selected target center'} value={`${Math.abs(archiveTargetCoordinates[1]).toFixed(4)}°${archiveTargetCoordinates[1] < 0 ? 'S' : 'N'}, ${Math.abs(archiveTargetCoordinates[0]).toFixed(4)}°${archiveTargetCoordinates[0] < 0 ? 'W' : 'E'}`} />
                )}
              </dl>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 px-4 py-3">
                <p className="max-w-2xl text-[9px] leading-relaxed text-slate-500">
                  Archived/reference imagery only. This image was not captured by the simulated spacecraft.
                  {imagery.credit ? ` ${imagery.credit}.` : ''}
                </p>
                <a className="text-[9px] font-semibold uppercase tracking-wide text-cyan-200 underline decoration-cyan-200/30 underline-offset-4" href={imagery.sourceUrl} target="_blank" rel="noreferrer">
                  Provider record
                </a>
              </div>
            </>
          )}
          {source === 'epic' && (
            <p className="border-t border-slate-800 px-4 py-3 text-[9px] leading-relaxed text-slate-500">
              EPIC is a full-disk Earth camera on NOAA DSCOVR. It is not a ground-target image or a live feed from this game spacecraft.
            </p>
          )}
        </section>

      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="min-w-0 border border-slate-700/60 bg-[#07111d]">
          <header className="border-b border-slate-700/50 px-4 py-3">
            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300/75">Simulated payload data · independent of reference image</p>
            <h2 className="mt-1 text-xs font-semibold uppercase tracking-[0.13em] text-slate-100">Observation schedule & data queue</h2>
          </header>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
              <label className="block">
                <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">Observation target</span>
                <select
                  value={target.id}
                  disabled={state.observationScheduled}
                  onChange={(event) => dispatch({ type: 'set-observation-target', targetId: event.target.value })}
                  className="min-h-10 w-full border border-slate-700 bg-[#050c14] px-3 text-xs text-slate-100 disabled:opacity-50"
                >
                  {targets.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.body}</option>)}
                </select>
              </label>
              {(source === 'landsat' || source === 'epic' || target.body.toLowerCase() === 'earth') && (
                <label className="block">
                  <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {source === 'landsat' ? 'Search through date' : 'NASA layer date'}
                  </span>
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(event) => setDate(event.target.value)}
                    className="min-h-10 border border-slate-700 bg-[#050c14] px-3 text-xs text-slate-100"
                  />
                </label>
              )}
            </div>
            {source === 'landsat' && (
              <p className="text-[9px] leading-relaxed text-slate-500">
                Landsat searches a 30-day window ending on the selected date. The map viewport shows date-specific NASA MODIS imagery and is not the Landsat scene preview.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={state.paused || (!state.observationScheduled && !instrumentInstalled)}
                onClick={() => dispatch({ type: state.observationScheduled ? 'cancel-observation' : 'schedule-observation' })}
              >
                {state.observationScheduled ? 'Cancel scheduled observation' : 'Schedule observation'}
              </Button>
              <Button
                disabled={state.paused || !instrumentInstalled || state.batteryWh <= 0}
                onClick={() => dispatch({ type: 'set-instrument', active: !state.instrumentActive })}
                accent="sky"
              >
                {state.instrumentActive ? 'Stand by science instrument' : 'Start science instrument'}
              </Button>
              <Button disabled={!canCaptureNow} onClick={() => dispatch({ type: 'perform-observation' })} accent="amber">
                Request simulated capture
              </Button>
              <Button disabled={!canDownlink} onClick={() => dispatch({ type: 'downlink' })} accent="sky">
                {state.downlinkQueued ? 'Downlink queued' : 'Downlink captured data'}
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <MetadataItem label="Schedule state" value={state.observationScheduled ? 'Waiting for opportunity' : 'No pending observation'} />
              <MetadataItem label="Next opportunity" value={observationOpen ? 'Window open now' : `MET +${Math.ceil(nextWindow * 60 - state.elapsedSeconds)} sec`} />
              <MetadataItem label="Communications" value={communicationOpen ? 'Contact window open' : 'No current contact'} />
            </div>
            <p className="text-[9px] text-slate-500">
              Instrument {state.instrumentActive ? 'active' : 'in standby'} · {state.instrumentActive
                ? getInstrumentOperatingPowerW(record)
                : 18 * record.missionTelemetry.instruments} W modeled load · {state.batteryWh.toFixed(0)} Wh remaining.
            </p>
            <p className="text-[9px] leading-relaxed text-slate-500">
              Captures are simulated data products (128 MB each, illustrative). They require an installed, active instrument, an open simulated schedule window, acceptable temperature, and free storage. Archive downloads are never treated as spacecraft data.
            </p>
            {!instrumentInstalled && (
              <p className="border border-amber-300/25 bg-amber-300/[0.05] p-3 text-[10px] text-amber-100">
                This saved spacecraft configuration has no science instrument. Add an instrument in the builder before a simulated capture can be acquired.
              </p>
            )}
            {result && (
              <p className={`border p-3 text-[10px] leading-relaxed ${
                result.severity === 'critical' ? 'border-rose-300/30 text-rose-100'
                  : result.severity === 'warning' ? 'border-amber-300/25 text-amber-100'
                    : 'border-sky-300/15 text-sky-100'
              }`} role="status" aria-live="polite">
                {result.message}
              </p>
            )}
          </div>
        </section>

        <section className="min-w-0 border border-slate-700/60 bg-[#07111d]">
          <header className="flex items-center justify-between gap-2 border-b border-slate-700/50 px-4 py-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-cyan-300/75">Onboard data products</p>
              <h2 className="mt-1 text-xs font-semibold uppercase tracking-[0.13em] text-slate-100">Observation history</h2>
            </div>
            <span className="text-[9px] tabular-nums text-slate-400">{state.scienceDataMb} MB aboard</span>
          </header>
          <div className="max-h-[285px] space-y-2 overflow-y-auto p-4">
            {state.observationProducts.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">No simulated image products acquired yet.</p>
            ) : (
              [...state.observationProducts].reverse().map((product) => (
                <article key={product.id} className="border border-slate-800 bg-[#050c14] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-100">{product.targetName} · simulated capture</p>
                    <span className={`text-[8px] font-bold uppercase tracking-wide ${product.status === 'downlinked' ? 'text-emerald-200' : 'text-amber-200'}`}>
                      {product.status}
                    </span>
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500">MET {formatMet(product.acquiredAtMetSeconds)} · {product.dataMb} MB · {product.body}</p>
                </article>
              ))
            )}
          </div>
          <p className="border-t border-slate-800 px-4 py-3 text-[9px] leading-relaxed text-slate-500">
            {state.dataDownlinkedMb} MB total downlinked. If contact is unavailable, the queue transmits during the next modeled communications window.
            {currentProduct ? ` Latest product: ${currentProduct.targetName}.` : ''}
          </p>
        </section>
      </div>
    </div>
  )
}

function formatMet(seconds: number) {
  const totalSeconds = Math.floor(seconds)
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainingSeconds = totalSeconds % 60
  return `${days ? `D+${days} ` : ''}${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
}

function isImageryResult(value: unknown): value is ImageryResult {
  if (!value || typeof value !== 'object') return false
  const result = value as Partial<ImageryResult>
  if (typeof result.imageUrl !== 'string' || typeof result.provider !== 'string') return false
  try {
    const url = new URL(result.imageUrl)
    return url.protocol === 'https:' &&
      (url.hostname === 'landsatlook.usgs.gov' ||
        url.hostname === 'epic.gsfc.nasa.gov' ||
        url.hostname === 'images-assets.nasa.gov') &&
      typeof result.label === 'string' &&
      typeof result.targetName === 'string'
  } catch {
    return false
  }
}

function isMapImage(value: unknown): value is MapImage {
  if (!value || typeof value !== 'object') return false
  const mapImage = value as Partial<MapImage>
  if (
    typeof mapImage.imageUrl !== 'string' ||
    typeof mapImage.date !== 'string' ||
    typeof mapImage.provider !== 'string' ||
    typeof mapImage.layer !== 'string' ||
    typeof mapImage.attribution !== 'string' ||
    typeof mapImage.sourceUrl !== 'string' ||
    (mapImage.globeImageUrl !== undefined && typeof mapImage.globeImageUrl !== 'string')
  ) return false
  try {
    const url = new URL(mapImage.imageUrl)
    const globeUrl = mapImage.globeImageUrl ? new URL(mapImage.globeImageUrl) : null
    return url.protocol === 'https:' &&
      url.hostname === 'wvs.earthdata.nasa.gov' &&
      mapImage.provider === 'NASA GIBS' &&
      (!globeUrl || (globeUrl.protocol === 'https:' && globeUrl.hostname === 'wvs.earthdata.nasa.gov'))
  } catch {
    return false
  }
}

function createFallbackGibsMapImage(targetId: string, date: string): MapImage | null {
  const bounds = GIBS_TARGET_BOUNDS[targetId]
  if (!bounds) return null
  const url = new URL('https://wvs.earthdata.nasa.gov/api/v1/snapshot')
  url.search = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    TIME: date,
    BBOX: bounds,
    CRS: 'EPSG:4326',
    LAYERS: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    FORMAT: 'image/jpeg',
    WIDTH: '768',
    HEIGHT: '512',
  }).toString()
  return {
    imageUrl: url.href,
    date,
    provider: 'NASA GIBS',
    layer: 'MODIS Terra Corrected Reflectance True Color',
    platform: 'Terra',
    instrument: 'MODIS',
    attribution: "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS).",
    sourceUrl: 'https://nasa-gibs.github.io/gibs-api-docs/',
  }
}
