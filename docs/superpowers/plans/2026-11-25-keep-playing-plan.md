# Sorting Line: the "keep playing" plan

Date: 25 November 2026. Status: **waiting for approval. Nothing is built yet.**

## What you asked for

Make the game as hard to put down as the best idle games, so players stay and come back.

## Where the game stands

The game has four goal layers today: orders (minutes), a rush (active play), marble ranks (hours) and a new workshop with stars (about every hour).

Three things are missing:

1. **Nothing surprising happens.** Every minute looks like the last one. Nothing rewards watching the screen.
2. **The game runs out of new things.** A player has seen everything after about 80 minutes. A new workshop repeats the same line with bigger numbers.
3. **There is no reason to come back tomorrow.** The game pays for time away, but it does not show it well, and no day differs from another.

There is also no measurement. Today nobody can tell how long people play.

## The approach

I looked at three ways to do this.

| Approach | What it means | Verdict |
|---|---|---|
| A. Deepen the game in stages | Add surprise, then new content, then daily reasons to return, then measurement | **Chosen** |
| B. Daily rewards only | Add daily goals and a stamp card on top of today's game | Cheap, but the content still runs out after 80 minutes |
| C. New game modes | Add levels or puzzles | Breaks the idle game that already works |

Each stage below is its own branch. Each one can be published alone, and you approve each merge.

## Stage 1: something is always about to happen

Goal: longer sessions. Size: medium.

1. **Lucky marble.** Every 2 to 4 minutes a glowing marble rolls along the front rail for about 12 seconds. A click gives one random gift:
   - a burst of coins worth about 3 minutes of income
   - a frenzy: all coins ×5 for 30 seconds, which stacks with a rush
   - a shower of 5 rare marbles on the belt
   - one order finished at once
   - rarely, one free upgrade level

   A missed lucky marble costs nothing. Another one comes.
2. **Sorting chain.** Items sorted by hand in quick succession build a chain. The tip grows up to ×5, and the sound rises in pitch. The chain ends quietly when the player stops. A long chain fills the rush meter faster.
3. **No long dry spells.** The chance of a rare marble creeps up while none has appeared. A new player gets the first rare marble within 3 minutes.
4. **A tuned first five minutes.** Targets for a new player: first upgrade within 30 seconds, first lucky marble at about 90 seconds, first order claimed within 2 minutes, first rush within 4 minutes.
5. **Next-goal line.** One line under the coins always names the nearest goal and how far away it is. Examples: "Faster belt in 40 s", "Silver Opal: 3 more", "Next star in 12 min".
6. **Feel.** A full jar gets a burst and a chord. Coins fly to the wallet. A legendary catch gets a short slow-motion moment and a flash. Phones vibrate on a catch where the browser allows it. All of this is switched off for players who ask their device for reduced motion.

Built on 25 November 2026, with these differences from the list above:

- A frenzy multiplies jars, tips and marbles. Orders and the coin gift pay their plain price.
- The next-goal line sits under the orders, not under the coins.
- Reduced motion switches off flying coins, flashes, slow motion and buzzes. The sparks stay.
- Measured with a simulated player over four hours: the wait between two good events was under 15 seconds 95% of the time and 42 seconds at worst. The wait for something to buy or claim was at most 67 seconds for an active player and 230 seconds for an idle one. The longest waits come late in a workshop, when a new one is due.

## Stage 2: the workshop keeps changing

Goal: new things for two weeks, not 80 minutes. Size: large.

1. **Unlocks at star totals.** Stars keep their coin bonus. In addition, reaching a star total unlocks something lasting. The next unlock is always shown as a silhouette. The first ladder:

   | Stars | Unlock | What changes |
   |---|---|---|
   | 1 | Green | A fourth colour and a fourth jar station |
   | 2 | Catcher | Collects lucky marbles the player misses, for half the gift |
   | 3 | Beads | A third kind of item, with its own orders |
   | 5 | Big jars | Jars hold twice as much and pay more than twice |
   | 8 | Second belt | An upper belt that doubles the flow |
   | 12 | Magnet | Rare marbles drift toward the pointer |
   | 16 | Purple | A fifth colour and station |
   | 22 | Night shift | Time away pays 75% instead of 50%, for 12 hours instead of 8 |

   The star totals are placeholders. I set the final numbers with the simulated player, so a player who plays 30 minutes a day gets a new unlock about every other day.
2. **Stamps.** About 50 achievements in a stamp book. Some count progress (1,000 jars), some reward skill (a chain of 50), and a few are hidden. Each stamp adds 1% to all coins.
3. **Marble sets.** The collection grows from 12 to 24 rare marbles, and the new ones arrive with the unlocks. Marbles are grouped in sets of three or four. A full set gives a bonus and a decoration on the shelf.
4. **Lifetime numbers.** A page with totals: jars, marbles, longest chain, workshops.

The second belt is the largest single item. It changes the 3D scene, the rules and the frame-rate budget. If it proves too costly, I replace it with a smaller unlock and tell you.

Built on 25 and 26 November 2026, with these differences from the list above:

- **Golden jars replace big jars.** Every tenth jar is golden and pays five times. A jar twice the size did not fit the shelf.
- **A twin chute replaces the second belt.** Items drop twice as fast onto the same belt. A second belt would have doubled the scene and the rules.
- **The magnet slows rare marbles to half speed.** Drifting toward the pointer does nothing on a phone.
- **Sets give a bonus but no shelf decoration.** A full set adds 10% to every payment and shows in the collection.
- **The star totals are 3, 40, 200, 700, 1,800, 4,000, 7,000 and 12,000.** Stars add up much faster than the first table assumed. With these totals the simulated half-hour-a-day player earned an unlock on days 1, 2, 3, 5, 7, 9, 11 and 13.
- **The catcher always pays coins.** A missed lucky marble gives half of a coin gift, whatever it would have given.
- **Only the next unlock is named.** The ones after it show as question marks.
- **The lifetime numbers share a Records panel with the 52 stamps.**

## Stage 3: a reason to come back tomorrow

Goal: players return the next day. Size: medium.

1. **Welcome-back report.** A card on return shows time away, jars filled, coins earned, marbles the spotter caught and orders finished. One tap collects it all.
2. **Order of the day.** One large order each calendar day, about 20 to 30 minutes of play. It pays well and gives a day stamp.
3. **Day card.** The card counts days played in total. It never resets, and a missed day costs nothing. At 3, 7, 14 and 30 days it unlocks a new look: belt colours, lid styles, lamp colours.
4. **Marble of the week.** One rare marble turns up three times as often for a week. Every marble gets its turn, and none is ever exclusive.
5. **Install as an app.** The game gets a home-screen icon, runs full screen and works offline. The icon is a picture drawn by the game's own code.

Not included: notifications. They need a server and a permission prompt.

## Stage 4: find out if it works

Goal: replace guessing with numbers. Size: small.

1. **Play log on the device.** The game counts sessions, their length and days played. The numbers stay in the browser and show on the lifetime page.
2. **Share picture.** A button makes a picture of the shelf and the collection to share or save.
3. **Five testers.** You send the link to five people and watch their first ten minutes. This is the best evidence available without a server.

Two things stay as later decisions, because they need an outside account and EU consent rules apply: counting real players anonymously, and a leaderboard.

## How each stage is checked

- Tests are written first for every rule.
- A simulated idle player and a simulated active player run for 14 game days. The targets are below.
- I check the game in the browser on desktop and phone sizes.
- A fresh reviewer reads the whole change once.
- Old saves must still load, and the frame budget from the speed pass must hold.

| Target | Active player | Idle player |
|---|---|---|
| Longest gap between two good events | 20 seconds | 90 seconds |
| Longest wait for something affordable or claimable | 1 minute | 3 minutes |
| New unlock (30 minutes of play a day) | every 2 days for 2 weeks | every 3 days |

## What stays out, and why

- Bought currency, paid random rewards and adverts.
- Streaks that punish a missed day.
- Countdown offers and messages that pressure the player.
- Fail states.

These were your rules from the start. They also conflict with EU rules on manipulative design, and they earn bad reviews. The plan aims for a game people want to return to, not one that makes leaving feel like a loss.

## Two calls that are mine, for you to strike if you disagree

1. **The lucky marble has a 12-second window.** That bends the "no timers" rule slightly. I recommend it, because it is the one proven mechanic that rewards watching the screen, and a miss costs nothing.
2. **The order of the day and the day card tie the game to the calendar.** I recommend them, because nothing is lost by skipping a day.

## What this plan cannot promise

No plan can guarantee a hit. The famous idle games got there through months of tuning with real players. This plan adds the ingredients they share. Stage 4 and your five testers then show what to tune.
