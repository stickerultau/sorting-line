import type { FamilyId } from '../content/content'

export interface LineAudio {
  /** Call from a user gesture. Browsers keep audio silent until then. */
  unlock(): void
  setMuted(muted: boolean): void
  /** An item landing in a jar. `fill` runs 0 to 1 and raises the pitch as the jar fills. */
  clink(family: FamilyId, fill: number): void
  snap(): void
  tock(): void
  bonus(): void
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
    bonus() {
      tone(1320, 0.1, 0.16, 'sine')
      tone(1760, 0.16, 0.16, 'sine', undefined, 0.07)
    },
  }
}
