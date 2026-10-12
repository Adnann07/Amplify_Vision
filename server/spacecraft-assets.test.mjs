import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const verifiedAssets = [
  ['public/models/perseverance/Mars2020PerseveranceRover.glb', 4_987_176],
  ['public/models/osiris-rex/OSIRIS-REx.glb', 1_281_308],
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
})
