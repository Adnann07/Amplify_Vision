import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  Group,
  NormalBlending,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three'
import { lerp, makeCanvas, seeded } from './proceduralMath'

/* -------------------------------------------------------------------------- */
/*  Shared soft textures                                                      */
/* -------------------------------------------------------------------------- */

let glowTexture: CanvasTexture | null = null
export function getGlowTexture() {
  if (!glowTexture) {
    const canvas = makeCanvas(128, 128)
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64)
      gradient.addColorStop(0, 'rgba(255,255,255,1)')
      gradient.addColorStop(0.22, 'rgba(255,255,255,0.55)')
      gradient.addColorStop(0.6, 'rgba(255,255,255,0.12)')
      gradient.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 128, 128)
    }
    glowTexture = new CanvasTexture(canvas)
    glowTexture.colorSpace = SRGBColorSpace
  }
  return glowTexture
}

/** Billowy smoke puff: many overlapping soft blobs, darker toward the bottom. */
let smokeTexture: CanvasTexture | null = null
export function getSmokeTexture() {
  if (!smokeTexture) {
    const size = 256
    const canvas = makeCanvas(size, size)
    const context = canvas.getContext('2d')
    if (context) {
      const random = seeded(77)
      for (let blob = 0; blob < 46; blob++) {
        const angle = random() * Math.PI * 2
        const dist = Math.sqrt(random()) * 62
        const x = 128 + Math.cos(angle) * dist
        const y = 128 + Math.sin(angle) * dist
        const r = 22 + random() * 36
        const shade = Math.round(255 - Math.max(0, (y - 90) / 90) * 70)
        const gradient = context.createRadialGradient(x, y, 0, x, y, r)
        gradient.addColorStop(0, `rgba(${shade},${shade},${shade},0.2)`)
        gradient.addColorStop(0.55, `rgba(${shade},${shade},${shade},0.09)`)
        gradient.addColorStop(1, `rgba(${shade},${shade},${shade},0)`)
        context.fillStyle = gradient
        context.fillRect(0, 0, size, size)
      }
      context.globalCompositeOperation = 'destination-in'
      const mask = context.createRadialGradient(128, 128, 14, 128, 128, 128)
      mask.addColorStop(0, 'rgba(255,255,255,1)')
      mask.addColorStop(0.7, 'rgba(255,255,255,0.8)')
      mask.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = mask
      context.fillRect(0, 0, size, size)
    }
    smokeTexture = new CanvasTexture(canvas)
    smokeTexture.colorSpace = SRGBColorSpace
  }
  return smokeTexture
}

/** A lit cumulus billboard: bright tops, blue-grey undersides, soft edges. */
let cloudTexture: CanvasTexture | null = null
export function getCloudTexture() {
  if (!cloudTexture) {
    const W = 512
    const H = 256
    const canvas = makeCanvas(W, H)
    const context = canvas.getContext('2d')
    if (context) {
      const random = seeded(4242)
      const blobs: Array<{ x: number; y: number; r: number }> = []
      for (let index = 0; index < 54; index++) {
        const t = random()
        const x = W * (0.16 + t * 0.68)
        const hump = Math.sin(t * Math.PI)
        const y = H * (0.66 - hump * 0.3 * random())
        blobs.push({ x, y, r: 26 + random() * 44 * (0.5 + hump) })
      }
      blobs.sort((a, b) => b.y - a.y)
      for (const { x, y, r } of blobs) {
        const k = Math.min(1, Math.max(0, (y - 60) / 130))
        const red = Math.round(255 - k * 62)
        const green = Math.round(255 - k * 48)
        const blue = Math.round(255 - k * 26)
        const gradient = context.createRadialGradient(x, y - r * 0.2, 0, x, y, r)
        gradient.addColorStop(0, `rgba(${red},${green},${blue},0.62)`)
        gradient.addColorStop(0.6, `rgba(${red},${green},${blue},0.3)`)
        gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`)
        context.fillStyle = gradient
        context.fillRect(0, 0, W, H)
      }
      context.globalCompositeOperation = 'destination-in'
      context.save()
      context.translate(W / 2, H / 2)
      context.scale(1, H / W)
      const mask = context.createRadialGradient(0, 0, W * 0.16, 0, 0, W * 0.5)
      mask.addColorStop(0, 'rgba(255,255,255,1)')
      mask.addColorStop(1, 'rgba(255,255,255,0)')
      context.fillStyle = mask
      context.fillRect(-W / 2, -W / 2, W, W)
      context.restore()
    }
    cloudTexture = new CanvasTexture(canvas)
    cloudTexture.colorSpace = SRGBColorSpace
  }
  return cloudTexture
}

/* -------------------------------------------------------------------------- */
/*  Sprite particle pool                                                      */
/* -------------------------------------------------------------------------- */

interface Particle {
  sprite: Sprite
  material: SpriteMaterial
  born: number
  life: number
  pos: Vector3
  vel: Vector3
  s0: number
  s1: number
  opacity: number
  c0: Color
  c1: Color
  drag: number
  rise: number
  spin: number
  alive: boolean
}

export class SpriteEmitter {
  readonly group = new Group()
  private particles: Particle[] = []
  private cursor = 0

  constructor(count: number, map: CanvasTexture, additive: boolean) {
    for (let index = 0; index < count; index++) {
      const material = new SpriteMaterial({
        map,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        blending: additive ? AdditiveBlending : NormalBlending,
        fog: false,
      })
      const sprite = new Sprite(material)
      sprite.visible = false
      this.group.add(sprite)
      this.particles.push({
        sprite, material, born: 0, life: 1, pos: new Vector3(), vel: new Vector3(),
        s0: 1, s1: 1, opacity: 1, c0: new Color(), c1: new Color(),
        drag: 0, rise: 0, spin: 0, alive: false,
      })
    }
  }

  /**
   * Emits one particle. `drag` slows it down over time, `rise` is an upward
   * acceleration (hot gas buoyancy), both optional.
   */
  emit(
    now: number, x: number, y: number, z: number, vx: number, vy: number, vz: number,
    life: number, s0: number, s1: number, opacity: number, c0: Color, c1: Color,
    drag = 0, rise = 0,
  ) {
    const particle = this.particles[this.cursor]
    this.cursor = (this.cursor + 1) % this.particles.length
    particle.born = now
    particle.life = life
    particle.pos.set(x, y, z)
    particle.vel.set(vx, vy, vz)
    particle.s0 = s0
    particle.s1 = s1
    particle.opacity = opacity
    particle.c0.copy(c0)
    particle.c1.copy(c1)
    particle.drag = drag
    particle.rise = rise
    particle.spin = (Math.random() - 0.5) * 0.7
    particle.alive = true
    particle.material.rotation = Math.random() * Math.PI * 2
    particle.sprite.visible = true
    particle.sprite.position.copy(particle.pos)
  }

  update(now: number, dt: number) {
    for (const particle of this.particles) {
      if (!particle.alive) continue
      const t = (now - particle.born) / particle.life
      if (t >= 1) {
        particle.alive = false
        particle.sprite.visible = false
        continue
      }
      if (particle.drag > 0) particle.vel.multiplyScalar(Math.exp(-particle.drag * dt))
      if (particle.rise !== 0) particle.vel.y += particle.rise * dt
      particle.pos.addScaledVector(particle.vel, dt)
      particle.sprite.position.copy(particle.pos)
      particle.material.rotation += particle.spin * dt
      const grow = 1 - Math.pow(1 - t, 2)
      const size = lerp(particle.s0, particle.s1, grow)
      particle.sprite.scale.set(size, size, 1)
      particle.material.opacity = particle.opacity * Math.min(1, t / 0.1) * Math.pow(1 - t, 1.4)
      particle.material.color.copy(particle.c0).lerp(particle.c1, Math.min(1, t * 1.8))
    }
  }

  dispose() {
    for (const particle of this.particles) particle.material.dispose()
  }
}
