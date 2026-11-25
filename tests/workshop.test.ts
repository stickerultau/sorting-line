import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, RARES, SETS, UNLOCKS, type RareId, type SimConfig, type UnlockId } from '../src/content/content'
import { nextGoal } from '../src/sim/goal'
import { awayEarnings, parseSave, resume, toSave } from '../src/sim/save'
import { catchLucky, claimOrder, createSim, feedInterval, flick, prestige, steadyIncome, steadyJarPay, steadyMultiplier, tick } from '../src/sim/sim'
import { STAMPS } from '../src/sim/stamps'
import { availableRares, configFor, has, setsComplete, unlockedBetween } from '../src/sim/unlocks'
import type { SimEvent, SimState } from '../src/sim/types'

const NOW = 1_800_000_000_000
const starsFor = (id: UnlockId) => UNLOCKS.find((unlock) => unlock.id === id)!.stars
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)

/** A line as it stands for a player with this many stars. */
function lineWith(stars: number, config: SimConfig = DEFAULT_CONFIG, seed = 3): SimState {
  const state = createSim(configFor(config, stars), seed)
  state.stars = stars
  return state
}

function run(state: SimState, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let t = 0; t < seconds; t += 0.25) events.push(...tick(state, 0.25))
  return events
}

let nextId = 9000
function sortByHand(state: SimState, colour = state.stations[0].colour): SimEvent[] {
  const id = nextId++
  state.items.push({ id, family: 'button', colour, x: 1 })
  return flick(state, id)
}

describe('unlocks at star totals', () => {
  it('come in a fixed order, each at more stars than the one before', () => {
    expect(UNLOCKS.map((unlock) => unlock.id)).toEqual(['green', 'catcher', 'beads', 'golden', 'twin', 'magnet', 'purple', 'night'])
    for (let i = 1; i < UNLOCKS.length; i++) expect(UNLOCKS[i].stars).toBeGreaterThan(UNLOCKS[i - 1].stars)
    expect(UNLOCKS[0].stars).toBeGreaterThanOrEqual(1)
  })

  it('are held from the star total on, and a new workshop can bring several at once', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    expect(has(state, 'green')).toBe(false)
    state.stars = starsFor('green')
    expect(has(state, 'green')).toBe(true)
    expect(has(state, 'catcher')).toBe(false)
    expect(unlockedBetween(0, starsFor('beads')).map((unlock) => unlock.id)).toEqual(['green', 'catcher', 'beads'])
    expect(unlockedBetween(starsFor('beads'), starsFor('beads') + 1)).toEqual([])
  })

  it('green and purple each add a colour and a jar station, spread along the belt', () => {
    expect(configFor(DEFAULT_CONFIG, 0)).toBe(DEFAULT_CONFIG)
    const four = configFor(DEFAULT_CONFIG, starsFor('green'))
    expect(four.stations.map((station) => station.colour)).toEqual(['red', 'yellow', 'blue', 'green'])
    const five = configFor(DEFAULT_CONFIG, starsFor('purple'))
    expect(five.stations.map((station) => station.colour)).toEqual(['red', 'yellow', 'blue', 'green', 'purple'])
    for (const config of [four, five]) {
      const xs = config.stations.map((station) => station.x)
      expect(xs).toEqual([...xs].sort((a, b) => a - b))
      expect(xs[0]).toBeGreaterThanOrEqual(4.4)
      expect(xs[xs.length - 1]).toBeLessThanOrEqual(13.6)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(2)
    }
    // Asking again changes nothing, so the same line is not rebuilt.
    expect(configFor(four, starsFor('green'))).toBe(four)
  })

  it('a new workshop that earns a colour lays the stations out again; one that does not leaves the line alone', () => {
    const same = createSim(DEFAULT_CONFIG, 3)
    same.stars = starsFor('purple') + 5 // every colour is held already
    same.config = configFor(same.config, same.stars)
    const held = same.config
    same.runEarned = DEFAULT_CONFIG.starCoins
    expect(prestige(same)).toBe(1)
    expect(same.config).toBe(held)

    const state = createSim(DEFAULT_CONFIG, 3)
    const before = state.config
    state.stars = starsFor('green') - 1
    state.runEarned = DEFAULT_CONFIG.starCoins
    state.items.push({ id: 1, family: 'marble', colour: 'red', x: 3 }, { id: 2, family: 'marble', colour: 'red', x: 4, rare: 'opal' })
    prestige(state)
    expect(state.config).not.toBe(before)
    expect(state.stations.map((station) => station.colour)).toEqual(['red', 'yellow', 'blue', 'green'])
    expect(state.stations.every((station) => station.count === 0 && station.swapLeft === 0)).toBe(true)
    // The belt is cleared for the new layout, but a rare marble in play is not lost.
    expect(state.items).toEqual([])
    expect(state.recycle.filter((kind) => kind.rare).map((kind) => kind.rare)).toEqual(['opal'])
    const colours = new Set(ofType(run(state, 60), 'spawned').map((event) => event.item.colour))
    expect(colours.has('green')).toBe(true)
  })

  it('a save comes back with the stations its stars have earned', () => {
    const state = lineWith(starsFor('purple'))
    const data = parseSave(JSON.parse(JSON.stringify(toSave(state, NOW))))
    const { state: back } = resume(DEFAULT_CONFIG, 9, data, NOW + 5_000)
    expect(back.stations).toHaveLength(5)
    expect(back.config.stations).toHaveLength(5)
  })

  it('the catcher turns a lucky marble nobody clicked into half a gift of coins', () => {
    const plain = lineWith(starsFor('catcher') - 1, { ...DEFAULT_CONFIG, rareChance: 0 })
    plain.luckyLeft = 0.5
    const missed = run(plain, 1)
    expect(ofType(missed, 'luckyGone')).toHaveLength(1)
    expect(plain.coins).toBe(ofType(missed, 'jarFull').reduce((sum, event) => sum + event.coins, 0))

    const state = lineWith(starsFor('catcher'), { ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000 })
    state.luckyLeft = 0.5
    const expected = Math.round(steadyIncome(state) * state.config.luckyCoinSeconds * state.config.catcherShare)
    const events = run(state, 1)
    expect(ofType(events, 'luckyGone')).toHaveLength(0)
    expect(ofType(events, 'luckyCaught')).toEqual([{ type: 'luckyCaught', gift: 'coins', coins: expected, catcher: true }])
    expect(state.coins).toBe(expected)
    expect(state.luckyCaught).toBe(0) // only the player's own catches are counted
    expect(state.luckyLeft).toBe(0)
    expect(state.luckyIn).toBeGreaterThanOrEqual(state.config.luckyEvery[0] - 1)
    // A marble the player does catch is not paid twice.
    state.luckyLeft = 5
    const own = catchLucky(state)
    expect(ofType(own, 'luckyCaught')).toHaveLength(1)
    expect(ofType(own, 'luckyCaught')[0].catcher).toBeUndefined()
  })

  it('every tenth jar is golden and pays five times, and steady earnings and time away count that in', () => {
    const quiet = { ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000, startShelved: 0, handTip: 0, jarCapacity: 1, jarSwapSeconds: 0 }
    const pays = (stars: number) => {
      const state = lineWith(stars, quiet)
      const jars: { coins: number; golden: boolean }[] = []
      for (let i = 0; i < 20; i++) for (const event of ofType(sortByHand(state), 'jarFull')) jars.push({ coins: event.coins, golden: event.golden })
      return { state, jars }
    }
    const before = pays(starsFor('golden') - 1)
    expect(before.jars.every((jar) => !jar.golden)).toBe(true)

    const { state, jars } = pays(starsFor('golden'))
    const plain = jars[0].coins
    expect(jars.map((jar) => jar.golden)).toEqual(jars.map((_, index) => index % 10 === 9))
    expect(plain).toBe(Math.round(quiet.jarCoins * steadyMultiplier(state)))
    expect(jars[9].coins).toBe(Math.round(quiet.jarCoins * steadyMultiplier(state) * state.config.goldenPay))
    expect(jars[10].coins).toBe(plain)

    const average = 1 + (state.config.goldenPay - 1) / state.config.goldenEvery
    expect(steadyIncome(state)).toBeCloseTo((steadyJarPay(state) * average) / (feedInterval(state) * quiet.jarCapacity), 6)
    const away = awayEarnings(state, 3600)
    expect(away.coins).toBe(Math.round(away.jars * steadyJarPay(state) * average))
  })

  it('the twin chute feeds items twice as fast and gives the belt room for them', () => {
    const before = lineWith(starsFor('twin') - 1)
    const after = lineWith(starsFor('twin'))
    expect(feedInterval(after)).toBeCloseTo(feedInterval(before) / 2, 9)
    const count = (state: SimState) => ofType(run(state, 60), 'spawned').length
    expect(count(after)).toBeGreaterThan(count(before) * 1.7)
  })

  it('the magnet slows rare marbles to half speed and leaves the rest alone', () => {
    const quiet = { ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000 }
    for (const [stars, share] of [[starsFor('magnet') - 1, 1], [starsFor('magnet'), 0.5]] as const) {
      const state = lineWith(stars, quiet)
      state.items.push({ id: 1, family: 'marble', colour: 'red', x: 0, rare: 'opal' }, { id: 2, family: 'button', colour: 'red', x: 0 })
      tick(state, 0.25)
      tick(state, 0.25)
      expect(state.items[1].x).toBeCloseTo(quiet.beltSpeed * 0.5, 6)
      expect(state.items[0].x).toBeCloseTo(quiet.beltSpeed * 0.5 * share, 6)
    }
  })

  it('the night shift pays three quarters of the usual earnings for up to twelve hours away', () => {
    const before = lineWith(starsFor('night') - 1)
    const after = lineWith(starsFor('night'))
    const jars = (state: SimState, hours: number) => awayEarnings(state, hours * 3600).jars
    expect(jars(before, 8)).toBe(jars(before, 20))
    expect(jars(after, 12)).toBe(jars(after, 20))
    expect(jars(after, 12) / jars(before, 8)).toBeCloseTo((0.75 * 12) / (0.5 * 8), 1)
  })

  it('beads arrive as a third kind of item, with orders of their own', () => {
    const without = lineWith(starsFor('beads') - 1)
    expect(ofType(run(without, 120), 'spawned').some((event) => event.item.family === 'bead')).toBe(false)
    let seenOrder = false
    for (let seed = 1; seed <= 30; seed++) seenOrder ||= createSim(configFor(DEFAULT_CONFIG, starsFor('beads') - 1), seed).orders.some((order) => order.kind === 'beads')
    expect(seenOrder).toBe(false)

    const state = lineWith(starsFor('beads'), { ...DEFAULT_CONFIG, rareChance: 0 })
    state.orders = [{ kind: 'beads', need: 6, have: 0, worth: 1 }, state.orders[1], state.orders[2]]
    const events = run(state, 60)
    const beads = ofType(events, 'sorted').filter((event) => event.item.family === 'bead').length
    expect(beads).toBeGreaterThan(20)
    expect(state.orders[0].have).toBe(6)
    expect(ofType(events, 'orderReady').some((event) => event.slot === 0)).toBe(true)
    expect(claimOrder(state, 0)).toBeGreaterThan(0)
    for (let seed = 1; seed <= 30; seed++) seenOrder ||= lineWith(starsFor('beads'), DEFAULT_CONFIG, seed).orders.some((order) => order.kind === 'beads')
    expect(seenOrder).toBe(true)
    // The next goal can tell how long a bead order will take: a third of the items are beads.
    state.orders = [{ kind: 'beads', need: 12, have: 0, worth: 1 }, { kind: 'hand', need: 50, have: 0, worth: 1 }, { kind: 'hand', need: 50, have: 0, worth: 1 }]
    expect(nextGoal(state, 0)).toEqual({ kind: 'order', slot: 0, seconds: 12 * 3 * feedInterval(state) })
  })
})

describe('lifetime counts', () => {
  it('count hand sorts, rare marbles caught by hand, rushes and workshops, and are saved', () => {
    const state = createSim({ ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000, rushHits: 3, jarCapacity: 1000 }, 3)
    for (let i = 0; i < 4; i++) sortByHand(state)
    state.items.push({ id: 77, family: 'marble', colour: 'red', x: 1, rare: 'galaxy' })
    flick(state, 77)
    expect(state.handSorted).toBe(4)
    expect(state.rareByHand).toBe(1)
    expect(state.rushes).toBe(1)
    state.runEarned = state.config.starCoins * 4
    prestige(state)
    expect(state.workshops).toBe(1)
    expect(state.handSorted).toBe(4) // a new workshop keeps them

    const { state: back } = resume(DEFAULT_CONFIG, 9, parseSave(JSON.parse(JSON.stringify(toSave(state, NOW)))), NOW + 5_000)
    expect([back.handSorted, back.rareByHand, back.rushes, back.workshops]).toEqual([4, 1, 1, 1])
    const old = JSON.parse(JSON.stringify(toSave(state, NOW)))
    for (const key of ['handSorted', 'rareByHand', 'rushes', 'workshops', 'stamps']) delete old[key]
    const { state: fromOld } = resume(DEFAULT_CONFIG, 9, parseSave(old), NOW + 5_000)
    expect([fromOld.handSorted, fromOld.rareByHand, fromOld.rushes, fromOld.workshops, fromOld.stamps]).toEqual([0, 0, 0, 0, []])
  })
})

describe('stamps', () => {
  it('are about fifty, each with its own id and name, a few of them hidden until earned', () => {
    expect(STAMPS.length).toBeGreaterThanOrEqual(45)
    expect(new Set(STAMPS.map((stamp) => stamp.id)).size).toBe(STAMPS.length)
    expect(new Set(STAMPS.map((stamp) => stamp.name)).size).toBe(STAMPS.length)
    const hidden = STAMPS.filter((stamp) => stamp.hidden).length
    expect(hidden).toBeGreaterThanOrEqual(3)
    expect(hidden).toBeLessThanOrEqual(6)
  })

  it('are earned once when their mark is reached, and each adds one percent to every payment for good', () => {
    const state = createSim({ ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000 }, 3)
    expect(ofType(run(state, 2), 'stamp')).toEqual([])
    const before = steadyMultiplier(state)
    state.shelved = 100
    const events = run(state, 2)
    expect(ofType(events, 'stamp')).toEqual([{ type: 'stamp', id: 'jars-100' }])
    expect(state.stamps).toEqual(['jars-100'])
    expect(steadyMultiplier(state)).toBeCloseTo(before * 1.01, 9)
    expect(ofType(run(state, 3), 'stamp')).toEqual([])
    state.bestChain = 30
    expect(ofType(run(state, 2), 'stamp').map((event) => event.id)).toEqual(['chain-10', 'chain-25'])
  })

  it('include a hidden one for a rush and a frenzy at the same time', () => {
    const state = createSim({ ...DEFAULT_CONFIG, rareChance: 0, feedInterval: 1000 }, 3)
    state.rushLeft = 5
    expect(ofType(run(state, 2), 'stamp')).toEqual([])
    state.frenzyLeft = 5
    const earned = ofType(run(state, 2), 'stamp').map((event) => STAMPS.find((stamp) => stamp.id === event.id)!)
    expect(earned).toHaveLength(1)
    expect(earned[0].hidden).toBe(true)
  })

  it('are kept through a new workshop and a reload; ids that do not exist are dropped', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    state.stamps = ['jars-100', 'chain-10']
    state.runEarned = state.config.starCoins
    prestige(state)
    expect(state.stamps.slice(0, 2)).toEqual(['jars-100', 'chain-10'])
    const raw = JSON.parse(JSON.stringify(toSave(state, NOW)))
    raw.stamps = ['jars-100', 'no-such-stamp', 'jars-100', 9, 'chain-10']
    expect(parseSave(raw)!.stamps).toEqual(['jars-100', 'chain-10'])
    expect(resume(DEFAULT_CONFIG, 9, parseSave(raw), NOW + 5_000).state.stamps).toEqual(['jars-100', 'chain-10'])
  })
})

describe('marble sets', () => {
  it('are six sets of four, and every one of the 24 marbles is in exactly one', () => {
    expect(RARES).toHaveLength(24)
    expect(SETS).toHaveLength(6)
    expect(SETS.every((set) => set.rares.length === 4)).toBe(true)
    expect([...SETS.flatMap((set) => set.rares)].sort()).toEqual(RARES.map((rare) => rare.id).sort())
    expect(SETS.filter((set) => set.unlock).map((set) => set.unlock)).toEqual(['green', 'beads', 'purple'])
  })

  it('three sets come with unlocks: their marbles are never dealt before', () => {
    const first = SETS.filter((set) => !set.unlock).flatMap((set) => set.rares)
    const state = lineWith(0)
    expect(availableRares(state).map((rare) => rare.id).sort()).toEqual([...first].sort())
    state.upgrades.spotter = 1
    const dealt = new Set<RareId>()
    for (const event of ofType(run(state, 3600), 'spawned')) if (event.item.rare) dealt.add(event.item.rare)
    expect(dealt.size).toBeGreaterThan(8)
    expect([...dealt].every((rare) => first.includes(rare))).toBe(true)

    const later = lineWith(starsFor('purple'))
    expect(availableRares(later)).toHaveLength(24)
    later.upgrades.spotter = 1
    const garden = SETS.find((set) => set.unlock === 'green')!.rares
    const seen = ofType(run(later, 3600), 'spawned').some((event) => event.item.rare && garden.includes(event.item.rare))
    expect(seen).toBe(true)
  })

  it('a full set adds ten percent to every payment', () => {
    const state = createSim(DEFAULT_CONFIG, 3)
    const set = SETS[0]
    for (const rare of set.rares.slice(0, 3)) state.collection[rare] = 1
    expect(setsComplete(state)).toBe(0)
    const before = steadyMultiplier(state)
    state.collection[set.rares[3]] = 1
    expect(setsComplete(state)).toBe(1)
    // The fourth marble also adds its own rank bonus; the set bonus comes on top of that.
    const rank = state.config.starBonus * 0 + RARES.find((rare) => rare.id === set.rares[3])!.tier * 0.02
    expect(steadyMultiplier(state) / before).toBeCloseTo(((1 + 3 * 0.02 + rank) / (1 + 3 * 0.02)) * 1.1, 6)
  })
})
