import { describe, expect, it } from 'vitest'
import { ITEM_RADIUS, JAR, SHELF, fitDistance, jarSlot, shelfSlot } from '../src/view/layout'

const slots = Array.from({ length: 12 }, (_, i) => jarSlot(i))

describe('jarSlot', () => {
  it('keeps all 12 slots inside the jar', () => {
    for (const s of slots) {
      expect(Math.hypot(s.x, s.z) + ITEM_RADIUS).toBeLessThanOrEqual(JAR.radius)
      expect(s.y).toBeGreaterThanOrEqual(ITEM_RADIUS)
      expect(s.y).toBeLessThanOrEqual(JAR.height - ITEM_RADIUS)
    }
  })

  it('never overlaps two slots', () => {
    for (let a = 0; a < slots.length; a++) {
      for (let b = a + 1; b < slots.length; b++) {
        const d = Math.hypot(slots[a].x - slots[b].x, slots[a].y - slots[b].y, slots[a].z - slots[b].z)
        expect(d).toBeGreaterThanOrEqual(1.8 * ITEM_RADIUS)
      }
    }
  })

  it('fills from the bottom up', () => {
    for (let i = 1; i < slots.length; i++) expect(slots[i].y).toBeGreaterThanOrEqual(slots[i - 1].y)
  })
})

describe('shelfSlot', () => {
  it('gives 30 distinct places and then wraps', () => {
    const total = SHELF.columns * SHELF.rows
    expect(total).toBe(30)
    const keys = new Set(Array.from({ length: total }, (_, i) => {
      const s = shelfSlot(i)
      return `${s.x.toFixed(3)},${s.y.toFixed(3)}`
    }))
    expect(keys.size).toBe(30)
    expect(shelfSlot(30)).toEqual(shelfSlot(0))
    expect(shelfSlot(67)).toEqual(shelfSlot(7))
  })
})

describe('fitDistance', () => {
  it('is limited by height on a wide screen and by width on a tall one', () => {
    const wide = fitDistance(10, 5, 30, 4)
    const tall = fitDistance(10, 5, 30, 0.5)
    const tan = Math.tan((15 * Math.PI) / 180)
    expect(wide).toBeCloseTo(2.5 / tan, 6)
    expect(tall).toBeCloseTo(5 / (tan * 0.5), 6)
  })
})
