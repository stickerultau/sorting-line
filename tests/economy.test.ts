import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, RARES, UPGRADES, type SimConfig } from '../src/content/content'
import { beltSpeed, buy, createSim, feedInterval, flick, jarValue, rareChance, tick, upgradeCost } from '../src/sim/sim'
import type { SimEvent, SimState } from '../src/sim/types'

const NO_RARES: SimConfig = { ...DEFAULT_CONFIG, rareChance: 0, startShelved: 0 }
const QUIET: SimConfig = { ...NO_RARES, feedInterval: 1000 }
const ONE_RARE: SimConfig = { ...DEFAULT_CONFIG, rareChance: 1, maxRares: 1, startShelved: 0 }

function run(state: SimState, seconds: number, each?: () => void): SimEvent[] {
  const events: SimEvent[] = []
  for (let i = 0; i < seconds * 32; i++) {
    events.push(...tick(state, 1 / 32))
    each?.()
  }
  return events
}

const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)

const raresAround = (state: SimState) =>
  state.items.filter((item) => item.rare).length + state.recycle.filter((kind) => kind.rare).length

describe('coins', () => {
  it('pays the jar value each time a jar is full', () => {
    const state = createSim(NO_RARES, 3)
    const jars = ofType(run(state, 30), 'jarFull')
    expect(jars.length).toBeGreaterThan(3)
    for (const jar of jars) expect(jar.coins).toBe(NO_RARES.jarCoins)
    expect(state.coins).toBe(jars.length * NO_RARES.jarCoins)
    expect(state.earned).toBe(state.coins)
  })

  it('pays a tip for sorting by hand and nothing extra for the flippers', () => {
    const state = createSim(QUIET, 1)
    state.items.push({ id: 1, family: 'marble', colour: 'red', x: 1 }, { id: 2, family: 'button', colour: 'blue', x: 2 })
    const [byHand] = ofType(flick(state, 1), 'sorted')
    expect(byHand.coins).toBe(QUIET.handTip)
    expect(state.coins).toBe(QUIET.handTip)

    const [byFlipper] = ofType(run(state, 6), 'sorted')
    expect(byFlipper.byHand).toBe(false)
    expect(byFlipper.coins).toBe(0)
    expect(state.coins).toBe(QUIET.handTip)
  })
})

describe('upgrades', () => {
  it('takes the cost and raises the level, and the next level costs more', () => {
    const state = createSim(QUIET, 1)
    state.coins = 1000
    const cost = upgradeCost(state, 'belt')!
    expect(cost).toBe(UPGRADES.find((u) => u.id === 'belt')!.baseCost)
    expect(buy(state, 'belt')).toBe(true)
    expect(state.coins).toBe(1000 - cost)
    expect(state.upgrades.belt).toBe(1)
    expect(upgradeCost(state, 'belt')!).toBeGreaterThan(cost)
    expect(state.earned).toBe(0) // spending is not earning
  })

  it('refuses when coins are short', () => {
    const state = createSim(QUIET, 1)
    state.coins = upgradeCost(state, 'feeder')! - 1
    expect(buy(state, 'feeder')).toBe(false)
    expect(state.upgrades.feeder).toBe(0)
  })

  it('stops at the top level', () => {
    const state = createSim(QUIET, 1)
    state.coins = 1e12
    const top = UPGRADES.find((u) => u.id === 'spotter')!.maxLevel
    for (let i = 0; i < top; i++) expect(buy(state, 'spotter')).toBe(true)
    expect(upgradeCost(state, 'spotter')).toBeNull()
    expect(buy(state, 'spotter')).toBe(false)
    expect(state.upgrades.spotter).toBe(top)
  })

  it('makes the belt faster, the feeder quicker, jars worth more and rare marbles likelier', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    const before = { belt: beltSpeed(state), feed: feedInterval(state), jar: jarValue(state), rare: rareChance(state) }
    state.coins = 1e9
    for (const id of ['belt', 'feeder', 'lids', 'luck'] as const) buy(state, id)
    expect(beltSpeed(state)).toBeGreaterThan(before.belt)
    expect(feedInterval(state)).toBeLessThan(before.feed)
    expect(jarValue(state)).toBeGreaterThan(before.jar)
    expect(rareChance(state)).toBeGreaterThan(before.rare)
  })

  it('a quicker feeder shelves more jars in the same time', () => {
    const slow = createSim(NO_RARES, 9)
    const quick = createSim(NO_RARES, 9)
    quick.upgrades.feeder = 6
    quick.upgrades.belt = 6
    run(slow, 120)
    run(quick, 120)
    expect(quick.shelved).toBeGreaterThan(slow.shelved * 1.4)
  })
})

describe('rare marbles', () => {
  it('ride past every station and come round again, so none is lost', () => {
    const state = createSim(ONE_RARE, 4)
    let most = 0
    const events = run(state, 30, () => (most = Math.max(most, raresAround(state))))
    expect(ofType(events, 'sorted').some((event) => event.item.rare)).toBe(false)
    const recycled = ofType(events, 'recycled').filter((event) => event.item.rare)
    expect(recycled.length).toBeGreaterThan(1)
    const spawned = ofType(events, 'spawned').filter((event) => event.item.rare)
    expect(new Set(spawned.map((event) => event.item.rare)).size).toBe(1) // the same marble each lap
    expect(most).toBe(1)
    expect(raresAround(state)).toBe(1)
  })

  it('never has more in circulation than the cap', () => {
    const state = createSim({ ...ONE_RARE, maxRares: 3 }, 8)
    let most = 0
    run(state, 60, () => (most = Math.max(most, raresAround(state))))
    expect(most).toBe(3)
  })

  it('caught by hand: joins the collection and pays double', () => {
    const state = createSim(ONE_RARE, 4)
    run(state, 2)
    const rare = state.items.find((item) => item.rare)!
    const kind = RARES.find((r) => r.id === rare.rare)!
    const [caught] = ofType(flick(state, rare.id), 'caught')
    expect(caught).toMatchObject({ rare: kind.id, byHand: true, first: true, coins: kind.coins * 2 })
    expect(state.collection[kind.id]).toBe(1)
    expect(state.coins).toBe(kind.coins * 2)
    expect(state.items.some((item) => item.id === rare.id)).toBe(false)
  })

  it('the second catch of a kind is not a first find', () => {
    const state = createSim(ONE_RARE, 4)
    run(state, 2)
    const rare = state.items.find((item) => item.rare)!
    state.collection[rare.rare!] = 5
    const [caught] = ofType(flick(state, rare.id), 'caught')
    expect(caught.first).toBe(false)
    expect(state.collection[rare.rare!]).toBe(6)
  })

  it('the spotter catches them at the end of the belt for the plain price', () => {
    const state = createSim(ONE_RARE, 4)
    state.upgrades.spotter = 1
    const events = run(state, 30)
    const caught = ofType(events, 'caught')
    expect(caught.length).toBeGreaterThan(1)
    expect(caught[0].coins).toBe(RARES.find((r) => r.id === caught[0].rare)!.coins)
    for (const event of caught) {
      expect(event.byHand).toBe(false)
      // Later catches pay a little more as the collection grows, but never the double paid for a catch by hand.
      expect(event.coins).toBeLessThan(RARES.find((r) => r.id === event.rare)!.coins * 1.5)
    }
    expect(ofType(events, 'recycled').some((event) => event.item.rare)).toBe(false)
  })

  it('legendary marbles turn up less often than uncommon ones', () => {
    const state = createSim({ ...ONE_RARE, maxRares: 3 }, 11)
    state.upgrades.spotter = 1
    const tiers = [0, 0, 0, 0]
    for (const event of ofType(run(state, 900), 'caught')) tiers[RARES.find((r) => r.id === event.rare)!.tier]++
    expect(tiers[3]).toBeGreaterThan(0)
    expect(tiers[1]).toBeGreaterThan(tiers[2])
    expect(tiers[2]).toBeGreaterThan(tiers[3])
  })
})
