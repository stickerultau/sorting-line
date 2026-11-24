import { describe, expect, it } from 'vitest'
import { daylight } from '../src/view/daylight'

const numbers = (hour: number) => {
  const d = daylight(hour)
  return [...d.sun, ...d.sunColour, d.sunPower, ...d.sky, d.skyPower, d.env, d.lamp, d.exposure]
}

describe('daylight', () => {
  it('turns the lamp on at night and off in the day', () => {
    expect(daylight(0).lamp).toBe(1)
    expect(daylight(23).lamp).toBe(1)
    expect(daylight(13).lamp).toBe(0)
    expect(daylight(10).lamp).toBe(0)
  })

  it('is brightest around noon and dim at night', () => {
    expect(daylight(13).sunPower).toBeGreaterThan(daylight(2).sunPower * 3)
    expect(daylight(13).env).toBeGreaterThan(daylight(2).env)
  })

  it('always shines down from in front of the line', () => {
    for (let hour = 0; hour < 24; hour += 0.25) {
      const [x, y, z] = daylight(hour).sun
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 6)
      expect(y).toBeGreaterThan(0.1)
      expect(z).toBeGreaterThan(0.1)
    }
  })

  it('moves the sun from one side in the morning to the other in the evening', () => {
    expect(daylight(8).sun[0]).toBeGreaterThan(0.2)
    expect(daylight(18).sun[0]).toBeLessThan(-0.2)
  })

  it('changes smoothly, including across midnight', () => {
    for (let hour = 0; hour < 24; hour += 0.05) {
      const a = numbers(hour)
      const b = numbers(hour + 0.05)
      a.forEach((value, i) => expect(Math.abs(value - b[i])).toBeLessThan(0.2))
    }
    expect(numbers(24)).toEqual(numbers(0))
    expect(numbers(-1)).toEqual(numbers(23))
    expect(numbers(30.5)).toEqual(numbers(6.5))
  })
})
