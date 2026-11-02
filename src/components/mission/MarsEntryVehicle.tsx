import { forwardRef } from 'react'
import type { Group } from 'three'

export const MarsEntryVehicle = forwardRef<Group>(function MarsEntryVehicle(_, ref) {
  return (
    <group ref={ref} position={[0, 5, 0]}>
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[5.2, 24, 16]} />
        <meshStandardMaterial color="#d4d1c9" metalness={0.28} roughness={0.58} />
      </mesh>
      <mesh position={[0, -4.25, 0]} rotation={[Math.PI, 0, 0]} castShadow>
        <coneGeometry args={[5.25, 1.8, 24]} />
        <meshStandardMaterial color="#a9472e" metalness={0.18} roughness={0.72} />
      </mesh>
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[5.15, 0.12, 8, 28]} />
        <meshStandardMaterial color="#8f9798" metalness={0.55} roughness={0.42} />
      </mesh>
    </group>
  )
})
