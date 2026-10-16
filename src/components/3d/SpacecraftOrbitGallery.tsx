import { Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { motion } from 'framer-motion'
import {
  AdditiveBlending,
  BackSide,
  Box3,
  Camera,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { availableSpacecraftCatalog } from '../../data/spacecraft'
import { useAppReducedMotion } from '../../utils/useAppReducedMotion'
import { loadSpacecraftModel, type LoadedModel } from './spacecraftModelLoader'
import {
  SpacecraftInformationBranches,
  type SpacecraftBranchModelState,
} from './SpacecraftInformationBranches'
import './SpacecraftOrbitGallery.css'

type AvailableSpacecraft = (typeof availableSpacecraftCatalog)[number]

interface SpacecraftOrbitGalleryProps {
  selectedId: string
  selectedModel: LoadedModel | null
  preloadedModels?: Map<string, LoadedModel>
  initialLoadErrors?: string[]
  onCanvasReady?: () => void
  onCanvasFailure?: () => void
  onClose: () => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}

interface GalleryCanvasBoundaryProps {
  children: ReactNode
  onFailure: () => void
}

interface GalleryCanvasBoundaryState {
  failed: boolean
}

const FOCUS_DURATION = 0.9
const FOCUSED_MODEL_SCALE = 2.8
const FOCUSED_MODEL_SCREEN_FRACTION = 0.76
const DIM_DURATION = 0.65
const CANVAS_READY_TIMEOUT_MS = 10_000

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function stepToward(
  current: number,
  target: number,
  delta: number,
  duration: number,
  instant: boolean,
) {
  if (instant) return target
  const step = delta / duration
  return current < target ? Math.min(target, current + step) : Math.max(target, current - step)
}

class GalleryCanvasBoundary extends Component<
  GalleryCanvasBoundaryProps,
  GalleryCanvasBoundaryState
> {
  state: GalleryCanvasBoundaryState = { failed: false }

  static getDerivedStateFromError(): GalleryCanvasBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('Spacecraft gallery 3D renderer failed.', error)
    this.props.onFailure()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function createSilhouette(root: Group) {
  const silhouette = root.clone(true)
  silhouette.visible = false
  const materials: MeshBasicMaterial[] = []

  silhouette.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const material = new MeshBasicMaterial({
      color: '#63dfff',
      side: BackSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
      toneMapped: false,
    })
    materials.push(material)
    object.material = material
    object.renderOrder = -1
  })

  return {
    root: silhouette,
    materials,
    dispose: () => materials.forEach((material) => material.dispose()),
  }
}

function OrbitingModel({
  spacecraft,
  model,
  position,
  size,
  reducedMotion,
  highlighted,
  focused,
  dimmed,
  focusedModelRef,
  branchModelRef,
  onHighlight,
  onSelect,
}: {
  spacecraft: AvailableSpacecraft
  model: LoadedModel
  position: [number, number, number]
  size: number
  reducedMotion: boolean
  highlighted: boolean
  focused: boolean
  dimmed: boolean
  focusedModelRef: RefObject<Group | null>
  branchModelRef: RefObject<SpacecraftBranchModelState>
  onHighlight: (id: string | null) => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}) {
  const rootRef = useRef<Group>(null)
  const orbitModelRef = useRef<Group>(null)
  const [px, py, pz] = position
  const orbit = useMemo(() => new Vector3(px, py, pz), [px, py, pz])
  const progress = useRef({ focus: 0, dim: 0 })
  const highlightScale = useRef(1)
  const fit = useMemo(() => {
    const detachedRoot = model.root.clone(true)
    const bounds = new Box3().setFromObject(detachedRoot)
    if (bounds.isEmpty()) throw new Error(`${spacecraft.name} has no measurable 3D geometry.`)
    const center = bounds.getCenter(new Vector3())
    const dimensions = bounds.getSize(new Vector3())
    return {
      center,
      dimensions,
      scale: size / Math.max(dimensions.x, dimensions.y, dimensions.z),
      min: bounds.min.clone(),
      max: bounds.max.clone(),
    }
  }, [model, size, spacecraft.name])
  const silhouette = useMemo(() => createSilhouette(model.root), [model])
  const outlineOpacity = useRef(0)
  const highlightColor = useMemo(() => new Color('#8cecff'), [])
  const emissiveMaterials = useMemo(() => {
    const materials: { material: MeshStandardMaterial; color: Color; intensity: number }[] = []
    model.root.traverse((object) => {
      if (!(object instanceof Mesh)) return
      const source = Array.isArray(object.material) ? object.material : [object.material]
      source.forEach((material) => {
        if (material instanceof MeshStandardMaterial) {
          materials.push({
            material,
            color: material.emissive.clone(),
            intensity: material.emissiveIntensity,
          })
        }
      })
    })
    return materials
  }, [model])

  useLayoutEffect(() => {
    const showHighlight = highlighted && !focused && !dimmed
    emissiveMaterials.forEach(({ material, color, intensity }) => {
      material.emissive.copy(color).lerp(highlightColor, showHighlight ? 0.34 : 0)
      material.emissiveIntensity = intensity + (showHighlight ? 0.24 : 0)
    })
  }, [dimmed, emissiveMaterials, focused, highlighted, highlightColor])

  useEffect(() => () => silhouette.dispose(), [silhouette])

  useLayoutEffect(() => {
    rootRef.current?.position.copy(orbit)
  }, [orbit])

  useLayoutEffect(() => {
    const branchState = branchModelRef.current
    const group = orbitModelRef.current
    if (focused) {
      focusedModelRef.current = group
      const center = fit.center
      const dimensions = fit.dimensions
      const toAnchor = (x: number, y: number, z: number) =>
        new Vector3(
          (center.x + dimensions.x * x - center.x) * fit.scale,
          (center.y + dimensions.y * y - center.y) * fit.scale,
          (center.z + dimensions.z * z - center.z) * fit.scale,
        )
      const corners: Vector3[] = []
      for (const x of [-0.5, 0.5]) {
        for (const y of [-0.5, 0.5]) {
          for (const z of [-0.5, 0.5]) corners.push(toAnchor(x, y, z))
        }
      }
      branchState.group = group
      branchState.anchors = [
        toAnchor(0, 0, 0),
        toAnchor(0.3, 0, 0),
        toAnchor(-0.3, 0, 0),
        toAnchor(0, 0.3, 0),
        toAnchor(0, -0.3, 0),
        toAnchor(0, 0, 0.3),
      ]
      branchState.bounds = corners
    }
    return () => {
      if (focusedModelRef.current === group) focusedModelRef.current = null
      if (branchState.group === group) {
        branchState.group = null
        branchState.anchors = []
        branchState.bounds = []
      }
    }
  }, [branchModelRef, fit, focused, focusedModelRef])

  useFrame((_, delta) => {
    const root = rootRef.current
    const group = orbitModelRef.current
    if (!root || !group) return

    progress.current.focus = stepToward(
      progress.current.focus,
      focused ? 1 : 0,
      delta,
      FOCUS_DURATION,
      reducedMotion,
    )
    progress.current.dim = stepToward(
      progress.current.dim,
      dimmed ? 1 : 0,
      delta,
      DIM_DURATION,
      reducedMotion,
    )
    const ef = easeInOutCubic(progress.current.focus)
    const ed = easeInOutCubic(progress.current.dim)

    highlightScale.current +=
      ((highlighted && !focused && !dimmed ? 1.08 : 1) - highlightScale.current) *
      (reducedMotion ? 1 : 1 - Math.exp(-delta * 8))

    const focusX = 0
    const baseX = orbit.x * (1 + 0.35 * ed)
    const baseY = orbit.y * (1 + 0.35 * ed)
    const baseZ = orbit.z - 2 * ed
    root.position.set(
      baseX + (focusX - baseX) * ef,
      baseY * (1 - ef),
      baseZ * (1 - ef),
    )

    const scale =
      (1 + (FOCUSED_MODEL_SCALE - 1) * ef) *
      (1 - ed) *
      (1 + (highlightScale.current - 1) * (1 - ef))
    group.scale.setScalar(Math.max(scale, 0.0001))
    root.visible = scale > 0.003

    if (!focused || ef < 1) {
      const baseSpin = reducedMotion ? 0.025 : 0.073 + (0.025 - 0.073) * ef
      const flourish = reducedMotion ? 0 : Math.sin(Math.PI * ef) * 0.5
      group.rotation.y += delta * (baseSpin + flourish)
    }

    const showHighlight = highlighted && !focused && !dimmed
    const targetOpacity = showHighlight ? 0.42 : 0
    outlineOpacity.current += (targetOpacity - outlineOpacity.current) * (1 - Math.exp(-delta * 7))
    silhouette.root.visible = outlineOpacity.current > 0.01
    if (silhouette.root.visible) {
      silhouette.materials.forEach((material) => {
        material.opacity = outlineOpacity.current
      })
    }
  })

  return (
    <group
      ref={rootRef}
      onPointerOver={(event) => {
        if (dimmed || focused) return
        event.stopPropagation()
        onHighlight(spacecraft.id)
      }}
      onPointerOut={(event) => {
        if (dimmed || focused) return
        event.stopPropagation()
        onHighlight(null)
      }}
      onPointerDown={(event) => {
        if (dimmed) return
        if (!focused && event.pointerType === 'touch') {
          onHighlight(spacecraft.id)
        }
      }}
      onClick={(event) => {
        if (dimmed) return
        event.stopPropagation()
        onSelect(spacecraft)
      }}
    >
      <group ref={orbitModelRef}>
        <group
          position={[-fit.center.x * fit.scale, -fit.center.y * fit.scale, -fit.center.z * fit.scale]}
          scale={fit.scale}
        >
          <primitive object={model.root} dispose={null} />
          <group position={fit.center} scale={1.045}>
            <primitive object={silhouette.root} dispose={null} />
          </group>
        </group>
      </group>
    </group>
  )
}

function OrbitingFleet({
  models,
  highlightedId,
  selectedId,
  reducedMotion,
  focusedModelRef,
  branchModelRef,
  cameraRef,
  onHighlight,
  onSelect,
}: {
  models: Map<string, LoadedModel>
  highlightedId: string | null
  selectedId: string | null
  reducedMotion: boolean
  focusedModelRef: RefObject<Group | null>
  branchModelRef: RefObject<SpacecraftBranchModelState>
  cameraRef: RefObject<Camera | null>
  onHighlight: (id: string | null) => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}) {
  const { camera, size: viewport } = useThree()
  const portrait = viewport.width < viewport.height
  const radiusX = portrait ? 1.52 : 4.25
  const radiusY = portrait ? 2.62 : 2.1
  const modelSize = portrait ? 0.72 : 1.02
  const fleetDistance = useRef(14)
  const cameraProgress = useRef(0)

  useLayoutEffect(() => {
    cameraRef.current = camera
    return () => {
      if (cameraRef.current === camera) cameraRef.current = null
    }
  }, [camera, cameraRef])

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = Math.max(viewport.width / viewport.height, 0.1)
    const tangent = Math.tan((camera.fov * Math.PI) / 360)
    const fitDistance = Math.max(radiusX / (tangent * aspect), radiusY / tangent)
    fleetDistance.current = fitDistance * 1.22 + 0.8
  }, [camera, radiusX, radiusY, viewport.height, viewport.width])

  useFrame((_, delta) => {
    if (!(camera instanceof PerspectiveCamera)) return
    cameraProgress.current = stepToward(
      cameraProgress.current,
      selectedId ? 1 : 0,
      delta,
      FOCUS_DURATION,
      reducedMotion,
    )
    const e = easeInOutCubic(cameraProgress.current)
    const aspect = Math.max(viewport.width / viewport.height, 0.1)
    const verticalHalfFov = (camera.fov * Math.PI) / 360
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
    const limitingHalfFov = Math.min(verticalHalfFov, horizontalHalfFov)
    const focusedModelSize = (portrait ? 0.72 : 1.02) * FOCUSED_MODEL_SCALE
    const focusDistance =
      focusedModelSize / (2 * Math.tan(limitingHalfFov) * FOCUSED_MODEL_SCREEN_FRACTION)
    const targetDistance = fleetDistance.current + (focusDistance - fleetDistance.current) * e
    const z = reducedMotion
      ? targetDistance
      : camera.position.z + (targetDistance - camera.position.z) * (1 - Math.exp(-delta * 6))

    camera.position.set(0, 0, z)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  })

  return (
    <>
      <color attach="background" args={['#020711']} />
      <fog attach="fog" args={['#020711', 15, 32]} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[4, 6, 8]} intensity={2.3} color="#dceeff" />
      <directionalLight position={[-6, -3, -4]} intensity={1.2} color="#347da4" />
      <pointLight position={[0, 0, 4]} intensity={8} distance={18} color="#6dcfff" />
      <Stars radius={80} depth={55} count={1500} factor={3} saturation={0.12} fade speed={0.2} />
      <group rotation={[0.12, 0, 0]}>
        {availableSpacecraftCatalog.map((spacecraft, index) => {
          const model = models.get(spacecraft.id)
          if (!model) return null
          const angle = (index / availableSpacecraftCatalog.length) * Math.PI * 2
          const position: [number, number, number] = [
            Math.cos(angle) * radiusX,
            Math.sin(angle) * radiusY,
            Math.sin(angle * 2) * 0.45,
          ]
          return (
            <OrbitingModel
              key={spacecraft.id}
              spacecraft={spacecraft}
              model={model}
              position={position}
              size={modelSize}
              reducedMotion={reducedMotion}
              highlighted={highlightedId === spacecraft.id}
              focused={selectedId === spacecraft.id}
              dimmed={selectedId !== null && spacecraft.id !== selectedId}
              focusedModelRef={focusedModelRef}
              branchModelRef={branchModelRef}
              onHighlight={onHighlight}
              onSelect={onSelect}
            />
          )
        })}
      </group>
    </>
  )
}

function LoadingOrbit() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"
      role="status"
      aria-label="Loading spacecraft models"
    >
      <div className="h-12 w-12 animate-spin rounded-full border border-sky-200/10 border-t-sky-200/70 shadow-[0_0_24px_rgba(99,223,255,0.16)]" />
    </div>
  )
}

export function SpacecraftOrbitGallery({
  selectedId,
  selectedModel,
  preloadedModels,
  initialLoadErrors,
  onCanvasReady,
  onCanvasFailure,
  onClose,
  onSelect,
}: SpacecraftOrbitGalleryProps) {
  const [models, setModels] = useState<Map<string, LoadedModel>>(
    () => selectedModel ? new Map([[selectedId, selectedModel]]) : new Map(),
  )
  const [loadErrors, setLoadErrors] = useState<string[]>(initialLoadErrors ?? [])
  const displayedModels = preloadedModels ?? models
  const displayedLoadErrors = initialLoadErrors ?? loadErrors
  const [loading, setLoading] = useState(!preloadedModels)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [selectedSpacecraftId, setSelectedSpacecraftId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const focusedModelRef = useRef<Group | null>(null)
  const branchModelRef = useRef<SpacecraftBranchModelState>({
    group: null,
    anchors: [],
    bounds: [],
  })
  const cameraRef = useRef<Camera | null>(null)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const closeTimer = useRef<number | null>(null)
  const preloadedDisposeTimer = useRef<number | null>(null)
  const callbacks = useRef({ onClose, onSelect })
  const canvasReady = useRef(false)
  const canvasUnavailableRef = useRef(false)
  const canvasReadyTimeout = useRef<number | null>(null)
  const [canvasUnavailable, setCanvasUnavailable] = useState(false)
  const reducedMotion = useAppReducedMotion()

  useEffect(() => {
    callbacks.current = { onClose, onSelect }
  }, [onClose, onSelect])

  const markCanvasReady = useCallback(() => {
    if (canvasUnavailableRef.current) return
    canvasReady.current = true
    if (canvasReadyTimeout.current !== null) {
      window.clearTimeout(canvasReadyTimeout.current)
      canvasReadyTimeout.current = null
    }
    onCanvasReady?.()
  }, [onCanvasReady])

  const markCanvasUnavailable = useCallback(() => {
    if (canvasReady.current || canvasUnavailableRef.current) return
    canvasUnavailableRef.current = true
    if (canvasReadyTimeout.current !== null) {
      window.clearTimeout(canvasReadyTimeout.current)
      canvasReadyTimeout.current = null
    }
    setCanvasUnavailable(true)
    onCanvasFailure?.()
  }, [onCanvasFailure])

  useEffect(() => {
    if (canvasReady.current || canvasUnavailableRef.current) return
    canvasReadyTimeout.current = window.setTimeout(markCanvasUnavailable, CANVAS_READY_TIMEOUT_MS)
    return () => {
      if (canvasReadyTimeout.current !== null) {
        window.clearTimeout(canvasReadyTimeout.current)
        canvasReadyTimeout.current = null
      }
    }
  }, [markCanvasUnavailable])

  const setHighlight = useCallback((id: string | null) => {
    setHighlightedId(id)
    document.body.style.cursor = id ? 'pointer' : ''
  }, [])

  const requestClose = useCallback((selection?: AvailableSpacecraft) => {
    if (closeTimer.current !== null) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      if (selection) callbacks.current.onSelect(selection)
      else callbacks.current.onClose()
      window.requestAnimationFrame(() => {
        document.getElementById('explore-models-button')?.focus()
      })
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220)
  }, [])

  useEffect(() => {
    if (preloadedModels) {
      if (preloadedDisposeTimer.current !== null) {
        window.clearTimeout(preloadedDisposeTimer.current)
        preloadedDisposeTimer.current = null
      }
      const ownedModels = [...preloadedModels.values()].filter((model) => model !== selectedModel)
      return () => {
        preloadedDisposeTimer.current = window.setTimeout(() => {
          ownedModels.forEach((model) => model.dispose())
          preloadedDisposeTimer.current = null
        }, 0)
      }
    }

    let cancelled = false
    let cursor = 0
    const ownedModels = new Set<LoadedModel>()
    const spacecrafts = availableSpacecraftCatalog

    const loadNext = async () => {
      while (!cancelled && cursor < spacecrafts.length) {
        const spacecraft = spacecrafts[cursor]
        cursor += 1
        let model: LoadedModel
        try {
          model = spacecraft.id === selectedId && selectedModel
            ? selectedModel
            : await loadSpacecraftModel(spacecraft)
          if (new Box3().setFromObject(model.root).isEmpty()) {
            if (model !== selectedModel) model.dispose()
            throw new Error('The registered model has no measurable geometry.')
          }
        } catch (error) {
          if (!cancelled) {
            console.error(`Failed to load ${spacecraft.name} in the orbit gallery.`, error)
            setLoadErrors((current) => [...current, spacecraft.id])
          }
          continue
        }

        if (cancelled) {
          if (model !== selectedModel) model.dispose()
          continue
        }

        if (model !== selectedModel) ownedModels.add(model)
        setModels((current) => new Map(current).set(spacecraft.id, model))
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(3, spacecrafts.length) }, () => loadNext()),
    ).finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
      ownedModels.forEach((model) => model.dispose())
    }
  }, [initialLoadErrors, preloadedModels, selectedId, selectedModel])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousCursor = document.body.style.cursor
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (selectedSpacecraftId) setSelectedSpacecraftId(null)
        else requestClose()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.body.style.cursor = previousCursor
      window.removeEventListener('keydown', onKeyDown)
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    }
  }, [requestClose, selectedSpacecraftId])

  const selectedSpacecraft = selectedSpacecraftId
    ? availableSpacecraftCatalog.find((spacecraft) => spacecraft.id === selectedSpacecraftId) ?? null
    : null

  const content = (
    <motion.div
      ref={dialogRef}
      className="fixed inset-0 z-[9999] overflow-hidden bg-[#020711]"
      role="dialog"
      aria-modal="true"
      aria-label="Spacecraft model selection"
      data-model-count={displayedModels.size}
      data-model-load-errors={displayedLoadErrors.join(',')}
      data-highlighted-model={highlightedId ?? focusedId ?? ''}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.72, ease: 'easeInOut' }}
      onPointerLeave={() => setHighlight(null)}
    >
      {canvasUnavailable ? (
        <div className="absolute inset-0 z-[1] flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_center,_#0b1d30_0%,_#020711_72%)] px-5 py-24">
          <div className="w-full max-w-3xl">
            <p className="mb-2 text-center text-xs font-medium uppercase tracking-[0.24em] text-sky-200/65">
              3D preview unavailable
            </p>
            <p className="mb-8 text-center text-sm text-slate-300/75">
              Choose a spacecraft from the list to continue.
            </p>
            <div className="grid max-h-[55vh] grid-cols-1 gap-3 overflow-y-auto sm:grid-cols-2">
              {availableSpacecraftCatalog.map((spacecraft) => (
                <button
                  key={spacecraft.id}
                  type="button"
                  onClick={() => setSelectedSpacecraftId(spacecraft.id)}
                  className="rounded-lg border border-white/10 bg-white/[0.035] px-4 py-3 text-left transition hover:border-sky-200/45 hover:bg-sky-200/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-200"
                >
                  <span className="block text-sm font-medium text-white/90">{spacecraft.name}</span>
                  <span className="mt-1 block text-xs text-slate-400">{spacecraft.type}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <GalleryCanvasBoundary onFailure={markCanvasUnavailable}>
          <Canvas
            aria-hidden="true"
            camera={{ position: [0, 0, 8], fov: 48 }}
            dpr={[0.85, 1]}
            gl={{ alpha: false, antialias: false, powerPreference: 'low-power' }}
            onCreated={markCanvasReady}
            onPointerMissed={() => setHighlight(null)}
          >
            <OrbitingFleet
              models={displayedModels}
              highlightedId={highlightedId ?? (selectedSpacecraftId ? null : focusedId)}
              selectedId={selectedSpacecraftId}
              reducedMotion={Boolean(reducedMotion)}
              focusedModelRef={focusedModelRef}
              branchModelRef={branchModelRef}
              cameraRef={cameraRef}
              onHighlight={setHighlight}
              onSelect={(spacecraft) => {
                setHighlight(null)
                setSelectedSpacecraftId(spacecraft.id)
              }}
            />
          </Canvas>
        </GalleryCanvasBoundary>
      )}

      {selectedSpacecraft && (
        <div
          aria-label="Drag to rotate the selected spacecraft"
          className="absolute inset-0 z-10 cursor-grab touch-none"
          onPointerDown={(event) => {
            event.preventDefault()
            event.currentTarget.setPointerCapture(event.pointerId)
            dragRef.current = {
              pointerId: event.pointerId,
              x: event.clientX,
              y: event.clientY,
            }
            event.currentTarget.style.cursor = 'grabbing'
          }}
          onPointerMove={(event) => {
            const drag = dragRef.current
            const model = focusedModelRef.current
            if (!drag || drag.pointerId !== event.pointerId || !model) return
            model.rotation.y += (event.clientX - drag.x) * 0.01
            model.rotation.x = Math.max(
              -Math.PI / 2,
              Math.min(Math.PI / 2, model.rotation.x + (event.clientY - drag.y) * 0.01),
            )
            drag.x = event.clientX
            drag.y = event.clientY
          }}
          onPointerUp={(event) => {
            if (dragRef.current?.pointerId !== event.pointerId) return
            dragRef.current = null
            event.currentTarget.releasePointerCapture(event.pointerId)
            event.currentTarget.style.cursor = 'grab'
          }}
          onPointerCancel={(event) => {
            dragRef.current = null
            event.currentTarget.style.cursor = 'grab'
          }}
        />
      )}

      {selectedSpacecraft && (
        <SpacecraftInformationBranches
          key={selectedSpacecraft.id}
          spacecraft={selectedSpacecraft}
          cameraRef={cameraRef}
          modelRef={branchModelRef}
          reducedMotion={Boolean(reducedMotion)}
        />
      )}

      {loading && <LoadingOrbit />}

      {selectedSpacecraft && (
        <>
          <button
            type="button"
            onClick={() => setSelectedSpacecraftId(null)}
            className="absolute left-5 top-5 z-20 rounded-full border border-white/20 bg-[#07121c]/75 px-4 py-2 text-xs font-medium text-white/80 backdrop-blur-sm transition hover:border-sky-200/55 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-200 sm:left-8 sm:top-8"
          >
            ← All spacecraft
          </button>
          <div className="pointer-events-none absolute bottom-6 right-6 z-20 flex items-center gap-4 sm:bottom-8 sm:right-8">
            <div className="hidden text-right sm:block">
              <p className="spacecraft-selected-name">{selectedSpacecraft.name}</p>
              <p className="spacecraft-selected-agency">{selectedSpacecraft.agency}</p>
            </div>
            <button
              type="button"
              onClick={() => requestClose(selectedSpacecraft)}
              className="pointer-events-auto rounded-full border border-white/20 bg-[#07121c]/80 px-5 py-3 text-sm font-medium text-white/90 backdrop-blur-sm transition hover:border-sky-200/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-200"
            >
              Choose model
            </button>
          </div>
        </>
      )}

      <button
        ref={closeButtonRef}
        type="button"
        aria-label="Close spacecraft gallery"
        onClick={() => requestClose()}
        className="absolute right-5 top-5 z-20 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-[#07121c]/55 text-white/75 backdrop-blur-sm transition hover:border-sky-200/55 hover:text-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-sky-200 sm:right-8 sm:top-8"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
          <path d="m6 6 12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      <div className="sr-only">
        {availableSpacecraftCatalog.map((spacecraft) => (
          <button
            key={spacecraft.id}
            type="button"
            aria-label={`Select ${spacecraft.name}, ${spacecraft.type}`}
            aria-pressed={spacecraft.id === selectedId}
            onFocus={() => setFocusedId(spacecraft.id)}
            onBlur={() => setFocusedId(null)}
            onClick={() => setSelectedSpacecraftId(spacecraft.id)}
          />
        ))}
      </div>
    </motion.div>
  )

  return createPortal(content, document.body)
}
