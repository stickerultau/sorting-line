import * as THREE from 'three'
import './style.css'
import { DEFAULT_CONFIG, RARES, TIER_NAME } from './content/content'
import { parseSave, resume, toSave, type SaveData } from './sim/save'
import { MAX_DT, buy, flick, tick } from './sim/sim'
import type { SimEvent } from './sim/types'
import { createHud } from './ui/hud'
import { createAudio } from './view/audio'
import { LineView, type LineFx } from './view/lineView'
import { buildModels, buildSet } from './view/models'
import { createStage, type Quality } from './view/scene'

const WARM_UP_SECONDS = 8
const SAVE_KEY = 'sorting-line-save-v1'
const SAVE_EVERY_MS = 10_000
/** The times of day the button steps through. `null` follows the clock on this device. */
const TIMES: { label: string; hour: number | null }[] = [
  { label: 'Clock', hour: null },
  { label: 'Morning', hour: 8.2 },
  { label: 'Noon', hour: 13 },
  { label: 'Sunset', hour: 18.7 },
  { label: 'Night', hour: 22.5 },
]

const params = new URLSearchParams(location.search)
/** `?fresh` plays without reading or writing a save. */
const fresh = params.has('fresh')
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
const stage = createStage(canvas, params.get('quality') === 'low' ? 'low' : 'high')
const models = buildModels()
const lineSet = buildSet(models, state.config)
const audio = createAudio()

let saving = !fresh
function save(): void {
  if (!saving) return
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
    reset() {
      saving = false
      try {
        localStorage.removeItem(SAVE_KEY)
      } catch {
        // Nothing was stored, so there is nothing to erase.
      }
      location.reload()
    },
  },
  { sound: 'Sound on', time: followClock ? 'Time: Clock' : 'Time: Fixed', quality: qualityLabel(stage.quality()) },
)

// Coins earned on the line float up from where they were earned.
let warmingUp = true
const onScreen = new THREE.Vector3()
const fx: LineFx = {
  pop(at, text, tone) {
    if (warmingUp) return
    const rect = canvas.getBoundingClientRect()
    onScreen.copy(at).project(stage.camera)
    hud.pop(rect.left + (onScreen.x * 0.5 + 0.5) * rect.width, rect.top + (-onScreen.y * 0.5 + 0.5) * rect.height, text, tone)
  },
}
const view = new LineView(stage.scene, stage.camera, models, lineSet, state.config, audio, fx)
view.setOrientation(stage.orientation())

// Run the line for a few seconds before the first frame, so the page opens on a working line.
// Nothing is earned for it: reloading the page must not pay.
const before = { coins: state.coins, earned: state.earned, collection: { ...state.collection } }
view.silent = true
for (let t = 0; t < WARM_UP_SECONDS; t += 1 / 32) {
  view.handle(tick(state, 1 / 32))
  view.update(state, 1 / 32)
}
view.silent = false
warmingUp = false
Object.assign(state, before)

function apply(events: SimEvent[]): void {
  view.handle(events)
  for (const event of events) {
    if (event.type !== 'caught') continue
    const kind = RARES.find((rare) => rare.id === event.rare)!
    const how = event.byHand ? 'Caught by hand' : 'Caught by the spotter arm'
    hud.toast(event.first ? `New marble: ${kind.name}` : kind.name, `${TIER_NAME[kind.tier]} · ${how} · +${event.coins} coins`, kind)
  }
}

if (away) {
  const hours = Math.floor(away.seconds / 3600)
  const minutes = Math.floor((away.seconds % 3600) / 60)
  const gone = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
  hud.toast('Welcome back', `Away ${gone} · ${away.jars.toLocaleString('en-US')} jars · +${away.coins.toLocaleString('en-US')} coins`)
}

// For checks from the browser console and automated smoke tests.
const debug = { state, stage, handSorts: 0 }
Object.assign(window, { __line: debug })

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  audio.unlock()
  const id = view.itemAt(event.clientX, event.clientY, canvas)
  if (id === null) return
  const events = flick(state, id)
  if (events.length > 0) debug.handSorts++
  apply(events)
})

new ResizeObserver(() => {
  stage.resize()
  view.setOrientation(stage.orientation())
}).observe(canvas)

setInterval(save, SAVE_EVERY_MS)
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save()
})
window.addEventListener('pagehide', save)

let last = performance.now()
function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, MAX_DT)
  last = now
  if (dt > 0) {
    apply(tick(state, dt))
    view.update(state, dt)
    hud.update(state, dt)
  }
  if (followClock) stage.setHour(clockHour())
  lineSet.setLamp(stage.render(dt).lamp)
}
requestAnimationFrame(frame)
