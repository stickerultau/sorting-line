type Rgb = [number, number, number]

export interface Daylight {
  /** Unit vector from the line toward the sun or the moon. */
  sun: Rgb
  sunColour: Rgb
  sunPower: number
  sky: Rgb
  skyPower: number
  /** Strength of the reflections of the room. */
  env: number
  /** 0 with the lamp off, 1 with it fully on. */
  lamp: number
  exposure: number
}

interface Key {
  hour: number
  /** Degrees round from straight in front of the line; positive is the right-hand side. */
  azimuth: number
  /** Degrees above the horizon. */
  elevation: number
  sunColour: Rgb
  sunPower: number
  sky: Rgb
  skyPower: number
  env: number
  lamp: number
  exposure: number
}

const NIGHT = {
  azimuth: -32, elevation: 48,
  sunColour: [0.5, 0.64, 1] as Rgb, sunPower: 0.42,
  sky: [0.34, 0.44, 0.8] as Rgb, skyPower: 0.1,
  env: 0.1, lamp: 1, exposure: 1.05,
}

// The light through the day. Hours between two rows are blended.
const KEYS: Key[] = [
  { hour: 0, ...NIGHT },
  { hour: 5.5, ...NIGHT },
  { hour: 7, azimuth: 58, elevation: 15, sunColour: [1, 0.6, 0.36], sunPower: 2.3, sky: [0.95, 0.74, 0.7], skyPower: 0.2, env: 0.34, lamp: 0.25, exposure: 1 },
  { hour: 9, azimuth: 40, elevation: 34, sunColour: [1, 0.92, 0.8], sunPower: 2.6, sky: [0.86, 0.93, 1], skyPower: 0.3, env: 0.6, lamp: 0, exposure: 1 },
  { hour: 13, azimuth: 4, elevation: 58, sunColour: [1, 0.97, 0.92], sunPower: 2.4, sky: [0.88, 0.94, 1], skyPower: 0.34, env: 0.7, lamp: 0, exposure: 1 },
  { hour: 17, azimuth: -38, elevation: 32, sunColour: [1, 0.87, 0.68], sunPower: 2.6, sky: [0.95, 0.9, 0.86], skyPower: 0.3, env: 0.58, lamp: 0, exposure: 1 },
  { hour: 19, azimuth: -60, elevation: 13, sunColour: [1, 0.53, 0.26], sunPower: 2.3, sky: [0.95, 0.68, 0.6], skyPower: 0.2, env: 0.32, lamp: 0.35, exposure: 1 },
  { hour: 20.25, azimuth: -46, elevation: 30, sunColour: [0.56, 0.6, 0.95], sunPower: 0.4, sky: [0.45, 0.5, 0.85], skyPower: 0.13, env: 0.14, lamp: 1, exposure: 1.05 },
  { hour: 21.5, ...NIGHT },
  { hour: 24, ...NIGHT },
]

const mix = (a: number, b: number, k: number) => a + (b - a) * k
const mix3 = (a: Rgb, b: Rgb, k: number): Rgb => [mix(a[0], b[0], k), mix(a[1], b[1], k), mix(a[2], b[2], k)]

/** The light at an hour of the day. Any number works; it wraps round at 24. */
export function daylight(hour: number): Daylight {
  const h = ((hour % 24) + 24) % 24
  let i = KEYS.length - 2
  while (i > 0 && KEYS[i].hour > h) i--
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const k = (h - a.hour) / (b.hour - a.hour)
  const azimuth = (mix(a.azimuth, b.azimuth, k) * Math.PI) / 180
  const elevation = (mix(a.elevation, b.elevation, k) * Math.PI) / 180
  return {
    sun: [Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.cos(azimuth) * Math.cos(elevation)],
    sunColour: mix3(a.sunColour, b.sunColour, k),
    sunPower: mix(a.sunPower, b.sunPower, k),
    sky: mix3(a.sky, b.sky, k),
    skyPower: mix(a.skyPower, b.skyPower, k),
    env: mix(a.env, b.env, k),
    lamp: mix(a.lamp, b.lamp, k),
    exposure: mix(a.exposure, b.exposure, k),
  }
}
