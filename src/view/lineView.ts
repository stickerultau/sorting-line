import * as THREE from 'three'
import type { ColourId, FamilyId, SimConfig } from '../content/content'
import type { BeltItem, SimEvent, SimState } from '../sim/types'
import type { LineAudio } from './audio'
import { ItemPool } from './itemPool'
import { JAR, SHELF, jarSlot, shelfSlot } from './layout'
import { REST_Y, TABLE_Y, type LineSet, type Models } from './models'
import { Tweens, ease } from './tween'

interface Visual {
  family: FamilyId
  handle: number
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scale: number
}

interface BeltVisual extends Visual {
  /** Sideways offset on the belt, so items do not sit in a perfect row. */
  lane: number
  /** Extra height while the item is still dropping out of the chute. */
  drop: number
}

interface JarVisual {
  glass: THREE.Mesh
  lid: THREE.Mesh
  /** Centre of the jar's base. */
  pos: THREE.Vector3
  scale: number
  /** How far the lid hovers above the rim. */
  lidLift: number
  items: { visual: Visual; local: THREE.Vector3 }[]
}

const LID_START = 0.9
const FLIPPER_SWING = -1.15
const PICK_RADIUS_PX = 40
const POOL_CAPACITY = 512

/** Repeatable pseudo-random number in [0, 1) from two integers. Keeps the look stable between runs. */
function noise(n: number, salt: number): number {
  const v = Math.sin(n * 12.9898 + salt * 78.233) * 43758.5453
  return v - Math.floor(v)
}

const UP = new THREE.Vector3(0, 1, 0)
const euler = new THREE.Euler()

function restQuaternion(family: FamilyId, seed: number): THREE.Quaternion {
  const q = new THREE.Quaternion()
  if (family === 'button') return q.setFromAxisAngle(UP, noise(seed, 1) * Math.PI * 2)
  return q.setFromEuler(euler.set(noise(seed, 1) * 6.28, noise(seed, 2) * 6.28, noise(seed, 3) * 6.28))
}

function jarQuaternion(family: FamilyId, seed: number): THREE.Quaternion {
  const tilt = family === 'button' ? 1.3 : 6.28
  return new THREE.Quaternion().setFromEuler(
    euler.set((noise(seed, 4) - 0.5) * tilt, noise(seed, 5) * 6.28, (noise(seed, 6) - 0.5) * tilt),
  )
}

/** Turns simulation state and events into 3D items, motion and sound. Holds no game rules. */
export class LineView {
  /** When true, events make no sound. Used while the line is fast-forwarded before the first frame. */
  silent = false

  private readonly scene: THREE.Scene
  private readonly camera: THREE.Camera
  private readonly models: Models
  private readonly set: LineSet
  private readonly config: SimConfig
  private readonly audio: LineAudio
  private readonly pool: ItemPool
  private readonly tweens = new Tweens()
  private readonly belt = new Map<number, BeltVisual>()
  private readonly stationJars: (JarVisual | null)[]
  private readonly shelf: (JarVisual | null)[] = new Array(SHELF.columns * SHELF.rows).fill(null)
  private readonly projected = new THREE.Vector3()
  private travelled = 0

  constructor(scene: THREE.Scene, camera: THREE.Camera, models: Models, set: LineSet, config: SimConfig, audio: LineAudio) {
    this.scene = scene
    this.camera = camera
    this.models = models
    this.set = set
    this.config = config
    this.audio = audio
    this.pool = new ItemPool(scene, models, POOL_CAPACITY)
    scene.add(set.group)

    this.stationJars = config.stations.map((station) => this.makeJar(station.colour, this.stationBase(station.x), 1))
    for (let i = 0; i < config.startShelved; i++) this.addStartingShelfJar(i)
  }

  handle(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'spawned') this.onSpawned(event.item)
      else if (event.type === 'sorted') this.onSorted(event.item, event.station, event.slot, event.byHand)
      else if (event.type === 'jarFull') this.onJarFull(event.station, event.shelfIndex)
      else if (event.type === 'jarReady') this.onJarReady(event.station)
      else this.onRecycled(event.item)
    }
  }

  update(state: SimState, dt: number): void {
    this.travelled += state.config.beltSpeed * dt
    this.set.scrollBelt(this.travelled)
    this.tweens.update(dt)
    for (const item of state.items) {
      const visual = this.belt.get(item.id) ?? this.addBeltVisual(item, 0)
      visual.pos.set(item.x, REST_Y[visual.family] + visual.drop, visual.lane)
      this.write(visual)
    }
  }

  /** The id of the belt item nearest to a screen point, or null if none is close enough. */
  itemAt(clientX: number, clientY: number, canvas: HTMLCanvasElement): number | null {
    const rect = canvas.getBoundingClientRect()
    let best: number | null = null
    let bestDistance = PICK_RADIUS_PX
    for (const [id, visual] of this.belt) {
      this.projected.copy(visual.pos).project(this.camera)
      const x = rect.left + (this.projected.x * 0.5 + 0.5) * rect.width
      const y = rect.top + (-this.projected.y * 0.5 + 0.5) * rect.height
      const distance = Math.hypot(x - clientX, y - clientY)
      if (distance < bestDistance) {
        best = id
        bestDistance = distance
      }
    }
    return best
  }

  private stationBase(x: number): THREE.Vector3 {
    return new THREE.Vector3(x, TABLE_Y, JAR.z)
  }

  private write(visual: Visual): void {
    this.pool.set(visual.family, visual.handle, visual.pos, visual.quat, visual.scale)
  }

  private makeJar(colour: ColourId, pos: THREE.Vector3, scale: number): JarVisual {
    const glass = new THREE.Mesh(this.models.jarGeometry, this.models.glass)
    const lid = new THREE.Mesh(this.models.lidGeometry, this.models.enamel[colour])
    lid.castShadow = true
    lid.visible = false
    this.scene.add(glass, lid)
    const jar: JarVisual = { glass, lid, pos, scale, lidLift: LID_START, items: [] }
    this.placeJar(jar)
    return jar
  }

  /** Applies a jar's position and scale to its glass, lid and contents. */
  private placeJar(jar: JarVisual): void {
    jar.glass.position.copy(jar.pos)
    jar.glass.scale.setScalar(jar.scale)
    jar.lid.position.copy(jar.pos)
    jar.lid.position.y += (JAR.height + jar.lidLift) * jar.scale
    jar.lid.scale.setScalar(jar.scale)
    for (const { visual, local } of jar.items) {
      visual.pos.copy(local).multiplyScalar(jar.scale).add(jar.pos)
      visual.scale = jar.scale
      this.write(visual)
    }
  }

  private removeJar(jar: JarVisual): void {
    this.scene.remove(jar.glass, jar.lid)
    for (const { visual } of jar.items) this.pool.release(visual.family, visual.handle)
  }

  private addStartingShelfJar(index: number): void {
    const colour = this.config.stations[index % this.config.stations.length].colour
    const place = shelfSlot(index)
    const jar = this.makeJar(colour, new THREE.Vector3(place.x, place.y, place.z), place.scale)
    for (let slot = 0; slot < this.config.jarCapacity; slot++) {
      const seed = index * 97 + slot
      const family = this.config.families[Math.floor(noise(seed, 7) * this.config.families.length)]
      const local = jarSlot(slot)
      jar.items.push({
        visual: {
          family,
          handle: this.pool.alloc(family, colour),
          pos: new THREE.Vector3(),
          quat: jarQuaternion(family, seed),
          scale: 1,
        },
        local: new THREE.Vector3(local.x, local.y, local.z),
      })
    }
    jar.lid.visible = true
    jar.lidLift = 0
    this.placeJar(jar)
    this.shelf[index % this.shelf.length] = jar
  }

  private addBeltVisual(item: BeltItem, drop: number): BeltVisual {
    const visual: BeltVisual = {
      family: item.family,
      handle: this.pool.alloc(item.family, item.colour),
      pos: new THREE.Vector3(item.x, REST_Y[item.family] + drop, 0),
      quat: restQuaternion(item.family, item.id),
      scale: 1,
      lane: (noise(item.id, 8) - 0.5) * 0.5,
      drop,
    }
    this.belt.set(item.id, visual)
    return visual
  }

  private onSpawned(item: BeltItem): void {
    const height = this.set.chute.y - REST_Y[item.family]
    const visual = this.addBeltVisual(item, height)
    this.tweens.add(0.36, (k) => {
      visual.drop = height * (1 - ease.outBounce(k))
    })
  }

  private onSorted(item: BeltItem, station: number, slot: number, byHand: boolean): void {
    const visual = this.belt.get(item.id)
    const jar = this.stationJars[station]
    if (!visual) return
    this.belt.delete(item.id)
    if (!jar) {
      this.pool.release(visual.family, visual.handle)
      return
    }

    const place = jarSlot(slot)
    const local = new THREE.Vector3(place.x, place.y, place.z)
    const from = visual.pos.clone()
    const to = local.clone().add(jar.pos)
    const fromQuat = visual.quat.clone()
    const toQuat = jarQuaternion(visual.family, item.id)
    const arc = byHand ? 1.3 : 0.55

    if (byHand) {
      if (!this.silent) this.audio.bonus()
    } else {
      this.swing(station)
      if (!this.silent) this.audio.snap()
    }

    this.tweens.add(byHand ? 0.5 : 0.36, (k) => {
      visual.pos.lerpVectors(from, to, ease.inOut(k))
      visual.pos.y += Math.sin(Math.PI * k) * arc
      visual.quat.slerpQuaternions(fromQuat, toQuat, k)
      visual.scale = byHand ? 1 + 0.5 * Math.sin(Math.PI * k) : 1
      this.write(visual)
    }, {
      done: () => {
        jar.items.push({ visual, local })
        if (!this.silent) this.audio.clink(visual.family, slot / this.config.jarCapacity)
        this.tweens.add(0.14, (k) => {
          visual.scale = jar.scale * (1 - 0.16 * Math.sin(Math.PI * k))
          this.write(visual)
        })
      },
    })
  }

  private swing(station: number): void {
    const pivot = this.set.flippers[station]
    this.tweens.add(0.26, (k) => {
      pivot.rotation.y = FLIPPER_SWING * (k < 0.3 ? ease.out(k / 0.3) : 1 - ease.inOut((k - 0.3) / 0.7))
    })
  }

  private onJarFull(station: number, shelfIndex: number): void {
    const jar = this.stationJars[station]
    if (!jar) return
    this.stationJars[station] = null
    const index = shelfIndex % this.shelf.length
    const place = shelfSlot(shelfIndex)
    const to = new THREE.Vector3(place.x, place.y, place.z)

    // Wait for the last item to land, drop the lid, then carry the jar to the shelf.
    jar.lid.visible = true
    this.tweens.add(0.2, (k) => {
      jar.lidLift = LID_START * (1 - ease.in(k))
      this.placeJar(jar)
    }, {
      delay: 0.46,
      done: () => {
        if (!this.silent) this.audio.tock()
        const from = jar.pos.clone()
        this.tweens.add(0.7, (k) => {
          const e = ease.inOut(k)
          jar.pos.lerpVectors(from, to, e)
          jar.pos.y += Math.sin(Math.PI * k) * 1.8
          jar.scale = 1 + (place.scale - 1) * e
          this.placeJar(jar)
        }, {
          delay: 0.16,
          done: () => {
            const old = this.shelf[index]
            if (old) this.removeJar(old)
            this.shelf[index] = jar
          },
        })
      },
    })
  }

  private onJarReady(station: number): void {
    const { x, colour } = this.config.stations[station]
    const jar = this.makeJar(colour, this.stationBase(x), 0.001)
    this.stationJars[station] = jar
    this.tweens.add(0.32, (k) => {
      jar.scale = Math.max(0.001, ease.outBack(k))
      this.placeJar(jar)
    })
  }

  private onRecycled(item: BeltItem): void {
    const visual = this.belt.get(item.id)
    if (!visual) return
    this.belt.delete(item.id)
    const from = visual.pos.clone()
    this.tweens.add(0.5, (k) => {
      visual.pos.lerpVectors(from, this.set.bin, ease.in(k))
      visual.pos.y += Math.sin(Math.PI * k) * 0.35
      visual.scale = 1 - 0.5 * k
      this.write(visual)
    }, { done: () => this.pool.release(visual.family, visual.handle) })
  }
}
