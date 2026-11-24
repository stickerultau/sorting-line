// Pure layout maths for the line. No three.js here, so it can be unit tested.
// World: the belt runs along +X from 0 to beltLength, its top surface is y = 0, the camera looks from +Z.

export const ITEM_RADIUS = 0.2

/** A jar stands in front of the belt, its rim just below the belt surface. */
export const JAR = { radius: 0.55, height: 1.35, topY: -0.35, z: 1.3 }

export const SHELF = { columns: 10, rows: 3, scale: 0.55, x0: 4.6, dx: 0.98, y0: 1.0, dy: 0.95, z: -1.5 }

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
export function shelfSlot(index: number): { x: number; y: number; z: number; scale: number } {
  const i = index % (SHELF.columns * SHELF.rows)
  return {
    x: SHELF.x0 + (i % SHELF.columns) * SHELF.dx,
    y: SHELF.y0 + Math.floor(i / SHELF.columns) * SHELF.dy,
    z: SHELF.z,
    scale: SHELF.scale,
  }
}

/** Camera distance at which a box of the given size fills the view, for a vertical field of view. */
export function fitDistance(boxWidth: number, boxHeight: number, fovDeg: number, aspect: number): number {
  const tan = Math.tan((fovDeg * Math.PI) / 360)
  return Math.max(boxHeight / 2 / tan, boxWidth / 2 / (tan * aspect))
}
