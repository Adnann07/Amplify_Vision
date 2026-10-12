import { PerspectiveCamera } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { SRGBColorSpace, Texture, TextureLoader } from 'three'
import {
  computeCameraGroundPoint,
  computeCameraDirection,
  computeSyntheticOrbit,
  createGibsAimpointImageUrl,
} from './observationCameraMath'

interface OnboardObservationCameraProps {
  body: string
  coordinates: [longitude: number, latitude: number] | null
  textureUrl: string | null
  imageryDate: string
  imageryRetry: number
  onRetryImagery: () => void
  elapsedSeconds: number
  paused: boolean
  azimuthDegrees: number
  elevationDegrees: number
  fieldOfViewDegrees: number
}

function EarthSurface({ texture }: { texture: Texture | null }) {
  return (
    <mesh rotation={[0, -Math.PI / 2, 0]}>
      <sphereGeometry args={[1, 96, 64]} />
      <meshBasicMaterial
        map={texture ?? undefined}
        color={texture ? '#ffffff' : '#102435'}
      />
    </mesh>
  )
}

function PointedCamera({
  body,
  coordinates,
  elapsedSeconds,
  azimuthDegrees,
  elevationDegrees,
  paused,
}: OnboardObservationCameraProps) {
  const { camera } = useThree()
  const simulatedMet = useRef(elapsedSeconds)

  useEffect(() => {
    simulatedMet.current = elapsedSeconds
  }, [elapsedSeconds])

  useFrame((_, delta) => {
    if (!paused) simulatedMet.current += delta * 15
    const orbit = computeSyntheticOrbit(simulatedMet.current, coordinates)
    const direction = computeCameraDirection(orbit, azimuthDegrees, elevationDegrees)
    camera.position.set(...orbit.position)
    camera.up.set(...orbit.north)
    camera.lookAt(
      orbit.position[0] + direction[0] * 10,
      orbit.position[1] + direction[1] * 10,
      orbit.position[2] + direction[2] * 10,
    )
  })

  if (body.toLowerCase() === 'earth') {
    return null
  }

  const bodyColor = body.toLowerCase() === 'mars' ? '#a9563e'
    : body.toLowerCase() === 'moon' ? '#85858b'
      : body.toLowerCase() === 'jupiter' ? '#b78d67'
        : body.toLowerCase() === 'saturn' ? '#c4b18d'
          : '#8b7160'
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 48]} />
      <meshStandardMaterial color={bodyColor} roughness={1} />
    </mesh>
  )
}

export function OnboardObservationCamera(props: OnboardObservationCameraProps) {
  const orbit = computeSyntheticOrbit(props.elapsedSeconds, props.coordinates)
  const groundPoint = computeCameraGroundPoint(
    orbit,
    props.azimuthDegrees,
    props.elevationDegrees,
  )
  const mapImageUrl = groundPoint
    ? createGibsAimpointImageUrl(groundPoint, props.imageryDate, props.fieldOfViewDegrees)
    : null
  const [failedMapUrl, setFailedMapUrl] = useState<string | null>(null)
  const mapImageRequestKey = `${mapImageUrl ?? ''}:${props.imageryRetry}`
  const mapImageFailed = failedMapUrl === mapImageRequestKey
  const [displayedMapImage, setDisplayedMapImage] = useState<{
    url: string
    regionCenter: [number, number]
  } | null>(null)
  const mapImageLoading = Boolean(
    mapImageUrl && displayedMapImage?.url !== mapImageUrl && !mapImageFailed,
  )
  const [textureResource, setTextureResource] = useState<{
    url: string
    texture: Texture | null
    status: 'ready' | 'error'
  } | null>(null)
  const earthTexture = textureResource?.url === props.textureUrl ? textureResource.texture : null
  const textureStatus = !props.textureUrl
    ? 'error'
    : textureResource?.url === props.textureUrl
      ? textureResource.status
      : 'loading'

  useEffect(() => {
    if (props.body.toLowerCase() !== 'earth' || !mapImageUrl || mapImageFailed) return
    let active = true
    const image = new Image()
    image.onload = () => {
      if (!active) return
      const bounds = new URL(mapImageUrl).searchParams.get('BBOX')?.split(',').map(Number)
      if (!bounds || bounds.length !== 4) {
        setFailedMapUrl(mapImageRequestKey)
        return
      }
      const [south, west, north, east] = bounds
      setDisplayedMapImage({
        url: mapImageUrl,
        regionCenter: [(west + east) / 2, (south + north) / 2],
      })
      setFailedMapUrl(null)
    }
    image.onerror = () => {
      if (!active) return
      setFailedMapUrl(mapImageRequestKey)
    }
    image.src = mapImageUrl
    return () => {
      active = false
      image.onload = null
      image.onerror = null
    }
  }, [mapImageFailed, mapImageRequestKey, mapImageUrl, props.body])

  useEffect(() => {
    const textureUrl = props.textureUrl
    if (!textureUrl) return
    let active = true
    let loadedTexture: Texture | null = null
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      textureUrl,
      (texture) => {
        loadedTexture = texture
        if (!active) {
          texture.dispose()
          return
        }
        texture.colorSpace = SRGBColorSpace
        texture.anisotropy = 8
        setTextureResource({ url: textureUrl, texture, status: 'ready' })
      },
      undefined,
      () => {
        if (active) {
          setTextureResource({ url: textureUrl, texture: null, status: 'error' })
        }
      },
    )
    return () => {
      active = false
      loadedTexture?.dispose()
    }
  }, [props.imageryRetry, props.textureUrl])

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
      <section className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-2 border border-slate-800 bg-[#050c14] px-3 py-2">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-cyan-200">NASA GIBS · MODIS Terra true-color reference</p>
            <p className="mt-1 text-[8px] text-slate-400">
              Calculated camera aimpoint {groundPoint ? `${groundPoint[1].toFixed(2)}°, ${groundPoint[0].toFixed(2)}°` : 'is beyond the Earth horizon'}
            </p>
          </div>
          <span className="text-[8px] uppercase tracking-wide text-amber-200">Archived map layer · not a spacecraft capture</span>
        </header>
        <div className="relative grid h-[300px] place-items-center overflow-hidden border-x border-b border-slate-800 bg-[#020912] sm:h-[390px]">
          {props.body.toLowerCase() === 'earth' && mapImageUrl && displayedMapImage ? (
            <img
              src={displayedMapImage.url}
              alt={`NASA MODIS Terra regional imagery centered near ${displayedMapImage.regionCenter[1].toFixed(2)} degrees latitude, ${displayedMapImage.regionCenter[0].toFixed(2)} degrees longitude on ${props.imageryDate}`}
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="max-w-md p-8 text-center" role="status">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-200">
                {props.body.toLowerCase() !== 'earth'
                  ? `${props.body} GIBS ground-view texture not configured`
                  : !groundPoint ? 'Camera is pointing beyond the horizon'
                    : mapImageLoading ? 'Loading NASA imagery for this view'
                    : 'NASA GIBS image unavailable for this view'}
              </p>
              <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
                {props.body.toLowerCase() === 'earth'
                  ? 'No image is substituted. The NASA request follows the calculated camera aimpoint, selected imagery date, and field of view.'
                  : 'Earth imagery is not used as a substitute for this planetary target.'}
              </p>
              {props.body.toLowerCase() === 'earth' && mapImageUrl && !mapImageLoading && (
                <button
                  type="button"
                  onClick={props.onRetryImagery}
                  className="mt-3 border border-cyan-300/30 px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-cyan-100"
                >
                  Retry NASA request
                </button>
              )}
            </div>
          )}
          {props.body.toLowerCase() === 'earth' && displayedMapImage && (
            <>
              <div className="pointer-events-none absolute bottom-2 left-2 border border-slate-700/70 bg-[#020912]/85 px-2 py-1 text-[8px] uppercase text-slate-200">
                {props.imageryDate} · {displayedMapImage.regionCenter[1].toFixed(2)}°, {displayedMapImage.regionCenter[0].toFixed(2)}° · NASA regional reference
              </div>
              {mapImageLoading && (
                <div className="pointer-events-none absolute right-2 top-2 border border-cyan-300/30 bg-[#020912]/90 px-2 py-1 text-[8px] uppercase text-cyan-100">
                  Loading new camera region
                </div>
              )}
              {mapImageFailed && (
                <div className="absolute right-2 top-2 flex items-center gap-2 border border-amber-300/30 bg-[#020912]/90 px-2 py-1 text-[8px] text-amber-100">
                  <span>NASA image unavailable · showing last loaded region</span>
                  <button type="button" onClick={props.onRetryImagery} className="underline">Retry</button>
                </div>
              )}
            </>
          )}
        </div>
        <p className="border-x border-b border-slate-800 px-3 py-2 text-[8px] leading-relaxed text-slate-500">
          NASA's date-specific MODIS image is a real map reference for the simulated camera's calculated ray/sphere intersection. The NASA snapshot region updates as the synthetic viewpoint moves and narrows with camera zoom; it is an illustrative extent, not an exact camera footprint or an image captured by the game's spacecraft. MODIS cloud cover and orbit swath gaps are preserved.
        </p>
      </section>
      <section className="min-w-0">
        <header className="border border-slate-800 bg-[#050c14] px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-cyan-200">3D simulated spacecraft geometry</p>
          <p className="mt-1 text-[8px] text-slate-400">
            {props.body.toLowerCase() === 'earth'
              ? `NASA globe texture ${textureStatus} · ${props.imageryDate}`
              : `${props.body} illustrative surface`}
          </p>
        </header>
        <div className="relative h-[300px] overflow-hidden border-x border-b border-slate-800 bg-[#020912] sm:h-[390px]">
          <Canvas dpr={[1, 1.5]}>
            <PerspectiveCamera makeDefault position={orbit.position} fov={props.fieldOfViewDegrees} near={0.01} far={20} />
            <ambientLight intensity={1.15} />
            <directionalLight position={[3, 4, 3]} intensity={1.25} color="#dbeafe" />
            <PointedCamera {...props} />
            {props.body.toLowerCase() === 'earth' && <EarthSurface texture={earthTexture} />}
          </Canvas>
          <div className="pointer-events-none absolute left-2 top-2 border border-cyan-300/25 bg-[#020912]/85 px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-cyan-100">
            {props.paused ? 'MET paused' : 'MET tracking'}
          </div>
          <div className="pointer-events-none absolute bottom-2 left-2 right-2 flex flex-wrap justify-between gap-1 border border-slate-700/70 bg-[#020912]/85 px-2 py-1 text-[8px] uppercase text-slate-300">
            <span>Subpoint {orbit.latitudeDegrees.toFixed(1)}°, {orbit.longitudeDegrees.toFixed(1)}°</span>
            <span>FOV {props.fieldOfViewDegrees}°</span>
          </div>
        </div>
        <p className="border-x border-b border-slate-800 px-3 py-2 text-[8px] leading-relaxed text-slate-500">
          Synthetic orbit and attitude are illustrative; spacecraft flight telemetry is not modeled.
        </p>
      </section>
    </div>
  )
}
