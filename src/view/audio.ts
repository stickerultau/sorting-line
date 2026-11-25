import type { FamilyId } from '../content/content'

export interface LineAudio {
  /** Call from a user gesture. Browsers keep audio silent until then. */
  unlock(): void
  setMuted(muted: boolean): void
  /** An item landing in a jar. `fill` runs 0 to 1 and raises the pitch as the jar fills. */
  clink(family: FamilyId, fill: number): void
  snap(): void
  tock(): void
  /** An item sorted by hand. The pitch climbs with the length of the chain it is part of. */
  bonus(chain?: number): void
  /** A full jar leaves its station. Each station has its own note. */
  jar(station: number): void
  /** A rare marble caught. Higher tiers ring longer. */
  rare(tier: number): void
  buy(): void
  /** An order is finished and waits to be claimed. */
  order(): void
  /** A rush begins. */
  rush(): void
  /** A new workshop opens. */
  star(): void
  /** A lucky marble arrives. */
  lucky(): void
  /** A lucky marble is caught and gives its gift. */
  gift(): void
}

/** Synthesized placeholder sounds. Final foley comes later, per the development plan. */
export function createAudio(): LineAudio {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false

  const tone = (freq: number, seconds: number, gain: number, type: OscillatorType, slideTo?: number, delay = 0) => {
    if (!ctx || !master || muted) return
    const t0 = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + seconds)
    env.gain.setValueAtTime(gain, t0)
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds)
    osc.connect(env).connect(master)
    osc.start(t0)
    osc.stop(t0 + seconds + 0.02)
  }

  const noise = (seconds: number, gain: number, filterHz: number) => {
    if (!ctx || !master || muted) return
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    const src = ctx.createBufferSource()
    const filter = ctx.createBiquadFilter()
    const env = ctx.createGain()
    src.buffer = buffer
    filter.type = 'bandpass'
    filter.frequency.value = filterHz
    env.gain.value = gain
    src.connect(filter).connect(env).connect(master)
    src.start()
  }

  return {
    unlock() {
      if (!ctx) {
        ctx = new AudioContext()
        master = ctx.createGain()
        master.gain.value = 0.5
        master.connect(ctx.destination)
      }
      if (ctx.state === 'suspended') void ctx.resume()
    },
    setMuted(value) {
      muted = value
    },
    clink(family, fill) {
      const jitter = 1 + (Math.random() - 0.5) * 0.06
      if (family === 'marble') {
        const f = (1500 + fill * 700) * jitter
        tone(f, 0.16, 0.22, 'sine')
        tone(f * 2.76, 0.07, 0.08, 'sine')
      } else {
        const f = (620 + fill * 300) * jitter
        tone(f, 0.06, 0.2, 'triangle')
        noise(0.03, 0.12, 3200)
      }
    },
    snap() {
      noise(0.04, 0.16, 1700)
    },
    tock() {
      tone(240, 0.16, 0.6, 'sine', 130)
      tone(480, 0.07, 0.18, 'triangle')
      noise(0.02, 0.2, 900)
    },
    bonus(chain = 1) {
      // One octave up over the first 25 sorts of a chain.
      const up = 2 ** (Math.min(Math.max(chain, 1) - 1, 24) / 24)
      tone(1320 * up, 0.1, 0.16, 'sine')
      tone(1760 * up, 0.16, 0.16, 'sine', undefined, 0.07)
    },
    jar(station) {
      const notes = [523.3, 659.3, 784, 987.8, 1174.7]
      const note = notes[station % notes.length]
      tone(note, 0.5, 0.07, 'sine', undefined, 0.03)
      tone(note * 2, 0.3, 0.03, 'triangle', undefined, 0.05)
    },
    rare(tier) {
      const notes = [880, 1108.7, 1318.5, 1760, 2217.5, 2637]
      for (let i = 0; i < 3 + tier; i++) {
        tone(notes[i], 0.5, 0.16, 'sine', undefined, i * 0.075)
        tone(notes[i] * 2, 0.25, 0.05, 'triangle', undefined, i * 0.075)
      }
    },
    buy() {
      tone(520, 0.09, 0.2, 'triangle')
      tone(780, 0.14, 0.2, 'triangle', undefined, 0.08)
      noise(0.03, 0.1, 2400)
    },
    order() {
      tone(660, 0.18, 0.14, 'sine')
      tone(990, 0.3, 0.14, 'sine', undefined, 0.1)
    },
    rush() {
      const notes = [392, 523.3, 659.3, 784, 1046.5]
      notes.forEach((note, i) => tone(note, 0.22, 0.18, 'triangle', undefined, i * 0.06))
      noise(0.25, 0.08, 5200)
    },
    lucky() {
      const notes = [1568, 2093, 2637, 3136]
      notes.forEach((note, i) => tone(note, 0.35, 0.09, 'sine', undefined, i * 0.09))
    },
    gift() {
      const notes = [784, 987.8, 1174.7, 1568, 1975.5]
      notes.forEach((note, i) => tone(note, 0.45, 0.15, 'triangle', undefined, i * 0.05))
      noise(0.3, 0.07, 6000)
    },
    star() {
      const notes = [523.3, 659.3, 784, 1046.5, 1318.5, 1568]
      notes.forEach((note, i) => {
        tone(note, 0.7, 0.16, 'sine', undefined, i * 0.09)
        tone(note * 2, 0.35, 0.05, 'triangle', undefined, i * 0.09)
      })
    },
  }
}
