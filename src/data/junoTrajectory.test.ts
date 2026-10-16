import { describe, expect, it } from 'vitest'
import {
  createApproximateJunoTrajectory,
  extendJunoHorizonsTrajectory,
  interpolateJunoPosition,
  JUNO_ORBIT_PERIOD_SECONDS,
  JUNO_PERIJOVE_ALTITUDE_KM,
  JUPITER_EQUATORIAL_RADIUS_KM,
  mergeJunoHorizonsTrajectories,
  parseJunoHorizonsResponse,
} from './junoTrajectory'

function response(rows: string[], target = 'Juno (spacecraft) (-61)', center = 'Jupiter (599)') {
  return {
    result: [
      `Target body name: ${target}`,
      `Center body name: ${center}`,
      'Output units    : KM-S',
      '$$SOE',
      ...rows,
      '$$EOE',
    ].join('\n'),
  }
}

describe('Juno trajectory data', () => {
  it('parses JPL Jupiter-relative vectors without changing their coordinates', () => {
    const positions = parseJunoHorizonsResponse(response([
      '2461329.5, A.D. 2026-Oct-16 00:00:00.0000, 100000, 200000, -300000,',
      '2461329.625, A.D. 2026-Oct-16 03:00:00.0000, 110000, 210000, -310000,',
    ]))

    expect(positions).toHaveLength(2)
    expect(positions[0]).toMatchObject({
      elapsedSeconds: 0,
      julianDateTdb: 2461329.5,
      xKm: 100000,
      yKm: 200000,
      zKm: -300000,
    })
    expect(positions[1].elapsedSeconds).toBeCloseTo(10_800, 2)
    expect(positions[0].distanceKm).toBeCloseTo(Math.sqrt(140_000_000_000), 5)
  })

  it('rejects vectors unless Horizons confirms the Juno target and Jupiter center', () => {
    const rows = [
      '2461329.5, A.D. 2026-Oct-16 00:00:00.0000, 1, 2, 3,',
      '2461329.625, A.D. 2026-Oct-16 03:00:00.0000, 2, 3, 4,',
    ]
    expect(() => parseJunoHorizonsResponse(response(rows, 'Jupiter (599)'))).toThrow(/did not confirm/)
    expect(() => parseJunoHorizonsResponse(response(rows, 'Juno (spacecraft) (-61)', 'Sun (10)'))).toThrow(/did not confirm/)
    expect(() => parseJunoHorizonsResponse(response([rows[0]]))).toThrow(/too few/)
  })

  it('creates an explicitly approximate, periodic Juno orbit from cited orbital characteristics', () => {
    const trajectory = createApproximateJunoTrajectory(Date.UTC(2026, 9, 16))
    const perijove = interpolateJunoPosition(trajectory, 0)
    const nextPosition = interpolateJunoPosition(trajectory, 6 * 60 * 60)

    expect(trajectory.mode).toBe('approximate')
    expect(trajectory.source).toMatch(/Approximate model/)
    expect(trajectory.samples[0].julianDateTdb).toBeNull()
    expect(trajectory.periodSeconds).toBe(JUNO_ORBIT_PERIOD_SECONDS)
    expect(perijove.distanceKm).toBeCloseTo(
      JUPITER_EQUATORIAL_RADIUS_KM + JUNO_PERIJOVE_ALTITUDE_KM,
      0,
    )
    expect(nextPosition.distanceKm).toBeGreaterThan(perijove.distanceKm)
    expect(interpolateJunoPosition(trajectory, JUNO_ORBIT_PERIOD_SECONDS).xKm).toBeCloseTo(
      perijove.xKm,
      3,
    )
  })

  it('interpolates measured positions and holds the final ephemeris vector', () => {
    const samples = parseJunoHorizonsResponse(response([
      '2461329.5, A.D. 2026-Oct-16 00:00:00.0000, 100, 200, 300,',
      '2461329.625, A.D. 2026-Oct-16 03:00:00.0000, 200, 400, 600,',
    ]))
    const trajectory = {
      mode: 'horizons' as const,
      samples,
      startTimeMs: 0,
      fetchedAt: 1,
      source: 'JPL Horizons',
      sourceUrl: 'https://ssd.jpl.nasa.gov/horizons/app.html',
    }

    expect(interpolateJunoPosition(trajectory, 5400)).toMatchObject({
      xKm: 150,
      yKm: 300,
      zKm: 450,
    })
    expect(interpolateJunoPosition(trajectory, 20_000).xKm).toBe(200)
  })

  it('joins successive Horizons intervals without a duplicate sample or time jump', async () => {
    const currentSamples = parseJunoHorizonsResponse(response([
      '2461329.5, A.D. 2026-Oct-16 00:00:00.0000, 100, 200, 300,',
      '2461329.625, A.D. 2026-Oct-16 03:00:00.0000, 200, 400, 600,',
    ]))
    const nextSamples = parseJunoHorizonsResponse(response([
      '2461329.625, A.D. 2026-Oct-16 03:00:00.0000, 200, 400, 600,',
      '2461329.75, A.D. 2026-Oct-16 06:00:00.0000, 300, 600, 900,',
    ]))
    const current = {
      mode: 'horizons' as const,
      samples: currentSamples,
      startTimeMs: Date.UTC(2026, 9, 16),
      fetchedAt: 1,
      source: 'JPL Horizons',
      sourceUrl: 'https://ssd.jpl.nasa.gov/horizons/app.html',
    }
    const next = { ...current, samples: nextSamples, fetchedAt: 2 }
    const extended = mergeJunoHorizonsTrajectories(current, next)

    expect(extended.samples).toHaveLength(3)
    expect(extended.samples[2].elapsedSeconds).toBeCloseTo(21_600, 2)
    expect(extended.startTimeMs).toBe(current.startTimeMs)
    expect(interpolateJunoPosition(extended, 16_200)).toMatchObject({
      xKm: 250,
      yKm: 500,
      zKm: 750,
    })
    await expect(
      extendJunoHorizonsTrajectory(createApproximateJunoTrajectory()),
    ).rejects.toThrow(/cannot be extended/)
  })
})
