import { describe, expect, it } from 'vitest'
import { availableSpacecraftCatalog, spacecraftCatalog } from './spacecraft'
import { defaultSustainabilityChoices } from './sustainability'
import {
  calculateBuildStats,
  createInitialBuild,
  getComponentFit,
  getSpacecraftBuildProfile,
  normalizeBuild,
  type SpacecraftBuild,
} from './spacecraftBuild'

describe('spacecraft builder defaults', () => {
  it('starts with the spacecraft model only and no optional modules installed', () => {
    expect(createInitialBuild().components).toEqual([])
  })

  it('offers only extension types compatible with the selected spacecraft', () => {
    const iss = availableSpacecraftCatalog.find((spacecraft) => spacecraft.id === 'iss')
    const perseverance = availableSpacecraftCatalog.find((spacecraft) => spacecraft.id === 'perseverance')
    const voyager = availableSpacecraftCatalog.find((spacecraft) => spacecraft.id === 'voyager')

    expect(iss).toBeDefined()
    expect(perseverance).toBeDefined()
    expect(voyager).toBeDefined()
    expect(getSpacecraftBuildProfile(iss!).components).toEqual(['solarPanel', 'instrument'])
    expect(getSpacecraftBuildProfile(perseverance!).components).toEqual(['instrument'])
    expect(getSpacecraftBuildProfile(voyager!).componentLabels.solarPanel).toBeUndefined()
    expect(getSpacecraftBuildProfile(voyager!).instrumentTypes).toEqual(['camera', 'spectrometer'])
  })

  it('does not offer physical add-ons for spacecraft without a verified 3D model', () => {
    const psyche = spacecraftCatalog.find((spacecraft) => spacecraft.id === 'psyche')

    expect(psyche).toBeDefined()
    expect(getSpacecraftBuildProfile(psyche!).components).toEqual([])
  })

  it('keeps profile option lists constrained to their supported component types', () => {
    for (const spacecraft of availableSpacecraftCatalog) {
      const profile = getSpacecraftBuildProfile(spacecraft)

      expect(profile.components.includes('instrument')).toBe(Boolean(profile.instrumentTypes?.length))
      expect(profile.components.includes('antenna')).toBe(Boolean(profile.antennaTypes?.length))
      expect(profile.components.includes('engine')).toBe(Boolean(profile.engineTypes?.length))
    }
  })

  it('defines model-aware upgrade, attachment, and internal fit modes', () => {
    const getCraft = (id: string) => availableSpacecraftCatalog.find((craft) => craft.id === id)!
    const profileFor = (id: string) => getSpacecraftBuildProfile(getCraft(id))

    expect(profileFor('voyager').fit.antenna?.mode).toBe('upgrade')
    expect(profileFor('voyager').fit.instrument?.mountPoint).toBe('science-boom-tip')
    expect(profileFor('cassini').fit.instrument?.mode).toBe('attach')
    expect(getComponentFit(profileFor('cassini'), 'instrument', 'radar')?.mountPoint).toBe('existing-dish')
    expect(getComponentFit(profileFor('clipper'), 'instrument', 'radar')?.mountPoint).toBe('existing-solar-array')
    expect(getComponentFit(profileFor('perseverance'), 'instrument', 'spectrometer')?.mountPoint).toBe('rover-arm-turret')
    expect(profileFor('iss').fit.solarPanel?.slots).toBe(2)
    expect(profileFor('jwst').fit.instrument?.mode).toBe('internal')
    expect(profileFor('roman').fit.instrument?.mode).toBe('internal')
    expect(profileFor('parker-solar-probe').fit.instrument?.mode).toBe('upgrade')
    expect(profileFor('cassini').antennaLabels?.deepSpace).toBe('Upgraded high-gain dish')
    for (const spacecraft of availableSpacecraftCatalog) {
      const profile = getSpacecraftBuildProfile(spacecraft)
      for (const component of profile.components) {
        expect(profile.fit[component]).toBeDefined()
      }
    }
  })

  it('normalizes spacecraft builds and prevents unsupported modules from affecting stats', () => {
    const voyager = availableSpacecraftCatalog.find((craft) => craft.id === 'voyager')!
    const incompatibleBuild: SpacecraftBuild = {
      ...createInitialBuild(),
      components: ['engine', 'solarPanel', 'instrument'],
      instrumentCount: 9,
    }
    const normalized = normalizeBuild(voyager, incompatibleBuild)

    expect(normalized.components).toEqual(['instrument'])
    expect(normalized.instrumentCount).toBe(4)

    const stats = calculateBuildStats(
      voyager,
      incompatibleBuild,
      0,
      100,
      0.2,
      1,
      defaultSustainabilityChoices,
      false,
    )
    const normalizedStats = calculateBuildStats(
      voyager,
      normalized,
      0,
      100,
      0.2,
      1,
      defaultSustainabilityChoices,
      false,
    )
    expect(stats).toEqual(normalizedStats)
  })
})
