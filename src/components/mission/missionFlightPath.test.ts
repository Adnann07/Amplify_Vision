import { describe, expect, it } from 'vitest'
import {
  FLIGHT_DESTINATION_CENTER,
  getOrbitPosition,
  getTransferPosition,
  resolveFlightDestination,
} from './missionFlightPath'

describe('mission flight path', () => {
  it('resolves the configured planetary destination instead of defaulting to Earth', () => {
    expect(resolveFlightDestination('saturn', 'saturn', 'Saturn')?.id).toBe('saturn')
    expect(resolveFlightDestination('europa', 'jupiter', 'Europa')?.id).toBe('jupiter')
    expect(resolveFlightDestination('moon', null, 'Moon')?.id).toBe('moon')
  })

  it('returns no destination for an unsupported planning target', () => {
    expect(resolveFlightDestination('asteroid-planning', null, 'Asteroid observation planning target')).toBeNull()
    expect(resolveFlightDestination(undefined, null, 'Unknown target')).toBeNull()
  })

  it('moves the spacecraft from departure to the destination without teleporting', () => {
    const start = { x: 0, y: 300, z: 0 }
    const end = { x: 46, y: 190, z: -200 }
    const mid = getTransferPosition(start, end, 0.5)
    expect(getTransferPosition(start, end, 0)).toEqual(start)
    expect(getTransferPosition(start, end, 1)).toEqual(end)
    expect(mid).not.toEqual(start)
    expect(mid).not.toEqual(end)
  })

  it('moves around the configured planet center at a constant orbital radius', () => {
    const first = getOrbitPosition(FLIGHT_DESTINATION_CENTER, 64, 0)
    const second = getOrbitPosition(FLIGHT_DESTINATION_CENTER, 64, Math.PI / 2)
    expect(first).not.toEqual(second)
    expect(Math.hypot(first.x - FLIGHT_DESTINATION_CENTER.x, first.z - FLIGHT_DESTINATION_CENTER.z)).toBeCloseTo(64)
    expect(Math.hypot(second.x - FLIGHT_DESTINATION_CENTER.x, second.z - FLIGHT_DESTINATION_CENTER.z)).toBeCloseTo(64)
  })
})
