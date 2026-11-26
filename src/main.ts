import * as THREE from 'three'
import './style.css'
import { DEFAULT_CONFIG, LOOKS, MASTERY_BONUS, MASTERY_NAME, RARES, TIER_NAME, UNLOCKS, UPGRADES } from './content/content'
import { dayOf, weekOf, weeklyRare } from './sim/days'
import { parseSave, payAway, resume, toSave, type Away, type SaveData } from './sim/save'
import { MAX_DT, buy, catchLucky, claimDaily, claimOrder, flick, masteryRank, prestige, setLook, startDay, tick } from './sim/sim'
import { STAMPS } from './sim/stamps'
import { warmUp } from './sim/warmup'
import type { SimEvent } from './sim/types'
import { createHud } from './ui/hud'
import { createAudio } from './view/audio'
import { compact } from './view/format'
import { LineView, type LineFx } from './view/lineView'
import { buildModels, buildSet } from './view/models'
import { createStage, type Quality } from './view/scene'

const WARM_UP_SECONDS = 8
const SAVE_KEY = 'sorting-line-save-v1'
const SAVE_EVERY_MS = 10_000
/** With no frame drawn for this long the line is standing still, in a background tab or a sleeping computer. */
const STALLED_MS = 3_000
/** Away for at least this long, the player comes back to a card instead of a passing notice. */
const REPORT_SECONDS = 600
/** How often the game looks at the calendar, to notice midnight. */
const CALENDAR_EVERY_MS = 30_000
/** A legendary marble caught by hand slows the line for a moment: this long, at this share of full speed. */
const SLOW_SECONDS = 0.55
const SLOW_RATE = 0.3
/** The times of day the button steps through. `null` follows the clock on this device. */
const TIMES: { label: string; hour: number | null }[] = [
  { label: 'Clock', hour: null },
  { label: 'Morning', hour: 8.2 },
  { label: 'Noon', hour: 13 },
  { label: 'Sunset', hour: 18.7 },
  { label: 'Night', hour: 22.5 },
]

const params = new URLSearchParams(location.search)
/** People who ask their device for less motion get no slow motion or flashes. */
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
/**
 * `?fresh` plays without reading or writing a save. So does `?seed`: a line that deals the same items
 * every time is for tests and clips, and must not be a way to collect the same rare marble again and again.
 */
const fresh = params.has('fresh') || params.has('seed')
const seed = Number(params.get('seed')) || (Date.now() & 0x7fffffff)
const fixedHour = params.has('hour') ? Number(params.get('hour')) : Number.NaN

function load(): SaveData | null {
  if (fresh) return null
  try {
    return parseSave(JSON.parse(localStorage.getItem(SAVE_KEY) ?? 'null'))
  } catch {
    return null // storage blocked or the save is not readable: start a new line
  }
}

const canvas = document.getElementById('stage') as HTMLCanvasElement
const { state, away } = resume(DEFAULT_CONFIG, seed, load(), Date.now())
const stage = (() => {
  try {
    return createStage(canvas, params.get('quality') === 'low' ? 'low' : 'high')
  } catch (error) {
    const note = document.createElement('p')
    note.className = 'hint'
    note.textContent = 'This game needs WebGL 2, which this browser or device does not provide.'
    document.getElementById('hud')!.append(note)
    throw error
  }
})()
document.documentElement.dataset.quality = stage.quality()
const models = buildModels()
const audio = createAudio()

let saving = !fresh
/** When the last frame was drawn, by the clock on the wall. */
let lastFrameAt = Date.now()
function save(): void {
  // A line that is standing still has nothing new to save, and a fresh time stamp would hide the time away.
  if (!saving || Date.now() - lastFrameAt > STALLED_MS) return
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave(state, Date.now())))
  } catch {
    // Storage is full or blocked. The game carries on without saving.
  }
}

// Time of day.
const clockHour = () => {
  const now = new Date()
  return now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600
}
let timeAt = 0
let followClock = Number.isNaN(fixedHour)
stage.setHour(followClock ? clockHour() : fixedHour, true)

let soundOn = true
/** Seconds of slow motion still to run. */
let slowLeft = 0
/** A short buzz on phones that can. It follows the sound switch: a player who wants quiet wants this off too. */
const buzz = (ms: number) => {
  // Browsers refuse a buzz before the first real tap, and say so in the console.
  if (soundOn && !calm && 'vibrate' in navigator && navigator.userActivation?.hasBeenActive) navigator.vibrate(ms)
}
const qualityLabel = (quality: Quality) => (quality === 'high' ? 'Detail: high' : 'Detail: low')
const hud = createHud(
  document.getElementById('hud')!,
  {
    toggleSound() {
      soundOn = !soundOn
      audio.unlock()
      audio.setMuted(!soundOn)
      return soundOn ? 'Sound on' : 'Sound off'
    },
    cycleTime() {
      timeAt = (timeAt + 1) % TIMES.length
      const { label, hour } = TIMES[timeAt]
      followClock = hour === null
      stage.setHour(hour ?? clockHour())
      return `Time: ${label}`
    },
    toggleQuality() {
      stage.setQuality(stage.quality() === 'high' ? 'low' : 'high')
      document.documentElement.dataset.quality = stage.quality()
      return qualityLabel(stage.quality())
    },
    toggleView: () => stage.toggleView(),
    buy(id) {
      if (!buy(state, id)) return false
      audio.unlock()
      audio.buy()
      save()
      return true
    },
    claim(slot) {
      const coins = claimOrder(state, slot)
      if (coins === null) return null
      audio.unlock()
      audio.buy()
      save()
      return coins
    },
    claimDaily() {
      const coins = claimDaily(state)
      if (coins === null) return null
      audio.unlock()
      audio.star()
      hud.toast('Order of the day done', `+${compact(coins)} coins. The next one comes tomorrow.`, undefined, 'lucky')
      save()
      return coins
    },
    collect() {
      let coins = 0
      state.orders.forEach((_, slot) => (coins += claimOrder(state, slot) ?? 0))
      coins += claimDaily(state) ?? 0
      audio.unlock()
      if (coins > 0) audio.buy()
      save()
      return coins
    },
    chooseLook(id) {
      if (!setLook(state, id)) return false
      applyLook()
      save()
      return true
    },
    prestige() {
      const config = state.config
      const stars = prestige(state)
      if (stars === 0) return 0
      audio.unlock()
      audio.star()
      const share = Math.round(state.stars * state.config.starBonus * 100)
      hud.toast('New workshop', `+${compact(stars)} ★ · every payment is now +${share}%`)
      announceUnlocks()
      // New colours or kinds of item mean a new line: the old one is taken down and the new one built in its place.
      if (state.config !== config) {
        state.config = { ...state.config, startShelved: state.shelved }
        line.view.dispose()
        line.set.dispose()
        stage.scene.remove(line.root)
        line = buildLine()
        applyLook()
      }
      save()
      return stars
    },
    reset() {
      saving = false
      try {
        if (!fresh) localStorage.removeItem(SAVE_KEY)
      } catch {
        // Nothing was stored, so there is nothing to erase.
      }
      location.reload()
    },
  },
  { sound: 'Sound on', time: followClock ? 'Time: Clock' : 'Time: Fixed', quality: qualityLabel(stage.quality()) },
)

// Coins earned on the line float up from where they were earned.
/** Seconds of play before the numbers show. Jars filled in the warm-up below pay nothing, so they announce nothing. */
let quiet = 1
const onScreen = new THREE.Vector3()
const fx: LineFx = {
  pop(at, text, tone) {
    if (quiet > 0) return
    const rect = canvas.getBoundingClientRect()
    onScreen.copy(at).project(stage.camera)
    hud.pop(rect.left + (onScreen.x * 0.5 + 0.5) * rect.width, rect.top + (-onScreen.y * 0.5 + 0.5) * rect.height, text, tone)
  },
}
/** Builds the line as the state's config lays it out: the set, and the view that moves items along it. */
function buildLine() {
  const root = new THREE.Group()
  stage.scene.add(root)
  const set = buildSet(models, state.config)
  const view = new LineView(root, stage.camera, models, set, state.config, audio, fx)
  view.setOrientation(stage.orientation())
  const { stations } = state.config
  stage.setStations(stations[0].x, stations[stations.length - 1].x)
  return { root, set, view }
}
let line = buildLine()

/** Paints the workshop in the look the player has chosen. */
function applyLook(): void {
  const look = LOOKS.find((candidate) => candidate.id === state.look) ?? LOOKS[0]
  line.set.setLook(look)
  stage.setLampColour(look.lamp)
}
applyLook()

// The calendar. The rules have no clock: this tells them the day, at the start and whenever midnight passes.
/** `?seed` lines are the same every time, so they keep no calendar. `?fresh&day=3` looks three days ahead, for checks. */
const calendar = !params.has('seed')
const dayShift = fresh ? Number(params.get('day')) || 0 : 0
function checkDay(): void {
  if (!calendar) return
  const week = weekOf(state.day)
  const started = state.day > 0
  if (!startDay(state, dayOf(Date.now(), new Date().getTimezoneOffset()) + dayShift)) return
  save()
  // A new player has enough to read already.
  if (state.days === 1 && state.earned === 0) return
  const look = LOOKS.find((candidate) => candidate.days === state.days)
  hud.toast(
    `Day ${compact(state.days)} on your day card`,
    look ? `A new look is open: ${look.name}. Choose it under Records` : state.daily ? 'Your order of the day is on the board' : 'Welcome back',
    undefined,
    'lucky',
  )
  const weekly = weeklyRare(state)
  if (weekly && (!started || weekOf(state.day) !== week)) {
    hud.toast('Marble of the week', `${weekly.name} turns up ${state.config.weekBoost} times as often until Monday`, weekly)
  }
}

// Run the line for a few seconds before the first frame, so the page opens on a working line.
line.view.silent = true
warmUp(state, WARM_UP_SECONDS, 1 / 32, (events) => {
  line.view.handle(events)
  line.view.update(state, 1 / 32)
})
line.view.silent = false

/** What a caught lucky marble gave, for the notice. */
function giftWords(event: Extract<SimEvent, { type: 'luckyCaught' }>): string {
  const { config } = state
  if (event.catcher) return `The catcher saved half of it: +${compact(event.coins)} coins`
  if (event.gift === 'coins') return `A burst of coins: +${compact(event.coins)}`
  if (event.gift === 'frenzy') return `Frenzy! Jars, tips and marbles pay ×${config.frenzyPay} for ${config.frenzySeconds} seconds`
  if (event.gift === 'shower') return `${config.luckyShower} rare marbles are coming down the belt`
  if (event.gift === 'order') return 'One of your orders is finished. Claim it'
  return `A free level of ${UPGRADES.find((upgrade) => upgrade.id === event.upgrade)?.name ?? 'an upgrade'}`
}

function apply(events: SimEvent[]): void {
  line.view.handle(events)
  // Stamps: one notice each, or a single one when many come together, as they do for an old save.
  const stamps = events.flatMap((event) => (event.type === 'stamp' ? [event.id] : []))
  if (stamps.length > 0) {
    audio.order()
    const share = Math.round(state.config.stampBonus * 100)
    if (stamps.length === 1) {
      hud.toast('Stamp earned', `${STAMPS.find((stamp) => stamp.id === stamps[0])?.name} · +${share}% coins for good`, undefined, 'lucky')
    } else {
      hud.toast(`${stamps.length} stamps earned`, `+${stamps.length * share}% coins for good. See them under Records`, undefined, 'lucky')
    }
  }
  for (const event of events) {
    if (event.type === 'orderReady') audio.order()
    else if (event.type === 'rushStarted') {
      audio.rush()
      hud.toast('Rush!', `Jars, tips and marbles pay ×${state.config.rushPay} for ${event.seconds} seconds`)
    } else if (event.type === 'luckyArrived') {
      audio.lucky()
      // Until the first one is caught, say what it is.
      if (state.luckyCaught === 0) hud.toast('A lucky marble!', 'Click it before it drifts away. It always brings a gift.', undefined, 'lucky')
    } else if (event.type === 'luckyCaught') {
      audio.gift()
      if (!event.catcher) buzz(40)
      hud.toast('Lucky marble', giftWords(event), undefined, 'lucky')
      save()
    }
    if (event.type !== 'caught') continue
    const kind = RARES.find((rare) => rare.id === event.rare)!
    if (event.byHand) {
      buzz(25)
      // A legendary marble caught by hand gets its moment.
      if (kind.tier === 3 && !calm) {
        slowLeft = SLOW_SECONDS
        hud.flash()
      }
    }
    const how = event.byHand ? 'Caught by hand' : 'Caught by the spotter arm'
    // A catch that reaches a new rank says so, and what the rank is worth.
    const owned = state.collection[event.rare] ?? 0
    const rank = masteryRank(owned)
    const ranked = rank > masteryRank(owned - 1)
    const title = event.first ? `New marble: ${kind.name}` : ranked ? `${kind.name}: ${MASTERY_NAME[rank]} rank` : kind.name
    const lasting = ranked ? ` · +${Math.round(kind.tier * MASTERY_BONUS * 100)}% coins for good` : ''
    hud.toast(title, `${TIER_NAME[kind.tier]} · ${how} · +${compact(event.coins)} coins${lasting}`, kind)
  }
}

/**
 * Tells the player about every unlock held that they have not been told about: after a new workshop,
 * and on the first visit with a save from before unlocks existed. One notice, however many there are:
 * only three notices fit on screen, and a new workshop and its stamps want the other two.
 */
function announceUnlocks(): void {
  const fresh = UNLOCKS.filter((unlock, index) => index >= state.unlocksSeen && state.stars >= unlock.stars)
  if (fresh.length === 0) return
  state.unlocksSeen += fresh.length
  if (fresh.length === 1) hud.toast(`Unlocked: ${fresh[0].name}`, fresh[0].blurb, undefined, 'lucky')
  else hud.toast(`${fresh.length} unlocks`, `${fresh.map((unlock) => unlock.name).join(', ')}. See them under Upgrades`, undefined, 'lucky')
}
announceUnlocks()

function welcomeBack(paid: Away): void {
  hud.settle()
  // A long time away gets a card that waits for a tap; a short one a notice that passes.
  if (paid.seconds >= REPORT_SECONDS) return hud.report(paid)
  hud.toast('Welcome back', `Away ${Math.floor(paid.seconds / 60)} min · ${compact(paid.jars)} jars · +${compact(paid.coins)} coins`)
}
if (away) welcomeBack(away)
checkDay()

// Two tabs saving in turn would overwrite each other. The tab that sees another one save stops saving.
const warnOtherTab = () => hud.toast('Open in another tab', 'This tab has stopped saving. Progress is kept in the other one.')
window.addEventListener('storage', (event) => {
  if (!saving || (event.key !== null && event.key !== SAVE_KEY)) return
  saving = false
  warnOtherTab()
})

// For checks from the browser console and automated smoke tests.
const debug = { state, stage, handSorts: 0 }
Object.assign(window, { __line: debug })

// `?fps` shows the frame rate and the pixel ratio the scene is drawn at.
if (params.has('fps')) {
  const readout = document.createElement('div')
  readout.className = 'fps'
  document.body.append(readout)
  setInterval(() => {
    const { fps, ratio } = stage.perf()
    readout.textContent = `${Math.round(fps)} fps · ${ratio.toFixed(2)}×`
  }, 500)
}

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  audio.unlock()
  if (line.view.luckyAt(event.clientX, event.clientY, canvas)) {
    apply(catchLucky(state))
    return
  }
  const id = line.view.itemAt(event.clientX, event.clientY, canvas)
  if (id === null) return
  const events = flick(state, id)
  if (events.length > 0) debug.handSorts++
  apply(events)
})

new ResizeObserver(() => {
  stage.resize()
  line.view.setOrientation(stage.orientation())
}).observe(canvas)

setInterval(save, SAVE_EVERY_MS)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save()
  else if (!saving && !fresh) warnOtherTab()
})
window.addEventListener('pagehide', save)

let last = performance.now()
let dayCheckedAt = Date.now()
function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, MAX_DT)
  last = now
  // Frames stop in a background tab. On return, the line is paid for the gap as for any other time away.
  const wall = Date.now()
  const paid = payAway(state, Math.floor((wall - lastFrameAt) / 1000))
  lastFrameAt = wall
  if (paid) {
    line.view.restock(state.shelved)
    welcomeBack(paid)
    save()
  }
  // The calendar is read after any time away is paid, so a new day's order starts from nothing.
  if (wall - dayCheckedAt >= CALENDAR_EVERY_MS) {
    dayCheckedAt = wall
    checkDay()
  }
  quiet -= dt
  if (dt > 0) {
    // The line and everything on it slow down together; the overlay keeps its own time.
    const lineDt = slowLeft > 0 ? dt * SLOW_RATE : dt
    slowLeft = Math.max(0, slowLeft - dt)
    apply(tick(state, lineDt))
    line.view.update(state, lineDt)
    hud.update(state, dt)
  }
  if (followClock) stage.setHour(clockHour())
  // The lamp strip under the shelf comes on for a rush or a frenzy, whatever the hour.
  line.set.setLamp(Math.max(stage.render(dt).lamp, state.rushLeft > 0 || state.frenzyLeft > 0 ? 1 : 0))
}
requestAnimationFrame(frame)

// Installed as an app, the game opens with no network. Only a build makes the worker that keeps its files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
// Browsers that can install the game say so; the button then asks them to.
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault()
  hud.offerInstall(() => void (event as Event & { prompt(): Promise<unknown> }).prompt())
})
