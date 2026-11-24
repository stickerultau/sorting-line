export type ColourId = 'red' | 'yellow' | 'blue'
export type FamilyId = 'marble' | 'button'

export const COLOUR_HEX: Record<ColourId, number> = {
  red: 0xe23d44,
  yellow: 0xf4b81f,
  blue: 0x2a78e4,
}

export interface SimConfig {
  /** Belt length in world units. Items enter at x = 0 and leave at x = beltLength. */
  beltLength: number
  /** World units per second. */
  beltSpeed: number
  /** Seconds between items entering the belt. */
  feedInterval: number
  maxOnBelt: number
  jarCapacity: number
  /** Seconds a station has no jar after a full one leaves. */
  jarSwapSeconds: number
  /** Jars already on the shelf when the line starts. */
  startShelved: number
  stations: { x: number; colour: ColourId }[]
  families: FamilyId[]
}

export const DEFAULT_CONFIG: SimConfig = {
  beltLength: 16,
  beltSpeed: 2,
  feedInterval: 0.25,
  maxOnBelt: 40,
  jarCapacity: 12,
  jarSwapSeconds: 1.25,
  startShelved: 7,
  stations: [
    { x: 6, colour: 'red' },
    { x: 9, colour: 'yellow' },
    { x: 12, colour: 'blue' },
  ],
  families: ['marble', 'button'],
}
