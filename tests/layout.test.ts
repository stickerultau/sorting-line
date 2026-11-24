import { describe, expect, it } from 'vitest'
import { ITEM_RADIUS, JAR, SHELVES, fitDistance, jarSlot, orientationFor, shelfSlot } from '../src/view/layout'

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
    const total = SHELVES.wide.columns * SHELVES.wide.rows
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

describe('tall (phone) shelf', () => {
  const tall = SHELVES.tall
  const places = Array.from({ length: 30 }, (_, i) => shelfSlot(i, 'tall'))

  it('holds the same 30 jars as the wide shelf', () => {
    expect(tall.columns * tall.rows).toBe(30)
    expect(new Set(places.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`)).size).toBe(30)
    expect(shelfSlot(30, 'tall')).toEqual(shelfSlot(0, 'tall'))
  })

  it('fits inside a frame 8 units wide centred on the middle station', () => {
    const jarHalfWidth = 0.66 * tall.scale // the lid is the widest part of a jar
    for (const p of places) {
      expect(p.x - jarHalfWidth).toBeGreaterThanOrEqual(9 - 4)
      expect(p.x + jarHalfWidth).toBeLessThanOrEqual(9 + 4)
    }
  })

  it('leaves room between neighbouring jars and between rows', () => {
    expect(tall.dx).toBeGreaterThan(2 * 0.66 * tall.scale)
    expect(tall.dy).toBeGreaterThan((JAR.height + 0.26) * tall.scale)
  })

  it('shows bigger jars than the wide shelf', () => {
    expect(tall.scale).toBeGreaterThan(SHELVES.wide.scale)
  })
})

describe('orientationFor', () => {
  it('is tall for a phone held upright and wide otherwise', () => {
    expect(orientationFor(9 / 16)).toBe('tall')
    expect(orientationFor(0.99)).toBe('tall')
    expect(orientationFor(1)).toBe('wide')
    expect(orientationFor(16 / 9)).toBe('wide')
  })
})
