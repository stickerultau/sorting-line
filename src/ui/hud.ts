import { RARES, TIER_NAME, UPGRADES, type RareKind, type UpgradeId } from '../content/content'
import { upgradeCost } from '../sim/sim'
import type { SimState } from '../sim/types'
import { paintMarble } from '../view/marbleArt'

export type PopTone = 'coin' | 'tip' | 'rare'

export interface Hud {
  /** Call every frame. Only touches the page when something it shows has changed. */
  update(state: SimState, dt: number): void
  /** A number that floats up from a point on the screen and fades. */
  pop(x: number, y: number, text: string, tone: PopTone): void
  /** A short notice at the top. `kind` adds a picture of that marble. */
  toast(title: string, body: string, kind?: RareKind): void
}

export interface HudActions {
  /** Each of these flips or steps a setting and returns the label to show for it. */
  toggleSound(): string
  cycleTime(): string
  toggleQuality(): string
  toggleView(): void
  /** Tries to buy the next level. Returns whether it did. */
  buy(id: UpgradeId): boolean
  /** Erases all progress and starts again. */
  reset(): void
}

export interface HudLabels {
  sound: string
  time: string
  quality: string
}

const MAX_POPS = 26
const number = (value: number) => Math.round(value).toLocaleString('en-US')

/** The overlay: coins, the upgrade shop, the marble collection and a few controls. Press H to hide it for recording. */
export function createHud(root: HTMLElement, actions: HudActions, labels: HudLabels): Hud {
  root.innerHTML = `
    <header class="bar">
      <div class="wallet" aria-live="off">
        <span class="coin" aria-hidden="true"></span>
        <span class="wallet-coins" id="hud-coins">0</span>
        <span class="wallet-jars"><b id="hud-jars">0</b> jars shelved</span>
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
    <aside class="panel" id="hud-upgrades" hidden>
      <h2>Upgrades</h2>
      <div class="upgrade-list" id="hud-upgrade-list"></div>
      <button type="button" class="link" id="hud-reset">Start over</button>
    </aside>
    <aside class="panel" id="hud-marbles" hidden>
      <h2>Marble collection</h2>
      <p class="panel-note">Rare marbles glow on the belt. Click one to catch it for double coins.</p>
      <div class="marble-grid" id="hud-marble-grid"></div>
    </aside>
    <div class="toasts" id="hud-toasts" role="status"></div>
    <div class="pops" id="hud-pops" aria-hidden="true"></div>
    <p class="hint" id="hud-hint">Click a glowing marble to catch it. Click anything else on the belt to sort it by hand. Press H to hide this.</p>`

  const find = <T extends HTMLElement>(id: string) => root.querySelector<T>(`#${id}`)!
  const coins = find('hud-coins')
  const jars = find('hud-jars')
  const found = find('hud-found')
  const canBuy = find('hud-can-buy')
  const toasts = find('hud-toasts')
  const pops = find('hud-pops')
  const hint = find('hud-hint')

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

  // Start over asks twice.
  const reset = find<HTMLButtonElement>('hud-reset')
  let armed = false
  reset.addEventListener('click', () => {
    if (armed) return actions.reset()
    armed = true
    reset.textContent = 'Click again to erase all progress'
    setTimeout(() => {
      armed = false
      reset.textContent = 'Start over'
    }, 4000)
  })

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') show(null)
    else if (event.key.toLowerCase() === 'h' && !event.ctrlKey && !event.metaKey && !event.altKey) root.hidden = !root.hidden
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

  // Collection cells, one per marble.
  const grid = find('hud-marble-grid')
  const cells = RARES.map((kind) => {
    const cell = document.createElement('div')
    cell.className = `marble tier-${kind.tier}`
    cell.innerHTML = `
      <span class="marble-ball" style="background-image:url(${paintMarble(kind, 128).toDataURL()})"></span>
      <span class="marble-name">${kind.name}</span>
      <span class="marble-tier">${TIER_NAME[kind.tier]}</span>
      <span class="marble-count"></span>`
    grid.append(cell)
    return { kind, cell, count: cell.querySelector<HTMLElement>('.marble-count')!, shown: -1 }
  })

  let coinsShown = -1
  let coinsText = ''
  let jarsShown = -1
  let foundShown = -1

  return {
    update(state, dt) {
      // The coin counter runs up to the real figure instead of jumping.
      if (coinsShown < 0) coinsShown = state.coins
      const gap = state.coins - coinsShown
      coinsShown = Math.abs(gap) < 0.5 ? state.coins : coinsShown + gap * Math.min(1, dt * 9)
      const text = number(coinsShown)
      if (text !== coinsText) coins.textContent = coinsText = text

      if (state.shelved !== jarsShown) jars.textContent = number((jarsShown = state.shelved))

      let affordable = false
      for (const entry of cards) {
        const cost = upgradeCost(state, entry.upgrade.id)
        const level = state.upgrades[entry.upgrade.id]
        const can = cost !== null && state.coins >= cost
        affordable ||= can
        const signature = `${level}|${can}`
        if (signature === entry.shown) continue
        entry.shown = signature
        entry.level.textContent = entry.upgrade.maxLevel === 1 ? (level ? 'Fitted' : 'Not fitted') : `Level ${level} of ${entry.upgrade.maxLevel}`
        entry.cost.innerHTML = cost === null ? 'Complete' : `<span class="coin" aria-hidden="true"></span>${number(cost)}`
        entry.card.disabled = !can
        entry.card.classList.toggle('complete', cost === null)
      }
      canBuy.hidden = !affordable

      let kinds = 0
      for (const entry of cells) {
        const owned = state.collection[entry.kind.id] ?? 0
        if (owned > 0) kinds++
        if (owned === entry.shown) continue
        entry.shown = owned
        entry.cell.classList.toggle('found', owned > 0)
        entry.count.textContent = owned > 0 ? `×${number(owned)}` : 'Not found yet'
      }
      if (kinds !== foundShown) found.textContent = `${(foundShown = kinds)}/${RARES.length}`
    },

    pop(x, y, text, tone) {
      if (root.hidden || (tone === 'tip' && pops.childElementCount >= MAX_POPS)) return
      const pop = document.createElement('span')
      pop.className = `pop pop-${tone}`
      pop.textContent = text
      pop.style.left = `${x}px`
      pop.style.top = `${y}px`
      pop.addEventListener('animationend', () => pop.remove())
      pops.append(pop)
    },

    toast(title, body, kind) {
      const toast = document.createElement('div')
      toast.className = kind ? `toast tier-${kind.tier}` : 'toast'
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
  }
}
