import { Html, OrbitControls, Stars, useGLTF } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  Box3,
  CanvasTexture,
  Group,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import {
  interpolateJunoPosition,
  JUPITER_EQUATORIAL_RADIUS_KM,
  type JunoTrajectory,
  type JunoTrajectoryPosition,
} from '../../data/junoTrajectory'

interface JunoOrbitalSceneProps {
  trajectory: JunoTrajectory
  simulationStartTimeMs: number
  playing: boolean
  speed: number
  resetKey: number
  onTelemetry: (simulationTimeMs: number, position: JunoTrajectoryPosition, ended: boolean) => void
}

const JUPITER_VISUAL_RADIUS = 1.2
const MAX_ORBIT_VISUAL_RADIUS = 1.1 + Math.log(8_000_000 / JUPITER_EQUATORIAL_RADIUS_KM) * 1.1
const MODEL_PATH = `${import.meta.env.BASE_URL}models/juno/JunoB.glb`

function createOrbitFrame(
  first: JunoTrajectoryPosition,
  next: JunoTrajectoryPosition,
) {
  const radius = new Vector3(first.xKm, first.yKm, first.zKm)
  const direction = new Vector3(next.xKm, next.yKm, next.zKm).sub(radius)
  const normal = radius.clone().cross(direction)
  if (normal.lengthSq() < 1e-12) normal.set(0, 1, 0)
  return new Quaternion().setFromUnitVectors(normal.normalize(), new Vector3(0, 0, 1))
}

function toVisualPosition(position: JunoTrajectoryPosition) {
  const direction = new Vector3(position.xKm, position.yKm, position.zKm)
  const radius = Math.max(position.distanceKm, JUPITER_EQUATORIAL_RADIUS_KM)
  const visualRadius = JUPITER_VISUAL_RADIUS + Math.log(radius / JUPITER_EQUATORIAL_RADIUS_KM) * 1.1
  return direction.normalize().multiplyScalar(visualRadius)
}

function makeJupiterTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 512
  const context = canvas.getContext('2d')
  if (!context) return null

  const gradient = context.createLinearGradient(0, 0, 0, canvas.height)
  gradient.addColorStop(0, '#8f6650')
  gradient.addColorStop(0.18, '#e0bd91')
  gradient.addColorStop(0.38, '#ac795b')
  gradient.addColorStop(0.56, '#e7cfaa')
  gradient.addColorStop(0.75, '#98664e')
  gradient.addColorStop(1, '#d6b18a')
  context.fillStyle = gradient
  context.fillRect(0, 0, canvas.width, canvas.height)

  const bands = [
    [35, 24, '#f0d7ae'],
    [88, 17, '#765443'],
    [138, 30, '#d5ad83'],
    [207, 20, '#795848'],
    [265, 26, '#f0d8b5'],
    [327, 19, '#9a6b50'],
    [386, 31, '#e5c69e'],
    [455, 21, '#745240'],
  ] as const
  for (const [y, height, color] of bands) {
    context.globalAlpha = 0.42
    context.fillStyle = color
    context.fillRect(0, y, canvas.width, height)
  }

  context.globalAlpha = 0.9
  context.fillStyle = '#a64e37'
  context.beginPath()
  context.ellipse(680, 310, 76, 34, -0.12, 0, Math.PI * 2)
  context.fill()
  context.strokeStyle = '#f0c8a2'
  context.lineWidth = 8
  context.stroke()
  context.globalAlpha = 1

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function Jupiter() {
  const texture = useMemo(() => makeJupiterTexture(), [])
  const group = useRef<Group>(null)

  useEffect(() => () => texture?.dispose(), [texture])
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.025
  })

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[JUPITER_VISUAL_RADIUS, 64, 48]} />
        <meshStandardMaterial map={texture ?? undefined} roughness={0.96} />
      </mesh>
      <mesh>
        <sphereGeometry args={[JUPITER_VISUAL_RADIUS * 1.09, 48, 32]} />
        <meshBasicMaterial color="#e9a66d" transparent opacity={0.055} depthWrite={false} />
      </mesh>
    </group>
  )
}

function JunoSpacecraft({
  trajectory,
  simulationStartTimeMs,
  playing,
  speed,
  resetKey,
  onTelemetry,
}: JunoOrbitalSceneProps) {
  const { scene } = useGLTF(MODEL_PATH, `${import.meta.env.BASE_URL}draco/`)
  const spacecraft = useRef<Group>(null)
  const model = useMemo(() => {
    const clone = scene.clone(true)
    clone.updateWorldMatrix(true, true)
    const dimensions = new Vector3()
    const center = new Vector3()
    const bounds = new Box3().setFromObject(clone)
    bounds.getSize(dimensions)
    bounds.getCenter(center)
    const scale = 0.85 / Math.max(dimensions.x, dimensions.y, dimensions.z, 0.001)
    clone.scale.setScalar(scale)
    clone.position.set(-center.x * scale, -center.y * scale, -center.z * scale)
    return clone
  }, [scene])
  const simulationTime = useRef(simulationStartTimeMs)
  const telemetryTimer = useRef(0)
  const endReported = useRef(false)

  useEffect(() => {
    simulationTime.current = simulationStartTimeMs
    telemetryTimer.current = 0
    endReported.current = false
  }, [resetKey, simulationStartTimeMs])

  useFrame((state, delta) => {
    if (playing) simulationTime.current += delta * 1000 * speed
    const elapsedSeconds = Math.max(0, (simulationTime.current - simulationStartTimeMs) / 1000)
    const lastSample = trajectory.samples[trajectory.samples.length - 1]
    const ended = !trajectory.periodSeconds && elapsedSeconds >= lastSample.elapsedSeconds
    const currentElapsed = ended ? lastSample.elapsedSeconds : elapsedSeconds
    const currentPosition = interpolateJunoPosition(trajectory, currentElapsed)
    const nextPosition = interpolateJunoPosition(
      trajectory,
      currentElapsed + Math.min(120, lastSample.elapsedSeconds / Math.max(1, trajectory.samples.length)),
    )
    const visualPosition = toVisualPosition(currentPosition)
    const nextVisualPosition = toVisualPosition(nextPosition)

    if (spacecraft.current) {
      spacecraft.current.position.copy(visualPosition)
      if (visualPosition.distanceToSquared(nextVisualPosition) > 0.000001) {
        spacecraft.current.lookAt(nextVisualPosition)
      }
    }

    if (
      (playing && state.clock.elapsedTime - telemetryTimer.current >= 0.2) ||
      (ended && !endReported.current)
    ) {
      telemetryTimer.current = state.clock.elapsedTime
      onTelemetry(
        simulationStartTimeMs + currentElapsed * 1000,
        currentPosition,
        ended && !endReported.current,
      )
      if (ended) endReported.current = true
    }
  })

  return (
    <group ref={spacecraft}>
      <primitive object={model} />
      <mesh>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.72} />
      </mesh>
      <pointLight color="#67e8f9" intensity={2} distance={1.4} />
      <Html position={[0, 0.72, 0]} center zIndexRange={[10, 0]}>
        <span className="border border-cyan-200/40 bg-slate-950/90 px-1.5 py-1 text-[9px] font-bold tracking-[0.15em] text-cyan-100">
          JUNO
        </span>
      </Html>
    </group>
  )
}

function JunoTrajectoryWorld({
  cameraTarget,
  ...props
}: JunoOrbitalSceneProps & { cameraTarget: [number, number, number] }) {
  const firstSample = props.trajectory.samples[0]
  const nextSample = props.trajectory.samples[Math.min(1, props.trajectory.samples.length - 1)]
  const orbitFrame = useMemo(
    () => createOrbitFrame(firstSample, nextSample),
    [firstSample, nextSample],
  )

  return (
    <>
      <color attach="background" args={['#030912']} />
      <ambientLight intensity={0.65} />
      <pointLight position={[5, 3, 7]} color="#ffd29b" intensity={65} distance={35} decay={1.7} />
      <directionalLight position={[-8, 9, 6]} intensity={1.5} color="#b9d9ff" />
      <Stars radius={80} depth={55} count={1500} factor={2.4} fade speed={0.18} />
      <group quaternion={orbitFrame}>
        <Jupiter />
        <JunoSpacecraft {...props} />
      </group>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={3.2}
        maxDistance={65}
        target={cameraTarget}
        rotateSpeed={0.55}
        zoomSpeed={1}
      />
    </>
  )
}

export function JunoOrbitalScene(props: JunoOrbitalSceneProps) {
  const firstSample = props.trajectory.samples[0]
  const nextSample = props.trajectory.samples[Math.min(1, props.trajectory.samples.length - 1)]
  const cameraView = useMemo(() => {
    const initialSpacecraftPosition = toVisualPosition(firstSample)
      .applyQuaternion(createOrbitFrame(firstSample, nextSample))
    const target = initialSpacecraftPosition.multiplyScalar(0.48)
    const cameraPosition = target.clone().add(
      new Vector3(0, MAX_ORBIT_VISUAL_RADIUS * 0.28, MAX_ORBIT_VISUAL_RADIUS * 0.9),
    )
    return {
      target: [target.x, target.y, target.z] as [number, number, number],
      position: [cameraPosition.x, cameraPosition.y, cameraPosition.z] as [number, number, number],
    }
  }, [firstSample, nextSample])

  return (
    <Canvas
      camera={{
        position: cameraView.position,
        fov: 47,
        near: 0.1,
        far: 140,
      }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
    >
      <JunoTrajectoryWorld {...props} cameraTarget={cameraView.target} />
    </Canvas>
  )
}
