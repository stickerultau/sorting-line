import { RARES, TIER_WEIGHT, UPGRADES, type RareId, type SimConfig, type UpgradeId } from '../content/content'
import { nextRandom } from './rng'
import type { BeltItem, ItemKind, SimEvent, SimState } from './types'

/** Fixed simulation step. A power of two, so whole steps add up without rounding error. */
export const STEP = 1 / 64
/** A single tick never advances more than this, so a background tab cannot make the line jump. */
export const MAX_DT = 0.25

const RARE_WEIGHT_TOTAL = RARES.reduce((sum, rare) => sum + TIER_WEIGHT[rare.tier], 0)

export function createSim(config: SimConfig, seed: number): SimState {
  return {
    config,
    rng: seed | 0,
    acc: 0,
    nextId: 1,
    feedTimer: 0,
    items: [],
    recycle: [],
    stations: config.stations.map((s) => ({ x: s.x, colour: s.colour, count: 0, swapLeft: 0 })),
    shelved: config.startShelved,
    created: 0,
    sorted: 0,
    coins: 0,
    earned: 0,
    upgrades: { belt: 0, feeder: 0, lids: 0, luck: 0, spotter: 0 },
    collection: {},
  }
}

// What the upgrades do. The view and the away-time sums read the line's speed through these.
export const beltSpeed = (state: SimState) => state.config.beltSpeed * (1 + 0.12 * state.upgrades.belt)
export const feedInterval = (state: SimState) => state.config.feedInterval * 0.9 ** state.upgrades.feeder
export const jarValue = (state: SimState) => Math.round(state.config.jarCoins * (1 + 0.2 * state.upgrades.lids))
export const rareChance = (state: SimState) => state.config.rareChance * (1 + 0.25 * state.upgrades.luck)

/** The price of the next level, or null when the upgrade is at its top level. */
export function upgradeCost(state: SimState, id: UpgradeId): number | null {
  const upgrade = UPGRADES.find((u) => u.id === id)
  if (!upgrade) return null
  const level = state.upgrades[id]
  return level >= upgrade.maxLevel ? null : Math.round(upgrade.baseCost * upgrade.growth ** level)
}

/** Buys the next level of an upgrade. Returns false, changing nothing, if it cannot be bought. */
export function buy(state: SimState, id: UpgradeId): boolean {
  const cost = upgradeCost(state, id)
  if (cost === null || state.coins < cost) return false
  state.coins -= cost
  state.upgrades[id]++
  return true
}

export function tick(state: SimState, dt: number): SimEvent[] {
  const events: SimEvent[] = []
  if (!(dt > 0)) return events
  state.acc += Math.min(dt, MAX_DT)
  while (state.acc >= STEP) {
    state.acc -= STEP
    step(state, events)
  }
  return events
}

function pay(state: SimState, coins: number): number {
  state.coins += coins
  state.earned += coins
  return coins
}

function step(state: SimState, events: SimEvent[]): void {
  const { config } = state
  for (let i = 0; i < state.stations.length; i++) {
    const station = state.stations[i]
    if (station.swapLeft <= 0) continue
    station.swapLeft = Math.max(0, station.swapLeft - STEP)
    if (station.swapLeft === 0) events.push({ type: 'jarReady', station: i })
  }

  const speed = beltSpeed(state)
  const kept: BeltItem[] = []
  for (const item of state.items) {
    const from = item.x
    item.x += speed * STEP
    const station = item.rare
      ? -1
      : state.stations.findIndex((s) => s.colour === item.colour && s.swapLeft === 0 && from < s.x && item.x >= s.x)
    if (station >= 0) {
      placeInJar(state, item, station, false, events)
    } else if (item.x < config.beltLength) {
      kept.push(item)
    } else if (item.rare && state.upgrades.spotter > 0) {
      catchRare(state, item, item.rare, false, events)
    } else {
      state.recycle.push({ family: item.family, colour: item.colour, rare: item.rare })
      events.push({ type: 'recycled', item })
    }
  }
  state.items = kept
  feed(state, events)
}

function placeInJar(state: SimState, item: BeltItem, index: number, byHand: boolean, events: SimEvent[]): void {
  const station = state.stations[index]
  const tip = byHand ? pay(state, state.config.handTip) : 0
  events.push({ type: 'sorted', item, station: index, slot: station.count, byHand, coins: tip })
  station.count++
  state.sorted++
  if (station.count < state.config.jarCapacity) return
  events.push({ type: 'jarFull', station: index, shelfIndex: state.shelved, coins: pay(state, jarValue(state)) })
  state.shelved++
  station.count = 0
  station.swapLeft = state.config.jarSwapSeconds
}

function catchRare(state: SimState, item: BeltItem, rare: RareId, byHand: boolean, events: SimEvent[]): void {
  const kind = RARES.find((r) => r.id === rare)!
  const owned = state.collection[rare] ?? 0
  state.collection[rare] = owned + 1
  events.push({ type: 'caught', item, rare, byHand, coins: pay(state, kind.coins * (byHand ? 2 : 1)), first: owned === 0 })
}

function feed(state: SimState, events: SimEvent[]): void {
  const { config } = state
  if (state.items.length >= config.maxOnBelt) return
  state.feedTimer += STEP
  const interval = feedInterval(state)
  if (state.feedTimer < interval) return
  state.feedTimer -= interval
  const kind = state.recycle.shift() ?? newKind(state)
  const item: BeltItem = { id: state.nextId++, family: kind.family, colour: kind.colour, x: 0 }
  if (kind.rare) item.rare = kind.rare
  state.items.push(item)
  events.push({ type: 'spawned', item })
}

function newKind(state: SimState): ItemKind {
  const { families, stations, maxRares } = state.config
  state.created++
  // The recycle queue is empty whenever a new kind is made, so every rare marble in play is on the belt.
  const chance = rareChance(state)
  if (chance > 0 && state.items.filter((item) => item.rare).length < maxRares && nextRandom(state) < chance) {
    return { family: 'marble', colour: stations[0].colour, rare: pickRare(state) }
  }
  return {
    family: families[Math.floor(nextRandom(state) * families.length)],
    colour: stations[Math.floor(nextRandom(state) * stations.length)].colour,
  }
}

function pickRare(state: SimState): RareId {
  let roll = nextRandom(state) * RARE_WEIGHT_TOTAL
  for (const rare of RARES) {
    roll -= TIER_WEIGHT[rare.tier]
    if (roll < 0) return rare.id
  }
  return RARES[RARES.length - 1].id
}

/**
 * A click on a belt item. An ordinary item is sorted into its jar by hand; a rare marble is caught.
 * Does nothing if the item is gone or its jar is not there.
 */
export function flick(state: SimState, itemId: number): SimEvent[] {
  const events: SimEvent[] = []
  const at = state.items.findIndex((item) => item.id === itemId)
  if (at < 0) return events
  const item = state.items[at]
  if (item.rare) {
    state.items.splice(at, 1)
    catchRare(state, item, item.rare, true, events)
    return events
  }
  const station = state.stations.findIndex((s) => s.colour === item.colour && s.swapLeft === 0)
  if (station < 0) return events
  state.items.splice(at, 1)
  placeInJar(state, item, station, true, events)
  return events
}
