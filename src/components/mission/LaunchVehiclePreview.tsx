import { Canvas, useThree } from '@react-three/fiber'
import { Component, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react'
import { Color, PCFShadowMap } from 'three'
import type { LaunchVehicleSpec } from '../../data/launchVehicles'
import { NasaSlsRocket, ProceduralRocket } from './LaunchVehicleModels'

interface PreviewErrorBoundaryProps {
  children: ReactNode
  fallback: ReactNode
}

class PreviewErrorBoundary extends Component<
  PreviewErrorBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('NASA SLS preview model could not be loaded; showing the detailed built-in 3D launcher.', error)
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children
  }
}

function PreviewStage({ vehicle, onReady }: { vehicle: LaunchVehicleSpec; onReady: () => void }) {
  const variant = vehicle.visualClass
  const procedural = <ProceduralRocket variant={variant} onReady={onReady} />

  return (
    <>
      <color attach="background" args={['#07111d']} />
      <fog attach="fog" args={['#07111d', 165, 310]} />
      <ambientLight intensity={0.9} />
      <hemisphereLight args={['#d8e8f6', '#18212b', 1.4]} />
      <directionalLight
        position={[90, 130, 100]}
        intensity={4}
        color="#fff3dc"
        castShadow
        shadow-mapSize={[512, 512]}
      />
      <directionalLight position={[-85, 60, -70]} intensity={1.5} color="#8bbde6" />
      <pointLight position={[35, 34, 75]} intensity={420} distance={210} color={vehicle.accent} />
      <mesh position={[0, -2.7, 0]} receiveShadow>
        <cylinderGeometry args={[18, 20, 3.2, 64]} />
        <meshStandardMaterial color="#26333d" metalness={0.68} roughness={0.42} />
      </mesh>
      <mesh position={[0, -0.98, 0]}>
        <torusGeometry args={[15.5, 0.16, 8, 64]} />
        <meshStandardMaterial color="#69747b" metalness={0.8} roughness={0.32} />
      </mesh>
      <group rotation={[0, -0.34, 0]} position={[0, -0.4, 0]}>
        {variant === 'heavy' ? (
          <PreviewErrorBoundary fallback={procedural}>
            <Suspense fallback={null}>
              <NasaSlsRocket onReady={onReady} />
            </Suspense>
          </PreviewErrorBoundary>
        ) : (
          procedural
        )}
      </group>
    </>
  )
}

function PreviewCamera() {
  const { camera } = useThree()
  useEffect(() => {
    camera.position.set(112, 70, 150)
    camera.lookAt(0, 45, 0)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

export function LaunchVehiclePreview({ vehicle }: { vehicle: LaunchVehicleSpec }) {
  const [assetReady, setAssetReady] = useState(vehicle.visualClass !== 'heavy')
  const handleReady = useCallback(() => setAssetReady(true), [])

  return (
    <div
      className="relative h-[190px] min-h-[190px] w-full overflow-hidden rounded-2xl border border-white/[0.04] bg-[#07111d]"
      role="group"
      aria-label={`${vehicle.name} realistic real-time 3D launcher preview`}
    >
      <Canvas
        frameloop="demand"
        shadows
        dpr={1}
        camera={{ position: [112, 70, 150], fov: 31, near: 0.1, far: 500 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        onCreated={({ gl }) => {
          gl.shadowMap.type = PCFShadowMap
          gl.setClearColor(new Color('#07111d'), 1)
        }}
      >
        <PreviewCamera />
        <Suspense fallback={null}>
          <PreviewStage vehicle={vehicle} onReady={handleReady} />
        </Suspense>
      </Canvas>
      {!assetReady && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#07111d]/70 text-[10px] uppercase tracking-[0.15em] text-slate-300"
          role="status"
          aria-label="Loading NASA SLS 3D model"
        >
          <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-sky-300/25 border-t-sky-300" />
          Loading vehicle model
        </div>
      )}
    </div>
  )
}
