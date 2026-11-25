import { RARES, SETS, UNLOCKS, type ColourId, type FamilyId, type RareKind, type SimConfig, type Unlock, type UnlockId } from '../content/content'
import type { SimState } from './types'

const STARS = Object.fromEntries(UNLOCKS.map((unlock) => [unlock.id, unlock.stars])) as Record<UnlockId, number>
/** The middle of the stretch of belt the stations share, and how far apart they may stand at most. */
const STATION_CENTRE = 9
const STATION_SPAN = 8.8
const STATION_GAP = 3

const heldAt = (stars: number, id: UnlockId) => stars >= STARS[id]
/** Whether this workshop's star total has earned an unlock. Stars never go down, so neither do unlocks. */
export const has = (state: SimState, id: UnlockId) => heldAt(state.stars, id)

/** The next unlock still to come, or null when all are held. */
export const nextUnlock = (stars: number): Unlock | null => UNLOCKS.find((unlock) => unlock.stars > stars) ?? null

/**
 * The line as it is laid out for a star total: a station for every colour earned, and every kind of item earned.
 * Returns the same config when it already fits, so a caller can tell whether anything has to be rebuilt.
 */
export function configFor(config: SimConfig, stars: number): SimConfig {
  const colours: ColourId[] = config.stations.map((station) => station.colour).filter((colour) => colour !== 'green' && colour !== 'purple')
  if (heldAt(stars, 'green')) colours.push('green')
  if (heldAt(stars, 'purple')) colours.push('purple')
  const families: FamilyId[] = config.families.filter((family) => family !== 'bead')
  if (heldAt(stars, 'beads')) families.push('bead')

  const sameStations = colours.length === config.stations.length
  if (sameStations && families.length === config.families.length) return config
  const gap = Math.min(STATION_GAP, STATION_SPAN / Math.max(1, colours.length - 1))
  const stations = sameStations
    ? config.stations
    : colours.map((colour, index) => ({ x: STATION_CENTRE + (index - (colours.length - 1) / 2) * gap, colour }))
  return { ...config, stations, families }
}

const SET_OF = new Map(SETS.flatMap((set) => set.rares.map((rare) => [rare, set] as const)))

/** The rare marbles this workshop can deal: those of the first sets, and of each set whose unlock is held. */
export function availableRares(state: SimState): RareKind[] {
  return RARES.filter((rare) => {
    const unlock = SET_OF.get(rare.id)?.unlock
    return !unlock || has(state, unlock)
  })
}

/** How many sets have every one of their marbles found. */
export function setsComplete(state: SimState): number {
  return SETS.filter((set) => set.rares.every((rare) => (state.collection[rare] ?? 0) > 0)).length
}
