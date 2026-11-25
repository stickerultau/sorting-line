export interface Governor {
  /** Feed the length of every frame, in seconds. Returns the new scale when it should change, otherwise null. */
  frame(dt: number): number | null
  /** The share of the full pixel ratio to draw at, 1 or less. */
  scale(): number
  /** Back to full size, for a new window size or detail setting. */
  reset(): void
}

/** The sizes it steps through. Each step draws about a quarter fewer pixels than the one before. */
const LEVELS = [1, 0.85, 0.72, 0.61, 0.52]
/** Frames are judged a window at a time, by their average length. */
const WINDOW = 2
/** A window averaging longer than this is too slow: under about 52 frames a second. */
const SLOW = 1 / 52
/** A frame this long is a stall, such as a tab coming back from the background. It says nothing about the machine. */
const STALL = 0.2
/** Seconds ignored after a change of size, while buffers are rebuilt. */
const SETTLE = 1.5
/** A smaller size has to shorten frames by at least this share, or something other than pixels is the limit. */
const GAIN = 0.07
/** Seconds of smooth running before the larger size is tried again. Doubles each time the retry fails. */
const CALM = 45
const CALM_MAX = 600

/**
 * Keeps the game smooth on slower machines by drawing fewer pixels. It lowers the size while frames are slow,
 * gives the pixels back if that did not help, and now and then tries the larger size again.
 */
export function createGovernor(): Governor {
  let level = 0
  let windowTime = 0
  let windowFrames = 0
  let settle = SETTLE
  /** The average frame that made it step down, to see whether the step helped. 0 when no step is being judged. */
  let before = 0
  let gaveUp = false
  let calmFor = 0
  let calmNeeded = CALM
  /** True for the first window after the larger size was tried again. */
  let retrying = false

  const change = (to: number) => {
    level = to
    settle = SETTLE
    return LEVELS[level]
  }

  return {
    frame(dt) {
      if (!(dt > 0) || gaveUp) return null
      if (dt >= STALL) {
        windowTime = 0
        windowFrames = 0
        return null
      }
      if (settle > 0) {
        settle -= dt
        return null
      }
      windowTime += dt
      windowFrames++
      if (windowTime < WINDOW) return null
      const average = windowTime / windowFrames
      const elapsed = windowTime
      windowTime = 0
      windowFrames = 0

      if (before > 0) {
        const helped = average < before * (1 - GAIN)
        before = 0
        if (!helped) {
          gaveUp = true
          return change(level - 1)
        }
      }
      if (average > SLOW) {
        if (retrying) calmNeeded = Math.min(calmNeeded * 2, CALM_MAX)
        retrying = false
        calmFor = 0
        if (level === LEVELS.length - 1) return null
        before = average
        return change(level + 1)
      }
      retrying = false
      if (level === 0) return null
      calmFor += elapsed
      if (calmFor < calmNeeded) return null
      calmFor = 0
      retrying = true
      return change(level - 1)
    },
    scale: () => LEVELS[level],
    reset() {
      level = 0
      windowTime = 0
      windowFrames = 0
      settle = SETTLE
      before = 0
      gaveUp = false
      calmFor = 0
      calmNeeded = CALM
      retrying = false
    },
  }
}
