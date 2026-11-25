import * as THREE from 'three'
import { COLOUR_HEX, FAMILIES, type ColourId, type FamilyId } from '../content/content'
import type { Models } from './models'

const PARKED = new THREE.Matrix4().compose(
  new THREE.Vector3(0, -1000, 0),
  new THREE.Quaternion(),
  new THREE.Vector3(1e-4, 1e-4, 1e-4),
)

/**
 * Draws every item of one family in a single call. Handles are reused, lowest first, and only the handles up to
 * the highest one in use are drawn: the light's shadow pass and the glass pass draw them again, so an idle
 * place in the pool is not free. A freed handle below that is parked out of sight until it is taken again.
 */
export class ItemPool {
  private meshes: Record<FamilyId, THREE.InstancedMesh>
  private used: Record<FamilyId, Uint8Array>
  /** No handle below this is free. */
  private searchFrom: Record<FamilyId, number>
  private matrix = new THREE.Matrix4()
  private scale = new THREE.Vector3()
  private colour = new THREE.Color()

  constructor(scene: THREE.Object3D, models: Models, capacity: number) {
    const make = (family: FamilyId) => {
      const mesh = new THREE.InstancedMesh(models.itemGeometry[family], models.itemMaterial[family], capacity)
      for (let i = 0; i < capacity; i++) {
        mesh.setMatrixAt(i, PARKED)
        mesh.setColorAt(i, this.colour.set(0xffffff))
      }
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false // instances are spread along the whole line
      mesh.count = 0
      scene.add(mesh)
      return mesh
    }
    const each = <T>(value: (family: FamilyId) => T) => Object.fromEntries(FAMILIES.map((family) => [family, value(family)])) as Record<FamilyId, T>
    this.meshes = each(make)
    this.used = each(() => new Uint8Array(capacity))
    this.searchFrom = each(() => 0)
  }

  /** Frees what the pool holds on the graphics card. The pool cannot be used afterwards. */
  dispose(): void {
    for (const mesh of Object.values(this.meshes)) {
      mesh.removeFromParent()
      mesh.dispose()
    }
  }

  alloc(family: FamilyId, colour: ColourId): number {
    const used = this.used[family]
    let handle = this.searchFrom[family]
    while (handle < used.length && used[handle]) handle++
    if (handle >= used.length) throw new Error(`Item pool for ${family} is full`)
    used[handle] = 1
    this.searchFrom[family] = handle + 1
    const mesh = this.meshes[family]
    if (handle >= mesh.count) mesh.count = handle + 1
    mesh.setColorAt(handle, this.colour.set(COLOUR_HEX[colour]))
    mesh.instanceColor!.needsUpdate = true
    return handle
  }

  release(family: FamilyId, handle: number): void {
    const used = this.used[family]
    const mesh = this.meshes[family]
    used[handle] = 0
    if (handle < this.searchFrom[family]) this.searchFrom[family] = handle
    mesh.setMatrixAt(handle, PARKED)
    mesh.instanceMatrix.needsUpdate = true
    while (mesh.count > 0 && !used[mesh.count - 1]) mesh.count--
  }

  set(family: FamilyId, handle: number, position: THREE.Vector3, quaternion: THREE.Quaternion, scale: number): void {
    const mesh = this.meshes[family]
    mesh.setMatrixAt(handle, this.matrix.compose(position, quaternion, this.scale.setScalar(scale)))
    mesh.instanceMatrix.needsUpdate = true
  }
}
