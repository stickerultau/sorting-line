import './style.css'
import { DEFAULT_CONFIG } from './content/content'
import { MAX_DT, createSim, flick, tick } from './sim/sim'
import { createHud } from './ui/hud'
import { createAudio } from './view/audio'
import { LineView } from './view/lineView'
import { buildModels, buildSet } from './view/models'
import { createStage } from './view/scene'

const WARM_UP_SECONDS = 8
const DEFAULT_SEED = 20261124

const canvas = document.getElementById('stage') as HTMLCanvasElement
const seed = Number(new URLSearchParams(location.search).get('seed')) || DEFAULT_SEED

const state = createSim(DEFAULT_CONFIG, seed)
const stage = createStage(canvas)
const models = buildModels()
const audio = createAudio()
const view = new LineView(stage.scene, stage.camera, models, buildSet(models, state.config), state.config, audio)

view.setOrientation(stage.orientation())

// Run the line for a few seconds before the first frame, so the page opens on a working line.
view.silent = true
for (let t = 0; t < WARM_UP_SECONDS; t += 1 / 32) {
  view.handle(tick(state, 1 / 32))
  view.update(state, 1 / 32)
}
view.silent = false

// For checks from the browser console and automated smoke tests.
const debug = { state, handSorts: 0 }
Object.assign(window, { __line: debug })

let soundOn = true
const hud = createHud(document.getElementById('hud')!, {
  toggleSound() {
    soundOn = !soundOn
    audio.unlock()
    audio.setMuted(!soundOn)
    return soundOn
  },
  toggleView: () => stage.toggleView(),
})

canvas.addEventListener('pointerdown', (event) => {
  audio.unlock()
  const id = view.itemAt(event.clientX, event.clientY, canvas)
  if (id === null) return
  const events = flick(state, id)
  if (events.length > 0) debug.handSorts++
  view.handle(events)
})

new ResizeObserver(() => {
  stage.resize()
  view.setOrientation(stage.orientation())
}).observe(canvas)

let last = performance.now()
function frame(now: number): void {
  requestAnimationFrame(frame)
  const dt = Math.min((now - last) / 1000, MAX_DT)
  last = now
  if (dt > 0) {
    view.handle(tick(state, dt))
    view.update(state, dt)
    hud.setShelved(state.shelved)
  }
  stage.renderer.render(stage.scene, stage.camera)
}
requestAnimationFrame(frame)

