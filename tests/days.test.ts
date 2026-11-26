import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, LOOKS, RARES, type SimConfig } from '../src/content/content'
import { dayOf, looksOpen, weekOf, weeklyRare } from '../src/sim/days'
import { parseSave, payAway, resume, toSave } from '../src/sim/save'
import { claimDaily, createSim, giveLucky, orderReward, prestige, setLook, startDay, steadyJarPay, tick } from '../src/sim/sim'
import { STAMPS } from '../src/sim/stamps'
import { availableRares, configFor } from '../src/sim/unlocks'
import { warmUp } from '../src/sim/warmup'
import type { SimEvent, SimState } from '../src/sim/types'

const NOW = 1_800_000_000_000
const HOUR = 3_600_000
/** A Monday, as a count of days since 1970. */
const MONDAY = 20_010
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) =>
  events.filter((event): event is Extract<SimEvent, { type: T }> => event.type === type)

/** No rare or lucky marbles and no stamps, so the sums come out exact. */
const QUIET: SimConfig = { ...DEFAULT_CONFIG, rareChance: 0, luckyFirst: 1e9, stampBonus: 0 }

function run(state: SimState, seconds: number): SimEvent[] {
  const events: SimEvent[] = []
  for (let t = 0; t < seconds; t += 0.25) events.push(...tick(state, 0.25))
  return events
}

describe('the calendar', () => {
  it('a day runs from midnight to midnight where the player is', () => {
    const midnightUtc = 20_000 * 24 * HOUR
    expect(dayOf(midnightUtc, 0)).toBe(20_000)
    expect(dayOf(midnightUtc - 1, 0)).toBe(19_999)
    // Two hours ahead of UTC (the offset is minutes to add to local time to get UTC, so it is negative).
    expect(dayOf(midnightUtc - 2 * HOUR, -120)).toBe(20_000)
    expect(dayOf(midnightUtc - 2 * HOUR - 1, -120)).toBe(19_999)
    // Five hours behind UTC.
    expect(dayOf(midnightUtc + 5 * HOUR - 1, 300)).toBe(19_999)
  })

  it('a week runs from Monday to Sunday', () => {
    // 5 January 1970 was a Monday: day 4.
    expect(weekOf(3)).toBe(weekOf(-3))
    expect(weekOf(4)).toBe(weekOf(3) + 1)
    expect(weekOf(10)).toBe(weekOf(4))
    expect(weekOf(11)).toBe(weekOf(4) + 1)
    expect(weekOf(MONDAY)).toBe(weekOf(MONDAY - 1) + 1)
  })
})

describe('the day card', () => {
  it('counts each calendar day played, once', () => {
    const state = createSim(QUIET, 1)
    expect(state.days).toBe(0)
    expect(startDay(state, MONDAY)).toBe(true)
    expect(state.days).toBe(1)
    expect(startDay(state, MONDAY)).toBe(false)
    expect(state.days).toBe(1)
    expect(startDay(state, MONDAY + 1)).toBe(true)
    expect(state.days).toBe(2)
  })

  it('a missed day costs nothing: the count only ever goes up', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    startDay(state, MONDAY + 1)
    startDay(state, MONDAY + 9)
    expect(state.days).toBe(3)
  })

  it('a clock that goes back counts no day', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    expect(startDay(state, MONDAY - 3)).toBe(false)
    expect(state.days).toBe(1)
    // The calendar follows the clock back, so the next real day is counted.
    expect(startDay(state, MONDAY - 2)).toBe(true)
    expect(state.days).toBe(2)
  })

  it('opens a new look at 3, 7, 14 and 30 days', () => {
    expect(LOOKS.map((look) => look.days)).toEqual([0, 3, 7, 14, 30])
    const state = createSim(QUIET, 1)
    expect(looksOpen(state).map((look) => look.id)).toEqual([LOOKS[0].id])
    state.days = 7
    expect(looksOpen(state)).toEqual(LOOKS.slice(0, 3))
  })

  it('a look can be chosen once it is open, and not before', () => {
    const state = createSim(QUIET, 1)
    expect(state.look).toBe(LOOKS[0].id)
    expect(setLook(state, LOOKS[1].id)).toBe(false)
    expect(state.look).toBe(LOOKS[0].id)
    state.days = 3
    expect(setLook(state, LOOKS[1].id)).toBe(true)
    expect(state.look).toBe(LOOKS[1].id)
  })

  it('has stamps for days played and for orders of the day', () => {
    const state = createSim({ ...QUIET, stampBonus: 0.01 }, 1)
    state.days = 7
    state.dailyDone = 1
    const earned = ofType(tick(state, 0.25), 'stamp').map((event) => event.id)
    expect(earned).toEqual(expect.arrayContaining(['days-3', 'days-7', 'daily-1']))
    expect(earned).not.toContain('days-14')
    expect(STAMPS.some((stamp) => stamp.id === 'days-30')).toBe(true)
  })
})

describe('the order of the day', () => {
  it('there is none until the calendar starts, then one comes with the day', () => {
    const state = createSim(QUIET, 1)
    expect(state.daily).toBeNull()
    startDay(state, MONDAY)
    expect(state.daily).not.toBeNull()
    expect(state.daily!.have).toBe(0)
  })

  it('is about twenty-five minutes of this line, and pays three times an ordinary order of that size', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY) // the kind turns with the day; this day asks for jars
    const daily = state.daily!
    expect(daily.kind).toBe('jars')
    const jarsPerMinute = 60 / QUIET.feedInterval / QUIET.jarCapacity
    expect(daily.need).toBe(jarsPerMinute * QUIET.dailyMinutes)
    expect(daily.worth).toBe(daily.need * 0.5 * QUIET.dailyPay)
    expect(orderReward(state, daily)).toBe(Math.round(daily.worth * steadyJarPay(state)))
  })

  it('pays the same whichever kind the day asks for', () => {
    const worths = [0, 1, 2, 3, 4, 5].map((n) => {
      const state = createSim(configFor(QUIET, 200), 1)
      state.stars = 200 // beads are on this line
      startDay(state, MONDAY + n)
      return [state.daily!.kind, state.daily!.worth] as const
    })
    expect(new Set(worths.map(([kind]) => kind))).toEqual(new Set(['jars', 'hand', 'colour', 'beads']))
    expect(new Set(worths.map(([, worth]) => worth)).size).toBe(1)
  })

  it('never asks for beads on a line that has none', () => {
    for (let n = 0; n < 8; n++) {
      const state = createSim(QUIET, 1)
      startDay(state, MONDAY + n)
      expect(state.daily!.kind).not.toBe('beads')
    }
  })

  it('counts the line\'s work, says when it is finished and pays when claimed', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    state.daily!.need = 3
    expect(claimDaily(state)).toBeNull()
    const events = run(state, 30)
    expect(ofType(events, 'dailyReady')).toHaveLength(1)
    expect(state.daily!.have).toBe(3)
    const before = state.coins
    const reward = orderReward(state, state.daily!)
    expect(claimDaily(state)).toBe(reward)
    expect(state.coins).toBe(before + reward)
    expect(state.dailyDone).toBe(1)
    expect(state.daily).toBeNull()
    // It is not one of the ordinary orders.
    expect(state.ordersDone).toBe(0)
  })

  it('after it is claimed the next one comes with the next day, not sooner', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    state.daily!.have = state.daily!.need
    claimDaily(state)
    startDay(state, MONDAY)
    expect(state.daily).toBeNull()
    startDay(state, MONDAY + 1)
    expect(state.daily).not.toBeNull()
  })

  it('never runs out: an unfinished one stays, with its progress, however many days go by', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    const daily = state.daily!
    daily.have = 40
    startDay(state, MONDAY + 1)
    startDay(state, MONDAY + 5)
    expect(state.daily).toBe(daily)
    expect(state.daily!.have).toBe(40)
  })

  it('a new workshop pays a finished one first and keeps an unfinished one', () => {
    const finished = createSim(QUIET, 1)
    startDay(finished, MONDAY)
    finished.runEarned = QUIET.starCoins
    finished.daily!.have = finished.daily!.need
    const reward = orderReward(finished, finished.daily!)
    prestige(finished)
    expect(finished.dailyDone).toBe(1)
    expect(finished.earned).toBe(reward)

    const unfinished = createSim(QUIET, 1)
    startDay(unfinished, MONDAY)
    unfinished.runEarned = QUIET.starCoins
    unfinished.daily!.have = 7
    prestige(unfinished)
    expect(unfinished.daily!.have).toBe(7)
    expect(unfinished.dailyDone).toBe(0)
  })

  it('the rehearsal before the first frame does not move it', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    warmUp(state, 8, 1 / 32, () => {})
    expect(state.daily!.have).toBe(0)
  })
})

describe('the marble of the week', () => {
  it('there is none until the calendar starts', () => {
    expect(weeklyRare(createSim(DEFAULT_CONFIG, 1))).toBeNull()
  })

  it('stays the same from Monday to Sunday and changes with the week', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    startDay(state, MONDAY)
    const first = weeklyRare(state)!
    startDay(state, MONDAY + 6)
    expect(weeklyRare(state)).toBe(first)
    startDay(state, MONDAY + 7)
    expect(weeklyRare(state)).not.toBe(first)
  })

  it('every marble this workshop can deal gets its turn, and no other does', () => {
    for (const stars of [0, 3, 200, 7_000]) {
      const state = createSim(configFor(DEFAULT_CONFIG, stars), 1)
      state.stars = stars
      const open = availableRares(state)
      const seen = new Set<string>()
      for (let week = 0; week < open.length; week++) {
        startDay(state, MONDAY + week * 7)
        seen.add(weeklyRare(state)!.id)
      }
      expect(seen).toEqual(new Set(open.map((rare) => rare.id)))
    }
  })

  it('turns up three times as often as another marble of its tier, and the others still come', () => {
    const state = createSim({ ...DEFAULT_CONFIG, luckyShower: 6_000 }, 5)
    startDay(state, MONDAY)
    const weekly = weeklyRare(state)!
    giveLucky(state, 'shower', [])
    const count = (id: string) => state.recycle.filter((kind) => kind.rare === id).length
    const peer = availableRares(state).find((rare) => rare.tier === weekly.tier && rare.id !== weekly.id)!
    const ratio = count(weekly.id) / count(peer.id)
    expect(ratio).toBeGreaterThan(DEFAULT_CONFIG.weekBoost * 0.75)
    expect(ratio).toBeLessThan(DEFAULT_CONFIG.weekBoost * 1.3)
    for (const rare of availableRares(state)) expect(count(rare.id)).toBeGreaterThan(0)
  })

  it('without a calendar the marbles come as they always did', () => {
    const state = createSim({ ...DEFAULT_CONFIG, luckyShower: 6_000 }, 5)
    giveLucky(state, 'shower', [])
    const count = (id: string) => state.recycle.filter((kind) => kind.rare === id).length
    const [a, b] = RARES.filter((rare) => rare.tier === 1)
    expect(count(a.id) / count(b.id)).toBeGreaterThan(0.8)
    expect(count(a.id) / count(b.id)).toBeLessThan(1.25)
  })
})

describe('time away, as the welcome-back card reports it', () => {
  const away = (state: SimState, hours: number) => payAway(state, hours * 3600)!

  it('the spotter arm catches a share of the rare marbles that came by', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    state.upgrades.spotter = 1
    const paid = away(state, 8)
    // Half speed for eight hours, one item in 200 a rare marble, and the arm gets one in ten of those.
    const passed = (8 * 3600 * DEFAULT_CONFIG.awayRate) / DEFAULT_CONFIG.feedInterval / 200
    expect(paid.marbles).toBe(Math.floor(passed * DEFAULT_CONFIG.awayMarbleShare))
    expect(paid.marbles).toBeGreaterThan(10)
    expect(Object.values(state.collection).reduce((sum, n) => sum + n, 0)).toBe(paid.marbles)
  })

  it('without the arm no marble is caught', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    expect(away(state, 8).marbles).toBe(0)
    expect(state.collection).toEqual({})
  })

  it('names the kinds found for the first time, and pays for every marble', () => {
    const state = createSim({ ...DEFAULT_CONFIG, stampBonus: 0 }, 1)
    state.upgrades.spotter = 1
    state.collection.catseye = 1
    const withArm = away(state, 8)
    expect(withArm.found.length).toBeGreaterThan(0)
    expect(withArm.found).not.toContain('catseye')
    expect(new Set(withArm.found).size).toBe(withArm.found.length)
    for (const id of withArm.found) expect(state.collection[id]).toBeGreaterThan(0)

    const plain = createSim({ ...DEFAULT_CONFIG, stampBonus: 0 }, 1)
    const without = away(plain, 8)
    expect(withArm.jars).toBe(without.jars)
    // Every marble pays at least the plain price of the commonest kind.
    expect(withArm.coins).toBeGreaterThanOrEqual(without.coins + withArm.marbles * 25)
    expect(state.coins).toBe(withArm.coins)
    expect(state.earned).toBe(withArm.coins)
  })

  it('counts the orders that are ready to claim, the order of the day among them', () => {
    const state = createSim(QUIET, 1)
    startDay(state, MONDAY)
    state.orders = [
      { kind: 'jars', need: 10, have: 0, worth: 5 },
      { kind: 'hand', need: 10, have: 0, worth: 5 },
      { kind: 'jars', need: 1e9, have: 0, worth: 5 },
    ]
    state.daily!.need = 50
    const paid = away(state, 8)
    expect(state.daily!.have).toBe(50)
    expect(paid.orders).toBe(2)
  })

  it('says how much of the time the line was running', () => {
    const state = createSim(QUIET, 1)
    expect(away(state, 2).counted).toBe(2 * 3600)
    expect(away(state, 20).counted).toBe(QUIET.awayCapSeconds)
  })

  it('opening the page again at once gains nothing', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    state.upgrades.spotter = 1
    startDay(state, MONDAY)
    const saved = parseSave(JSON.parse(JSON.stringify(toSave(state, NOW))))
    const again = resume(DEFAULT_CONFIG, 2, saved, NOW + 5_000)
    expect(again.away).toBeNull()
    expect(again.state.collection).toEqual({})
    expect(startDay(again.state, MONDAY)).toBe(false)
    expect(again.state.days).toBe(1)
  })
})

describe('saving the calendar', () => {
  it('keeps the day, the days played, the order of the day and the look', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    startDay(state, MONDAY)
    startDay(state, MONDAY + 1)
    startDay(state, MONDAY + 2)
    state.daily!.have = 12
    setLook(state, LOOKS[1].id)
    state.dailyDone = 4
    const back = resume(DEFAULT_CONFIG, 9, parseSave(JSON.parse(JSON.stringify(toSave(state, NOW)))), NOW + 5_000).state
    expect([back.day, back.days, back.dailyDone, back.look]).toEqual([MONDAY + 2, 3, 4, LOOKS[1].id])
    expect(back.daily).toEqual(state.daily)
    expect(back.dailyDay).toBe(state.dailyDay)
  })

  it('remembers that the order of the day was claimed, so a reload does not deal another', () => {
    const state = createSim(DEFAULT_CONFIG, 1)
    startDay(state, MONDAY)
    state.daily!.have = state.daily!.need
    claimDaily(state)
    const back = resume(DEFAULT_CONFIG, 9, parseSave(JSON.parse(JSON.stringify(toSave(state, NOW)))), NOW + 5_000).state
    expect(startDay(back, MONDAY)).toBe(false)
    expect(back.daily).toBeNull()
  })

  it('a save from before the calendar loads, and its first day is counted', () => {
    const old = JSON.parse(JSON.stringify(toSave(createSim(DEFAULT_CONFIG, 1), NOW)))
    for (const key of ['day', 'days', 'daily', 'dailyDay', 'dailyDone', 'look']) delete old[key]
    const back = resume(DEFAULT_CONFIG, 9, parseSave(old), NOW + 5_000).state
    expect([back.day, back.days, back.daily, back.dailyDone, back.look]).toEqual([0, 0, null, 0, LOOKS[0].id])
    expect(startDay(back, MONDAY)).toBe(true)
    expect(back.days).toBe(1)
    expect(back.daily).not.toBeNull()
  })

  it('repairs what makes no sense', () => {
    const base = toSave(createSim(DEFAULT_CONFIG, 1), NOW)
    // A look that the days played have not opened.
    expect(resume(DEFAULT_CONFIG, 9, parseSave({ ...base, look: LOOKS[4].id, days: 2 }), NOW).state.look).toBe(LOOKS[0].id)
    expect(resume(DEFAULT_CONFIG, 9, parseSave({ ...base, look: 'plaid', days: 99 }), NOW).state.look).toBe(LOOKS[0].id)
    expect(resume(DEFAULT_CONFIG, 9, parseSave({ ...base, look: LOOKS[4].id, days: 30 }), NOW).state.look).toBe(LOOKS[4].id)
    // An order of the day that is not an order, or that this line cannot do.
    expect(parseSave({ ...base, daily: { kind: 'juggle', need: 5, have: 0, worth: 1 } })!.daily).toBeNull()
    expect(parseSave({ ...base, daily: 'soon' })!.daily).toBeNull()
    const beads = parseSave({ ...base, daily: { kind: 'beads', need: 5, have: 0, worth: 1 } })
    expect(resume(DEFAULT_CONFIG, 9, beads, NOW).state.daily).toBeNull()
    expect(parseSave({ ...base, days: -4, day: 'today', dailyDone: 1.5 })).toMatchObject({ days: 0, day: 0, dailyDone: 1 })
  })
})
