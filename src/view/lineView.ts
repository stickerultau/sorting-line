import * as THREE from 'three'
import { COLOUR_HEX, RARES, type ColourId, type FamilyId, type LuckyGift, type RareId, type SimConfig } from '../content/content'
import { beltSpeed } from '../sim/sim'
import type { BeltItem, SimEvent, SimState } from '../sim/types'
import type { LineAudio } from './audio'
import { compact } from './format'
import { ItemPool } from './itemPool'
import { JAR, SHELF_PLACES, jarSlot, shelfSlot, type Orientation } from './layout'
import { REST_Y, TABLE_Y, type LineSet, type Models } from './models'
import { Sparks } from './sparks'
import { Tweens, ease } from './tween'

interface Visual {
  family: FamilyId
  handle: number
  pos: THREE.Vector3
  quat: THREE.Quaternion
  scale: number
  /** A rare marble is a mesh of its own. Everything else is an instance in the pool, found by `handle`. */
  mesh?: THREE.Mesh
}

/** Where the view reports things for the overlay to show, such as coins earned at a place on the line. */
export interface LineFx {
  pop(at: THREE.Vector3, text: string, tone: 'coin' | 'tip' | 'rare' | 'gift'): void
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
/** A rare marble is a little bigger than the others and turns as it rides, so its pattern shows. */
const RARE_SCALE = 1.25
const RARE_TURN = 1.4
const RARE_PICK_BIAS = 0.5
const RARE_AXIS = new THREE.Vector3(0.35, 1, 0.2).normalize()
const GOLD = new THREE.Color(0xffc24a)
/**
 * The lucky marble floats above the front edge of the belt and drifts against the flow, so it stands out.
 * It keeps to the stretch between the stations, plus `beyond` at each end: every screen shape shows that much.
 */
const LUCKY = { scale: 1.6, y: 1.15, z: 0.75, bob: 0.22, beyond: 1.2, turn: 2.4, pickPx: 46, trailEvery: 0.07 }
const GIFT_WORDS: Record<LuckyGift, string> = { coins: '', frenzy: 'Frenzy!', shower: 'Rare shower!', order: 'Order done!', upgrade: 'Free upgrade!' }

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
  private readonly shelf: (JarVisual | null)[] = new Array(SHELF_PLACES).fill(null)
  private orientation: Orientation = 'wide'
  private readonly projected = new THREE.Vector3()
  private readonly sparks: Sparks
  private readonly fx: LineFx
  private readonly turn = new THREE.Quaternion()
  private readonly lucky: THREE.Mesh
  private readonly luckyHalo: THREE.Sprite
  private luckyTrail = 0
  private travelled = 0
  private clock = 0

  constructor(
    scene: THREE.Scene,
    camera: THREE.Camera,
    models: Models,
    set: LineSet,
    config: SimConfig,
    audio: LineAudio,
    fx: LineFx = { pop() {} },
  ) {
    this.scene = scene
    this.camera = camera
    this.models = models
    this.set = set
    this.config = config
    this.audio = audio
    this.fx = fx
    this.pool = new ItemPool(scene, models, POOL_CAPACITY)
    this.sparks = new Sparks(600, models.glowMap)
    this.lucky = new THREE.Mesh(
      models.rareGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffc24a, emissive: 0xff9a1a, emissiveIntensity: 0.7, metalness: 0.7, roughness: 0.22 }),
    )
    this.luckyHalo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: models.glowMap, color: GOLD.clone().multiplyScalar(1.1), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
    )
    this.luckyHalo.scale.setScalar(2.2)
    this.lucky.add(this.luckyHalo)
    this.lucky.userData.lucky = true
    this.lucky.visible = false
    scene.add(set.group, this.sparks.points, this.lucky)

    this.stationJars = config.stations.map((station) => this.makeJar(station.colour, this.stationBase(station.x), 1))
    // A line that resumes with hundreds of jars shows the newest ones, one per shelf place.
    for (let i = Math.max(0, config.startShelved - SHELF_PLACES); i < config.startShelved; i++) this.addStartingShelfJar(i)
    config.stations.forEach((_, station) => set.setLed(station, true))
  }

  handle(events: SimEvent[]): void {
    for (const event of events) {
      if (event.type === 'spawned') this.onSpawned(event.item)
      else if (event.type === 'sorted') this.onSorted(event.item, event.station, event.slot, event.byHand, event.coins, event.chain)
      else if (event.type === 'jarFull') this.onJarFull(event.station, event.shelfIndex, event.coins)
      else if (event.type === 'jarReady') this.onJarReady(event.station)
      else if (event.type === 'caught') this.onCaught(event.item, event.rare, event.byHand, event.coins)
      else if (event.type === 'recycled') this.onRecycled(event.item)
      else if (event.type === 'luckyCaught') this.onLuckyCaught(event.gift, event.coins)
    }
  }

  update(state: SimState, dt: number): void {
    const speed = beltSpeed(state)
    this.travelled += speed * dt
    this.clock += dt
    this.set.scrollBelt(this.travelled)
    this.tweens.update(dt)
    this.sparks.update(dt)
    this.turn.setFromAxisAngle(RARE_AXIS, RARE_TURN * dt)
    for (const item of state.items) {
      const visual = this.belt.get(item.id) ?? this.addBeltVisual(item, 0)
      // The simulation moves in whole steps. Add the time carried between steps, so items glide with the belt.
      const x = item.x + speed * state.acc
      visual.pos.set(x, REST_Y[visual.family] * visual.scale + visual.drop, visual.lane)
      if (visual.mesh) {
        visual.quat.premultiply(this.turn)
        const halo = visual.mesh.children[0] as THREE.Sprite | undefined
        if (halo) halo.material.opacity = 0.5 + 0.25 * Math.sin(this.clock * 4 + item.id)
      }
      this.write(visual)
    }
    this.updateLucky(state, dt)
  }

  /** The lucky marble is on show exactly while the simulation says one is there. */
  private updateLucky(state: SimState, dt: number): void {
    const left = state.luckyLeft
    if (!(left > 0)) {
      this.lucky.visible = false
      return
    }
    const total = this.config.luckySeconds
    const along = 1 - left / total
    const stations = this.config.stations
    const from = stations[stations.length - 1].x + LUCKY.beyond
    const to = stations[0].x - LUCKY.beyond
    this.lucky.visible = true
    this.lucky.position.set(from + (to - from) * along, LUCKY.y + Math.sin(this.clock * 2.1) * LUCKY.bob, LUCKY.z)
    // It swells in when it comes and shrinks away when its time is up.
    const coming = Math.min(1, (total - left) / 0.5)
    const going = Math.min(1, left / 0.5)
    this.lucky.scale.setScalar(Math.max(0.001, LUCKY.scale * ease.outBack(coming) * going))
    this.lucky.rotation.y += LUCKY.turn * dt
    this.luckyHalo.material.opacity = 0.55 + 0.25 * Math.sin(this.clock * 6)
    this.luckyTrail += dt
    if (this.luckyTrail >= LUCKY.trailEvery) {
      this.luckyTrail = 0
      this.sparks.burst(this.lucky.position, GOLD, 1, 0.5, 2.6)
    }
  }

  /** Whether a screen point is on the lucky marble. */
  luckyAt(clientX: number, clientY: number, canvas: HTMLCanvasElement): boolean {
    if (!this.lucky.visible) return false
    const rect = canvas.getBoundingClientRect()
    this.projected.copy(this.lucky.position).project(this.camera)
    const x = rect.left + (this.projected.x * 0.5 + 0.5) * rect.width
    const y = rect.top + (-this.projected.y * 0.5 + 0.5) * rect.height
    return Math.hypot(x - clientX, y - clientY) < LUCKY.pickPx
  }

  /** Rearranges the shelf for a wide screen or an upright phone. */
  setOrientation(orientation: Orientation): void {
    if (orientation === this.orientation) return
    this.orientation = orientation
    this.set.setShelf(orientation)
    this.shelf.forEach((jar, index) => {
      if (jar) this.moveToShelf(jar, index)
    })
  }

  /** Puts jars on the shelf places left empty after many were filled out of sight. `shelved` is the new total. */
  restock(shelved: number): void {
    for (let i = Math.max(0, shelved - SHELF_PLACES); i < shelved; i++) {
      if (!this.shelf[i % this.shelf.length]) this.addStartingShelfJar(i)
    }
  }

  /**
   * The id of the belt item nearest to a screen point, or null if none is close enough.
   * A rare marble counts as nearer than it is: a click meant for it should not sort its neighbour.
   */
  itemAt(clientX: number, clientY: number, canvas: HTMLCanvasElement): number | null {
    const rect = canvas.getBoundingClientRect()
    let best: number | null = null
    let bestDistance = PICK_RADIUS_PX
    for (const [id, visual] of this.belt) {
      this.projected.copy(visual.pos).project(this.camera)
      const x = rect.left + (this.projected.x * 0.5 + 0.5) * rect.width
      const y = rect.top + (-this.projected.y * 0.5 + 0.5) * rect.height
      const reach = Math.hypot(x - clientX, y - clientY)
      const distance = visual.mesh && reach < PICK_RADIUS_PX ? reach * RARE_PICK_BIAS : reach
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
    if (!visual.mesh) {
      this.pool.set(visual.family, visual.handle, visual.pos, visual.quat, visual.scale)
      return
    }
    visual.mesh.position.copy(visual.pos)
    visual.mesh.quaternion.copy(visual.quat)
    visual.mesh.scale.setScalar(visual.scale)
  }

  /** Takes a visual off show for good. */
  private release(visual: Visual): void {
    if (!visual.mesh) {
      this.pool.release(visual.family, visual.handle)
      return
    }
    this.scene.remove(visual.mesh)
    for (const child of visual.mesh.children) (child as THREE.Sprite).material.dispose()
  }

  private makeRareMesh(rare: RareId): THREE.Mesh {
    const mesh = new THREE.Mesh(this.models.rareGeometry, this.models.rareMaterial[rare])
    mesh.castShadow = true
    mesh.userData.rare = rare
    const kind = RARES.find((r) => r.id === rare)!
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.models.glowMap,
        color: new THREE.Color(kind.palette[1]).multiplyScalar(1.2 + kind.tier * 0.5),
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      }),
    )
    halo.scale.setScalar(1.3 + kind.tier * 0.35)
    mesh.add(halo)
    this.scene.add(mesh)
    return mesh
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

  /** Puts a jar at its shelf place for the current screen shape. */
  private moveToShelf(jar: JarVisual, index: number): void {
    const place = shelfSlot(index, this.orientation)
    jar.pos.set(place.x, place.y, place.z)
    jar.scale = place.scale
    this.placeJar(jar)
  }

  /** Shrinks away the jar at a shelf place, making room before the next one lands. */
  private clearShelfPlace(index: number): void {
    const old = this.shelf[index]
    if (!old) return
    this.shelf[index] = null
    const size = old.scale
    this.tweens.add(0.25, (k) => {
      old.scale = Math.max(0.001, size * (1 - ease.in(k)))
      this.placeJar(old)
    }, { done: () => this.removeJar(old) })
  }

  private removeJar(jar: JarVisual): void {
    this.scene.remove(jar.glass, jar.lid)
    for (const { visual } of jar.items) this.pool.release(visual.family, visual.handle)
  }

  private addStartingShelfJar(index: number): void {
    const colour = this.config.stations[index % this.config.stations.length].colour
    const place = index % this.shelf.length
    const jar = this.makeJar(colour, new THREE.Vector3(), 1)
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
    this.moveToShelf(jar, place)
    this.shelf[place] = jar
  }

  private addBeltVisual(item: BeltItem, drop: number): BeltVisual {
    const scale = item.rare ? RARE_SCALE : 1
    const visual: BeltVisual = {
      family: item.family,
      handle: item.rare ? -1 : this.pool.alloc(item.family, item.colour),
      pos: new THREE.Vector3(item.x, REST_Y[item.family] * scale + drop, 0),
      quat: restQuaternion(item.family, item.id),
      scale,
      lane: (noise(item.id, 8) - 0.5) * 0.5,
      drop,
    }
    if (item.rare) {
      visual.mesh = this.makeRareMesh(item.rare)
      this.write(visual)
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

  private onSorted(item: BeltItem, station: number, slot: number, byHand: boolean, coins: number, chain: number): void {
    const visual = this.belt.get(item.id)
    const jar = this.stationJars[station]
    if (!visual) return
    this.belt.delete(item.id)
    if (!jar) {
      this.release(visual)
      return
    }
    if (coins > 0) this.fx.pop(visual.pos, `+${compact(coins)}`, 'tip')

    const place = jarSlot(slot)
    const local = new THREE.Vector3(place.x, place.y, place.z)
    const from = visual.pos.clone()
    const to = local.clone().add(jar.pos)
    const fromQuat = visual.quat.clone()
    const toQuat = jarQuaternion(visual.family, item.id)
    const arc = byHand ? 1.3 : 0.55

    if (byHand) {
      if (!this.silent) this.audio.bonus(chain)
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

  private onJarFull(station: number, shelfIndex: number, coins: number): void {
    const jar = this.stationJars[station]
    if (!jar) return
    this.stationJars[station] = null
    this.set.setLed(station, false)
    const colour = new THREE.Color(COLOUR_HEX[this.config.stations[station].colour])
    const index = shelfIndex % this.shelf.length
    const to = new THREE.Vector3()

    // Wait for the last item to land, drop the lid, then carry the jar to the shelf.
    jar.lid.visible = true
    this.tweens.add(0.2, (k) => {
      jar.lidLift = LID_START * (1 - ease.in(k))
      this.placeJar(jar)
    }, {
      delay: 0.46,
      done: () => {
        if (!this.silent) {
          this.audio.tock()
          this.audio.jar(station)
        }
        const rim = jar.pos.clone().setY(jar.pos.y + JAR.height)
        if (coins > 0) this.fx.pop(rim, `+${compact(coins)}`, 'coin')
        this.sparks.burst(rim, GOLD, 16, 1.9, 2.4)
        this.sparks.burst(rim, colour, 12, 1.5, 2.4)
        const from = jar.pos.clone()
        this.clearShelfPlace(index)
        this.tweens.add(0.7, (k) => {
          // Read the shelf place every frame, so a jar in flight follows a change of screen shape.
          const place = shelfSlot(index, this.orientation)
          const e = ease.inOut(k)
          jar.pos.lerpVectors(from, to.set(place.x, place.y, place.z), e)
          jar.pos.y += Math.sin(Math.PI * k) * 1.8
          jar.scale = 1 + (place.scale - 1) * e
          this.placeJar(jar)
        }, {
          delay: 0.16,
          done: () => {
            const old = this.shelf[index]
            if (old) this.removeJar(old)
            this.shelf[index] = jar
            this.moveToShelf(jar, index)
          },
        })
      },
    })
  }

  private onJarReady(station: number): void {
    const { x, colour } = this.config.stations[station]
    const jar = this.makeJar(colour, this.stationBase(x), 0.001)
    this.stationJars[station] = jar
    this.set.setLed(station, true)
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
    const size = visual.scale
    this.tweens.add(0.5, (k) => {
      visual.pos.lerpVectors(from, this.set.bin, ease.in(k))
      visual.pos.y += Math.sin(Math.PI * k) * 0.35
      visual.scale = size * (1 - 0.5 * k)
      this.write(visual)
    }, { done: () => this.release(visual) })
  }

  /** The lucky marble bursts where it was, and says what it gave. */
  private onLuckyCaught(gift: LuckyGift, coins: number): void {
    const at = this.lucky.position.clone()
    this.sparks.burst(at, GOLD, 46, 3.6, 5)
    this.sparks.burst(at, new THREE.Color(0xffffff), 18, 2.2, 4)
    if (gift === 'coins') this.fx.pop(at, `+${compact(coins)}`, 'rare')
    else this.fx.pop(at, GIFT_WORDS[gift], 'gift')
  }

  /** A caught rare marble lifts off the belt toward the viewer, flares and is gone. */
  private onCaught(item: BeltItem, rare: RareId, byHand: boolean, coins: number): void {
    const visual = this.belt.get(item.id)
    if (!visual) return
    this.belt.delete(item.id)
    const kind = RARES.find((r) => r.id === rare)!
    const glow = new THREE.Color(kind.palette[1])
    const from = visual.pos.clone()
    const to = from.clone().add(new THREE.Vector3(0, byHand ? 1.7 : 1.1, 0.9))
    const size = visual.scale
    this.fx.pop(from, `+${compact(coins)}`, 'rare')
    this.sparks.burst(from, glow, 26, 2.6, 4)
    this.sparks.burst(from, GOLD, 14, 1.8, 3)
    if (!this.silent) this.audio.rare(kind.tier)

    this.tweens.add(0.75, (k) => {
      visual.pos.lerpVectors(from, to, ease.out(k))
      visual.scale = size * (1 + 1.1 * ease.outBack(k))
      this.turn.setFromAxisAngle(UP, 0.35 * (1 - k))
      visual.quat.premultiply(this.turn)
      this.write(visual)
    }, {
      done: () => {
        this.sparks.burst(to, glow, 34, 3.4, 5)
        const full = visual.scale
        this.tweens.add(0.22, (k) => {
          visual.scale = Math.max(0.001, full * (1 - ease.in(k)))
          this.write(visual)
        }, { done: () => this.release(visual) })
      },
    })
  }
}
