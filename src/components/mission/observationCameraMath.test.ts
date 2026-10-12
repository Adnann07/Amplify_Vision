import { describe, expect, it } from 'vitest'
import {
  computeCameraDirection,
  computeCameraGroundPoint,
  computeSyntheticOrbit,
  createGibsAimpointImageUrl,
} from './observationCameraMath'

describe('synthetic onboard camera geometry', () => {
  it('moves its ground subpoint as mission elapsed time advances', () => {
    const start = computeSyntheticOrbit(0, [-77, 38.9])
    const later = computeSyntheticOrbit(15 * 60, [-77, 38.9])

    expect(later.position).not.toEqual(start.position)
    expect(later.longitudeDegrees).not.toBe(start.longitudeDegrees)
  })

  it('starts over the selected target coordinates', () => {
    const initial = computeSyntheticOrbit(0, [-77, 38.9])

    expect(initial.longitudeDegrees).toBeCloseTo(-77, 8)
    expect(initial.latitudeDegrees).toBeCloseTo(38.9, 8)
  })

  it('keeps the same geometry for a paused MET value', () => {
    const firstFrame = computeSyntheticOrbit(120, [-77, 38.9])
    const pausedFrame = computeSyntheticOrbit(120, [-77, 38.9])

    expect(pausedFrame).toEqual(firstFrame)
  })

  it('changes the camera look direction when azimuth or elevation changes', () => {
    const orbit = computeSyntheticOrbit(450, [-77, 38.9])
    const nadirView = computeCameraDirection(orbit, 0, 0)
    const offNadirView = computeCameraDirection(orbit, 20, -15)

    expect(offNadirView).not.toEqual(nadirView)
    expect(Math.hypot(...offNadirView)).toBeCloseTo(1, 10)
  })

  it('computes the camera aimpoint on the Earth and changes it with camera pointing', () => {
    const orbit = computeSyntheticOrbit(0, [-77, 38.9])
    const nadirAim = computeCameraGroundPoint(orbit, 0, 0)
    const offsetAim = computeCameraGroundPoint(orbit, 25, -12)

    expect(nadirAim?.[0]).toBeCloseTo(-77, 8)
    expect(nadirAim?.[1]).toBeCloseTo(38.9, 8)
    expect(offsetAim).not.toEqual(nadirAim)
  })

  it('reports no ground aimpoint when the camera points beyond the horizon', () => {
    const orbit = computeSyntheticOrbit(0, [-77, 38.9])

    expect(computeCameraGroundPoint(orbit, 90, 0)).toBeNull()
  })

  it('requests a date-specific NASA GIBS tile around the computed ground aimpoint', () => {
    const url = new URL(createGibsAimpointImageUrl([-77.4, 38.9], '2026-10-10', 30))
    const [south, west, north, east] = url.searchParams.get('BBOX')!.split(',').map(Number)

    expect(url.hostname).toBe('wvs.earthdata.nasa.gov')
    expect(url.searchParams.get('TIME')).toBe('2026-10-10')
    expect(url.searchParams.get('LAYERS')).toBe('MODIS_Terra_CorrectedReflectance_TrueColor')
    expect(west).toBeLessThan(-77)
    expect(east).toBeGreaterThan(-77)
    expect(south).toBeLessThan(39)
    expect(north).toBeGreaterThan(39)
  })

  it('keeps nearby camera movement in the same imagery region until it crosses a 10-degree cell', () => {
    const first = new URL(createGibsAimpointImageUrl([-77.4, 38.9], '2026-10-10', 30))
    const nearby = new URL(createGibsAimpointImageUrl([-76, 40], '2026-10-10', 30))
    const nextRegion = new URL(createGibsAimpointImageUrl([-70, 40], '2026-10-10', 30))

    expect(nearby.searchParams.get('BBOX')).toBe(first.searchParams.get('BBOX'))
    expect(nextRegion.searchParams.get('BBOX')).not.toBe(first.searchParams.get('BBOX'))
  })

  it('changes NASA map bounds with camera location and date', () => {
    const baseline = new URL(createGibsAimpointImageUrl([-77, 38], '2026-10-10', 15))
    const shifted = new URL(createGibsAimpointImageUrl([-60, -3], '2026-10-11', 15))

    expect(shifted.searchParams.get('TIME')).not.toBe(baseline.searchParams.get('TIME'))
    expect(shifted.searchParams.get('BBOX')).not.toBe(baseline.searchParams.get('BBOX'))
  })

  it('narrows the NASA image crop when camera field of view is zoomed in', () => {
    const zoomedIn = new URL(createGibsAimpointImageUrl([-77, 38], '2026-10-10', 8))
    const zoomedOut = new URL(createGibsAimpointImageUrl([-77, 38], '2026-10-10', 50))
    const bounds = (url: URL) => url.searchParams.get('BBOX')!.split(',').map(Number)
    const [closeSouth, closeWest, closeNorth, closeEast] = bounds(zoomedIn)
    const [wideSouth, wideWest, wideNorth, wideEast] = bounds(zoomedOut)

    expect(closeNorth - closeSouth).toBeLessThan(wideNorth - wideSouth)
    expect(closeEast - closeWest).toBeLessThan(wideEast - wideWest)
  })
})
