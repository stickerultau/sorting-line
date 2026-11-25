import { COLOUR_HEX, MASTERY_AT, MASTERY_NAME, RARES, TIER_NAME, UPGRADES, type RareKind, type UpgradeId } from '../content/content'
import { nextGoal, type Goal } from '../sim/goal'
import { chainTip, collectionBonus, masteryRank, nextStarAt, orderReward, rushSeconds, starsWaiting, steadyIncome, upgradeCost } from '../sim/sim'
import type { Order, SimState } from '../sim/types'
import { compact } from '../view/format'
import { paintMarble } from '../view/marbleArt'

/** 'coin' and 'rare' send coins flying to the wallet as well; 'gift' is a word, not an amount. */
export type PopTone = 'coin' | 'tip' | 'rare' | 'gift'

export interface Hud {
  /** Call every frame. Only touches the page when something it shows has changed. */
  update(state: SimState, dt: number): void
  /** A number that floats up from a point on the screen and fades. */
  pop(x: number, y: number, text: string, tone: PopTone): void
  /** A short notice at the top. `kind` adds a picture of that marble; 'lucky' gives it a gold edge. */
  toast(title: string, body: string, kind?: RareKind, tone?: 'lucky'): void
  /** A short flash of light over the whole screen, for the rarest moments. */
  flash(): void
  /** Forgets recent earnings, so a lump sum such as pay for time away does not show as coins a minute. */
  settle(): void
}

export interface HudActions {
  /** Each of these flips or steps a setting and returns the label to show for it. */
  toggleSound(): string
  cycleTime(): string
  toggleQuality(): string
  toggleView(): void
  /** Tries to buy the next level. Returns whether it did. */
  buy(id: UpgradeId): boolean
  /** Claims a finished order. Returns the coins paid, or null if it was not finished. */
  claim(slot: number): number | null
  /** Opens a new workshop. Returns the stars gained, 0 if none was waiting. */
  prestige(): number
  /** Erases all progress and starts again. */
  reset(): void
}

export interface HudLabels {
  sound: string
  time: string
  quality: string
}

const MAX_POPS = 26
/** Seconds of earnings the coins-a-minute figure looks back over. */
const RATE_WINDOW = 30
/** Upgrades with more levels than this show the level alone, not "of" a top that nobody reaches. */
const SHOW_TOP_LEVEL_TO = 20
/** A second click sooner than this after the first is the same double-click, not a confirmation. */
const CONFIRM_AFTER_MS = 500
/** A chain shows on screen from this length. */
const SHOW_CHAIN_FROM = 3
/** Coins in flight to the wallet at once. */
const MAX_FLYING = 14
const percent = (share: number) => `+${Math.round(share * 100)}%`
const capital = (word: string) => word[0].toUpperCase() + word.slice(1)

/** What an order asks for, in full and in a word for narrow screens. */
function orderWords(order: Order): { full: string; short: string } {
  if (order.kind === 'jars') return { full: `Shelve ${compact(order.need)} jars`, short: 'Jars' }
  if (order.kind === 'colour') return { full: `Shelve ${compact(order.need)} ${order.colour} jars`, short: capital(order.colour ?? '') }
  if (order.kind === 'hand') return { full: `Sort ${compact(order.need)} items by hand`, short: 'By hand' }
  return { full: order.need === 1 ? 'Catch a rare marble' : `Catch ${order.need} rare marbles`, short: 'Catch' }
}

/** A wait in words. It is an estimate, so it is rounded the way a person would say it. */
function about(seconds: number): string {
  if (seconds < 20) return `${Math.max(1, Math.ceil(seconds))} s`
  if (seconds < 90) return `${Math.ceil(seconds / 5) * 5} s`
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`
  return `${(seconds / 3600).toFixed(1)} h`
}

function goalWords(goal: Goal): string {
  if (goal.kind === 'upgrade') return `${UPGRADES.find((upgrade) => upgrade.id === goal.id)!.name} in ${about(goal.seconds)}`
  if (goal.kind === 'order') return `An order finished in ${about(goal.seconds)}`
  if (goal.kind === 'star') return `A star in ${about(goal.seconds)}`
  return `${MASTERY_NAME[goal.rank]} ${RARES.find((rare) => rare.id === goal.rare)!.name}: ${goal.more} more`
}

/** The overlay: coins, orders, the rush meter, the upgrade shop, the marble collection and a few controls. Press H to hide it for recording. */
export function createHud(root: HTMLElement, actions: HudActions, labels: HudLabels): Hud {
  root.innerHTML = `
    <div class="rush-glow" aria-hidden="true"></div>
    <div class="flash" id="hud-flash" aria-hidden="true"></div>
    <header class="bar">
      <div class="wallet" aria-live="off">
        <span class="coin" aria-hidden="true"></span>
        <span class="wallet-coins" id="hud-coins">0</span>
        <span class="wallet-rate" id="hud-rate" hidden></span>
        <span class="wallet-stars" id="hud-stars" hidden></span>
        <span class="wallet-jars"><b id="hud-jars">0</b> jars shelved</span>
      </div>
      <div class="rush" id="hud-rush" title="Sorting by hand fills this. When it is full, everything pays more for a while.">
        <span class="rush-label" id="hud-rush-label">Rush</span>
        <span class="rush-track"><span class="rush-fill" id="hud-rush-fill"></span></span>
      </div>
      <nav class="tools">
        <button type="button" class="tool tool-main" id="hud-open-upgrades" aria-expanded="false">Upgrades<span class="dot" id="hud-can-buy" hidden></span></button>
        <button type="button" class="tool tool-main" id="hud-open-marbles" aria-expanded="false">Marbles <span class="tool-note" id="hud-found">0/${RARES.length}</span></button>
        <button type="button" class="tool" id="hud-time">${labels.time}</button>
        <button type="button" class="tool" id="hud-view">Change view</button>
        <button type="button" class="tool" id="hud-quality">${labels.quality}</button>
        <button type="button" class="tool" id="hud-sound">${labels.sound}</button>
      </nav>
    </header>
    <section class="orders" aria-label="Orders">
      <h2>Orders <span id="hud-orders-done"></span></h2>
      <div class="order-list" id="hud-order-list"></div>
      <div class="goal-row">
        <p class="goal" id="hud-goal" hidden><b>Next</b><span></span></p>
        <p class="frenzy-chip" id="hud-frenzy" hidden></p>
      </div>
    </section>
    <aside class="panel" id="hud-upgrades" hidden>
      <h2>Upgrades</h2>
      <div class="upgrade-list" id="hud-upgrade-list"></div>
      <div class="workshop">
        <h2>New workshop</h2>
        <p class="panel-note" id="hud-star-have"></p>
        <span class="star-track"><span class="star-fill" id="hud-star-fill"></span></span>
        <p class="panel-note" id="hud-star-next"></p>
        <button type="button" class="prestige" id="hud-prestige" disabled></button>
        <p class="panel-note fine">Coins and upgrades start again. Stars, marbles and shelved jars stay.</p>
      </div>
      <button type="button" class="link" id="hud-reset">Start over</button>
    </aside>
    <aside class="panel" id="hud-marbles" hidden>
      <h2>Marble collection</h2>
      <p class="panel-note">Rare marbles glow on the belt. Click one to catch it for double coins. Catching more of a marble raises its rank, and every rank adds coins for good.</p>
      <p class="panel-note bonus" id="hud-bonus"></p>
      <div class="marble-grid" id="hud-marble-grid"></div>
    </aside>
    <div class="toasts" id="hud-toasts" role="status"></div>
    <div class="pops" id="hud-pops" aria-hidden="true"></div>
    <div class="pops" id="hud-flights" aria-hidden="true"></div>
    <div class="chain" id="hud-chain" aria-hidden="true" hidden><b></b><span></span></div>
    <p class="hint" id="hud-hint">Click a glowing marble to catch it. Click anything else on the belt to sort it by hand and fill the rush meter. Press H to hide this.</p>`

  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!
  const coins = find('hud-coins')
  const rate = find('hud-rate')
  const stars = find('hud-stars')
  const jars = find('hud-jars')
  const found = find('hud-found')
  const canBuy = find('hud-can-buy')
  const toasts = find('hud-toasts')
  const pops = find('hud-pops')
  const hint = find('hud-hint')
  const rush = find('hud-rush')
  const rushLabel = find('hud-rush-label')
  const rushFill = find('hud-rush-fill')
  const ordersDone = find('hud-orders-done')
  const orderList = find('hud-order-list')
  const starHave = find('hud-star-have')
  const starFill = find('hud-star-fill')
  const starNext = find('hud-star-next')
  const prestige = find<HTMLButtonElement>('hud-prestige')
  const bonus = find('hud-bonus')
  const frenzy = find('hud-frenzy')
  const flash = find('hud-flash')
  const flights = find('hud-flights')
  const goalLine = find('hud-goal')
  const goalText = goalLine.querySelector('span')!
  const chain = find('hud-chain')
  const chainCount = chain.querySelector('b')!
  const chainNote = chain.querySelector('span')!
  const walletCoin = root.querySelector<HTMLElement>('.wallet > .coin')!
  /** People who ask their device for less motion get the numbers without the flights, flashes and bumps. */
  const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  /** Coins that fly from a point on the screen to the wallet. */
  const fly = (x: number, y: number, count: number) => {
    if (calm) return
    const wallet = walletCoin.getBoundingClientRect()
    const dx = wallet.left + wallet.width / 2 - x
    const dy = wallet.top + wallet.height / 2 - y
    for (let n = 0; n < count && flights.childElementCount < MAX_FLYING; n++) {
      const coin = document.createElement('span')
      coin.className = 'coin fly'
      coin.style.left = `${x}px`
      coin.style.top = `${y}px`
      flights.append(coin)
      const aside = (Math.random() - 0.5) * 90
      const flight = coin.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: `translate(calc(-50% + ${aside}px), calc(-50% - 50px)) scale(1)`, opacity: 1, offset: 0.25 },
          { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.6)`, opacity: 0.9 },
        ],
        { duration: 650 + n * 60, delay: n * 55, easing: 'cubic-bezier(0.5, 0, 0.3, 1)', fill: 'both' },
      )
      flight.onfinish = flight.oncancel = () => {
        coin.remove()
        walletCoin.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 180 })
      }
    }
  }

  const pop = (x: number, y: number, text: string, tone: PopTone) => {
    if (root.hidden || (tone === 'tip' && pops.childElementCount >= MAX_POPS)) return
    if (tone === 'coin') fly(x, y, 1)
    else if (tone === 'rare') fly(x, y, 5)
    const el = document.createElement('span')
    el.className = `pop pop-${tone}`
    el.textContent = text
    el.style.left = `${x}px`
    el.style.top = `${y}px`
    el.addEventListener('animationend', () => el.remove())
    pops.append(el)
  }

  // Panels: one open at a time.
  const panels = [
    { button: find<HTMLButtonElement>('hud-open-upgrades'), panel: find('hud-upgrades') },
    { button: find<HTMLButtonElement>('hud-open-marbles'), panel: find('hud-marbles') },
  ]
  const show = (which: number | null) => {
    panels.forEach(({ button, panel }, index) => {
      const open = index === which && panel.hidden
      panel.hidden = !open
      button.setAttribute('aria-expanded', String(open))
    })
    hint.hidden = true
  }
  panels.forEach(({ button }, index) => button.addEventListener('click', () => show(index)))

  const relabel = (id: string, action: () => string) => {
    const button = find<HTMLButtonElement>(id)
    button.addEventListener('click', () => (button.textContent = action()))
  }
  relabel('hud-sound', actions.toggleSound)
  relabel('hud-time', actions.cycleTime)
  relabel('hud-quality', actions.toggleQuality)
  find('hud-view').addEventListener('click', () => actions.toggleView())

  /**
   * A button that does something hard to undo asks twice: the first click only changes its label for a few seconds.
   * The second click must come a moment later, so a double-click counts as one.
   */
  const askTwice = (button: HTMLButtonElement, warning: string, act: () => void, relabelAfter: () => void) => {
    let armedAt = 0
    let timer = 0
    button.addEventListener('click', () => {
      const now = performance.now()
      if (armedAt > 0) {
        if (now - armedAt < CONFIRM_AFTER_MS) return
        armedAt = 0
        clearTimeout(timer)
        return act()
      }
      armedAt = now
      button.textContent = warning
      timer = window.setTimeout(() => {
        armedAt = 0
        relabelAfter()
      }, 4000)
    })
    return () => armedAt > 0
  }
  const reset = find<HTMLButtonElement>('hud-reset')
  askTwice(reset, 'Click again to erase all progress', actions.reset, () => (reset.textContent = 'Start over'))
  let prestigeShown = ''
  const prestigeArmed = askTwice(prestige, 'Click again: coins and upgrades start again', () => {
    actions.prestige()
    prestigeShown = ''
  }, () => (prestigeShown = ''))

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show(null)
    else if (event.key.toLowerCase() === 'h' && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey) root.hidden = !root.hidden
  })

  // Upgrade cards, built once and then kept up to date.
  const upgradeList = find('hud-upgrade-list')
  const cards = UPGRADES.map((upgrade) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'upgrade'
    card.innerHTML = `
      <span class="upgrade-name">${upgrade.name}</span>
      <span class="upgrade-level"></span>
      <span class="upgrade-blurb">${upgrade.blurb}</span>
      <span class="upgrade-cost"></span>`
    card.addEventListener('click', () => {
      if (!actions.buy(upgrade.id)) return
      card.classList.remove('bought')
      void card.offsetWidth // restart the flash
      card.classList.add('bought')
    })
    upgradeList.append(card)
    return { upgrade, card, level: card.querySelector<HTMLElement>('.upgrade-level')!, cost: card.querySelector<HTMLElement>('.upgrade-cost')!, shown: '' }
  })

  // Order cards, one for each place on the board.
  const orderCards: { card: HTMLButtonElement; shown: string; parts: Record<'dot' | 'full' | 'short' | 'reward' | 'fill' | 'count', HTMLElement> }[] = []
  const addOrderCard = (slot: number) => {
    const card = document.createElement('button')
    card.type = 'button'
    card.className = 'order'
    card.disabled = true
    card.innerHTML = `
      <span class="order-name"><i class="order-dot" hidden></i><span class="order-full"></span><span class="order-short"></span></span>
      <span class="order-reward"><span class="coin" aria-hidden="true"></span><b></b></span>
      <span class="order-track"><span class="order-fill"></span></span>
      <span class="order-count"></span>`
    card.addEventListener('click', () => {
      const paid = actions.claim(slot)
      if (paid === null) return
      const box = card.getBoundingClientRect()
      pop(box.left + box.width / 2, box.top + box.height / 2, `+${compact(paid)}`, 'coin')
    })
    orderList.append(card)
    const part = <T extends HTMLElement>(selector: string) => card.querySelector<T>(selector)!
    orderCards.push({
      card,
      shown: '',
      parts: { dot: part('.order-dot'), full: part('.order-full'), short: part('.order-short'), reward: part('.order-reward b'), fill: part('.order-fill'), count: part('.order-count') },
    })
  }

  // Collection cells, one per marble.
  const grid = find('hud-marble-grid')
  const cells = RARES.map((kind) => {
    const cell = document.createElement('div')
    cell.className = `marble tier-${kind.tier}`
    cell.innerHTML = `
      <span class="marble-ball" style="background-image:url(${paintMarble(kind, 128).toDataURL()})"></span>
      <span class="marble-name">${kind.name}</span>
      <span class="marble-tier">${TIER_NAME[kind.tier]}</span>
      <span class="marble-rank" aria-hidden="true">${MASTERY_AT.map(() => '<i></i>').join('')}</span>
      <span class="marble-count"></span>`
    grid.append(cell)
    return { kind, cell, count: cell.querySelector<HTMLElement>('.marble-count')!, pips: [...cell.querySelectorAll<HTMLElement>('.marble-rank i')], shown: -1 }
  })

  let coinsShown = -1
  let coinsText = ''
  let jarsShown = -1
  let foundShown = -1
  let starsShown = -1
  let doneShown = -1
  let bonusShown = ''
  let rushShown = ''
  let rateShown = ''
  let workshopShown = ''
  let dotShown = false
  let frenzyShown = ''
  let goalShown = ''
  let chainShown = 0
  /** The best chain before the one that is running, to tell when it is beaten. */
  let bestBefore = 0
  // Coins ever earned, sampled once a second, oldest first.
  let samples: number[] = []
  let sampleClock = 0

  return {
    update(state, dt) {
      // The coin counter runs up to the real figure instead of jumping.
      if (coinsShown < 0) coinsShown = state.coins
      const gap = state.coins - coinsShown
      coinsShown = Math.abs(gap) < 0.5 ? state.coins : coinsShown + gap * Math.min(1, dt * 9)
      const text = compact(coinsShown)
      if (text !== coinsText) coins.textContent = coinsText = text

      if (state.shelved !== jarsShown) jars.textContent = compact((jarsShown = state.shelved))

      // Coins a minute, over the last half minute.
      sampleClock += dt
      if (sampleClock >= 1 || samples.length === 0) {
        sampleClock = 0
        samples.push(state.earned)
        if (samples.length > RATE_WINDOW + 1) samples.shift()
        const perMinute = samples.length > 5 ? ((state.earned - samples[0]) / (samples.length - 1)) * 60 : 0
        const rateText = perMinute > 0 ? `+${compact(perMinute)}/min` : ''
        if (rateText !== rateShown) {
          rate.textContent = rateShown = rateText
          rate.hidden = rateText === ''
        }

        // The nearest goal, at what the line has really earned lately. One lump sum must not swing the estimate.
        const steady = steadyIncome(state)
        const lately = samples.length > 10 ? perMinute / 60 : steady
        const goal = nextGoal(state, Math.min(Math.max(lately, steady * 0.5), steady * 2))
        const words = goal ? goalWords(goal) : ''
        if (words !== goalShown) {
          goalText.textContent = goalShown = words
          goalLine.hidden = words === ''
        }
      }

      // A frenzy, while one lasts.
      const frenzyText = state.frenzyLeft > 0 ? `Frenzy ×${state.config.frenzyPay} · ${Math.ceil(state.frenzyLeft)}s` : ''
      if (frenzyText !== frenzyShown) {
        frenzy.textContent = frenzyShown = frenzyText
        frenzy.hidden = frenzyText === ''
        root.classList.toggle('frenzy', frenzyText !== '')
      }

      // The chain of hand sorts: a number that jumps with every sort and goes when the chain ends.
      if (state.chain === 0) bestBefore = state.bestChain
      const chainNow = state.chain >= SHOW_CHAIN_FROM ? state.chain : 0
      if (chainNow !== chainShown) {
        chainShown = chainNow
        chain.hidden = chainNow === 0
        if (chainNow > 0) {
          chainCount.textContent = String(chainNow)
          const best = bestBefore >= SHOW_CHAIN_FROM && chainNow > bestBefore ? ' · your best' : ''
          chainNote.textContent = `chain · tips ×${chainTip(state).toFixed(1)}${best}`
          if (!calm) chainCount.animate([{ transform: 'scale(1.35)' }, { transform: 'scale(1)' }], { duration: 160, easing: 'ease-out' })
        }
      }

      if (state.stars !== starsShown) {
        starsShown = state.stars
        stars.hidden = state.stars === 0
        stars.textContent = `★ ${compact(state.stars)}`
        stars.title = `${compact(state.stars)} stars: ${percent(state.stars * state.config.starBonus)} coins`
      }

      // The rush meter fills with hand work, then runs down while the rush lasts.
      const rushing = state.rushLeft > 0
      const filled = rushing ? state.rushLeft / rushSeconds(state) : state.rushCharge / state.config.rushHits
      const rushText = rushing ? `Rush ×${state.config.rushPay} · ${Math.ceil(state.rushLeft)}s` : 'Rush'
      const rushSignature = `${rushText}|${Math.round(filled * (rushing ? 50 : 200))}`
      if (rushSignature !== rushShown) {
        rushShown = rushSignature
        rushLabel.textContent = rushText
        rushFill.style.width = `${Math.min(100, filled * 100).toFixed(1)}%`
        rush.classList.toggle('on', rushing)
        root.classList.toggle('rushing', rushing)
      }

      // Orders.
      while (orderCards.length < state.orders.length) addOrderCard(orderCards.length)
      state.orders.forEach((order, slot) => {
        const entry = orderCards[slot]
        const ready = order.have >= order.need
        const reward = orderReward(state, order)
        const signature = `${order.kind}|${order.colour}|${order.need}|${order.have}|${reward}`
        if (signature === entry.shown) return
        entry.shown = signature
        const words = orderWords(order)
        entry.parts.full.textContent = words.full
        entry.parts.short.textContent = words.short
        entry.parts.dot.hidden = order.kind !== 'colour'
        if (order.colour) entry.parts.dot.style.background = `#${COLOUR_HEX[order.colour].toString(16).padStart(6, '0')}`
        entry.parts.reward.textContent = compact(reward)
        entry.parts.fill.style.width = `${((order.have / order.need) * 100).toFixed(1)}%`
        entry.parts.count.textContent = ready ? 'Claim' : `${compact(order.have)} / ${compact(order.need)}`
        entry.card.disabled = !ready
        entry.card.classList.toggle('ready', ready)
        entry.card.setAttribute('aria-label', `${words.full}. ${ready ? 'Finished. Claim' : `${order.have} of ${order.need}. Pays`} ${compact(reward)} coins`)
      })
      if (state.ordersDone !== doneShown) ordersDone.textContent = (doneShown = state.ordersDone) > 0 ? `${compact(doneShown)} done` : ''

      // Upgrades.
      let affordable = false
      for (const entry of cards) {
        const cost = upgradeCost(state, entry.upgrade.id)
        const level = state.upgrades[entry.upgrade.id]
        const can = cost !== null && state.coins >= cost
        affordable ||= can
        const signature = `${level}|${can}`
        if (signature === entry.shown) continue
        entry.shown = signature
        const top = entry.upgrade.maxLevel
        entry.level.textContent = top === 1 ? (level ? 'Fitted' : 'Not fitted') : top > SHOW_TOP_LEVEL_TO ? `Level ${level}` : `Level ${level} of ${top}`
        entry.cost.innerHTML = cost === null ? 'Complete' : `<span class="coin" aria-hidden="true"></span>${compact(cost)}`
        entry.card.disabled = !can
        entry.card.classList.toggle('complete', cost === null)
      }

      // The new workshop: stars held, and how far this run is toward the next one.
      const waiting = starsWaiting(state)
      const goal = nextStarAt(state)
      const from = waiting ** 2 * state.config.starCoins
      const toward = Math.max(0, Math.min(1, (state.runEarned - from) / (goal - from)))
      const workshopSignature = `${state.stars}|${waiting}|${compact(state.runEarned)}|${Math.round(toward * 100)}`
      if (!panels[0].panel.hidden && workshopSignature !== workshopShown) {
        workshopShown = workshopSignature
        starHave.textContent = state.stars > 0
          ? `★ ${compact(state.stars)} ${state.stars === 1 ? 'star' : 'stars'}: every payment is ${percent(state.stars * state.config.starBonus)}.`
          : `Each star adds ${Math.round(state.config.starBonus * 100)}% to every payment, for good.`
        starFill.style.width = `${(toward * 100).toFixed(1)}%`
        starNext.textContent = `This workshop has earned ${compact(state.runEarned)}. The next star comes at ${compact(goal)}.`
      }
      // The dot on the Upgrades button means only one thing: an upgrade can be bought.
      if (affordable !== dotShown) canBuy.hidden = !(dotShown = affordable)
      const prestigeText = waiting > 0 ? `Open a new workshop: +${compact(waiting)} ★` : 'No star earned yet'
      if (!prestigeArmed() && prestigeText !== prestigeShown) {
        prestige.textContent = prestigeShown = prestigeText
        prestige.disabled = waiting === 0
      }

      // Marbles.
      let kinds = 0
      for (const entry of cells) {
        const owned = state.collection[entry.kind.id] ?? 0
        if (owned > 0) kinds++
        if (owned === entry.shown) continue
        entry.shown = owned
        const rank = masteryRank(owned)
        entry.cell.classList.toggle('found', owned > 0)
        entry.cell.dataset.rank = String(rank)
        entry.pips.forEach((pip, index) => pip.classList.toggle('on', index < rank))
        entry.count.textContent = owned === 0
          ? MASTERY_NAME[0]
          : rank < MASTERY_AT.length
            ? `×${compact(owned)} · ${MASTERY_NAME[rank + 1]} at ${MASTERY_AT[rank]}`
            : `×${compact(owned)} · ${MASTERY_NAME[rank]}`
      }
      if (kinds !== foundShown) found.textContent = `${(foundShown = kinds)}/${RARES.length}`
      const bonusText = `Collection bonus: ${percent(collectionBonus(state))} coins`
      if (bonusText !== bonusShown) bonus.textContent = bonusShown = bonusText
    },

    pop,

    flash() {
      if (calm || root.hidden) return
      flash.animate([{ opacity: 0.55 }, { opacity: 0 }], { duration: 650, easing: 'ease-out' })
    },

    toast(title, body, kind, tone) {
      const toast = document.createElement('div')
      toast.className = kind ? `toast tier-${kind.tier}` : tone ? `toast toast-${tone}` : 'toast'
      const ball = kind ? `<span class="marble-ball" style="background-image:url(${paintMarble(kind, 128).toDataURL()})"></span>` : ''
      toast.innerHTML = `${ball}<span class="toast-text"><b></b><span></span></span>`
      toast.querySelector('b')!.textContent = title
      toast.querySelector('.toast-text span')!.textContent = body
      toast.addEventListener('animationend', (event) => {
        if (event.animationName === 'toast-out') toast.remove()
      })
      toasts.append(toast)
      while (toasts.childElementCount > 3) toasts.firstElementChild!.remove()
    },

    settle() {
      samples = []
    },
  }
}
