import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createJunoTrajectoryHandler } from './juno-trajectory.mjs'

async function withApi(handler, callback) {
  const server = createServer(handler)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Test server failed to start.')
  try {
    await callback(`http://127.0.0.1:${address.port}/api/juno-trajectory`)
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()),
    )
  }
}

describe('Juno Horizons trajectory endpoint', () => {
  it('requests the fixed Juno target relative to Jupiter and returns Horizons data', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"result":"vector rows"}'))
    const handler = createJunoTrajectoryHandler({ fetchImpl })

    await withApi(handler, async (endpoint) => {
      const response = await fetch(
        `${endpoint}?start=2026-10-15T20%3A18&stop=2026-12-10T20%3A18`,
      )
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ result: 'vector rows' })
    })

    const request = new URL(fetchImpl.mock.calls[0][0])
    expect(request.origin).toBe('https://ssd.jpl.nasa.gov')
    expect(request.pathname).toBe('/api/horizons.api')
    expect(request.searchParams.get('COMMAND')).toBe("'-61'")
    expect(request.searchParams.get('CENTER')).toBe("'500@599'")
    expect(request.searchParams.get('START_TIME')).toBe("'2026-10-15 20:18'")
    expect(request.searchParams.get('STOP_TIME')).toBe("'2026-12-10 20:18'")
    expect(request.searchParams.get('STEP_SIZE')).toBe("'3 h'")
    expect(request.searchParams.get('OUT_UNITS')).toBe('KM-S')
    expect(request.searchParams.get('VEC_TABLE')).toBe('1')
  })

  it('rejects invalid UTC ranges without calling JPL', async () => {
    const fetchImpl = vi.fn()
    const handler = createJunoTrajectoryHandler({ fetchImpl })

    await withApi(handler, async (endpoint) => {
      const invalid = await fetch(
        `${endpoint}?start=2026-02-30T20%3A18&stop=2026-04-27T20%3A18`,
      )
      const tooLong = await fetch(
        `${endpoint}?start=2026-10-15T20%3A18&stop=2027-01-01T20%3A18`,
      )
      expect(invalid.status).toBe(400)
      expect(tooLong.status).toBe(400)
    })

    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
