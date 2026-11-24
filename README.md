# Sorting Line (prototype)

A small sorting line: mixed marbles and buttons ride a belt, flippers knock each one into the jar of its colour, full jars get a lid and move to the shelf. Full jars pay coins, coins buy upgrades for the line, and now and then a rare glass marble rolls past for you to catch and collect. The workshop follows the clock: daylight through a window by day, a lamp at night.

It started as the one-week clip prototype from the development plan (`../SORTING_LINE_DEVELOPMENT_PLAN.md`). Its job is still to be filmed and to be put in front of strangers.

**Play it:** https://stickerultau.github.io/sorting-line/

Every push to `main` runs the tests and publishes the game to that address through GitHub Pages.

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

- **Click a glowing marble:** catches it. It joins your collection and pays double.
- **Click any other item on the belt:** sorts it by hand into its jar, for a small tip.
- **Upgrades:** spend coins on a quicker feeder, a faster belt, better lids, a luckier chute and a spotter arm that catches the rare marbles you miss.
- **Marbles:** the collection. Twelve kinds in three tiers.
- **Time:** follows the clock on your device, or steps through morning, noon, sunset and night.
- **Change view:** switches between the whole line and a close-up of the three stations.
- **Detail:** `low` drops the depth blur, the lamp's shadows and the extra pixels of sharp screens. Use it if the game runs slowly.
- **Sound on / off:** sound starts after your first click, because browsers block it until then.
- **H:** hides the overlay for recording. **Esc** closes a panel.

Progress is saved in the browser every ten seconds. The line keeps earning while you are away, at half speed, for up to eight hours. **Start over**, at the foot of the upgrades panel, erases it.

Add these to the address:

| Address | What it does |
|---|---|
| `?hour=22.5` | Starts at that hour of the day (0 to 24) |
| `?quality=low` | Starts with low detail |
| `?fresh` | Plays without reading or writing a save |
| `?seed=123` | The same seed always deals the same items |

## Record a clip

1. Run the game and make the browser window the shape you want to post.
2. Press **H** to hide the overlay, and click once so the sound is on.
3. Record the window. On Windows, **Win + Alt + R** starts and stops a recording of the active window.

For TikTok, Shorts and Reels, make the window tall and narrow (9:16). The shelf then stacks into six short rows of bigger jars above the three stations. A wide window shows three long rows instead.

## What is here

| Folder | Contents |
|---|---|
| `src/sim/` | The rules: sorting, coins, upgrades, rare marbles, saving and time away. Deterministic, no rendering code, covered by tests |
| `src/content/` | Colours, item families, rare marbles, upgrades and the line's settings |
| `src/view/` | three.js scene, light through the day, glow and depth blur, placeholder models and marble patterns built in code, motion and synthesized sound |
| `src/ui/` | The overlay: coins, upgrades, collection |
| `tests/` | Rule, layout and view tests |
| `spike/` | The throwaway technical spike and its results (`spike/RESULTS.md`). Not part of the game |
| `docs/superpowers/plans/` | The build plan for this milestone |

## What is not built yet

Balanced prices (the current ones are a first pass), crates, daily deliveries, more item families, the bottom-of-screen desktop window, Steam, and artist-made models and recorded sound. See the development plan for the order.
