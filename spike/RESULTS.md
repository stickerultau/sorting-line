# Spike results (2026-11-24)

Throwaway code. Packaged with @electron/packager 20.3.0, Electron 45.4.1, three.js 0.187.0.
Machine: Intel Core Ultra 9 285H (16 threads), Intel Arc 140T integrated graphics, Windows 11, one 3000 x 1876 display at 200% scaling.
Measured with `measure.ps1` against the packaged `.exe`: 200 moving instanced items at 30 frames a second in a 1500 x 220 strip.

| # | Criterion | Result | Numbers |
|---|---|---|---|
| 1 | Transparent strip stays on top at the bottom of the screen, as a packaged build | **Pass** | Topmost window style set, docked to the work area (0,670 1500x220 of 1500x890), transparency confirmed in a screenshot |
| 2 | Clicks pass through empty areas and still reach the jar | **Works, reliability not proven** | 7 of 10 trials passed every check. Of the 3 failures, 1 is confirmed as the real mouse being moved during the trial; the other 2 happened before that diagnostic existed |
| 3 | Under 3% CPU and under 5% GPU | **CPU pass, GPU marginal** | CPU 1.2% to 1.3% of the whole machine (19% to 21% of one core). GPU 3D average 4.8% to 5.0%, peak 7%. At half resolution: CPU 0.9%, GPU 4.0%, peak 6% |
| 4 | One Steam achievement unlocks | **Not measured** | Steam is not installed on this PC. steamworks.js 0.4.0 loaded inside the packaged build and reached Steam's own error, "Could not determine Steam client install directory" |

## What the spike taught us

1. **Click-through must be set after the page loads.** `setIgnoreMouseEvents(true, { forward: true })` called before `loadFile` did not take effect; the empty strip blocked clicks until the first hover. Repeating the call on `did-finish-load` fixed it.
2. **The Steam library needs its whole folder outside the archive.** The packager only unpacked the `.node` file, not `steam_api64.dll` beside it. `--asar.unpackDir="node_modules/steamworks.js"` fixed the load.
3. **Memory is 390 to 450 MB** across Electron's processes. That is a lot for a companion that stays open all day.
4. **CPU is about a fifth of one core.** That is 1.3% on this 16-thread machine but would be about 5% on a 4-thread machine, over the 3% target.
5. **GPU load is at the limit on integrated graphics.** Halving the resolution saved about a fifth. The shipped strip should render at standard resolution, drop to a lower frame rate when nothing is being sorted, and stop drawing when the line is empty.
6. **Screen coordinates differ by tool on a scaled display.** Window positions are in scaled units; raw screen capture is in physical pixels.

## Still to do before relying on this

- Re-run `measure.ps1` with nobody touching the mouse, 10 times, and expect 10 passes for criterion 2.
- Install Steam, sign in, and run the spike with `--steam-test` for criterion 4.
- Measure criterion 3 on a weaker PC.

## Run it

```
npm install
npm run pack
powershell -ExecutionPolicy Bypass -File measure.ps1
```

`measure.ps1` moves the mouse pointer for about two seconds and clicks once on the spike's own jar.
