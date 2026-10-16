import { OrbitControls, Sparkles, Stars } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Component, lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box3, Group, Material, Mesh, MeshStandardMaterial, PerspectiveCamera, Sphere, Vector3 } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { availableSpacecraftCatalog, type SpacecraftSpec } from '../../data/spacecraft'
import { loadSpacecraftModel, type LoadedModel } from './spacecraftModelLoader'
import {
  getComponentFit,
  getSpacecraftBuildProfile,
  instrumentOptions,
  normalizeBuild,
  solarPanelOptions,
  type BuildComponentId,
  type MountPoint,
  type SpacecraftBuild,
} from '../../data/spacecraftBuild'

interface SpacecraftViewerProps {
  spacecraft: SpacecraftSpec
  build: SpacecraftBuild
  onSelectSpacecraft?: (spacecraft: (typeof availableSpacecraftCatalog)[number]) => void
}

type ViewerLoadState =
  | { spacecraftId: string; status: 'loading' }
  | { spacecraftId: string; status: 'unavailable'; reason: string }
  | { spacecraftId: string; status: 'error'; message: string }
  | { spacecraftId: string; status: 'ready'; model: LoadedModel }

interface SpacecraftCanvasBoundaryProps {
  children: ReactNode
  onFailure: () => void
}

interface SpacecraftCanvasBoundaryState {
  failed: boolean
}

class SpacecraftCanvasBoundary extends Component<
  SpacecraftCanvasBoundaryProps,
  SpacecraftCanvasBoundaryState
> {
  state: SpacecraftCanvasBoundaryState = { failed: false }

  static getDerivedStateFromError(): SpacecraftCanvasBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.warn('Spacecraft 3D viewer unavailable; showing its static fallback.', error.message)
    this.props.onFailure()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function SpacecraftViewerFallback({ spacecraft }: { spacecraft: SpacecraftSpec }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 pb-6 pt-14 text-center">
      <svg
        aria-hidden="true"
        className="h-36 w-56 max-w-full drop-shadow-[0_0_24px_rgba(56,189,248,0.18)]"
        viewBox="0 0 240 160"
        fill="none"
      >
        <path d="m120 39 22 35-22 47-22-47 22-35Z" fill={spacecraft.accent} fillOpacity=".8" />
        <path d="M108 72H42l-23 22 79-5m34-17h66l23 22-79-5" fill="#94a3b8" fillOpacity=".65" stroke="#cbd5e1" strokeWidth="2" strokeLinejoin="round" />
        <path d="m112 112-17 21 18-7m15-14 17 21-18-7" fill="#38bdf8" fillOpacity=".6" />
        <circle cx="120" cy="75" r="8" fill="#082f49" stroke="#e0f2fe" strokeWidth="2" />
        <path d="M29 104h182M50 65v35m140-35v35" stroke={spacecraft.accent} strokeWidth="2" strokeOpacity=".8" />
        <path d="m37 46 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6Zm166 39 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" fill="#bae6fd" />
      </svg>
      <div>
        <p className="text-sm font-medium text-white">3D viewer unavailable</p>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-300">
          WebGL is unavailable in this browser. The spacecraft builder and live telemetry are still
          available.
        </p>
      </div>
    </div>
  )
}

const mountAliases: Partial<Record<MountPoint, string[]>> = {
  'truss-array-mast': ['array mast', 'solar array', 'solararray', 'truss'],
  'truss-payload-carrier': ['payload carrier', 'payload pallet', 'external payload'],
  'remote-sensing-pallet': ['remote sensing pallet', 'instrument pallet', 'science pallet'],
  'nadir-deck': ['nadir deck', 'instrument deck', 'science deck'],
}

function resolveMountPosition(
  root: Group,
  mountPoint: MountPoint,
  index: number,
  slots: number,
) {
  root.updateWorldMatrix(true, true)
  const bounds = new Box3().setFromObject(root)
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const slotOffset = slots <= 1 ? 0 : (index / (slots - 1) - 0.5) * 0.42

  let socketBounds: Box3 | undefined
  const socketNames = mountAliases[mountPoint]
  if (socketNames) {
    root.traverse((object) => {
      if (socketBounds || !object.name) return
      const name = object.name.toLowerCase()
      if (!socketNames.some((socketName) => name.includes(socketName))) return
      const candidateBounds = new Box3().setFromObject(object)
      if (!candidateBounds.isEmpty()) socketBounds = candidateBounds
    })
  }
  const socketCenter = socketBounds?.getCenter(new Vector3())
  const position = center.clone()

  switch (mountPoint) {
    case 'truss-array-mast':
      if (socketBounds && socketCenter) {
        position.copy(socketCenter)
        position.z = socketBounds.max.z + Math.max(size.z * 0.015, 0.01)
        position.x += (index === 0 ? -1 : 1) * size.x * 0.17
      } else {
        position.x += (index === 0 ? -1 : 1) * size.x * 0.34
        position.y += size.y * 0.08
        position.z -= size.z * 0.04
      }
      break
    case 'truss-payload-carrier':
      if (socketBounds && socketCenter) {
        position.copy(socketCenter)
        position.z = socketBounds.max.z + Math.max(size.z * 0.015, 0.01)
        position.x += slotOffset * size.x * 0.5
      } else {
        position.x += slotOffset * size.x
        position.y -= size.y * 0.16
        position.z += size.z * 0.12
      }
      break
    case 'remote-sensing-pallet':
      if (socketBounds && socketCenter) {
        position.copy(socketCenter)
        position.x = socketBounds.max.x + Math.max(size.x * 0.015, 0.01)
        position.y += slotOffset * size.y * 0.5
      } else {
        position.x += size.x * 0.38
        position.y += slotOffset * size.y
        position.z += size.z * 0.12
      }
      break
    case 'nadir-deck':
      if (socketBounds && socketCenter) {
        position.copy(socketCenter)
        position.y = socketBounds.min.y - Math.max(size.y * 0.015, 0.01)
        position.x += slotOffset * size.x * 0.5
      } else {
        position.x += slotOffset * size.x
        position.y -= size.y * 0.2
        position.z += size.z * 0.1
      }
      break
    default:
      return center
  }

  return root.parent ? root.parent.worldToLocal(position) : position
}

function AssemblyComponents({
  model,
  build,
  spacecraft,
  radius,
  disassembled,
}: {
  model: LoadedModel
  build: SpacecraftBuild
  spacecraft: SpacecraftSpec
  radius: number
  disassembled: boolean
}) {
  const profile = useMemo(() => getSpacecraftBuildProfile(spacecraft), [spacecraft])
  const activeBuild = useMemo(() => normalizeBuild(spacecraft, build), [build, spacecraft])

  useEffect(() => {
    model.root.traverse((object) => {
      const component = object.userData.component as BuildComponentId | undefined
      if (!component) return
      object.visible = true

      if (!object.userData.assembledPosition) {
        object.userData.assembledPosition = object.position.clone()
      }

      const assembledPosition = object.userData.assembledPosition as Vector3
      object.position.copy(assembledPosition)
      if (!disassembled || spacecraft.model.format !== 'stl') return

      const direction = assembledPosition.clone()
      if (direction.lengthSq() === 0) {
        direction.set(
          component === 'instrument' ? 1 : 0,
          component === 'engine' ? -1 : component === 'antenna' ? 1 : 0,
          component === 'solarPanel' ? 1 : 0,
        )
      }
      direction.normalize().multiplyScalar((radius * 0.65) / spacecraft.model.scale)
      object.position.add(direction)
    })
  }, [disassembled, model, radius, spacecraft.model])

  useEffect(() => {
    const originals = new Map<Mesh, Material | Material[]>()
    const fitComponents: [BuildComponentId, MountPoint][] = activeBuild.components.flatMap(
      (component): [BuildComponentId, MountPoint][] => {
        const fit = getComponentFit(profile, component, activeBuild.instrumentType)
        return fit?.mode === 'upgrade' ? [[component, fit.mountPoint]] : []
      },
    )
    if (!fitComponents.length) return

    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const name = object.name.toLowerCase()
      const component = object.userData.component as BuildComponentId | undefined
      const match = fitComponents.some(([fitComponent, mountPoint]) => {
        const targetComponent =
          mountPoint === 'existing-dish'
            ? 'antenna'
            : mountPoint === 'existing-solar-array'
              ? 'solarPanel'
              : mountPoint === 'existing-main-engine'
                ? 'engine'
                : fitComponent
        if (component !== targetComponent) return false

        if (mountPoint === 'rover-arm-turret') return /arm|turret|pixl|sherloc/.test(name)
        if (mountPoint === 'rover-underbody') return /under|belly|rimfax|radar/.test(name)
        if (mountPoint === 'rover-mast') return /mast|camera|supercam/.test(name)
        return true
      })
      if (!match) return

      const originalMaterial = object.material
      const sourceMaterials = Array.isArray(originalMaterial) ? originalMaterial : [originalMaterial]
      const highlightedMaterials = sourceMaterials.map((material) => {
        if (!(material instanceof MeshStandardMaterial)) return material
        const highlighted = material.clone()
        highlighted.emissive.set('#38bdf8')
        highlighted.emissiveIntensity = 0.55
        return highlighted
      })
      originals.set(object, originalMaterial)
      object.material = Array.isArray(originalMaterial)
        ? highlightedMaterials
        : highlightedMaterials[0]
    })

    return () => {
      originals.forEach((original, mesh) => {
        const highlighted = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const source = Array.isArray(original) ? original : [original]
        highlighted.forEach((material, index) => {
          if (material !== source[index]) material.dispose()
        })
        mesh.material = original
      })
    }
  }, [activeBuild.components, activeBuild.instrumentType, model, profile])

  const panel = solarPanelOptions[activeBuild.solarPanelSize]
  const instrument = instrumentOptions[activeBuild.instrumentType]
  const enabled = (component: BuildComponentId) => activeBuild.components.includes(component)
  const spread = disassembled ? radius * 0.7 : 0
  const solarFit = getComponentFit(profile, 'solarPanel')
  const instrumentFit = getComponentFit(profile, 'instrument', activeBuild.instrumentType)
  const attachedPanels =
    enabled('solarPanel') && solarFit?.mode === 'attach'
      ? Math.min(solarFit.slots ?? 2, 2)
      : 0
  const attachedInstruments =
    enabled('instrument') && instrumentFit?.mode === 'attach'
      ? Math.min(activeBuild.instrumentCount, instrumentFit.slots ?? activeBuild.instrumentCount)
      : 0

  return (
    <>
      <primitive object={model.root} dispose={null} />
      {Array.from({ length: attachedPanels }, (_, index) => {
        if (!solarFit) return null
        const position = resolveMountPosition(
          model.root,
          solarFit.mountPoint,
          index,
          solarFit.slots ?? attachedPanels,
        )
        if (disassembled) position.x += (index === 0 ? -1 : 1) * spread
        return (
          <group key={`solar-panel-${index}`} position={position}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[radius * 0.4 * panel.scale, radius * 0.28 * panel.scale, radius * 0.025]} />
              <meshStandardMaterial color="#397eae" metalness={0.7} roughness={0.3} emissive="#102d43" />
            </mesh>
            <mesh position={[0, 0, radius * 0.035]}>
              <cylinderGeometry args={[radius * 0.018, radius * 0.018, radius * 0.12, 8]} />
              <meshStandardMaterial color="#bdc9d2" metalness={0.72} roughness={0.28} />
            </mesh>
          </group>
        )
      })}
      {Array.from({ length: attachedInstruments }, (_, index) => {
        if (!instrumentFit) return null
        const position = resolveMountPosition(
          model.root,
          instrumentFit.mountPoint,
          index,
          instrumentFit.slots ?? attachedInstruments,
        )
        if (disassembled) position.x += (index % 2 === 0 ? 1 : -1) * spread
        return (
          <group key={`instrument-${index}`} position={position} scale={instrument.scale}>
            <mesh castShadow>
              <boxGeometry args={[radius * 0.13, radius * 0.1, radius * 0.11]} />
              <meshStandardMaterial color="#c7bba0" metalness={0.58} roughness={0.38} />
            </mesh>
            <mesh position={[0, 0, radius * 0.065]}>
              <cylinderGeometry args={[radius * 0.035, radius * 0.035, radius * 0.045, 16]} />
              <meshStandardMaterial color={spacecraft.accent} metalness={0.7} roughness={0.24} />
            </mesh>
            <mesh position={[0, 0, radius * 0.09]}>
              <sphereGeometry args={[radius * 0.018, 12, 8]} />
              <meshStandardMaterial color="#c9f4ff" emissive="#5acfff" emissiveIntensity={0.35} />
            </mesh>
          </group>
        )
      })}
    </>
  )
}

function ModelFramer({
  model,
  build,
  spacecraft,
  disassembled,
}: {
  model: LoadedModel
  build: SpacecraftBuild
  spacecraft: SpacecraftSpec
  disassembled: boolean
}) {
  const wrapperRef = useRef<Group>(null)
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const [distanceLimits, setDistanceLimits] = useState({ min: 0.1, max: 100 })
  const { camera, size } = useThree()
  const modelRadius = useMemo(() => {
    const bounds = new Box3().setFromObject(model.root)
    return bounds.getBoundingSphere(new Sphere()).radius
  }, [model])

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return

    wrapper.position.set(0, 0, 0)
    wrapper.updateWorldMatrix(true, true)
    const bounds = new Box3().setFromObject(wrapper)
    if (bounds.isEmpty()) throw new Error('The selected spacecraft model contains no geometry.')

    const center = bounds.getCenter(new Vector3())
    wrapper.position.copy(center).negate()
    wrapper.updateWorldMatrix(true, true)

    const sphere = bounds.getBoundingSphere(new Sphere())
    const perspectiveCamera = camera as PerspectiveCamera
    const verticalFov = (perspectiveCamera.fov * Math.PI) / 180
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * (size.width / size.height))
    const limitingFov = Math.min(verticalFov, horizontalFov)
    const distance = (sphere.radius / Math.sin(limitingFov / 2)) * 1.2

    perspectiveCamera.position.set(distance * 0.28, distance * 0.2, distance)
    perspectiveCamera.near = Math.max(sphere.radius / 1000, 0.001)
    perspectiveCamera.far = Math.max(distance + sphere.radius * 8, 500)
    perspectiveCamera.lookAt(0, 0, 0)
    perspectiveCamera.updateProjectionMatrix()

    setDistanceLimits({
      min: Math.max(sphere.radius * 0.35, 0.05),
      max: Math.max(distance + sphere.radius * 5, distance * 2),
    })
    controlsRef.current?.target.set(0, 0, 0)
    controlsRef.current?.update()
  }, [camera, model, modelRadius, size.height, size.width])

  return (
    <>
      <group ref={wrapperRef}>
        <AssemblyComponents
          model={model}
          build={build}
          spacecraft={spacecraft}
          radius={modelRadius}
          disassembled={disassembled}
        />
      </group>
      <OrbitControls
        ref={controlsRef}
        enablePan={false}
        enableDamping
        minDistance={distanceLimits.min}
        maxDistance={distanceLimits.max}
        autoRotate
        autoRotateSpeed={0.7}
        target={[0, 0, 0]}
      />
    </>
  )
}

const SpacecraftOrbitGallery = lazy(() =>
  import('./SpacecraftOrbitGallery').then((module) => ({
    default: module.SpacecraftOrbitGallery,
  })),
)

export function SpacecraftViewer({
  spacecraft,
  build,
  onSelectSpacecraft,
}: SpacecraftViewerProps) {
  const [attempt, setAttempt] = useState(0)
  const [viewerFailed, setViewerFailed] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  const disassembled = false
  const [loadState, setLoadState] = useState<ViewerLoadState>({
    spacecraftId: '',
    status: 'loading',
  })

  useEffect(() => {
    let cancelled = false
    let disposeLoadedModel: (() => void) | undefined

    if (spacecraft.model.format === 'unavailable') {
      setLoadState({
        spacecraftId: spacecraft.id,
        status: 'unavailable',
        reason: spacecraft.model.reason,
      })
      return () => {
        cancelled = true
      }
    }

    setLoadState({ spacecraftId: spacecraft.id, status: 'loading' })
    loadSpacecraftModel(spacecraft)
      .then((model) => {
        if (cancelled) {
          model.dispose()
          return
        }

        disposeLoadedModel = model.dispose
        setLoadState({ spacecraftId: spacecraft.id, status: 'ready', model })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        console.error(`Failed to load ${spacecraft.name} 3D model.`, error)
        setLoadState({
          spacecraftId: spacecraft.id,
          status: 'error',
          message: 'The verified spacecraft asset could not be loaded.',
        })
      })

    return () => {
      cancelled = true
      disposeLoadedModel?.()
    }
  }, [attempt, spacecraft])

  const currentState =
    loadState.spacecraftId === spacecraft.id ? loadState : { status: 'loading' as const }
  const modelDebugName =
    spacecraft.model.format === 'unavailable'
      ? `${spacecraft.id}: no verified NASA/JPL asset`
      : `${spacecraft.id}.${spacecraft.model.format}${spacecraft.model.format === 'stl' ? ' assembly' : ''}`

  return (
    <>
    <div
      aria-hidden={galleryOpen}
      className={`relative h-[430px] overflow-hidden rounded-[28px] border border-white/10 bg-[#020912] shadow-[0_0_45px_rgba(34,211,238,0.08)] ${
        galleryOpen ? 'invisible' : ''
      }`}
    >
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-sm">
        <span className="text-[10px] uppercase tracking-[0.28em] text-sky-200/75">Mission model</span>
        <div className="flex items-center gap-2">
          {onSelectSpacecraft && (
            <button
              id="explore-models-button"
              type="button"
              onClick={() => setGalleryOpen(true)}
              className="rounded-full border border-sky-300/25 bg-sky-300/5 px-3 py-1.5 text-[10px] font-medium text-sky-100 transition hover:border-sky-200/60 hover:bg-sky-300/15 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300"
            >
              Explore All Models
            </button>
          )}
          <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 text-[10px] font-medium text-sky-100">
            {spacecraft.name}
          </span>
        </div>
      </div>

      {import.meta.env.DEV && (
        <div className="absolute bottom-3 left-3 z-10 rounded bg-black/70 px-2 py-1 font-mono text-[10px] text-cyan-100">
          MODEL: {modelDebugName}
        </div>
      )}

      {!galleryOpen && !viewerFailed ? (
        <SpacecraftCanvasBoundary
          key={`${spacecraft.id}-${attempt}`}
          onFailure={() => setViewerFailed(true)}
        >
          <Canvas
            camera={{ position: [0, 0, 4], fov: 38 }}
            dpr={[1, 1.5]}
            gl={{ antialias: true, alpha: false }}
          >
            <color attach="background" args={['#020912']} />
            <ambientLight intensity={1.05} />
            <directionalLight position={[5, 7, 5]} intensity={2.2} castShadow />
            <pointLight position={[-5, 3, 2]} intensity={18} color={spacecraft.accent} />
            <pointLight position={[0, -3, -2]} intensity={5} color="#93c5fd" />
            <Stars radius={250} depth={150} count={1400} factor={3} fade speed={0.7} />
            <Sparkles count={32} scale={[8, 5, 8]} size={2} speed={0.35} color={spacecraft.accent} />
            {currentState.status === 'ready' && (
              <ModelFramer
                model={currentState.model}
                build={build}
                spacecraft={spacecraft}
                disassembled={disassembled}
              />
            )}
          </Canvas>
        </SpacecraftCanvasBoundary>
      ) : !galleryOpen ? (
        <SpacecraftViewerFallback spacecraft={spacecraft} />
      ) : null}

      {!galleryOpen && !viewerFailed && currentState.status === 'loading' && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/55 pt-8 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
          <span className="text-sm text-slate-100">Loading {spacecraft.name} 3D model...</span>
        </div>
      )}

      {!galleryOpen && currentState.status === 'error' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-6 pt-8 text-center">
          <p className="text-sm font-medium text-white">Unable to load 3D model.</p>
          <p className="text-xs text-slate-400">{currentState.message}</p>
          <button
            type="button"
            onClick={() => setAttempt((previous) => previous + 1)}
            className="rounded-full border border-sky-300/40 bg-sky-300/10 px-4 py-2 text-xs font-medium text-sky-100 transition hover:bg-sky-300/20"
          >
            Retry
          </button>
        </div>
      )}

      {!galleryOpen && currentState.status === 'unavailable' && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/80 px-6 pt-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
            3D model unavailable
          </p>
          <p className="max-w-sm text-sm font-medium text-white">{currentState.reason}</p>
          <a
            href={spacecraft.model.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-200 underline decoration-sky-200/40 underline-offset-4"
          >
            Check official NASA 3D Resources
          </a>
        </div>
      )}
    </div>
    {galleryOpen && onSelectSpacecraft && (
      <Suspense
        fallback={
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#030812] text-sm text-slate-300">
            Preparing spacecraft gallery...
          </div>
        }
      >
        <SpacecraftOrbitGallery
          selectedId={spacecraft.id}
          selectedModel={currentState.status === 'ready' ? currentState.model : null}
          onClose={() => setGalleryOpen(false)}
          onSelect={(selected) => {
            onSelectSpacecraft(selected)
            setGalleryOpen(false)
          }}
        />
      </Suspense>
    )}
    </>
  )
}
