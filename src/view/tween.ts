export const ease = {
  linear: (k: number) => k,
  out: (k: number) => 1 - (1 - k) ** 3,
  in: (k: number) => k * k * k,
  inOut: (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2),
  outBack: (k: number) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
  outBounce: (k: number) => {
    const n = 7.5625
    const d = 2.75
    if (k < 1 / d) return n * k * k
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375
    return n * (k -= 2.625 / d) * k + 0.984375
  },
}

interface Tween {
  elapsed: number
  duration: number
  update: (k: number) => void
  done?: () => void
}

/** A tiny tween runner driven by the game clock, so motion pauses and replays with the simulation. */
export class Tweens {
  private active: Tween[] = []

  /** Runs `update` with k from 0 to 1 over `duration` seconds, after an optional delay. */
  add(duration: number, update: (k: number) => void, options: { delay?: number; done?: () => void } = {}): void {
    this.active.push({ elapsed: -(options.delay ?? 0), duration, update, done: options.done })
  }

  update(dt: number): void {
    const running = this.active
    this.active = []
    for (const tween of running) {
      tween.elapsed += dt
      if (tween.elapsed < 0) {
        this.active.push(tween)
        continue
      }
      const k = Math.min(1, tween.elapsed / tween.duration)
      tween.update(k)
      if (k < 1) this.active.push(tween)
      else tween.done?.()
    }
  }
}
