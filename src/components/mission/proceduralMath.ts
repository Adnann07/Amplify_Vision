/* Shared math + procedural noise helpers for the launch sequence. */

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
export const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))
export const dampAngle = (current: number, target: number, rate: number, dt: number) => {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + diff * (1 - Math.exp(-rate * dt))
}
export function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/* ----------------------------- value noise -------------------------------- */

export function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

export function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const xf = x - xi
  const yf = y - yi
  const zf = z - zi
  const u = xf * xf * (3 - 2 * xf)
  const v = yf * yf * (3 - 2 * yf)
  const w = zf * zf * (3 - 2 * zf)
  const c000 = hash3(xi, yi, zi)
  const c100 = hash3(xi + 1, yi, zi)
  const c010 = hash3(xi, yi + 1, zi)
  const c110 = hash3(xi + 1, yi + 1, zi)
  const c001 = hash3(xi, yi, zi + 1)
  const c101 = hash3(xi + 1, yi, zi + 1)
  const c011 = hash3(xi, yi + 1, zi + 1)
  const c111 = hash3(xi + 1, yi + 1, zi + 1)
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v),
    w,
  )
}

export function fbm3(x: number, y: number, z: number, octaves: number) {
  let sum = 0
  let amplitude = 0.5
  let frequency = 1
  let norm = 0
  for (let octave = 0; octave < octaves; octave++) {
    sum += noise3(x * frequency, y * frequency, z * frequency) * amplitude
    norm += amplitude
    amplitude *= 0.5
    frequency *= 2.03
  }
  return sum / norm
}
