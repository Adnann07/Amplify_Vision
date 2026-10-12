import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PCFShadowMap, PointLight, SphereGeometry, Vector3 } from 'three'
import type { LaunchRecord } from '../../data/launchVehicles'
import { LAUNCH_SEQUENCE_DURATION, sequenceElapsedAt, sequencePhaseAt, type SequencePhase } from './launchSequenceState'
import { NasaSlsRocket, ProceduralRocket } from './LaunchVehicleModels'
import { SpacecraftPayloadModel } from './SpacecraftPayloadModel'

const LIFTOFF_TIME = 4.1
const FAILURE_TIME = 6.35
const FAIRING_SEPARATION_TIME = 7
const SPACECRAFT_DEPLOYMENT_TIME = 8.1
const COMPLETE_TIME = LAUNCH_SEQUENCE_DURATION

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

function SmokePlume({ startedAt, active }: { startedAt: number; active: boolean }) {
  const meshRef = useRef<import('three').InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const geometry = useMemo(() => new SphereGeometry(1, 9, 7), [])
  const material = useMemo(() => new MeshStandardMaterial({
    color: '#78868c',
    roughness: 1,
    transparent: true,
    opacity: 0.055,
    depthWrite: false,
  }), [])
  const count = 32

  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const elapsed = performance.now() / 1000
    for (let index = 0; index < count; index++) {
      if (!active) {
        dummy.scale.setScalar(0.0001)
      } else {
        const ageSinceIgnition = elapsed - startedAt - 2.35 - index * 0.105
        const age = ageSinceIgnition < 0 ? -1 : ageSinceIgnition % 3.4
        const angle = index * 2.399963
        const radius = 0.8 + age * (1.3 + (index % 4) * 0.18)
        if (age < 0) {
          dummy.scale.setScalar(0.0001)
        } else {
          dummy.position.set(
            Math.cos(angle) * radius,
            3 + age * 6.2 + (index % 3) * 0.6,
            Math.sin(angle) * radius,
          )
          dummy.scale.setScalar(0.8 + age * 0.92)
        }
      }
      dummy.updateMatrix()
      mesh.setMatrixAt(index, dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={meshRef} args={[geometry, material, count]} />
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

function OrbitPlanet({ visible }: { visible: boolean }) {
  if (!visible) return null
  return (
    <group position={[116, 188, -230]}>
      <mesh>
        <sphereGeometry args={[56, 40, 32]} />
        <meshStandardMaterial color="#356888" roughness={0.84} metalness={0.05} />
      </mesh>
      <mesh position={[0, 43, 0]} scale={[1.25, 0.12, 1]}>
        <sphereGeometry args={[49, 24, 14]} />
        <meshStandardMaterial color="#9bb6bd" roughness={1} transparent opacity={0.82} />
      </mesh>
      <mesh position={[-46, 14, 2]}>
        <sphereGeometry args={[10, 18, 14]} />
        <meshStandardMaterial color="#b5c3c2" roughness={1} />
      </mesh>
    </group>
  )
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
    const elapsed = startedAt === null ? 0 : Math.max(0, performance.now() / 1000 - startedAt)
    const activePhase =
      phase === 'ignition' ||
      phase === 'ascent' ||
      phase === 'stage_separation' ||
      phase === 'fairing_separation' ||
      phase === 'anomaly'
    const ramp = Math.min(1, Math.max(0, (elapsed - 2.35) / 1.55))
    const failureCutoff = failed ? Math.max(0, 1 - Math.max(0, elapsed - FAILURE_TIME) / 0.55) : 1
    const strength = activePhase ? ramp * failureCutoff : 0
    if (group.current) {
      group.current.visible = strength > 0.01
      group.current.scale.set(1, Math.max(0.01, strength), 1)
    }
    if (light.current) light.current.intensity = strength * 58
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

function isLaunchFailureCause(record: LaunchRecord) {
  return record.failureParameter === 'Spacecraft mass' ? 'overload' : 'reliability'
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value))
}

function isSurfacePayload(record: LaunchRecord) {
  const type = record.spacecraftType.toLowerCase()
  return type.includes('rover') || type.includes('helicopter') || type.includes('lander')
}

function LaunchWorld({
  record,
  startedAt,
  phase,
  onAssetReady,
}: {
  record: LaunchRecord
  startedAt: number | null
  phase: SequencePhase
  onAssetReady: () => void
}) {
  const rocketRoot = useRef<Group>(null)
  const attachedPayload = useRef<Group>(null)
  const deployedPayload = useRef<Group>(null)
  const readyParts = useRef(new Set<string>())
  const { camera } = useThree()
  const position = useMemo(() => new Vector3(), [])
  const target = useMemo(() => new Vector3(), [])
  const launchFailed = record.outcome === 'failure'
  const failureCause = isLaunchFailureCause(record)
  const variant = record.launchVehicle.id === 'small-launcher'
    ? 'small'
    : record.launchVehicle.visualClass === 'heavy'
      ? 'heavy'
      : 'medium'
  const markReady = useCallback((part: 'vehicle' | 'payload') => {
    readyParts.current.add(part)
    if (readyParts.current.has('vehicle') && readyParts.current.has('payload')) onAssetReady()
  }, [onAssetReady])
  const markVehicleReady = useCallback(() => markReady('vehicle'), [markReady])
  const markPayloadReady = useCallback(() => markReady('payload'), [markReady])

  useFrame((_, delta) => {
    const elapsed = startedAt === null ? 0 : Math.max(0, performance.now() / 1000 - startedAt)
    const root = rocketRoot.current
    if (!root) return

    const liftoffProgress = clamp01((elapsed - LIFTOFF_TIME) / (COMPLETE_TIME - LIFTOFF_TIME))
    root.visible = true
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

    const attached = attachedPayload.current
    if (attached) {
      attached.visible =
        !launchFailed && elapsed >= FAIRING_SEPARATION_TIME + 0.18 && elapsed < SPACECRAFT_DEPLOYMENT_TIME
    }
    const payload = deployedPayload.current
    if (payload) {
      payload.visible = !launchFailed && elapsed >= SPACECRAFT_DEPLOYMENT_TIME
      if (payload.visible) {
        const separation = clamp01((elapsed - SPACECRAFT_DEPLOYMENT_TIME) / 2.2)
        const elapsedSinceDeploy = Math.max(0, elapsed - SPACECRAFT_DEPLOYMENT_TIME)
        payload.position.set(
          separation * 24 + (record.destination.toLowerCase().includes('earth') ? Math.sin(elapsedSinceDeploy * 0.35) * 5 : 0),
          root.position.y + 88 * root.scale.y + separation * (record.destination.toLowerCase().includes('earth') ? 4 : 15),
          0,
        )
        payload.rotation.z = Math.sin(elapsedSinceDeploy * 0.45) * 0.035
      }
    }

    const shakeStrength = elapsed >= 2.35 && elapsed < FAILURE_TIME
      ? 0.22 * Math.min(1, (elapsed - 2.35) / 1.4)
      : 0
    const followY = launchFailed ? 0 : Math.max(0, root.position.y + (payload?.visible ? 70 : 0))
    const orbitProgress = launchFailed ? 0 : liftoffProgress
    position.set(
      112 - orbitProgress * 76 + Math.sin(elapsed * 28) * shakeStrength,
      84 + followY + orbitProgress * 14 + Math.cos(elapsed * 24) * shakeStrength,
      175 - orbitProgress * 78,
    )
    camera.position.lerp(position, 1 - Math.exp(-delta * (elapsed > 3.8 ? 2.4 : 3.5)))
    target.set(payload?.visible ? payload.position.x : 0, (payload?.visible ? payload.position.y : root.position.y + 42) + 24, 0)
    camera.lookAt(target)
  })

  const smokeActive = phase === 'ignition' || phase === 'ascent' || phase === 'stage_separation' || phase === 'anomaly'
  const highAltitude = !launchFailed && (
    phase === 'spacecraft_deployment' ||
    phase === 'spacecraft_initialization' ||
    phase === 'mission_active' ||
    phase === 'complete'
  )
  const rocketModel = record.launchVehicle.model

  return (
    <>
      <color attach="background" args={[highAltitude ? '#16263a' : '#789bb0']} />
      <fog attach="fog" args={[highAltitude ? '#16263a' : '#789bb0', 190, highAltitude ? 650 : 430]} />
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#dceaf0', '#58625c', 1.1]} />
      <directionalLight
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
      <LaunchPad />
      <GroundPlane />
      <ServiceTower />
      <DistantTerrain />
      <SkyClouds />
      <OrbitPlanet visible={!launchFailed && highAltitude && record.destination.toLowerCase().includes('earth')} />

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
      </group>
      {launchFailed && startedAt !== null && <FailureExplosion startedAt={startedAt} cause={failureCause} />}
      <group position={[0, 0, 0]}>
        {startedAt !== null && <SmokePlume startedAt={startedAt} active={smokeActive} />}
      </group>
    </>
  )
}

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

function phaseLabel(phase: SequencePhase, failed: boolean) {
  const labels: Record<SequencePhase, string> = {
    loading: 'Preparing the pad',
    countdown3: '3',
    countdown2: '2',
    countdown1: '1',
    ignition: 'IGNITION',
    ascent: failed ? 'ASCENT ANOMALY' : 'LIFTOFF',
    stage_separation: 'STAGE SEPARATION',
    fairing_separation: 'PAYLOAD FAIRING SEPARATION',
    spacecraft_deployment: 'SPACECRAFT DEPLOYMENT',
    spacecraft_initialization: 'SPACECRAFT INITIALIZATION',
    mission_active: 'MISSION OPERATIONS STARTED',
    anomaly: failed ? 'LAUNCH ABORTED' : 'ASCENT ANOMALY',
    complete: failed ? 'LAUNCH FAILED' : 'SPACECRAFT DEPLOYED',
  }
  return labels[phase]
}

export function LaunchSequence({ record, onComplete }: { record: LaunchRecord; onComplete: () => void }) {
  const [phase, setPhase] = useState<SequencePhase>('loading')
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [muted, setMuted] = useState(true)
  const completionSent = useRef(false)
  const { progress } = useProgress()
  const failed = record.outcome === 'failure'
  const onAssetReady = useCallback(() => {
    setStartedAt((current) => current ?? performance.now() / 1000)
  }, [])

  useEffect(() => {
    if (startedAt === null) return
    const startedAtSeconds = startedAt
    const interval = window.setInterval(() => {
      const elapsed = Math.max(0, performance.now() / 1000 - startedAtSeconds)
      const nextPhase = sequencePhaseAt(elapsed, failed)
      setPhase((currentPhase) => {
        const currentAt = sequenceElapsedAt(currentPhase, failed)
        const nextAt = sequenceElapsedAt(nextPhase, failed)
        return nextAt < currentAt ? currentPhase : nextPhase
      })
      if (nextPhase === 'complete') {
        window.clearInterval(interval)
        if (!completionSent.current) {
          completionSent.current = true
          onComplete()
        }
      }
    }, 80)
    return () => window.clearInterval(interval)
  }, [failed, onComplete, startedAt])

  return (
    <div
      className={`relative isolate h-[480px] overflow-hidden rounded-2xl border ${
        failed ? 'border-rose-300/20' : 'border-sky-300/20'
      } bg-[#152b3d] shadow-[0_24px_90px_rgba(0,0,0,0.36)]`}
      role="img"
      aria-label={`${record.launchVehicle.name} real-time 3D launch sequence: ${phaseLabel(phase, failed)}`}
    >
      <Canvas
        frameloop={phase === 'complete' ? 'demand' : 'always'}
        camera={{ position: [112, 84, 175], fov: 38, near: 0.1, far: 1000 }}
        dpr={[1, 1.35]}
        gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
        onCreated={({ gl }) => {
          gl.shadowMap.enabled = true
          gl.shadowMap.type = PCFShadowMap
        }}
      >
        <LaunchWorld record={record} startedAt={startedAt} phase={phase} onAssetReady={onAssetReady} />
      </Canvas>

      <div className="pointer-events-none absolute inset-x-0 top-14 z-10 text-center" aria-live="polite">
        {phase !== 'loading' && phase !== 'complete' && (
          <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-slate-100/75">
            Flight director · {record.launchVehicle.name}
          </p>
        )}
        <p
          className={`mt-2 text-3xl font-black tracking-[0.18em] drop-shadow-[0_3px_12px_rgba(0,0,0,0.75)] sm:text-4xl ${
            phase === 'anomaly' ? 'text-rose-100' : phase === 'ignition' ? 'text-amber-100' : 'text-white'
          }`}
          >
            {phaseLabel(phase, failed)}
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
        <span className={`h-1.5 w-1.5 rounded-full ${phase === 'complete' ? (failed ? 'bg-rose-300' : 'bg-emerald-300') : 'bg-sky-300 animate-pulse'}`} />
        {phase === 'complete'
          ? failed ? 'Ascent aborted' : 'Deployment complete · mission assessment pending'
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

      {phase === 'complete' && (
        <div className={`absolute bottom-4 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-full border px-5 py-2 text-xs font-black tracking-[0.2em] shadow-xl backdrop-blur ${
          failed ? 'border-rose-200/50 bg-rose-950/90 text-rose-100' : 'border-emerald-200/50 bg-emerald-950/90 text-emerald-100'
        }`}>
          {failed ? 'LAUNCH FAILED' : 'SPACECRAFT DEPLOYED'}
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
          {phase === 'complete' && 'Launch and deployment completed. Overall mission success has not been assessed.'}
        </div>
      )}

      <SynthesizedLaunchAudio phase={phase} muted={muted} />
    </div>
  )
}
