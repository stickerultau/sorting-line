import { MASTERY_AT, RARES } from '../content/content'
import type { SimState } from './types'
import { setsComplete } from './unlocks'

/** A lasting mark for something done. Each one adds a little to every payment. */
export interface Stamp {
  id: string
  name: string
  /** A hidden stamp shows no name until it is earned. */
  hidden?: boolean
  earned(state: SimState): boolean
}

const number = (n: number) => n.toLocaleString('en-US')

/** One stamp for each mark a lifetime count passes. */
function marks(prefix: string, name: (n: string, count: number) => string, at: number[], read: (state: SimState) => number): Stamp[] {
  return at.map((mark) => ({ id: `${prefix}-${mark}`, name: name(number(mark), mark), earned: (state) => read(state) >= mark }))
}

const found = (state: SimState) => RARES.filter((rare) => (state.collection[rare.id] ?? 0) > 0).length
const gold = (state: SimState) => RARES.filter((rare) => (state.collection[rare.id] ?? 0) >= MASTERY_AT[MASTERY_AT.length - 1]).length
const plural = (count: number, one: string, many: string) => (count === 1 ? one : many)

export const STAMPS: Stamp[] = [
  ...marks('jars', (n) => `${n} jars shelved`, [100, 1_000, 10_000, 100_000, 1_000_000], (s) => s.shelved),
  ...marks('coins', (n) => `${n} coins earned`, [10_000, 1_000_000, 100_000_000, 10_000_000_000], (s) => s.earned),
  ...marks('orders', (n) => `${n} orders finished`, [10, 50, 250, 1_000], (s) => s.ordersDone),
  ...marks('hand', (n) => `${n} items sorted by hand`, [100, 1_000, 10_000], (s) => s.handSorted),
  ...marks('chain', (n) => `A chain of ${n}`, [10, 25, 50, 100], (s) => s.bestChain),
  ...marks('lucky', (n, count) => `${n} lucky ${plural(count, 'marble', 'marbles')} caught`, [1, 10, 50, 200], (s) => s.luckyCaught),
  ...marks('rush', (n, count) => `${n} ${plural(count, 'rush', 'rushes')}`, [1, 25, 100], (s) => s.rushes),
  ...marks('stars', (n, count) => `${n} ${plural(count, 'star', 'stars')}`, [1, 10, 50, 250, 1_000], (s) => s.stars),
  ...marks('workshops', (n, count) => `${n} new ${plural(count, 'workshop', 'workshops')}`, [1, 5, 25], (s) => s.workshops),
  ...marks('found', (n, count) => `${n} ${plural(count, 'kind', 'kinds')} of rare marble found`, [1, 6, 12, 24], found),
  ...marks('gold', (n, count) => `${n} ${plural(count, 'marble', 'marbles')} at gold rank`, [1, 6, 12], gold),
  ...marks('byhand', (n) => `${n} rare marbles caught by hand`, [10, 100, 1_000], (s) => s.rareByHand),
  ...marks('sets', (n, count) => `${n} full ${plural(count, 'set', 'sets')} of marbles`, [1, 3, 6], setsComplete),
  { id: 'both-at-once', name: 'A rush and a frenzy at the same time', hidden: true, earned: (s) => s.rushLeft > 0 && s.frenzyLeft > 0 },
  { id: 'clean-board', name: 'Every order finished at once', hidden: true, earned: (s) => s.orders.length > 0 && s.orders.every((order) => order.have >= order.need) },
  { id: 'deep-pockets', name: 'A million coins in hand', hidden: true, earned: (s) => s.coins >= 1_000_000 },
  { id: 'marble-rain', name: 'Five rare marbles on the belt together', hidden: true, earned: (s) => s.items.filter((item) => item.rare).length >= 5 },
]
