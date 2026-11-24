import * as THREE from 'three'
import { COLOUR_HEX, type ColourId, type FamilyId, type SimConfig } from '../content/content'
import { ITEM_RADIUS, JAR, SHELF } from './layout'

// Placeholder shapes built in code. Artist-made models replace these after the clip test.

/** Jars stand on the table. */
export const TABLE_Y = JAR.topY - JAR.height
export const BELT_HALF_DEPTH = 0.62
/** Height of an item's centre above the belt when it lies at rest. */
export const REST_Y: Record<FamilyId, number> = { marble: ITEM_RADIUS, button: 0.055 }

const RIB_SPACING = 0.5
const CREAM = 0xf4eee2
const WALL = 0x7fa293

export interface Models {
  itemGeometry: Record<FamilyId, THREE.BufferGeometry>
  itemMaterial: Record<FamilyId, THREE.Material>
  jarGeometry: THREE.BufferGeometry
  glass: THREE.Material
  lidGeometry: THREE.BufferGeometry
  enamel: Record<ColourId, THREE.Material>
}

export interface LineSet {
  group: THREE.Group
  /** One pivot per station. Rotate it around Y to swing the arm across the belt. */
  flippers: THREE.Object3D[]
  /** Moves the belt surface to match the distance the line has travelled. */
  scrollBelt(distance: number): void
  /** Where new items appear. */
  chute: THREE.Vector3
  /** Where unsorted items land. */
  bin: THREE.Vector3
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

function beltTexture(): THREE.CanvasTexture {
  return canvasTexture(64, (g, size) => {
    g.fillStyle = '#2c2f34'
    g.fillRect(0, 0, size, size)
    g.fillStyle = '#3b3f46'
    g.fillRect(0, 0, 9, size)
    g.fillStyle = '#1e2024'
    g.fillRect(9, 0, 3, size)
  })
}

function buttonGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape()
  shape.absarc(0, 0, 0.21, 0, Math.PI * 2, false)
  for (const [x, y] of [[0.07, 0.07], [-0.07, 0.07], [-0.07, -0.07], [0.07, -0.07]]) {
    const hole = new THREE.Path()
    hole.absarc(x, y, 0.034, 0, Math.PI * 2, true)
    shape.holes.push(hole)
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.06,
    bevelEnabled: true,
    bevelThickness: 0.025,
    bevelSize: 0.025,
    bevelSegments: 3,
    curveSegments: 20,
  })
  geometry.translate(0, 0, -0.03)
  geometry.rotateX(-Math.PI / 2) // lie flat
  return geometry
}

const lathe = (points: [number, number][], segments = 40) =>
  new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), segments)

export function buildModels(): Models {
  const enamel = (colour: number) =>
    new THREE.MeshPhysicalMaterial({ color: colour, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 })
  return {
    itemGeometry: {
      marble: new THREE.SphereGeometry(ITEM_RADIUS, 28, 18),
      button: buttonGeometry(),
    },
    itemMaterial: {
      marble: new THREE.MeshPhysicalMaterial({ roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03 }),
      button: new THREE.MeshPhysicalMaterial({ roughness: 0.36, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
    },
    jarGeometry: lathe([
      [0, 0], [0.5, 0], [0.59, 0.05], [0.62, 0.15], [0.62, JAR.height - 0.24],
      [0.58, JAR.height - 0.13], [0.58, JAR.height - 0.02], [0.61, JAR.height],
    ]),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.04,
      metalness: 0,
      transmission: 1,
      thickness: 0.08,
      ior: 1.45,
      side: THREE.DoubleSide,
    }),
    lidGeometry: lathe([[0.66, 0], [0.66, 0.09], [0.62, 0.12], [0.16, 0.13], [0.13, 0.2], [0.09, 0.25], [0, 0.26]]),
    enamel: {
      red: enamel(COLOUR_HEX.red),
      yellow: enamel(COLOUR_HEX.yellow),
      blue: enamel(COLOUR_HEX.blue),
    },
  }
}

export function buildSet(models: Models, config: SimConfig): LineSet {
  const group = new THREE.Group()
  const length = config.beltLength
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.62 })
  const tableMap = woodTexture()
  tableMap.repeat.set(14, 5)
  const table = new THREE.MeshStandardMaterial({ map: tableMap, color: 0xb98a63, roughness: 0.7 })
  const cream = new THREE.MeshPhysicalMaterial({ color: CREAM, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.15 })
  const creamOpen = cream.clone()
  creamOpen.side = THREE.DoubleSide
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ced2, metalness: 0.9, roughness: 0.32 })
  const rubber = new THREE.MeshStandardMaterial({ color: 0x25272b, roughness: 0.9 })
  const beltMap = beltTexture()
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
  const wall = add(new THREE.PlaneGeometry(140, 70), new THREE.MeshStandardMaterial({ color: WALL, roughness: 1 }), 8, 14, -2.3)
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
  for (const x of [0.6, 4, 7.5, 10.5, 14, length - 0.6]) {
    for (const z of [-0.4, 0.4]) add(box(0.18, TABLE_Y * -1 - 0.65, 0.18), wood, x, (TABLE_Y - 0.65) / 2, z)
  }

  // Back rail with a colour plate and a flipper at each station
  add(box(length + 0.8, 0.5, 0.08), cream, length / 2, 0.25, -0.7)
  const flippers = config.stations.map((station) => {
    add(box(0.74, 0.3, 0.03), models.enamel[station.colour], station.x, 0.3, -0.645)
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
  const shelfCentre = SHELF.x0 + ((SHELF.columns - 1) * SHELF.dx) / 2
  for (let row = 0; row < SHELF.rows; row++) {
    add(box(SHELF.columns * SHELF.dx + 0.5, 0.07, 0.86), wood, shelfCentre, SHELF.y0 + row * SHELF.dy - 0.035, SHELF.z)
  }

  return {
    group,
    flippers,
    scrollBelt(distance) {
      beltMap.offset.x = -((distance / RIB_SPACING) % 1)
    },
    chute: new THREE.Vector3(0, 0.95, 0),
    bin: new THREE.Vector3(binX, -0.75, 0),
  }
}
