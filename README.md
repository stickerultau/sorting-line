# Sorting Line (clip prototype)

A small sorting line: mixed marbles and buttons ride a belt, flippers knock each one into the jar of its colour, full jars get a lid and move to the shelf. This is the one-week clip prototype from the development plan (`../SORTING_LINE_DEVELOPMENT_PLAN.md`). Its job is to be filmed and to be put in front of strangers.

## Run it

```
npm install
npm run dev
```

Then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm run dev` | Runs the game with live reload |
| `npm test` | Runs the rule and layout tests |
| `npm run typecheck` | Checks types |
| `npm run build` | Builds a static copy into `dist/` that can be hosted anywhere |

## Controls

- **Click an item on the belt:** sorts it by hand into its jar.
- **Change view:** switches between the whole line and a close-up of the three stations.
- **Sound on / off:** sound starts after your first click, because browsers block it until then.
- **H:** hides the overlay for recording.
- Add `?seed=123` to the address for a different run. The same seed always plays the same way.

## Record a clip

1. Run the game and make the browser window the shape you want to post.
2. Press **H** to hide the overlay, and click once so the sound is on.
3. Record the window. On Windows, **Win + Alt + R** starts and stops a recording of the active window.

Known limit: the line is wide, so a tall phone-shaped window leaves empty wall and table above and below it. Record in a wide window for now.

## What is here

| Folder | Contents |
|---|---|
| `src/sim/` | The rules. Deterministic, no rendering code, covered by tests |
| `src/content/` | Colours, item families and the line's settings |
| `src/view/` | three.js scene, placeholder models built in code, motion and synthesized sound |
| `src/ui/` | The small overlay |
| `tests/` | Rule and layout tests |
| `spike/` | The throwaway technical spike and its results (`spike/RESULTS.md`). Not part of the game |
| `docs/superpowers/plans/` | The build plan for this milestone |

## What is not built yet

Tokens, upgrades, crates, saves, away-time progress, the collection page, daily deliveries, the bottom-of-screen desktop window, Steam, and artist-made models and recorded sound. See the development plan for the order.
