export type ColourId = 'red' | 'yellow' | 'blue'
export type FamilyId = 'marble' | 'button'

export const COLOUR_HEX: Record<ColourId, number> = {
  red: 0xe23d44,
  yellow: 0xf4b81f,
  blue: 0x2a78e4,
}

export type RareId =
  | 'catseye' | 'candy' | 'clambroth' | 'agate' | 'onionskin'
  | 'oxblood' | 'sunburst' | 'opal' | 'goldstone'
  | 'galaxy' | 'comet' | 'aurora'

export type RarePattern = 'vane' | 'swirl' | 'bands' | 'streak' | 'speckle' | 'nebula'

export interface RareKind {
  id: RareId
  name: string
  /** 1 uncommon, 2 rare, 3 legendary. */
  tier: 1 | 2 | 3
  /** Coins paid when the spotter catches it. A catch by hand pays double. */
  coins: number
  /** Base glass colour, then the two colours of the pattern inside it. */
  palette: [string, string, string]
  pattern: RarePattern
}

export const TIER_NAME: Record<RareKind['tier'], string> = { 1: 'Uncommon', 2: 'Rare', 3: 'Legendary' }
/** How often each tier turns up, relative to the others. */
export const TIER_WEIGHT: Record<RareKind['tier'], number> = { 1: 6, 2: 3, 3: 1 }

export const RARES: RareKind[] = [
  { id: 'catseye', name: 'Cat’s Eye', tier: 1, coins: 25, palette: ['#d9f2e6', '#1f9d6b', '#f4d35e'], pattern: 'vane' },
  { id: 'candy', name: 'Candy Swirl', tier: 1, coins: 25, palette: ['#f7f3ea', '#e4374a', '#2a78e4'], pattern: 'swirl' },
  { id: 'clambroth', name: 'Clambroth', tier: 1, coins: 25, palette: ['#f3ead8', '#3d7fc4', '#c0563f'], pattern: 'bands' },
  { id: 'agate', name: 'Agate', tier: 1, coins: 25, palette: ['#b8632e', '#f1d9b5', '#6b3415'], pattern: 'bands' },
  { id: 'onionskin', name: 'Onionskin', tier: 1, coins: 25, palette: ['#f2e6c9', '#d6452b', '#2f8f5b'], pattern: 'streak' },
  { id: 'oxblood', name: 'Oxblood', tier: 2, coins: 90, palette: ['#201c1c', '#a01424', '#e9e2d0'], pattern: 'swirl' },
  { id: 'sunburst', name: 'Sunburst', tier: 2, coins: 90, palette: ['#ffb21f', '#ff5a1f', '#fff1b8'], pattern: 'vane' },
  { id: 'opal', name: 'Opal', tier: 2, coins: 90, palette: ['#e8f1f4', '#7ad6c9', '#f2a6d0'], pattern: 'nebula' },
  { id: 'goldstone', name: 'Goldstone', tier: 2, coins: 90, palette: ['#3a1d12', '#f0b54a', '#ffe9b0'], pattern: 'speckle' },
  { id: 'galaxy', name: 'Galaxy', tier: 3, coins: 300, palette: ['#0b1030', '#5a4fd6', '#ff7ad1'], pattern: 'nebula' },
  { id: 'comet', name: 'Comet', tier: 3, coins: 300, palette: ['#081a2b', '#7fe3ff', '#ffffff'], pattern: 'swirl' },
  { id: 'aurora', name: 'Aurora', tier: 3, coins: 300, palette: ['#06231f', '#35f0a0', '#8a6bff'], pattern: 'nebula' },
]

/** Catches of one marble needed for each rank: found, bronze, silver, gold. */
export const MASTERY_AT = [1, 5, 15, 40]
export const MASTERY_NAME = ['Not found yet', 'Found', 'Bronze', 'Silver', 'Gold']
/** Lasting share of extra coins for each rank of a marble, times its tier. */
export const MASTERY_BONUS = 0.02

/** What an order asks for: full jars, full jars of one colour, items sorted by hand, or rare marbles caught. */
export type OrderKind = 'jars' | 'colour' | 'hand' | 'catch'
export const ORDER_KINDS: OrderKind[] = ['jars', 'colour', 'hand', 'catch']

export type UpgradeId = 'belt' | 'feeder' | 'lids' | 'luck' | 'spotter' | 'orders' | 'rush'

export interface Upgrade {
  id: UpgradeId
  name: string
  blurb: string
  baseCost: number
  /** Each level costs this many times the one before. */
  growth: number
  maxLevel: number
}

// Prices were set against a simulated day of play (see the README). The lids have no real top level:
// they are where coins go once the rest is bought, and each new workshop gets a little further up them.
export const UPGRADES: Upgrade[] = [
  { id: 'feeder', name: 'Quicker feeder', blurb: 'Items drop onto the belt 10% faster.', baseCost: 100, growth: 2.1, maxLevel: 8 },
  { id: 'belt', name: 'Faster belt', blurb: 'The belt runs 12% faster, so it can carry more.', baseCost: 80, growth: 1.9, maxLevel: 8 },
  { id: 'lids', name: 'Better lids', blurb: 'Full jars and rare marbles pay 20% more.', baseCost: 120, growth: 1.25, maxLevel: 200 },
  { id: 'luck', name: 'Lucky chute', blurb: 'Rare marbles turn up 15% more often.', baseCost: 250, growth: 2, maxLevel: 6 },
  { id: 'spotter', name: 'Spotter arm', blurb: 'Catches rare marbles you miss, for the plain price.', baseCost: 2500, growth: 1, maxLevel: 1 },
  { id: 'orders', name: 'Order book', blurb: 'Orders pay 10% more.', baseCost: 300, growth: 1.7, maxLevel: 10 },
  { id: 'rush', name: 'Longer rush', blurb: 'A rush lasts 2 seconds longer.', baseCost: 400, growth: 2.2, maxLevel: 5 },
]

export interface SimConfig {
  /** Belt length in world units. Items enter at x = 0 and leave at x = beltLength. */
  beltLength: number
  /** World units per second, before upgrades. */
  beltSpeed: number
  /** Seconds between items entering the belt, before upgrades. */
  feedInterval: number
  maxOnBelt: number
  jarCapacity: number
  /** Seconds a station has no jar after a full one leaves. */
  jarSwapSeconds: number
  /** Jars already on the shelf when the line starts. */
  startShelved: number
  stations: { x: number; colour: ColourId }[]
  families: FamilyId[]
  /** Coins for a full jar, before upgrades. */
  jarCoins: number
  /** Coins for sorting one item by hand. */
  handTip: number
  /** Chance that a new item is a rare marble, before upgrades. */
  rareChance: number
  /** Most rare marbles that can be going round the line at once. */
  maxRares: number
  /** Share of normal earnings paid for time away. */
  awayRate: number
  /** Time away that still earns, in seconds. */
  awayCapSeconds: number
  /** Orders on the board at once. */
  orderSlots: number
  /** Items sorted by hand that fill the rush meter. A rare marble caught by hand counts as five. */
  rushHits: number
  /** Seconds a rush lasts, before upgrades. */
  rushSeconds: number
  /** Coins are multiplied by this during a rush. */
  rushPay: number
  /** Coins earned in one run that give the first star. Each further star takes more: 4, 9, 16 times this. */
  starCoins: number
  /** Lasting share of extra coins for each star. */
  starBonus: number
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
  jarCoins: 10,
  handTip: 1,
  rareChance: 1 / 200,
  maxRares: 3,
  awayRate: 0.5,
  awayCapSeconds: 8 * 3600,
  orderSlots: 3,
  rushHits: 40,
  rushSeconds: 10,
  rushPay: 3,
  starCoins: 10_000,
  starBonus: 0.15,
}
