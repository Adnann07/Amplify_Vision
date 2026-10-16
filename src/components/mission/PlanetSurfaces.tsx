import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AdditiveBlending,
  BackSide,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three'
import type { FlightDestination } from './missionFlightPath'
import { SUN_DIRECTION } from './launchConstants'
import { clamp01, fbm3, lerp, makeCanvas, noise3, smoothstep } from './proceduralMath'

/* -------------------------------------------------------------------------- */
/*  Procedural planet surfaces                                                */
/* -------------------------------------------------------------------------- */

type RGB = [number, number, number]
interface Surface {
  color: RGB
  height: number
}
export type PlanetStyle =
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

export interface PlanetTextures {
  map: CanvasTexture
  bump: CanvasTexture | null
  clouds: CanvasTexture | null
}

const planetTextureCache = new Map<string, PlanetTextures>()

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

/**
 * Returns the textures for `style`, building them in the background the first
 * time. The result is always the textures for the *current* style (never a
 * stale set from a previous destination).
 */
export function usePlanetTextures(style: PlanetStyle | null, tint: string) {
  const key = style ? `${style}:${style === 'rocky' ? tint : ''}` : ''
  const [built, setBuilt] = useState<{ key: string; textures: PlanetTextures } | null>(null)
  useEffect(() => {
    if (!style || planetTextureCache.has(key)) return
    const color = new Color(tint)
    return buildPlanetTexturesAsync(style, [color.r * 255, color.g * 255, color.b * 255], (textures) => {
      planetTextureCache.set(key, textures)
      setBuilt({ key, textures })
    })
  }, [key, style, tint])
  if (!style) return null
  return planetTextureCache.get(key) ?? (built?.key === key ? built.textures : null)
}

export function resolvePlanetStyle(destination: FlightDestination): PlanetStyle {
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

export function RealisticPlanet({ radius, style, textures }: { radius: number; style: PlanetStyle; textures: PlanetTextures }) {
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
