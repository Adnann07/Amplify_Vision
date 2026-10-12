import { describe, expect, it } from 'vitest'
import { prepareKIndexChart } from './noaaSpaceWeather'

describe('NOAA K-index chart preparation', () => {
  it('maps timestamps and Kp values into the bounded chart scale', () => {
    expect(prepareKIndexChart([
      { time: '2026-10-12T00:00:00Z', kp: 0 },
      { time: '2026-10-12T03:00:00Z', kp: 9 },
    ])).toEqual([
      { time: '2026-10-12T00:00:00Z', kp: 0, x: 42, y: 150 },
      { time: '2026-10-12T03:00:00Z', kp: 9, x: 590, y: 24 },
    ])
  })

  it('caps chart points to the latest 48 measurements and handles empty data', () => {
    const points = prepareKIndexChart(Array.from({ length: 60 }, (_, index) => ({ time: String(index), kp: index })))
    expect(points).toHaveLength(48)
    expect(points[0].time).toBe('12')
    expect(points.at(-1)?.time).toBe('59')
    expect(prepareKIndexChart([])).toEqual([])
  })
})
