import { tick } from './sim'
import type { SimEvent, SimState } from './types'

/**
 * Runs the line before the first frame, so the page opens on a line that is already working.
 * It is a rehearsal: nothing is earned, no jar is counted, no order moves, no rare or lucky marble comes
 * and no rush or frenzy is used up, so opening the page again and again gains or loses nothing.
 * Rare marbles waiting to be fed, kept from the last visit, are held back until it is over.
 */
export function warmUp(state: SimState, seconds: number, dt: number, each: (events: SimEvent[]) => void): void {
  const { coins, earned, runEarned, config, luckyIn, frenzyLeft, rushLeft, shelved, sorted } = state
  // Stamps earned in the rehearsal are handed back, so they are earned again, and announced, once the game is on show.
  const stamps = [...state.stamps]
  const orders = state.orders.map((order) => ({ ...order }))
  const rares = state.recycle.filter((kind) => kind.rare)
  state.recycle = state.recycle.filter((kind) => !kind.rare)
  // No jar filled here is golden: the jar count is handed back below, so the golden one is still to come.
  state.config = { ...config, rareChance: 0, goldenEvery: Infinity }
  state.luckyIn = Infinity
  state.frenzyLeft = 0
  state.rushLeft = 0
  for (let step = 0; step < Math.round(seconds / dt); step++) each(tick(state, dt))
  state.config = config
  state.luckyIn = luckyIn
  state.frenzyLeft = frenzyLeft
  state.rushLeft = rushLeft
  state.stamps = stamps
  state.shelved = shelved
  state.sorted = sorted
  state.recycle.unshift(...rares)
  state.coins = coins
  state.earned = earned
  state.runEarned = runEarned
  state.orders = orders
}
