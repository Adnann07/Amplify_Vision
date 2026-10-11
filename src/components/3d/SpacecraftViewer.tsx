import { OrbitControls, Sparkles, Stars } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  Box3,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Sphere,
  Texture,
  Vector3,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { SpacecraftSpec } from '../../data/spacecraft'
import {
  antennaOptions,
  engineOptions,
  instrumentOptions,
  solarPanelOptions,
  type BuildComponentId,
  type SpacecraftBuild,
} from '../../data/spacecraftBuild'

interface SpacecraftViewerProps {
  spacecraft: SpacecraftSpec
  build: SpacecraftBuild
}

interface LoadedModel {
  root: Group
  dispose: () => void
}

type ViewerLoadState =
  | { spacecraftId: string; status: 'loading' }
  | { spacecraftId: string; status: 'unavailable'; reason: string }
  | { spacecraftId: string; status: 'error'; message: string }
  | { spacecraftId: string; status: 'ready'; model: LoadedModel }

function disposeObject(root: Group) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()

  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]

    for (const material of meshMaterials) {
      materials.add(material)
      for (const value of Object.values(material)) {
        if (value instanceof Texture) textures.add(value)
      }
    }
  })

  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => texture.dispose())
}

function centerGeometry(source: BufferGeometry) {
  const geometry = source.clone()
  geometry.computeBoundingBox()
  const center = geometry.boundingBox?.getCenter(new Vector3())
  if (!center) throw new Error('STL model has no measurable geometry.')
  geometry.translate(-center.x, -center.y, -center.z)
  return geometry
}

function componentForPath(path: string): BuildComponentId | undefined {
  const name = path.toLowerCase()
  if (name.includes('dish') || name.includes('antenna')) return 'antenna'
  if (name.includes('wing') || name.includes('solar')) return 'solarPanel'
  if (name.includes('instrument') || name.includes('sensor')) return 'instrument'
  return undefined
}

function splitSolarWingGeometry(source: BufferGeometry) {
  const positions = source.getAttribute('position')
  const bounds = source.boundingBox ?? source.computeBoundingBox()
  if (!bounds) throw new Error('Solar wing model has no measurable geometry.')

  const midpoint = (bounds.min.x + bounds.max.x) / 2
  const vertices: [number[], number[]] = [[], []]

  for (let index = 0; index < positions.count; index += 3) {
    const centroidX =
      (positions.getX(index) + positions.getX(index + 1) + positions.getX(index + 2)) / 3
    const side = centroidX < midpoint ? 0 : 1

    for (let vertex = 0; vertex < 3; vertex += 1) {
      const positionIndex = index + vertex
      vertices[side].push(
        positions.getX(positionIndex),
        positions.getY(positionIndex),
        positions.getZ(positionIndex),
      )
    }
  }

  return vertices.map((sideVertices) => {
    if (sideVertices.length === 0) throw new Error('Solar wing model could not be split.')
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(sideVertices, 3))
    geometry.computeVertexNormals()
    geometry.rotateZ(Math.PI / 2)
    return centerGeometry(geometry)
  })
}

async function loadSpacecraftModel(spacecraft: SpacecraftSpec): Promise<LoadedModel> {
  const model = spacecraft.model
  if (model.format === 'unavailable') throw new Error('This spacecraft has no verified 3D model.')

  if (model.format === 'glb') {
    const dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath(`${import.meta.env.BASE_URL}draco/`)
    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(dracoLoader)
    const gltf = await gltfLoader.loadAsync(model.modelPath).finally(() => {
      dracoLoader.dispose()
    })

    const root = new Group()
    root.add(gltf.scene)
    root.traverse((object) => {
      if (object instanceof Mesh) {
        object.userData.component = componentForPath(object.name)
        const materials = Array.isArray(object.material) ? object.material : [object.material]
        materials.forEach((material) => {
          if (material.name.toLowerCase().includes('solarpanel')) material.visible = false
        })
      }
    })
    return { root, dispose: () => disposeObject(root) }
  }

  const stlLoader = new STLLoader()
  const paths = [
    ...new Set([
      ...model.parts.map((part) => part.path),
      ...(model.solarWings ? [model.solarWings.path] : []),
    ]),
  ]
  const results = await Promise.allSettled(paths.map((path) => stlLoader.loadAsync(path)))
  const failedResult = results.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )

  if (failedResult) {
    results.forEach((result) => {
      if (result.status === 'fulfilled') result.value.dispose()
    })
    throw failedResult.reason
  }

  const sourceGeometry = new Map(
    paths.map((path, index) => [path, (results[index] as PromiseFulfilledResult<BufferGeometry>).value]),
  )
  const root = new Group()
  const material = new MeshStandardMaterial({
    color: spacecraft.accent,
    metalness: 0.58,
    roughness: 0.42,
  })

  try {
    for (const part of model.parts) {
      const source = sourceGeometry.get(part.path)
      if (!source) throw new Error(`Unable to load model component: ${part.path}`)

      const mesh = new Mesh(centerGeometry(source), material)
      mesh.position.set(...part.position)
      mesh.rotation.set(...part.rotation)
      mesh.userData.component = componentForPath(part.path)
      mesh.castShadow = true
      mesh.receiveShadow = true
      root.add(mesh)
    }

    if (model.solarWings) {
      const source = sourceGeometry.get(model.solarWings.path)
      if (!source) throw new Error(`Unable to load model component: ${model.solarWings.path}`)
      source.computeBoundingBox()

      const [leftWing, rightWing] = splitSolarWingGeometry(source)
      for (const [geometry, direction] of [
        [leftWing, -1],
        [rightWing, 1],
      ] as const) {
        const mesh = new Mesh(geometry, material)
        mesh.position.x = direction * model.solarWings.centerOffset
        mesh.userData.component = 'solarPanel'
        mesh.castShadow = true
        mesh.receiveShadow = true
        root.add(mesh)
      }
    }

    root.scale.setScalar(model.scale)
  } catch (error) {
    disposeObject(root)
    sourceGeometry.forEach((geometry) => geometry.dispose())
    throw error
  }

  sourceGeometry.forEach((geometry) => geometry.dispose())
  return { root, dispose: () => disposeObject(root) }
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
  useEffect(() => {
    model.root.traverse((object) => {
      const component = object.userData.component as BuildComponentId | undefined
      if (!component) return
      object.visible =
        component !== 'antenna' &&
        component !== 'solarPanel' &&
        build.components.includes(component)

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
  }, [build.components, disassembled, model, radius, spacecraft.model])

  const panel = solarPanelOptions[build.solarPanelSize]
  const antenna = antennaOptions[build.antennaType]
  const engine = engineOptions[build.engineType]
  const instrument = instrumentOptions[build.instrumentType]
  const enabled = (component: BuildComponentId) => build.components.includes(component)
  const spread = disassembled ? radius * 0.7 : 0

  return (
    <>
      <primitive object={model.root} dispose={null} />
      {enabled('solarPanel') && (
        <group>
          {([-1, 1] as const).map((side, index) => (
            <group
              key={side}
              position={[side * (radius * 1.12 + spread), disassembled ? (index ? 1 : -1) * spread * 0.15 : 0, 0]}
            >
              <mesh castShadow receiveShadow>
                <boxGeometry
                  args={[
                    radius * 0.78 * panel.scale,
                    radius * 0.045,
                    radius * 0.5 * panel.scale,
                  ]}
                />
                <meshStandardMaterial
                  color="#3579ad"
                  metalness={0.62}
                  roughness={0.32}
                  emissive="#12304a"
                />
              </mesh>
              <mesh position={[-side * radius * 0.43 * panel.scale, 0, 0]}>
                <cylinderGeometry args={[radius * 0.025, radius * 0.025, radius * 0.38, 8]} />
                <meshStandardMaterial color="#bdc9d2" metalness={0.7} roughness={0.3} />
              </mesh>
            </group>
          ))}
        </group>
      )}
      {enabled('antenna') && (
        <group position={[0, radius * 0.62 + spread, 0]}>
          <mesh position={[0, radius * 0.22, 0]}>
            <cylinderGeometry args={[radius * 0.025, radius * 0.04, radius * 0.48, 8]} />
            <meshStandardMaterial color="#bdc9d2" metalness={0.7} roughness={0.3} />
          </mesh>
          <mesh position={[0, radius * 0.48, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry
              args={[radius * 0.34 * antenna.scale, radius * 0.34 * antenna.scale, radius * 0.06, 32]}
            />
            <meshStandardMaterial
              color={spacecraft.accent}
              metalness={0.72}
              roughness={0.28}
              side={2}
            />
          </mesh>
        </group>
      )}
      {enabled('engine') && (
        <group position={[0, -radius * 0.78 - spread, 0]} scale={engine.scale}>
          <mesh rotation={[Math.PI, 0, 0]} castShadow>
            <coneGeometry args={[radius * 0.2, radius * 0.46, 20]} />
            <meshStandardMaterial color="#aeb9c6" metalness={0.72} roughness={0.3} />
          </mesh>
          <mesh position={[0, -radius * 0.19, 0]}>
            <cylinderGeometry args={[radius * 0.1, radius * 0.14, radius * 0.16, 16]} />
            <meshStandardMaterial color="#596b7d" metalness={0.75} roughness={0.3} />
          </mesh>
        </group>
      )}
      {enabled('instrument') && (
        Array.from({ length: build.instrumentCount }, (_, index) => (
          <group
            key={`instrument-${index}`}
            position={[
              radius * (0.62 + ((index % 2) * 2 - 1) * 0.25) +
                (disassembled ? (index % 2 === 0 ? spread : -spread) : 0),
              -radius * 0.22 + (disassembled ? -spread * 0.15 : 0),
              radius * (Math.floor(index / 2) * 0.38) +
                (disassembled ? (index % 2 === 0 ? spread * 0.25 : -spread * 0.25) : 0),
            ]}
            scale={instrument.scale}
          >
            <mesh castShadow>
              <boxGeometry args={[radius * 0.28, radius * 0.24, radius * 0.32]} />
              <meshStandardMaterial color="#c7bba0" metalness={0.5} roughness={0.42} />
            </mesh>
            <mesh position={[radius * 0.16, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[radius * 0.075, radius * 0.075, radius * 0.1, 16]} />
              <meshStandardMaterial color={spacecraft.accent} metalness={0.65} roughness={0.25} />
            </mesh>
          </group>
        ))
      )}
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
  }, [build, camera, disassembled, model, modelRadius, size.height, size.width])

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

export function SpacecraftViewer({ spacecraft, build }: SpacecraftViewerProps) {
  const [attempt, setAttempt] = useState(0)
  const [assemblyState, setAssemblyState] = useState({
    spacecraftId: spacecraft.id,
    disassembled: false,
  })
  const [loadState, setLoadState] = useState<ViewerLoadState>({
    spacecraftId: '',
    status: 'loading',
  })
  const disassembled =
    assemblyState.spacecraftId === spacecraft.id && assemblyState.disassembled

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
    <div className="relative h-[430px] overflow-hidden rounded-[28px] border border-white/10 bg-[#020912] shadow-[0_0_45px_rgba(34,211,238,0.08)]">
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-sm">
        <span className="text-[10px] uppercase tracking-[0.28em] text-sky-200/75">Mission model</span>
        <div className="flex items-center gap-2">
          {currentState.status === 'ready' && (
            <button
              type="button"
              aria-pressed={disassembled}
              onClick={() =>
                setAssemblyState({ spacecraftId: spacecraft.id, disassembled: !disassembled })
              }
              className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${
                disassembled
                  ? 'border-amber-300/35 bg-amber-300/10 text-amber-100 hover:bg-amber-300/20'
                  : 'border-white/15 bg-white/5 text-slate-200 hover:border-sky-300/40 hover:text-sky-100'
              }`}
            >
              {disassembled ? 'Assemble' : 'Disassemble'}
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

      {currentState.status === 'loading' && (
        <div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-slate-950/55 pt-8 backdrop-blur-[2px]"
          role="status"
          aria-live="polite"
        >
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
          <span className="text-sm text-slate-100">Loading {spacecraft.name} 3D model...</span>
        </div>
      )}

      {currentState.status === 'error' && (
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

      {currentState.status === 'unavailable' && (
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
  )
}
