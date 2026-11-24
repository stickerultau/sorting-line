import type { RareKind, RarePattern } from '../content/content'

// The patterns inside the glass, painted in code. Each wraps round the marble without a seam.

type Painter = (g: CanvasRenderingContext2D, w: number, h: number, a: string, b: string, random: () => number) => void

function seeded(text: string): () => number {
  let seed = 7
  for (const char of text) seed = (seed * 31 + char.charCodeAt(0)) % 2147483647
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647
}

/** A wavy line right round the marble. A whole number of waves keeps the two ends joined. */
function ribbon(g: CanvasRenderingContext2D, w: number, y: number, swing: number, waves: number, phase: number, thickness: number, colour: string): void {
  g.strokeStyle = colour
  g.lineWidth = thickness
  g.lineCap = 'round'
  g.beginPath()
  for (let x = -8; x <= w + 8; x += 4) g.lineTo(x, y + Math.sin((x / w) * Math.PI * 2 * waves + phase) * swing)
  g.stroke()
}

/** Draws something three times, one marble-width apart, so it carries over the seam. */
function wrapped(w: number, draw: (shift: number) => void): void {
  for (const shift of [-w, 0, w]) draw(shift)
}

const PAINT: Record<RarePattern, Painter> = {
  swirl(g, w, h, a, b, random) {
    const unit = w / 512
    for (let i = 0; i < 8; i++) {
      const waves = 1 + Math.floor(random() * 2)
      ribbon(g, w, h * (0.12 + random() * 0.76), h * (0.1 + random() * 0.2), waves, random() * 6.28, (5 + random() * 24) * unit, i % 2 ? a : b)
    }
    g.globalAlpha = 0.55
    for (let i = 0; i < 4; i++) ribbon(g, w, h * random(), h * 0.16, 1, random() * 6.28, 2 * unit, '#ffffff')
    g.globalAlpha = 1
  },
  vane(g, w, h, a, b) {
    for (let i = 0; i < 4; i++) {
      const x = ((i + 0.5) / 4) * w
      g.fillStyle = a
      g.beginPath()
      g.ellipse(x, h / 2, w * 0.05, h * 0.42, 0, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = b
      g.beginPath()
      g.ellipse(x, h / 2, w * 0.018, h * 0.34, 0, 0, Math.PI * 2)
      g.fill()
    }
  },
  bands(g, w, h, a, b, random) {
    const unit = w / 512
    for (let i = 0; i < 11; i++) {
      ribbon(g, w, h * (0.08 + random() * 0.84), h * 0.025, 1 + Math.floor(random() * 3), random() * 6.28, (2 + random() * 13) * unit, i % 3 ? a : b)
    }
  },
  streak(g, w, h, a, b, random) {
    for (let i = 0; i < 46; i++) {
      const x = random() * w
      const width = (2 + random() * 6) * (w / 512)
      g.fillStyle = i % 2 ? a : b
      g.globalAlpha = 0.6 + random() * 0.4
      wrapped(w, (shift) => g.fillRect(x + shift, h * 0.07, width, h * 0.86))
    }
    g.globalAlpha = 1
  },
  speckle(g, w, h, a, b, random) {
    for (let i = 0; i < 620; i++) {
      const x = random() * w
      const y = random() * h
      const r = (0.5 + random() * random() * 3.2) * (w / 512)
      g.fillStyle = i % 4 ? a : b
      wrapped(w, (shift) => {
        g.beginPath()
        g.arc(x + shift, y, r, 0, Math.PI * 2)
        g.fill()
      })
    }
  },
  nebula(g, w, h, a, b, random) {
    g.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 16; i++) {
      const x = random() * w
      const y = h * (0.1 + random() * 0.8)
      const r = w * (0.08 + random() * 0.16)
      wrapped(w, (shift) => {
        const glow = g.createRadialGradient(x + shift, y, 0, x + shift, y, r)
        glow.addColorStop(0, i % 2 ? a : b)
        glow.addColorStop(1, 'rgba(0,0,0,0)')
        g.globalAlpha = 0.55
        g.fillStyle = glow
        g.fillRect(x + shift - r, y - r, r * 2, r * 2)
      })
    }
    g.globalAlpha = 0.9
    g.fillStyle = '#ffffff'
    for (let i = 0; i < 130; i++) {
      g.beginPath()
      g.arc(random() * w, random() * h, (0.4 + random() * 1.1) * (w / 512), 0, Math.PI * 2)
      g.fill()
    }
    g.globalAlpha = 1
    g.globalCompositeOperation = 'source-over'
  },
}

/** The surface of a rare marble, twice as wide as it is tall, ready to wrap round a sphere. */
export function paintMarble(kind: RareKind, width = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = width / 2
  const g = canvas.getContext('2d')!
  g.fillStyle = kind.palette[0]
  g.fillRect(0, 0, canvas.width, canvas.height)
  PAINT[kind.pattern](g, canvas.width, canvas.height, kind.palette[1], kind.palette[2], seeded(kind.id))
  return canvas
}

/** Grey swirls for the ordinary marbles. The marble's own colour is multiplied over it. */
export function paintPlainMarble(width = 256): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = width / 2
  const g = canvas.getContext('2d')!
  const random = seeded('plain')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < 5; i++) {
    ribbon(g, width, canvas.height * (0.15 + random() * 0.7), canvas.height * 0.2, 1, random() * 6.28, 4 + random() * 12, `rgba(0,0,0,${0.16 + random() * 0.2})`)
  }
  return canvas
}

/** A soft round glow that fades to nothing at the edge. */
export function paintGlow(size = 64): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const glow = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = glow
  g.fillRect(0, 0, size, size)
  return canvas
}

/** The shape of the window the sunlight comes through: three tall panes with a row of small ones above. */
export function paintWindow(size = 512): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  g.fillStyle = '#1c1c1c' // a little light still bounces round the room outside the window's patch
  g.fillRect(0, 0, size, size)
  g.filter = `blur(${size / 150}px)`
  g.fillStyle = '#ffffff'
  const left = size * 0.11
  const paneWidth = size * 0.245
  const gap = size * 0.022
  for (let column = 0; column < 3; column++) {
    const x = left + column * (paneWidth + gap)
    g.fillRect(x, size * 0.22, paneWidth, size * 0.1)
    g.fillRect(x, size * 0.34, paneWidth, size * 0.42)
  }
  return canvas
}
