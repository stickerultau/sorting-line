import * as THREE from 'three'
import { COLOUR_HEX, type ColourId, type FamilyId } from '../content/content'
import type { Models } from './models'

const PARKED = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -1000, 0),
  new THREE.Quaternion(),
  new THREE.Vector3(1e-4, 1e-4, 1e-4),
)

/** Draws every item of one family in a single call. Handles are reused; freed ones are parked out of sight. */
export class ItemPool {
  private meshes: Record<FamilyId, THREE.InstancedMesh>
  private free: Record<FamilyId, number[]>
  private matrix = new THREE.Matrix4()
  private scale = new THREE.Vector3()
  private colour = new THREE.Color()

  constructor(scene: THREE.Scene, models: Models, capacity: number) {
    const make = (family: FamilyId) => {
      const mesh = new THREE.InstancedMesh(models.itemGeometry[family], models.itemMaterial[family], capacity)
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, PARKED)
        mesh.setColorAt(i, this.colour.set(0xffffff))
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances are spread along the whole line
      scene.add(mesh)
      return mesh
    }
    this.meshes = { marble: make('marble'), button: make('button') }
    const handles = () => Array.from({ length: capacity }, (_, i) => capacity - 1 - i)
    this.free = { marble: handles(), button: handles() }
  }

  alloc(family: FamilyId, colour: ColourId): number {
    const handle = this.free[family].pop()
    if (handle === undefined) throw new Error(`Item pool for ${family} is full`)
    const mesh = this.meshes[family]
    mesh.setColorAt(handle, this.colour.set(COLOUR_HEX[colour]))
    mesh.instanceColor!.needsUpdate = true
    return handle
  }

  release(family: FamilyId, handle: number): void {
    const mesh = this.meshes[family]
    mesh.setMatrixAt(handle, PARKED)
    mesh.instanceMatrix.needsUpdate = true
    this.free[family].push(handle)
  }

  set(family: FamilyId, handle: number, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number): void {
    const mesh = this.meshes[family]
    mesh.setMatrixAt(handle, this.matrix.compose(position, quaternion, this.scale.setScalar(scale)))
    mesh.instanceMatrix.needsUpdate = true
  }
}
