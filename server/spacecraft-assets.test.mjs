import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const verifiedAssets = [
  ['public/models/perseverance/Mars2020PerseveranceRover.glb', 4_987_176],
  ['public/models/osiris-rex/OSIRIS-REx.glb', 1_281_308],
  ['public/models/jwst/JamesWebbSpaceTelescopeB.glb', 1_004_248],
  ['public/models/parker-solar-probe/ParkerSolarProbe.glb', 443_572],
  ['public/models/juno/JunoB.glb', 262_360],
  ['public/models/roman/RomanSpaceTelescopeB.glb', 342_672],
  ['public/models/ingenuity/IngenuityMarsHelicopter.glb', 2_019_408],
  ['public/models/landsat-8/Landsat8.glb', 780_280],
  ['public/models/dscovr/DSCOVR.glb', 112_488],
]

describe('NASA mission model assets', () => {
  it.each(verifiedAssets)('%s exists as a complete GLB downloaded from NASA-3D-Resources', async (relativePath, expectedSize) => {
    const bytes = await readFile(resolve(projectRoot, relativePath))
    expect(bytes.subarray(0, 4).toString('ascii')).toBe('glTF')
    expect(bytes.byteLength).toBe(expectedSize)
    expect(bytes.readUInt32LE(4)).toBe(2)
    expect(bytes.readUInt32LE(8)).toBe(bytes.byteLength)
    expect(bytes.readUInt32LE(16)).toBe(0x4e4f534a)
    const jsonLength = bytes.readUInt32LE(12)
    const model = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength))
    expect(model.asset.version).toBe('2.0')
    expect(model.meshes.length).toBeGreaterThan(0)
  })

  it('keeps the original Voyager, Cassini, Europa Clipper, and ISS model assets present', async () => {
    for (const relativePath of [
      'public/models/voyager/bus.stl',
      'public/models/cassini/bus_01.stl',
      'public/models/europa-clipper/YZ-Body-EuropaClipper-2025D.stl',
      'public/models/iss/iss.glb',
    ]) {
      const bytes = await readFile(resolve(projectRoot, relativePath))
      expect(bytes.byteLength).toBeGreaterThan(80)
    }
  })

  it('keeps the NASA SLS Block 1 source mesh valid and maps it to the heavy launch vehicle', async () => {
    const path = resolve(projectRoot, 'public/models/nasa-sls-block1/SLSBlock1.stl')
    const bytes = await readFile(path)
    expect(bytes.byteLength).toBe(13_721_684)
    expect(bytes.readUInt32LE(80)).toBe(274_432)
    expect(84 + bytes.readUInt32LE(80) * 50).toBe(bytes.byteLength)
    const geometry = new STLLoader().parse(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    )
    expect(geometry.getAttribute('position').count / 3).toBe(274_432)
    geometry.dispose()
    const launchVehicles = await import('../src/data/launchVehicles.ts')
    expect(launchVehicles.launchVehicles.find((vehicle) => vehicle.id === 'heavy-launcher'))
      .toMatchObject({
        name: 'NASA SLS Block 1',
        model: {
          format: 'stl',
          modelPath: '/models/nasa-sls-block1/SLSBlock1.stl',
        },
      })
  })
})
