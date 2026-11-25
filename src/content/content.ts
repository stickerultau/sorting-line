export type ColourId = 'red' | 'yellow' | 'blue' | 'green' | 'purple'
export type FamilyId = 'marble' | 'button' | 'bead'
/** Every kind of item there is. A line starts with the first two; beads come with an unlock. */
export const FAMILIES: FamilyId[] = ['marble', 'button', 'bead']

export const COLOUR_HEX: Record<ColourId, number> = {
  red: 0xe23d44,
  yellow: 0xf4b81f,
  blue: 0x2a78e4,
  green: 0x2fa85a,
  purple: 0x8b52d9,
}

/** Lasting things a workshop gains when its owner's star total reaches a mark. */
export type UnlockId = 'green' | 'catcher' | 'beads' | 'golden' | 'twin' | 'magnet' | 'purple' | 'night'

export interface Unlock {
  id: UnlockId
  name: string
  blurb: string
  /** The star total it comes at. */
  stars: number
}

// The star totals were set against a simulated player who plays half an hour a day (see the README).
export const UNLOCKS: Unlock[] = [
  { id: 'green', name: 'Green', blurb: 'A fourth colour and jar station, and four new marbles to find.', stars: 3 },
  { id: 'catcher', name: 'Catcher', blurb: 'Collects a lucky marble you miss, for half a gift of coins.', stars: 40 },
  { id: 'beads', name: 'Beads', blurb: 'A third kind of item, with its own orders and four new marbles.', stars: 200 },
  { id: 'golden', name: 'Golden jars', blurb: 'Every tenth jar is golden and pays five times.', stars: 700 },
  { id: 'twin', name: 'Twin chute', blurb: 'Items drop twice as fast, so the line carries far more.', stars: 1_800 },
  { id: 'magnet', name: 'Magnet', blurb: 'Rare marbles ride the belt at half speed, so they are easier to catch.', stars: 4_000 },
  { id: 'purple', name: 'Purple', blurb: 'A fifth colour and jar station, and four new marbles to find.', stars: 7_000 },
  { id: 'night', name: 'Night shift', blurb: 'Time away pays three quarters, for up to twelve hours.', stars: 12_000 },
]

export type RareId =
  | 'catseye' | 'candy' | 'clambroth' | 'agate' | 'onionskin'
  | 'oxblood' | 'sunburst' | 'opal' | 'goldstone'
  | 'galaxy' | 'comet' | 'aurora'
  | 'fern' | 'petal' | 'honey' | 'dragonfly'
  | 'seafoam' | 'coral' | 'pearl' | 'abyss'
  | 'plum' | 'amethyst' | 'velvet' | 'crown'

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
  { id: 'fern', name: 'Fern', tier: 1, coins: 25, palette: ['#e6f4d7', '#3f8f3a', '#c9e265'], pattern: 'streak' },
  { id: 'petal', name: 'Petal', tier: 1, coins: 25, palette: ['#fbe9ef', '#e86a9a', '#f7c84a'], pattern: 'vane' },
  { id: 'honey', name: 'Honey', tier: 2, coins: 90, palette: ['#f6c544', '#b86b12', '#fff2c2'], pattern: 'bands' },
  { id: 'dragonfly', name: 'Dragonfly', tier: 3, coins: 300, palette: ['#0d2b2a', '#2fe0c0', '#5a7dff'], pattern: 'nebula' },
  { id: 'seafoam', name: 'Seafoam', tier: 1, coins: 25, palette: ['#dff5ef', '#4fc3b0', '#2a78e4'], pattern: 'swirl' },
  { id: 'coral', name: 'Coral', tier: 1, coins: 25, palette: ['#fde3d6', '#f0624d', '#ffd08a'], pattern: 'speckle' },
  { id: 'pearl', name: 'Pearl', tier: 2, coins: 90, palette: ['#f4f1ea', '#d9cfe6', '#bfe3e0'], pattern: 'nebula' },
  { id: 'abyss', name: 'Abyss', tier: 3, coins: 300, palette: ['#04101f', '#1f6bff', '#35f0d0'], pattern: 'swirl' },
  { id: 'plum', name: 'Plum', tier: 1, coins: 25, palette: ['#ead9f2', '#7a3fa8', '#e5b84a'], pattern: 'bands' },
  { id: 'amethyst', name: 'Amethyst', tier: 2, coins: 90, palette: ['#3b1d5e', '#b98cff', '#f1e6ff'], pattern: 'speckle' },
  { id: 'velvet', name: 'Velvet', tier: 2, coins: 90, palette: ['#3a0a1e', '#c2185b', '#f7c6d9'], pattern: 'streak' },
  { id: 'crown', name: 'Crown', tier: 3, coins: 300, palette: ['#1c1206', '#ffd24a', '#ff5ad1'], pattern: 'vane' },
]

/** Marbles are collected in sets of four. A set with an unlock is only dealt once that unlock is held. */
export interface MarbleSet {
  id: string
  name: string
  rares: RareId[]
  unlock?: UnlockId
}

export const SETS: MarbleSet[] = [
  { id: 'schoolyard', name: 'Schoolyard', rares: ['catseye', 'candy', 'clambroth', 'onionskin'] },
  { id: 'earth', name: 'Earth', rares: ['agate', 'oxblood', 'sunburst', 'goldstone'] },
  { id: 'sky', name: 'Night sky', rares: ['opal', 'galaxy', 'comet', 'aurora'] },
  { id: 'garden', name: 'Garden', rares: ['fern', 'petal', 'honey', 'dragonfly'], unlock: 'green' },
  { id: 'sea', name: 'Sea', rares: ['seafoam', 'coral', 'pearl', 'abyss'], unlock: 'beads' },
  { id: 'royal', name: 'Royal', rares: ['plum', 'amethyst', 'velvet', 'crown'], unlock: 'purple' },
]

/** Catches of one marble needed for each rank: found, bronze, silver, gold. */
export const MASTERY_AT = [1, 5, 15, 40]
export const MASTERY_NAME = ['Not found yet', 'Found', 'Bronze', 'Silver', 'Gold']
/** Lasting share of extra coins for each rank of a marble, times its tier. */
export const MASTERY_BONUS = 0.02

/** What an order asks for: full jars, full jars of one colour, items sorted by hand, rare marbles caught, or beads put in jars. */
export type OrderKind = 'jars' | 'colour' | 'hand' | 'catch' | 'beads'
export const ORDER_KINDS: OrderKind[] = ['jars', 'colour', 'hand', 'catch', 'beads']

/** What a caught lucky marble can give. */
export type LuckyGift = 'coins' | 'frenzy' | 'shower' | 'order' | 'upgrade'
/** How often each gift is given, relative to the others. */
export const LUCKY_GIFTS: { gift: LuckyGift; weight: number }[] = [
  { gift: 'coins', weight: 40 },
  { gift: 'frenzy', weight: 25 },
  { gift: 'shower', weight: 15 },
  { gift: 'order', weight: 15 },
  { gift: 'upgrade', weight: 5 },
]

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
  /** Seconds of play before a new line's first lucky marble. */
  luckyFirst: number
  /** The shortest and longest wait for the next lucky marble, in seconds. */
  luckyEvery: [number, number]
  /** Seconds a lucky marble stays to be caught. */
  luckySeconds: number
  /** A gift of coins is worth this many seconds of the line's steady earnings. */
  luckyCoinSeconds: number
  /** Rare marbles in a shower. */
  luckyShower: number
  /** Seconds a frenzy lasts. */
  frenzySeconds: number
  /** Coins are multiplied by this during a frenzy. */
  frenzyPay: number
  /** Seconds after a hand sort in which the next one still continues the chain. */
  chainSeconds: number
  /** Share added to the hand tip by each hand sort in a chain after the first. */
  chainStep: number
  /** Hand sorts after the first that still add to the tip. */
  chainTop: number
  /** From this length on, each hand sort in a chain fills the rush meter twice. */
  chainRushAt: number
  /** Lasting share of extra coins for each stamp, and for each full set of marbles. */
  stampBonus: number
  setBonus: number
  /** With golden jars, one jar in this many is golden. */
  goldenEvery: number
  /** A golden jar pays this many times a plain one. */
  goldenPay: number
  /** Share of a gift of coins the catcher saves from a lucky marble nobody clicked. */
  catcherShare: number
  /** With the twin chute, items are fed this many times as fast, and the belt holds this many times as many. */
  twinFeed: number
  twinBelt: number
  /** With the magnet, rare marbles move at this share of the belt's speed. */
  magnetSlow: number
  /** With the night shift, time away pays this share for up to this many seconds. */
  nightRate: number
  nightCapSeconds: number
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
  luckyFirst: 90,
  luckyEvery: [120, 240],
  luckySeconds: 12,
  luckyCoinSeconds: 180,
  luckyShower: 5,
  frenzySeconds: 30,
  frenzyPay: 5,
  chainSeconds: 1.5,
  chainStep: 0.1,
  chainTop: 40,
  chainRushAt: 10,
  stampBonus: 0.01,
  setBonus: 0.1,
  goldenEvery: 10,
  goldenPay: 5,
  catcherShare: 0.5,
  twinFeed: 2,
  twinBelt: 2.5,
  magnetSlow: 0.5,
  nightRate: 0.75,
  nightCapSeconds: 12 * 3600,
}
