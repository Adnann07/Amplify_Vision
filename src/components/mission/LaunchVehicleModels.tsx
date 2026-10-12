import { useGLTF } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'

export type LaunchVehicleClass = 'small' | 'medium' | 'heavy'

export function NasaSlsRocket({ onReady }: { onReady: () => void }) {
  const { scene } = useGLTF('/models/nasa-sls-rocket.glb')
  const rocket = useMemo(() => scene.clone(true), [scene])
  useEffect(() => onReady(), [onReady])
  return <primitive object={rocket} position={[0, -0.208, 0]} scale={0.16} />
}

export function ProceduralRocket({
  variant,
  onReady,
}: {
  variant: LaunchVehicleClass
  onReady: () => void
}) {
  const height = variant === 'small' ? 66 : variant === 'medium' ? 79 : 93
  const size = height / 93
  const radius = variant === 'small' ? 3.6 : variant === 'medium' ? 4.5 : 5.2
  const boosterRadius = variant === 'small' ? 1.15 : 1.5
  const boosterOffset = radius + boosterRadius + 0.25
  const boosters = variant === 'small' ? 0 : variant === 'medium' ? 2 : 4

  useEffect(() => onReady(), [onReady])

  return (
    <group scale={[size, size, size]}>
      <mesh position={[0, 16, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.94, radius, 32, 48]} />
        <meshStandardMaterial color="#c9c9c4" metalness={0.48} roughness={0.34} />
      </mesh>
      <mesh position={[0, 40, 0]} castShadow>
        <cylinderGeometry args={[radius, radius, 32, 48]} />
        <meshStandardMaterial color="#a94b29" metalness={0.24} roughness={0.48} />
      </mesh>
      <mesh position={[0, 57, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.79, radius, 3, 48]} />
        <meshStandardMaterial color="#343b40" metalness={0.78} roughness={0.26} />
      </mesh>
      <mesh position={[0, 67, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.7, radius * 0.79, 17, 48]} />
        <meshStandardMaterial color="#deddd7" metalness={0.42} roughness={0.3} />
      </mesh>
      <mesh position={[0, 79, 0]} castShadow>
        <cylinderGeometry args={[radius * 0.7, radius * 0.7, 8, 48]} />
        <meshStandardMaterial color="#c8c9c5" metalness={0.4} roughness={0.32} />
      </mesh>
      <mesh position={[0, 88, 0]} castShadow>
        <cylinderGeometry args={[0, radius * 0.7, 12, 48]} />
        <meshStandardMaterial color="#e3e1da" metalness={0.3} roughness={0.32} />
      </mesh>

      {[8, 10, 23, 55, 59, 75, 83].map((y) => (
        <mesh key={y} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[y === 55 || y === 59 ? radius * 0.96 : radius * 1.015, y === 55 || y === 59 ? radius * 0.96 : radius * 1.015, 0.55, 48]} />
          <meshStandardMaterial color={y === 23 ? '#e1e2dd' : '#65717a'} metalness={0.72} roughness={0.28} />
        </mesh>
      ))}
      {[28, 33, 49].map((y) => (
        <mesh key={`stage-line-${y}`} position={[0, y, 0]} castShadow>
          <cylinderGeometry args={[radius * 1.002, radius * 1.002, 0.22, 48]} />
          <meshStandardMaterial color="#d8b291" metalness={0.36} roughness={0.4} />
        </mesh>
      ))}
      {[0, Math.PI / 2, Math.PI, (Math.PI * 3) / 2].map((angle) => (
        <mesh
          key={`rail-${angle}`}
          position={[Math.sin(angle) * radius, 39, Math.cos(angle) * radius]}
          rotation={[0, -angle, 0]}
          castShadow
        >
          <boxGeometry args={[0.16, 28, 0.22]} />
          <meshStandardMaterial color="#783f2c" metalness={0.38} roughness={0.4} />
        </mesh>
      ))}

      {Array.from({ length: boosters }, (_, index) => {
        const angle = (Math.PI * 2 * index) / boosters
        const x = Math.sin(angle) * boosterOffset
        const z = Math.cos(angle) * boosterOffset
        return (
          <group key={index} position={[x, 0, z]}>
            <mesh position={[0, 39, 0]} castShadow>
              <cylinderGeometry args={[boosterRadius, boosterRadius, 58, 32]} />
              <meshStandardMaterial color="#deddd7" metalness={0.42} roughness={0.34} />
            </mesh>
            <mesh position={[0, 70, 0]} castShadow>
              <coneGeometry args={[boosterRadius, 8, 32]} />
              <meshStandardMaterial color="#d9d8d2" metalness={0.32} roughness={0.34} />
            </mesh>
            <mesh position={[0, 8, 0]} castShadow>
              <cylinderGeometry args={[boosterRadius * 0.73, boosterRadius, 4, 32]} />
              <meshStandardMaterial color="#414a50" metalness={0.84} roughness={0.24} />
            </mesh>
            <mesh position={[0, 12, 0]}>
              <cylinderGeometry args={[boosterRadius * 1.015, boosterRadius * 1.015, 0.45, 32]} />
              <meshStandardMaterial color="#67737a" metalness={0.76} roughness={0.26} />
            </mesh>
          </group>
        )
      })}

      {Array.from({ length: variant === 'small' ? 3 : 4 }, (_, index) => {
        const count = variant === 'small' ? 3 : 4
        const angle = (Math.PI * 2 * index) / count
        const x = Math.sin(angle) * radius * 0.48
        const z = Math.cos(angle) * radius * 0.48
        const engineRadius = variant === 'small' ? 0.9 : 0.7
        return (
          <group key={`engine-${index}`} position={[x, 2, z]}>
            <mesh rotation={[Math.PI, 0, 0]} castShadow>
              <cylinderGeometry args={[engineRadius * 0.62, engineRadius, 4, 24, 1, true]} />
              <meshStandardMaterial color="#252d32" metalness={0.88} roughness={0.22} side={DoubleSide} />
            </mesh>
            <mesh position={[0, -2, 0]} rotation={[Math.PI, 0, 0]} castShadow>
              <cylinderGeometry args={[engineRadius * 0.82, engineRadius * 1.22, 2, 24, 1, true]} />
              <meshStandardMaterial color="#60696d" metalness={0.82} roughness={0.24} side={DoubleSide} />
            </mesh>
          </group>
        )
      })}

      {[0, 1, 2, 3].map((index) => (
        <mesh
          key={`fin-${index}`}
          position={[
            Math.sin((index * Math.PI) / 2) * radius * 0.8,
            5,
            Math.cos((index * Math.PI) / 2) * radius * 0.8,
          ]}
          rotation={[0, (index * Math.PI) / 2, 0]}
          castShadow
        >
          <boxGeometry args={[0.3, 9, 2.2]} />
          <meshStandardMaterial color="#8c9698" metalness={0.72} roughness={0.3} />
        </mesh>
      ))}
    </group>
  )
}
