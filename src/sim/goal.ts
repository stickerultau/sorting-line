import { MASTERY_AT, RARES, TIER_WEIGHT, UPGRADES, type RareId, type UpgradeId } from '../content/content'
import { feedInterval, masteryRank, nextStarAt, rareChance, upgradeCost } from './sim'
import type { SimState } from './types'

/** The nearest thing a player is waiting for, and about how many seconds away it is. */
export type Goal =
  | { kind: 'upgrade'; id: UpgradeId; seconds: number }
  | { kind: 'order'; slot: number; seconds: number }
  | { kind: 'star'; seconds: number }
  /** `rank` is the rank that `more` catches of this marble will reach. */
  | { kind: 'marble'; rare: RareId; rank: number; more: number; seconds: number }

const RARE_WEIGHT_TOTAL = RARES.reduce((sum, rare) => sum + TIER_WEIGHT[rare.tier], 0)

/**
 * The goal that is soonest at the rate the line is working and earning now. Things that can be had already,
 * such as an upgrade in reach or a finished order, are left out: the overlay shows those where they are.
 * Orders for hand work are left out too, since only the player knows how fast those go.
 * Null when nothing can be foretold.
 */
export function nextGoal(state: SimState, coinsPerSecond: number): Goal | null {
  const goals: Goal[] = []
  const { config } = state
  const jarSeconds = feedInterval(state) * config.jarCapacity
  const chance = rareChance(state)
  const rareSeconds = chance > 0 ? feedInterval(state) / chance : Infinity

  if (coinsPerSecond > 0) {
    // The cheapest upgrade still out of reach.
    let cheapest: { id: UpgradeId; cost: number } | null = null
    for (const upgrade of UPGRADES) {
      const cost = upgradeCost(state, upgrade.id)
      if (cost === null || cost <= state.coins) continue
      if (!cheapest || cost < cheapest.cost) cheapest = { id: upgrade.id, cost }
    }
    if (cheapest) goals.push({ kind: 'upgrade', id: cheapest.id, seconds: (cheapest.cost - state.coins) / coinsPerSecond })
    goals.push({ kind: 'star', seconds: (nextStarAt(state) - state.runEarned) / coinsPerSecond })
  }

  state.orders.forEach((order, slot) => {
    const left = order.need - order.have
    if (left <= 0 || order.kind === 'hand') return
    const each = order.kind === 'jars' ? jarSeconds : order.kind === 'colour' ? jarSeconds * config.stations.length : rareSeconds
    goals.push({ kind: 'order', slot, seconds: left * each })
  })

  for (const rare of RARES) {
    const owned = state.collection[rare.id] ?? 0
    const rank = masteryRank(owned)
    if (owned === 0 || rank >= MASTERY_AT.length) continue
    const more = MASTERY_AT[rank] - owned
    goals.push({ kind: 'marble', rare: rare.id, rank: rank + 1, more, seconds: (more * rareSeconds * RARE_WEIGHT_TOTAL) / TIER_WEIGHT[rare.tier] })
  }

  let soonest: Goal | null = null
  for (const goal of goals) if (Number.isFinite(goal.seconds) && (!soonest || goal.seconds < soonest.seconds)) soonest = goal
  return soonest
}
