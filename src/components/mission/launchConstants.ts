import { Vector3 } from 'three'

export const SUN_DIRECTION = new Vector3(110, 180, 85).normalize()
export const HORIZON_COLOR = '#a9c1cc'
export const ZENITH_COLOR = '#2e6aa8'
export const SPACE_COLOR = '#01030a'
export const SKY_RADIUS = 30000
/** Fog distances while standing on the ground (metres-ish world units). */
export const GROUND_FOG_NEAR = 300
export const GROUND_FOG_FAR = 4200
