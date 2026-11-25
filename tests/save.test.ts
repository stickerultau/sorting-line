import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, UPGRADES } from '../src/content/content'
import { awayEarnings, parseSave, payAway, resume, toSave } from '../src/sim/save'
import { createSim } from '../src/sim/sim'

const NOW = 1_800_000_000_000
const HOUR = 3600

function played() {
  const state = createSim(DEFAULT_CONFIG, 1)
  state.coins = 432
  state.earned = 900
  state.shelved = 57
  state.sorted = 684
  state.upgrades.belt = 2
  state.upgrades.lids = 1
  state.collection.oxblood = 3
  return state
}

describe('saving', () => {
  it('brings back coins, upgrades, the collection and the jar count', () => {
    const data = parseSave(JSON.parse(JSON.stringify(toSave(played(), NOW))))!
    const { state, away } = resume(DEFAULT_CONFIG, 1, data, NOW + 5_000)
    expect(away).toBeNull()
    expect(state.coins).toBe(432)
    expect(state.earned).toBe(900)
    expect(state.shelved).toBe(57)
    expect(state.config.startShelved).toBe(57)
    expect(state.sorted).toBe(684)
    expect(state.upgrades).toMatchObject({ belt: 2, lids: 1, feeder: 0 })
    expect(state.collection.oxblood).toBe(3)
  })

  it('starts a new line when there is no save', () => {
    const { state, away } = resume(DEFAULT_CONFIG, 1, null, NOW)
    expect(away).toBeNull()
    expect(state.coins).toBe(0)
    expect(state.shelved).toBe(DEFAULT_CONFIG.startShelved)
  })

  it('rejects anything that is not a save', () => {
    for (const raw of [null, 'x', 7, [], {}, { v: 2 }, { v: 1 }]) expect(parseSave(raw)).toBeNull()
  })

  it('repairs broken numbers instead of carrying them into the game', () => {
    const data = parseSave({
      v: 1,
      savedAt: NOW,
      coins: -50,
      earned: 'lots',
      shelved: 1e99,
      sorted: 12.7,
      upgrades: { belt: 999, feeder: -3, lids: Number.NaN, bogus: 4 },
      collection: { oxblood: 2, nothing: 9, galaxy: -1 },
    })!
    expect(data.coins).toBe(0)
    expect(data.earned).toBe(0)
    expect(data.shelved).toBeLessThanOrEqual(1e15)
    expect(data.sorted).toBe(12)
    expect(data.upgrades.belt).toBe(UPGRADES.find((u) => u.id === 'belt')!.maxLevel)
    expect(data.upgrades.feeder).toBe(0)
    expect(data.upgrades.lids).toBe(0)
    expect(data.upgrades).not.toHaveProperty('bogus')
    expect(data.collection).toEqual({ oxblood: 2 })
  })

  it('can still count jars up after a save with an absurd jar count', () => {
    const data = parseSave({ ...toSave(played(), NOW), shelved: 1e99 })!
    const { state } = resume(DEFAULT_CONFIG, 1, data, NOW + HOUR * 1000)
    expect(state.shelved + 1).toBeGreaterThan(state.shelved)
  })
})

describe('time away', () => {
  it('pays for jars filled while away, at the away rate', () => {
    // An hour at half speed, four items a second, twelve to a jar: 600 jars. One level of better lids: 12 coins each.
    expect(awayEarnings(played(), HOUR)).toEqual({ jars: 600, coins: 7200 })
  })

  it('pays into a running line, for a tab that was left in the background', () => {
    const state = played()
    expect(payAway(state, HOUR)).toEqual({ seconds: HOUR, jars: 600, coins: 7200 })
    expect(state.coins).toBe(432 + 7200)
    expect(state.earned).toBe(900 + 7200)
    expect(state.shelved).toBe(57 + 600)
  })

  it('pays nothing into a running line for a short pause', () => {
    const state = played()
    expect(payAway(state, 59)).toBeNull()
    expect(state.coins).toBe(432)
    expect(state.shelved).toBe(57)
  })

  it('adds the earnings and the jars on return', () => {
    const data = parseSave(toSave(played(), NOW))!
    const { state, away } = resume(DEFAULT_CONFIG, 1, data, NOW + HOUR * 1000)
    expect(away!.seconds).toBe(HOUR)
    expect(away!.jars).toBeGreaterThan(0)
    expect(state.coins).toBe(432 + away!.coins)
    expect(state.earned).toBe(900 + away!.coins)
    expect(state.shelved).toBe(57 + away!.jars)
  })

  it('stops counting after the cap', () => {
    const state = played()
    expect(awayEarnings(state, 100 * HOUR)).toEqual(awayEarnings(state, DEFAULT_CONFIG.awayCapSeconds))
  })

  it('pays nothing for under a minute, or when the clock went backwards', () => {
    const data = parseSave(toSave(played(), NOW))!
    expect(resume(DEFAULT_CONFIG, 1, data, NOW + 59_000).away).toBeNull()
    const back = resume(DEFAULT_CONFIG, 1, data, NOW - HOUR * 1000)
    expect(back.away).toBeNull()
    expect(back.state.coins).toBe(432)
  })
})
