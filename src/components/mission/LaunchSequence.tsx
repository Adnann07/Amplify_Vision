import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useProgress } from '@react-three/drei'
import { Component, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import {
  AdditiveBlending,
  Color,
  Fog,
  PCFShadowMap,
  Vector3,
} from 'three'
import type {
  AmbientLight,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Sprite,
} from 'three'
import type { LaunchRecord } from '../../data/launchVehicles'
import {
  ARRIVAL_TIME,
  ASCENT_COMPLETE_TIME,
  DEPARTURE_TIME,
  FAIRING_SEPARATION_TIME,
  LAUNCH_FAILURE_TIME,
  LIFTOFF_TIME,
  MISSION_FAILURE_TIME,
  ORBITAL_SPACE_MIX,
  SPACECRAFT_DEPLOYMENT_TIME,
  SPACE_TRANSITION_START_TIME,
  STABLE_ORBIT_TIME,
  TLI_BURN_TIME,
  TRANSFER_START_TIME,
  isTerminalSequencePhase,
  isSpacecraftDeploymentReady,
  sequenceElapsedAt,
  sequencePhaseAt,
  type SequencePhase,
} from './launchSequenceState'
import { NasaSlsRocket, ProceduralRocket } from './LaunchVehicleModels'
import { SpacecraftPayloadModel } from './SpacecraftPayloadModel'
import {
  getOrbitPosition,
  getTransferPosition,
  resolveFlightDestination,
} from './missionFlightPath'
import type { FlightPoint, MissionFlightProfile } from './missionFlightPath'
import { GROUND_FOG_FAR, GROUND_FOG_NEAR, HORIZON_COLOR, SPACE_COLOR } from './launchConstants'
import { CloudLayer, FailureExplosion, LaunchSite, RocketPlume } from './launchEnvironment'
import { getGlowTexture, getSmokeTexture, SpriteEmitter } from './launchParticles'
import { RealisticPlanet, resolvePlanetStyle, usePlanetTextures } from './PlanetSurfaces'
import { clamp01, damp, dampAngle, lerp, smoothstep } from './proceduralMath'
import { SkyBackdrop, SpaceDust } from './SkyAndSpace'

/* -------------------------------------------------------------------------- */
/*  Timing + scene constants                                                  */
/* -------------------------------------------------------------------------- */

const FAILURE_RISE_RATE = 7.2
const ORBIT_RADIUS_OFFSET = 18
const STABLE_ORBIT_PLANET_SCALE = 2.5
const ORBIT_ANGULAR_SPEED = 0.22
const START_TIMEOUT_SECONDS = 15

const EARTH_BACKDROP_RADIUS = 1800
const EARTH_BACKDROP_BASE_Y = -EARTH_BACKDROP_RADIUS - 170

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
/*  Launch effects: exhaust smoke, steam, vapour, dust, stage-event puffs     */
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
  phase,
}: {
  startedAt: number | null
  active: boolean
  launchFailed: boolean
  rocketState: { current: RocketState }
  phase: SequencePhase
}) {
  const smoke = useMemo(() => new SpriteEmitter(640, getSmokeTexture(), false), [])
  const flare = useMemo(() => new SpriteEmitter(160, getGlowTexture(), true), [])
  useEffect(() => () => { smoke.dispose(); flare.dispose() }, [smoke, flare])
  const palette = useMemo(() => ({
    hot: new Color('#ffd4a0'),
    cool: new Color('#b4bec2'),
    dark: new Color('#8f9a9e'),
    pale: new Color('#d8dfe2'),
    steam: new Color('#f4f8fa'),
    flash: new Color('#fff0cf'),
    ember: new Color('#ff6a1c'),
  }), [])
  const acc = useRef({ vent: 0, steam: 0, ground: 0, trail: 0, flare: 0, ring: 0, lastPhase: phase })

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05)
    const now = performance.now() / 1000
    const a = acc.current
    const { y, scale } = rocketState.current
    const elapsed = startedAt === null ? 0 : now - startedAt
    const progress = clamp01((elapsed - LIFTOFF_TIME) / (ASCENT_COMPLETE_TIME - LIFTOFF_TIME))
    const rand = Math.random

    if (startedAt !== null) {
      /* cryogenic vapour venting during the countdown */
      if (elapsed > 0.2 && elapsed < 3.4) {
        a.vent += dt * 14
        while (a.vent >= 1) {
          a.vent -= 1
          const low = rand() < 0.5
          smoke.emit(
            now, low ? 7 : -10, low ? 3.5 : 20, low ? 7 : 4,
            (rand() - 0.5) * 2, -0.6 - rand() * 1.4, (rand() - 0.5) * 2,
            2.6 + rand() * 1.4, 2, 9 + rand() * 5, 0.5, palette.steam, palette.pale, 0.5, 0,
          )
        }
      }

      /* water-deluge steam boiling off the pad around ignition */
      if (elapsed > 2 && elapsed < 8 && y < 140) {
        const k = smoothstep(2, 3.6, elapsed) * (1 - smoothstep(6, 8, elapsed))
        a.steam += dt * 38 * k
        while (a.steam >= 1) {
          a.steam -= 1
          const angle = rand() * Math.PI * 2
          const radius = 11 + rand() * 16
          const out = 4 + rand() * 8
          smoke.emit(
            now, Math.cos(angle) * radius, -1 + rand() * 3, Math.sin(angle) * radius,
            Math.cos(angle) * out, 6 + rand() * 10, Math.sin(angle) * out,
            3.8 + rand() * 2.2, 9, 42 + rand() * 20, 0.5, palette.steam, palette.pale, 0.6, 1.4,
          )
        }
      }

      /* exhaust: flame-trench blast along the ground + a lingering trail */
      const live = launchFailed ? elapsed < LAUNCH_FAILURE_TIME : elapsed < ASCENT_COMPLETE_TIME + 0.4
      if (active && elapsed > 2.35 && live) {
        const ramp = clamp01((elapsed - 2.35) / 1.5)
        if (y < 90) {
          a.ground += dt * 22 * ramp
          while (a.ground >= 1) {
            a.ground -= 1
            const dir = rand() < 0.5 ? 1 : -1
            smoke.emit(
              now, (rand() - 0.5) * 14, 0.5 + rand() * 3, dir * (4 + rand() * 8),
              (rand() - 0.5) * 18, 1 + rand() * 4, dir * (14 + rand() * 26),
              4.6 + rand() * 2, 6, 30 + rand() * 18, 0.52, palette.hot, palette.cool, 0.5, 0.8,
            )
          }
        }
        if (elapsed < LIFTOFF_TIME + 2.6) {
          a.flare += dt * 46 * ramp
          while (a.flare >= 1) {
            a.flare -= 1
            const angle = rand() * Math.PI * 2
            const out = 8 + rand() * 14
            flare.emit(
              now, Math.cos(angle) * 6, 1 + rand() * 3, Math.sin(angle) * 6,
              Math.cos(angle) * out, 2 + rand() * 6, Math.sin(angle) * out,
              0.5 + rand() * 0.5, 16, 34, 0.55, palette.flash, palette.ember, 1.2,
            )
          }
        }
        a.trail += dt * 36 * ramp
        while (a.trail >= 1) {
          a.trail -= 1
          smoke.emit(
            now, (rand() - 0.5) * 3, y + 3 * scale, (rand() - 0.5) * 3,
            2 + (rand() - 0.5) * 4, -3 - rand() * 3, (rand() - 0.5) * 4,
            5.5 + rand() * 2.5, 7 * scale + 3, 26 + rand() * 16, 0.44,
            palette.hot, rand() < 0.5 ? palette.dark : palette.cool, 0.25, 0.5,
          )
        }
      }

      /* Max-Q: a ring of condensation around the vehicle */
      if (!launchFailed && active && progress > 0.16 && progress < 0.3) {
        a.ring += dt * 70
        while (a.ring >= 1) {
          a.ring -= 1
          const angle = rand() * Math.PI * 2
          const radius = 5 + 2 * scale
          smoke.emit(
            now, Math.cos(angle) * radius, y + 55 * scale, Math.sin(angle) * radius,
            Math.cos(angle) * 9, -3, Math.sin(angle) * 9,
            1.3 + rand() * 0.6, 6, 24, 0.45, palette.steam, palette.pale, 1.6, 0,
          )
        }
      }

      /* flash + smoke puffs when the vehicle sheds stages and fairings */
      if (a.lastPhase !== phase) {
        a.lastPhase = phase
        if (!launchFailed && (phase === 'stage_separation' || phase === 'fairing_separation')) {
          const height = y + (phase === 'stage_separation' ? 46 : 88) * scale
          const speed = phase === 'stage_separation' ? 26 : 16
          for (let index = 0; index < 26; index++) {
            const angle = rand() * Math.PI * 2
            const out = speed * (0.4 + rand())
            flare.emit(
              now, Math.cos(angle) * 2, height, Math.sin(angle) * 2,
              Math.cos(angle) * out, (rand() - 0.5) * out * 0.5, Math.sin(angle) * out,
              0.5 + rand() * 0.5, 8, 22, 0.8, palette.flash, palette.ember, 1.2,
            )
          }
          for (let index = 0; index < 22; index++) {
            const angle = rand() * Math.PI * 2
            const out = speed * (0.2 + rand() * 0.5)
            smoke.emit(
              now, Math.cos(angle) * 3, height, Math.sin(angle) * 3,
              Math.cos(angle) * out, (rand() - 0.5) * 6, Math.sin(angle) * out,
              1.8 + rand() * 1.2, 5, 20 + rand() * 10, 0.5, palette.pale, palette.cool, 0.9, 0,
            )
          }
        }
      }
    }
    smoke.update(now, dt)
    flare.update(now, dt)
  })

  return (
    <>
      <primitive object={smoke.group} />
      <primitive object={flare.group} />
    </>
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
  const fog = useMemo(() => new Fog(HORIZON_COLOR, GROUND_FOG_NEAR, GROUND_FOG_FAR), [])
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
  // Failed launches never reach the destination, so don't spend time building it.
  const planetStyle = useMemo(
    () => (destination && !launchFailed && !missionFailed ? resolvePlanetStyle(destination) : null),
    [destination, launchFailed, missionFailed],
  )
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
    phase === 'tli_burn' ||
    phase === 'departure' ||
    phase === 'transfer' ||
    phase === 'approach' ||
    phase === 'orbital_insertion' ||
    phase === 'stable_orbit' ||
    phase === 'planetary_flyby' ||
    phase === 'mission_complete'

  // The sequence only starts once the vehicle, payload *and* the planets are
  // ready, so nothing pops in mid-flight.
  const markReady = useCallback((part: 'vehicle' | 'payload' | 'planet' | 'earth') => {
    const ready = readyParts.current
    ready.add(part)
    if (ready.has('vehicle') && ready.has('payload') && ready.has('planet') && ready.has('earth')) onAssetReady()
  }, [onAssetReady])
  const markVehicleReady = useCallback(() => markReady('vehicle'), [markReady])
  const markPayloadReady = useCallback(() => markReady('payload'), [markReady])
  useEffect(() => {
    if (!planetStyle || destinationTextures) markReady('planet')
  }, [destinationTextures, markReady, planetStyle])
  useEffect(() => {
    if (!showEarthBackdrop || earthTextures) markReady('earth')
  }, [earthTextures, markReady, showEarthBackdrop])

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
    } else if (elapsed < LAUNCH_FAILURE_TIME) {
      root.position.y = Math.max(0, (elapsed - LIFTOFF_TIME) * FAILURE_RISE_RATE)
      root.scale.setScalar(1)
      root.rotation.z = 0
    } else {
      const blastElapsed = elapsed - LAUNCH_FAILURE_TIME
      root.position.y = (LAUNCH_FAILURE_TIME - LIFTOFF_TIME) * FAILURE_RISE_RATE
      root.scale.setScalar(Math.max(0, 1 - blastElapsed / 0.2))
      root.visible = blastElapsed < 0.2
    }
    rocketState.current.y = root.position.y
    rocketState.current.scale = root.scale.x

    const attached = attachedPayload.current
    if (attached) {
      attached.visible =
        !launchFailed &&
        elapsed >= FAIRING_SEPARATION_TIME + 0.18 &&
        elapsed < SPACECRAFT_DEPLOYMENT_TIME
    }

    /* ---- spacecraft ---- */
    const flightMode = Boolean(destination && missionFlightActive && !missionFailed)
    const payload = deployedPayload.current
    let travelling = false
    if (payload) {
      payload.visible =
        !launchFailed &&
        isSpacecraftDeploymentReady(elapsed, spaceMix.current)
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
              clamp01((elapsed - TLI_BURN_TIME) / (ARRIVAL_TIME - TLI_BURN_TIME)),
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
            root.position.y + 90 * root.scale.y + separation * 15,
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
    const targetMix = launchFailed
      ? 0
      : Math.max(altitudeMix, elapsed >= SPACE_TRANSITION_START_TIME ? 1 : 0)
    spaceMix.current = damp(spaceMix.current, targetMix, 2.6, dt)
    const mix = spaceMix.current
    background.copy(skyColor).lerp(spaceColor, clamp01(mix * 1.15))
    fog.color.copy(background)
    fog.near = lerp(GROUND_FOG_NEAR, 12000, mix)
    fog.far = lerp(GROUND_FOG_FAR, 60000, mix)
    if (ambientLight.current) ambientLight.current.intensity = lerp(0.7, 0.3, mix)
    if (hemisphereLight.current) hemisphereLight.current.intensity = lerp(1.1, 0.16, mix)
    if (sunLight.current) sunLight.current.intensity = lerp(1.8, 2.7, mix)
    if (groundGroup.current) groundGroup.current.visible = mix < ORBITAL_SPACE_MIX

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
      thrustGlow.current.visible = travelling || phase === 'tli_burn'
      const pulse = 1 + Math.sin(now * 18) * 0.08
      const burnBoost = phase === 'tli_burn' ? 1.8 : 1
      thrustGlow.current.scale.set(7 * pulse * burnBoost, 7 * pulse * burnBoost, 1)
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
      const inTransfer = phase === 'tli_burn' || phase === 'departure' || phase === 'transfer'
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
      const shakeBase = elapsed >= 2.35 && elapsed < LAUNCH_FAILURE_TIME
        ? 0.22 * Math.min(1, (elapsed - 2.35) / 1.4)
        : 0
      const blastShake = launchFailed && elapsed >= LAUNCH_FAILURE_TIME ? 1.1 * Math.exp(-(elapsed - LAUNCH_FAILURE_TIME) * 3) : 0
      const shakeStrength = shakeBase + blastShake
      const followY = launchFailed ? 0 : Math.max(0, root.position.y + (payload?.visible ? 70 : 0))
      const orbitProgress = launchFailed ? 0 : liftoffProgress
      // Slow countdown dolly-in: the shot starts wider and lower, then settles for liftoff.
      const intro = 1 - smoothstep(0, LIFTOFF_TIME, elapsed)
      position.set(
        112 - orbitProgress * 76 + intro * 46,
        84 + followY + orbitProgress * 14 - intro * 22,
        175 - orbitProgress * 78 + intro * 70,
      )
      target.set(0, root.position.y + 42 + 24, 0)
      camera.position.lerp(position, 1 - Math.exp(-dt * (elapsed > 3.8 ? 2.4 : 3.5)))
      // subtle handheld sway + engine/blast shake
      camera.position.x += Math.sin(elapsed * 28) * shakeStrength + Math.sin(elapsed * 0.7) * 0.2
      camera.position.y += Math.cos(elapsed * 24) * shakeStrength + Math.cos(elapsed * 0.53) * 0.15
      smoothLook.current.lerp(target, 1 - Math.exp(-dt * 7))
      // lens lengthens as the vehicle climbs for a tighter tracking shot
      const groundFov = launchFailed ? 38 : lerp(38, 31, liftoffProgress)
      perspective.fov = damp(perspective.fov, groundFov, 3, dt)
      perspective.updateProjectionMatrix()
      camera.lookAt(smoothLook.current)
      lastLook.current.copy(smoothLook.current)
    }
  })

  const smokeActive =
    phase === 'ignition' || phase === 'ascent' || phase === 'stage_separation' ||
    phase === 'fairing_separation' || phase === 'anomaly'
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
        color="#fff3e2"
        intensity={1.8}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0004}
        shadow-normalBias={0.6}
        shadow-camera-left={-170}
        shadow-camera-right={170}
        shadow-camera-top={200}
        shadow-camera-bottom={-120}
      />
      <SkyBackdrop spaceMix={spaceMix} />
      <CloudLayer spaceMix={spaceMix} />
      <group ref={groundGroup}>
        <LaunchSite startedAt={startedAt} />
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
          <AssetFailureBoundary fallback={
            <ProceduralRocket
              variant={variant}
              startedAt={launchFailed ? null : startedAt}
              spaceMix={spaceMix}
              onReady={markVehicleReady}
            />
          }>
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
            spaceMix={spaceMix}
            onReady={markVehicleReady}
          />
        )}
        <group ref={attachedPayload} position={[0, 90, 0]} scale={0.78}>
          <Suspense fallback={null}>
            <SpacecraftPayloadModel model={record.spacecraftModel} onReady={markPayloadReady} />
          </Suspense>
        </group>
        <RocketPlume
          startedAt={startedAt}
          phase={phase}
          failed={launchFailed}
          liftoffTime={LIFTOFF_TIME}
          failureTime={LAUNCH_FAILURE_TIME}
          ascentCompleteTime={ASCENT_COMPLETE_TIME}
        />
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
      {launchFailed && startedAt !== null && (
        <FailureExplosion
          startedAt={startedAt}
          cause={failureCause}
          failureTime={LAUNCH_FAILURE_TIME}
          originY={(LAUNCH_FAILURE_TIME - LIFTOFF_TIME) * FAILURE_RISE_RATE + 45}
        />
      )}
      <LaunchSmoke startedAt={startedAt} active={smokeActive} launchFailed={launchFailed} rocketState={rocketState} phase={phase} />
    </>
  )
}

/* -------------------------------------------------------------------------- */
/*  Audio: layered rumble / roar / crackle / tone, plus a failure boom        */
/* -------------------------------------------------------------------------- */

interface AudioRig {
  context: AudioContext
  master: GainNode
  rumble: GainNode
  roar: GainNode
  crackle: GainNode
  tone: GainNode
  brown: AudioBuffer
}

function createNoiseBuffer(context: AudioContext, kind: 'white' | 'brown', seconds: number) {
  const length = Math.floor(context.sampleRate * seconds)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let index = 0; index < length; index++) {
    const white = Math.random() * 2 - 1
    if (kind === 'white') {
      data[index] = white * 0.6
    } else {
      last = (last + 0.02 * white) / 1.02
      data[index] = last * 3.2
    }
  }
  return buffer
}

function SynthesizedLaunchAudio({ phase, muted, failed }: { phase: SequencePhase; muted: boolean; failed: boolean }) {
  const audio = useRef<AudioRig | null>(null)
  const boomPlayed = useRef(false)

  useEffect(() => {
    const AudioContextConstructor = window.AudioContext
    if (!AudioContextConstructor) return
    const context = new AudioContextConstructor()
    const master = context.createGain()
    master.gain.value = 0
    master.connect(context.destination)

    const brown = createNoiseBuffer(context, 'brown', 4)
    const white = createNoiseBuffer(context, 'white', 3)
    const sources: AudioScheduledSourceNode[] = []
    const loopSource = (buffer: AudioBuffer) => {
      const source = context.createBufferSource()
      source.buffer = buffer
      source.loop = true
      sources.push(source)
      return source
    }
    const filter = (type: BiquadFilterType, frequency: number, q = 1) => {
      const node = context.createBiquadFilter()
      node.type = type
      node.frequency.value = frequency
      node.Q.value = q
      return node
    }
    const gain = (value = 0) => {
      const node = context.createGain()
      node.gain.value = value
      return node
    }

    // deep chest-thumping rumble
    const rumble = gain()
    loopSource(brown).connect(filter('lowpass', 120)).connect(rumble).connect(master)
    // mid-band roar
    const roar = gain()
    loopSource(white).connect(filter('bandpass', 520, 0.6)).connect(roar).connect(master)
    // crackle: high-passed noise chopped by a fast square LFO
    const crackle = gain()
    const chopper = gain(0.5)
    const lfo = context.createOscillator()
    const lfoDepth = gain(0.5)
    lfo.type = 'square'
    lfo.frequency.value = 19
    lfo.connect(lfoDepth).connect(chopper.gain)
    loopSource(white).connect(filter('highpass', 2200)).connect(chopper).connect(crackle).connect(master)
    sources.push(lfo)
    // engine tone
    const tone = gain()
    const oscillator = context.createOscillator()
    oscillator.type = 'sawtooth'
    oscillator.frequency.value = 46
    oscillator.connect(filter('lowpass', 160)).connect(tone).connect(master)
    sources.push(oscillator)

    for (const source of sources) source.start()
    audio.current = { context, master, rumble, roar, crackle, tone, brown }
    return () => {
      for (const source of sources) {
        try { source.stop() } catch { /* already stopped */ }
      }
      void context.close()
      audio.current = null
    }
  }, [])

  useEffect(() => {
    const rig = audio.current
    if (!rig) return
    const { context } = rig
    const t = context.currentTime
    let rumble = 0
    let roar = 0
    let crackle = 0
    let tone = 0
    let constant = 0.6
    switch (phase) {
      case 'ignition': rumble = 0.5; roar = 0.18; crackle = 0.1; tone = 0.04; constant = 0.6; break
      case 'ascent': rumble = failed ? 0.6 : 0.8; roar = 0.38; crackle = 0.3; tone = 0.05; constant = 0.8; break
      case 'stage_separation': rumble = 0.35; roar = 0.2; crackle = 0.12; tone = 0.04; constant = 0.5; break
      case 'fairing_separation': rumble = 0.15; roar = 0.08; crackle = 0.05; tone = 0.02; constant = 0.8; break
      case 'tli_burn': rumble = 0.25; roar = 0.22; tone = 0.06; constant = 0.8; break
      case 'anomaly': constant = failed ? 0.05 : 0.6; break
      default: break
    }
    rig.rumble.gain.setTargetAtTime(rumble, t, constant)
    rig.roar.gain.setTargetAtTime(roar, t, constant)
    rig.crackle.gain.setTargetAtTime(crackle, t, constant)
    rig.tone.gain.setTargetAtTime(tone, t, constant)
    rig.master.gain.setTargetAtTime(muted ? 0 : 0.7, t, 0.1)
    if (!muted && context.state === 'suspended') void context.resume()

    // one-shot detonation when the vehicle is lost
    if (phase === 'anomaly' && failed && !muted && !boomPlayed.current) {
      boomPlayed.current = true
      const source = context.createBufferSource()
      source.buffer = rig.brown
      const lowpass = context.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.setValueAtTime(900, t)
      lowpass.frequency.exponentialRampToValueAtTime(60, t + 2.6)
      const envelope = context.createGain()
      envelope.gain.setValueAtTime(0.0001, t)
      envelope.gain.exponentialRampToValueAtTime(1.4, t + 0.02)
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + 3.6)
      source.connect(lowpass).connect(envelope).connect(rig.master)
      source.start(t)
      source.stop(t + 3.7)
    }
  }, [failed, muted, phase])

  return null
}

/* -------------------------------------------------------------------------- */
/*  HUD                                                                       */
/* -------------------------------------------------------------------------- */

function Telemetry({ startedAt, frozen, failed, missionFailed }: {
  startedAt: number | null
  frozen: boolean
  failed: boolean
  missionFailed: boolean
}) {
  const [reading, setReading] = useState({ clock: 'T-00:04', altitude: '0', velocity: '0.0', thrust: 0, maxQ: false })

  useEffect(() => {
    if (startedAt === null) return
    const update = () => {
      const raw = performance.now() / 1000 - startedAt
      const elapsed = failed
        ? Math.min(raw, LAUNCH_FAILURE_TIME)
        : missionFailed
          ? Math.min(raw, MISSION_FAILURE_TIME)
          : raw
      const t = elapsed - LIFTOFF_TIME
      const sign = t < 0 ? '-' : '+'
      const abs = Math.abs(t)
      const clock = `T${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(Math.floor(abs % 60)).padStart(2, '0')}`
      const progress = clamp01(t / (ASCENT_COMPLETE_TIME - LIFTOFF_TIME))
      let altitude = Math.pow(progress, 1.45) * 400
      if (!failed && elapsed >= ASCENT_COMPLETE_TIME) altitude = 400
      if (!failed && !missionFailed && elapsed >= TLI_BURN_TIME && elapsed < DEPARTURE_TIME) {
        altitude += 1600 * clamp01((elapsed - TLI_BURN_TIME) / (DEPARTURE_TIME - TLI_BURN_TIME))
      } else if (!failed && !missionFailed && elapsed >= TRANSFER_START_TIME) {
        altitude = 2000 + (elapsed - TRANSFER_START_TIME) * 400
      }
      const velocity = failed
        ? progress * 1.4
        : 7.8 * Math.min(1, Math.pow(progress, 0.8)) +
          (missionFailed ? 0 : 3.1 * clamp01((elapsed - TLI_BURN_TIME) / (TRANSFER_START_TIME - TLI_BURN_TIME)))
      const maxQ = !failed && progress > 0.16 && progress < 0.3
      const ignitionRamp = clamp01((raw - 2.35) / 1.55)
      let thrust = ignitionRamp * 100
      if (maxQ) thrust = 72
      if (!failed && elapsed >= ASCENT_COMPLETE_TIME) thrust = 0
      if (!failed && !missionFailed && elapsed >= TLI_BURN_TIME && elapsed < DEPARTURE_TIME) {
        thrust = 100 - 20 * clamp01((elapsed - TLI_BURN_TIME) / (DEPARTURE_TIME - TLI_BURN_TIME))
      }
      if (failed && raw > LAUNCH_FAILURE_TIME) thrust = 0
      setReading({
        clock,
        altitude: Math.round(altitude).toLocaleString(),
        velocity: velocity.toFixed(1),
        thrust: Math.round(thrust),
        maxQ,
      })
    }
    update()
    if (frozen) return
    const interval = window.setInterval(update, 100)
    return () => window.clearInterval(interval)
  }, [failed, frozen, missionFailed, startedAt])

  if (startedAt === null) return null
  return (
    <div className="pointer-events-none absolute right-4 top-14 z-10 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 font-mono text-[9px] leading-relaxed tracking-[0.12em] text-slate-100/85 backdrop-blur">
      <div>{reading.clock}</div>
      <div>ALT {reading.altitude} KM</div>
      <div>VEL {reading.velocity} KM/S</div>
      <div>THR {reading.thrust}%</div>
      {reading.maxQ && <div className="text-amber-200">MAX-Q</div>}
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
    leo_coast: 'LOW EARTH ORBIT · SYSTEMS CHECK',
    spacecraft_deployment: 'SPACECRAFT DEPLOYMENT',
    spacecraft_initialization: 'SPACECRAFT INITIALIZATION',
    mission_active: 'MISSION OPERATIONS STARTED',
    tli_burn: 'TRANS-LUNAR INJECTION',
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
  // Keep the latest callback in a ref so an inline `onComplete` in the parent
  // can't restart the sequence timer on every render.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => { onCompleteRef.current = onComplete }, [onComplete])
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

  // Safety net: never sit on the loading screen forever if an asset stalls.
  useEffect(() => {
    const timer = window.setTimeout(onAssetReady, START_TIMEOUT_SECONDS * 1000)
    return () => window.clearTimeout(timer)
  }, [onAssetReady])

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
          onCompleteRef.current()
        }
      }
    }, 80)
    return () => window.clearInterval(interval)
  }, [destination, failed, missionFailed, missionProfile, startedAt])

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

      <Telemetry
        startedAt={startedAt}
        frozen={hasTerminalPhase && !isOrbitalPhase}
        failed={failed}
        missionFailed={missionFailed}
      />

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
              : 'Above the dense atmosphere, the payload fairing separates to expose the spacecraft.'
          )}
          {phase === 'leo_coast' && 'The upper stage has reached low Earth orbit. Flight controllers check spacecraft systems before committing to the translunar injection burn.'}
          {phase === 'spacecraft_deployment' && (
            isSurfacePayload(record)
              ? 'Selected surface vehicle separates in low Earth orbit; entry, descent, and landing are not simulated.'
              : 'Spacecraft separates in low Earth orbit, well clear of Earth’s surface, and begins independent simulated motion.'
          )}
          {phase === 'spacecraft_initialization' && (
            isSurfacePayload(record)
              ? 'Surface payload deployed · simulated communications and spacecraft health checks are underway.'
              : 'Spacecraft health and electrical systems are checked in low Earth orbit before departure.'
          )}
          {phase === 'mission_active' && (
            isSurfacePayload(record)
              ? 'Surface mission destination selected · landing and surface operations are not simulated.'
              : record.destination.toLowerCase().includes('earth')
                ? 'Initial Earth-orbit segment simulated · mission objectives still require assessment.'
                : `Simplified outbound trajectory toward ${record.destination} · no detailed transfer is simulated.`
          )}
          {phase === 'tli_burn' && `Upper-stage engine fires in low Earth orbit for a simulated trans-lunar injection toward ${destination?.name ?? record.destination}.`}
          {phase === 'departure' && `After the TLI burn, the spacecraft is departing Earth orbit for ${record.destination}.`}
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

      <SynthesizedLaunchAudio phase={phase} muted={muted} failed={failed} />
    </div>
  )
}
