import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, type SimConfig } from '../src/content/content'
import { createSim, flick, tick } from '../src/sim/sim'
import type { SimState } from '../src/sim/types'
import type { LineAudio } from '../src/view/audio'
import { LineView, type LineFx } from '../src/view/lineView'
import { buildModels, type LineSet } from '../src/view/models'

// The view runs here without a browser: real models and scene graph, no renderer.
// Only the parts that need a canvas (the textured set) and a sound card are stood in for.

const silentAudio: LineAudio = {
  unlock() {},
  setMuted() {},
  clink() {},
  snap() {},
  tock() {},
  bonus() {},
  jar() {},
  rare() {},
  buy() {},
  order() {},
  rush() {},
  star() {},
  lucky() {},
  gift() {},
}

function bareSet(config: SimConfig): LineSet {
  return {
    group: new THREE.Group(),
    flippers: config.stations.map(() => new THREE.Group()),
    scrollBelt() {},
    setShelf() {},
    setLed() {},
    setLamp() {},
    chute: new THREE.Vector3(0, 0.95, 0),
    bin: new THREE.Vector3(config.beltLength + 1.15, -0.75, 0),
  }
}

function makeView(state: SimState, camera = new THREE.PerspectiveCamera()) {
  const scene = new THREE.Scene()
  const pops: string[] = []
  const fx: LineFx = { pop: (_at, text) => pops.push(text) }
  const models = buildModels()
  const view = new LineView(scene, camera, models, bareSet(state.config), state.config, silentAudio, fx)
  /** How many different places hold a jar. The three stations count too. */
  const jarPlaces = () =>
    new Set(
      scene.children
        .filter((child) => child instanceof THREE.Mesh && child.geometry === models.jarGeometry)
        .map((jar) => jar.position.toArray().map((n) => n.toFixed(2)).join()),
    ).size
  return { view, scene, pops, jarPlaces }
}

const rareMeshes = (scene: THREE.Scene) => scene.children.filter((child) => child.userData.rare)

/** World positions of every item instance that is actually on show (freed ones are parked far below). */
function liveItems(scene: THREE.Scene): THREE.Vector3[] {
  const positions: THREE.Vector3[] = []
  const matrix = new THREE.Matrix4()
  for (const child of scene.children) {
    if (!(child instanceof THREE.InstancedMesh)) continue
    for (let i = 0; i < child.count; i++) {
      child.getMatrixAt(i, matrix)
      const position = new THREE.Vector3().setFromMatrixPosition(matrix)
      if (position.y > -500) positions.push(position)
    }
  }
  return positions
}

const QUIET: SimConfig = { ...DEFAULT_CONFIG, feedInterval: 1000, startShelved: 0 }

describe('LineView', () => {
  it('draws belt items between simulation steps, so they move as smoothly as the belt', () => {
    const state = createSim(QUIET, 1)
    state.items.push({ id: 1, family: 'marble', colour: 'red', x: 2 })
    const { view, scene } = makeView(state)
    view.update(state, 0)
    expect(liveItems(scene)[0].x).toBe(2)

    tick(state, 1 / 128) // half a step: the simulation has not moved the item yet
    expect(state.items[0].x).toBe(2)
    view.update(state, 1 / 128)
    expect(liveItems(scene)[0].x).toBeCloseTo(2 + QUIET.beltSpeed / 128, 6)
  })

  it('clears a shelf place before the next jar lands on it', () => {
    const state = createSim({ ...QUIET, startShelved: 30 }, 1)
    const { view, scene } = makeView(state)
    view.update(state, 0)
    expect(liveItems(scene)).toHaveLength(30 * 12)

    // An empty jar leaves station 0 for shelf place 0, which is taken.
    view.handle([{ type: 'jarFull', station: 0, shelfIndex: 30, coins: 10 }])
    for (let t = 0; t < 1.2; t += 1 / 32) view.update(state, 1 / 32) // the new jar is still in flight
    expect(liveItems(scene)).toHaveLength(29 * 12)
  })

  it('shows exactly the items the simulation holds after 30 minutes', () => {
    const state = createSim(DEFAULT_CONFIG, 5)
    const { view, scene } = makeView(state)
    for (let i = 0; i < 30 * 60 * 32; i++) {
      view.handle(tick(state, 1 / 32))
      view.update(state, 1 / 32)
    }
    // Let every flight and lid finish without advancing the simulation.
    for (let i = 0; i < 3 * 32; i++) view.update(state, 1 / 32)

    expect(state.shelved).toBeGreaterThan(300)
    const inJars = state.stations.reduce((sum, station) => sum + station.count, 0)
    const rares = state.items.filter((item) => item.rare).length
    expect(liveItems(scene)).toHaveLength(state.items.length - rares + inJars + 30 * DEFAULT_CONFIG.jarCapacity)
    expect(rareMeshes(scene)).toHaveLength(rares)
  })

  it('shows a rare marble as its own mesh and takes it away once it is caught', () => {
    const state = createSim(QUIET, 1)
    state.items.push({ id: 1, family: 'marble', colour: 'red', x: 2, rare: 'galaxy' })
    const { view, scene, pops } = makeView(state)
    view.update(state, 0)
    expect(liveItems(scene)).toHaveLength(0)
    expect(rareMeshes(scene)).toHaveLength(1)
    expect(rareMeshes(scene)[0].position.x).toBe(2)

    view.handle(flick(state, 1))
    for (let t = 0; t < 3; t += 1 / 32) view.update(state, 1 / 32)
    expect(rareMeshes(scene)).toHaveLength(0)
    expect(pops).toEqual(['+600'])
  })

  it('fills every shelf place when the line resumes with many jars', () => {
    const state = createSim({ ...QUIET, startShelved: 500 }, 1)
    const { view, scene, jarPlaces } = makeView(state)
    view.update(state, 0)
    expect(liveItems(scene)).toHaveLength(30 * 12)
    expect(jarPlaces()).toBe(30 + 3)
  })

  it('fills the empty shelf places when many jars were filled out of sight', () => {
    const state = createSim({ ...QUIET, startShelved: 4 }, 1)
    const { view, scene, jarPlaces } = makeView(state)
    expect(jarPlaces()).toBe(4 + 3)
    view.restock(500)
    expect(jarPlaces()).toBe(30 + 3)
    expect(liveItems(scene)).toHaveLength(30 * 12)
  })

  it('a click between a plain item and a rare marble catches the marble', () => {
    const state = createSim(QUIET, 1)
    state.items.push({ id: 1, family: 'button', colour: 'red', x: 5 }, { id: 2, family: 'marble', colour: 'red', x: 5.6, rare: 'opal' })
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(5.3, 2, 12)
    camera.lookAt(5.3, 0, 0)
    camera.updateMatrixWorld()
    const { view, scene } = makeView(state, camera)
    view.update(state, 0)
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement
    const onScreen = (at: THREE.Vector3) => {
      const p = at.clone().project(camera)
      return new THREE.Vector2((p.x * 0.5 + 0.5) * 800, (-p.y * 0.5 + 0.5) * 600)
    }
    const plain = onScreen(liveItems(scene)[0])
    const rare = onScreen(rareMeshes(scene)[0].position)
    expect(plain.distanceTo(rare)).toBeLessThan(40)

    const between = plain.clone().lerp(rare, 0.4) // nearer the plain item
    expect(view.itemAt(between.x, between.y, canvas)).toBe(2)
    expect(view.itemAt(plain.x, plain.y, canvas)).toBe(1)
  })

  it('shows the lucky marble only while one is there, and finds a click on it', () => {
    const state = createSim(QUIET, 1)
    const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.1, 100)
    camera.position.set(8, 2, 16)
    camera.lookAt(8, 0, 0)
    camera.updateMatrixWorld()
    const { view, scene } = makeView(state, camera)
    const canvas = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) } as HTMLCanvasElement
    const lucky = () => scene.children.find((child) => child.userData.lucky)!
    view.update(state, 1 / 60)
    expect(lucky().visible).toBe(false)
    expect(view.luckyAt(400, 300, canvas)).toBe(false)

    state.luckyLeft = state.config.luckySeconds / 2
    view.update(state, 1 / 60)
    expect(lucky().visible).toBe(true)
    const p = lucky().position.clone().project(camera)
    const x = (p.x * 0.5 + 0.5) * 800
    const y = (-p.y * 0.5 + 0.5) * 600
    expect(view.luckyAt(x + 10, y - 10, canvas)).toBe(true)
    expect(view.luckyAt(x + 200, y, canvas)).toBe(false)
    const before = lucky().position.x
    state.luckyLeft -= 1
    view.update(state, 1)
    expect(lucky().position.x).not.toBe(before) // it drifts along the line while it stays

    state.luckyLeft = 0
    view.update(state, 1 / 60)
    expect(lucky().visible).toBe(false)
    expect(view.luckyAt(x, y, canvas)).toBe(false)
  })

  it('says what a lucky marble gave, where it was caught', () => {
    const state = createSim(QUIET, 1)
    const { view, pops } = makeView(state)
    view.handle([
      { type: 'luckyCaught', gift: 'coins', coins: 600 },
      { type: 'luckyCaught', gift: 'frenzy', coins: 0 },
      { type: 'luckyCaught', gift: 'shower', coins: 0 },
      { type: 'luckyCaught', gift: 'order', coins: 0, slot: 1 },
      { type: 'luckyCaught', gift: 'upgrade', coins: 0, upgrade: 'belt' },
    ])
    expect(pops).toEqual(['+600', 'Frenzy!', 'Rare shower!', 'Order done!', 'Free upgrade!'])
  })

  it('shows the coins a full jar pays', () => {
    const state = createSim(QUIET, 1)
    const { view, pops } = makeView(state)
    view.handle([{ type: 'jarFull', station: 1, shelfIndex: 0, coins: 14 }])
    for (let t = 0; t < 2; t += 1 / 32) view.update(state, 1 / 32)
    expect(pops).toEqual(['+14'])
  })
})
