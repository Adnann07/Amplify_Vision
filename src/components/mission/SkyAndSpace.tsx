import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SpriteMaterial,
  Vector3,
} from 'three'
import { getGlowTexture } from './launchParticles'
import { HORIZON_COLOR, SKY_RADIUS, SUN_DIRECTION, ZENITH_COLOR } from './launchConstants'
import { seeded, smoothstep } from './proceduralMath'

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
/**
 * Cheap atmospheric scattering look: deep zenith, a thick bright haze band at
 * the horizon, a tight sun disc with a wide aureole, and a warm Mie glow that
 * hugs the horizon on the sun's side.
 */
const DOME_FRAGMENT = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uZenith;
  uniform vec3 uSun;
  uniform float uMix;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y, 0.0, 1.0);
    vec3 col = mix(uHorizon, uZenith, pow(h, 0.42));
    float haze = exp(-h * 6.5);
    col = mix(col, uHorizon * 1.06, haze * 0.5);
    float s = max(dot(d, uSun), 0.0);
    vec3 sunCol = vec3(1.0, 0.86, 0.65);
    col += sunCol * (pow(s, 1600.0) * 6.0 + pow(s, 90.0) * 0.5 + pow(s, 9.0) * 0.18);
    col += vec3(1.0, 0.72, 0.46) * pow(s, 3.0) * haze * 0.14;
    col *= 1.0 - uMix * 0.5;
    gl_FragColor = vec4(col, 1.0 - uMix);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export function SkyBackdrop({ spaceMix }: { spaceMix: { current: number } }) {
  const group = useRef<Group>(null)
  const dome = useRef<Mesh>(null)
  const sunHalo = useRef<SpriteMaterial>(null)
  const sunCore = useRef<SpriteMaterial>(null)
  const { camera } = useThree()
  const glow = useMemo(() => getGlowTexture(), [])

  const domeMaterial = useMemo(() => new ShaderMaterial({
    uniforms: {
      uHorizon: { value: new Color(HORIZON_COLOR) },
      uZenith: { value: new Color(ZENITH_COLOR) },
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
export function SpaceDust({
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
