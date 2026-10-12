import { describe, expect, it } from 'vitest'
import { launchVehicles } from './launchVehicles'
import { availableSpacecraftCatalog, filterSpacecraft, spacecraftCatalog } from './spacecraft'

const newSpacecraftIds = [
  'orion',
  'perseverance',
  'osiris-rex',
  'psyche',
  'lucy',
  'landsat-9',
]

describe('spacecraft preset catalogue', () => {
  it('preserves the original spacecraft IDs and adds all six requested presets', () => {
    expect(spacecraftCatalog.slice(0, 5).map((spacecraft) => spacecraft.id)).toEqual([
      'voyager',
      'cassini',
      'clipper',
      'iss',
      'lunar',
    ])
    expect(newSpacecraftIds.every((id) => spacecraftCatalog.some((craft) => craft.id === id))).toBe(true)
    expect(new Set(spacecraftCatalog.map((craft) => craft.id)).size).toBe(spacecraftCatalog.length)
  })

  it('keeps spacecraft distinct from launch vehicles', () => {
    expect(newSpacecraftIds.some((id) => launchVehicles.some((vehicle) => vehicle.id === id))).toBe(false)
  })

  it('offers only spacecraft with verified 3D models in the model picker', () => {
    expect(availableSpacecraftCatalog.length).toBeGreaterThan(0)
    expect(availableSpacecraftCatalog.map((craft) => craft.id)).toEqual([
      'voyager',
      'cassini',
      'clipper',
      'iss',
      'perseverance',
      'osiris-rex',
    ])
  })

  it('filters spacecraft by category and searchable metadata without mutating the catalog', () => {
    const ids = spacecraftCatalog.map((craft) => craft.id)
    expect(filterSpacecraft(spacecraftCatalog, 'Earth observation', '').map((craft) => craft.id))
      .toEqual(['landsat-9'])
    expect(filterSpacecraft(spacecraftCatalog, 'All', '  jezero ').map((craft) => craft.id))
      .toEqual(['perseverance'])
    expect(filterSpacecraft(spacecraftCatalog, 'All', '').map((craft) => craft.id)).toEqual(ids)
    expect(spacecraftCatalog.map((craft) => craft.id)).toEqual(ids)
  })

  it('provides mission status, category, sources, and explicit gameplay boundaries', () => {
    for (const id of newSpacecraftIds) {
      const craft = spacecraftCatalog.find((spacecraft) => spacecraft.id === id)
      expect(craft?.missionCategory).toBeTruthy()
      expect(craft?.missionStatus).toBeTruthy()
      expect(craft?.missionPurpose).toBeTruthy()
      expect(craft?.gameplayNote).toContain('gameplay values')
      expect(craft?.assetAttribution).toBeTruthy()
      expect(craft?.model.sourceUrl.startsWith('https://')).toBe(true)
      expect(craft?.missionSourceUrl?.startsWith('https://')).toBe(true)
    }
    expect(spacecraftCatalog.find((craft) => craft.id === 'orion')?.missionPurpose)
      .toContain('not a lunar lander')
    expect(spacecraftCatalog.find((craft) => craft.id === 'osiris-rex')?.missionStatus)
      .toContain('Primary mission complete')
    expect(spacecraftCatalog.find((craft) => craft.id === 'lucy')?.missionPurpose)
      .toContain('does not routinely enter asteroid orbit')
    expect(spacecraftCatalog.find((craft) => craft.id === 'orion')?.crewCapacity).toBe(4)
  })

  it('registers the downloaded models and explicitly marks unverified models unavailable', () => {
    for (const craft of spacecraftCatalog) {
      if (craft.model.format === 'unavailable') {
        expect(craft.model.reason.length).toBeGreaterThan(0)
      }
    }
    expect(spacecraftCatalog.find((craft) => craft.id === 'perseverance')?.model)
      .toMatchObject({ format: 'glb', modelPath: '/models/perseverance/Mars2020PerseveranceRover.glb' })
    expect(spacecraftCatalog.find((craft) => craft.id === 'osiris-rex')?.model)
      .toMatchObject({ format: 'glb', modelPath: '/models/osiris-rex/OSIRIS-REx.glb' })
  })
})
