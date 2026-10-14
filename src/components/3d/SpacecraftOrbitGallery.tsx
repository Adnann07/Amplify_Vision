import { Stars } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { motion, useReducedMotion } from 'framer-motion'
import {
  AdditiveBlending,
  BackSide,
  Box3,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  Vector3,
} from 'three'
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { availableSpacecraftCatalog } from '../../data/spacecraft'
import { loadSpacecraftModel, type LoadedModel } from './spacecraftModelLoader'

type AvailableSpacecraft = (typeof availableSpacecraftCatalog)[number]

interface SpacecraftOrbitGalleryProps {
  selectedId: string
  selectedModel: LoadedModel | null
  onClose: () => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}

interface GalleryCanvasBoundaryProps {
  children: ReactNode
}

interface GalleryCanvasBoundaryState {
  failed: boolean
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
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

function createSilhouette(root: Group) {
  const silhouette = root.clone(true)
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
  onHighlight,
  onSelect,
}: {
  spacecraft: AvailableSpacecraft
  model: LoadedModel
  position: [number, number, number]
  size: number
  reducedMotion: boolean
  highlighted: boolean
  onHighlight: (id: string | null) => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}) {
  const orbitModelRef = useRef<Group>(null)
  const fit = useMemo(() => {
    const detachedRoot = model.root.clone(true)
    const bounds = new Box3().setFromObject(detachedRoot)
    if (bounds.isEmpty()) throw new Error(`${spacecraft.name} has no measurable 3D geometry.`)
    const center = bounds.getCenter(new Vector3())
    const dimensions = bounds.getSize(new Vector3())
    return {
      center,
      scale: size / Math.max(dimensions.x, dimensions.y, dimensions.z),
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

  useEffect(() => () => silhouette.dispose(), [silhouette])

  useFrame((_, delta) => {
    const group = orbitModelRef.current
    if (!group || document.hidden) return

    const targetScale = highlighted ? 1.08 : 1
    if (reducedMotion) group.scale.setScalar(targetScale)
    else group.scale.setScalar(group.scale.x + (targetScale - group.scale.x) * (1 - Math.exp(-delta * 6)))

    group.rotation.y += delta * (reducedMotion ? 0.025 : 0.073)

    const targetOpacity = highlighted ? 0.42 : 0
    outlineOpacity.current += (targetOpacity - outlineOpacity.current) * (1 - Math.exp(-delta * 7))
    silhouette.materials.forEach((material) => {
      material.opacity = outlineOpacity.current
      material.visible = outlineOpacity.current > 0.01
    })
    emissiveMaterials.forEach(({ material, color, intensity }) => {
      material.emissive.copy(color).lerp(highlightColor, highlighted ? 0.34 : 0)
      material.emissiveIntensity = intensity + (highlighted ? 0.24 : 0)
    })
  })

  return (
    <group
      position={position}
      onPointerOver={(event) => {
        event.stopPropagation()
        onHighlight(spacecraft.id)
      }}
      onPointerOut={(event) => {
        event.stopPropagation()
        onHighlight(null)
      }}
      onPointerDown={(event) => {
        if (event.pointerType === 'touch') onHighlight(spacecraft.id)
      }}
      onClick={(event) => {
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
  reducedMotion,
  onHighlight,
  onSelect,
}: {
  models: Map<string, LoadedModel>
  highlightedId: string | null
  reducedMotion: boolean
  onHighlight: (id: string | null) => void
  onSelect: (spacecraft: AvailableSpacecraft) => void
}) {
  const { camera, size: viewport } = useThree()
  const portrait = viewport.width < viewport.height
  const radiusX = portrait ? 1.52 : 4.25
  const radiusY = portrait ? 2.62 : 2.1
  const modelSize = portrait ? 0.72 : 1.02

  useLayoutEffect(() => {
    if (!(camera instanceof PerspectiveCamera)) return
    const aspect = Math.max(viewport.width / viewport.height, 0.1)
    const tangent = Math.tan((camera.fov * Math.PI) / 360)
    const fitDistance = Math.max(radiusX / (tangent * aspect), radiusY / tangent)
    camera.position.set(0, 0, fitDistance * 1.22 + 0.8)
    camera.lookAt(0, 0, 0)
    camera.updateProjectionMatrix()
  }, [camera, radiusX, radiusY, viewport.height, viewport.width])

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
  onClose,
  onSelect,
}: SpacecraftOrbitGalleryProps) {
  const [models, setModels] = useState<Map<string, LoadedModel>>(
    () => selectedModel ? new Map([[selectedId, selectedModel]]) : new Map(),
  )
  const [loadErrors, setLoadErrors] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const closeTimer = useRef<number | null>(null)
  const callbacks = useRef({ onClose, onSelect })
  const reducedMotion = useReducedMotion()

  useEffect(() => {
    callbacks.current = { onClose, onSelect }
  }, [onClose, onSelect])

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
  }, [selectedId, selectedModel])

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    const previousCursor = document.body.style.cursor
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestClose()
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
  }, [requestClose])

  const content = (
    <motion.div
      ref={dialogRef}
      className="fixed inset-0 z-[9999] overflow-hidden bg-[#020711]"
      role="dialog"
      aria-modal="true"
      aria-label="Spacecraft model selection"
      data-model-count={models.size}
      data-model-load-errors={loadErrors.join(',')}
      data-highlighted-model={highlightedId ?? focusedId ?? ''}
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: closing ? 0 : 1 }}
      transition={{ duration: reducedMotion ? 0 : 0.22, ease: 'easeOut' }}
      onPointerLeave={() => setHighlight(null)}
    >
      <GalleryCanvasBoundary>
        <Canvas
          aria-hidden="true"
          camera={{ position: [0, 0, 8], fov: 48 }}
          dpr={[1, 1.25]}
          gl={{ alpha: false, antialias: true, powerPreference: 'low-power' }}
          onPointerMissed={() => setHighlight(null)}
        >
          <OrbitingFleet
            models={models}
            highlightedId={highlightedId ?? focusedId}
            reducedMotion={Boolean(reducedMotion)}
            onHighlight={setHighlight}
            onSelect={requestClose}
          />
        </Canvas>
      </GalleryCanvasBoundary>

      {loading && <LoadingOrbit />}

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
            onClick={() => requestClose(spacecraft)}
          />
        ))}
      </div>
    </motion.div>
  )

  return createPortal(content, document.body)
}
