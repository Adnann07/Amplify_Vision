import { Canvas } from '@react-three/fiber'
import { Line, OrbitControls } from '@react-three/drei'
import { useMemo } from 'react'
import { DoubleSide, Quaternion, Vector3 } from 'three'

interface ObservationGeometrySceneProps {
  body: string
  coordinates: [longitude: number, latitude: number] | null
}

function TargetGeometry({ coordinates }: { coordinates: [number, number] | null }) {
  const location = useMemo(() => {
    const [longitude, latitude] = coordinates ?? [0, 0]
    const lon = (longitude * Math.PI) / 180
    const lat = (latitude * Math.PI) / 180
    return new Vector3(Math.cos(lat) * Math.sin(lon), Math.sin(lat), Math.cos(lat) * Math.cos(lon))
  }, [coordinates])
  const normal = location.clone().normalize()
  const satellite = location.clone().multiplyScalar(1.85)
  const footprintQuaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), normal)
  const satelliteQuaternion = new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), location.clone().negate())

  return (
    <>
      <mesh position={location.clone().multiplyScalar(1.012)} quaternion={footprintQuaternion}>
        <circleGeometry args={[0.17, 48]} />
        <meshBasicMaterial color="#fbbf24" transparent opacity={0.3} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh position={location.clone().multiplyScalar(1.025)}>
        <sphereGeometry args={[0.035, 12, 12]} />
        <meshBasicMaterial color="#fde68a" />
      </mesh>
      <mesh position={satellite} quaternion={satelliteQuaternion}>
        <octahedronGeometry args={[0.075, 0]} />
        <meshStandardMaterial color="#67e8f9" metalness={0.35} roughness={0.4} />
      </mesh>
      <Line points={[satellite.toArray(), location.clone().multiplyScalar(1.06).toArray()]} color="#67e8f9" transparent opacity={0.85} lineWidth={1} />
    </>
  )
}

export function ObservationGeometryScene({ body, coordinates }: ObservationGeometrySceneProps) {
  return (
    <div className="relative h-[300px] overflow-hidden border border-slate-800 bg-[#020912]">
      <Canvas camera={{ position: [0, 0.2, 4.2], fov: 38 }} dpr={[1, 1.5]}>
        <ambientLight intensity={0.8} />
        <directionalLight position={[-3, 2, 4]} intensity={2.1} color="#dbeafe" />
        <group>
          <mesh>
            <sphereGeometry args={[1, 48, 32]} />
            <meshStandardMaterial color={body === 'Earth' ? '#176a9a' : '#9b6045'} roughness={0.95} metalness={0.02} />
          </mesh>
          <mesh>
            <sphereGeometry args={[1.008, 32, 24]} />
            <meshBasicMaterial color="#94a3b8" wireframe transparent opacity={0.12} />
          </mesh>
          <TargetGeometry coordinates={coordinates} />
        </group>
        <OrbitControls enablePan={false} minDistance={3.3} maxDistance={6} />
      </Canvas>
      <div className="pointer-events-none absolute left-3 top-3 border border-slate-700/80 bg-[#020912]/80 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-300">
        {body} · schematic geometry
      </div>
      <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex flex-wrap gap-x-4 gap-y-1 text-[8px] uppercase tracking-wide text-slate-400">
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-cyan-300" />Spacecraft marker</span>
        <span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-300" />Illustrative target footprint</span>
      </div>
    </div>
  )
}
