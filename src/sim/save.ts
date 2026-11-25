import { COLOUR_HEX, ORDER_KINDS, RARES, UNLOCKS, UPGRADES, type ColourId, type OrderKind, type RareId, type SimConfig, type UpgradeId } from '../content/content'
import { countTowardOrders, createSim, feedInterval, jarAverage, rushSeconds, steadyJarPay } from './sim'
import { STAMPS } from './stamps'
import { configFor, has } from './unlocks'
import type { Order, SimState } from './types'

export interface SaveData {
  v: 1
  /** Milliseconds since 1970, from the clock of the device that saved. */
  savedAt: number
  coins: number
  earned: number
  shelved: number
  sorted: number
  upgrades: Record<UpgradeId, number>
  collection: Partial<Record<RareId, number>>
  stars: number
  runEarned: number
  ordersDone: number
  /** Null when the save has none that can be read. The line then deals new ones. */
  orders: Order[] | null
  rushCharge: number
  /** Seconds of a rush still to run. */
  rushLeft: number
  /** Seconds until the next lucky marble. Null in a save from before there were any. */
  luckyIn: number | null
  luckyCaught: number
  /** Seconds of a frenzy still to run. */
  frenzyLeft: number
  bestChain: number
  sinceRare: number
  /** Rare marbles that were on the belt or waiting to be fed. They come back, so a shower is never lost. */
  rares: RareId[]
  handSorted: number
  rareByHand: number
  rushes: number
  workshops: number
  stamps: string[]
  unlocksSeen: number
}

export interface Away {
  seconds: number
  jars: number
  coins: number
}

/** Shorter absences earn nothing: a page reload should not pay out. */
const MIN_AWAY_SECONDS = 60

export function toSave(state: SimState, now: number): SaveData {
  return {
    v: 1,
    savedAt: now,
    coins: state.coins,
    earned: state.earned,
    shelved: state.shelved,
    sorted: state.sorted,
    upgrades: { ...state.upgrades },
    collection: { ...state.collection },
    stars: state.stars,
    runEarned: state.runEarned,
    ordersDone: state.ordersDone,
    orders: state.orders.map((order) => ({ ...order })),
    rushCharge: state.rushCharge,
    rushLeft: state.rushLeft,
    luckyIn: state.luckyIn,
    luckyCaught: state.luckyCaught,
    frenzyLeft: state.frenzyLeft,
    bestChain: state.bestChain,
    sinceRare: state.sinceRare,
    rares: [...state.items, ...state.recycle].flatMap((kind) => (kind.rare ? [kind.rare] : [])),
    handSorted: state.handSorted,
    rareByHand: state.rareByHand,
    rushes: state.rushes,
    workshops: state.workshops,
    stamps: [...state.stamps],
    unlocksSeen: state.unlocksSeen,
  }
}

/** No real line reaches this. Counts stay far below the size where adding one stops changing a number. */
const MAX_COUNT = 1e15

/** A whole number from 0 to `max`. Anything else stored there becomes 0. */
function count(value: unknown, max = MAX_COUNT): number {
  return typeof value === 'number' && value > 0 ? Math.min(Math.floor(value), max) : 0
}

/** More rare marbles than this are never in play at once, even after two showers in a row. */
const MAX_RARES_KEPT = 13

/** Seconds from 0 up. Anything else stored there becomes 0. */
function seconds(value: unknown): number {
  return typeof value === 'number' && value > 0 ? Math.min(value, MAX_COUNT) : 0
}

/** Reads the orders in a save. One that makes no sense spoils the lot: the line deals new ones instead. */
function parseOrders(raw: unknown): Order[] | null {
  if (!Array.isArray(raw)) return null
  const orders: Order[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) return null
    const { kind, colour, need, have, worth } = entry as Record<string, unknown>
    const size = count(need)
    if (!ORDER_KINDS.includes(kind as OrderKind) || size < 1) return null
    if (typeof worth !== 'number' || !(worth > 0) || worth > MAX_COUNT) return null
    const order: Order = { kind: kind as OrderKind, need: size, have: count(have, size), worth }
    if (order.kind === 'colour') {
      if (typeof colour !== 'string' || !Object.hasOwn(COLOUR_HEX, colour)) return null
      order.colour = colour as ColourId
    }
    orders.push(order)
  }
  return orders
}

/** Reads a stored save. Returns null if it is not one; repairs numbers that make no sense. */
export function parseSave(raw: unknown): SaveData | null {
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Record<string, unknown>
  if (data.v !== 1 || typeof data.savedAt !== 'number' || !Number.isFinite(data.savedAt)) return null
  const levels = (typeof data.upgrades === 'object' && data.upgrades !== null ? data.upgrades : {}) as Record<string, unknown>
  const caught = (typeof data.collection === 'object' && data.collection !== null ? data.collection : {}) as Record<string, unknown>

  const upgrades = {} as Record<UpgradeId, number>
  for (const upgrade of UPGRADES) upgrades[upgrade.id] = count(levels[upgrade.id], upgrade.maxLevel)
  const collection: Partial<Record<RareId, number>> = {}
  for (const rare of RARES) {
    const n = count(caught[rare.id])
    if (n > 0) collection[rare.id] = n
  }
  const earned = count(data.earned)
  return {
    v: 1,
    savedAt: data.savedAt,
    coins: count(data.coins),
    earned,
    stars: count(data.stars),
    // A save from before stars existed is all one run.
    runEarned: typeof data.runEarned === 'number' ? Math.min(count(data.runEarned), earned) : earned,
    ordersDone: count(data.ordersDone),
    orders: parseOrders(data.orders),
    rushCharge: count(data.rushCharge),
    rushLeft: seconds(data.rushLeft),
    luckyIn: typeof data.luckyIn === 'number' ? seconds(data.luckyIn) : null,
    luckyCaught: count(data.luckyCaught),
    frenzyLeft: seconds(data.frenzyLeft),
    bestChain: count(data.bestChain),
    sinceRare: count(data.sinceRare),
    rares: (Array.isArray(data.rares) ? data.rares : [])
      .filter((rare): rare is RareId => RARES.some((kind) => kind.id === rare))
      .slice(0, MAX_RARES_KEPT),
    handSorted: count(data.handSorted),
    rareByHand: count(data.rareByHand),
    rushes: count(data.rushes),
    workshops: count(data.workshops),
    unlocksSeen: count(data.unlocksSeen, UNLOCKS.length),
    stamps: STAMPS.map((stamp) => stamp.id).filter((id) => Array.isArray(data.stamps) && data.stamps.includes(id)),
    shelved: count(data.shelved),
    sorted: count(data.sorted),
    upgrades,
    collection,
  }
}

/** What the line earns while nobody is watching: full jars at the away rate, up to the cap. */
export function awayEarnings(state: SimState, seconds: number): { jars: number; coins: number } {
  const { config } = state
  const night = has(state, 'night')
  const counted = Math.min(Math.max(seconds, 0), night ? config.nightCapSeconds : config.awayCapSeconds)
  const jars = Math.floor((counted * (night ? config.nightRate : config.awayRate)) / feedInterval(state) / config.jarCapacity)
  return { jars, coins: Math.round(jars * steadyJarPay(state) * jarAverage(state)) }
}

/**
 * Pays a running line for time nobody was watching, such as a tab left in the background.
 * Returns what was paid, or null when the time was too short to earn anything.
 */
export function payAway(state: SimState, seconds: number): Away | null {
  if (!(seconds >= MIN_AWAY_SECONDS)) return null
  const { jars, coins } = awayEarnings(state, seconds)
  if (jars === 0) return null
  state.coins += coins
  state.earned += coins
  state.runEarned += coins
  state.shelved += jars
  // The jars count toward orders, so there is something to claim on return.
  countTowardOrders(state, 'jars', undefined, jars)
  const ofEachColour = Math.floor(jars / state.config.stations.length)
  for (const station of state.config.stations) countTowardOrders(state, 'colour', station.colour, ofEachColour)
  if (state.config.families.includes('bead')) {
    countTowardOrders(state, 'beads', undefined, Math.floor((jars * state.config.jarCapacity) / state.config.families.length))
  }
  return { seconds, jars, coins }
}

/** Starts the line from a save, or fresh when there is none, and pays for the time away. */
export function resume(config: SimConfig, seed: number, data: SaveData | null, now: number): { state: SimState; away: Away | null } {
  if (!data) return { state: createSim(config, seed), away: null }
  // The line is laid out for the colours and kinds of item the saved stars have earned.
  config = configFor(config, data.stars)
  const state = createSim({ ...config, startShelved: data.shelved }, seed)
  state.coins = data.coins
  state.earned = data.earned
  state.sorted = data.sorted
  state.upgrades = { ...data.upgrades }
  state.collection = { ...data.collection }
  state.stars = data.stars
  state.runEarned = data.runEarned
  state.ordersDone = data.ordersDone
  state.rushCharge = Math.min(data.rushCharge, config.rushHits - 1)
  state.rushLeft = Math.min(data.rushLeft, rushSeconds(state))
  state.luckyIn = data.luckyIn === null ? config.luckyFirst : Math.min(data.luckyIn, config.luckyEvery[1])
  state.luckyCaught = data.luckyCaught
  state.frenzyLeft = Math.min(data.frenzyLeft, config.frenzySeconds)
  state.bestChain = data.bestChain
  state.sinceRare = data.sinceRare
  state.handSorted = data.handSorted
  state.rareByHand = data.rareByHand
  state.rushes = data.rushes
  state.workshops = data.workshops
  state.stamps = [...data.stamps]
  state.unlocksSeen = data.unlocksSeen
  state.recycle.push(...data.rares.map((rare) => ({ family: 'marble' as const, colour: config.stations[0].colour, rare })))
  // Saved orders are kept only if this line can still do every one of them.
  const fits = (order: Order) =>
    (order.kind !== 'colour' || config.stations.some((station) => station.colour === order.colour)) &&
    (order.kind !== 'beads' || config.families.includes('bead'))
  if (data.orders?.length === config.orderSlots && data.orders.every(fits)) state.orders = data.orders.map((order) => ({ ...order }))

  const away = payAway(state, Math.floor((now - data.savedAt) / 1000))
  if (away) state.config = { ...state.config, startShelved: state.shelved }
  return { state, away }
}
