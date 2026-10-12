import { describe, expect, it } from 'vitest'
import { createInitialBuild } from './spacecraftBuild'

describe('spacecraft builder defaults', () => {
  it('starts with the spacecraft model only and no optional modules installed', () => {
    expect(createInitialBuild().components).toEqual([])
  })
})
