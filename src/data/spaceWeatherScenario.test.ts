import { describe, expect, it } from 'vitest'
import { createSpaceWeatherScenario } from './spaceWeatherScenario'

describe('space-weather decision exercise', () => {
  it('is deterministic and uses current-feed context without inventing spacecraft impacts', () => {
    const context = { alertMessage: 'Watch issued by NOAA.', alertTime: '2026-10-12T10:00:00.000Z', latestKp: 6 }
    const first = createSpaceWeatherScenario(context)
    expect(createSpaceWeatherScenario(context)).toEqual(first)
    expect(first.briefing).toContain('6 on the 0–9 scale')
    expect(first.simulationNotice).toContain('no spacecraft impact')
    expect(first.decisions).toHaveLength(3)
  })

  it('handles unavailable feeds without filling in simulated observations', () => {
    const scenario = createSpaceWeatherScenario({ alertMessage: null, alertTime: null, latestKp: null })
    expect(scenario.briefing).toContain('measurement is unavailable')
    expect(scenario.sourceTime).toBeNull()
  })
})
