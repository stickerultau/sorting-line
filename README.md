# Sorting Line (prototype)

A small sorting line: mixed marbles and buttons ride a belt, flippers knock each one into the jar of its colour, full jars get a lid and move to the shelf. Full jars pay coins, coins buy upgrades for the line, and now and then a rare glass marble rolls past for you to catch and collect. The workshop follows the clock: daylight through a window by day, a lamp at night.

Something is always about to happen:

- **Lucky marble (every two to four minutes):** a glowing gold marble drifts along the line for twelve seconds. Click it for one gift: a burst of coins, a frenzy (jars, tips and marbles pay five times as much for thirty seconds), a shower of five rare marbles, a finished order or, rarely, a free upgrade level. A missed one costs nothing; another comes.
- **Sorting chain (seconds):** items sorted by hand in quick succession build a chain. Each one raises the tip, up to five times, and the sound climbs with it. From ten on, the chain fills the rush meter twice as fast. It ends quietly when you stop.
- **Next-goal line:** one line under the orders always names the nearest thing you are waiting for and about how long it will take.

There is always a next goal, at four time scales:

- **Orders (a few minutes):** three small jobs are always on the board, such as "shelve 20 red jars" or "catch a rare marble". A finished order pays a bonus when you claim it, and a new one takes its place.
- **Rush (under a minute):** sorting by hand fills a meter. When it is full, everything pays three times as much for ten seconds and rare marbles turn up twice as often.
- **Marble ranks (hours):** catching the same marble again raises its rank: found, bronze, silver, gold at 1, 5, 15 and 40 catches. Every rank adds coins for good.
- **New workshop (an hour or so):** once a workshop has earned enough, you can open a new one. Coins and upgrades start again; you keep your marbles and gain stars, and each star adds 15% to every payment for good.

The workshop keeps changing as stars add up:

- **Unlocks (days):** eight lasting changes come at star totals. In order: a green station, a catcher for missed lucky marbles, beads, golden jars, a twin chute, a magnet that slows rare marbles, a purple station and a night shift. The upgrades panel shows the ones you hold and the next one; the rest stay a secret.
- **Marble sets (days to weeks):** the 24 rare marbles come in six sets of four. A full set adds 10% to every payment. Three sets arrive with unlocks.
- **Stamps (minutes to months):** 52 marks for things done, such as 1,000 jars shelved or a chain of 50. Each one adds 1% to every payment. Four are hidden until earned.

Nothing here can be bought, and nothing is lost by waiting. The only thing with a clock on it is the lucky marble, and missing one loses nothing you had.

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
- **Click the gold marble that floats above the belt:** takes its gift.
- **Click any other item on the belt:** sorts it by hand into its jar, for a small tip. It also fills the rush meter and builds the chain.
- **Orders:** click a finished order to claim its coins.
- **Upgrades:** spend coins on a quicker feeder, a faster belt, better lids, a luckier chute, a spotter arm that catches the rare marbles you miss, an order book and a longer rush. **New workshop** is at the foot of this panel.
- **Marbles:** the collection. Twenty-four kinds in six sets and three tiers, each with four ranks.
- **Records:** lifetime numbers and the stamp book.
- **Time:** follows the clock on your device, or steps through morning, noon, sunset and night.
- **Change view:** switches between the whole line and a close-up of the stations.
- **Detail:** `low` drops the depth blur, the lamp's shadows, the blur behind the overlay and the extra pixels of sharp screens. On either setting the game draws fewer pixels by itself when the machine cannot keep up, and tries the full size again later.
- **Sound on / off:** sound starts after your first click, because browsers block it until then.
- **H:** hides the overlay for recording. **Esc** closes a panel.

With reduced motion set on the device, there are no flying coins, flashes, slow motion or buzzes; the sparks stay.

Progress is saved in the browser every ten seconds. Rare marbles still on the belt are kept too. The line keeps earning while you are away, at half speed, for up to eight hours (three quarters and twelve hours with the night shift), and the jars it fills count toward your orders. **Start over**, at the foot of the upgrades panel, erases it.

Add these to the address:

| Address | What it does |
|---|---|
| `?hour=22.5` | Starts at that hour of the day (0 to 24) |
| `?quality=low` | Starts with low detail |
| `?fps` | Shows the frame rate and the pixel ratio the scene is drawn at |
| `?fresh` | Plays without reading or writing a save |
| `?seed=123` | The same seed always deals the same items. Plays without a save, like `?fresh` |

## Record a clip

1. Run the game and make the browser window the shape you want to post.
2. Press **H** to hide the overlay, and click once so the sound is on.
3. Record the window. On Windows, **Win + Alt + R** starts and stops a recording of the active window.

For TikTok, Shorts and Reels, make the window tall and narrow (9:16). The shelf then stacks into six short rows of bigger jars above the stations. A wide window shows three long rows instead.

## What is here

| Folder | Contents |
|---|---|
| `src/sim/` | The rules: sorting, coins, upgrades, rare marbles, orders, rush, the sorting chain, lucky marbles, marble ranks and sets, new workshops, unlocks, stamps, the next goal, saving and time away. Deterministic, no rendering code, covered by tests |
| `src/content/` | Colours, item families, rare marbles and their sets, upgrades, unlocks and the line's settings |
| `src/view/` | three.js scene, light through the day, glow and depth blur, placeholder models and marble patterns built in code, motion and synthesized sound |
| `src/ui/` | The overlay: coins, orders, next goal, rush meter, chain, upgrades, new workshop and unlocks, collection, records and stamps |
| `tests/` | Rule, layout and view tests |
| `spike/` | The throwaway technical spike and its results (`spike/RESULTS.md`). Not part of the game |
| `docs/superpowers/plans/` | The build plan for this milestone |

## Prices

A new player's first minutes are tuned so that something good comes early: orders are short until three have been claimed, the first lucky marble comes after ninety seconds, and a line with room for a rare marble never waits longer than three times the usual wait for one. In a simulated two hours, a player who caught every lucky marble earned about 40% more than one who caught none.

The star totals for the unlocks were set against a simulated player who plays half an hour a day, sorts one item every two seconds, catches every lucky marble and opens a new workshop when it adds half again to the stars. That player earned the eight unlocks on days 1, 2, 3, 5, 7, 9, 11 and 13. One who played an hour a day had them all by day 9; one who played fifteen minutes and rarely clicked had four after two weeks.

Prices were set against a simulated player over eight hours, not against real players. In that run a player who only claims orders buys something about every thirty seconds, finishes an order every one to three minutes, and opens the first new workshop after about eighty minutes; one who also clicks once a second gets there in about fifty. Later workshops take thirty-five to sixty minutes each. Real players will play differently, so treat these as a second pass.

## What is not built yet

Prices tested on real players, crates, daily deliveries, more item families, the bottom-of-screen desktop window, Steam, and artist-made models and recorded sound. See the development plan for the order.
