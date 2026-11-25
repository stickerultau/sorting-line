import { describe, expect, it } from 'vitest'
import { createGovernor, type Governor } from '../src/view/governor'

/** Feeds frames of one length for a while. Returns every change of scale the governor asked for. */
function run(governor: Governor, seconds: number, fps: number): number[] {
  const changes: number[] = []
  const dt = 1 / fps
  for (let t = 0; t < seconds; t += dt) {
    const next = governor.frame(dt)
    if (next !== null) changes.push(next)
  }
  return changes
}

/** A machine that manages `fpsAtFull` frames a second at full size and gains speed as pixels are taken away. */
function runMachine(governor: Governor, seconds: number, fpsAtFull: number, cap = 60): number[] {
  const changes: number[] = []
  for (let t = 0; t < seconds; ) {
    const fps = Math.min(cap, fpsAtFull / governor.scale() ** 2)
    const dt = 1 / fps
    const next = governor.frame(dt)
    if (next !== null) changes.push(next)
    t += dt
  }
  return changes
}

describe('the frame-rate governor', () => {
  it('leaves a fast machine at full size', () => {
    const governor = createGovernor()
    expect(run(governor, 120, 60)).toEqual([])
    expect(governor.scale()).toBe(1)
  })

  it('takes pixels away step by step until the game is smooth, and no further', () => {
    const governor = createGovernor()
    const changes = runMachine(governor, 30, 40) // shorter than the calm spell before the first retry
    expect(changes.length).toBeGreaterThan(0)
    expect(changes).toEqual([...changes].sort((a, b) => b - a)) // only ever down
    expect(40 / governor.scale() ** 2).toBeGreaterThanOrEqual(52)
    expect(40 / changes[changes.length - 2] ** 2 || 0).toBeLessThan(52) // the step before was still too slow
  })

  it('never goes below its smallest size, however slow the machine', () => {
    const governor = createGovernor()
    runMachine(governor, 120, 8)
    expect(governor.scale()).toBeGreaterThanOrEqual(0.5)
    expect(governor.scale()).toBeLessThan(0.6)
  })

  it('gives the pixels back when taking them did not help', () => {
    // Something else holds this machine at 30 frames a second: a power saver, a slow display, a busy processor.
    const governor = createGovernor()
    const changes = run(governor, 120, 30)
    expect(changes[0]).toBeLessThan(1)
    expect(changes[changes.length - 1]).toBe(1)
    expect(changes.length).toBe(2)
    expect(governor.scale()).toBe(1)
  })

  it('takes no notice of a stall, such as a tab coming back from the background', () => {
    const governor = createGovernor()
    run(governor, 10, 60)
    for (let i = 0; i < 20; i++) expect(governor.frame(0.25)).toBeNull()
    expect(run(governor, 10, 60)).toEqual([])
    expect(governor.scale()).toBe(1)
  })

  it('tries the larger size again after a calm spell, and waits longer each time that fails', () => {
    const governor = createGovernor()
    const changes: { at: number; scale: number }[] = []
    let now = 0
    while (now < 400) {
      const fps = Math.min(60, 50 / governor.scale() ** 2) // smooth one step down, a little slow at full size
      const dt = 1 / fps
      const next = governor.frame(dt)
      now += dt
      if (next !== null) changes.push({ at: now, scale: next })
    }
    const ups = changes.filter((change) => change.scale === 1).map((change) => change.at)
    expect(ups.length).toBeGreaterThanOrEqual(2)
    expect(ups.length).toBeLessThanOrEqual(4)
    expect(ups[1] - ups[0]).toBeGreaterThan(1.7 * ups[0])
  })

  it('stays at the larger size when the retry holds', () => {
    const governor = createGovernor()
    runMachine(governor, 30, 40)
    expect(governor.scale()).toBeLessThan(1)
    run(governor, 120, 60) // the machine is free again
    expect(governor.scale()).toBe(1)
    expect(run(governor, 120, 60)).toEqual([])
  })

  it('starts again at full size when it is reset', () => {
    const governor = createGovernor()
    runMachine(governor, 30, 40)
    governor.reset()
    expect(governor.scale()).toBe(1)
  })
})
