import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Material,
  Mesh,
  MeshStandardMaterial,
  Texture,
  Vector3,
} from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import type { SpacecraftSpec } from '../../data/spacecraft'
import type { BuildComponentId } from '../../data/spacecraftBuild'

export interface LoadedModel {
  root: Group
  dispose: () => void
}

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

export async function loadSpacecraftModel(spacecraft: SpacecraftSpec): Promise<LoadedModel> {
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
