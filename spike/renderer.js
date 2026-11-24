// THROWAWAY spike renderer: 200 moving instanced items on a transparent canvas at 30 fps.
import * as THREE from 'three'

const ITEMS = 200
const FRAME_MS = 1000 / 30

const canvas = document.getElementById('c')
const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true })
renderer.setClearColor(0x000000, 0)
const forcedDpr = Number(new URLSearchParams(location.search).get('dpr'))
renderer.setPixelRatio(forcedDpr || Math.min(window.devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight, false)

const scene = new THREE.Scene()
const halfW = 20
const halfH = halfW * (window.innerHeight / window.innerWidth)
const camera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.1, 50)
camera.position.z = 10
scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.6))
const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 6, 8)
scene.add(sun)

const mesh = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.28, 20, 14),
  new THREE.MeshStandardMaterial({ roughness: 0.25 }),
  ITEMS,
)
const palette = [0xe5484d, 0xf5c542, 0x3b82f6]
const colour = new THREE.Color()
for (let i = 0; i < ITEMS; i++) mesh.setColorAt(i, colour.setHex(palette[i % 3]))
scene.add(mesh)

const matrix = new THREE.Matrix4()
let frames = 0
let last = 0
function frame(now) {
  requestAnimationFrame(frame)
  if (now - last < FRAME_MS - 1) return
  last = now
  const t = now / 1000
  for (let i = 0; i < ITEMS; i++) {
    const x = ((i * 0.2 + t * 2) % (halfW * 2)) - halfW
    const y = -halfH + 0.6 + (i % 5) * 0.3 + Math.sin(t * 3 + i) * 0.08
    matrix.makeTranslation(x, y, 0)
    mesh.setMatrixAt(i, matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  renderer.render(scene, camera)
  frames++
}
requestAnimationFrame(frame)

const jar = document.getElementById('jar')
let clicks = 0
let over = false
jar.addEventListener('mouseenter', () => { over = true; window.spike.hit(true) })
jar.addEventListener('mouseleave', () => { over = false; window.spike.hit(false) })
jar.addEventListener('click', () => { clicks++; jar.textContent = String(clicks) })

let lastFrames = 0
setInterval(() => {
  const r = jar.getBoundingClientRect()
  window.spike.state({
    items: ITEMS,
    fps: (frames - lastFrames) * 2,
    clicks,
    over,
    jar: { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) },
  })
  lastFrames = frames
}, 500)
