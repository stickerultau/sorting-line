import { RARES, UPGRADES, type RareId, type SimConfig, type UpgradeId } from '../content/content'
import { createSim, feedInterval, jarValue } from './sim'
import type { SimState } from './types'

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
  }
}

/** A whole number from 0 to `max`. Anything else stored there becomes 0. */
function count(value: unknown, max = Number.MAX_SAFE_INTEGER): number {
  return typeof value === 'number' && value > 0 ? Math.min(Math.floor(value), max) : 0
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
  return {
    v: 1,
    savedAt: data.savedAt,
    coins: count(data.coins),
    earned: count(data.earned),
    shelved: count(data.shelved),
    sorted: count(data.sorted),
    upgrades,
    collection,
  }
}

/** What the line earns while nobody is watching: full jars at the away rate, up to the cap. */
export function awayEarnings(state: SimState, seconds: number): { jars: number; coins: number } {
  const { awayRate, awayCapSeconds, jarCapacity } = state.config
  const counted = Math.min(Math.max(seconds, 0), awayCapSeconds)
  const jars = Math.floor((counted * awayRate) / feedInterval(state) / jarCapacity)
  return { jars, coins: jars * jarValue(state) }
}

/** Starts the line from a save, or fresh when there is none, and pays for the time away. */
export function resume(config: SimConfig, seed: number, data: SaveData | null, now: number): { state: SimState; away: Away | null } {
  if (!data) return { state: createSim(config, seed), away: null }
  const state = createSim({ ...config, startShelved: data.shelved }, seed)
  state.coins = data.coins
  state.earned = data.earned
  state.sorted = data.sorted
  state.upgrades = { ...data.upgrades }
  state.collection = { ...data.collection }

  const seconds = Math.floor((now - data.savedAt) / 1000)
  if (seconds < MIN_AWAY_SECONDS) return { state, away: null }
  const { jars, coins } = awayEarnings(state, seconds)
  if (jars === 0) return { state, away: null }
  state.coins += coins
  state.earned += coins
  state.shelved += jars
  state.config = { ...state.config, startShelved: state.shelved }
  return { state, away: { seconds, jars, coins } }
}
