import * as THREE from 'three'
import { COLOUR_HEX, LOOKS, RARES, type ColourId, type FamilyId, type Look, type RareId, type SimConfig } from '../content/content'
import { ITEM_RADIUS, JAR, SHELVES, type Orientation } from './layout'
import { paintGlow, paintMarble, paintPlainMarble } from './marbleArt'

// Placeholder shapes built in code. Artist-made models replace these after the clip test.

/** Tests build the models without a browser, where nothing can be painted. Shapes and materials still work. */
const CAN_PAINT = typeof document !== 'undefined'

/** Jars stand on the table. */
export const TABLE_Y = JAR.topY - JAR.height
export const BELT_HALF_DEPTH = 0.62
/** Height of an item's centre above the belt when it lies at rest. */
const BEAD = { ring: 0.125, tube: 0.075 }
export const REST_Y: Record<FamilyId, number> = { marble: ITEM_RADIUS, button: 0.055, bead: BEAD.tube }

const RIB_SPACING = 0.5
const LED_READY = 0x35ff8a
const LED_BUSY = 0xff9a2a

export interface Models {
  itemGeometry: Record<FamilyId, THREE.BufferGeometry>
  itemMaterial: Record<FamilyId, THREE.Material>
  jarGeometry: THREE.BufferGeometry
  glass: THREE.Material
  lidGeometry: THREE.BufferGeometry
  enamel: Record<ColourId, THREE.Material>
  /** The lid of a golden jar. */
  gold: THREE.Material
  rareGeometry: THREE.BufferGeometry
  rareMaterial: Record<RareId, THREE.Material>
  /** The halo round a rare marble, and the shape of every spark. Null where nothing can be painted. */
  glowMap: THREE.Texture | null
}

export interface LineSet {
  group: THREE.Group
  /** One pivot per station. Rotate it around Y to swing the arm across the belt. */
  flippers: THREE.Object3D[]
  /** Moves the belt surface to match the distance the line has travelled. */
  scrollBelt(distance: number): void
  /** Shows the shelf boards that match the screen shape. */
  setShelf(orientation: Orientation): void
  /** The small lamp on the rail above a station: green with a jar in place, amber while it is swapped. */
  setLed(station: number, ready: boolean): void
  /** Lights the strip under the shelf. 0 is off, 1 is fully on. */
  setLamp(level: number): void
  /** Paints the wall, the body of the machine, the belt and the lamp strip in a look's colours. */
  setLook(look: Look): void
  /** Where new items appear. */
  chute: THREE.Vector3
  /** Where unsorted items land. */
  bin: THREE.Vector3
  /** Frees the set's shapes, materials and pictures. Call when a new set replaces it. */
  dispose(): void
}

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, size: number) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  draw(canvas.getContext('2d')!, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function woodTexture(): THREE.CanvasTexture {
  return canvasTexture(512, (g, size) => {
    g.fillStyle = '#c98f52'
    g.fillRect(0, 0, size, size)
    let seed = 7
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 150; i++) {
      const y = random() * size
      const wobble = 2 + random() * 5
      g.strokeStyle = `rgba(${random() < 0.5 ? '92,56,24' : '255,226,180'},${0.05 + random() * 0.13})`
      g.lineWidth = 0.6 + random() * 2.2
      g.beginPath()
      for (let x = 0; x <= size; x += 16) g.lineTo(x, y + Math.sin((x / size) * Math.PI * 2 + i) * wobble)
      g.stroke()
    }
  })
}

/** A colour made lighter or darker, as a CSS colour: `lift` moves it toward white, `scale` multiplies it. */
function shade(hex: number, lift: number, scale: number): string {
  const part = (shift: number) => {
    const value = (hex >> shift) & 255
    return Math.round(Math.min(255, (value + (255 - value) * lift) * scale))
  }
  return `rgb(${part(16)},${part(8)},${part(0)})`
}

/** The ribbed top of the belt. `paint` draws it again in another colour. */
function beltTexture(): { map: THREE.CanvasTexture; paint(colour: number): void } {
  let g!: CanvasRenderingContext2D
  const size = 64
  const map = canvasTexture(size, (context) => (g = context))
  return {
    map,
    paint(colour) {
      g.fillStyle = shade(colour, 0, 1)
      g.fillRect(0, 0, size, size)
      g.fillStyle = shade(colour, 0.07, 1)
      g.fillRect(0, 0, 9, size)
      g.fillStyle = shade(colour, 0, 0.68)
      g.fillRect(9, 0, 3, size)
      map.needsUpdate = true
    },
  }
}

/** A closed ring of straight edges. Drawn by hand so the rim and the holes can each have the detail they need. */
function ring(path: THREE.Path, x: number, y: number, radius: number, edges: number, clockwise: boolean): void {
  for (let i = 0; i < edges; i++) {
    const angle = ((clockwise ? -i : i) / edges) * Math.PI * 2
    const px = x + Math.cos(angle) * radius
    const py = y + Math.sin(angle) * radius
    if (i === 0) path.moveTo(px, py)
    else path.lineTo(px, py)
  }
  path.closePath()
}

/** A four-hole button. Hundreds are on screen at once, so it is kept to a few hundred triangles. */
function buttonGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  ring(shape, 0, 0, 0.21, 24, false)
  for (const [x, y] of [[0.07, 0.07], [-0.07, 0.07], [-0.07, -0.07], [0.07, -0.07]]) {
    const hole = new THREE.Path()
    ring(hole, x, y, 0.034, 8, true)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 2,
  })
  geometry.translate(0, 0, -0.03)
  geometry.rotateX(-Math.PI / 2) // lie flat
  return geometry
}

function pegboardTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g, size) => {
    g.fillStyle = '#ffffff'
    g.fillRect(0, 0, size, size)
    g.fillStyle = 'rgba(28,44,38,0.6)'
    g.beginPath()
    g.arc(size / 2, size / 2, 5, 0, Math.PI * 2)
    g.fill()
    g.strokeStyle = 'rgba(255,255,255,0.5)'
    g.lineWidth = 1.5
    g.beginPath()
    g.arc(size / 2, size / 2 + 1, 5.5, 0.2, Math.PI - 0.2)
    g.stroke()
  })
}

function paintedTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = THREE.RepeatWrapping
  texture.anisotropy = 8
  return texture
}

function rareMaterials(): Record<RareId, THREE.Material> {
  const materials = {} as Record<RareId, THREE.Material>
  for (const kind of RARES) {
    const map = CAN_PAINT ? paintedTexture(paintMarble(kind)) : null
    materials[kind.id] = new THREE.MeshPhysicalMaterial({
      map,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      // A rare marble glows a little from inside, more the rarer it is, so it stands out even at night.
      emissive: 0xffffff,
      emissiveMap: map,
      emissiveIntensity: [0, 0.35, 0.55, 0.9][kind.tier],
      iridescence: kind.pattern === 'nebula' ? 1 : 0,
      iridescenceIOR: 1.6,
    })
  }
  return materials
}

const lathe = (points: [number, number][], segments = 40) =>
  new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments)

export function buildModels(): Models {
  const enamel = (colour: number) =>
    new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 })
  return {
    itemGeometry: {
      marble: new THREE.SphereGeometry(ITEM_RADIUS, 24, 14),
      button: buttonGeometry(),
      // A bead is a fat ring lying flat.
      bead: new THREE.TorusGeometry(BEAD.ring, BEAD.tube, 8, 16).rotateX(Math.PI / 2),
    },
    itemMaterial: {
      marble: new THREE.MeshPhysicalMaterial({
        map: CAN_PAINT ? paintedTexture(paintPlainMarble()) : null,
        roughness: 0.06,
        clearcoat: 1,
        clearcoatRoughness: 0.03,
      }),
      button: new THREE.MeshPhysicalMaterial({ roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      bead: new THREE.MeshPhysicalMaterial({ roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05 }),
    },
    jarGeometry: lathe([
      [0, 0], [0.5, 0], [0.59, 0.05], [0.62, 0.15], [0.62, JAR.height - 0.24],
      [0.58, JAR.height - 0.13], [0.58, JAR.height - 0.02], [0.61, JAR.height],
    ]),
    // Glass that is all reflection: a black body, so it adds only its highlights, laid over what is behind it.
    // True transmission looks a little richer, but makes the renderer draw the whole scene a second time.
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x000000,
      roughness: 0.05,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      envMapIntensity: 1.8,
      transparent: true,
      opacity: 0.06,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    }),
    lidGeometry: lathe([[0.66, 0], [0.66, 0.09], [0.62, 0.12], [0.16, 0.13], [0.13, 0.2], [0.09, 0.25], [0, 0.26]]),
    enamel: Object.fromEntries(Object.entries(COLOUR_HEX).map(([colour, hex]) => [colour, enamel(hex)])) as unknown as Record<ColourId, THREE.Material>,
    gold: new THREE.MeshStandardMaterial({ color: 0xf2b632, metalness: 1, roughness: 0.2, emissive: 0xb86a00, emissiveIntensity: 0.35 }),
    rareGeometry: new THREE.SphereGeometry(ITEM_RADIUS, 36, 24),
    rareMaterial: rareMaterials(),
    glowMap: CAN_PAINT ? new THREE.CanvasTexture(paintGlow()) : null,
  }
}

export function buildSet(models: Models, config: SimConfig): LineSet {
  const group = new THREE.Group()
  const length = config.beltLength
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 })
  const tableMap = woodTexture()
  tableMap.repeat.set(14, 5)
  const table = new THREE.MeshStandardMaterial({ map: tableMap, color: 0xb98a63, roughness: 0.7 })
  const cream = new THREE.MeshPhysicalMaterial({ color: LOOKS[0].body, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })
  const creamOpen = cream.clone()
  creamOpen.side = THREE.DoubleSide
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: 0.9, roughness: 0.32 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.9 })
  const brass = new THREE.MeshStandardMaterial({ color: 0xd9a441, metalness: 1, roughness: 0.24 })
  const strip = new THREE.MeshStandardMaterial({ color: 0x2a2018, emissive: LOOKS[0].lamp, emissiveIntensity: 0 })
  const belt = beltTexture()
  belt.paint(LOOKS[0].belt)
  const beltMap = belt.map
  beltMap.repeat.set((length + 0.8) / RIB_SPACING, 1)
  const beltTop = new THREE.MeshStandardMaterial({ map: beltMap, roughness: 0.85 })

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material | THREE.Material[], x: number, y: number, z: number, parent: THREE.Object3D = group) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.set(x, y, z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    return mesh
  }
  const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d)

  // Room
  const pegboard = pegboardTexture()
  pegboard.repeat.set(140 / 0.6, 70 / 0.6)
  const wallPaint = new THREE.MeshStandardMaterial({ color: LOOKS[0].wall, map: pegboard, roughness: 0.95 })
  const wall = add(new THREE.PlaneGeometry(140, 70), wallPaint, 8, 14, -2.3)
  wall.castShadow = false
  const top = add(new THREE.PlaneGeometry(140, 44), table, 8, TABLE_Y, 19.6)
  top.rotation.x = -Math.PI / 2
  top.castShadow = false

  // Belt, body and legs
  add(box(length + 0.8, 0.14, BELT_HALF_DEPTH * 2), [rubber, rubber, beltTop, rubber, rubber, rubber], length / 2, -0.07, 0)
  for (const x of [-0.4, length + 0.4]) {
    add(new THREE.CylinderGeometry(0.2, 0.2, BELT_HALF_DEPTH * 2 + 0.1, 24), steel, x, -0.12, 0).rotation.x = Math.PI / 2
  }
  add(box(length + 0.3, 0.5, 1.05), cream, length / 2, -0.4, 0)
  add(box(length + 0.3, 0.035, 0.02), brass, length / 2, -0.2, 0.535)
  add(box(length + 0.3, 0.035, 0.02), brass, length / 2, -0.6, 0.535)
  for (const x of [0.6, 4, 7.5, 10.5, 14, length - 0.6]) {
    for (const z of [-0.4, 0.4]) add(box(0.18, TABLE_Y * -1 - 0.65, 0.18), wood, x, (TABLE_Y - 0.65) / 2, z)
  }

  // Back rail with a colour plate and a flipper at each station
  add(box(length + 0.8, 0.5, 0.08), cream, length / 2, 0.25, -0.7)
  const leds: THREE.MeshStandardMaterial[] = []
  const flippers = config.stations.map((station) => {
    add(box(0.74, 0.3, 0.03), models.enamel[station.colour], station.x, 0.3, -0.645)
    const led = new THREE.MeshStandardMaterial({ color: 0x101010, emissive: LED_READY, emissiveIntensity: 4 })
    leds.push(led)
    add(new THREE.SphereGeometry(0.055, 16, 10), led, station.x, 0.53, -0.7).castShadow = false
    add(new THREE.CylinderGeometry(0.075, 0.075, 0.03, 20), brass, station.x, 0.505, -0.7)
    const pivot = new THREE.Group()
    pivot.position.set(station.x - 0.5, 0.2, -0.54)
    add(box(1, 0.26, 0.09), models.enamel[station.colour], 0.5, 0, 0, pivot)
    add(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 20), steel, 0, 0, 0, pivot)
    group.add(pivot)
    return pivot
  })

  // Chute
  add(new THREE.CylinderGeometry(0.85, 0.32, 0.9, 36, 1, true), creamOpen, 0, 1.6, 0)
  add(new THREE.CylinderGeometry(0.32, 0.32, 0.32, 36, 1, true), creamOpen, 0, 1.0, 0)
  add(box(0.12, 1.5, 0.12), wood, 0, 0.75, -0.76)
  add(new THREE.TorusGeometry(0.85, 0.03, 10, 48), brass, 0, 2.05, 0).rotation.x = Math.PI / 2

  // Mixed bin for items that reach the end unsorted
  const binX = length + 1.15
  const bin = new THREE.Group()
  bin.position.set(binX, -0.72, 0)
  add(box(1.2, 0.06, 1.2), wood, 0, -0.3, 0, bin)
  for (const z of [-0.57, 0.57]) add(box(1.2, 0.6, 0.06), wood, 0, 0, z, bin)
  for (const x of [-0.57, 0.57]) add(box(0.06, 0.6, 1.2), wood, x, 0, 0, bin)
  group.add(bin)
  add(box(0.9, TABLE_Y * -1 - 1.05, 0.9), cream, binX, (TABLE_Y - 1.05) / 2, 0)

  // Shelf
  const boards = (orientation: Orientation) => {
    const shelf = SHELVES[orientation]
    const set = new THREE.Group()
    const centre = shelf.x0 + ((shelf.columns - 1) * shelf.dx) / 2
    for (let row = 0; row < shelf.rows; row++) {
      add(box(shelf.columns * shelf.dx + 0.5, 0.07, 1.56 * shelf.scale), wood, centre, shelf.y0 + row * shelf.dy - 0.035, shelf.z, set)
    }
    // The lamp strip under the lowest board.
    const glow = add(box(shelf.columns * shelf.dx + 0.3, 0.035, 0.06), strip, centre, shelf.y0 - 0.09, shelf.z + 0.7 * shelf.scale, set)
    glow.castShadow = false
    glow.receiveShadow = false
    set.visible = orientation === 'wide'
    group.add(set)
    return set
  }
  const shelves: Record<Orientation, THREE.Group> = { wide: boards('wide'), tall: boards('tall') }

  return {
    group,
    flippers,
    scrollBelt(distance) {
      beltMap.offset.x = -((distance / RIB_SPACING) % 1)
    },
    setShelf(orientation) {
      shelves.wide.visible = orientation === 'wide'
      shelves.tall.visible = orientation === 'tall'
    },
    setLed(station, ready) {
      leds[station].emissive.setHex(ready ? LED_READY : LED_BUSY)
    },
    setLamp(level) {
      strip.emissiveIntensity = 7 * level
    },
    setLook(look) {
      wallPaint.color.setHex(look.wall)
      cream.color.setHex(look.body)
      creamOpen.color.setHex(look.body)
      strip.emissive.setHex(look.lamp)
      belt.paint(look.belt)
    },
    chute: new THREE.Vector3(0, 0.95, 0),
    bin: new THREE.Vector3(binX, -0.75, 0),
    dispose() {
      // The enamel belongs to the models and is used again by the next set.
      const shared = new Set<THREE.Material>(Object.values(models.enamel))
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return
        object.geometry.dispose()
        for (const material of [object.material].flat() as THREE.MeshStandardMaterial[]) {
          if (shared.has(material)) continue
          material.map?.dispose()
          material.dispose()
        }
      })
      group.removeFromParent()
    },
  }
}
