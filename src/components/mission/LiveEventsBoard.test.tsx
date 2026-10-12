import { describe, expect, it } from 'vitest'
import { formatTimestamp } from './liveEventFormatting'

describe('live event timestamp formatting', () => {
  it('formats UTC timestamps with a timezone label', () => {
    expect(formatTimestamp('2026-10-12T15:08:03.840Z')).toMatch(/Oct 12, 2026.*UTC/)
  })

  it('preserves unzoned JPL close-approach times as TDB', () => {
    expect(formatTimestamp('2026-10-15T12:00:00.000', 'TDB'))
      .toBe('2026-10-15 12:00:00.000 TDB')
  })

  it('handles missing and invalid timestamps', () => {
    expect(formatTimestamp(null)).toBe('Not reported')
    expect(formatTimestamp('not a timestamp')).toBe('Not reported')
  })
})
