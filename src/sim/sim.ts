import type { SimConfig } from '../content/content'
import { nextRandom } from './rng'
import type { BeltItem, ItemKind, SimEvent, SimState } from './types'

/** Fixed simulation step. A power of two, so whole steps add up without rounding error. */
export const STEP = 1 / 64
/** A single tick never advances more than this, so a background tab cannot make the line jump. */
export const MAX_DT = 0.25

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
  }
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

function step(state: SimState, events: SimEvent[]): void {
  const { config } = state
  for (let i = 0; i < state.stations.length; i++) {
    const station = state.stations[i]
    if (station.swapLeft <= 0) continue
    station.swapLeft = Math.max(0, station.swapLeft - STEP)
    if (station.swapLeft === 0) events.push({ type: 'jarReady', station: i })
  }

  const kept: BeltItem[] = []
  for (const item of state.items) {
    const from = item.x
    item.x += config.beltSpeed * STEP
    const station = state.stations.findIndex(
      (s) => s.colour === item.colour && s.swapLeft === 0 && from < s.x && item.x >= s.x,
    )
    if (station >= 0) {
      placeInJar(state, item, station, false, events)
    } else if (item.x >= config.beltLength) {
      state.recycle.push({ family: item.family, colour: item.colour })
      events.push({ type: 'recycled', item })
    } else {
      kept.push(item)
    }
  }
  state.items = kept
  feed(state, events)
}

function placeInJar(state: SimState, item: BeltItem, index: number, byHand: boolean, events: SimEvent[]): void {
  const station = state.stations[index]
  events.push({ type: 'sorted', item, station: index, slot: station.count, byHand })
  station.count++
  state.sorted++
  if (station.count < state.config.jarCapacity) return
  events.push({ type: 'jarFull', station: index, shelfIndex: state.shelved })
  state.shelved++
  station.count = 0
  station.swapLeft = state.config.jarSwapSeconds
}

function feed(state: SimState, events: SimEvent[]): void {
  const { config } = state
  if (state.items.length >= config.maxOnBelt) return
  state.feedTimer += STEP
  if (state.feedTimer < config.feedInterval) return
  state.feedTimer -= config.feedInterval
  const kind = state.recycle.shift() ?? newKind(state)
  const item = { id: state.nextId++, family: kind.family, colour: kind.colour, x: 0 }
  state.items.push(item)
  events.push({ type: 'spawned', item })
}

function newKind(state: SimState): ItemKind {
  const { families, stations } = state.config
  state.created++
  return {
    family: families[Math.floor(nextRandom(state) * families.length)],
    colour: stations[Math.floor(nextRandom(state) * stations.length)].colour,
  }
}

/** Sorts one belt item into its jar by hand. Does nothing if the item or its jar is not there. */
export function flick(state: SimState, itemId: number): SimEvent[] {
  const events: SimEvent[] = []
  const at = state.items.findIndex((item) => item.id === itemId)
  if (at < 0) return events
  const item = state.items[at]
  const station = state.stations.findIndex((s) => s.colour === item.colour && s.swapLeft === 0)
  if (station < 0) return events
  state.items.splice(at, 1)
  placeInJar(state, item, station, true, events)
  return events
}
