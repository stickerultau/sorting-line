import type { ColourId, FamilyId, LookId, LuckyGift, OrderKind, RareId, SimConfig, UpgradeId } from '../content/content'

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
  /** Seconds until the next lucky marble comes. Stands still while one is on show. */
  luckyIn: number
  /** Seconds the lucky marble on show will stay. 0 means none is there. */
  luckyLeft: number
  /** Lucky marbles have their own stream of numbers too. */
  luckyRng: number
  /** Lucky marbles ever caught. */
  luckyCaught: number
  /** Seconds of frenzy left. 0 means no frenzy. */
  frenzyLeft: number
  /** Hand sorts in the chain that is running. 0 means none. */
  chain: number
  /** Seconds until the running chain ends unless another hand sort comes. */
  chainLeft: number
  /** The longest chain ever. */
  bestChain: number
  /** New items dealt since the last rare marble. A long dry spell raises the chance of the next one. */
  sinceRare: number
  /** Lifetime counts, kept through every new workshop: items sorted by hand, rare marbles caught by hand, rushes, workshops opened. */
  handSorted: number
  rareByHand: number
  rushes: number
  workshops: number
  /** Ids of the stamps earned, in the order they were earned. */
  stamps: string[]
  /** How many unlocks the player has been told about. The rules do not use it; it only stops a notice from showing twice. */
  unlocksSeen: number
  /** The calendar day last played, counted in days since 1970 where the player is. 0 before the calendar has started. */
  day: number
  /** Calendar days played, ever. It never goes down, and a missed day costs nothing. */
  days: number
  /** The order of the day. It never runs out. Null before the first day and once it has been claimed. */
  daily: Order | null
  /** The day the last order of the day was claimed. The next one comes with the first day after it. */
  dailyDay: number
  /** Orders of the day ever claimed. */
  dailyDone: number
  /** The look the player has chosen. The rules do not use it. */
  look: LookId
}

export type SimEvent =
  | { type: 'spawned'; item: BeltItem }
  | { type: 'sorted'; item: BeltItem; station: number; slot: number; byHand: boolean; coins: number; /** The length of the hand chain this is part of. 0 for a flipper. */ chain: number }
  | { type: 'jarFull'; station: number; shelfIndex: number; coins: number; golden: boolean }
  | { type: 'caught'; item: BeltItem; rare: RareId; byHand: boolean; coins: number; first: boolean }
  | { type: 'jarReady'; station: number }
  | { type: 'recycled'; item: BeltItem }
  | { type: 'orderReady'; slot: number }
  /** The order of the day is finished and can be claimed. */
  | { type: 'dailyReady' }
  | { type: 'rushStarted'; seconds: number }
  | { type: 'rushEnded' }
  | { type: 'luckyArrived'; seconds: number }
  /** It left without being caught. */
  | { type: 'luckyGone' }
  /**
   * `coins` is what a gift of coins paid, `slot` the order a gift finished, `upgrade` the level a gift added.
   * `catcher` is set when nobody clicked it and the catcher saved part of it.
   */
  | { type: 'luckyCaught'; gift: LuckyGift; coins: number; slot?: number; upgrade?: UpgradeId; catcher?: true }
  | { type: 'stamp'; id: string }
  | { type: 'frenzyEnded' }
  | { type: 'chainEnded'; length: number }
