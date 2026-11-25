import { tick } from './sim'
import type { SimEvent, SimState } from './types'

/**
 * Runs the line before the first frame, so the page opens on a line that is already working.
 * It is a rehearsal: nothing is earned, no order moves, no rare or lucky marble comes
 * and no frenzy is used up, so opening the page again and again gains nothing.
 */
export function warmUp(state: SimState, seconds: number, dt: number, each: (events: SimEvent[]) => void): void {
  const { coins, earned, runEarned, config, luckyIn, frenzyLeft } = state
  const orders = state.orders.map((order) => ({ ...order }))
  state.config = { ...config, rareChance: 0 }
  state.luckyIn = Infinity
  state.frenzyLeft = 0
  for (let step = 0; step < Math.round(seconds / dt); step++) each(tick(state, dt))
  state.config = config
  state.luckyIn = luckyIn
  state.frenzyLeft = frenzyLeft
  state.coins = coins
  state.earned = earned
  state.runEarned = runEarned
  state.orders = orders
}
