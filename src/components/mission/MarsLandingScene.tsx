import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  BufferGeometry,
  Color,
  Euler,
  Fog,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
  LineBasicMaterial,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  Vector3,
} from 'three'
import type { RefObject } from 'react'
import type { SequencePhase } from './launchSequenceState'
import { MARS_SURFACE_OPERATIONS_TIME, ORBITAL_INSERTION_TIME } from './launchSequenceState'
import { clamp01, lerp, smoothstep } from './proceduralMath'

interface MarsLandingSceneProps {
  spacecraftId: string
  destinationCenter: Vector3
  destinationRadius: number
  startedAt: number | null
  phase: SequencePhase
  payloadRef: RefObject<Group | null>
  modelRef: RefObject<Group | null>
  extrasRef: RefObject<Group | null>
  planetRef: RefObject<Group | null>
  skyRef: RefObject<Group | null>
  cloudsRef: RefObject<Group | null>
  earthRef: RefObject<Group | null>
  groundRef: RefObject<Group | null>
}

const ENTRY_BLEND = 0.12
const TOUCHDOWN_PROGRESS = 0.88
const TRACK_POINT_COUNT = 70

function terrainHeight(x: number, z: number) {
  return Math.sin(x * 0.052) * 1.1 + Math.cos(z * 0.043) * 0.8 +
    Math.sin((x + z) * 0.09) * 0.32
}

function makeTerrain() {
  const geometry = new PlaneGeometry(420, 420, 112, 112)
  const positions = geometry.getAttribute('position')
  const colors: number[] = []
  const low = new Color('#754437')
  const high = new Color('#ba7556')
  const color = new Color()
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index)
    const z = -positions.getY(index)
    const height = terrainHeight(x, z)
    positions.setZ(index, height)
    color.copy(low).lerp(high, clamp01(0.38 + height * 0.16))
    colors.push(color.r, color.g, color.b)
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3))
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

function makeTrackGeometry() {
  const positions = new Float32Array(TRACK_POINT_COUNT * 3)
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setDrawRange(0, 0)
  return geometry
}

function makeRidge(seed: number) {
  const positions: number[] = []
  const indices: number[] = []
  const count = 60
  for (let index = 0; index <= count; index += 1) {
    const x = -270 + index * 9
    const wave = Math.sin(index * 0.27 + seed) * 13 +
      Math.sin(index * 0.071 + seed * 2) * 23
    positions.push(x, -28, -210, x, wave + 4, -210)
    if (index < count) {
      const base = index * 2
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  return geometry
}

function RoverTracks({ refLine }: { refLine: RefObject<Line | null> }) {
  const geometry = useMemo(() => makeTrackGeometry(), [])
  const line = useMemo(
    () => new Line(geometry, new LineBasicMaterial({ color: '#3f2926', transparent: true, opacity: 0.55 })),
    [geometry],
  )
  return <primitive object={line} ref={refLine} />
}

export function MarsLandingScene({
  spacecraftId,
  destinationCenter,
  destinationRadius,
  startedAt,
  phase,
  payloadRef,
  modelRef,
  extrasRef,
  planetRef,
  skyRef,
  cloudsRef,
  earthRef,
  groundRef,
}: MarsLandingSceneProps) {
  const { camera, scene } = useThree()
  const world = useRef<Group>(null)
  const surface = useRef<Group>(null)
  const entryCapsule = useRef<Group>(null)
  const surfaceCraft = useRef<Group>(null)
  const proxyRotorLower = useRef<Group>(null)
  const proxyRotorUpper = useRef<Group>(null)
  const parachute = useRef<Group>(null)
  const heatShield = useRef<Group>(null)
  const skyCrane = useRef<Group>(null)
  const descentFlame = useRef<Mesh>(null)
  const trackLeft = useRef<Line>(null)
  const trackRight = useRef<Line>(null)
  const ingFirstRotor = useRef<Object3D | null>(null)
  const ingSecondRotor = useRef<Object3D | null>(null)
  const dustPuffs = useRef<Group>(null)
  const terrain = useMemo(() => makeTerrain(), [])
  const ridges = useMemo(() => [makeRidge(1), makeRidge(4)], [])
  const rockTransforms = useMemo(() => {
    const transforms: Matrix4[] = []
    for (let index = 0; index < 110; index += 1) {
      const angle = index * 2.399
      const distance = 18 + ((index * 37) % 170)
      const x = Math.cos(angle) * distance
      const z = Math.sin(angle) * distance
      const scale = 0.55 + ((index * 17) % 100) / 100 * 1.9
      const matrix = new Matrix4()
      const position = new Vector3(x, terrainHeight(x, z) - 0.1, z)
      matrix.compose(position, new Quaternion().setFromEuler(new Euler(angle * 0.6, angle, angle * 0.4)), new Vector3(scale * 1.1, scale * 0.6, scale))
      transforms.push(matrix)
    }
    return transforms
  }, [])
  const rocks = useRef<InstancedMesh>(null)
  const hazeColor = useMemo(() => new Color('#bd755b'), [])
  const groundMaterial = useMemo(
    () => new MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
    [],
  )
  const rockGeometry = useMemo(() => new SphereGeometry(1, 7, 5), [])
  const rockMaterial = useMemo(
    () => new MeshStandardMaterial({ color: '#704638', roughness: 1, flatShading: true }),
    [],
  )
  const landingActive = phase === 'surface_landing' || phase === 'surface_operations'
  const localLanding = landingActive && startedAt !== null

  useEffect(() => {
    if (rocks.current) {
      rockTransforms.forEach((matrix, index) => rocks.current?.setMatrixAt(index, matrix))
      rocks.current.instanceMatrix.needsUpdate = true
    }
  }, [rockTransforms])

  useFrame((_, delta) => {
    const payload = payloadRef.current
    const model = modelRef.current
    const root = world.current
    if (!root || !localLanding || startedAt === null) return

    const elapsed = Math.max(0, performance.now() / 1000 - startedAt)
    const progress = clamp01(
      (elapsed - ORBITAL_INSERTION_TIME) /
        (MARS_SURFACE_OPERATIONS_TIME - ORBITAL_INSERTION_TIME),
    )
    const localProgress = clamp01((progress - ENTRY_BLEND) / (1 - ENTRY_BLEND))
    const descent = smoothstep(0.08, 0.88, localProgress)
    const surfaceScale = Math.max(0.8, Math.min(2.4, destinationRadius / 31))

    root.position.copy(destinationCenter)
    root.scale.setScalar(surfaceScale)
    root.visible = true
    if (surface.current) surface.current.visible = progress >= ENTRY_BLEND
    if (entryCapsule.current) {
      entryCapsule.current.visible = progress < ENTRY_BLEND
      if (payload) {
        entryCapsule.current.position.copy(payload.position).sub(destinationCenter)
        entryCapsule.current.lookAt(destinationCenter)
      }
    }

    if (progress < ENTRY_BLEND) {
      if (payload) payload.visible = true
      if (model) model.visible = false
      if (extrasRef.current) extrasRef.current.visible = false
      if (parachute.current) parachute.current.visible = false
      if (heatShield.current) heatShield.current.visible = false
      if (skyCrane.current) skyCrane.current.visible = false
      return
    }

    if (payload) payload.visible = true
    const hasRenderableModel = Boolean(model?.getObjectByProperty('isMesh', true))
    if (model) model.visible = hasRenderableModel
    if (surfaceCraft.current) surfaceCraft.current.visible = !hasRenderableModel
    if (extrasRef.current) extrasRef.current.visible = false
    if (planetRef.current) planetRef.current.visible = false
    if (skyRef.current) skyRef.current.visible = false
    if (cloudsRef.current) cloudsRef.current.visible = false
    if (earthRef.current) earthRef.current.visible = false
    if (groundRef.current) groundRef.current.visible = false
    if (scene.background instanceof Color) scene.background.copy(hazeColor)
    if (scene.fog instanceof Fog) {
      scene.fog.color.copy(hazeColor)
      scene.fog.near = 90
      scene.fog.far = 540
    }

    const perspective = camera as PerspectiveCamera
    perspective.fov = 42
    perspective.near = 0.1
    perspective.far = 4000
    perspective.updateProjectionMatrix()

    const roverRoute = Math.max(0, (elapsed - MARS_SURFACE_OPERATIONS_TIME) * 1.35)
    let x = 0
    let z = 0
    let y = terrainHeight(0, 0) + 4.2

    if (spacecraftId === 'perseverance') {
      const driveDistance = Math.min(58, roverRoute)
      x = Math.sin(driveDistance * 0.018) * 13
      z = -driveDistance
      y = terrainHeight(x, z) + 4.2
      if (model) model.rotation.set(0, Math.sin(driveDistance * 0.018) * 0.3, 0)
      updateTracks(trackLeft.current, -2.1, driveDistance, x, z)
      updateTracks(trackRight.current, 2.1, driveDistance, x, z)
    } else {
      const flightTime = Math.max(0, elapsed - MARS_SURFACE_OPERATIONS_TIME - 2)
      const flightBlend = smoothstep(0, 1.5, flightTime)
      const flightX = Math.sin(flightTime * 0.45) * 13
      const flightZ = -12 - Math.cos(flightTime * 0.3) * 9
      x = lerp(0, flightX, flightBlend)
      z = lerp(0, flightZ, flightBlend)
      y = terrainHeight(x, z) + lerp(4.2, 9 + Math.sin(flightTime * 2) * 1.1, flightBlend)
      if (model) model.rotation.set(Math.sin(flightTime * 0.8) * 0.06, Math.sin(flightTime * 0.45) * 0.22, 0)
      if (payload && !ingFirstRotor.current) {
        ingFirstRotor.current = payload.getObjectByName('rotors_01') ?? null
      }
      if (payload && !ingSecondRotor.current) {
        ingSecondRotor.current = payload.getObjectByName('rotors_02') ?? null
      }
      if (ingFirstRotor.current) ingFirstRotor.current.rotation.y += delta * 42
      if (ingSecondRotor.current) ingSecondRotor.current.rotation.y -= delta * 42
    }

    const touchdownY = terrainHeight(x, z) + 4.2
    const stackY = lerp(118, touchdownY, descent)
    const lowerBody = smoothstep(TOUCHDOWN_PROGRESS - 0.035, TOUCHDOWN_PROGRESS + 0.015, localProgress)
    const hoverHeight = spacecraftId === 'ingenuity' && phase === 'surface_operations'
      ? y
      : lerp(stackY, y, lowerBody)
    const heading = model?.rotation.y ?? 0
    if (payload) {
      payload.position.set(
        destinationCenter.x + x * surfaceScale,
        destinationCenter.y + hoverHeight * surfaceScale,
        destinationCenter.z + z * surfaceScale,
      )
      payload.scale.setScalar(surfaceScale)
      payload.rotation.set(0, heading, 0)
    }
    if (model) model.position.set(0, hoverHeight - 4.2, 0)
    if (surfaceCraft.current) {
      surfaceCraft.current.position.set(x, terrainHeight(x, z), z)
      surfaceCraft.current.rotation.set(0, heading, 0)
    }
    if (proxyRotorLower.current) proxyRotorLower.current.rotation.y += delta * 42
    if (proxyRotorUpper.current) proxyRotorUpper.current.rotation.y -= delta * 42

    if (parachute.current) {
      parachute.current.visible = localProgress > 0.03 && localProgress < 0.55
      parachute.current.position.set(0, lerp(145, 74, descent), -5)
      parachute.current.scale.setScalar(0.7 + smoothstep(0.03, 0.11, localProgress) * 0.65)
    }
    if (heatShield.current) {
      heatShield.current.visible = localProgress > 0.18 && localProgress < 0.48
      heatShield.current.position.set(0, lerp(4, 37, smoothstep(0.18, 0.48, localProgress)), 5)
      heatShield.current.rotation.x += delta * 0.12
    }
    if (skyCrane.current) {
      skyCrane.current.visible = spacecraftId === 'perseverance' &&
        localProgress > 0.56 && localProgress < 0.92
      skyCrane.current.position.set(0, stackY + 15, 0)
    }
    if (descentFlame.current) {
      descentFlame.current.visible = localProgress > 0.56 && localProgress < 0.91
      descentFlame.current.scale.y = 0.85 + Math.sin(elapsed * 26) * 0.16
    }
    if (dustPuffs.current) {
      dustPuffs.current.visible = localProgress > 0.84 || phase === 'surface_operations'
      dustPuffs.current.children.forEach((puff, index) => {
        const mesh = puff as Mesh
        const cycle = (elapsed * 0.42 + index * 0.19) % 1
        const spread = 5 + cycle * 20
        mesh.position.set(Math.cos(index * 2.4) * spread, cycle * 3, Math.sin(index * 2.4) * spread)
        mesh.scale.setScalar((1 - cycle) * (localProgress > 0.84 ? 1.1 : 0.22))
        const material = mesh.material as MeshBasicMaterial
        material.opacity = (1 - cycle) * 0.28
      })
    }

    const localCameraTarget = new Vector3(x, hoverHeight + 1.5, z)
    const cameraOffset = spacecraftId === 'perseverance'
      ? new Vector3(28, 23, 42)
      : new Vector3(24, 20, 36)
    const targetCamera = new Vector3(
      destinationCenter.x + (x + cameraOffset.x) * surfaceScale,
      destinationCenter.y + (hoverHeight + cameraOffset.y) * surfaceScale,
      destinationCenter.z + (z + cameraOffset.z) * surfaceScale,
    )
    camera.position.lerp(targetCamera, 1 - Math.exp(-delta * 2.4))
    camera.lookAt(
      destinationCenter.x + localCameraTarget.x * surfaceScale,
      destinationCenter.y + localCameraTarget.y * surfaceScale,
      destinationCenter.z + localCameraTarget.z * surfaceScale,
    )
    if (scene.fog instanceof Fog) scene.fog.far = 540 + Math.sin(elapsed * 0.15) * 12
  })

  return (
    <group ref={world} visible={landingActive}>
      <group ref={surface} visible={landingActive}>
        <mesh geometry={terrain} receiveShadow material={groundMaterial} />
        <group position={[0, 0, -210]}>
        <mesh geometry={ridges[0]}>
          <meshStandardMaterial color="#8d5141" roughness={1} />
        </mesh>
        <mesh geometry={ridges[1]} position={[0, 5, -50]}>
          <meshStandardMaterial color="#a35e48" roughness={1} />
        </mesh>
      </group>
      <instancedMesh ref={rocks} args={[rockGeometry, rockMaterial, rockTransforms.length]} castShadow receiveShadow />
      </group>
      <group ref={entryCapsule} visible={false}>
        <mesh>
          <capsuleGeometry args={[1.8, 3.5, 5, 12]} />
          <meshStandardMaterial color="#d3d0c8" metalness={0.46} roughness={0.42} />
        </mesh>
        <mesh position={[0, -1.6, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <circleGeometry args={[2, 20]} />
          <meshStandardMaterial color="#b94e31" roughness={0.65} />
        </mesh>
      </group>
      <group ref={surfaceCraft} visible={false}>
        {spacecraftId === 'perseverance' ? (
          <group>
            <mesh position={[0, 2.5, 0]} castShadow>
              <boxGeometry args={[4.8, 1.35, 5.6]} />
              <meshStandardMaterial color="#c6c5ba" metalness={0.32} roughness={0.62} />
            </mesh>
            <mesh position={[0, 3.45, -0.7]} castShadow>
              <boxGeometry args={[2.8, 0.35, 2.5]} />
              <meshStandardMaterial color="#d6c582" metalness={0.3} roughness={0.58} />
            </mesh>
            <mesh position={[0, 5.1, -1.35]} castShadow>
              <boxGeometry args={[0.55, 2.1, 0.55]} />
              <meshStandardMaterial color="#8d9491" metalness={0.5} roughness={0.4} />
            </mesh>
            <mesh position={[0, 6.25, -1.35]} castShadow>
              <boxGeometry args={[2.25, 0.9, 1.15]} />
              <meshStandardMaterial color="#c6c7bd" metalness={0.42} roughness={0.45} />
            </mesh>
            {[-1, 1].flatMap((side) => [-2, 0, 2].map((axle) => (
              <mesh key={`${side}-${axle}`} position={[side * 2.7, 1.15, axle]} rotation={[0, 0, Math.PI / 2]} castShadow>
                <cylinderGeometry args={[0.92, 0.92, 0.6, 12]} />
                <meshStandardMaterial color="#343b3b" roughness={0.92} />
              </mesh>
            )))}
          </group>
        ) : (
          <group>
            <mesh position={[0, 2.3, 0]} castShadow>
              <boxGeometry args={[2.3, 1.5, 2.3]} />
              <meshStandardMaterial color="#d5c995" metalness={0.36} roughness={0.52} />
            </mesh>
            {[-1, 1].flatMap((side) => [-1, 1].map((front) => (
              <mesh key={`${side}-${front}`} position={[side * 1.2, 1.1, front * 1.2]} rotation={[0, 0, side * 0.13]}>
                <cylinderGeometry args={[0.08, 0.08, 2.5, 6]} />
                <meshStandardMaterial color="#9b9685" metalness={0.28} roughness={0.62} />
              </mesh>
            )))}
            <group ref={proxyRotorLower} position={[0, 3.6, 0]}>
              <mesh>
                <boxGeometry args={[10, 0.12, 0.28]} />
                <meshStandardMaterial color="#ded2ae" metalness={0.5} roughness={0.42} />
              </mesh>
            </group>
            <group ref={proxyRotorUpper} position={[0, 4, 0]}>
              <mesh>
                <boxGeometry args={[0.28, 0.12, 10]} />
                <meshStandardMaterial color="#ded2ae" metalness={0.5} roughness={0.42} />
              </mesh>
            </group>
          </group>
        )}
      </group>
      <group ref={parachute} visible={false}>
        <mesh position={[0, 9, 0]} rotation={[Math.PI, 0, 0]}>
          <sphereGeometry args={[10, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#eee1cd" side={2} roughness={0.8} />
        </mesh>
        <mesh position={[0, 3.5, 0]}>
          <cylinderGeometry args={[0.09, 0.09, 8.8, 6]} />
          <meshStandardMaterial color="#dacdbb" />
        </mesh>
      </group>
      <group ref={heatShield} visible={false}>
        <mesh rotation={[Math.PI, 0, 0]}>
          <coneGeometry args={[5.7, 2.6, 16]} />
          <meshStandardMaterial color="#a9472e" metalness={0.28} roughness={0.58} />
        </mesh>
      </group>
      <group ref={skyCrane} visible={false}>
        <mesh position={[0, 5, 0]}>
          <boxGeometry args={[7, 2.2, 5]} />
          <meshStandardMaterial color="#d5d9d7" metalness={0.45} roughness={0.4} />
        </mesh>
        {[-1, 1].map((side) => (
          <mesh key={side} position={[side * 4.8, 3.5, 0]}>
            <cylinderGeometry args={[0.12, 0.12, 8, 6]} />
            <meshStandardMaterial color="#b7a58e" />
          </mesh>
        ))}
      </group>
      <mesh ref={descentFlame} position={[0, 5, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
        <coneGeometry args={[3.6, 12, 12]} />
        <meshBasicMaterial color="#ffbb58" transparent opacity={0.72} />
      </mesh>
      <group>
        <RoverTracks refLine={trackLeft} />
        <RoverTracks refLine={trackRight} />
      </group>
      <group ref={dustPuffs} visible={false}>
        {Array.from({ length: 9 }, (_, index) => (
          <mesh key={index}>
            <sphereGeometry args={[1.7, 8, 6]} />
            <meshBasicMaterial color="#df9b73" transparent opacity={0.24} depthWrite={false} />
          </mesh>
        ))}
      </group>
      <ambientLight intensity={1.15} color="#f2c1a2" />
      <directionalLight position={[-85, 125, 45]} intensity={2.15} color="#ffe0bf" castShadow />
    </group>
  )
}

function updateTracks(line: Line | null, offset: number, distance: number, roverX: number, roverZ: number) {
  if (!line) return
  const positions = line.geometry.getAttribute('position')
  for (let index = 0; index < TRACK_POINT_COUNT; index += 1) {
    const t = index / (TRACK_POINT_COUNT - 1)
    const z = roverZ + distance * t
    const x = roverX * (1 - t) + Math.sin((distance * (1 - t)) * 0.018) * 13 + offset
    positions.setXYZ(index, x, terrainHeight(x, z) + 0.035, z)
  }
  positions.needsUpdate = true
  line.geometry.setDrawRange(0, Math.max(0, Math.min(TRACK_POINT_COUNT, Math.floor(distance * 1.4))))
}
