export const JUNO_TRAJECTORY_ENDPOINT = '/api/juno-trajectory'
export const JUNO_TRAJECTORY_DAYS = 56
export const JUNO_ORBIT_PERIOD_SECONDS = 53 * 24 * 60 * 60
export const JUNO_PERIJOVE_ALTITUDE_KM = 4_200
export const JUPITER_EQUATORIAL_RADIUS_KM = 71_492
export const JUPITER_GRAVITATIONAL_PARAMETER_KM3_PER_S2 = 126_686_534
export const JUNO_NASA_REFERENCE_URL = 'https://science.nasa.gov/mission/juno/'

export interface JunoTrajectoryPosition {
  elapsedSeconds: number
  julianDateTdb: number | null
  calendarDate: string
  xKm: number
  yKm: number
  zKm: number
  distanceKm: number
}

export interface JunoTrajectory {
  mode: 'horizons' | 'approximate'
  samples: JunoTrajectoryPosition[]
  startTimeMs: number
  fetchedAt: number
  source: string
  sourceUrl: string
  periodSeconds?: number
}

interface JunoHorizonsResponse {
  result?: unknown
  error?: unknown
}

export function parseJunoHorizonsResponse(response: unknown): JunoTrajectoryPosition[] {
  if (!response || typeof response !== 'object') {
    throw new Error('JPL Horizons returned a malformed Juno trajectory response.')
  }

  const payload = response as JunoHorizonsResponse
  if (typeof payload.error === 'string' && payload.error.trim()) {
    throw new Error(`JPL Horizons rejected the Juno trajectory request: ${payload.error}`)
  }
  if (typeof payload.result !== 'string') {
    throw new Error('JPL Horizons returned no Juno trajectory result.')
  }

  const result = payload.result
  if (
    !/Target body name:\s*Juno \(spacecraft\) \(-61\)/i.test(result) ||
    !/Center body name:\s*Jupiter \(599\)/i.test(result) ||
    !/Output units\s*:\s*KM-S/i.test(result)
  ) {
    throw new Error('JPL Horizons did not confirm Juno vectors relative to Jupiter in kilometers.')
  }

  const start = result.indexOf('$$SOE')
  const end = result.indexOf('$$EOE', start + 5)
  if (start < 0 || end < 0) {
    throw new Error('JPL Horizons returned an empty or incomplete Juno trajectory.')
  }

  const rows = result
    .slice(start + 5, end)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const samples = rows.map((row, index) => {
    const columns = row.split(',').map((column) => column.trim())
    const [julianDateTdb, xKm, yKm, zKm] = [
      columns[0],
      ...columns.slice(2, 5),
    ].map(Number)
    if (
      columns.length < 5 ||
      !columns[1] ||
      ![julianDateTdb, xKm, yKm, zKm].every(Number.isFinite)
    ) {
      throw new Error(`JPL Horizons returned a malformed Juno vector at sample ${index + 1}.`)
    }

    const previous = index > 0 ? rows[index - 1].split(',')[0] : null
    if (previous !== null && julianDateTdb <= Number(previous)) {
      throw new Error('JPL Horizons returned Juno vectors that are not in chronological order.')
    }

    return {
      elapsedSeconds: 0,
      julianDateTdb,
      calendarDate: columns[1],
      xKm,
      yKm,
      zKm,
      distanceKm: Math.hypot(xKm, yKm, zKm),
    }
  })

  if (samples.length < 2) {
    throw new Error('JPL Horizons returned too few Juno vectors to build an orbital path.')
  }

  const firstEpoch = samples[0].julianDateTdb
  return samples.map((sample) => ({
    ...sample,
    elapsedSeconds: ((sample.julianDateTdb ?? firstEpoch) - firstEpoch) * 86_400,
  }))
}

export async function loadJunoHorizonsTrajectory(
  startTimeMs = Date.now(),
  signal?: AbortSignal,
): Promise<JunoTrajectory> {
  const start = new Date(startTimeMs)
  start.setUTCSeconds(0, 0)
  const stop = new Date(start.getTime() + JUNO_TRAJECTORY_DAYS * 24 * 60 * 60 * 1000)
  const parameters = new URLSearchParams({
    start: toUtcMinute(start),
    stop: toUtcMinute(stop),
  })
  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 45_000)
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })

  try {
    const response = await fetch(`${JUNO_TRAJECTORY_ENDPOINT}?${parameters}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      throw new Error(`JPL Horizons Juno trajectory request returned HTTP ${response.status}.`)
    }

    const samples = parseJunoHorizonsResponse(await response.json())
    const firstEpoch = samples[0].julianDateTdb
    const lastEpoch = samples[samples.length - 1].julianDateTdb
    if (firstEpoch === null || lastEpoch === null) {
      throw new Error('JPL Horizons returned a Juno trajectory without a complete epoch range.')
    }
    const expectedStartEpoch = start.getTime() / 86_400_000 + 2_440_587.5
    const expectedStopEpoch = stop.getTime() / 86_400_000 + 2_440_587.5
    const epochToleranceDays = (3 * 60 * 60) / 86_400
    if (
      Math.abs(firstEpoch - expectedStartEpoch) > epochToleranceDays ||
      Math.abs(lastEpoch - expectedStopEpoch) > epochToleranceDays
    ) {
      throw new Error('JPL Horizons did not return the full requested 56-day Juno trajectory interval.')
    }
    return {
      mode: 'horizons',
      samples,
      startTimeMs: start.getTime(),
      fetchedAt: Date.now(),
      source: 'NASA/JPL Horizons · Juno (-61) relative to Jupiter (599)',
      sourceUrl: 'https://ssd.jpl.nasa.gov/horizons/app.html',
    }
  } finally {
    globalThis.clearTimeout(timeoutId)
    signal?.removeEventListener('abort', abort)
  }
}

export function createApproximateJunoTrajectory(startTimeMs = Date.now()): JunoTrajectory {
  const periodSeconds = JUNO_ORBIT_PERIOD_SECONDS
  const semiMajorAxisKm = Math.cbrt(
    (JUPITER_GRAVITATIONAL_PARAMETER_KM3_PER_S2 * periodSeconds ** 2) / (4 * Math.PI ** 2),
  )
  const periapsisKm = JUPITER_EQUATORIAL_RADIUS_KM + JUNO_PERIJOVE_ALTITUDE_KM
  const eccentricity = 1 - periapsisKm / semiMajorAxisKm
  const stepSeconds = 3 * 60 * 60
  const count = Math.ceil(periodSeconds / stepSeconds)
  const samples = Array.from({ length: count + 1 }, (_, index) => {
    const elapsedSeconds = Math.min(index * stepSeconds, periodSeconds)
    const meanAnomaly = (elapsedSeconds / periodSeconds) * 2 * Math.PI
    let eccentricAnomaly = meanAnomaly < Math.PI
      ? meanAnomaly + eccentricity * 0.85
      : meanAnomaly - eccentricity * 0.85
    for (let iteration = 0; iteration < 10; iteration += 1) {
      eccentricAnomaly -=
        (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) /
        (1 - eccentricity * Math.cos(eccentricAnomaly))
    }

    const xKm = semiMajorAxisKm * (Math.cos(eccentricAnomaly) - eccentricity)
    const orbitalPlaneY =
      semiMajorAxisKm *
      Math.sqrt(1 - eccentricity ** 2) *
      Math.sin(eccentricAnomaly)
    const yKm = 0
    const zKm = orbitalPlaneY
    return {
      elapsedSeconds,
      julianDateTdb: null,
      calendarDate: new Date(startTimeMs + elapsedSeconds * 1000).toISOString(),
      xKm,
      yKm,
      zKm,
      distanceKm: Math.hypot(xKm, yKm, zKm),
    }
  })

  return {
    mode: 'approximate',
    samples,
    startTimeMs,
    fetchedAt: Date.now(),
    source: 'Approximate model · nominal 53-day polar Juno orbit',
    sourceUrl: JUNO_NASA_REFERENCE_URL,
    periodSeconds,
  }
}

export function mergeJunoHorizonsTrajectories(
  current: JunoTrajectory,
  next: JunoTrajectory,
): JunoTrajectory {
  if (current.mode !== 'horizons' || next.mode !== 'horizons') {
    throw new Error('Only Horizons trajectories can be joined as ephemeris coverage.')
  }
  const currentEnd = current.samples[current.samples.length - 1]
  const nextStart = next.samples[0]
  const currentEndJulianDate = currentEnd.julianDateTdb
  const nextStartJulianDate = nextStart.julianDateTdb
  if (
    currentEndJulianDate === null ||
    nextStartJulianDate === null ||
    Math.abs(currentEndJulianDate - nextStartJulianDate) * 86_400 > 60
  ) {
    throw new Error('The next Horizons interval does not join the existing Juno ephemeris.')
  }

  return {
    ...next,
    startTimeMs: current.startTimeMs,
    samples: [
      ...current.samples,
      ...next.samples.slice(1).map((sample) => {
        if (sample.julianDateTdb === null) {
          throw new Error('The next Horizons interval is missing a Juno vector epoch.')
        }
        return {
          ...sample,
          elapsedSeconds: currentEnd.elapsedSeconds +
            (sample.julianDateTdb - currentEndJulianDate) * 86_400,
        }
      }),
    ],
  }
}

export async function extendJunoHorizonsTrajectory(
  trajectory: JunoTrajectory,
  signal?: AbortSignal,
): Promise<JunoTrajectory> {
  if (trajectory.mode !== 'horizons') {
    throw new Error('Approximate Juno trajectories cannot be extended with Horizons data.')
  }
  const firstSample = trajectory.samples[0]
  const lastSample = trajectory.samples[trajectory.samples.length - 1]
  if (firstSample.julianDateTdb === null || lastSample.julianDateTdb === null) {
    throw new Error('The existing Juno ephemeris is missing Horizons epochs.')
  }
  const startUtcJulianDate = trajectory.startTimeMs / 86_400_000 + 2_440_587.5
  const tdbOffsetMs = (firstSample.julianDateTdb - startUtcJulianDate) * 86_400_000
  const nextStartTimeMs =
    trajectory.startTimeMs + lastSample.elapsedSeconds * 1000 + tdbOffsetMs
  const next = await loadJunoHorizonsTrajectory(nextStartTimeMs, signal)
  return mergeJunoHorizonsTrajectories(trajectory, next)
}

export function interpolateJunoPosition(
  trajectory: JunoTrajectory,
  elapsedSeconds: number,
): JunoTrajectoryPosition {
  const samples = trajectory.samples
  const lastSample = samples[samples.length - 1]
  const mappedSeconds = trajectory.periodSeconds
    ? ((elapsedSeconds % trajectory.periodSeconds) + trajectory.periodSeconds) %
      trajectory.periodSeconds
    : Math.max(0, Math.min(elapsedSeconds, lastSample.elapsedSeconds))

  let low = 0
  let high = samples.length - 1
  while (low + 1 < high) {
    const middle = Math.floor((low + high) / 2)
    if (samples[middle].elapsedSeconds <= mappedSeconds) low = middle
    else high = middle
  }

  const before = samples[low]
  const after = samples[Math.min(low + 1, samples.length - 1)]
  const interval = after.elapsedSeconds - before.elapsedSeconds
  const fraction = interval > 0 ? (mappedSeconds - before.elapsedSeconds) / interval : 0
  const xKm = before.xKm + (after.xKm - before.xKm) * fraction
  const yKm = before.yKm + (after.yKm - before.yKm) * fraction
  const zKm = before.zKm + (after.zKm - before.zKm) * fraction
  return {
    elapsedSeconds: mappedSeconds,
    julianDateTdb: null,
    calendarDate: '',
    xKm,
    yKm,
    zKm,
    distanceKm: Math.hypot(xKm, yKm, zKm),
  }
}

function toUtcMinute(date: Date) {
  return date.toISOString().slice(0, 16)
}
