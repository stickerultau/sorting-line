import { LOOKS, type Look, type RareKind } from '../content/content'
import type { SimState } from './types'
import { availableRares } from './unlocks'

const DAY_MS = 86_400_000
/** Weeks are counted so that each one starts on a Monday: 5 January 1970, day 4, was one. */
const MONDAY_SHIFT = 3
/** The marble of the week steps through the marbles by this many places, so the tiers come mixed. It shares no factor with any number of marbles a workshop can have. */
const WEEK_STRIDE = 7

/**
 * The calendar day a moment falls on where the player is, counted in days since 1970.
 * `offsetMinutes` is what the device adds to its local time to get UTC, as `Date.getTimezoneOffset` gives it.
 */
export const dayOf = (ms: number, offsetMinutes: number) => Math.floor((ms - offsetMinutes * 60_000) / DAY_MS)

/** The week a day falls in. Weeks run from Monday to Sunday. */
export const weekOf = (day: number) => Math.floor((day + MONDAY_SHIFT) / 7)

/**
 * The marble of the week: one of the marbles this workshop can deal, which turns up more often until Monday.
 * Every marble gets its turn. Null before the calendar has started.
 */
export function weeklyRare(state: SimState): RareKind | null {
  if (state.day <= 0) return null
  const open = availableRares(state)
  return open[(weekOf(state.day) * WEEK_STRIDE) % open.length]
}

/** The looks the days played have opened. */
export const looksOpen = (state: SimState): Look[] => LOOKS.filter((look) => state.days >= look.days)
