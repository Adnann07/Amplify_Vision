import { Canvas, useFrame } from '@react-three/fiber'
import { motion, useReducedMotion } from 'framer-motion'
import { Box3, BufferGeometry, type BufferAttribute } from 'three'
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { availableSpacecraftCatalog } from '../../data/spacecraft'
import { loadSpacecraftModel, type LoadedModel } from './spacecraftModelLoader'

const SpacecraftOrbitGallery = lazy(() =>
  import('./SpacecraftOrbitGallery').then((module) => ({
    default: module.SpacecraftOrbitGallery,
  })),
)

const WARP_DURATION_MS = 3600
const WARP_FADE_OUT_MS = 800
const STAR_COUNT = 1100
const FIELD_DEPTH = 70

interface PreloadedModels {
  models: Map<string, LoadedModel>
  errors: string[]
}

class StarField {
  readonly starPositions = new Float32Array(STAR_COUNT * 3)
  readonly trailPositions = new Float32Array(STAR_COUNT * 6)

  constructor() {
    for (let index = 0; index < STAR_COUNT; index += 1) {
      const offset = index * 3
      const trailOffset = index * 6
      const x = (Math.random() - 0.5) * 46
      const y = (Math.random() - 0.5) * 28
      const z = -1 - Math.random() * (FIELD_DEPTH - 1)
      this.starPositions[offset] = x
      this.starPositions[offset + 1] = y
      this.starPositions[offset + 2] = z
      this.trailPositions[trailOffset] = x
      this.trailPositions[trailOffset + 1] = y
      this.trailPositions[trailOffset + 2] = z
      this.trailPositions[trailOffset + 3] = x
      this.trailPositions[trailOffset + 4] = y
      this.trailPositions[trailOffset + 5] = z - 0.05
    }
  }

  advance(delta: number, progress: number) {
    const speed = 10 + 66 * progress * progress
    const trailLength = Math.min(0.05 + speed * 0.065, 5)
    const travel = speed * Math.min(delta, 0.05)

    for (let index = 0; index < STAR_COUNT; index += 1) {
      const offset = index * 3
      const trailOffset = index * 6
      let z = this.starPositions[offset + 2] + travel
      if (z > -0.8) z = -FIELD_DEPTH + Math.random() * 5
      const x = this.starPositions[offset]
      const y = this.starPositions[offset + 1]
      this.starPositions[offset + 2] = z
      this.trailPositions[trailOffset] = x
      this.trailPositions[trailOffset + 1] = y
      this.trailPositions[trailOffset + 2] = z
      this.trailPositions[trailOffset + 3] = x
      this.trailPositions[trailOffset + 4] = y
      this.trailPositions[trailOffset + 5] = z - trailLength
    }
  }
}

function WarpingStars({ reducedMotion }: { reducedMotion: boolean }) {
  const starGeometry = useRef<BufferGeometry>(null)
  const trailGeometry = useRef<BufferGeometry>(null)
  const field = useMemo(() => new StarField(), [])
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    if (reducedMotion) return
    elapsed.current += delta
    const progress = Math.min(elapsed.current / (WARP_DURATION_MS / 1000), 1)
    field.advance(delta, progress)

    const stars = starGeometry.current?.getAttribute('position') as BufferAttribute | undefined
    const trails = trailGeometry.current?.getAttribute('position') as BufferAttribute | undefined
    if (stars) stars.needsUpdate = true
    if (trails) trails.needsUpdate = true
  })

  return (
    <>
      <points>
        <bufferGeometry ref={starGeometry}>
          <bufferAttribute attach="attributes-position" args={[field.starPositions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          color="#d9f5ff"
          size={0.085}
          sizeAttenuation
          transparent
          opacity={0.9}
          depthWrite={false}
        />
      </points>
      {!reducedMotion && (
        <lineSegments>
          <bufferGeometry ref={trailGeometry}>
            <bufferAttribute attach="attributes-position" args={[field.trailPositions, 3]} />
          </bufferGeometry>
          <lineBasicMaterial
            color="#6fdcff"
            transparent
            opacity={0.56}
            depthWrite={false}
          />
        </lineSegments>
      )}
    </>
  )
}

export function SpaceWarpTransition({
  selectedId,
  onClose,
  onSelect,
}: {
  selectedId: string
  onClose: () => void
  onSelect: (spacecraft: (typeof availableSpacecraftCatalog)[number]) => void
}) {
  const reducedMotion = useReducedMotion()
  const transferredModels = useRef(false)
  const [preloaded, setPreloaded] = useState<PreloadedModels | null>(null)
  const [warpFinished, setWarpFinished] = useState(false)
  const [galleryReady, setGalleryReady] = useState(false)
  const [transitionFinished, setTransitionFinished] = useState(false)
  const exiting = warpFinished && preloaded !== null && galleryReady

  useEffect(() => {
    let cancelled = false
    let cursor = 0
    const models = new Map<string, LoadedModel>()
    const errors: string[] = []
    const spacecrafts = availableSpacecraftCatalog

    const loadNext = async () => {
      while (!cancelled && cursor < spacecrafts.length) {
        const spacecraft = spacecrafts[cursor]
        cursor += 1
        try {
          const model = await loadSpacecraftModel(spacecraft)
          if (cancelled) {
            model.dispose()
            continue
          }
          if (new Box3().setFromObject(model.root).isEmpty()) {
            model.dispose()
            throw new Error('The registered model has no measurable geometry.')
          }
          models.set(spacecraft.id, model)
        } catch (error) {
          if (cancelled) continue
          console.error(`Failed to load ${spacecraft.name} in the orbit gallery.`, error)
          errors.push(spacecraft.id)
        }
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(3, spacecrafts.length) }, () => loadNext()),
    ).then(() => {
      if (cancelled) return
      transferredModels.current = true
      setPreloaded({ models, errors })
    })

    const timer = window.setTimeout(
      () => setWarpFinished(true),
      reducedMotion ? 100 : WARP_DURATION_MS,
    )

    return () => {
      cancelled = true
      window.clearTimeout(timer)
      if (!transferredModels.current) models.forEach((model) => model.dispose())
    }
  }, [reducedMotion])

  return (
    <>
      {preloaded && (
        <Suspense fallback={null}>
          <SpacecraftOrbitGallery
            selectedId={selectedId}
            selectedModel={null}
            preloadedModels={preloaded.models}
            initialLoadErrors={preloaded.errors}
            onClose={onClose}
            onSelect={onSelect}
            onCanvasReady={() => setGalleryReady(true)}
          />
        </Suspense>
      )}
      {!transitionFinished && (
        <motion.main
          className="fixed inset-0 z-[10000] overflow-hidden bg-[#020711]"
          aria-hidden="true"
          initial={reducedMotion ? false : { opacity: 0 }}
          animate={{ opacity: exiting ? 0 : 1 }}
          transition={{
            duration: reducedMotion ? 0 : exiting ? WARP_FADE_OUT_MS / 1000 : 1.2,
            ease: 'easeInOut',
          }}
          onAnimationComplete={() => {
            if (exiting) setTransitionFinished(true)
          }}
        >
          <Canvas
            aria-hidden="true"
            camera={{ position: [0, 0, 0], fov: 68, near: 0.1, far: 100 }}
            dpr={[1, 1.5]}
            gl={{ alpha: false, antialias: false, powerPreference: 'low-power' }}
          >
            <color attach="background" args={['#020711']} />
            <WarpingStars reducedMotion={Boolean(reducedMotion)} />
          </Canvas>
        </motion.main>
      )}
    </>
  )
}
