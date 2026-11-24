import type { ColourId, FamilyId, SimConfig } from '../content/content'

export interface ItemKind {
  family: FamilyId
  colour: ColourId
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
}

export type SimEvent =
  | { type: 'spawned'; item: BeltItem }
  | { type: 'sorted'; item: BeltItem; station: number; slot: number; byHand: boolean }
  | { type: 'jarFull'; station: number; shelfIndex: number }
  | { type: 'jarReady'; station: number }
  | { type: 'recycled'; item: BeltItem }
