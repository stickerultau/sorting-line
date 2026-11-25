import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { daylight, type Daylight } from './daylight'
import { createGovernor } from './governor'
import { fitDistance, orientationFor, type Orientation } from './layout'
import { paintGlow, paintWindow } from './marbleArt'
import { createPost } from './post'

export type Quality = 'high' | 'low'

export interface Stage {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  /** Call when the canvas changes size. */
  resize(): void
  /** Switches between the whole line and a close-up of the three stations. */
  toggleView(): void
  /** 'tall' for a phone held upright, otherwise 'wide'. */
  orientation(): Orientation
  /** Moves the light to an hour of the day (0 to 24). It glides there unless `instant` is set. */
  setHour(hour: number, instant?: boolean): void
  /** 'low' drops the depth blur and the lamp's shadows, smooths edges less and ignores the extra pixels of sharp screens. */
  setQuality(quality: Quality): void
  quality(): Quality
  /** Frames a second, smoothed, and the pixel ratio the scene is drawn at now. */
  perf(): { fps: number; ratio: number }
  /** Advances the light and the dust, then draws a frame. Returns the light now showing. */
  render(dt: number): Daylight
}

const FOV = 22
const ELEVATION = (13 * Math.PI) / 180
/** What the camera frames: the whole line, the three stations, or the stations under the tall phone shelf. */
const FRAMES = {
  full: { x: 8.2, y: 0.8, width: 21.4, height: 7.4 },
  close: { x: 9, y: 1.0, width: 10.8, height: 6.2 },
  tall: { x: 9, y: 4.0, width: 8, height: 12.4 },
}

const SUN_TARGET = new THREE.Vector3(8.5, 0.6, 0)
const SUN_DISTANCE = 46
const LAMP_POWER = 52
/** Sharp screens are drawn at up to this many pixels per point. Edges are smoothed as well, so more adds cost and little else. */
const MAX_PIXEL_RATIO = 1.5
/** Hours of daylight the light moves through per second when the time of day is changed. */
const GLIDE_HOURS_PER_SECOND = 5
const DUST = 240
const DUST_BOX = { x: [-2, 19], y: [-1.2, 6.5], z: [-1.8, 5] } as const

export function createStage(canvas: HTMLCanvasElement, startQuality: Quality = 'high'): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x10141a)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  pmrem.dispose()

  // Sky light, then the sun or moon shining through a window behind the camera, then the lamp over the line.
  const sky = new THREE.HemisphereLight(0xffffff, 0x9a8672, 0.3)
  const sun = new THREE.SpotLight(0xffffff, 2, 0, 0.3, 0.18, 0)
  sun.target.position.copy(SUN_TARGET)
  sun.map = new THREE.CanvasTexture(paintWindow())
  sun.map.colorSpace = THREE.SRGBColorSpace
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 20
  sun.shadow.camera.far = 80
  sun.shadow.bias = -0.0002
  sun.shadow.normalBias = 0.03
  sun.shadow.radius = 2.5

  const lamp = new THREE.SpotLight(0xffb070, 0, 0, 1.0, 0.85, 1)
  lamp.position.set(9, 6.6, 1.7)
  lamp.target.position.set(9, -0.7, 0.1)
  lamp.shadow.mapSize.set(1024, 1024)
  lamp.shadow.camera.near = 1
  lamp.shadow.camera.far = 16
  lamp.shadow.bias = -0.0006
  lamp.shadow.normalBias = 0.03
  lamp.shadow.radius = 4
  scene.add(sky, sun, sun.target, lamp, lamp.target)

  // Dust drifting in the light.
  const dustAt = new Float32Array(DUST * 3)
  for (let i = 0; i < DUST; i++) {
    dustAt[i * 3] = THREE.MathUtils.randFloat(...DUST_BOX.x)
    dustAt[i * 3 + 1] = THREE.MathUtils.randFloat(...DUST_BOX.y)
    dustAt[i * 3 + 2] = THREE.MathUtils.randFloat(...DUST_BOX.z)
  }
  const dustGeometry = new THREE.BufferGeometry()
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustAt, 3))
  const dustMaterial = new THREE.PointsMaterial({
    size: 0.07,
    map: new THREE.CanvasTexture(paintGlow()),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const dust = new THREE.Points(dustGeometry, dustMaterial)
  dust.frustumCulled = false
  scene.add(dust)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 300)
  const post = createPost(renderer, scene, camera)
  /** The choice made with the view button. Null means pick by screen shape. */
  let chosen: 'whole' | 'detail' | null = null
  let quality: Quality = startQuality
  let hour = 12
  let wantedHour = 12
  let light = daylight(hour)
  let time = 0
  /** Draws fewer pixels on a machine that cannot keep up at full size. */
  const governor = createGovernor()
  /** Frame length by the clock, smoothed. The `dt` handed to render() is capped, so it cannot show a slow machine. */
  let frameSeconds = 1 / 60
  let lastFrameAt = 0

  const orientation = () => orientationFor(camera.aspect)
  const showsWholeLine = () => (chosen ? chosen === 'whole' : orientation() === 'wide' && camera.aspect >= 2.6)
  const place = () => {
    const frame = showsWholeLine() ? FRAMES.full : orientation() === 'tall' ? FRAMES.tall : FRAMES.close
    // The extra distance covers the jars, which stand in front of the framing plane.
    const distance = fitDistance(frame.width, frame.height, FOV, camera.aspect) + 1.8
    camera.position.set(frame.x, frame.y + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance)
    camera.lookAt(frame.x, frame.y, 0)
    post.setFocus(distance)
  }

  const fit = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    post.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    place()
  }

  const pixelRatio = () => (quality === 'high' ? Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) : 1) * governor.scale()
  const applyPixelRatio = () => {
    renderer.setPixelRatio(pixelRatio())
    post.setPixelRatio(pixelRatio())
    fit()
  }

  const applyQuality = () => {
    governor.reset()
    post.setDepthBlur(quality === 'high')
    post.setSamples(quality === 'high' ? 4 : 2)
    lamp.castShadow = quality === 'high'
    applyPixelRatio()
  }

  /** A new window size is a new amount of work: the governor starts again from full size. */
  const resize = () => {
    if (governor.scale() === 1) return fit()
    governor.reset()
    applyPixelRatio()
  }

  const applyLight = () => {
    light = daylight(hour)
    sun.position.set(...light.sun).multiplyScalar(SUN_DISTANCE).add(SUN_TARGET)
    sun.color.setRGB(...light.sunColour)
    sun.intensity = light.sunPower
    sky.color.setRGB(...light.sky)
    sky.intensity = light.skyPower
    scene.environmentIntensity = light.env
    lamp.intensity = light.lamp * LAMP_POWER
    // By day the lamp is off: its shadows are not drawn again until it comes on.
    lamp.shadow.autoUpdate = light.lamp > 0.001
    renderer.toneMappingExposure = light.exposure
    dustMaterial.color.setRGB(...light.sunColour).multiplyScalar(0.5 + light.sunPower * 0.5)
    dustMaterial.opacity = 0.16 + 0.1 * light.sunPower
  }

  applyQuality()
  applyLight()

  return {
    scene,
    camera,
    renderer,
    resize,
    toggleView() {
      chosen = showsWholeLine() ? 'detail' : 'whole'
      place()
    },
    orientation,
    setHour(next, instant = false) {
      wantedHour = ((next % 24) + 24) % 24
      if (!instant) return
      hour = wantedHour
      applyLight()
    },
    setQuality(next) {
      quality = next
      applyQuality()
    },
    quality: () => quality,
    perf: () => ({ fps: 1 / frameSeconds, ratio: renderer.getPixelRatio() }),
    render(dt) {
      time += dt
      const now = performance.now()
      const sinceLast = lastFrameAt > 0 ? (now - lastFrameAt) / 1000 : 0
      lastFrameAt = now
      if (sinceLast > 0) frameSeconds = sinceLast < 0.5 ? frameSeconds + (sinceLast - frameSeconds) * 0.05 : sinceLast
      if (governor.frame(sinceLast) !== null) applyPixelRatio()
      // Glide toward the wanted hour the short way round the clock.
      const gap = ((wantedHour - hour + 36) % 24) - 12
      if (gap !== 0) {
        const move = Math.min(Math.abs(gap), GLIDE_HOURS_PER_SECOND * dt)
        hour = (hour + Math.sign(gap) * move + 24) % 24
        applyLight()
      }
      for (let i = 0; i < DUST; i++) {
        const at = i * 3
        dustAt[at] += (0.05 + 0.03 * Math.sin(i)) * dt
        dustAt[at + 1] += Math.sin(time * 0.3 + i * 1.7) * 0.03 * dt
        if (dustAt[at] > DUST_BOX.x[1]) dustAt[at] = DUST_BOX.x[0]
      }
      dustGeometry.attributes.position.needsUpdate = true
      post.render(dt)
      return light
    },
  }
}
