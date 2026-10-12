import { useGLTF } from '@react-three/drei'
import { useLoader } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { STLLoader } from 'three/addons/loaders/STLLoader.js'
import type { SpacecraftModel, SpacecraftStlModel } from '../../data/spacecraft'

function fitToPayloadSize(root: Group, targetSize: number) {
  root.updateWorldMatrix(true, true)
  const bounds = new Box3().setFromObject(root)
  if (bounds.isEmpty()) return
  const size = bounds.getSize(new Vector3())
  const scale = targetSize / Math.max(size.x, size.y, size.z, 0.001)
  const center = bounds.getCenter(new Vector3())
  root.scale.multiplyScalar(scale)
  root.position.copy(center).multiplyScalar(-scale)
}

function splitWing(source: BufferGeometry, side: -1 | 1) {
  const positions = source.getAttribute('position')
  source.computeBoundingBox()
  const bounds = source.boundingBox
  if (!bounds) return source.clone()
  const midpoint = (bounds.min.x + bounds.max.x) / 2
  const vertices: number[] = []
  for (let index = 0; index < positions.count; index += 3) {
    const centerX =
      (positions.getX(index) + positions.getX(index + 1) + positions.getX(index + 2)) / 3
    if ((side < 0 && centerX >= midpoint) || (side > 0 && centerX < midpoint)) continue
    for (let vertex = 0; vertex < 3; vertex += 1) {
      const positionIndex = index + vertex
      vertices.push(
        positions.getX(positionIndex),
        positions.getY(positionIndex),
        positions.getZ(positionIndex),
      )
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
  geometry.computeVertexNormals()
  geometry.rotateZ(Math.PI / 2)
  geometry.computeBoundingBox()
  const center = geometry.boundingBox?.getCenter(new Vector3())
  if (center) geometry.translate(-center.x, -center.y, -center.z)
  return geometry
}

function GlbPayload({ modelPath, onReady }: { modelPath: string; onReady: () => void }) {
  const gltf = useGLTF(modelPath, `${import.meta.env.BASE_URL}draco/`)
  const scene = useMemo(() => {
    const root = new Group()
    root.add(gltf.scene.clone(true))
    fitToPayloadSize(root, 8)
    return root
  }, [gltf.scene])
  useEffect(() => onReady(), [onReady, scene])
  return <primitive object={scene} />
}

function StlPayload({ model, onReady }: { model: SpacecraftStlModel; onReady: () => void }) {
  const paths = useMemo(
    () => [...new Set([...model.parts.map((part) => part.path), ...(model.solarWings ? [model.solarWings.path] : [])])],
    [model],
  )
  const geometries = useLoader(STLLoader, paths)
  const assembly = useMemo(() => {
    const root = new Group()
    const material = new MeshStandardMaterial({ color: '#b9c8d2', metalness: 0.58, roughness: 0.38 })
    const geometryByPath = new Map(paths.map((path, index) => {
      const source = Array.isArray(geometries) ? geometries[index] : geometries
      const geometry = source.clone()
      geometry.computeBoundingBox()
      const center = geometry.boundingBox?.getCenter(new Vector3())
      if (center) geometry.translate(-center.x, -center.y, -center.z)
      return [path, geometry] as const
    }))

    for (const part of model.parts) {
      const geometry = geometryByPath.get(part.path)
      if (!geometry) continue
      const mesh = new Mesh(geometry, material)
      mesh.position.set(...part.position)
      mesh.rotation.set(...part.rotation)
      root.add(mesh)
    }
    if (model.solarWings) {
      const wings = geometryByPath.get(model.solarWings.path)
      if (wings) {
        for (const side of [-1, 1] as const) {
          const mesh = new Mesh(splitWing(wings, side), material)
          mesh.position.x = side * model.solarWings.centerOffset
          root.add(mesh)
        }
      }
    }

    root.scale.setScalar(model.scale)
    root.updateWorldMatrix(true, true)
    const bounds = new Box3().setFromObject(root)
    if (!bounds.isEmpty()) {
      const size = bounds.getSize(new Vector3())
      const fit = 8 / Math.max(size.x, size.y, size.z, 0.001)
      const center = bounds.getCenter(new Vector3())
      root.scale.multiplyScalar(fit)
      root.position.copy(center).multiplyScalar(-fit)
    }
    return root
  }, [geometries, model, paths])
  useEffect(() => onReady(), [assembly, onReady])
  return <primitive object={assembly} />
}

export function SpacecraftPayloadModel({
  model,
  onReady,
}: {
  model: SpacecraftModel
  onReady: () => void
}) {
  useEffect(() => {
    if (model.format === 'unavailable') onReady()
  }, [model.format, onReady])
  if (model.format === 'unavailable') return null
  if (model.format === 'glb') return <GlbPayload modelPath={model.modelPath} onReady={onReady} />
  return <StlPayload model={model} onReady={onReady} />
}
