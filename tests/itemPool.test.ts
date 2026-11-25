import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { ItemPool } from '../src/view/itemPool'
import { buildModels } from '../src/view/models'

function setUp(capacity = 8) {
  const scene = new THREE.Scene()
  const models = buildModels()
  const pool = new ItemPool(scene, models, capacity)
  const drawn = (family: 'marble' | 'button') =>
    (scene.children.find((child) => (child as THREE.InstancedMesh).geometry === models.itemGeometry[family]) as THREE.InstancedMesh).count
  return { pool, drawn }
}

describe('ItemPool', () => {
  it('draws nothing until an item is taken, then only as many as are in use', () => {
    const { pool, drawn } = setUp()
    expect(drawn('marble')).toBe(0)
    expect(drawn('button')).toBe(0)
    pool.alloc('marble', 'red')
    pool.alloc('marble', 'blue')
    pool.alloc('button', 'yellow')
    expect(drawn('marble')).toBe(2)
    expect(drawn('button')).toBe(1)
  })

  it('stops drawing the last items once they are given back', () => {
    const { pool, drawn } = setUp()
    const [a, b, c] = [pool.alloc('marble', 'red'), pool.alloc('marble', 'red'), pool.alloc('marble', 'red')]
    pool.release('marble', b) // a gap in the middle: the one after it is still in use
    expect(drawn('marble')).toBe(3)
    pool.release('marble', c)
    expect(drawn('marble')).toBe(1)
    pool.release('marble', a)
    expect(drawn('marble')).toBe(0)
  })

  it('fills gaps before growing, so what is drawn stays close to what is in use', () => {
    const { pool, drawn } = setUp()
    const handles = [0, 1, 2, 3].map(() => pool.alloc('marble', 'red'))
    pool.release('marble', handles[2])
    pool.release('marble', handles[0])
    expect(pool.alloc('marble', 'blue')).toBe(handles[0])
    expect(pool.alloc('marble', 'blue')).toBe(handles[2])
    expect(drawn('marble')).toBe(4)
    expect(pool.alloc('marble', 'blue')).toBe(4)
    expect(drawn('marble')).toBe(5)
  })

  it('still says so when every place is taken', () => {
    const { pool } = setUp(2)
    pool.alloc('button', 'red')
    pool.alloc('button', 'red')
    expect(() => pool.alloc('button', 'red')).toThrow(/full/)
  })

  it('keeps the items light enough to draw hundreds of them', () => {
    const { itemGeometry } = buildModels()
    const triangles = (geometry: THREE.BufferGeometry) => (geometry.index ? geometry.index.count : geometry.attributes.position.count) / 3
    expect(triangles(itemGeometry.marble)).toBeLessThanOrEqual(700)
    expect(triangles(itemGeometry.button)).toBeLessThanOrEqual(900)
  })
})
