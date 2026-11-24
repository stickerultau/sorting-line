import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { fitDistance, orientationFor, type Orientation } from './layout'


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
}

const FOV = 22
const ELEVATION = (13 * Math.PI) / 180
/** What the camera frames: the whole line, the three stations, or the stations under the tall phone shelf. */
const FRAMES = {
  full: { x: 8.2, y: 0.8, width: 21.4, height: 7.4 },
  close: { x: 9, y: 1.0, width: 10.8, height: 6.2 },
  tall: { x: 9, y: 4.0, width: 8, height: 12.4 },
}

export function createStage(canvas: HTMLCanvasElement): Stage {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.toneMapping = THREE.NeutralToneMapping
  renderer.toneMappingExposure = 1
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x7fa293)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.7
  pmrem.dispose()

  scene.add(new THREE.HemisphereLight(0xffffff, 0xb59d84, 0.3))
  const key = new THREE.DirectionalLight(0xfff1de, 2.1)
  key.position.set(4, 12, 10)
  key.target.position.set(9, 0, 0)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  const shadow = key.shadow.camera
  shadow.left = -14
  shadow.right = 14
  shadow.top = 16
  shadow.bottom = -9
  shadow.near = 1
  shadow.far = 45
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.03
  key.shadow.radius = 3
  scene.add(key, key.target)

  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 300)
  /** The choice made with the view button. Null means pick by screen shape. */
  let chosen: 'whole' | 'detail' | null = null

  const orientation = () => orientationFor(camera.aspect)
  const showsWholeLine = () => (chosen ? chosen === 'whole' : orientation() === 'wide' && camera.aspect >= 2.6)
  const place = () => {
    const frame = showsWholeLine() ? FRAMES.full : orientation() === 'tall' ? FRAMES.tall : FRAMES.close
    // The extra distance covers the jars, which stand in front of the framing plane.
    const distance = fitDistance(frame.width, frame.height, FOV, camera.aspect) + 1.8
    camera.position.set(frame.x, frame.y + Math.sin(ELEVATION) * distance, Math.cos(ELEVATION) * distance)
    camera.lookAt(frame.x, frame.y, 0)
  }

  const resize = () => {
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    if (width === 0 || height === 0) return
    renderer.setSize(width, height, false)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    place()
  }

  resize()
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
  }
}
