import { MASTERY_AT, MASTERY_BONUS, ORDER_KINDS, RARES, TIER_WEIGHT, UPGRADES, type ColourId, type OrderKind, type RareId, type SimConfig, type UpgradeId } from '../content/content'
import { nextRandom } from './rng'
import type { BeltItem, ItemKind, Order, SimEvent, SimState } from './types'

/** Fixed simulation step. A power of two, so whole steps add up without rounding error. */
export const STEP = 1 / 64
/** A single tick never advances more than this, so a background tab cannot make the line jump. */
export const MAX_DT = 0.25

const RARE_WEIGHT_TOTAL = RARES.reduce((sum, rare) => sum + TIER_WEIGHT[rare.tier], 0)
/** Mixed into the seed for the stream of numbers that orders are drawn from. */
const ORDER_SEED = 0x5bd1e995
/** A rare marble caught by hand fills the rush meter as much as this many hand sorts. */
const RUSH_HITS_FOR_RARE = 5
/** Rare marbles turn up this many times as often during a rush. */
const RUSH_RARE = 2

const noUpgrades = () => Object.fromEntries(UPGRADES.map((upgrade) => [upgrade.id, 0])) as Record<UpgradeId, number>

export function createSim(config: SimConfig, seed: number): SimState {
  const state: SimState = {
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
    upgrades: noUpgrades(),
    collection: {},
    stars: 0,
    runEarned: 0,
    orders: [],
    ordersDone: 0,
    orderRng: (seed ^ ORDER_SEED) | 0,
    rushCharge: 0,
    rushLeft: 0,
  }
  dealOrders(state)
  return state
}

// What the upgrades do. The view and the away-time sums read the line's speed through these.
export const beltSpeed = (state: SimState) => state.config.beltSpeed * (1 + 0.12 * state.upgrades.belt)
export const feedInterval = (state: SimState) => state.config.feedInterval * 0.9 ** state.upgrades.feeder
const lidFactor = (state: SimState) => 1 + 0.2 * state.upgrades.lids
export const jarValue = (state: SimState) => Math.round(state.config.jarCoins * lidFactor(state))
export const rareChance = (state: SimState) =>
  state.config.rareChance * (1 + 0.15 * state.upgrades.luck) * (state.rushLeft > 0 ? RUSH_RARE : 1)
export const rushSeconds = (state: SimState) => state.config.rushSeconds + 2 * state.upgrades.rush

/** The rank of a marble caught this many times: 0 not found, then found, bronze, silver, gold. */
export function masteryRank(caught: number): number {
  let rank = 0
  for (const needed of MASTERY_AT) if (caught >= needed) rank++
  return rank
}

/** The lasting share of extra coins earned by the collection: every rank of every marble adds some. */
export function collectionBonus(state: SimState): number {
  let bonus = 0
  for (const rare of RARES) bonus += masteryRank(state.collection[rare.id] ?? 0) * rare.tier * MASTERY_BONUS
  return bonus
}

/** What stars and the collection multiply every payment by. It only ever grows. */
export const steadyMultiplier = (state: SimState) => (1 + state.stars * state.config.starBonus) * (1 + collectionBonus(state))
/** The same, with the rush on top while one is running. */
export const coinMultiplier = (state: SimState) => steadyMultiplier(state) * (state.rushLeft > 0 ? state.config.rushPay : 1)
/** Coins for a full jar outside a rush. Time away is paid at this price. */
export const steadyJarPay = (state: SimState) => Math.round(state.config.jarCoins * (lidFactor(state) * steadyMultiplier(state)))

/** Coins an order pays when it is claimed. It follows the price of a jar, so an old order is never worth less. */
export const orderReward = (state: SimState, order: Order) =>
  Math.round(order.worth * state.config.jarCoins * lidFactor(state) * steadyMultiplier(state) * (1 + 0.1 * state.upgrades.orders))

/** Stars a new workshop would give now. */
export const starsWaiting = (state: SimState) => Math.floor(Math.sqrt(state.runEarned / state.config.starCoins))
/** Coins this run must have earned for one more star than is waiting now. */
export const nextStarAt = (state: SimState) => (starsWaiting(state) + 1) ** 2 * state.config.starCoins

/**
 * Opens a new workshop: coins and upgrades start again, the stars earned in this run are kept for good.
 * Marbles, jars shelved and totals stay. Returns the stars gained; 0, changing nothing, if none is waiting.
 */
export function prestige(state: SimState): number {
  if (starsWaiting(state) < 1) return 0
  // Finished orders are paid first: their coins count toward this run's stars instead of being lost.
  state.orders.forEach((_, slot) => claimOrder(state, slot))
  const stars = starsWaiting(state)
  state.stars += stars
  state.coins = 0
  state.runEarned = 0
  state.upgrades = noUpgrades()
  state.rushCharge = 0
  state.rushLeft = 0
  dealOrders(state)
  return stars
}

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
  state.runEarned += coins
  return coins
}

// Orders.

function orderRandom(state: SimState): number {
  const stream = { rng: state.orderRng }
  const value = nextRandom(stream)
  state.orderRng = stream.rng
  return value
}

function dealOrders(state: SimState): void {
  state.orders = []
  for (let slot = 0; slot < state.config.orderSlots; slot++) state.orders.push(newOrder(state, state.orders))
}

/** A new order of a kind that is not on the board already, sized to a few minutes of this line's work. */
function newOrder(state: SimState, others: Order[]): Order {
  const { config } = state
  const open = ORDER_KINDS.filter((kind) => !others.some((order) => order.kind === kind) && (kind !== 'catch' || config.rareChance > 0))
  const kind = open[Math.floor(orderRandom(state) * open.length)] ?? 'jars'
  const minutes = 1.5 + orderRandom(state) * 2
  const jarsPerMinute = 60 / feedInterval(state) / config.jarCapacity
  if (kind === 'jars') {
    const need = Math.max(5, Math.round((jarsPerMinute * minutes) / 5) * 5)
    return { kind, need, have: 0, worth: need * 0.5 }
  }
  if (kind === 'colour') {
    const colours = config.stations.length
    const need = Math.max(2, Math.round((jarsPerMinute * minutes) / colours))
    const colour = config.stations[Math.floor(orderRandom(state) * colours)].colour
    return { kind, colour, need, have: 0, worth: need * colours * 0.5 }
  }
  if (kind === 'hand') {
    const need = Math.round((minutes * 12) / 5) * 5
    return { kind, need, have: 0, worth: need * 0.12 }
  }
  const need = minutes < 2.5 ? 1 : 2
  return { kind, need, have: 0, worth: need * 4 }
}

/** Counts work toward every order that asks for it. `events` hears about each order this finishes. */
export function countTowardOrders(state: SimState, kind: OrderKind, colour: ColourId | undefined, amount: number, events?: SimEvent[]): void {
  state.orders.forEach((order, slot) => {
    if (order.kind !== kind || order.have >= order.need || (kind === 'colour' && order.colour !== colour)) return
    order.have = Math.min(order.need, order.have + amount)
    if (order.have === order.need) events?.push({ type: 'orderReady', slot })
  })
}

/** Pays a finished order and puts a new one in its place. Returns the coins paid, or null if it is not finished. */
export function claimOrder(state: SimState, slot: number): number | null {
  const order = state.orders[slot]
  if (!order || order.have < order.need) return null
  const coins = pay(state, orderReward(state, order))
  state.ordersDone++
  state.orders[slot] = newOrder(state, state.orders.filter((_, index) => index !== slot))
  return coins
}

/** Hand work fills the rush meter. When it is full the rush starts by itself. */
function chargeRush(state: SimState, hits: number, events: SimEvent[]): void {
  if (state.rushLeft > 0) return
  state.rushCharge += hits
  if (state.rushCharge < state.config.rushHits) return
  state.rushCharge = 0
  state.rushLeft = rushSeconds(state)
  events.push({ type: 'rushStarted', seconds: state.rushLeft })
}

function step(state: SimState, events: SimEvent[]): void {
  const { config } = state
  if (state.rushLeft > 0) {
    state.rushLeft = Math.max(0, state.rushLeft - STEP)
    if (state.rushLeft === 0) events.push({ type: 'rushEnded' })
  }
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
  const { config } = state
  const price = lidFactor(state) * coinMultiplier(state)
  const tip = byHand ? pay(state, Math.round(config.handTip * price)) : 0
  events.push({ type: 'sorted', item, station: index, slot: station.count, byHand, coins: tip })
  station.count++
  state.sorted++
  if (byHand) countTowardOrders(state, 'hand', undefined, 1, events)
  if (station.count < config.jarCapacity) return
  events.push({ type: 'jarFull', station: index, shelfIndex: state.shelved, coins: pay(state, Math.round(config.jarCoins * price)) })
  state.shelved++
  station.count = 0
  station.swapLeft = config.jarSwapSeconds
  countTowardOrders(state, 'jars', undefined, 1, events)
  countTowardOrders(state, 'colour', station.colour, 1, events)
}

function catchRare(state: SimState, item: BeltItem, rare: RareId, byHand: boolean, events: SimEvent[]): void {
  const kind = RARES.find((r) => r.id === rare)!
  const owned = state.collection[rare] ?? 0
  // Priced before it joins the collection: the bonus for a new rank starts with the next payment.
  const coins = pay(state, Math.round(kind.coins * lidFactor(state) * coinMultiplier(state) * (byHand ? 2 : 1)))
  state.collection[rare] = owned + 1
  events.push({ type: 'caught', item, rare, byHand, coins, first: owned === 0 })
  countTowardOrders(state, 'catch', undefined, 1, events)
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
    chargeRush(state, RUSH_HITS_FOR_RARE, events)
    return events
  }
  const station = state.stations.findIndex((s) => s.colour === item.colour && s.swapLeft === 0)
  if (station < 0) return events
  state.items.splice(at, 1)
  placeInJar(state, item, station, true, events)
  chargeRush(state, 1, events)
  return events
}
