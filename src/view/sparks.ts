import * as THREE from 'three'

const GRAVITY = -2.2
const DRAG = 1.6
const PARKED_Y = -1000

/** A fixed pool of glowing specks for catches and full jars. Dead ones are parked out of sight. */
export class Sparks {
  readonly points: THREE.Points
  private readonly position: THREE.BufferAttribute
  private readonly colour: THREE.BufferAttribute
  private readonly velocity: Float32Array
  private readonly tint: Float32Array
  private readonly life: Float32Array
  private readonly span: Float32Array
  private next = 0

  constructor(capacity: number, map: THREE.Texture | null) {
    this.position = new THREE.BufferAttribute(new Float32Array(capacity * 3).fill(PARKED_Y), 3)
    this.colour = new THREE.BufferAttribute(new Float32Array(capacity * 3), 3)
    this.velocity = new Float32Array(capacity * 3)
    this.tint = new Float32Array(capacity * 3)
    this.life = new Float32Array(capacity)
    this.span = new Float32Array(capacity)
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', this.position)
    geometry.setAttribute('color', this.colour)
    this.points = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({ size: 0.2, map, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    )
    this.points.frustumCulled = false
  }

  /** Throws `count` specks outward from a point. `brightness` above 1 makes them bloom. */
  burst(at: THREE.Vector3, colour: THREE.Color, count: number, speed: number, brightness = 3): void {
    const capacity = this.life.length
    for (let n = 0; n < count; n++) {
      const i = this.next
      this.next = (this.next + 1) % capacity
      // Even spread over a sphere, biased upward.
      const turn = Math.random() * Math.PI * 2
      const lift = Math.random() * 1.6 - 0.6
      const flat = Math.sqrt(Math.max(0, 1 - Math.min(1, lift * lift)))
      const push = speed * (0.35 + Math.random() * 0.65)
      this.velocity.set([Math.cos(turn) * flat * push, lift * push, Math.sin(turn) * flat * push], i * 3)
      this.position.setXYZ(i, at.x, at.y, at.z)
      this.tint.set([colour.r * brightness, colour.g * brightness, colour.b * brightness], i * 3)
      this.span[i] = this.life[i] = 0.45 + Math.random() * 0.55
    }
  }

  update(dt: number): void {
    const p = this.position.array as Float32Array
    const c = this.colour.array as Float32Array
    const slow = Math.exp(-DRAG * dt)
    for (let i = 0; i < this.life.length; i++) {
      if (this.life[i] <= 0) continue
      this.life[i] -= dt
      const at = i * 3
      if (this.life[i] <= 0) {
        p[at + 1] = PARKED_Y
        c[at] = c[at + 1] = c[at + 2] = 0
        continue
      }
      this.velocity[at] *= slow
      this.velocity[at + 1] = this.velocity[at + 1] * slow + GRAVITY * dt
      this.velocity[at + 2] *= slow
      p[at] += this.velocity[at] * dt
      p[at + 1] += this.velocity[at + 1] * dt
      p[at + 2] += this.velocity[at + 2] * dt
      const fade = (this.life[i] / this.span[i]) ** 1.5
      c[at] = this.tint[at] * fade
      c[at + 1] = this.tint[at + 1] * fade
      c[at + 2] = this.tint[at + 2] * fade
    }
    this.position.needsUpdate = true
    this.colour.needsUpdate = true
  }
}
