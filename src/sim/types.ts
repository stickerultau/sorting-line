import type { ColourId, FamilyId, OrderKind, RareId, SimConfig, UpgradeId } from '../content/content'

export interface ItemKind {
  family: FamilyId
  colour: ColourId
  /** Set on a rare marble. The flippers leave these alone; they are caught, not sorted. */
  rare?: RareId
}

export interface BeltItem extends ItemKind {
  id: number
  /** Position along the belt, 0 to config.beltLength. */
  x: number
}

export interface Station {
  x: number
  colour: ColourId
  /** Items in the jar that is currently at this station. */
  count: number
  /** Seconds until a new jar arrives. 0 means a jar is present. */
  swapLeft: number
}

/** A small job on the board. Finishing it earns a reward when it is claimed. */
export interface Order {
  kind: OrderKind
  /** Only on a 'colour' order. */
  colour?: ColourId
  need: number
  have: number
  /** What it pays, counted in full jars at today's price. */
  worth: number
}

export interface SimState {
  config: SimConfig
  rng: number
  /** Time carried over between ticks, always less than STEP. */
  acc: number
  nextId: number
  feedTimer: number
  items: BeltItem[]
  /** Items that fell off the end and wait to be fed again. Nothing is ever lost. */
  recycle: ItemKind[]
  stations: Station[]
  shelved: number
  /** New items ever created (recycled items fed again are not counted twice). */
  created: number
  /** Items ever placed in a jar. */
  sorted: number
  coins: number
  /** Coins ever earned. Spending does not lower it. */
  earned: number
  upgrades: Record<UpgradeId, number>
  /** How many of each rare marble have been caught. */
  collection: Partial<Record<RareId, number>>
  /** Kept through every new workshop. Each one adds a lasting share of extra coins. */
  stars: number
  /** Coins earned since the last new workshop. */
  runEarned: number
  orders: Order[]
  /** Orders ever claimed. */
  ordersDone: number
  /** Orders are drawn from their own stream of numbers, so they never change which items arrive. */
  orderRng: number
  /** Hand sorts counted toward the next rush. */
  rushCharge: number
  /** Seconds of rush left. 0 means no rush. */
  rushLeft: number
}

export type SimEvent =
  | { type: 'spawned'; item: BeltItem }
  | { type: 'sorted'; item: BeltItem; station: number; slot: number; byHand: boolean; coins: number }
  | { type: 'jarFull'; station: number; shelfIndex: number; coins: number }
  | { type: 'caught'; item: BeltItem; rare: RareId; byHand: boolean; coins: number; first: boolean }
  | { type: 'jarReady'; station: number }
  | { type: 'recycled'; item: BeltItem }
  | { type: 'orderReady'; slot: number }
  | { type: 'rushStarted'; seconds: number }
  | { type: 'rushEnded' }
