import { Box3 } from 'three'
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import { availableSpacecraftCatalog } from '../../data/spacecraft'
import { useAppReducedMotion } from '../../utils/useAppReducedMotion'
import { loadSpacecraftModel, type LoadedModel } from './spacecraftModelLoader'
import './SpaceWarpTransition.css'

const SpacecraftOrbitGallery = lazy(() =>
  import('./SpacecraftOrbitGallery').then((module) => ({
    default: module.SpacecraftOrbitGallery,
  })),
)

const WARP_DURATION_MS = 3600

interface PreloadedModels {
  models: Map<string, LoadedModel>
  errors: string[]
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
  const reducedMotion = useAppReducedMotion()
  const transferredModels = useRef(false)
  const [preloaded, setPreloaded] = useState<PreloadedModels | null>(null)
  const [preloadComplete, setPreloadComplete] = useState(false)
  const [warpFinished, setWarpFinished] = useState(false)
  const [galleryReady, setGalleryReady] = useState(false)
  const [transitionFinished, setTransitionFinished] = useState(false)
  const exiting = warpFinished && preloadComplete && galleryReady
  const markGalleryReady = useCallback(() => setGalleryReady(true), [])

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
          setPreloaded({ models: new Map(models), errors: [...errors] })
        } catch (error) {
          if (cancelled) continue
          console.error(`Failed to load ${spacecraft.name} in the orbit gallery.`, error)
          errors.push(spacecraft.id)
          setPreloaded({ models: new Map(models), errors: [...errors] })
        }
      }
    }

    void Promise.all(
      Array.from({ length: Math.min(2, spacecrafts.length) }, () => loadNext()),
    ).then(() => {
      if (cancelled) return
      transferredModels.current = true
      setPreloaded({ models: new Map(models), errors: [...errors] })
      setPreloadComplete(true)
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
      {preloaded && (preloaded.models.size > 0 || preloadComplete) && (
        <Suspense fallback={null}>
          <SpacecraftOrbitGallery
            selectedId={selectedId}
            selectedModel={null}
            preloadedModels={preloaded.models}
            initialLoadErrors={preloaded.errors}
            onClose={onClose}
            onSelect={onSelect}
            onCanvasReady={markGalleryReady}
            onCanvasFailure={markGalleryReady}
          />
        </Suspense>
      )}
      {!transitionFinished && (
        <main
          className={[
            'hyperspace-transition',
            exiting ? 'is-exiting' : '',
            reducedMotion ? 'is-reduced-motion' : '',
          ].filter(Boolean).join(' ')}
          aria-hidden="true"
          onTransitionEnd={(event) => {
            if (
              exiting &&
              event.target === event.currentTarget &&
              event.propertyName === 'opacity'
            ) {
              setTransitionFinished(true)
            }
          }}
        >
          <div className="hyperspace-transition__stars hyperspace-transition__stars--distant" />
          <div className="hyperspace-transition__stars hyperspace-transition__stars--mid" />
          <div className="hyperspace-transition__streaks" />
          <div className="hyperspace-transition__core" />
        </main>
      )}
    </>
  )
}
