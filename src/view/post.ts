import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'

const QUAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

/**
 * Depth of field from the depth the scene render already wrote, so the scene is not drawn twice.
 * Everything within `range` of the focus distance stays sharp; the blur grows beyond that.
 */
class FocusPass extends Pass {
  readonly uniforms = {
    tDiffuse: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.Texture | null },
    near: { value: 1 },
    far: { value: 300 },
    focus: { value: 30 },
    range: { value: 1.8 },
    strength: { value: 0.0011 },
    maxBlur: { value: 0.0065 },
    aspect: { value: 1 },
  }
  private readonly quad: FullScreenQuad

  constructor() {
    super()
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: QUAD_VERTEX,
        fragmentShader: /* glsl */ `
          #include <packing>
          uniform sampler2D tDiffuse;
          uniform sampler2D tDepth;
          uniform float near, far, focus, range, strength, maxBlur, aspect;
          varying vec2 vUv;

          float blurAt(vec2 uv) {
            float distance = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
            return clamp((abs(distance - focus) - range) * strength, 0.0, maxBlur);
          }

          void main() {
            float blur = blurAt(vUv);
            vec4 sum = texture2D(tDiffuse, vUv);
            if (blur < 0.0003) { gl_FragColor = sum; return; }
            float total = 1.0;
            for (int i = 0; i < 22; i++) {
              float radius = sqrt((float(i) + 0.5) / 22.0) * blur;
              float angle = float(i) * 2.39996;
              vec2 uv = vUv + vec2(cos(angle) / aspect, sin(angle)) * radius;
              // Sharp neighbours count for less, so in-focus edges do not smear into the blur.
              float weight = 0.15 + 0.85 * smoothstep(0.0, blur, blurAt(uv) + blur * 0.3);
              sum += texture2D(tDiffuse, uv) * weight;
              total += weight;
            }
            gl_FragColor = sum / total;
          }
        `,
      }),
    )
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget): void {
    this.uniforms.tDiffuse.value = readBuffer.texture
    this.uniforms.tDepth.value = readBuffer.depthTexture
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer)
    this.quad.render(renderer)
  }

  setSize(width: number, height: number): void {
    this.uniforms.aspect.value = width / height
  }

  dispose(): void {
    this.quad.dispose()
  }
}

/** The finishing pass: a hint of colour fringing toward the corners, a vignette and fine grain. */
const FinishShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0 },
    vignette: { value: 0.42 },
    fringe: { value: 0.012 },
    grain: { value: 0.045 },
  },
  vertexShader: QUAD_VERTEX,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time, vignette, fringe, grain;
    varying vec2 vUv;
    void main() {
      vec2 fromCentre = vUv - 0.5;
      float r2 = dot(fromCentre, fromCentre);
      vec2 shift = fromCentre * r2 * fringe;
      vec3 colour = vec3(
        texture2D(tDiffuse, vUv + shift).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - shift).b
      );
      colour *= mix(1.0 - vignette, 1.0, smoothstep(0.82, 0.28, sqrt(r2)));
      float noise = fract(sin(dot(gl_FragCoord.xy + fract(time) * 61.0, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
      colour += colour * noise * grain;
      gl_FragColor = vec4(colour, 1.0);
    }
  `,
}

export interface Post {
  render(dt: number): void
  setSize(width: number, height: number): void
  setPixelRatio(ratio: number): void
  /** Distance from the camera that stays sharp. */
  setFocus(distance: number): void
  /** Turns the depth blur on or off. */
  setDepthBlur(on: boolean): void
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): Post {
  const size = renderer.getSize(new THREE.Vector2())
  const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 })
  target.depthTexture = new THREE.DepthTexture(size.x, size.y)
  const composer = new EffectComposer(renderer, target)

  const focus = new FocusPass()
  focus.uniforms.near.value = camera.near
  focus.uniforms.far.value = camera.far
  // Only light brighter than white glows: glints on glass, the lamp strip, the lamps on the rail, sparks.
  const bloom = new UnrealBloomPass(size.clone(), 0.3, 0.55, 2.4)
  const finish = new ShaderPass(FinishShader)

  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(focus)
  composer.addPass(bloom)
  composer.addPass(finish)
  composer.addPass(new OutputPass())

  let time = 0
  return {
    render(dt) {
      time += dt
      finish.uniforms.time.value = time
      composer.render(dt)
    },
    setSize: (width, height) => composer.setSize(width, height),
    setPixelRatio: (ratio) => composer.setPixelRatio(ratio),
    setFocus(distance) {
      focus.uniforms.focus.value = distance
    },
    setDepthBlur(on) {
      focus.enabled = on
    },
  }
}
