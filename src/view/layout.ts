// Pure layout maths for the line. No three.js here, so it can be unit tested.
// World: the belt runs along +X from 0 to beltLength, its top surface is y = 0, the camera looks from +Z.

export const ITEM_RADIUS = 0.2

/** A jar stands in front of the belt, its rim just below the belt surface. */
export const JAR = { radius: 0.55, height: 1.35, topY: -0.35, z: 1.3 }

export type Orientation = 'wide' | 'tall'

export interface ShelfLayout {
  columns: number
  rows: number
  /** Size of a shelved jar relative to a jar on the line. */
  scale: number
  x0: number
  dx: number
  y0: number
  dy: number
  z: number
}

/** The shelf holds 30 jars either way: three long rows on a wide screen, six short rows of bigger jars on a phone. */
export const SHELVES: Record<Orientation, ShelfLayout> = {
  wide: { columns: 10, rows: 3, scale: 0.55, x0: 4.6, dx: 0.98, y0: 1.0, dy: 0.95, z: -1.5 },
  tall: { columns: 5, rows: 6, scale: 0.8, x0: 6.2, dx: 1.4, y0: 1.0, dy: 1.5, z: -1.5 },
}
export const SHELF_PLACES = 30

export function orientationFor(aspect: number): Orientation {
  return aspect < 1 ? 'tall' : 'wide'
}

const RING_RADIUS = 0.3
const LAYER_HEIGHT = 0.34
const PER_LAYER = 4

/** Resting place of the nth item in a jar, relative to the centre of the jar's base. */
export function jarSlot(slot: number): { x: number; y: number; z: number } {
  const layer = Math.floor(slot / PER_LAYER)
  // Each layer is turned 45 degrees so items nest between the ones below.
  const angle = (slot % PER_LAYER) * (Math.PI / 2) + layer * (Math.PI / 4)
  return {
    x: Math.cos(angle) * RING_RADIUS,
    y: ITEM_RADIUS + layer * LAYER_HEIGHT,
    z: Math.sin(angle) * RING_RADIUS,
  }
}

/** World position of the nth shelved jar. The shelf holds 30 and then reuses places. */
export function shelfSlot(index: number, orientation: Orientation = 'wide'): { x: number; y: number; z: number; scale: number } {
  const shelf = SHELVES[orientation]
  const i = index % SHELF_PLACES
  return {
    x: shelf.x0 + (i % shelf.columns) * shelf.dx,
    y: shelf.y0 + Math.floor(i / shelf.columns) * shelf.dy,
    z: shelf.z,
    scale: shelf.scale,
  }
}

/** Camera distance at which a box of the given size fills the view, for a vertical field of view. */
export function fitDistance(boxWidth: number, boxHeight: number, fovDeg: number, aspect: number): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360)
  return Math.max(boxHeight / 2 / tan, boxWidth / 2 / (tan * aspect))
}
