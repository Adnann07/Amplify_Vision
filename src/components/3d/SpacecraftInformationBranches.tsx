import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react'
import { Camera, Group, Vector3 } from 'three'
import type { SpacecraftSpec } from '../../data/spacecraft'

export interface SpacecraftBranchModelState {
  group: Group | null
  anchors: Vector3[]
  bounds: Vector3[]
}

interface SpacecraftInformationBranchesProps {
  spacecraft: SpacecraftSpec
  cameraRef: RefObject<Camera | null>
  modelRef: RefObject<SpacecraftBranchModelState>
  reducedMotion: boolean
}

interface InformationItem {
  label: string
  value: string
  detail: string
}

function conciseValue(value: string, limit = 42) {
  const normalized = value.split(';')[0].trim()
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1).trimEnd()}…`
}

function informationFor(spacecraft: SpacecraftSpec): InformationItem[] {
  const items: InformationItem[] = [
    {
      label: 'Mission',
      value: conciseValue(spacecraft.type),
      detail: spacecraft.missionPurpose,
    },
    {
      label: 'Mass',
      value: `~${spacecraft.mass.toLocaleString()} kg`,
      detail: 'Approximate spacecraft mass from its mission profile.',
    },
    {
      label: 'Power',
      value: conciseValue(spacecraft.powerSystem ?? `${spacecraft.power.toLocaleString()} W`),
      detail: `${spacecraft.power.toLocaleString()} W listed electrical power.`,
    },
    {
      label: 'Destination',
      value: conciseValue(spacecraft.destination),
      detail: spacecraft.gameplayNote ?? `Planned destination: ${spacecraft.destination}.`,
    },
  ]

  if (spacecraft.instruments?.length) {
    items.push({
      label: 'Instruments',
      value: conciseValue(spacecraft.instruments.slice(0, 2).join(' · ')),
      detail: `Mission equipment: ${spacecraft.instruments.join(', ')}.`,
    })
  }

  if (spacecraft.propulsionSystem) {
    items.push({
      label: 'Propulsion',
      value: conciseValue(spacecraft.propulsionSystem),
      detail: spacecraft.gameplayNote ?? spacecraft.propulsionSystem,
    })
  } else if (items.length < 6) {
    items.push({
      label: 'Communications',
      value: conciseValue(spacecraft.communication),
      detail: `Communications system: ${spacecraft.communication}.`,
    })
  }

  return items.slice(0, 6)
}

function projectPoint(point: Vector3, group: Group, camera: Camera) {
  return group.localToWorld(point.clone()).project(camera)
}

export function SpacecraftInformationBranches({
  spacecraft,
  cameraRef,
  modelRef,
  reducedMotion,
}: SpacecraftInformationBranchesProps) {
  const items = useMemo(() => informationFor(spacecraft), [spacecraft])
  const svgRef = useRef<SVGSVGElement>(null)
  const pathsRef = useRef<(SVGPathElement | null)[]>([])
  const hitPathsRef = useRef<(SVGPathElement | null)[]>([])
  const anchorsRef = useRef<(SVGCircleElement | null)[]>([])
  const endpointsRef = useRef<(SVGCircleElement | null)[]>([])
  const labelsRef = useRef<(HTMLButtonElement | null)[]>([])
  const layoutRef = useRef<{ x: number; y: number; side: number }[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  useEffect(() => {
    const start = performance.now()
    let animationFrame = 0

    const update = (now: number) => {
      const svg = svgRef.current
      const { group, anchors, bounds } = modelRef.current
      const camera = cameraRef.current
      const container = svg?.parentElement
      if (!svg || !group || !camera || !container) {
        animationFrame = window.requestAnimationFrame(update)
        return
      }

      const { width, height } = container.getBoundingClientRect()
      if (width < 1 || height < 1) {
        animationFrame = window.requestAnimationFrame(update)
        return
      }
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
      svg.setAttribute('width', `${width}`)
      svg.setAttribute('height', `${height}`)

      const project = (point: Vector3) => {
        const projected = projectPoint(point, group, camera)
        return {
          x: (projected.x * 0.5 + 0.5) * width,
          y: (-projected.y * 0.5 + 0.5) * height,
        }
      }

      const projectedBounds = bounds.map(project)
      const boundsLeft = Math.min(...projectedBounds.map((point) => point.x))
      const boundsRight = Math.max(...projectedBounds.map((point) => point.x))
      const boundsCenter = (boundsLeft + boundsRight) / 2
      const margin = width < 700 ? 12 : 30
      const labelWidth = width < 700
        ? Math.min(width * 0.39, 170)
        : Math.min(200, width * 0.22)
      const visibleCount = width < 700 ? Math.min(4, items.length) : items.length
      const usableHeight = Math.max(height - 140, height * 0.62)
      const branchDelay = reducedMotion ? 0 : 160
      const branchDuration = reducedMotion ? 0 : 720
      const sources = items.map((_, index) =>
        project(anchors[index % Math.max(anchors.length, 1)] ?? new Vector3()),
      )
      const sides = items.map((_, index) => {
        const previous = layoutRef.current[index]?.side
        if (previous === -1 && sources[index].x < boundsCenter + 42) return -1
        if (previous === 1 && sources[index].x > boundsCenter - 42) return 1
        return sources[index].x < boundsCenter ? -1 : 1
      })
      const indicesBySide = [
        items.map((_, index) => index).filter((index) => index < visibleCount && sides[index] < 0),
        items.map((_, index) => index).filter((index) => index < visibleCount && sides[index] > 0),
      ]
      const rankByIndex = new Map<number, number>()
      indicesBySide.forEach((indices) => {
        indices
          .sort((first, second) => sources[first].y - sources[second].y)
          .forEach((index, rank) => rankByIndex.set(index, rank))
      })

      items.forEach((_, index) => {
        const label = labelsRef.current[index]
        const path = pathsRef.current[index]
        const hitPath = hitPathsRef.current[index]
        const anchorDot = anchorsRef.current[index]
        const endpointDot = endpointsRef.current[index]
        const visible = index < visibleCount
        if (label) {
          label.style.display = visible ? 'flex' : 'none'
          if (!visible) label.style.visibility = 'hidden'
        }
        const group = path?.parentElement
        if (group) group.style.display = visible ? '' : 'none'
        if (!visible) return

        const source = sources[index]
        const side = sides[index]
        const sideIndices = indicesBySide[side < 0 ? 0 : 1]
        const rank = rankByIndex.get(index) ?? 0
        const y = Math.max(
          74,
          (height - usableHeight) / 2 + (rank + 0.5) * usableHeight / sideIndices.length,
        )
        const labelX = side < 0 ? margin : width - margin - labelWidth
        const targetX = side < 0 ? labelX + labelWidth : labelX
        const direction = targetX >= source.x ? 1 : -1
        const reach = Math.max(30, Math.min(Math.abs(targetX - source.x) * 0.42, 150))
        const previousLayout = layoutRef.current[index]
        const destination = previousLayout
          ? {
              x: previousLayout.x + (labelX - previousLayout.x) * 0.18,
              y: previousLayout.y + (y - previousLayout.y) * 0.18,
              side,
            }
          : { x: labelX, y, side }
        layoutRef.current[index] = destination
        const endX = destination.x + (side < 0 ? labelWidth : 0)
        const curve = `M ${source.x.toFixed(1)} ${source.y.toFixed(1)} C ${(source.x + direction * reach).toFixed(1)} ${source.y.toFixed(1)}, ${(endX - direction * reach).toFixed(1)} ${destination.y.toFixed(1)}, ${endX.toFixed(1)} ${destination.y.toFixed(1)}`
        const elapsed = Math.max(0, now - start - index * 115 - branchDelay)
        const progress = branchDuration === 0 ? 1 : Math.min(1, elapsed / branchDuration)
        const eased = 1 - Math.pow(1 - progress, 3)

        path?.setAttribute('d', curve)
        hitPath?.setAttribute('d', curve)
        if (path) path.style.strokeDashoffset = `${1 - eased}`
        if (anchorDot) {
          anchorDot.setAttribute('cx', `${source.x}`)
          anchorDot.setAttribute('cy', `${source.y}`)
          anchorDot.style.opacity = progress > 0.6 ? '1' : '0'
        }
        if (endpointDot) {
          endpointDot.setAttribute('cx', `${endX}`)
          endpointDot.setAttribute('cy', `${destination.y}`)
          endpointDot.style.opacity = progress >= 1 ? '1' : '0'
        }
        if (label) {
          label.style.left = `${destination.x}px`
          label.style.top = `${destination.y}px`
          label.style.width = `${labelWidth}px`
          label.style.opacity = progress >= 0.72 ? '1' : '0'
          label.style.visibility = progress >= 0.72 ? 'visible' : 'hidden'
        }
      })

      animationFrame = window.requestAnimationFrame(update)
    }

    animationFrame = window.requestAnimationFrame(update)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [cameraRef, items, modelRef, reducedMotion])

  return (
    <div
      className="spacecraft-branch-layer pointer-events-none absolute inset-0 z-[15]"
      aria-label={`${spacecraft.name} model information`}
      style={{ '--branch-color': spacecraft.accent } as CSSProperties}
    >
      <svg ref={svgRef} className="spacecraft-branch-svg" aria-hidden="true">
        {items.map((item, index) => (
          <g key={item.label} className={activeIndex === index ? 'is-active' : undefined}>
            <path
              ref={(node) => { pathsRef.current[index] = node }}
              className="spacecraft-branch-path"
              pathLength="1"
            />
            <path
              ref={(node) => { hitPathsRef.current[index] = node }}
              className="spacecraft-branch-hit"
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex(null)}
              onClick={() => setExpandedIndex((current) => current === index ? null : index)}
            />
            <circle ref={(node) => { anchorsRef.current[index] = node }} className="spacecraft-branch-anchor" r="2.4" />
            <circle ref={(node) => { endpointsRef.current[index] = node }} className="spacecraft-branch-endpoint" r="2.1" />
          </g>
        ))}
      </svg>
      {items.map((item, index) => (
        <motion.button
          key={item.label}
          ref={(node) => { labelsRef.current[index] = node }}
          type="button"
          aria-expanded={expandedIndex === index}
          className={`spacecraft-branch-label pointer-events-auto ${activeIndex === index || expandedIndex === index ? 'is-active' : ''}`}
          initial={reducedMotion ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reducedMotion ? 0 : 0.28, delay: reducedMotion ? 0 : 0.35 + index * 0.1 }}
          onPointerEnter={() => setActiveIndex(index)}
          onPointerLeave={() => setActiveIndex(null)}
          onFocus={() => setActiveIndex(index)}
          onBlur={() => setActiveIndex(null)}
          onClick={() => setExpandedIndex((current) => current === index ? null : index)}
        >
          <span className="spacecraft-branch-category">{item.label}</span>
          <strong>{item.value}</strong>
          {expandedIndex === index && <span className="spacecraft-branch-detail">{item.detail}</span>}
        </motion.button>
      ))}
      <p className="spacecraft-branch-instruction">Drag the model · Select a label for details</p>
    </div>
  )
}
