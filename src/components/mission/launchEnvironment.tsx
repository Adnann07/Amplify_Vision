import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  UniformsLib,
  UniformsUtils,
  Vector3,
} from 'three'
import { getCloudTexture, getGlowTexture, getSmokeTexture, SpriteEmitter } from './launchParticles'
import { HORIZON_COLOR, SUN_DIRECTION, ZENITH_COLOR } from './launchConstants'
import { clamp01, fbm3, hash3, lerp, makeCanvas, seeded, smoothstep } from './proceduralMath'

/* -------------------------------------------------------------------------- */
/*  Shared constants                                                          */
/* -------------------------------------------------------------------------- */

const GROUND_Y = -5.25
const OCEAN_Y = -12
const TERRAIN_SIZE = 12000

type RGB = [number, number, number]

/* -------------------------------------------------------------------------- */
/*  Seamless procedural textures (ground, concrete, gravel)                   */
/* -------------------------------------------------------------------------- */

/** Makes a non-periodic scalar field tile seamlessly over the unit square. */
function tile(fn: (u: number, v: number) => number, u: number, v: number) {
  return (
    fn(u, v) * (1 - u) * (1 - v) +
    fn(u - 1, v) * u * (1 - v) +
    fn(u, v - 1) * (1 - u) * v +
    fn(u - 1, v - 1) * u * v
  )
}
const tn = (u: number, v: number, freq: number, seed: number, octaves = 3) =>
  tile((a, b) => fbm3(a * freq + seed, b * freq + seed * 0.5, seed * 0.37, octaves), u, v)

function makeTiledTexture(size: number, pixel: (u: number, v: number) => RGB) {
  const canvas = makeCanvas(size, size)
  const context = canvas.getContext('2d')
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  if (!context) return texture
  const image = context.createImageData(size, size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b] = pixel(x / size, y / size)
      const i = (y * size + x) * 4
      image.data[i] = Math.min(255, r)
      image.data[i + 1] = Math.min(255, g)
      image.data[i + 2] = Math.min(255, b)
      image.data[i + 3] = 255
    }
  }
  context.putImageData(image, 0, 0)
  texture.needsUpdate = true
  return texture
}

interface SiteTextures {
  ground: CanvasTexture
  concrete: CanvasTexture
  gravel: CanvasTexture
}
let siteTextures: SiteTextures | null = null

function getSiteTextures(): SiteTextures {
  if (siteTextures) return siteTextures
  const GS = 256
  const ground = makeTiledTexture(GS, (u, v) => {
    const coarse = tn(u, v, 5, 3, 3)
    const fine = tn(u, v, 24, 11, 2)
    const grit = hash3(Math.floor(u * GS), Math.floor(v * GS), 5)
    const k = clamp01(0.72 + (coarse - 0.5) * 0.9 + (fine - 0.5) * 0.8 + (grit - 0.5) * 0.18)
    return [k * 255, k * 252, k * 246]
  })
  const CS = 192
  const concrete = makeTiledTexture(CS, (u, v) => {
    const n = tn(u, v, 7, 21, 3)
    const f = tn(u, v, 30, 4, 2)
    const stain = tn(u, v, 2.2, 33, 3)
    const grit = hash3(Math.floor(u * CS), Math.floor(v * CS), 9)
    let k = 0.8 + (n - 0.5) * 0.6 + (f - 0.5) * 0.4 + (grit - 0.5) * 0.1
    const du = Math.min(u, 1 - u, Math.abs(u - 0.5))
    const dv = Math.min(v, 1 - v, Math.abs(v - 0.5))
    if (du < 0.004 || dv < 0.004) k *= 0.6
    k *= 1 - smoothstep(0.58, 0.8, stain) * 0.3
    return [k * 236, k * 233, k * 222]
  })
  const RS = 256
  const gravel = makeTiledTexture(RS, (u, v) => {
    const g1 = hash3(Math.floor(u * RS), Math.floor(v * RS), 2)
    const g2 = hash3(Math.floor(u * RS * 0.5), Math.floor(v * RS * 0.5), 8)
    const n = tn(u, v, 9, 5, 3)
    let k = 0.52 + (g1 - 0.5) * 0.5 + (g2 - 0.5) * 0.3 + (n - 0.5) * 0.55
    const track = Math.exp(-(((u - 0.27) / 0.07) ** 2)) + Math.exp(-(((u - 0.73) / 0.07) ** 2))
    k *= 1 - track * 0.28
    return [k * 214, k * 200, k * 180]
  })
  siteTextures = { ground, concrete, gravel }
  return siteTextures
}

function repeated(texture: CanvasTexture, x: number, y: number) {
  const copy = texture.clone()
  copy.repeat.set(x, y)
  copy.needsUpdate = true
  return copy
}

/* -------------------------------------------------------------------------- */
/*  Terrain: flat cleared launch area, rolling scrubland, a shoreline         */
/* -------------------------------------------------------------------------- */

function sampleTerrain(x: number, z: number) {
  const r = Math.hypot(x, z)
  const rolling = (fbm3(x * 0.0012 + 4, 1.5, z * 0.0012, 3) - 0.5) * 2
  const dunes = rolling * 13 * smoothstep(650, 1500, r)
  const shore = -1150 + (fbm3(x * 0.0007 + 8, 2, 5, 3) - 0.5) * 700
  const water = smoothstep(-120, 180, shore - z)
  const edge = smoothstep(3400, 5400, r)
  let h = GROUND_Y + dunes
  h = lerp(h, -34, water)
  h = lerp(h, -45, edge)
  return { h, water, r }
}

const GRASS_A = new Color('#4d6136')
const GRASS_B = new Color('#78783f')
const DRY = new Color('#8f8a5f')
const SCRUB = new Color('#34452a')
const SAND = new Color('#dccfa6')
const CLEARED = new Color('#a39a7c')

function Terrain() {
  const { geometry, material } = useMemo(() => {
    const texture = repeated(getSiteTextures().ground, TERRAIN_SIZE / 8, TERRAIN_SIZE / 8)
    const geo = new PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, 200, 200)
    geo.rotateX(-Math.PI / 2)
    const position = geo.attributes.position
    const colors = new Float32Array(position.count * 3)
    const tmp = new Color()
    for (let index = 0; index < position.count; index++) {
      const x = position.getX(index)
      const z = position.getZ(index)
      const { h, water, r } = sampleTerrain(x, z)
      position.setY(index, h)
      const veg = fbm3(x * 0.004 + 1, 3, z * 0.004, 4)
      const dry = smoothstep(0.5, 0.7, fbm3(x * 0.0025 + 7, 5, z * 0.0025, 3))
      const scrub = smoothstep(0.55, 0.75, fbm3(x * 0.006 + 2, 8, z * 0.006 + 4, 3))
      const cleared = 1 - smoothstep(200, 520, r)
      tmp.copy(GRASS_A).lerp(GRASS_B, veg).lerp(DRY, dry * 0.7).lerp(SCRUB, scrub * 0.8)
      tmp.lerp(CLEARED, cleared * 0.85).lerp(SAND, smoothstep(0.04, 0.45, water))
      colors[index * 3] = tmp.r
      colors[index * 3 + 1] = tmp.g
      colors[index * 3 + 2] = tmp.b
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    const mat = new MeshStandardMaterial({
      map: texture, bumpMap: texture, bumpScale: 1.4, vertexColors: true, roughness: 1, metalness: 0,
    })
    return { geometry: geo, material: mat }
  }, [])
  useEffect(() => () => { geometry.dispose(); material.dispose() }, [geometry, material])
  return <mesh geometry={geometry} material={material} receiveShadow />
}

/* -------------------------------------------------------------------------- */
/*  Ocean: animated normals, Fresnel sky reflection, sun glitter, fog         */
/* -------------------------------------------------------------------------- */

const OCEAN_VERTEX = /* glsl */ `
  varying vec3 vWorld;
  #include <fog_pars_vertex>
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorld = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`
const OCEAN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSun;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  varying vec3 vWorld;
  #include <fog_pars_fragment>
  vec2 wave(vec2 p, vec2 d, float freq, float speed, float amp) {
    float ph = dot(p, d) * freq + uTime * speed;
    return d * cos(ph) * amp * freq;
  }
  void main() {
    vec2 p = vWorld.xz;
    float dist = length(cameraPosition - vWorld);
    float lod = 1.0 - smoothstep(250.0, 2200.0, dist);
    vec2 g = wave(p, normalize(vec2(1.0, 0.35)), 0.045, 1.1, 1.0);
    g += wave(p, normalize(vec2(-0.6, 1.0)), 0.07, 1.4, 0.8);
    g += wave(p, normalize(vec2(0.3, -1.0)), 0.13, 1.9, 0.5) * (0.4 + 0.6 * lod);
    g += wave(p, normalize(vec2(-1.0, -0.2)), 0.26, 2.4, 0.35) * lod;
    g += wave(p, normalize(vec2(0.8, 0.9)), 0.52, 3.1, 0.2) * lod;
    vec3 n = normalize(vec3(-g.x * 0.33, 1.0, -g.y * 0.33));
    vec3 v = normalize(cameraPosition - vWorld);
    vec3 r = reflect(-v, n);
    float fres = 0.02 + 0.98 * pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 5.0);
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(r.y, 0.0, 1.0), 0.5));
    vec3 body = mix(uDeep, uShallow, clamp(0.35 + g.x * 0.3, 0.0, 1.0));
    float sr = max(dot(r, uSun), 0.0);
    vec3 spec = vec3(1.0, 0.92, 0.78) * (pow(sr, 260.0) * 2.6 + pow(sr, 24.0) * 0.14);
    vec3 col = mix(body, sky, fres) + spec;
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`

function Ocean() {
  const material = useMemo(() => new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uSun: { value: SUN_DIRECTION },
        uDeep: { value: new Color('#0a3550') },
        uShallow: { value: new Color('#1f7587') },
        uHorizon: { value: new Color(HORIZON_COLOR) },
        uZenith: { value: new Color(ZENITH_COLOR) },
      },
    ]),
    vertexShader: OCEAN_VERTEX,
    fragmentShader: OCEAN_FRAGMENT,
    fog: true,
  }), [])
  useEffect(() => () => material.dispose(), [material])
  useFrame(({ clock }) => { material.uniforms.uTime.value = clock.elapsedTime })
  return (
    <mesh position={[0, OCEAN_Y, 0]} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      <planeGeometry args={[90000, 90000]} />
    </mesh>
  )
}

/* -------------------------------------------------------------------------- */
/*  Scrub vegetation (instanced)                                              */
/* -------------------------------------------------------------------------- */

const BUSH_COUNT = 900
const BUSH_COLORS = ['#3b4e2b', '#46602f', '#586a35', '#2f4326', '#6a7340'].map((c) => new Color(c))

function Scrub() {
  const mesh = useMemo(() => {
    const geometry = new SphereGeometry(1, 6, 5)
    const material = new MeshStandardMaterial({ roughness: 1, flatShading: true })
    const instanced = new InstancedMesh(geometry, material, BUSH_COUNT)
    const random = seeded(515)
    const dummy = new Object3D()
    let placed = 0
    for (let attempt = 0; attempt < BUSH_COUNT * 3 && placed < BUSH_COUNT; attempt++) {
      const angle = random() * Math.PI * 2
      const r = 190 + Math.pow(random(), 1.6) * 2300
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      if (Math.abs(x) < 48 && z > 30 && z < 740) continue
      const { h, water } = sampleTerrain(x, z)
      if (water > 0.02) continue
      const width = 2.5 + random() * 6.5
      const height = 1.4 + random() * 3.4
      dummy.position.set(x, h + height * 0.25, z)
      dummy.rotation.set(0, random() * 6.28, 0)
      dummy.scale.set(width, height, width * (0.7 + random() * 0.5))
      dummy.updateMatrix()
      instanced.setMatrixAt(placed, dummy.matrix)
      instanced.setColorAt(placed, BUSH_COLORS[Math.floor(random() * BUSH_COLORS.length)])
      placed++
    }
    instanced.count = placed
    instanced.instanceMatrix.needsUpdate = true
    if (instanced.instanceColor) instanced.instanceColor.needsUpdate = true
    instanced.frustumCulled = false
    return instanced
  }, [])
  useEffect(() => () => {
    mesh.geometry.dispose()
    ;(mesh.material as MeshStandardMaterial).dispose()
    mesh.dispose()
  }, [mesh])
  return <primitive object={mesh} />
}

/* -------------------------------------------------------------------------- */
/*  Launch complex: pad, flame trench, service tower, masts, tanks, buildings */
/* -------------------------------------------------------------------------- */

const beamMaterials = new Map<string, MeshStandardMaterial>()
function beamMaterial(color: string) {
  let material = beamMaterials.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, metalness: 0.65, roughness: 0.42 })
    beamMaterials.set(color, material)
  }
  return material
}

function Beam({ position, size, color = '#aab5b8', rotation = [0, 0, 0] }: {
  position: [number, number, number]
  size: [number, number, number]
  color?: string
  rotation?: [number, number, number]
}) {
  return (
    <mesh position={position} scale={size} rotation={rotation} material={beamMaterial(color)} castShadow receiveShadow>
      <boxGeometry args={[1, 1, 1]} />
    </mesh>
  )
}

function ServiceTower({ startedAt }: { startedAt: number | null }) {
  const levels = [7, 19, 31, 43, 55, 67, 79, 91, 103]
  const arms = useRef<Array<Group | null>>([])
  // Access arms swing clear of the vehicle just before liftoff.
  const swing = [
    { from: 1.6, to: 3.2 },
    { from: 2.0, to: 3.5 },
    { from: 2.4, to: 3.8 },
  ]
  useFrame(() => {
    const elapsed = startedAt === null ? 0 : performance.now() / 1000 - startedAt
    swing.forEach(({ from, to }, index) => {
      const arm = arms.current[index]
      if (arm) arm.rotation.y = smoothstep(from, to, elapsed) * 1.15
    })
  })
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
              <Beam position={[0, y + 6, 4]} size={[11, 0.34, 0.34]} rotation={[0, 0, 0.8]} />
              <Beam position={[0, y + 6, -4]} size={[11, 0.34, 0.34]} rotation={[0, 0, -0.8]} />
              <Beam position={[5, y + 6, 0]} size={[0.34, 0.34, 9.6]} rotation={[0.8, 0, 0]} />
              <Beam position={[-5, y + 6, 0]} size={[0.34, 0.34, 9.6]} rotation={[-0.8, 0, 0]} />
            </>
          )}
        </group>
      ))}
      {[28, 61, 88].map((y, index) => (
        <group key={`arm-${y}`} position={[0, y, 0]} ref={(element) => { arms.current[index] = element }}>
          <Beam position={[13, 0, 0]} size={[26, 1.25, 1.35]} color={index === 2 ? '#a9b5b9' : '#b5442c'} />
          <Beam position={[24, -3, 0]} size={[5, 6, 1]} color="#6e7c82" />
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
  const materials = useMemo(() => {
    const textures = getSiteTextures()
    return {
      deck: new MeshStandardMaterial({ map: repeated(textures.concrete, 2.4, 6), roughness: 0.9 }),
      apron: new MeshStandardMaterial({
        map: repeated(textures.concrete, 18, 18), roughness: 0.92,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      }),
      table: new MeshStandardMaterial({ map: repeated(textures.concrete, 1.5, 1.5), color: '#9aa0a0', roughness: 0.8 }),
      soot: new MeshStandardMaterial({ color: '#25292a', roughness: 1 }),
      gravel: new MeshStandardMaterial({ map: repeated(textures.gravel, 1, 10), roughness: 1 }),
    }
  }, [])
  useEffect(() => () => Object.values(materials).forEach((material) => material.dispose()), [materials])
  return (
    <group>
      {/* cleared concrete apron + gravel crawlerway */}
      <mesh position={[0, GROUND_Y + 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} material={materials.apron} receiveShadow>
        <circleGeometry args={[150, 64]} />
      </mesh>
      <mesh position={[0, GROUND_Y + 0.12, 380]} rotation={[-Math.PI / 2, 0, 0]} material={materials.gravel} receiveShadow>
        <planeGeometry args={[64, 640]} />
      </mesh>
      {/* pad deck on both sides of the flame trench */}
      {[-25, 25].map((x) => (
        <mesh key={x} position={[x, -2.235, 0]} material={materials.deck} castShadow receiveShadow>
          <boxGeometry args={[30, 6.03, 80]} />
        </mesh>
      ))}
      {/* sooty trench floor + flame deflector */}
      <mesh position={[0, GROUND_Y + 0.14, 0]} material={materials.soot} receiveShadow>
        <boxGeometry args={[20, 0.1, 80]} />
      </mesh>
      <mesh position={[0, -4.2, 0]} material={materials.soot} castShadow receiveShadow>
        <boxGeometry args={[18, 2, 6.6]} />
      </mesh>
      {[-1, 1].map((side) => (
        <mesh key={side} position={[0, -4.23, side * 3.34]} rotation={[side * 0.3, 0, 0]} material={materials.soot} castShadow>
          <boxGeometry args={[18, 0.8, 7]} />
        </mesh>
      ))}
      {/* launch table: a square ring around the exhaust opening */}
      {([
        [-8.25, 0, [5.5, 3, 22]],
        [8.25, 0, [5.5, 3, 22]],
        [0, -8.25, [11, 3, 5.5]],
        [0, 8.25, [11, 3, 5.5]],
      ] as Array<[number, number, [number, number, number]]>).map(([x, z, size], index) => (
        <mesh key={index} position={[x, -0.7, z]} material={materials.table} castShadow receiveShadow>
          <boxGeometry args={size} />
        </mesh>
      ))}
    </group>
  )
}

function LightningMasts() {
  const lights = useRef<Array<MeshStandardMaterial | null>>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    lights.current.forEach((material, index) => {
      if (material) material.emissiveIntensity = Math.sin(t * 3.1 + index * 1.7) > 0.25 ? 3.2 : 0.2
    })
  })
  return (
    <group>
      {([[-88, -84], [92, -80], [-90, 86], [96, 90]] as Array<[number, number]>).map(([x, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, GROUND_Y + 82, 0]} castShadow>
            <cylinderGeometry args={[0.35, 1.0, 164, 8]} />
            <meshStandardMaterial color="#9ea8ab" metalness={0.7} roughness={0.4} />
          </mesh>
          <mesh position={[0, GROUND_Y + 169, 0]}>
            <cylinderGeometry args={[0.03, 0.2, 10, 6]} />
            <meshStandardMaterial color="#cfd5d6" metalness={0.8} roughness={0.3} />
          </mesh>
          <mesh position={[0, GROUND_Y + 164, 0]}>
            <sphereGeometry args={[0.7, 10, 8]} />
            <meshStandardMaterial
              ref={(material) => { lights.current[index] = material }}
              color="#551010" emissive="#ff2a1a" emissiveIntensity={0.2}
            />
          </mesh>
        </group>
      ))}
    </group>
  )
}

function CryoFarm() {
  return (
    <group>
      {([[-125, 24, 125], [-168, 13, 92]] as Array<[number, number, number]>).map(([x, radius, z], index) => (
        <group key={index} position={[x, 0, z]}>
          <mesh position={[0, GROUND_Y + 8 + radius, 0]} castShadow receiveShadow>
            <sphereGeometry args={[radius, 32, 24]} />
            <meshStandardMaterial color="#eceeee" metalness={0.25} roughness={0.32} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((leg) => {
            const angle = (leg / 6) * Math.PI * 2
            return (
              <Beam
                key={leg}
                position={[Math.cos(angle) * radius * 0.72, GROUND_Y + 5, Math.sin(angle) * radius * 0.72]}
                size={[1.1, 11, 1.1]}
                color="#8b9599"
              />
            )
          })}
        </group>
      ))}
      <mesh position={[-62, GROUND_Y + 2.2, 112]} rotation={[0, 0.2, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[1.1, 1.1, 130, 12]} />
        <meshStandardMaterial color="#d9dddd" metalness={0.5} roughness={0.35} />
      </mesh>
    </group>
  )
}

function WaterTower() {
  return (
    <group position={[96, 0, -62]}>
      {[-5, 5].flatMap((x) => [-5, 5].map((z) => (
        <Beam key={`${x}${z}`} position={[x, GROUND_Y + 29, z]} size={[1.2, 58, 1.2]} color="#9aa4a7" />
      )))}
      <mesh position={[0, GROUND_Y + 68, 0]} castShadow>
        <cylinderGeometry args={[11, 11, 22, 24]} />
        <meshStandardMaterial color="#e1e4e4" metalness={0.2} roughness={0.45} />
      </mesh>
      <mesh position={[0, GROUND_Y + 68, 0]}>
        <cylinderGeometry args={[11.05, 11.05, 4, 24]} />
        <meshStandardMaterial color="#c2392c" roughness={0.6} />
      </mesh>
      <mesh position={[0, GROUND_Y + 82, 0]}>
        <coneGeometry args={[11.2, 5, 24]} />
        <meshStandardMaterial color="#c9cdcd" roughness={0.5} />
      </mesh>
    </group>
  )
}

function SupportBuildings() {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ map: repeated(getSiteTextures().concrete, 2, 1), roughness: 0.85 })
    return m
  }, [])
  useEffect(() => () => material.dispose(), [material])
  return (
    <group>
      {Array.from({ length: 8 }, (_, index) => {
        const height = 10 + (index % 3) * 3
        const x = -85 + index * 25
        const z = -96 - (index % 3) * 9
        return (
          <group key={index} position={[x, GROUND_Y, z]}>
            <mesh position={[0, height / 2, 0]} material={material} castShadow receiveShadow>
              <boxGeometry args={[12, height, 8]} />
            </mesh>
            <mesh position={[0, height + 0.5, 0]}>
              <boxGeometry args={[13, 1, 9]} />
              <meshStandardMaterial color="#444f53" metalness={0.35} roughness={0.6} />
            </mesh>
            <mesh position={[3, height + 2, 1]}>
              <cylinderGeometry args={[1.1, 1.1, 2.4, 10]} />
              <meshStandardMaterial color="#8d9798" metalness={0.5} roughness={0.5} />
            </mesh>
            <mesh position={[0, 3, 4.05]}>
              <boxGeometry args={[3, 5, 0.2]} />
              <meshStandardMaterial color="#3a4548" roughness={0.7} />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

/** A distant, hazed landmark that gives the horizon real scale. */
function AssemblyBuilding() {
  return (
    <group position={[-620, GROUND_Y, -900]} rotation={[0, 0.25, 0]}>
      <mesh position={[0, 80, 0]} castShadow>
        <boxGeometry args={[190, 160, 150]} />
        <meshStandardMaterial color="#d3d6d4" roughness={0.9} />
      </mesh>
      <mesh position={[-130, 26, 20]}>
        <boxGeometry args={[100, 52, 110]} />
        <meshStandardMaterial color="#c3c7c5" roughness={0.9} />
      </mesh>
      <mesh position={[36, 70, 75.5]}>
        <boxGeometry args={[34, 140, 1]} />
        <meshStandardMaterial color="#8a9094" roughness={0.8} />
      </mesh>
      <mesh position={[-58, 126, 75.6]}>
        <boxGeometry args={[56, 34, 0.6]} />
        <meshStandardMaterial color="#27406b" roughness={0.7} />
      </mesh>
    </group>
  )
}

/** Everything on the ground: terrain, sea, pad, tower and surroundings. */
export function LaunchSite({ startedAt }: { startedAt: number | null }) {
  return (
    <group>
      <Terrain />
      <Ocean />
      <Scrub />
      <LaunchPad />
      <ServiceTower startedAt={startedAt} />
      <LightningMasts />
      <CryoFarm />
      <WaterTower />
      <SupportBuildings />
      <AssemblyBuilding />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  Cumulus layer                                                             */
/* -------------------------------------------------------------------------- */

export function CloudLayer({ spaceMix }: { spaceMix: { current: number } }) {
  const group = useMemo(() => {
    const texture = getCloudTexture()
    const root = new Group()
    const random = seeded(31)
    const horizon = new Color(HORIZON_COLOR)
    for (let index = 0; index < 46; index++) {
      const near = index < 9
      const angle = random() * Math.PI * 2
      const dist = near ? 330 + random() * 380 : 600 + random() * 2900
      const material = new SpriteMaterial({
        map: texture, transparent: true, opacity: 0, depthWrite: false, fog: false,
        color: new Color('#ffffff').lerp(horizon, smoothstep(700, 3600, dist) * 0.65),
      })
      const sprite = new Sprite(material)
      sprite.position.set(Math.cos(angle) * dist, (near ? 120 : 150) + random() * (near ? 150 : 260), Math.sin(angle) * dist)
      const width = (near ? 200 : 380) + random() * (near ? 220 : 640)
      sprite.scale.set(width, width * (0.3 + random() * 0.14), 1)
      sprite.userData = { base: 0.5 + random() * 0.35, speed: 1.2 + random() * 2.2 }
      root.add(sprite)
    }
    return root
  }, [])
  useEffect(() => () => {
    group.children.forEach((child) => (child as Sprite).material.dispose())
  }, [group])
  useFrame((_, delta) => {
    const fade = 1 - clamp01(spaceMix.current * 1.1)
    group.visible = fade > 0.01
    if (!group.visible) return
    for (const child of group.children) {
      const sprite = child as Sprite
      sprite.position.x += sprite.userData.speed * Math.min(delta, 0.05)
      if (sprite.position.x > 3600) sprite.position.x = -3600
      sprite.material.opacity = sprite.userData.base * fade
    }
  })
  return <primitive object={group} />
}

/* -------------------------------------------------------------------------- */
/*  Engine plume (shader based, with shock diamonds) + pad glare              */
/* -------------------------------------------------------------------------- */

const PLUME_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`
const PLUME_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uStrength;
  uniform float uExpand;
  uniform float uCore;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vView;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float vnoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  void main() {
    float t = 1.0 - vUv.y;
    float ang = vUv.x * 6.2831853;
    vec2 p = vec2(cos(ang) * 2.2 + sin(ang) * 1.1, t * 5.0 - uTime * 8.0 + sin(ang) * 2.2);
    float n = vnoise(p) * 0.65 + vnoise(p * 2.3 + 5.0) * 0.35;
    float fade = pow(1.0 - t, 1.35);
    float rim = pow(abs(dot(normalize(vNormal), normalize(vView))), 1.2);
    float diamonds = pow(abs(sin(t * 38.0 / (1.0 + uExpand * 0.6))), 8.0)
      * smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.35, 0.7, t)) / (1.0 + uExpand);
    float a = fade * (0.55 + 0.9 * n) * rim * uStrength;
    vec3 col = mix(uOuter, uInner, pow(1.0 - t, 2.0) * rim) * 1.7;
    col += vec3(1.0, 0.85, 0.6) * diamonds * 0.9 * rim * uCore;
    gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

function makePlumeMaterial(inner: string, outer: string, core: number) {
  return new ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uStrength: { value: 0 },
      uExpand: { value: 0 },
      uCore: { value: core },
      uInner: { value: new Color(inner) },
      uOuter: { value: new Color(outer) },
    },
    vertexShader: PLUME_VERTEX,
    fragmentShader: PLUME_FRAGMENT,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  })
}

export function RocketPlume({
  startedAt, phase, failed, liftoffTime, failureTime, ascentCompleteTime,
}: {
  startedAt: number | null
  phase: string
  failed: boolean
  liftoffTime: number
  failureTime: number
  ascentCompleteTime: number
}) {
  const wrapper = useRef<Group>(null)
  const plume = useRef<Group>(null)
  const glow = useRef<Sprite>(null)
  const engineLight = useRef<PointLight>(null)
  const padLight = useRef<PointLight>(null)
  const glowMap = useMemo(() => getGlowTexture(), [])
  const { geometry, outer, core } = useMemo(() => {
    const cone = new CylinderGeometry(1, 0.28, 1, 40, 14, true)
    cone.translate(0, -0.5, 0)
    return {
      geometry: cone,
      outer: makePlumeMaterial('#ffd9a0', '#ff7a1e', 0.35),
      core: makePlumeMaterial('#fff6e0', '#ffb25a', 1),
    }
  }, [])
  useEffect(() => () => { geometry.dispose(); outer.dispose(); core.dispose() }, [geometry, outer, core])

  useFrame(() => {
    const now = performance.now() / 1000
    const elapsed = startedAt === null ? 0 : Math.max(0, now - startedAt)
    const activePhase =
      phase === 'ignition' || phase === 'ascent' || phase === 'stage_separation' ||
      phase === 'fairing_separation' || phase === 'anomaly'
    const ramp = clamp01((elapsed - 2.35) / 1.55)
    const failureCutoff = failed ? Math.max(0, 1 - Math.max(0, elapsed - failureTime) / 0.55) : 1
    const strength = activePhase ? ramp * failureCutoff : 0
    const flicker = 1 + Math.sin(now * 47) * 0.045 + Math.sin(now * 83 + 1.3) * 0.035 + Math.sin(now * 131) * 0.02
    const progress = clamp01((elapsed - liftoffTime) / (ascentCompleteTime - liftoffTime))
    // The plume balloons as ambient pressure drops with altitude.
    const spread = 1 + Math.pow(progress, 1.2) * 2.2

    if (plume.current) {
      plume.current.visible = strength > 0.01
      plume.current.scale.set(spread, Math.max(0.01, strength * flicker * (1 + progress * 0.5)), spread)
    }
    for (const material of [outer, core]) {
      material.uniforms.uTime.value = now % 1000
      material.uniforms.uStrength.value = Math.min(1, strength)
      material.uniforms.uExpand.value = progress * 2.2
    }
    if (glow.current) {
      const size = 34 * spread * Math.max(0.01, strength) * flicker
      glow.current.scale.set(size, size, 1)
    }
    if (engineLight.current) engineLight.current.intensity = strength * 900 * flicker
    const parent = wrapper.current?.parent
    if (padLight.current && parent) {
      // Keep the glare light anchored near the pad while the rocket climbs away.
      const s = Math.max(0.01, parent.scale.y)
      padLight.current.position.set(0, (9 - parent.position.y) / s, 0)
      padLight.current.intensity = strength * 5200 * (1 - smoothstep(0, 230, parent.position.y)) * flicker
    }
  })

  return (
    <group ref={wrapper}>
      <group ref={plume} position={[0, -2, 0]}>
        <mesh geometry={geometry} material={outer} scale={[7.6, 74, 7.6]} frustumCulled={false} />
        <mesh geometry={geometry} material={core} scale={[3.4, 52, 3.4]} frustumCulled={false} />
        <sprite ref={glow} position={[0, -2, 0]} scale={[34, 34, 1]}>
          <spriteMaterial map={glowMap} color="#ffb870" blending={AdditiveBlending} transparent depthWrite={false} opacity={0.8} fog={false} />
        </sprite>
      </group>
      <pointLight ref={engineLight} position={[0, -5, 0]} color="#ffb46a" intensity={0} distance={140} decay={2} />
      <pointLight ref={padLight} color="#ff9a4a" intensity={0} distance={300} decay={2} />
    </group>
  )
}

/* -------------------------------------------------------------------------- */
/*  Failure: fireball, shockwave, tumbling debris, lingering pad fire         */
/* -------------------------------------------------------------------------- */

const GRAVITY = 16

export function FailureExplosion({ startedAt, cause, failureTime, originY }: {
  startedAt: number | null
  cause: 'overload' | 'reliability'
  failureTime: number
  originY: number
}) {
  const group = useRef<Group>(null)
  const sparks = useRef<InstancedMesh>(null)
  const smokePuffs = useRef<InstancedMesh>(null)
  const debris = useRef<InstancedMesh>(null)
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
  const state = useRef({ smoke: 0, fire: 0, burst: false })

  const sparkGeometry = useMemo(() => new SphereGeometry(1, 7, 6), [])
  const smokeGeometry = useMemo(() => new SphereGeometry(1, 10, 8), [])
  const debrisGeometry = useMemo(() => new BoxGeometry(1, 1, 1), [])
  const smokePuffMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#485052', transparent: true, opacity: 0, roughness: 1, depthWrite: false }),
    [],
  )
  const sparkMaterial = useMemo(() => new MeshBasicMaterial({ toneMapped: false }), [])
  const debrisMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#34383a', metalness: 0.6, roughness: 0.5, emissive: '#ff4a12', emissiveIntensity: 0 }),
    [],
  )
  const smokeEmitter = useMemo(() => new SpriteEmitter(260, getSmokeTexture(), false), [])
  const fireEmitter = useMemo(() => new SpriteEmitter(110, getGlowTexture(), true), [])
  const palette = useMemo(() => ({
    dustA: new Color('#cdbb9c'), dustB: new Color('#968b7c'),
    soot: new Color('#262626'), sootB: new Color('#4a4a4a'),
    flash: new Color('#fff0cf'), ember: new Color('#ff4a12'),
    flame: new Color('#ffb347'), red: new Color('#ff3d0a'),
  }), [])

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
  const pieces = useMemo(() => {
    const random = seeded(1717)
    const groundRel = -4.4 - originY
    return Array.from({ length: 38 }, () => {
      const angle = random() * Math.PI * 2
      const up = 0.15 + random() * 0.85
      const planar = Math.sqrt(1 - up * up)
      const speed = 12 + random() * 34
      const velocity = new Vector3(Math.cos(angle) * planar, up, Math.sin(angle) * planar).multiplyScalar(speed)
      const tHit = (velocity.y + Math.sqrt(velocity.y * velocity.y - 2 * GRAVITY * groundRel)) / GRAVITY
      return {
        velocity,
        tHit,
        spin: new Vector3((random() - 0.5) * 8, (random() - 0.5) * 8, (random() - 0.5) * 8),
        size: new Vector3(1 + random() * 3.5, 0.5 + random() * 2.5, 0.6 + random() * 2),
      }
    })
  }, [originY])

  useEffect(() => {
    const mesh = sparks.current
    if (!mesh) return
    sparkDirections.forEach((_, index) => {
      const hue = index % 3 === 0 ? '#fff1c2' : index % 3 === 1 ? '#ffb13b' : '#e45228'
      mesh.setColorAt(index, new Color(hue))
    })
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }, [sparkDirections])

  useEffect(() => () => {
    sparkGeometry.dispose(); smokeGeometry.dispose(); debrisGeometry.dispose()
    smokePuffMaterial.dispose(); sparkMaterial.dispose(); debrisMaterial.dispose()
    smokeEmitter.dispose(); fireEmitter.dispose()
  }, [sparkGeometry, smokeGeometry, debrisGeometry, smokePuffMaterial, sparkMaterial, debrisMaterial, smokeEmitter, fireEmitter])

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const spark = sparks.current
    const smoke = smokePuffs.current
    const chunks = debris.current
    if (!spark || !smoke || !chunks || !group.current) return
    const transform = dummy.current
    const elapsed = startedAt === null ? -1 : now - startedAt - failureTime
    const active = elapsed >= 0
    const blastProgress = active ? Math.min(1, elapsed / 0.58) : 0
    const smokeProgress = active ? Math.min(1, Math.max(0, elapsed - 0.12) / 2.8) : 0
    const smokeFade = active ? Math.max(0, 1 - Math.max(0, elapsed - 1) / 8) : 0
    const s = state.current

    /* one-time ground dust ring + fire burst */
    if (active && !s.burst) {
      s.burst = true
      for (let index = 0; index < 40; index++) {
        const angle = (index / 40) * Math.PI * 2 + Math.random() * 0.2
        const speed = 40 + Math.random() * 30
        smokeEmitter.emit(
          now, Math.cos(angle) * 8, -2.5, Math.sin(angle) * 8,
          Math.cos(angle) * speed, 2 + Math.random() * 4, Math.sin(angle) * speed,
          3.5 + Math.random() * 1.5, 14, 60 + Math.random() * 20, 0.55, palette.dustA, palette.dustB, 0.8, 0.6,
        )
      }
      for (let index = 0; index < 32; index++) {
        const angle = Math.random() * Math.PI * 2
        const lift = Math.random() * 2 - 0.6
        const speed = 20 + Math.random() * 22
        fireEmitter.emit(
          now, 0, originY - 5, 0,
          Math.cos(angle) * speed, lift * 18, Math.sin(angle) * speed,
          0.8 + Math.random() * 0.7, 20, 56, 0.8, palette.flash, palette.ember, 1.4,
        )
      }
    }
    /* lingering pad fire and sooty smoke column */
    if (active && elapsed > 0.3) {
      if (elapsed < 16) {
        s.smoke += dt * 24
        while (s.smoke >= 1) {
          s.smoke -= 1
          smokeEmitter.emit(
            now, (Math.random() - 0.5) * 14, -3 + Math.random() * 3, (Math.random() - 0.5) * 14,
            (Math.random() - 0.5) * 4, 6 + Math.random() * 6, (Math.random() - 0.5) * 4,
            7 + Math.random() * 3, 8, 46, 0.55, palette.soot, palette.sootB, 0.15, 0.4,
          )
        }
      }
      if (elapsed < 9) {
        s.fire += dt * 18
        while (s.fire >= 1) {
          s.fire -= 1
          fireEmitter.emit(
            now, (Math.random() - 0.5) * 12, Math.random() * 5, (Math.random() - 0.5) * 12,
            (Math.random() - 0.5) * 4, 3 + Math.random() * 5, (Math.random() - 0.5) * 4,
            1.1 + Math.random() * 0.8, 12, 4, 0.85, palette.flame, palette.red,
          )
        }
      }
    }
    smokeEmitter.update(now, dt)
    fireEmitter.update(now, dt)

    /* sparks */
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
      transform.rotation.set(0, 0, 0)
      transform.updateMatrix()
      spark.setMatrixAt(index, transform.matrix)
    }
    spark.instanceMatrix.needsUpdate = true

    /* heavy smoke puffs */
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
    smokePuffMaterial.opacity = active ? 0.72 * Math.min(1, elapsed / 0.35) * smokeFade : 0

    /* tumbling wreckage */
    for (let index = 0; index < pieces.length; index++) {
      const piece = pieces[index]
      if (!active) {
        transform.scale.setScalar(0)
      } else {
        const age = Math.min(elapsed, piece.tHit)
        transform.position.set(
          piece.velocity.x * age,
          piece.velocity.y * age - 0.5 * GRAVITY * age * age,
          piece.velocity.z * age,
        )
        transform.rotation.set(piece.spin.x * age, piece.spin.y * age, piece.spin.z * age)
        transform.scale.copy(piece.size)
      }
      transform.updateMatrix()
      chunks.setMatrixAt(index, transform.matrix)
    }
    chunks.instanceMatrix.needsUpdate = true
    debrisMaterial.emissiveIntensity = active ? Math.max(0, 2.2 * (1 - elapsed / 3)) : 0

    /* fireball, flash, ground shockwave */
    if (flashMaterial.current) flashMaterial.current.opacity = active ? Math.max(0, 0.96 * (1 - elapsed / 0.3)) : 0
    if (fireMaterial.current) fireMaterial.current.opacity = active ? Math.max(0, 0.96 * (1 - Math.max(0, elapsed - 0.12) / 2.5)) : 0
    if (innerFireMaterial.current) innerFireMaterial.current.opacity = active ? Math.max(0, 0.98 * (1 - elapsed / 1.15)) : 0
    if (shockwaveMaterial.current) shockwaveMaterial.current.opacity = active ? Math.max(0, 0.85 * (1 - elapsed / 1.15)) : 0
    if (flashMesh.current) {
      flashMesh.current.scale.setScalar(active ? 0.1 + Math.max(0, 1 - elapsed / 0.3) * 21 : 0)
    }
    if (fireball.current) {
      const size = active ? 0.1 + blastProgress * (cause === 'overload' ? 32 : 27) : 0
      fireball.current.scale.set(size, size * 0.92, size)
      fireball.current.position.y = active ? elapsed * 1.6 : 0
    }
    if (innerFireball.current) {
      const size = active ? 0.1 + blastProgress * (cause === 'overload' ? 21 : 18) : 0
      innerFireball.current.scale.set(size, size * 0.88, size)
      innerFireball.current.position.y = active ? elapsed * 1.6 : 0
    }
    if (shockwave.current) {
      shockwave.current.position.y = -originY + 1.5
      shockwave.current.scale.setScalar(active ? 0.1 + Math.min(1, elapsed / 1.05) * (cause === 'overload' ? 64 : 54) : 0)
    }
    if (explosionLight.current) {
      explosionLight.current.intensity = active ? Math.max(0, 12000 * (1 - elapsed / 0.85)) : 0
    }
  })

  return (
    <>
      <group ref={group} position={[0, originY, 0]}>
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
        <instancedMesh ref={smokePuffs} args={[smokeGeometry, smokePuffMaterial, smokeDirections.length]} frustumCulled={false} />
        <mesh ref={shockwave} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1, 0.12, 8, 64]} />
          <meshBasicMaterial ref={shockwaveMaterial} color="#ffb15d" transparent opacity={0} toneMapped={false} depthWrite={false} />
        </mesh>
        <instancedMesh ref={sparks} args={[sparkGeometry, sparkMaterial, sparkDirections.length]} frustumCulled={false} />
        <instancedMesh ref={debris} args={[debrisGeometry, debrisMaterial, pieces.length]} frustumCulled={false} castShadow />
        <pointLight ref={explosionLight} color="#ff7b32" distance={260} intensity={0} decay={2} />
      </group>
      <primitive object={smokeEmitter.group} />
      <primitive object={fireEmitter.group} />
    </>
  )
}
