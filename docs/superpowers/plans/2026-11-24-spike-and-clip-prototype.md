# Technical Spike and Clip Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the bottom-of-screen window works in Electron (throwaway spike), then build a browser-playable sorting line good enough to film 15-second clips.

**Architecture:** The game rules are a pure, deterministic TypeScript module (`src/sim`) that takes time and commands and returns events. A three.js view (`src/view`) turns state and events into instanced 3D items, motion and synthesized sound. The spike lives in `spike/` with its own `package.json` and shares no code with the game.

**Tech Stack:** TypeScript 7.0.2, Vite 8.3.8, three.js 0.187.0 (WebGL renderer), Vitest 5.1.1; spike only: Electron 45.4.1, @electron/packager, steamworks.js 0.4.0.

**Spec:** `../SORTING_LINE_DEVELOPMENT_PLAN.md` (one folder above this repository), sections 3, 5, 6, 7 (M0, M1) and 8.

## Global Constraints

- `src/sim/` and `src/content/` import nothing from three.js, the DOM or Electron.
- No physics engine; motion is scripted. No UI library.
- Theme is neutral: marbles and buttons. No hospital or clinic items.
- No downloaded or generated art or audio files; shapes are built in code, sounds are synthesized with Web Audio (howler is deferred until there are sound files).
- No fail states, timers or penalties. Nothing is ever lost from the line.
- Pin exact dependency versions (no `^`).
- The spike is throwaway: no tests, never imported by `src/`.

## Review Focus

1. A browser tab left in the background returns a frame gap of minutes: the line must not jump or spawn hundreds of items (Task 3, `clamps a huge dt`).
2. A full jar is being swapped when matching items arrive: they must pass, recycle and return, never vanish (Task 4, `items pass a swapping jar`).
3. The player clicks an item that was sorted a moment ago, or one whose jar is swapping: nothing happens, no error (Task 5, `flick ignores unknown ids and swapping jars`).
4. The belt is saturated: feeding pauses and resumes, the item count never exceeds the cap (Task 5, `never exceeds maxOnBelt`).
5. Sound before any user gesture: the page must run silently without errors until the first click (Task 8, manual check).

---

### Task 1: Technical spike (throwaway)

**Files:**
- Create: `spike/package.json`, `spike/main.js`, `spike/preload.js`, `spike/index.html`, `spike/renderer.js`, `spike/measure.ps1`, `spike/RESULTS.md`

**Interfaces:** none; nothing consumes the spike.

- [ ] **Step 1:** `spike/main.js` opens one frameless `BrowserWindow` with `transparent: true`, `alwaysOnTop: true` (level `screen-saver`), `skipTaskbar: true`, 220 px tall, full work-area width, docked to the bottom of the primary display. It calls `setIgnoreMouseEvents(true, { forward: true })` and toggles it from an IPC message `hit` (boolean) sent by the renderer on `mouseenter`/`mouseleave` of interactive elements. With `--steam-test` it initialises steamworks.js with app 480, unlocks `ACH_WIN_ONE_GAME`, reads it back, clears it again, and prints the result.
- [ ] **Step 2:** `spike/renderer.js` draws 200 moving instanced items with three.js on a transparent canvas, capped at 30 frames a second, plus one clickable DOM "jar" that counts clicks and reports the count and hit state to the main process (written to `spike/state.json`).
- [ ] **Step 3:** Package with `@electron/packager` to `spike/out/` and run the packaged `.exe`.
- [ ] **Step 4:** `spike/measure.ps1` records: window is topmost and docked (criterion 1); `WindowFromPoint` over an empty part of the strip returns a window of another process, and over the jar returns the spike's window (criterion 2); 30 seconds of summed `% Processor Time` and `GPU Engine` 3D utilisation for the spike's processes (criterion 3, pass under 3% CPU and 5% GPU); Steam result (criterion 4).
- [ ] **Step 5:** Write the four results, pass or fail, with the raw numbers into `spike/RESULTS.md`. Commit.

### Task 2: Scaffold, content and random numbers

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/content/content.ts`, `src/sim/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `type ColourId = 'red' | 'yellow' | 'blue'`; `type FamilyId = 'marble' | 'button'`; `COLOUR_HEX: Record<ColourId, number>`; `DEFAULT_CONFIG: SimConfig`; `nextRandom(state: { rng: number }): number` (mulberry32, returns `[0, 1)` and advances `state.rng`).
- `DEFAULT_CONFIG`: `beltLength 16`, `beltSpeed 2`, `feedInterval 0.25`, `maxOnBelt 40`, `jarCapacity 12`, `jarSwapSeconds 1.25`, `startShelved 7`, stations at `x = 6, 9, 12` for red, yellow, blue, families `['marble', 'button']`.

- [ ] **Step 1: failing test** `same seed gives the same sequence; different seeds differ; values are in [0, 1)`.
- [ ] **Step 2:** run `npx vitest run tests/rng.test.ts`, expect FAIL (module missing).
- [ ] **Step 3:** implement `nextRandom`; add scripts `dev`, `build`, `test`, `typecheck`.
- [ ] **Step 4:** run again, expect PASS. Commit.

### Task 3: Rules: feeding and movement

**Files:**
- Create: `src/sim/types.ts`, `src/sim/sim.ts`
- Test: `tests/sim.test.ts`

**Interfaces:**
- Produces:
  - `interface BeltItem { id: number; family: FamilyId; colour: ColourId; x: number }`
  - `interface Station { x: number; colour: ColourId; count: number; swapLeft: number }` (`swapLeft > 0` means no jar is present)
  - `interface SimState { config: SimConfig; rng: number; acc: number; nextId: number; feedTimer: number; items: BeltItem[]; recycle: { family: FamilyId; colour: ColourId }[]; stations: Station[]; shelved: number; created: number; sorted: number }`
  - `type SimEvent = { type: 'spawned'; item: BeltItem } | { type: 'sorted'; item: BeltItem; station: number; slot: number; byHand: boolean } | { type: 'jarFull'; station: number; shelfIndex: number } | { type: 'jarReady'; station: number } | { type: 'recycled'; item: BeltItem }`
  - `const STEP = 1 / 64`, `const MAX_DT = 0.25`
  - `createSim(config: SimConfig, seed: number): SimState`
  - `tick(state: SimState, dt: number): SimEvent[]` runs whole fixed steps of `STEP`, carrying the remainder in `state.acc`.

- [ ] **Step 1: failing tests**

```ts
it('feeds one item per feedInterval', () => {
  const s = createSim({ ...DEFAULT_CONFIG, startShelved: 0 }, 1)
  const ev = run(s, 1)                     // run() calls tick in 0.25 s slices
  expect(ev.filter(e => e.type === 'spawned')).toHaveLength(4)
})
it('moves items at beltSpeed', () => {
  const s = createSim(DEFAULT_CONFIG, 1)
  run(s, 0.25)                             // first item spawns at t = 0.25 at x = 0
  run(s, 1)
  expect(s.items[0].x).toBeCloseTo(2, 5)
})
it('clamps a huge dt', () => {
  const s = createSim(DEFAULT_CONFIG, 1)
  tick(s, 600)
  expect(s.items.length).toBeLessThanOrEqual(1)
})
it('ignores NaN and negative dt', () => {
  const s = createSim(DEFAULT_CONFIG, 1)
  expect(tick(s, NaN)).toEqual([]); expect(tick(s, -1)).toEqual([])
  expect(s.items).toHaveLength(0)
})
```

- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. A spawn takes from `state.recycle` first, otherwise a random family and colour from the config. **Step 4:** run, expect PASS. Commit.

### Task 4: Rules: sorting, jars and swapping

**Files:** Modify `src/sim/sim.ts`; Test `tests/sim.test.ts`

**Interfaces:**
- An item is sorted in the step where it crosses `station.x` (previous `x` below, new `x` at or above), its colour equals the station's and `swapLeft === 0`. `slot` is the jar's count before the item is added. When `count` reaches `jarCapacity`: emit `jarFull` with `shelfIndex = state.shelved`, then `shelved += 1`, `count = 0`, `swapLeft = jarSwapSeconds`. When `swapLeft` returns to 0 emit `jarReady`.

- [ ] **Step 1: failing tests** `a matching item is sorted at its station` (item leaves `items`, `count` is 1, event carries `slot: 0`, `byHand: false`); `a full jar is shelved and replaced` (after 12 sorted: one `jarFull`, `shelved` up by 1, `swapLeft` 1.25, then `jarReady` 1.25 s later); `items pass a swapping jar` (a matching item crossing during the swap is not sorted and later emits `recycled`).
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS. Commit.

### Task 5: Rules: recycling, hand flick and invariants

**Files:** Modify `src/sim/sim.ts`; Test `tests/sim.test.ts`

**Interfaces:**
- Produces: `flick(state: SimState, itemId: number): SimEvent[]` sorts the item into the station of its colour with `byHand: true` if the item is on the belt and that jar is present; otherwise returns `[]` and changes nothing.
- An item with `x >= beltLength` is removed, pushed onto `state.recycle` and emits `recycled`.

- [ ] **Step 1: failing tests** `recycled items are fed again before new ones`; `flick sorts a matching item by hand`; `flick ignores unknown ids and swapping jars`; `never exceeds maxOnBelt` (120 s run, check after every tick); `is deterministic for any slicing of time` (same seed, 30 s in 0.25 s slices against 1/32 s slices, `toEqual`); `conserves items` (after 120 s, `created === items.length + recycle.length + sorted`).
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run the whole suite, expect PASS. Commit.

### Task 6: Layout helpers

**Files:** Create `src/view/layout.ts`; Test `tests/layout.test.ts`

**Interfaces:**
- Produces: `JAR = { radius: 0.55, height: 1.9, topY: -0.35, z: 1.3 }`, `ITEM_RADIUS = 0.2`, `SHELF = { columns: 10, rows: 3 }`
  - `jarSlot(slot: number): { x: number; y: number; z: number }` local to the jar's base centre
  - `shelfSlot(index: number): { x: number; y: number; z: number; scale: number }` in world space; indices wrap at 30
  - `fitDistance(boxWidth: number, boxHeight: number, fovDeg: number, aspect: number): number`

- [ ] **Step 1: failing tests** `all 12 jar slots are inside the jar` (radial distance + `ITEM_RADIUS` at most `JAR.radius`, `y` between `ITEM_RADIUS` and `JAR.height - ITEM_RADIUS`); `no two jar slots overlap` (centre distance at least `1.8 * ITEM_RADIUS`); `shelf slots wrap at 30 and never repeat within 30`; `fitDistance fits both width and height` (a wide aspect is limited by height, a tall aspect by width).
- [ ] **Step 2:** run, expect FAIL. **Step 3:** implement. **Step 4:** run, expect PASS. Commit.

### Task 7: Scene, models and item pool

**Files:** Create `src/view/scene.ts`, `src/view/models.ts`, `src/view/itemPool.ts`, `src/style.css`

**Interfaces:**
- Produces: `createStage(canvas: HTMLCanvasElement): { scene, camera, renderer, resize(): void }`; `buildModels(): Models` (marble and button geometry and materials, jar, lid, flipper, belt, frame, shelf); `class ItemPool { constructor(scene, models, capacity); alloc(family, colour): number; free(family, handle): void; set(family, handle, position, quaternion, scale): void; flush(): void; pick(raycaster): { family, handle } | null }`

- [ ] **Step 1:** renderer with ACES tone mapping, soft shadows, a `RoomEnvironment` reflection map; one shadow-casting key light. Camera frames the whole line when the viewport is wider than 2:1, and the three stations otherwise.
- [ ] **Step 2:** models: glossy clear-coated marbles; extruded buttons with four holes; lathe-turned glass jars; enamel lids and flippers in the station colour; a belt with a scrolling procedural texture; a wooden frame and back shelf.
- [ ] **Step 3:** verify in the browser: the static line renders, no console errors, at desktop and portrait sizes. Commit.

### Task 8: Line view, sound, input and HUD

**Files:** Create `src/view/tween.ts`, `src/view/lineView.ts`, `src/view/audio.ts`, `src/ui/hud.ts`, `src/main.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `class LineView { constructor(stage, models, pool, audio); sync(state: SimState): void; handle(events: SimEvent[], state: SimState): void; update(state: SimState, dt: number): void; itemAt(clientX, clientY): number | null }`; `createAudio(): { unlock(): void; setMuted(m: boolean): void; clink(family, fill: number): void; snap(): void; tock(): void; bonus(): void }`.

- [ ] **Step 1:** `sync` builds visuals from any state with no animation (used after a warm-up of 8 simulated seconds so the first frame is alive).
- [ ] **Step 2:** events: `spawned` drops from the chute; `sorted` swings the flipper, arcs the item into its jar slot and plays a clink pitched by fill; `jarFull` drops the lid with a "tock" and flies the jar to the shelf; `jarReady` raises a new jar; `recycled` tips the item into the mixed bin.
- [ ] **Step 3:** input: a pointer press on a belt item calls `flick`; a hand sort plays the bonus sound and a pop.
- [ ] **Step 4:** HUD: jars-shelved counter, sound toggle, `H` hides the HUD for recording. Sound stays silent until the first press.
- [ ] **Step 5:** expose `window.__line = { state }` for checks. Commit.

### Task 9: Verification and hand-over

- [ ] **Step 1:** `npm test`, `npm run typecheck`, `npm run build` all pass.
- [ ] **Step 2:** in the browser: no console errors, `__line.state.shelved` rises within 30 seconds, a click on a belt item sorts it, the layout holds at desktop and portrait sizes.
- [ ] **Step 3:** `README.md`: how to run, how to record a clip, what is not built yet. Commit.
