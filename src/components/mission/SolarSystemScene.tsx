import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import { CanvasTexture, DoubleSide, Group, SRGBColorSpace } from 'three'
import type { HorizonsPosition } from '../../data/horizonsService'
import { heliocentricBodies } from '../../data/planetaryData'

interface SolarSystemSceneProps {
  positions: HorizonsPosition[]
  selectedBodyId: string
  onSelectBody: (bodyId: string) => void
}

function makeSurfaceTexture(bodyId: string, baseColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 512
  canvas.height = 256
  const context = canvas.getContext('2d')
  if (!context) return null

  context.fillStyle = baseColor
  context.fillRect(0, 0, canvas.width, canvas.height)
  const seed = bodyId.split('').reduce((value, character) => value + character.charCodeAt(0), 0)
  let randomState = seed || 1
  const random = () => {
    randomState = (randomState * 16807) % 2147483647
    return (randomState - 1) / 2147483646
  }

  if (['jupiter', 'saturn', 'uranus', 'neptune'].includes(bodyId)) {
    for (let band = 0; band < 28; band += 1) {
      const y = band * 10 + random() * 7
      const alpha = 0.035 + random() * 0.16
      context.fillStyle = band % 2 ? `rgba(12, 20, 29, ${alpha})` : `rgba(255, 241, 220, ${alpha})`
      context.fillRect(0, y, canvas.width, 2 + random() * 8)
    }
    if (bodyId === 'jupiter') {
      context.fillStyle = 'rgba(154, 75, 44, 0.58)'
      context.beginPath()
      context.ellipse(330, 150, 36, 14, -0.08, 0, Math.PI * 2)
      context.fill()
      context.strokeStyle = 'rgba(247, 203, 164, 0.52)'
      context.lineWidth = 4
      context.stroke()
    }
  } else {
    for (let mark = 0; mark < 330; mark += 1) {
      const x = random() * canvas.width
      const y = random() * canvas.height
      const radius = 1 + random() * (bodyId === 'earth' ? 13 : 9)
      if (bodyId === 'earth' && random() > 0.54) {
        context.fillStyle = `rgba(110, 151, 103, ${0.16 + random() * 0.32})`
        context.beginPath()
        context.ellipse(x, y, radius * (1.2 + random()), radius * 0.65, random() * Math.PI, 0, Math.PI * 2)
        context.fill()
      } else {
        context.fillStyle = random() > 0.5
          ? `rgba(255, 241, 218, ${0.04 + random() * 0.17})`
          : `rgba(12, 19, 28, ${0.04 + random() * 0.18})`
        context.beginPath()
        context.arc(x, y, radius, 0, Math.PI * 2)
        context.fill()
      }
    }
  }

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

function makeLabelTexture(label: string, textColor: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 192
  canvas.height = 48
  const context = canvas.getContext('2d')
  if (!context) return null
  context.font = '600 24px Arial, sans-serif'
  context.textBaseline = 'middle'
  context.lineJoin = 'round'
  context.strokeStyle = 'rgba(2, 8, 18, 0.95)'
  context.lineWidth = 7
  context.strokeText(label, 8, 25)
  context.fillStyle = textColor
  context.fillText(label, 8, 25)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

function bodyRadius(bodyId: string) {
  const radii: Record<string, number> = {
    mercury: 0.18,
    venus: 0.28,
    earth: 0.3,
    mars: 0.23,
    jupiter: 0.58,
    saturn: 0.51,
    uranus: 0.39,
    neptune: 0.38,
  }
  return radii[bodyId] ?? 0.25
}

function visualPosition(position: HorizonsPosition) {
  const radius = Math.log1p(position.distanceAu) / Math.log1p(35) * 7.8
  const longitude = Math.atan2(position.yAu, position.xAu)
  return [
    Math.cos(longitude) * radius,
    Math.sin(longitude) * radius,
    position.zAu * 0.25,
  ] as const
}

function Planet({
  body,
  position,
  selected,
  onSelect,
}: {
  body: (typeof heliocentricBodies)[number]
  position: HorizonsPosition
  selected: boolean
  onSelect: (bodyId: string) => void
}) {
  const group = useRef<Group>(null)
  const texture = useMemo(() => makeSurfaceTexture(body.id, body.color), [body.color, body.id])
  const labelTexture = useMemo(
    () => makeLabelTexture(body.name, selected ? '#ffffff' : '#bac8d8'),
    [body.name, selected],
  )
  const coordinates = visualPosition(position)
  const radius = bodyRadius(body.id)

  useEffect(() => () => {
    texture?.dispose()
    labelTexture?.dispose()
  }, [labelTexture, texture])
  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * (body.id === 'earth' ? 0.12 : 0.055)
  })

  return (
    <group position={coordinates}>
      {selected && (
        <mesh>
          <ringGeometry args={[radius + 0.09, radius + 0.14, 48]} />
          <meshBasicMaterial color="#f8fafc" transparent opacity={0.86} side={DoubleSide} />
        </mesh>
      )}
      <group ref={group}>
        <mesh
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelect(body.id)
          }}
        >
          <sphereGeometry args={[radius, 40, 32]} />
          <meshStandardMaterial
            color={texture ? '#ffffff' : body.color}
            map={texture ?? undefined}
            roughness={body.id === 'earth' ? 0.76 : 0.94}
            metalness={0}
          />
        </mesh>
        {body.id === 'saturn' && (
          <mesh rotation={[0.18, 0.06, -0.18]}>
            <ringGeometry args={[radius * 1.32, radius * 2.05, 72]} />
            <meshStandardMaterial
              color="#c7b38f"
              roughness={0.86}
              metalness={0.08}
              transparent
              opacity={0.84}
              side={DoubleSide}
            />
          </mesh>
        )}
      </group>
      {labelTexture && (
        <sprite position={[0, radius + 0.27, 0]} scale={[1.12, 0.28, 1]} renderOrder={2}>
          <spriteMaterial map={labelTexture} transparent depthTest={false} />
        </sprite>
      )}
    </group>
  )
}

function SolarSystem({ positions, selectedBodyId, onSelectBody }: SolarSystemSceneProps) {
  const positionById = useMemo(
    () => new Map(positions.map((position) => [position.bodyId, position])),
    [positions],
  )
  const orbitRadii = useMemo(
    () => positions.map((position) => Math.log1p(position.distanceAu) / Math.log1p(35) * 7.8),
    [positions],
  )

  return (
    <>
      <color attach="background" args={['#050d17']} />
      <ambientLight intensity={0.42} />
      <pointLight position={[0, 0, 1]} color="#fff0b0" intensity={18} distance={22} decay={1.7} />
      <directionalLight position={[-5, 7, 10]} intensity={1.4} color="#c9dcff" />

      {orbitRadii.map((radius) => (
        <mesh key={radius} position={[0, 0, -0.12]}>
          <ringGeometry args={[Math.max(0.12, radius - 0.012), radius + 0.012, 128]} />
          <meshBasicMaterial color="#8493a7" transparent opacity={0.13} side={DoubleSide} />
        </mesh>
      ))}

      <mesh>
        <sphereGeometry args={[0.43, 32, 24]} />
        <meshBasicMaterial color="#fff0a5" />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.72, 24, 18]} />
        <meshBasicMaterial color="#ffcf57" transparent opacity={0.09} depthWrite={false} />
      </mesh>
      {heliocentricBodies.map((body) => {
        const position = positionById.get(body.id)
        if (!position) return null
        return (
          <Planet
            key={body.id}
            body={body}
            position={position}
            selected={body.id === selectedBodyId}
            onSelect={onSelectBody}
          />
        )
      })}
    </>
  )
}

export function SolarSystemScene(props: SolarSystemSceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 22], fov: 42, near: 0.1, far: 80 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'low-power', alpha: false }}
    >
      <SolarSystem {...props} />
    </Canvas>
  )
}
