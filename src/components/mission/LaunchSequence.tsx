import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  AdditiveBlending,
  AmbientLight,
  BackSide,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Fog,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PointLight,
  Points,
  PointsMaterial,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type { LaunchRecord } from '../../data/launchVehicles'
import {
  LAUNCH_SEQUENCE_DURATION,
  isTerminalSequencePhase,
  sequenceElapsedAt,
  sequencePhaseAt,
  STABLE_ORBIT_TIME,
  type SequencePhase,
} from './launchSequenceState'
import { NasaSlsRocket, ProceduralRocket } from './LaunchVehicleModels'
import { SpacecraftPayloadModel } from './SpacecraftPayloadModel'
import {
  getOrbitPosition,
  getTransferPosition,
  resolveFlightDestination,
} from './missionFlightPath'
import type { FlightDestination, FlightPoint, MissionFlightProfile } from './missionFlightPath'

/* -------------------------------------------------------------------------- */
/*  Timing + scene constants                                                  */
/* -------------------------------------------------------------------------- */

const LIFTOFF_TIME = 4.1
const FAILURE_TIME = 6.35
const FAIRING_SEPARATION_TIME = 7
const SPACECRAFT_DEPLOYMENT_TIME = 8.1
const ASCENT_COMPLETE_TIME = LAUNCH_SEQUENCE_DURATION
const TRANSFER_START_TIME = 15
const ARRIVAL_TIME = 26
const ORBIT_RADIUS_OFFSET = 18
const STABLE_ORBIT_PLANET_SCALE = 2.5
const ORBIT_ANGULAR_SPEED = 0.22

const SUN_DIRECTION = new Vector3(110, 180, 85).normalize()
const HORIZON_COLOR = '#9db8c4'
const SPACE_COLOR = '#01030a'
const SKY_RADIUS = 30000
const EARTH_BACKDROP_RADIUS = 1800
const EARTH_BACKDROP_BASE_Y = -EARTH_BACKDROP_RADIUS - 170

/* -------------------------------------------------------------------------- */
/*  Small math helpers                                                        */
/* -------------------------------------------------------------------------- */

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const damp = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))
const dampAngle = (current: number, target: number, rate: number, dt: number) => {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current))
  return current + diff * (1 - Math.exp(-rate * dt))
}
function seeded(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/* -------------------------------------------------------------------------- */
/*  Procedural noise (seamless 3D value noise, sampled on the sphere)          */
/* -------------------------------------------------------------------------- */

function hash3(x: number, y: number, z: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1103515245)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}

function noise3(x: number, y: number, z: number) {
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

function fbm3(x: number, y: number, z: number, octaves: number) {
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

/* -------------------------------------------------------------------------- */
/*  Procedural planet surfaces                                                */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number]
interface Surface {
  color: RGB
  height: number
}
type PlanetStyle =
  | 'earth' | 'mars' | 'venus' | 'mercury' | 'moon' | 'jupiter'
  | 'saturn' | 'uranus' | 'neptune' | 'titan' | 'europa' | 'rocky'

const rgbMix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]

interface GiantConfig {
  colors: [RGB, RGB, RGB, RGB]
  bands: number
  turbulence: number
  contrast: number
  spot: boolean
}

function gasGiant(nx: number, ny: number, nz: number, cfg: GiantConfig): Surface {
  const turbulence = fbm3(nx * 3 + 7, ny * 1.6, nz * 3 + 2, 4)
  const warped = ny * cfg.bands + (turbulence - 0.5) * cfg.turbulence
  const bandA = Math.sin(warped * 3.1) * 0.5 + 0.5
  const bandB = Math.sin(warped * 7.7 + 1.3) * 0.5 + 0.5
  const streak = fbm3(nx * 14, warped * 2.5, nz * 14, 3)
  let color = rgbMix(cfg.colors[0], cfg.colors[1], bandA)
  color = rgbMix(color, cfg.colors[2], smoothstep(0.55, 1, bandB) * cfg.contrast)
  color = rgbMix(color, cfg.colors[3], smoothstep(0.62, 0.9, streak) * 0.35 * cfg.contrast)
  if (cfg.spot) {
    const longitude = Math.atan2(nz, nx)
    const delta = Math.atan2(Math.sin(longitude - 0.8), Math.cos(longitude - 0.8))
    const d = (delta / 0.3) ** 2 + ((ny + 0.27) / 0.095) ** 2
    if (d < 1) {
      const t = 1 - d
      color = rgbMix(color, [176, 74, 48], Math.min(1, t * 1.4) * 0.92)
    }
  }
  const poleShade = 1 - 0.28 * Math.abs(ny) ** 3
  return { color: [color[0] * poleShade, color[1] * poleShade, color[2] * poleShade], height: 0.5 }
}

const JUPITER: GiantConfig = {
  colors: [[232, 214, 182], [196, 148, 100], [140, 92, 62], [246, 238, 222]],
  bands: 9, turbulence: 1.3, contrast: 0.85, spot: true,
}
const SATURN: GiantConfig = {
  colors: [[232, 214, 168], [212, 188, 134], [176, 146, 100], [245, 232, 196]],
  bands: 7, turbulence: 0.9, contrast: 0.5, spot: false,
}
const URANUS: GiantConfig = {
  colors: [[178, 228, 232], [152, 212, 222], [134, 198, 212], [192, 238, 240]],
  bands: 4, turbulence: 0.6, contrast: 0.25, spot: false,
}
const NEPTUNE: GiantConfig = {
  colors: [[74, 112, 228], [42, 78, 192], [26, 50, 150], [206, 228, 255]],
  bands: 7, turbulence: 1.4, contrast: 0.7, spot: false,
}
const TITAN: GiantConfig = {
  colors: [[208, 152, 72], [192, 136, 62], [166, 112, 48], [222, 172, 92]],
  bands: 3, turbulence: 0.4, contrast: 0.2, spot: false,
}

function cratered(nx: number, ny: number, nz: number) {
  const base = fbm3(nx * 5 + 3, ny * 5, nz * 5, 6)
  const ridge = 1 - Math.abs(noise3(nx * 11 + 9, ny * 11, nz * 11) * 2 - 1)
  const rim = Math.pow(ridge, 6)
  return { base, height: clamp01(base * 0.75 + rim * 0.35) }
}

function sampleSurface(style: PlanetStyle, nx: number, ny: number, nz: number, tint: RGB): Surface {
  switch (style) {
    case 'earth': {
      const e = fbm3(nx * 2.3 + 11, ny * 2.3, nz * 2.3, 6)
      const warp = fbm3(nx * 6, ny * 6 + 3, nz * 6, 4)
      const polar = Math.abs(ny)
      const SEA = 0.55
      if (e < SEA) {
        let c = rgbMix([5, 22, 60], [22, 92, 152], smoothstep(0.3, SEA, e))
        c = rgbMix(c, [52, 148, 178], smoothstep(SEA - 0.035, SEA, e) * 0.7)
        c = rgbMix(c, [232, 240, 247], smoothstep(0.86, 0.93, polar + (warp - 0.5) * 0.12))
        return { color: c, height: 0 }
      }
      const alt = smoothstep(SEA, 0.8, e)
      const dry = smoothstep(0.45, 0.62, warp) * (1 - smoothstep(0.35, 0.7, polar))
      let c = rgbMix([44, 90, 40], [104, 114, 58], warp)
      c = rgbMix(c, [198, 168, 108], dry)
      c = rgbMix(c, [122, 106, 88], smoothstep(0.5, 0.75, alt))
      c = rgbMix(c, [238, 240, 244], smoothstep(0.72, 0.92, alt * 0.7 + polar * 0.5))
      c = rgbMix(c, [238, 244, 250], smoothstep(0.8, 0.9, polar + (warp - 0.5) * 0.12))
      return { color: c, height: 0.35 + alt * 0.65 }
    }
    case 'mars': {
      const e = fbm3(nx * 2.6 + 5, ny * 2.6, nz * 2.6, 6)
      const m = fbm3(nx * 1.2 + 9, ny * 1.2, nz * 1.2, 3)
      const crater = cratered(nx, ny, nz)
      let c = rgbMix([182, 96, 58], [216, 152, 104], smoothstep(0.4, 0.7, e))
      c = rgbMix(c, [96, 54, 40], smoothstep(0.52, 0.7, m) * 0.65)
      c = rgbMix(c, [240, 236, 230], smoothstep(0.9, 0.96, Math.abs(ny) + (e - 0.5) * 0.08))
      return { color: c, height: crater.height }
    }
    case 'venus': {
      const warp = fbm3(nx * 1.6, ny * 2.4, nz * 1.6, 3)
      const swirl = fbm3(nx * 2.2 + warp * 1.8, ny * 4 + warp, nz * 2.2 - warp * 1.8, 5)
      return { color: rgbMix([206, 166, 98], [244, 220, 168], smoothstep(0.3, 0.75, swirl)), height: 0.5 }
    }
    case 'mercury': {
      const crater = cratered(nx, ny, nz)
      const k = 0.65 + crater.base * 0.6
      return { color: [124 * k, 116 * k, 108 * k], height: crater.height }
    }
    case 'moon': {
      const crater = cratered(nx, ny, nz)
      const maria = smoothstep(0.52, 0.64, fbm3(nx * 1.6 + 4, ny * 1.6, nz * 1.6, 4))
      const k = 0.7 + crater.base * 0.55
      return { color: rgbMix([156 * k, 154 * k, 150 * k], [66, 69, 76], maria * 0.7), height: crater.height }
    }
    case 'jupiter': return gasGiant(nx, ny, nz, JUPITER)
    case 'saturn': return gasGiant(nx, ny, nz, SATURN)
    case 'uranus': return gasGiant(nx, ny, nz, URANUS)
    case 'neptune': return gasGiant(nx, ny, nz, NEPTUNE)
    case 'titan': return gasGiant(nx, ny, nz, TITAN)
    case 'europa': {
      const cracks = 1 - Math.abs(fbm3(nx * 4 + 2, ny * 4, nz * 4, 5) * 2 - 1)
      const line = smoothstep(0.86, 0.97, cracks)
      const stain = fbm3(nx * 2, ny * 2, nz * 2, 3)
      let c = rgbMix([228, 224, 214], [196, 176, 150], smoothstep(0.4, 0.7, stain))
      c = rgbMix(c, [138, 96, 70], line * 0.85)
      return { color: c, height: 0.5 - line * 0.2 }
    }
    default: {
      const crater = cratered(nx, ny, nz)
      const patch = fbm3(nx * 1.8 + 6, ny * 1.8, nz * 1.8, 3)
      const k = 0.62 + crater.base * 0.7 + (patch - 0.5) * 0.4
      return { color: [tint[0] * k, tint[1] * k, tint[2] * k], height: crater.height }
    }
  }
}

function sampleClouds(nx: number, ny: number, nz: number) {
  const warp = fbm3(nx * 2.2 + 1, ny * 2.2, nz * 2.2, 3) * 1.4
  const c = fbm3(nx * 4.5 + warp, ny * 4.5 + warp * 0.6, nz * 4.5 - warp, 5)
  return smoothstep(0.5, 0.7, c)
}

const BUMP_STYLES = new Set<PlanetStyle>(['earth', 'mars', 'moon', 'mercury', 'europa', 'rocky'])

interface PlanetTextures {
  map: CanvasTexture
  bump: CanvasTexture | null
  clouds: CanvasTexture | null
}

const planetTextureCache = new Map<string, PlanetTextures>()

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean) {
  const texture = new CanvasTexture(canvas)
  if (srgb) texture.colorSpace = SRGBColorSpace
  texture.wrapS = RepeatWrapping
  texture.anisotropy = 8
  texture.needsUpdate = true
  return texture
}

/** Builds the surface textures in small row chunks so the UI never freezes. */
function buildPlanetTexturesAsync(style: PlanetStyle, tint: RGB, onDone: (textures: PlanetTextures) => void) {
  let cancelled = false
  const W = 1024
  const H = 512
  const mapCanvas = makeCanvas(W, H)
  const mapContext = mapCanvas.getContext('2d')
  if (!mapContext) return () => undefined
  const mapImage = mapContext.createImageData(W, H)
  const wantsBump = BUMP_STYLES.has(style)
  const bumpCanvas = wantsBump ? makeCanvas(W, H) : null
  const bumpContext = bumpCanvas?.getContext('2d') ?? null
  const bumpImage = bumpContext ? bumpContext.createImageData(W, H) : null
  const CW = 512
  const CH = 256
  const cloudCanvas = style === 'earth' ? makeCanvas(CW, CH) : null
  const cloudContext = cloudCanvas?.getContext('2d') ?? null
  const cloudImage = cloudContext ? cloudContext.createImageData(CW, CH) : null
  let row = 0
  let cloudRow = 0

  const finish = () => {
    if (cancelled) return
    mapContext.putImageData(mapImage, 0, 0)
    if (bumpContext && bumpImage) bumpContext.putImageData(bumpImage, 0, 0)
    if (cloudContext && cloudImage) cloudContext.putImageData(cloudImage, 0, 0)
    onDone({
      map: toTexture(mapCanvas, true),
      bump: bumpCanvas ? toTexture(bumpCanvas, false) : null,
      clouds: cloudCanvas ? toTexture(cloudCanvas, true) : null,
    })
  }

  const stepClouds = () => {
    if (cancelled || !cloudImage) return
    const end = Math.min(CH, cloudRow + 24)
    for (; cloudRow < end; cloudRow++) {
      const theta = ((cloudRow + 0.5) / CH) * Math.PI
      const sy = Math.cos(theta)
      const st = Math.sin(theta)
      for (let px = 0; px < CW; px++) {
        const phi = ((px + 0.5) / CW) * Math.PI * 2
        const alpha = sampleClouds(-Math.cos(phi) * st, sy, Math.sin(phi) * st)
        const i = (cloudRow * CW + px) * 4
        cloudImage.data[i] = 255
        cloudImage.data[i + 1] = 255
        cloudImage.data[i + 2] = 255
        cloudImage.data[i + 3] = alpha * 235
      }
    }
    if (cloudRow < CH) window.setTimeout(stepClouds, 0)
    else finish()
  }

  const stepMap = () => {
    if (cancelled) return
    const end = Math.min(H, row + 24)
    for (; row < end; row++) {
      const theta = ((row + 0.5) / H) * Math.PI
      const sy = Math.cos(theta)
      const st = Math.sin(theta)
      for (let px = 0; px < W; px++) {
        const phi = ((px + 0.5) / W) * Math.PI * 2
        const surface = sampleSurface(style, -Math.cos(phi) * st, sy, Math.sin(phi) * st, tint)
        const i = (row * W + px) * 4
        mapImage.data[i] = surface.color[0]
        mapImage.data[i + 1] = surface.color[1]
        mapImage.data[i + 2] = surface.color[2]
        mapImage.data[i + 3] = 255
        if (bumpImage) {
          const g = surface.height * 255
          bumpImage.data[i] = g
          bumpImage.data[i + 1] = g
          bumpImage.data[i + 2] = g
          bumpImage.data[i + 3] = 255
        }
      }
    }
    if (row < H) window.setTimeout(stepMap, 0)
    else if (cloudImage) window.setTimeout(stepClouds, 0)
    else finish()
  }

  window.setTimeout(stepMap, 30)
  return () => { cancelled = true }
}

function usePlanetTextures(style: PlanetStyle | null, tint: string) {
  const key = style ? `${style}:${style === 'rocky' ? tint : ''}` : ''
  const [textures, setTextures] = useState<PlanetTextures | null>(() => planetTextureCache.get(key) ?? null)
  useEffect(() => {
    if (!style) {
      setTextures(null)
      return
    }
    const cached = planetTextureCache.get(key)
    if (cached) {
      setTextures(cached)
      return
    }
    const color = new Color(tint)
    return buildPlanetTexturesAsync(style, [color.r * 255, color.g * 255, color.b * 255], (built) => {
      planetTextureCache.set(key, built)
      setTextures(built)
    })
  }, [key, style, tint])
  return textures
}

function resolvePlanetStyle(destination: FlightDestination): PlanetStyle {
  const key = `${destination.id} ${destination.name}`.toLowerCase()
  const table: Array<[string, PlanetStyle]> = [
    ['moon', 'moon'], ['luna', 'moon'], ['earth', 'earth'], ['mars', 'mars'], ['venus', 'venus'],
    ['mercury', 'mercury'], ['jupiter', 'jupiter'], ['saturn', 'saturn'], ['uranus', 'uranus'],
    ['neptune', 'neptune'], ['titan', 'titan'], ['europa', 'europa'],
  ]
  for (const [needle, style] of table) if (key.includes(needle)) return style
  return 'rocky'
}

interface PlanetLook {
  tilt: number
  spin: number
  roughness: number
  atmosphere: { color: string; scale: number; gain: number } | null
}

const PLANET_LOOK: Record<PlanetStyle, PlanetLook> = {
  earth: { tilt: 0.41, spin: 0.03, roughness: 0.62, atmosphere: { color: '#5fa8ff', scale: 1.085, gain: 2.8 } },
  mars: { tilt: 0.44, spin: 0.028, roughness: 0.95, atmosphere: { color: '#e0a074', scale: 1.04, gain: 1.1 } },
  venus: { tilt: 0.05, spin: 0.006, roughness: 0.9, atmosphere: { color: '#ffd9a0', scale: 1.07, gain: 2.1 } },
  mercury: { tilt: 0.03, spin: 0.01, roughness: 1, atmosphere: null },
  moon: { tilt: 0.1, spin: 0.01, roughness: 1, atmosphere: null },
  jupiter: { tilt: 0.05, spin: 0.07, roughness: 0.9, atmosphere: { color: '#e8cfa6', scale: 1.035, gain: 1.2 } },
  saturn: { tilt: 0.47, spin: 0.06, roughness: 0.9, atmosphere: { color: '#ecdcae', scale: 1.035, gain: 1.2 } },
  uranus: { tilt: 1.3, spin: 0.04, roughness: 0.85, atmosphere: { color: '#a4eaf2', scale: 1.07, gain: 2.0 } },
  neptune: { tilt: 0.5, spin: 0.045, roughness: 0.85, atmosphere: { color: '#4a7dff', scale: 1.075, gain: 2.3 } },
  titan: { tilt: 0.1, spin: 0.015, roughness: 0.95, atmosphere: { color: '#e8a850', scale: 1.1, gain: 2.0 } },
  europa: { tilt: 0.05, spin: 0.015, roughness: 0.6, atmosphere: null },
  rocky: { tilt: 0.2, spin: 0.015, roughness: 1, atmosphere: null },
}

const ATMOSPHERE_VERTEX = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const ATMOSPHERE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uSun;
  uniform float uGain;
  varying vec3 vNormal;
  varying vec3 vWorldNormal;
  void main() {
    float rim = pow(clamp(-dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0), 1.4);
    float lit = clamp(dot(vWorldNormal, uSun) * 0.9 + 0.38, 0.04, 1.0);
    float a = clamp(rim * lit * uGain, 0.0, 1.0);
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function buildRingTexture() {
  const W = 1024
  const canvas = makeCanvas(W, 2)
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  if (!context) return texture
  const image = context.createImageData(W, 2)
  for (let x = 0; x < W; x++) {
    const u = x / (W - 1)
    const fine = fbm3(u * 90, 1.3, 0.7, 4)
    const ripple = 0.72 + 0.28 * Math.sin(u * 210 + fine * 6) * (0.5 + fine * 0.5)
    let density =
      0.12 * smoothstep(0.0, 0.08, u) +
      0.3 * smoothstep(0.08, 0.14, u) * (1 - smoothstep(0.2, 0.24, u)) +
      0.92 * smoothstep(0.2, 0.26, u) * (1 - smoothstep(0.56, 0.6, u)) +
      0.04 * smoothstep(0.56, 0.6, u) * (1 - smoothstep(0.62, 0.66, u)) +
      0.72 * smoothstep(0.62, 0.67, u) * (1 - smoothstep(0.94, 0.99, u))
    density *= ripple
    density *= 1 - 0.85 * smoothstep(0.84, 0.855, u) * (1 - smoothstep(0.865, 0.88, u))
    const shade = 0.78 + fine * 0.35
    for (let y = 0; y < 2; y++) {
      const i = (y * W + x) * 4
      image.data[i] = Math.min(255, 218 * shade)
      image.data[i + 1] = Math.min(255, 198 * shade)
      image.data[i + 2] = Math.min(255, 160 * shade)
      image.data[i + 3] = clamp01(density) * 255
    }
  }
  context.putImageData(image, 0, 0)
  texture.colorSpace = SRGBColorSpace
  texture.needsUpdate = true
  return texture
}

function PlanetRings({ radius }: { radius: number }) {
  const { geometry, texture } = useMemo(() => {
    const inner = radius * 1.25
    const outer = radius * 2.35
    const ring = new RingGeometry(inner, outer, 160, 1)
    const position = ring.attributes.position
    const uv = ring.attributes.uv
    for (let index = 0; index < position.count; index++) {
      const r = Math.hypot(position.getX(index), position.getY(index))
      uv.setXY(index, (r - inner) / (outer - inner), 0.5)
    }
    return { geometry: ring, texture: buildRingTexture() }
  }, [radius])
  useEffect(() => () => { geometry.dispose(); texture.dispose() }, [geometry, texture])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} geometry={geometry}>
      <meshStandardMaterial map={texture} transparent side={DoubleSide} roughness={1} metalness={0} depthWrite={false} fog={false} />
    </mesh>
  )
}

function RealisticPlanet({ radius, style, textures }: { radius: number; style: PlanetStyle; textures: PlanetTextures }) {
  const body = useRef<Mesh>(null)
  const clouds = useRef<Mesh>(null)
  const look = PLANET_LOOK[style]
  const atmosphereMaterial = useMemo(() => {
    if (!look.atmosphere) return null
    return new ShaderMaterial({
      uniforms: {
        uColor: { value: new Color(look.atmosphere.color) },
        uSun: { value: SUN_DIRECTION },
        uGain: { value: look.atmosphere.gain },
      },
      vertexShader: ATMOSPHERE_VERTEX,
      fragmentShader: ATMOSPHERE_FRAGMENT,
      side: BackSide,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
    })
  }, [look])
  useEffect(() => () => atmosphereMaterial?.dispose(), [atmosphereMaterial])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    if (body.current) body.current.rotation.y += dt * look.spin
    if (clouds.current) clouds.current.rotation.y += dt * look.spin * 1.45
  })

  return (
    <group rotation={[0, 0, look.tilt]}>
      <mesh ref={body}>
        <sphereGeometry args={[radius, 96, 64]} />
        <meshStandardMaterial
          map={textures.map}
          bumpMap={textures.bump ?? undefined}
          bumpScale={textures.bump ? 2.4 : 0}
          roughness={look.roughness}
          metalness={0}
          fog={false}
        />
      </mesh>
      {textures.clouds && (
        <mesh ref={clouds} scale={1.012}>
          <sphereGeometry args={[radius, 64, 48]} />
          <meshStandardMaterial map={textures.clouds} transparent depthWrite={false} roughness={1} fog={false} />
        </mesh>
      )}
      {atmosphereMaterial && look.atmosphere && (
        <mesh scale={look.atmosphere.scale}>
          <sphereGeometry args={[radius, 64, 48]} />
          <primitive object={atmosphereMaterial} attach="material" />
        </mesh>
      )}
      {style === 'saturn' && <PlanetRings radius={radius} />}
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  Soft sprite particle system (smoke, ion trails)                           */
/* -------------------------------------------------------------------------- */

let glowTexture: CanvasTexture | null = null
function getGlowTexture() {
  if (!glowTexture) {
    const canvas = makeCanvas(128, 128)
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)')
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
    }
    glowTexture = new CanvasTexture(canvas)
    glowTexture.colorSpace = SRGBColorSpace
  }
  return glowTexture
}

let smokeTexture: CanvasTexture | null = null
function getSmokeTexture() {
  if (!smokeTexture) {
    const canvas = makeCanvas(128, 128)
    const context = canvas.getContext('2d')
    if (context) {
      const random = seeded(77)
      for (let blob = 0; blob < 18; blob++) {
        const x = 64 + (random() - 0.5) * 50
        const y = 64 + (random() - 0.5) * 50
        const r = 20 + random() * 22
        const gradient = context.createRadialGradient(x, y, 0, x, y, r)
        gradient.addColorStop(0, 'rgba(255,255,255,0.24)')
        gradient.addColorStop(1, 'rgba(255,255,255,0)')
        context.fillStyle = gradient
        context.fillRect(0, 0, 128, 128)
      }
      context.globalCompositeOperation = 'destination-in'
      const mask = context.createRadialGradient(64, 64, 8, 64, 64, 64)
      mask.addColorStop(0, 'rgba(255,255,255,1)')
      mask.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = mask
      context.fillRect(0, 0, 128, 128)
    }
    smokeTexture = new CanvasTexture(canvas)
    smokeTexture.colorSpace = SRGBColorSpace
  }
  return smokeTexture
}

interface Particle {
  sprite: Sprite
  material: SpriteMaterial
  born: number
  life: number
  pos: Vector3
  vel: Vector3
  s0: number
  s1: number
  opacity: number
  c0: Color
  c1: Color
  alive: boolean
}

class SpriteEmitter {
  readonly group = new Group()
  private particles: Particle[] = []
  private cursor = 0

  constructor(count: number, map: CanvasTexture, additive: boolean) {
    for (let index = 0; index < count; index++) {
      const material = new SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: additive ? AdditiveBlending : NormalBlending,
        fog: false,
      })
      const sprite = new Sprite(material)
      sprite.visible = false
      this.group.add(sprite)
      this.particles.push({
        sprite, material, born: 0, life: 1, pos: new Vector3(), vel: new Vector3(),
        s0: 1, s1: 1, opacity: 1, c0: new Color(), c1: new Color(), alive: false,
      })
    }
  }

  emit(
    now: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number, opacity: number, c0: Color, c1: Color,
  ) {
    const particle = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.particles.length
    particle.born = now
    particle.life = life
    particle.pos.set(x, y, z)
    particle.vel.set(vx, vy, vz)
    particle.s0 = s0
    particle.s1 = s1
    particle.opacity = opacity
    particle.c0.copy(c0)
    particle.c1.copy(c1)
    particle.alive = true
    particle.material.rotation = Math.random() * Math.PI * 2
    particle.sprite.visible = true
    particle.sprite.position.copy(particle.pos)
  }

  update(now: number, dt: number) {
    for (const particle of this.particles) {
      if (!particle.alive) continue
      const t = (now - particle.born) / particle.life
      if (t >= 1) {
        particle.alive = false
        particle.sprite.visible = false
        continue
      }
      particle.pos.addScaledVector(particle.vel, dt)
      particle.sprite.position.copy(particle.pos)
      const grow = 1 - Math.pow(1 - t, 2)
      const size = lerp(particle.s0, particle.s1, grow)
      particle.sprite.scale.set(size, size, 1)
      particle.material.opacity = particle.opacity * Math.min(1, t / 0.1) * Math.pow(1 - t, 1.4)
      particle.material.color.copy(particle.c0).lerp(particle.c1, Math.min(1, t * 1.8))
    }
  }

  dispose() {
    for (const particle of this.particles) particle.material.dispose()
  }
}

/* -------------------------------------------------------------------------- */
/*  Asset boundary                                                            */
/* -------------------------------------------------------------------------- */

function AssetFailureBoundary({
  children,
  fallback,
}: {
  children: ReactNode
  fallback: ReactNode
}) {
  return <LaunchAssetBoundary fallback={fallback}>{children}</LaunchAssetBoundary>
}

interface LaunchAssetBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

interface LaunchAssetBoundaryState {
  failed: boolean
}

class LaunchAssetBoundary extends Component<LaunchAssetBoundaryProps, LaunchAssetBoundaryState> {
  state: LaunchAssetBoundaryState = { failed: false }

  static getDerivedStateFromError(): LaunchAssetBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    console.error('NASA SLS Block 1 STL could not be loaded; using the built-in generic heavy-vehicle model.', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/* -------------------------------------------------------------------------- */
/*  Launch site                                                               */
/* -------------------------------------------------------------------------- */

function Beam({ position, size, color = '#aab5b8', rotation = [0, 0, 0] }: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={position} scale={size} rotation={rotation} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={color} metalness={0.72} roughness={0.38} />
    </mesh>
  )
}

function ServiceTower() {
  const levels = [7, 19, 31, 43, 55, 67, 79, 91, 103]
  return (
    <group position={[-29, 0, -2]}>
      {[-5, 5].flatMap((x) =>
        [-4, 4].map((z) => (
          <Beam key={`leg-${x}-${z}`} position={[x, 52, z]} size={[0.95, 104, 0.95]} color="#89969b" />
        )),
      )}
      {levels.map((y) => (
        <group key={`level-${y}`}>
          {[-5, 5].map((x) => (
            <Beam key={`x-${x}`} position={[x, y, 0]} size={[0.45, 0.55, 8.8]} />
          ))}
          {[-4, 4].map((z) => (
            <Beam key={`z-${z}`} position={[0, y, z]} size={[10, 0.55, 0.45]} />
          ))}
          {y < 100 && (
            <>
              <Beam position={[0, y + 6, 0]} size={[9, 0.38, 0.38]} rotation={[0, 0, 0.8]} />
              <Beam position={[0, y + 6, 0]} size={[9, 0.38, 0.38]} rotation={[0, 0, -0.8]} />
            </>
          )}
        </group>
      ))}
      {[28, 61, 88].map((y, index) => (
        <group key={`arm-${y}`}>
          <Beam position={[13, y, 0]} size={[26, 1.25, 1.35]} color={index === 2 ? '#a9b5b9' : '#b5442c'} />
          <Beam position={[24, y - 3, 0]} size={[5, 6, 1]} color="#6e7c82" />
        </group>
      ))}
      <mesh position={[0, 105, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.35, 9, 12]} />
        <meshStandardMaterial color="#e5e1d5" metalness={0.4} roughness={0.4} />
      </mesh>
    </group>
  )
}

function LaunchPad() {
  return (
    <group>
      <mesh position={[0, -2.1, 0]} receiveShadow>
        <cylinderGeometry args={[32, 35, 4.2, 64, 1, true]} />
        <meshStandardMaterial color="#747d7d" roughness={0.82} />
      </mesh>
      <mesh position={[0, 0.78, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[14, 28, 64]} />
        <meshStandardMaterial color="#9a9c95" roughness={0.72} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[14, 32, 64]} />
        <meshStandardMaterial color="#6d7676" roughness={0.88} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -4.18, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[14, 32, 64]} />
        <meshStandardMaterial color="#586364" roughness={0.88} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -9.2, 0]}>
        <cylinderGeometry args={[14, 14, 18, 48, 1, true]} />
        <meshStandardMaterial color="#343e40" roughness={0.86} side={DoubleSide} />
      </mesh>
      <mesh position={[0, -18.25, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[14, 48]} />
        <meshStandardMaterial color="#202a2c" roughness={0.92} side={DoubleSide} />
      </mesh>
      <mesh position={[0, 0.78, 9]} receiveShadow>
        <boxGeometry args={[8, 0.12, 34]} />
        <meshStandardMaterial color="#313b3f" metalness={0.28} roughness={0.7} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side} position={[0, 0, side * 18]}>
          {[-1, 1].map((x) => (
            <Beam key={x} position={[x * 6, 2.2, 0]} size={[1, 4.6, 1]} color="#6f797a" />
          ))}
          <Beam position={[0, 4.2, 0]} size={[13, 1, 1]} color="#747f80" />
        </group>
      ))}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => (
        <Beam key={`pad-pier-${x}-${z}`} position={[x * 23, -4.65, z * 22]} size={[2, 1.2, 2]} color="#707a7a" />
      )))}
    </group>
  )
}

function GroundPlane() {
  return (
    <group>
      {[
        { position: [0, -5.25, -342.5], size: [1200, 615] },
        { position: [0, -5.25, 292.5], size: [1200, 515] },
        { position: [-317.5, -5.25, -50], size: [565, 1200] },
        { position: [317.5, -5.25, -50], size: [565, 1200] },
      ].map(({ position, size }, index) => (
        <mesh key={index} position={position as [number, number, number]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={size as [number, number]} />
          <meshStandardMaterial color="#858c85" roughness={0.94} />
        </mesh>
      ))}
      <mesh position={[0, -5.05, 145]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[24, 240]} />
        <meshStandardMaterial color="#4b5657" roughness={0.84} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 12, -5.02, 145]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.45, 240]} />
          <meshStandardMaterial color="#c2bba8" roughness={0.8} />
        </mesh>
      ))}
    </group>
  )
}

function SkyClouds() {
  const cloudRefs = useRef<Array<Group | null>>([])
  useFrame((_, delta) => {
    for (const cloud of cloudRefs.current) if (cloud) cloud.position.x += delta * 0.28
  })
  return (
    <>
      {[[-85, 83, -135], [80, 95, -180], [150, 74, -125], [-145, 103, -195]].map((position, cloudIndex) => (
        <group
          key={cloudIndex}
          ref={(element) => { cloudRefs.current[cloudIndex] = element }}
          position={position as [number, number, number]}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <mesh key={index} position={[(index - 2) * 8, Math.sin(index * 2) * 2, (index % 2) * 5]}>
              <sphereGeometry args={[9 + (index % 3) * 2, 12, 8]} />
              <meshStandardMaterial color="#e2e8e8" transparent opacity={0.34} roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
    </>
  )
}

function DistantTerrain() {
  return (
    <group>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[side * 175, -27, -235]} scale={[1.7, 0.2, 0.82]}>
          <sphereGeometry args={[115, 24, 14]} />
          <meshStandardMaterial color="#6b7c7c" roughness={1} />
        </mesh>
      ))}
      {Array.from({ length: 8 }, (_, index) => (
        <group key={index} position={[-85 + index * 25, 0, -78 - (index % 3) * 9]}>
          <mesh position={[0, 5, 0]} castShadow>
            <boxGeometry args={[12, 10 + (index % 3) * 3, 8]} />
            <meshStandardMaterial color={index % 2 ? '#8b9391' : '#747e7e'} roughness={0.82} />
          </mesh>
          <mesh position={[0, 11, 0]}>
            <boxGeometry args={[13, 1, 9]} />
            <meshStandardMaterial color="#444f53" metalness={0.35} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  Sky dome, star field, sun                                                 */
/* -------------------------------------------------------------------------- */

const DOME_VERTEX = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform float uMix;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));
    float s = max(dot(d, uSun), 0.0);
    col += vec3(1.0, 0.86, 0.65) * (pow(s, 90.0) * 0.9 + pow(s, 7.0) * 0.16);
    col *= 1.0 - uMix * 0.5;
    gl_FragColor = vec4(col, 1.0 - uMix);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function SkyBackdrop({ spaceMix }: { spaceMix: { current: number } }) {
  const group = useRef<Group>(null)
  const dome = useRef<Mesh>(null)
  const sunHalo = useRef<SpriteMaterial>(null)
  const sunCore = useRef<SpriteMaterial>(null)
  const { camera } = useThree()
  const glow = useMemo(() => getGlowTexture(), [])

  const domeMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      uHorizon: { value: new Color(HORIZON_COLOR) },
      uZenith: { value: new Color('#3d74a6') },
      uSun: { value: SUN_DIRECTION },
      uMix: { value: 0 },
    },
    vertexShader: DOME_VERTEX,
    fragmentShader: DOME_FRAGMENT,
    side: BackSide,
    transparent: true,
    depthWrite: false,
  }), [])

  const stars = useMemo(() => {
    const random = seeded(2024)
    const count = 3600
    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const tmp = new Color()
    for (let index = 0; index < count; index++) {
      let x: number, y: number, z: number
      const milkyWay = index > 2200
      if (milkyWay) {
        const angle = random() * Math.PI * 2
        const spread = (random() + random() + random() - 1.5) * 0.22
        const px = Math.cos(angle)
        const py = spread
        const pz = Math.sin(angle)
        // tilt the galactic plane
        x = px
        y = py * 0.9 + pz * 0.45
        z = pz * 0.9 - py * 0.45
      } else {
        const u = random() * 2 - 1
        const a = random() * Math.PI * 2
        const r = Math.sqrt(1 - u * u)
        x = Math.cos(a) * r
        y = u
        z = Math.sin(a) * r
      }
      const length = Math.hypot(x, y, z) || 1
      positions[index * 3] = (x / length) * SKY_RADIUS * 0.96
      positions[index * 3 + 1] = (y / length) * SKY_RADIUS * 0.96
      positions[index * 3 + 2] = (z / length) * SKY_RADIUS * 0.96
      const warmth = random()
      tmp.set(warmth < 0.2 ? '#ffd9b0' : warmth < 0.75 ? '#ffffff' : '#b8d0ff')
      const brightness = milkyWay ? 0.18 + random() * 0.35 : Math.pow(random(), 2.2) * 0.85 + 0.15
      colors[index * 3] = tmp.r * brightness
      colors[index * 3 + 1] = tmp.g * brightness
      colors[index * 3 + 2] = tmp.b * brightness
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
    const material = new PointsMaterial({
      size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true,
      opacity: 0, depthWrite: false, fog: false,
    })
    return new Points(geometry, material)
  }, [])

  useEffect(() => () => {
    domeMaterial.dispose()
    stars.geometry.dispose()
    ;(stars.material as PointsMaterial).dispose()
  }, [domeMaterial, stars])

  useFrame(() => {
    const g = group.current
    if (!g) return
    g.position.copy(camera.position)
    const m = spaceMix.current
    domeMaterial.uniforms.uMix.value = m
    if (dome.current) dome.current.visible = m < 0.995
    ;(stars.material as PointsMaterial).opacity = Math.pow(m, 1.6)
    if (sunHalo.current) sunHalo.current.opacity = 0.32 * smoothstep(0.2, 1, m)
    if (sunCore.current) sunCore.current.opacity = 0.95 * smoothstep(0.2, 1, m)
  })

  return (
    <group ref={group}>
      <mesh ref={dome} material={domeMaterial} scale={SKY_RADIUS * 0.85} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 20]} />
      </mesh>
      <primitive object={stars} />
      <sprite position={SUN_DIRECTION.clone().multiplyScalar(SKY_RADIUS * 0.93)} scale={[SKY_RADIUS * 0.26, SKY_RADIUS * 0.26, 1]}>
        <spriteMaterial ref={sunHalo} map={glow} color="#ffe2b0" blending={AdditiveBlending} transparent depthWrite={false} opacity={0} fog={false} />
      </sprite>
      <sprite position={SUN_DIRECTION.clone().multiplyScalar(SKY_RADIUS * 0.93)} scale={[SKY_RADIUS * 0.05, SKY_RADIUS * 0.05, 1]}>
        <spriteMaterial ref={sunCore} map={glow} color="#fff8ea" blending={AdditiveBlending} transparent depthWrite={false} opacity={0} fog={false} />
      </sprite>
    </group>
  )
}

/** Streaking particles that rush past the spacecraft and sell the sense of speed. */
function SpaceDust({
  payloadRef,
  spaceMix,
}: {
  payloadRef: { current: Group | null }
  spaceMix: { current: number }
}) {
  const COUNT = 260
  const RANGE = 95
  const lines = useMemo(() => {
    const random = seeded(909)
    const base = new Float32Array(COUNT * 3)
    for (let index = 0; index < base.length; index++) base[index] = (random() - 0.5) * RANGE * 2
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(COUNT * 6), 3))
    const material = new LineBasicMaterial({
      color: '#bcd7ff', transparent: true, opacity: 0, depthWrite: false, fog: false,
    })
    const object = new LineSegments(geometry, material)
    object.frustumCulled = false
    return { base, object }
  }, [])
  const previous = useRef(new Vector3())
  const hasPrevious = useRef(false)
  const velocity = useRef(new Vector3())

  useEffect(() => () => {
    lines.object.geometry.dispose()
    ;(lines.object.material as LineBasicMaterial).dispose()
  }, [lines])

  useFrame((_, delta) => {
    const payload = payloadRef.current
    const object = lines.object
    if (!payload || !payload.visible || spaceMix.current < 0.9) {
      object.visible = false
      hasPrevious.current = false
      return
    }
    const dt = Math.max(delta, 0.001)
    if (!hasPrevious.current) {
      previous.current.copy(payload.position)
      hasPrevious.current = true
    }
    velocity.current.copy(payload.position).sub(previous.current).divideScalar(dt)
    previous.current.copy(payload.position)
    const speed = velocity.current.length()
    const streak = Math.min(speed * 0.03, 10)
    const direction = speed > 0.001 ? velocity.current.clone().divideScalar(speed) : new Vector3(0, 0, 1)
    const c = payload.position
    const attribute = object.geometry.attributes.position
    const array = attribute.array as Float32Array
    const base = lines.base
    for (let index = 0; index < COUNT; index++) {
      for (let axis = 0; axis < 3; axis++) {
        const center = axis === 0 ? c.x : axis === 1 ? c.y : c.z
        const value = base[index * 3 + axis]
        const wrapped = ((((value - center + RANGE) % (RANGE * 2)) + RANGE * 2) % (RANGE * 2)) - RANGE + center
        base[index * 3 + axis] = wrapped
      }
      const x = base[index * 3]
      const y = base[index * 3 + 1]
      const z = base[index * 3 + 2]
      array[index * 6] = x
      array[index * 6 + 1] = y
      array[index * 6 + 2] = z
      array[index * 6 + 3] = x - direction.x * streak
      array[index * 6 + 4] = y - direction.y * streak
      array[index * 6 + 5] = z - direction.z * streak
    }
    attribute.needsUpdate = true
    ;(object.material as LineBasicMaterial).opacity = 0.55 * smoothstep(8, 80, speed)
    object.visible = speed > 8
  })

  return <primitive object={lines.object} />
}

/* -------------------------------------------------------------------------- */
/*  Launch effects                                                            */
/* -------------------------------------------------------------------------- */

interface RocketState {
  y: number
  scale: number
}

function LaunchSmoke({
  startedAt,
  active,
  launchFailed,
  rocketState,
}: {
  startedAt: number | null
  active: boolean
  launchFailed: boolean
  rocketState: { current: RocketState }
}) {
  const emitter = useMemo(() => new SpriteEmitter(200, getSmokeTexture(), false), [])
  useEffect(() => () => emitter.dispose(), [emitter])
  const colors = useMemo(() => ({
    hot: new Color('#ffd4a0'),
    cool: new Color('#b4bec2'),
    dark: new Color('#9aa5a9'),
  }), [])
  const accumulators = useRef({ ground: 0, trail: 0 })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const elapsed = startedAt === null ? 0 : now - startedAt
    if (active && startedAt !== null && elapsed > 2.35) {
      const live = launchFailed ? elapsed < FAILURE_TIME : elapsed < ASCENT_COMPLETE_TIME + 0.4
      if (live) {
        const ramp = clamp01((elapsed - 2.35) / 1.5)
        const { y, scale } = rocketState.current
        const acc = accumulators.current
        if (y < 90) {
          acc.ground += dt * 18 * ramp
          while (acc.ground >= 1) {
            acc.ground -= 1
            const angle = Math.random() * Math.PI * 2
            const speed = 9 + Math.random() * 17
            emitter.emit(
              now, Math.cos(angle) * 6, 1.5 + Math.random() * 3, Math.sin(angle) * 6,
              Math.cos(angle) * speed, 1 + Math.random() * 3.5, Math.sin(angle) * speed,
              4.2 + Math.random() * 1.6, 5, 26 + Math.random() * 14, 0.5, colors.hot, colors.cool,
            )
          }
        }
        acc.trail += dt * 26 * ramp
        while (acc.trail >= 1) {
          acc.trail -= 1
          emitter.emit(
            now,
            (Math.random() - 0.5) * 3, y + 3 * scale, (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 4, -3 - Math.random() * 3, (Math.random() - 0.5) * 4,
            3.6 + Math.random() * 0.8, 7 * scale + 2, 24 + Math.random() * 14, 0.42, colors.hot, colors.dark,
          )
        }
      }
    }
    emitter.update(now, dt)
  })

  return <primitive object={emitter.group} />
}

function EngineExhaust({
  startedAt,
  phase,
  failed,
}: {
  startedAt: number | null
  phase: SequencePhase
  failed: boolean
}) {
  const group = useRef<Group>(null)
  const light = useRef<PointLight>(null)
  useFrame(() => {
    const now = performance.now() / 1000
    const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt)
    const activePhase =
      phase === 'ignition' ||
      phase === 'ascent' ||
      phase === 'stage_separation' ||
      phase === 'fairing_separation' ||
      phase === 'anomaly'
    const ramp = Math.min(1, Math.max(0, (elapsed - 2.35) / 1.55))
    const failureCutoff = failed ? Math.max(0, 1 - Math.max(0, elapsed - FAILURE_TIME) / 0.55) : 1
    const strength = activePhase ? ramp * failureCutoff : 0
    const flicker = 1 + Math.sin(now * 47) * 0.045 + Math.sin(now * 83 + 1.3) * 0.035 + Math.sin(now * 131) * 0.02
    const progress = clamp01((elapsed - LIFTOFF_TIME) / (ASCENT_COMPLETE_TIME - LIFTOFF_TIME))
    const spread = 1 + progress * 1.1
    if (group.current) {
      group.current.visible = strength > 0.01
      group.current.scale.set(spread, Math.max(0.01, strength * flicker * (1 + progress * 0.35)), spread)
    }
    if (light.current) light.current.intensity = strength * 58 * flicker
  })
  return (
    <group ref={group} position={[0, -2, 0]}>
      <mesh rotation={[Math.PI, 0, 0]} scale={[0.75, 1, 0.75]}>
        <coneGeometry args={[7.3, 46, 24, 1, true]} />
        <meshBasicMaterial color="#e28c43" transparent opacity={0.55} side={2} depthWrite={false} />
      </mesh>
      <mesh position={[0, -5, 0]} rotation={[Math.PI, 0, 0]} scale={[0.48, 1, 0.48]}>
        <coneGeometry args={[4, 39, 20, 1, true]} />
        <meshBasicMaterial color="#f8cf92" transparent opacity={0.85} side={2} depthWrite={false} />
      </mesh>
      <mesh position={[0, -9, 0]} rotation={[Math.PI, 0, 0]} scale={[0.26, 1, 0.26]}>
        <coneGeometry args={[2.1, 31, 16, 1, true]} />
        <meshBasicMaterial color="#fff3dc" transparent opacity={0.96} side={2} depthWrite={false} />
      </mesh>
      <pointLight ref={light} position={[0, -4, 0]} color="#ffb46a" intensity={0} distance={65} decay={2} />
    </group>
  )
}

function FailureExplosion({ startedAt, cause }: {
  startedAt: number | null
  cause: 'overload' | 'reliability'
}) {
  const group = useRef<Group>(null)
  const sparks = useRef<import('three').InstancedMesh>(null)
  const smokePuffs = useRef<import('three').InstancedMesh>(null)
  const flashMesh = useRef<Mesh>(null)
  const fireball = useRef<Mesh>(null)
  const innerFireball = useRef<Mesh>(null)
  const shockwave = useRef<Mesh>(null)
  const explosionLight = useRef<PointLight>(null)
  const flashMaterial = useRef<MeshBasicMaterial>(null)
  const fireMaterial = useRef<MeshBasicMaterial>(null)
  const innerFireMaterial = useRef<MeshBasicMaterial>(null)
  const shockwaveMaterial = useRef<MeshBasicMaterial>(null)
  const dummy = useRef(new Object3D())
  const sparkGeometry = useMemo(() => new SphereGeometry(1, 7, 6), [])
  const smokeGeometry = useMemo(() => new SphereGeometry(1, 10, 8), [])
  const smokePuffMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#485052', transparent: true, opacity: 0, roughness: 1, depthWrite: false }),
    [],
  )
  const sparkMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false, vertexColors: true }), [])
  const sparkDirections = useMemo(
    () =>
      Array.from({ length: 56 }, (_, index) => {
        const angle = index * 2.399963
        const vertical = -0.72 + ((index * 37) % 100) / 100 * 1.44
        const planar = Math.sqrt(1 - vertical * vertical)
        return new Vector3(Math.cos(angle) * planar, vertical, Math.sin(angle) * planar)
      }),
    [],
  )
  const smokeDirections = useMemo(
    () =>
      Array.from({ length: 26 }, (_, index) => {
        const angle = index * 2.399963
        const vertical = -0.18 + ((index * 29) % 100) / 100 * 0.92
        const planar = Math.sqrt(1 - vertical * vertical)
        return new Vector3(Math.cos(angle) * planar, vertical, Math.sin(angle) * planar)
      }),
    [],
  )

  useEffect(() => {
    const mesh = sparks.current
    if (!mesh) return
    sparkDirections.forEach((_, index) => {
      const hue = index % 3 === 0 ? '#fff1c2' : index % 3 === 1 ? '#ffb13b' : '#e45228'
      mesh.setColorAt(index, new Color(hue))
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [sparkDirections])

  useFrame(() => {
    const mesh = sparks.current
    const smoke = smokePuffs.current
    if (!mesh || !smoke || !group.current) return
    const transform = dummy.current
    const elapsed = startedAt === null ? -1 : performance.now() / 1000 - startedAt - FAILURE_TIME
    const active = elapsed >= 0
    const blastProgress = active ? Math.min(1, elapsed / 0.58) : 0
    const smokeProgress = active ? Math.min(1, Math.max(0, elapsed - 0.12) / 2.8) : 0
    const smokeFade = active ? Math.max(0, 1 - Math.max(0, elapsed - 1) / 8) : 0
    group.current.position.set(0, 61 + Math.max(0, elapsed) * 1.2, 0)

    for (let index = 0; index < sparkDirections.length; index++) {
      const particleAge = elapsed - 0.06
      if (!active || particleAge < 0 || particleAge > 2.2) {
        transform.scale.setScalar(0)
      } else {
        const distance = particleAge * ((cause === 'overload' ? 12 : 15) + (index % 7) * 1.7)
        transform.position.copy(sparkDirections[index]).multiplyScalar(distance)
        transform.position.y -= particleAge * particleAge * 5
        transform.scale.setScalar(Math.max(0.001, (1 - particleAge / 2.2) * (0.45 + (index % 4) * 0.12)))
      }
      transform.updateMatrix()
      mesh.setMatrixAt(index, transform.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true

    for (let index = 0; index < smokeDirections.length; index++) {
      if (!active || elapsed < 0.12) {
        transform.scale.setScalar(0)
      } else {
        const age = elapsed - 0.12
        const drift = smokeProgress * (6 + (index % 5) * 2.6)
        transform.position.copy(smokeDirections[index]).multiplyScalar(drift)
        transform.position.y += smokeProgress * (index % 5) * 2.5
        const puffSize = Math.max(0.001, (5 + (index % 4) * 1.7) * smokeProgress * smokeFade)
        transform.scale.set(puffSize * 1.35, puffSize, puffSize * 1.35)
        transform.rotation.set(index * 0.37 + age * 0.09, index * 0.61, index * 0.23)
      }
      transform.updateMatrix()
      smoke.setMatrixAt(index, transform.matrix)
    }
    smoke.instanceMatrix.needsUpdate = true

    if (flashMaterial.current) {
      flashMaterial.current.opacity = active ? Math.max(0, 0.96 * (1 - elapsed / 0.3)) : 0
    }
    if (fireMaterial.current) {
      fireMaterial.current.opacity = active ? Math.max(0, 0.96 * (1 - Math.max(0, elapsed - 0.12) / 2.5)) : 0
    }
    if (innerFireMaterial.current) {
      innerFireMaterial.current.opacity = active ? Math.max(0, 0.98 * (1 - elapsed / 1.15)) : 0
    }
    if (shockwaveMaterial.current) {
      shockwaveMaterial.current.opacity = active ? Math.max(0, 0.85 * (1 - elapsed / 1.15)) : 0
    }
    if (flashMesh.current) {
      const flashSize = active ? 0.1 + Math.max(0, 1 - elapsed / 0.3) * 21 : 0
      flashMesh.current.scale.setScalar(flashSize)
    }
    if (fireball.current) {
      const fireSize = active ? 0.1 + blastProgress * (cause === 'overload' ? 32 : 27) : 0
      fireball.current.scale.set(fireSize, fireSize * 0.92, fireSize)
    }
    if (innerFireball.current) {
      const fireSize = active ? 0.1 + blastProgress * (cause === 'overload' ? 21 : 18) : 0
      innerFireball.current.scale.set(fireSize, fireSize * 0.88, fireSize)
    }
    if (shockwave.current) {
      shockwave.current.scale.setScalar(active ? 0.1 + Math.min(1, elapsed / 1.05) * (cause === 'overload' ? 38 : 32) : 0)
    }
    if (explosionLight.current) {
      explosionLight.current.intensity = active ? Math.max(0, 115 * (1 - elapsed / 0.85)) : 0
    }
  })

  return (
    <group ref={group}>
      <mesh ref={flashMesh}>
        <sphereGeometry args={[1, 18, 14]} />
        <meshBasicMaterial ref={flashMaterial} color="#fff0bf" transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={fireball}>
        <sphereGeometry args={[1, 24, 18]} />
        <meshBasicMaterial ref={fireMaterial} color="#ff6a16" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh ref={innerFireball}>
        <sphereGeometry args={[1, 20, 16]} />
        <meshBasicMaterial ref={innerFireMaterial} color="#ffd47a" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <instancedMesh ref={smokePuffs} args={[smokeGeometry, smokePuffMaterial, smokeDirections.length]} />
      <mesh ref={shockwave} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1, 0.12, 8, 48]} />
        <meshBasicMaterial ref={shockwaveMaterial} color="#ffb15d" transparent opacity={0} toneMapped={false} depthWrite={false} />
      </mesh>
      <instancedMesh ref={sparks} args={[sparkGeometry, sparkMaterial, sparkDirections.length]} />
      <pointLight
        ref={explosionLight}
        color="#ff7b32"
        distance={180}
        intensity={0}
        decay={2}
      />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  World                                                                     */
/* -------------------------------------------------------------------------- */

function isLaunchFailureCause(record: LaunchRecord) {
  if (!record.failureCategory) return 'reliability'
  if (record.failureCategory === 'launch' || record.failureCategory === 'system') return 'overload'
  return 'reliability'
}

function isSurfacePayload(record: LaunchRecord) {
  const type = record.spacecraftType.toLowerCase()
  return type.includes('rover') || type.includes('helicopter') || type.includes('lander')
}

function LaunchWorld({
  record,
  startedAt,
  phase,
  orbitCameraView,
  onAssetReady,
}: {
  record: LaunchRecord
  startedAt: number | null
  phase: SequencePhase
  orbitCameraView: 'satellite' | 'planet' | 'planet-edge'
  onAssetReady: () => void
}) {
  const rocketRoot = useRef<Group>(null)
  const attachedPayload = useRef<Group>(null)
  const deployedPayload = useRef<Group>(null)
  const groundGroup = useRef<Group>(null)
  const earthGroup = useRef<Group>(null)
  const thrustGlow = useRef<Sprite>(null)
  const ambientLight = useRef<AmbientLight>(null)
  const hemisphereLight = useRef<HemisphereLight>(null)
  const sunLight = useRef<DirectionalLight>(null)
  const readyParts = useRef(new Set<string>())
  const { camera } = useThree()
  const position = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const departure = useRef<FlightPoint | null>(null)

  // Cinematic camera state. In space the camera is stored *relative to the
  // spacecraft*, so it can be damped smoothly without ever lagging behind it.
  const cameraMode = useRef<'ground' | 'space'>('ground')
  const cameraRelative = useMemo(() => new Vector3(), [])
  const lookRelative = useMemo(() => new Vector3(), [])
  const desiredRelative = useMemo(() => new Vector3(), [])
  const desiredLook = useMemo(() => new Vector3(), [])
  const lastLook = useRef(new Vector3(0, 40, 0))
  const smoothLook = useRef(new Vector3(0, 40, 0))
  const forward = useMemo(() => new Vector3(), [])
  const side = useMemo(() => new Vector3(), [])
  const upAxis = useMemo(() => new Vector3(), [])
  const toDestination = useMemo(() => new Vector3(), [])
  const outward = useMemo(() => new Vector3(), [])
  const tangent = useMemo(() => new Vector3(), [])
  const previousOrbitCameraView = useRef<typeof orbitCameraView | null>(null)
  const previousPayload = useRef(new Vector3())
  const hasPreviousPayload = useRef(false)
  const worldUp = useMemo(() => new Vector3(0, 1, 0), [])

  const spaceMix = useRef(0)
  const rocketState = useRef<RocketState>({ y: 0, scale: 1 })
  const background = useMemo(() => new Color(HORIZON_COLOR), [])
  const fog = useMemo(() => new Fog(HORIZON_COLOR, 190, 430), [])
  const skyColor = useMemo(() => new Color(HORIZON_COLOR), [])
  const spaceColor = useMemo(() => new Color(SPACE_COLOR), [])
  const ionTrail = useMemo(() => new SpriteEmitter(110, getGlowTexture(), true), [])
  const glowMap = useMemo(() => getGlowTexture(), [])
  const ionColors = useMemo(() => ({ head: new Color('#aeeaff'), tail: new Color('#2f5fff') }), [])
  useEffect(() => () => ionTrail.dispose(), [ionTrail])

  const launchFailed = record.outcome === 'failure'
  const missionFailed = !launchFailed && record.failureTitle !== null
  const failureCause = isLaunchFailureCause(record)
  const destination = useMemo(
    () => resolveFlightDestination(
      record.planningSnapshot.destinationId,
      record.planningSnapshot.destinationBodyId,
      record.destination,
    ),
    [record.destination, record.planningSnapshot.destinationBodyId, record.planningSnapshot.destinationId],
  )
  const destinationTarget = useMemo(
    () => destination ? new Vector3(destination.center.x, destination.center.y, destination.center.z) : new Vector3(),
    [destination],
  )
  const planetStyle = useMemo(() => (destination ? resolvePlanetStyle(destination) : null), [destination])
  const destinationTextures = usePlanetTextures(planetStyle, destination?.color ?? '#8a8a8a')
  const showEarthBackdrop = !launchFailed && planetStyle !== 'earth'
  const earthTextures = usePlanetTextures(showEarthBackdrop ? 'earth' : null, '')
  const missionProfile: MissionFlightProfile = record.planningSnapshot.missionProfile ??
    (record.destination.toLocaleLowerCase().includes('asteroid') ? 'planning' : 'orbiter')
  const cameraOrbitRadius = (destination?.radius ?? 0) + ORBIT_RADIUS_OFFSET
  const orbitRadius = (destination?.radius ?? 0) *
    (phase === 'stable_orbit' ? STABLE_ORBIT_PLANET_SCALE : 1) + ORBIT_RADIUS_OFFSET
  const variant = record.launchVehicle.id === 'small-launcher'
    ? 'small'
    : record.launchVehicle.visualClass === 'heavy'
      ? 'heavy'
      : 'medium'
  const missionFlightActive =
    phase === 'departure' ||
    phase === 'transfer' ||
    phase === 'approach' ||
    phase === 'orbital_insertion' ||
    phase === 'stable_orbit' ||
    phase === 'planetary_flyby' ||
    phase === 'mission_complete'
  const markReady = useCallback((part: 'vehicle' | 'payload') => {
    readyParts.current.add(part)
    if (readyParts.current.has('vehicle') && readyParts.current.has('payload')) onAssetReady()
  }, [onAssetReady])
  const markVehicleReady = useCallback(() => markReady('vehicle'), [markReady])
  const markPayloadReady = useCallback(() => markReady('payload'), [markReady])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt)
    const root = rocketRoot.current
    if (!root) return
    const perspective = camera as PerspectiveCamera

    /* ---- rocket ---- */
    const liftoffProgress = clamp01((elapsed - LIFTOFF_TIME) / (ASCENT_COMPLETE_TIME - LIFTOFF_TIME))
    root.visible = true
    const rumble = elapsed > 2.35 && elapsed < LIFTOFF_TIME + 1.5
      ? Math.sin(elapsed * 61) * 0.06 * clamp01((elapsed - 2.35) / 1.5)
      : 0
    root.position.x = rumble
    if (!launchFailed) {
      root.position.y = Math.pow(liftoffProgress, 1.45) * 350
      root.scale.setScalar(1 - liftoffProgress * 0.46)
      root.rotation.z = Math.sin(elapsed * 0.45) * 0.012
    } else if (elapsed < FAILURE_TIME) {
      root.position.y = Math.max(0, (elapsed - LIFTOFF_TIME) * 7.2)
      root.scale.setScalar(1)
      root.rotation.z = 0
    } else {
      const blastElapsed = elapsed - FAILURE_TIME
      root.position.y = (FAILURE_TIME - LIFTOFF_TIME) * 7.2
      root.scale.setScalar(Math.max(0, 1 - blastElapsed / 0.2))
      root.visible = blastElapsed < 0.2
    }
    rocketState.current.y = root.position.y
    rocketState.current.scale = root.scale.x

    const attached = attachedPayload.current
    if (attached) {
      attached.visible =
        !launchFailed && elapsed >= FAIRING_SEPARATION_TIME + 0.18 && elapsed < SPACECRAFT_DEPLOYMENT_TIME
    }

    /* ---- spacecraft ---- */
    const flightMode = Boolean(destination && missionFlightActive && !missionFailed)
    const payload = deployedPayload.current
    let travelling = false
    if (payload) {
      payload.visible = !launchFailed && elapsed >= SPACECRAFT_DEPLOYMENT_TIME
      if (payload.visible) {
        if (!departure.current) departure.current = { x: 0, y: 0, z: 0 }
        if (destination && flightMode) {
          travelling = true
          const arrivalPoint: FlightPoint = {
            x: destination.center.x + orbitRadius,
            y: destination.center.y,
            z: destination.center.z,
          }
          let desiredYaw: number | null = null
          if (missionProfile === 'flyby' && (phase === 'planetary_flyby' || phase === 'mission_complete')) {
            const flybyExit: FlightPoint = {
              x: destination.center.x - destination.radius - 78,
              y: destination.center.y + 8,
              z: destination.center.z + 16,
            }
            const passProgress = clamp01((elapsed - 27) / 3)
            const flybyStart = getTransferPosition(departure.current, arrivalPoint, 1)
            const flybyPosition = getTransferPosition(flybyStart, flybyExit, passProgress)
            payload.position.set(flybyPosition.x, flybyPosition.y, flybyPosition.z)
          } else if (missionProfile === 'orbiter' && phase === 'stable_orbit') {
            const orbitAngle = Math.max(0, elapsed - STABLE_ORBIT_TIME) * ORBIT_ANGULAR_SPEED
            const orbitPosition = getOrbitPosition(destination.center, orbitRadius, orbitAngle)
            payload.position.set(orbitPosition.x, orbitPosition.y, orbitPosition.z)
            payload.rotation.y = dampAngle(payload.rotation.y, -orbitAngle, 6, dt)
          } else {
            const transferPosition = getTransferPosition(
              departure.current,
              arrivalPoint,
              clamp01((elapsed - TRANSFER_START_TIME) / (ARRIVAL_TIME - TRANSFER_START_TIME)),
            )
            payload.position.set(transferPosition.x, transferPosition.y, transferPosition.z)
          }
          if (phase !== 'stable_orbit') {
            desiredYaw = Math.atan2(
              destination.center.x - payload.position.x,
              destination.center.z - payload.position.z,
            )
            payload.rotation.y = dampAngle(payload.rotation.y, desiredYaw, 3, dt)
          }
          payload.rotation.z = Math.sin(elapsed * 0.45) * 0.035
        } else {
          const separation = smoothstep(0, 1, clamp01((elapsed - SPACECRAFT_DEPLOYMENT_TIME) / 2.2))
          payload.position.set(
            separation * 24,
            root.position.y + 88 * root.scale.y + separation * 15,
            0,
          )
          payload.rotation.z = Math.sin(elapsed * 0.45) * 0.035
          // Remember where the spacecraft actually is so the transfer starts without a jump.
          departure.current.x = payload.position.x
          departure.current.y = payload.position.y
          departure.current.z = payload.position.z
        }
      }
    }

    if (elapsed >= TRANSFER_START_TIME && !launchFailed && destination) root.visible = false

    /* ---- sky / lighting transition ---- */
    const altitudeMix = launchFailed ? 0 : clamp01((root.position.y - 110) / 200)
    const targetMix = launchFailed ? 0 : elapsed >= SPACECRAFT_DEPLOYMENT_TIME ? 1 : altitudeMix
    spaceMix.current = damp(spaceMix.current, targetMix, 2.6, dt)
    const mix = spaceMix.current
    background.copy(skyColor).lerp(spaceColor, clamp01(mix * 1.15))
    fog.color.copy(background)
    fog.near = lerp(190, 9000, mix)
    fog.far = lerp(430, 55000, mix)
    if (ambientLight.current) ambientLight.current.intensity = lerp(0.7, 0.3, mix)
    if (hemisphereLight.current) hemisphereLight.current.intensity = lerp(1.1, 0.16, mix)
    if (sunLight.current) sunLight.current.intensity = lerp(1.8, 2.7, mix)
    if (groundGroup.current) groundGroup.current.visible = mix < 0.995

    /* ---- Earth backdrop that falls away as the spacecraft departs ---- */
    if (earthGroup.current) {
      const rise = 1 - smoothstep(0.6, 1, mix)
      const departureDuration = TRANSFER_START_TIME - SPACECRAFT_DEPLOYMENT_TIME
      const recede = smoothstep(
        0,
        1,
        clamp01((elapsed - SPACECRAFT_DEPLOYMENT_TIME) / departureDuration),
      ) * 5200
      earthGroup.current.position.y = EARTH_BACKDROP_BASE_Y - rise * 3600 - recede
      earthGroup.current.visible = mix > 0.55 && elapsed < TRANSFER_START_TIME
      earthGroup.current.rotation.y += dt * 0.004
    }

    /* ---- ion trail + engine glow ---- */
    if (thrustGlow.current) {
      thrustGlow.current.visible = travelling
      const pulse = 1 + Math.sin(now * 18) * 0.08
      thrustGlow.current.scale.set(7 * pulse, 7 * pulse, 1)
    }
    if (payload?.visible && travelling) {
      if (hasPreviousPayload.current) {
        const speed = payload.position.distanceTo(previousPayload.current) / Math.max(dt, 0.001)
        if (speed > 6) {
          const back = position.copy(previousPayload.current).sub(payload.position).normalize()
          ionTrail.emit(
            now,
            payload.position.x + back.x * 3, payload.position.y + back.y * 3, payload.position.z + back.z * 3,
            0, 0, 0, 1.5, 4.2, 1.2, 0.55, ionColors.head, ionColors.tail,
          )
        }
      }
      previousPayload.current.copy(payload.position)
      hasPreviousPayload.current = true
    } else {
      hasPreviousPayload.current = false
    }
    ionTrail.update(now, dt)

    /* ---- camera ---- */
    const spaceShot = Boolean(payload?.visible) && !launchFailed
    if (spaceShot && payload) {
      if (cameraMode.current !== 'space') {
        cameraMode.current = 'space'
        cameraRelative.copy(camera.position).sub(payload.position)
        lookRelative.copy(lastLook.current).sub(payload.position)
      }

      let rate = 2.4
      let fov = 30
      const inTransfer = phase === 'departure' || phase === 'transfer'
      const inApproach =
        phase === 'approach' || phase === 'orbital_insertion' ||
        phase === 'planetary_flyby' || phase === 'mission_complete'
      const inOrbit = phase === 'stable_orbit'

      if (destination && flightMode && (inTransfer || inApproach || inOrbit)) {
        toDestination.set(
          destination.center.x - payload.position.x,
          destination.center.y - payload.position.y,
          destination.center.z - payload.position.z,
        )
        const distanceToDestination = toDestination.length()
        forward.copy(toDestination).normalize()
        side.crossVectors(forward, worldUp)
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0)
        side.normalize()
        upAxis.crossVectors(side, forward).normalize()

        if (inOrbit) {
          if (orbitCameraView === 'planet') {
            desiredRelative.set(
              destinationTarget.x + cameraOrbitRadius * 2 - payload.position.x,
              destinationTarget.y + cameraOrbitRadius * 2.8 - payload.position.y,
              destinationTarget.z + cameraOrbitRadius * 2 - payload.position.z,
            )
            desiredLook.set(
              destinationTarget.x - payload.position.x,
              destinationTarget.y - payload.position.y,
              destinationTarget.z - payload.position.z,
            )
          } else if (orbitCameraView === 'planet-edge') {
            const orbitAngle = Math.max(0, elapsed - STABLE_ORBIT_TIME) * ORBIT_ANGULAR_SPEED
            const ahead = getOrbitPosition(destination.center, orbitRadius, orbitAngle + 0.1)
            tangent.set(ahead.x - payload.position.x, ahead.y - payload.position.y, ahead.z - payload.position.z).normalize()
            outward.copy(payload.position).sub(destinationTarget).normalize()
            desiredRelative.copy(tangent).multiplyScalar(-48)
              .addScaledVector(outward, 28).addScaledVector(worldUp, 12)
            desiredLook.set(0, 0, 0)
            fov = 46
          } else {
            const orbitAngle = Math.max(0, elapsed - STABLE_ORBIT_TIME) * ORBIT_ANGULAR_SPEED
            outward.set(Math.cos(orbitAngle), 0, Math.sin(orbitAngle))
            tangent.set(-Math.sin(orbitAngle), 0, Math.cos(orbitAngle))
            desiredRelative.copy(tangent).multiplyScalar(-cameraOrbitRadius * 2.55)
              .addScaledVector(outward, cameraOrbitRadius * 0.15)
              .addScaledVector(worldUp, cameraOrbitRadius * 0.55)
            desiredLook.set(0, 0, 0)
          }
          fov = orbitCameraView === 'satellite' ? 38 : 42
          rate = 7
        } else if (inApproach) {
          const k = phase === 'approach' ? 0 : 1
          desiredRelative.copy(forward).multiplyScalar(-(30 - k * 8))
            .addScaledVector(side, 24 + k * 6).addScaledVector(upAxis, 10)
          desiredLook.copy(toDestination).multiplyScalar(Math.min(0.32, 90 / Math.max(distanceToDestination, 1)))
          fov = 36
          rate = 2
        } else {
          const swing = elapsed * 0.22
          desiredRelative.copy(forward).multiplyScalar(-34)
            .addScaledVector(side, 11 * Math.cos(swing))
            .addScaledVector(upAxis, 8 + 4 * Math.sin(swing))
          desiredLook.copy(forward).multiplyScalar(24)
          fov = 32
          rate = 2.2
        }
      } else {
        // Zoomed-in hero shot of the freshly deployed spacecraft, slowly orbiting and pushing in.
        const push = smoothstep(0, 6, elapsed - SPACECRAFT_DEPLOYMENT_TIME)
        const distance = lerp(46, 33, push)
        const azimuth = 0.9 + elapsed * 0.07
        const elevation = 0.42
        desiredRelative.set(
          Math.sin(azimuth) * Math.cos(elevation) * distance,
          Math.sin(elevation) * distance,
          Math.cos(azimuth) * Math.cos(elevation) * distance,
        )
        desiredLook.set(0, -1, 0)
        fov = 30
        rate = 2.6
      }

      if (inOrbit && previousOrbitCameraView.current !== orbitCameraView) {
        cameraRelative.copy(desiredRelative)
        if (orbitCameraView === 'planet-edge') {
          lookRelative.set(0, 0, 0)
        } else {
          lookRelative.copy(desiredLook)
        }
        previousOrbitCameraView.current = orbitCameraView
      }
      const k = 1 - Math.exp(-rate * dt)
      cameraRelative.lerp(desiredRelative, k)
      lookRelative.lerp(desiredLook, 1 - Math.exp(-rate * 1.5 * dt))
      perspective.fov = damp(perspective.fov, fov, 2.5, dt)
      perspective.updateProjectionMatrix()

      camera.position.copy(payload.position).add(cameraRelative)
      target.copy(payload.position).add(lookRelative)
      if (inOrbit && orbitCameraView === 'planet-edge') target.copy(payload.position)
      if (missionFailed && phase === 'anomaly') {
        camera.position.x += Math.sin(elapsed * 41) * 0.12
        camera.position.y += Math.cos(elapsed * 37) * 0.12
      }
      camera.lookAt(target)
      lastLook.current.copy(target)
    } else {
      cameraMode.current = 'ground'
      const shakeBase = elapsed >= 2.35 && elapsed < FAILURE_TIME
        ? 0.22 * Math.min(1, (elapsed - 2.35) / 1.4)
        : 0
      const blastShake = launchFailed && elapsed >= FAILURE_TIME ? 1.1 * Math.exp(-(elapsed - FAILURE_TIME) * 3) : 0
      const shakeStrength = shakeBase + blastShake
      const followY = launchFailed ? 0 : Math.max(0, root.position.y + (payload?.visible ? 70 : 0))
      const orbitProgress = launchFailed ? 0 : liftoffProgress
      position.set(
        112 - orbitProgress * 76,
        84 + followY + orbitProgress * 14,
        175 - orbitProgress * 78,
      )
      target.set(0, root.position.y + 42 + 24, 0)
      camera.position.lerp(position, 1 - Math.exp(-dt * (elapsed > 3.8 ? 2.4 : 3.5)))
      camera.position.x += Math.sin(elapsed * 28) * shakeStrength
      camera.position.y += Math.cos(elapsed * 24) * shakeStrength
      smoothLook.current.lerp(target, 1 - Math.exp(-dt * 7))
      perspective.fov = damp(perspective.fov, 38, 3, dt)
      perspective.updateProjectionMatrix()
      camera.lookAt(smoothLook.current)
      lastLook.current.copy(smoothLook.current)
    }
  })

  const smokeActive = phase === 'ignition' || phase === 'ascent' || phase === 'stage_separation' || phase === 'anomaly'
  const destinationVisible = Boolean(
    destination &&
      !launchFailed &&
      !missionFailed &&
      ['transfer', 'approach', 'orbital_insertion', 'stable_orbit', 'planetary_flyby', 'mission_complete'].includes(phase),
  )
  const rocketModel = record.launchVehicle.model

  return (
    <>
      <primitive object={background} attach="background" />
      <primitive object={fog} attach="fog" />
      <ambientLight ref={ambientLight} intensity={0.7} />
      <hemisphereLight ref={hemisphereLight} args={['#dceaf0', '#58625c', 1.1]} />
      <directionalLight
        ref={sunLight}
        position={[110, 180, 85]}
        intensity={1.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={180}
        shadow-camera-bottom={-80}
      />
      <SkyBackdrop spaceMix={spaceMix} />
      <group ref={groundGroup}>
        <LaunchPad />
        <GroundPlane />
        <ServiceTower />
        <DistantTerrain />
        <SkyClouds />
      </group>

      {showEarthBackdrop && earthTextures && (
        <group ref={earthGroup} position={[0, EARTH_BACKDROP_BASE_Y - 3600, 0]} visible={false}>
          <RealisticPlanet radius={EARTH_BACKDROP_RADIUS} style="earth" textures={earthTextures} />
        </group>
      )}

      {destination && planetStyle && destinationTextures && (
        <group
          position={[destination.center.x, destination.center.y, destination.center.z]}
          visible={destinationVisible}
          scale={phase === 'stable_orbit' ? STABLE_ORBIT_PLANET_SCALE : 1}
        >
          <RealisticPlanet radius={destination.radius} style={planetStyle} textures={destinationTextures} />
        </group>
      )}

      <group ref={rocketRoot}>
        {rocketModel?.format === 'stl' ? (
          <AssetFailureBoundary fallback={<ProceduralRocket variant={variant} startedAt={launchFailed ? null : startedAt} onReady={markVehicleReady} />}>
            <Suspense fallback={null}>
              <NasaSlsRocket
                modelPath={rocketModel.modelPath}
                onReady={markVehicleReady}
              />
            </Suspense>
          </AssetFailureBoundary>
        ) : (
          <ProceduralRocket
            variant={variant}
            startedAt={launchFailed ? null : startedAt}
            onReady={markVehicleReady}
          />
        )}
        <group ref={attachedPayload} position={[0, 90, 0]} scale={0.78}>
          <Suspense fallback={null}>
            <SpacecraftPayloadModel model={record.spacecraftModel} onReady={markPayloadReady} />
          </Suspense>
        </group>
        <EngineExhaust startedAt={startedAt} phase={phase} failed={launchFailed} />
      </group>

      <group ref={deployedPayload} visible={false}>
        <Suspense fallback={null}>
          <SpacecraftPayloadModel model={record.spacecraftModel} onReady={markPayloadReady} />
        </Suspense>
        <mesh position={[0, 0, 4.8]}>
          <sphereGeometry args={[0.34, 12, 10]} />
          <meshBasicMaterial color="#55e7ff" toneMapped={false} />
        </mesh>
        <pointLight position={[0, 1, 0]} color="#55e7ff" intensity={5} distance={24} />
        <sprite ref={thrustGlow} position={[0, 0, -5]} scale={[7, 7, 1]} visible={false}>
          <spriteMaterial map={glowMap} color="#7fdcff" blending={AdditiveBlending} transparent depthWrite={false} opacity={0.8} fog={false} />
        </sprite>
      </group>
      <primitive object={ionTrail.group} />
      <SpaceDust payloadRef={deployedPayload} spaceMix={spaceMix} />
      {launchFailed && startedAt !== null && <FailureExplosion startedAt={startedAt} cause={failureCause} />}
      <LaunchSmoke startedAt={startedAt} active={smokeActive} launchFailed={launchFailed} rocketState={rocketState} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Audio                                                                     */
/* -------------------------------------------------------------------------- */

function SynthesizedLaunchAudio({ phase, muted }: { phase: SequencePhase; muted: boolean }) {
  const audio = useRef<{
    context: AudioContext
    engineGain: GainNode
    oscillator: OscillatorNode
    noiseGain: GainNode
  } | null>(null)

  useEffect(() => {
    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return
    const context = new AudioContextConstructor()
    const oscillator = context.createOscillator()
    const engineGain = context.createGain()
    const filter = context.createBiquadFilter()
    const noiseGain = context.createGain()
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate)
    const samples = buffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) {
      samples[index] = Math.sin(index * 12.9898) * Math.cos(index * 4.1414) * 0.26
    }
    const noise = context.createBufferSource()
    noise.buffer = buffer
    noise.loop = true
    filter.type = 'lowpass'
    filter.frequency.value = 180
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 48
    engineGain.gain.value = 0
    noiseGain.gain.value = 0
    oscillator.connect(filter).connect(engineGain).connect(context.destination)
    noise.connect(filter).connect(noiseGain).connect(context.destination)
    oscillator.start()
    noise.start()
    audio.current = { context, engineGain, oscillator, noiseGain }
    return () => {
      oscillator.stop()
      noise.stop()
      void context.close()
      audio.current = null
    }
  }, [])

  useEffect(() => {
    const source = audio.current
    if (!source) return
    const { context, engineGain, oscillator, noiseGain } = source
    const engineOn = phase === 'ignition' || phase === 'ascent' || phase === 'anomaly'
    const gain = muted ? 0 : engineOn ? (phase === 'anomaly' ? 0.035 : 0.055) : 0.001
    engineGain.gain.setTargetAtTime(gain, context.currentTime, 0.4)
    noiseGain.gain.setTargetAtTime(muted || !engineOn ? 0 : 0.025, context.currentTime, 0.5)
    oscillator.frequency.setTargetAtTime(phase === 'anomaly' ? 34 : 48 + Math.min(phase === 'ascent' ? 14 : 0, 14), context.currentTime, 0.8)
    if (!muted && context.state === 'suspended') void context.resume()
  }, [muted, phase])

  return null
}

/* -------------------------------------------------------------------------- */
/*  HUD                                                                       */
/* -------------------------------------------------------------------------- */

function Telemetry({ startedAt, frozen, failed }: { startedAt: number | null; frozen: boolean; failed: boolean }) {
  const [reading, setReading] = useState({ clock: 'T-00:04', altitude: '0', velocity: '0.0' })

  useEffect(() => {
    if (startedAt === null) return
    const update = () => {
      const raw = performance.now() / 1000 - startedAt
      const elapsed = failed ? Math.min(raw, FAILURE_TIME) : raw
      const t = elapsed - LIFTOFF_TIME
      const sign = t < 0 ? '-' : '+'
      const abs = Math.abs(t)
      const clock = `T${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(Math.floor(abs % 60)).padStart(2, '0')}`
      const progress = clamp01(t / (ASCENT_COMPLETE_TIME - LIFTOFF_TIME))
      let altitude = Math.pow(progress, 1.45) * 190
      if (!failed && elapsed > ASCENT_COMPLETE_TIME) altitude += Math.pow(elapsed - ASCENT_COMPLETE_TIME, 1.8) * 1800
      const velocity = failed
        ? progress * 1.4
        : 7.8 * Math.min(1, Math.pow(progress, 0.8)) + 3.4 * clamp01((elapsed - TRANSFER_START_TIME) / 6)
      setReading({
        clock,
        altitude: Math.round(altitude).toLocaleString(),
        velocity: velocity.toFixed(1),
      })
    }
    update()
    if (frozen) return
    const interval = window.setInterval(update, 100)
    return () => window.clearInterval(interval)
  }, [failed, frozen, startedAt])

  if (startedAt === null) return null
  return (
    <div className="pointer-events-none absolute right-4 top-14 z-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-slate-100/85 backdrop-blur">
      <div>{reading.clock}</div>
      <div>ALT {reading.altitude} KM</div>
      <div>VEL {reading.velocity} KM/S</div>
    </div>
  )
}

function phaseLabel(
  phase: SequencePhase,
  launchFailed: boolean,
  missionFailed: boolean,
  missionProfile: MissionFlightProfile,
  destinationConfigured: boolean,
) {
  const labels: Record<SequencePhase, string> = {
    loading: 'Preparing the pad',
    countdown3: '3',
    countdown2: '2',
    countdown1: '1',
    ignition: 'IGNITION',
    ascent: launchFailed ? 'ASCENT ANOMALY' : 'LIFTOFF',
    stage_separation: 'STAGE SEPARATION',
    fairing_separation: 'PAYLOAD FAIRING SEPARATION',
    spacecraft_deployment: 'SPACECRAFT DEPLOYMENT',
    spacecraft_initialization: 'SPACECRAFT INITIALIZATION',
    mission_active: 'MISSION OPERATIONS STARTED',
    departure: 'DEPARTURE FROM EARTH',
    transfer: 'IN TRANSIT TO DESTINATION',
    approach: 'DESTINATION APPROACH',
    orbital_insertion: 'ORBITAL INSERTION',
    stable_orbit: 'STABLE ORBIT',
    planetary_flyby: 'PLANETARY FLYBY',
    mission_complete: 'FLYBY COMPLETE',
    configuration_error: 'DESTINATION CONFIGURATION ERROR',
    anomaly: launchFailed ? 'LAUNCH ABORTED' : missionFailed ? 'SPACECRAFT ANOMALY' : 'ASCENT ANOMALY',
    complete: launchFailed ? 'LAUNCH FAILED' : missionFailed ? 'MISSION FAILED IN FLIGHT' : 'SPACECRAFT DEPLOYED',
  }
  if (!destinationConfigured && ['departure', 'transfer', 'approach', 'orbital_insertion', 'stable_orbit', 'planetary_flyby', 'mission_complete'].includes(phase)) {
    return 'DESTINATION CONFIGURATION ERROR'
  }
  if (phase === 'stable_orbit' && missionProfile !== 'orbiter') return 'MISSION PROFILE ERROR'
  return labels[phase]
}

/* -------------------------------------------------------------------------- */
/*  Public component                                                          */
/* -------------------------------------------------------------------------- */

export function LaunchSequence({ record, onComplete }: { record: LaunchRecord; onComplete: () => void }) {
  const [phase, setPhase] = useState<SequencePhase>('loading')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [muted, setMuted] = useState(true)
  const [orbitCameraView, setOrbitCameraView] = useState<'satellite' | 'planet' | 'planet-edge'>('satellite')
  const completionSent = useRef(false)
  const initializedOrbitView = useRef(false)
  const { progress } = useProgress()
  const failed = record.outcome === 'failure'
  const missionFailed = !failed && record.failureTitle !== null
  const destination = useMemo(
    () => resolveFlightDestination(
      record.planningSnapshot.destinationId,
      record.planningSnapshot.destinationBodyId,
      record.destination,
    ),
    [record.destination, record.planningSnapshot.destinationBodyId, record.planningSnapshot.destinationId],
  )
  const missionProfile: MissionFlightProfile = record.planningSnapshot.missionProfile ??
    (record.destination.toLocaleLowerCase().includes('asteroid') ? 'planning' : 'orbiter')
  const onAssetReady = useCallback(() => {
    setStartedAt((current) => current ?? performance.now() / 1000)
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    const startedAtSeconds = startedAt
    const interval = window.setInterval(() => {
      const elapsed = Math.max(0, performance.now() / 1000 - startedAtSeconds)
      const nextPhase = sequencePhaseAt(
        elapsed,
        failed,
        missionFailed,
        missionProfile,
        destination !== null,
      )
      if (nextPhase === 'stable_orbit' && !initializedOrbitView.current) {
        initializedOrbitView.current = true
        setOrbitCameraView('satellite')
      }
      setPhase((currentPhase) => {
        const currentAt = sequenceElapsedAt(currentPhase, failed, missionFailed, missionProfile, destination !== null)
        const nextAt = sequenceElapsedAt(nextPhase, failed, missionFailed, missionProfile, destination !== null)
        return nextAt < currentAt ? currentPhase : nextPhase
      })
      if (isTerminalSequencePhase(nextPhase)) {
        window.clearInterval(interval)
        if (!completionSent.current) {
          completionSent.current = true
          onComplete()
        }
      }
    }, 80)
    return () => window.clearInterval(interval)
  }, [destination, failed, missionFailed, missionProfile, onComplete, startedAt])

  const sequenceLabel = phaseLabel(phase, failed, missionFailed, missionProfile, destination !== null)
  const hasTerminalPhase = isTerminalSequencePhase(phase)
  const isOrbitalPhase = phase === 'stable_orbit'
  const terminalText =
    phase === 'complete'
      ? failed ? 'LAUNCH FAILED' : 'MISSION FAILED IN FLIGHT'
      : phase === 'stable_orbit'
        ? 'STABLE ORBIT · MISSION OPERATIONS'
        : phase === 'mission_complete'
          ? 'PLANETARY FLYBY COMPLETE'
          : phase === 'configuration_error'
            ? 'MISSION DESTINATION NOT CONFIGURED'
            : null

  return (
    <div
      className={`relative isolate h-[480px] overflow-hidden rounded-2xl border ${
        failed ? 'border-rose-300/20' : 'border-sky-300/20'
      } bg-[#152b3d] shadow-[0_24px_90px_rgba(0,0,0,0.36)]`}
      role="img"
      aria-label={`${record.launchVehicle.name} real-time 3D launch sequence: ${sequenceLabel}`}
    >
      <Canvas
        frameloop={hasTerminalPhase && !isOrbitalPhase ? 'demand' : 'always'}
        camera={{ position: [112, 84, 175], fov: 38, near: 1, far: 60000 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = PCFShadowMap
        }}
      >
        <LaunchWorld
          record={record}
          startedAt={startedAt}
          phase={phase}
          orbitCameraView={orbitCameraView}
          onAssetReady={onAssetReady}
        />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-14 z-10 text-center" aria-live="polite">
        {phase !== 'loading' && phase !== 'complete' && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-slate-100/75">
            Flight director · {record.launchVehicle.name}
          </p>
        )}
        <p
          className={`mt-2 text-3xl font-black tracking-[0.18em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.75)] sm:text-4xl ${
            phase === 'anomaly' || phase === 'configuration_error'
              ? (failed ? 'text-rose-100' : 'text-amber-100')
              : phase === 'ignition'
                ? 'text-amber-100'
                : 'text-white'
          }`}
        >
          {sequenceLabel}
        </p>
        {phase !== 'loading' && phase !== 'complete' && (
          <p className="mt-2 text-[10px] font-medium tracking-[0.08em] text-slate-100/75">
            {record.spacecraftName} · {record.missionName} · {record.destination}
          </p>
        )}
      </div>

      {phase === 'loading' && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-slate-950/25">
          <div className="rounded-xl border border-white/15 bg-slate-950/75 px-5 py-4 text-center text-xs text-slate-100 shadow-xl backdrop-blur">
            <span className="mx-auto mb-2 block h-6 w-6 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
            Preparing launch vehicle · {Math.round(progress)}%
          </div>
        </div>
      )}

      <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full border border-white/15 bg-slate-950/65 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-100 backdrop-blur">
        <span className={`h-1.5 w-1.5 rounded-full ${hasTerminalPhase ? (failed ? 'bg-rose-300' : missionFailed || phase === 'configuration_error' ? 'bg-amber-300' : 'bg-emerald-300') : 'bg-sky-300 animate-pulse'}`} />
        {hasTerminalPhase
          ? failed
            ? 'Ascent aborted'
            : missionFailed
              ? 'Mission failed in space · launch successful'
              : phase === 'configuration_error'
                ? 'Mission flight unavailable'
                : phase === 'stable_orbit'
                  ? `Stable orbit around ${destination?.name ?? 'destination'} · mission assessment pending`
                  : phase === 'mission_complete'
                    ? `Flyby of ${destination?.name ?? record.destination} complete`
                    : 'Deployment complete · mission assessment pending'
          : 'Live flight simulation'}
      </div>

      <button
        type="button"
        aria-pressed={!muted}
        onClick={() => setMuted((current) => !current)}
        className="absolute right-4 top-4 z-20 rounded-full border border-white/15 bg-slate-950/65 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-100 backdrop-blur transition hover:bg-slate-900"
      >
        {muted ? 'Enable audio' : 'Mute audio'}
      </button>

      {phase === 'stable_orbit' && (
        <button
          type="button"
          aria-pressed={orbitCameraView !== 'satellite'}
          aria-label={`Switch camera view from ${orbitCameraView === 'satellite' ? 'satellite' : orbitCameraView === 'planet' ? 'planet-side' : 'planet-edge'}`}
          onClick={() => setOrbitCameraView((current) => current === 'satellite' ? 'planet' : current === 'planet' ? 'planet-edge' : 'satellite')}
          className="absolute left-4 top-14 z-20 rounded-full border border-white/15 bg-slate-950/65 px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-slate-100 backdrop-blur transition hover:bg-slate-900"
        >
          {orbitCameraView === 'satellite'
            ? 'Satellite view'
            : orbitCameraView === 'planet'
              ? 'Planet-side view'
              : 'Planet-edge view'}
        </button>
      )}

      <Telemetry startedAt={startedAt} frozen={hasTerminalPhase && !isOrbitalPhase} failed={failed} />

      {hasTerminalPhase && terminalText && (
        <div className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-2 text-xs font-black tracking-[0.2em] shadow-xl backdrop-blur ${
          failed
            ? 'border-rose-200/50 bg-rose-950/90 text-rose-100'
            : missionFailed || phase === 'configuration_error'
              ? 'border-amber-200/50 bg-amber-950/90 text-amber-100'
              : 'border-emerald-200/50 bg-emerald-950/90 text-emerald-100'
        }`}>
          {terminalText}
        </div>
      )}

      {!failed && phase !== 'loading' && (
        <div className="absolute bottom-4 left-4 z-10 max-w-[75%] rounded-lg border border-white/10 bg-slate-950/75 px-3 py-2 text-[10px] leading-relaxed text-slate-100 backdrop-blur">
          {phase === 'stage_separation' && (
            record.launchVehicle.model?.format === 'stl'
              ? 'Stage event shown as a simplified cue; the selected launch vehicle is a single, indivisible STL mesh.'
              : 'Procedural lower stage and configured boosters separate from the continuing upper vehicle.'
          )}
          {phase === 'fairing_separation' && (
            record.launchVehicle.model?.format === 'stl'
              ? 'Simplified fairing event cue; the source vehicle mesh is preserved and not split.'
              : 'Procedural fairing halves move away to reveal the selected spacecraft.'
          )}
          {phase === 'spacecraft_deployment' && (
            isSurfacePayload(record)
              ? 'Selected surface vehicle separates for display; entry, descent, and landing are not simulated.'
              : 'Selected spacecraft separates and begins independent, simulated motion.'
          )}
          {phase === 'spacecraft_initialization' && (
            isSurfacePayload(record)
              ? 'Surface payload deployed for demonstration · simulated communications link establishing.'
              : 'Spacecraft deployed · simulated communications link establishing.'
          )}
          {phase === 'mission_active' && (
            isSurfacePayload(record)
              ? 'Surface mission destination selected · landing and surface operations are not simulated.'
              : record.destination.toLowerCase().includes('earth')
                ? 'Initial Earth-orbit segment simulated · mission objectives still require assessment.'
                : `Simplified outbound trajectory toward ${record.destination} · no detailed transfer is simulated.`
          )}
          {phase === 'departure' && `Spacecraft has separated and is departing Earth for ${record.destination}.`}
          {phase === 'transfer' && `Accelerated transfer simulation toward ${destination?.name ?? record.destination}.`}
          {phase === 'approach' && `Destination approach: ${destination?.name ?? record.destination} is in view.`}
          {phase === 'orbital_insertion' && `Performing a simplified orbital insertion around ${destination?.name ?? record.destination}.`}
          {phase === 'stable_orbit' && `Spacecraft position is moving continuously around ${destination?.name ?? record.destination}; mission objectives are assessed separately.`}
          {phase === 'planetary_flyby' && `Spacecraft is passing ${record.destination} on a flyby trajectory; no orbit insertion is performed.`}
          {phase === 'mission_complete' && `The spacecraft completed its simulated flyby of ${record.destination}.`}
          {phase === 'configuration_error' && (
            `Mission configuration error: no supported destination is configured for "${record.destination}". Launch and deployment remain shown, but no arrival is claimed.`
          )}
          {phase === 'anomaly' && missionFailed && (
            `Spacecraft anomaly after deployment: ${record.failureTitle}. ${record.failureCause ?? 'Mission systems could not meet the configured requirements.'}`
          )}
          {phase === 'complete' && (
            missionFailed
              ? `Launch and deployment succeeded; the spacecraft mission failed in space: ${record.failureTitle}. The spacecraft remains intact.`
              : 'Launch and deployment completed. Overall mission success has not been assessed.'
          )}
        </div>
      )}

      <SynthesizedLaunchAudio phase={phase} muted={muted} />
    </div>
  )
}