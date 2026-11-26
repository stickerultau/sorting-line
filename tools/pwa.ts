import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import type { Plugin } from 'vite'

// What lets the game be installed as an app: an icon, a manifest and a worker that keeps the files for use offline.
// All of it is made here, by code, when the game is built. No picture file is kept in the project.

type Rgb = [number, number, number]

export const ICON_SIZES = [180, 192, 512]
const BACKGROUND = '#10141a'
/** Each pixel is the average of this many samples a side, so edges come out smooth. */
const SAMPLES = 3

const MARBLE_RADIUS = 0.12
const MARBLE_Y = 0.47
const MARBLES: { x: number; colour: Rgb }[] = [
  { x: 0.25, colour: [226, 61, 68] },
  { x: 0.5, colour: [244, 184, 31] },
  { x: 0.75, colour: [42, 120, 228] },
]
const BELT = { top: 0.6, bottom: 0.72, ribs: 13 }

const mix = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
const clamp = (value: number) => Math.min(1, Math.max(0, value))

/** The colour of the icon at a point, with both coordinates from 0 to 1: three marbles riding a belt in a dim workshop. */
function colourAt(x: number, y: number): Rgb {
  // A wall that is lit in the middle and falls away to the corners.
  let colour = mix([52, 74, 88], [16, 20, 26], clamp(Math.hypot(x - 0.5, y - 0.42) / 0.7))
  // The body of the machine under the belt, then the belt and its ribs.
  if (y >= BELT.bottom && y < BELT.bottom + 0.09) colour = mix([244, 238, 226], [186, 176, 158], (y - BELT.bottom) / 0.09)
  if (y >= BELT.top && y < BELT.bottom) {
    const rib = (x * BELT.ribs) % 1 < 0.2
    colour = y < BELT.top + 0.018 ? [84, 90, 100] : rib ? [30, 32, 36] : [52, 56, 63]
  }
  for (const marble of MARBLES) {
    const dx = x - marble.x
    const dy = y - MARBLE_Y
    // The shadow each marble throws on the belt.
    const shadow = Math.hypot(dx / 1.1, (y - BELT.top - 0.012) / 0.25) / MARBLE_RADIUS
    if (shadow < 1 && y >= BELT.top) colour = mix(colour, [0, 0, 0], 0.5 * (1 - shadow))
    const reach = Math.hypot(dx, dy) / MARBLE_RADIUS
    if (reach >= 1) continue
    // Glass lit from the upper left: bright where it faces the light, dark at the far rim, with one small highlight.
    const lit = clamp(1 - Math.hypot(dx + MARBLE_RADIUS * 0.3, dy + MARBLE_RADIUS * 0.3) / (MARBLE_RADIUS * 1.5))
    colour = mix(mix(marble.colour, [0, 0, 0], 0.55), mix(marble.colour, [255, 255, 255], 0.18), lit)
    const glint = Math.hypot(dx + MARBLE_RADIUS * 0.38, dy + MARBLE_RADIUS * 0.42) / (MARBLE_RADIUS * 0.3)
    if (glint < 1) colour = mix(colour, [255, 255, 255], 0.85 * (1 - glint * glint))
  }
  return colour
}

/** The icon at one size, as red, green, blue and alpha for every pixel. It fills the square, so it can be cut to any shape. */
export function drawIcon(size: number): Uint8Array {
  const rgba = new Uint8Array(size * size * 4)
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const sum: Rgb = [0, 0, 0]
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const sample = colourAt((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size)
          for (let channel = 0; channel < 3; channel++) sum[channel] += sample[channel]
        }
      }
      const at = (py * size + px) * 4
      for (let channel = 0; channel < 3; channel++) rgba[at + channel] = Math.round(sum[channel] / SAMPLES ** 2)
      rgba[at + 3] = 255
    }
  }
  return rgba
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** Writes a square picture as a PNG file. */
export function encodePng(rgba: Uint8Array, size: number): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header.set([8, 6, 0, 0, 0], 8) // eight bits a channel, with alpha
  // Every row starts with a byte that says it is stored as it is.
  const rows = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) rows.set(rgba.subarray(y * size * 4, (y + 1) * size * 4), y * (size * 4 + 1) + 1)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const iconName = (size: number) => `icon-${size}.png`

export function manifest() {
  const icon = (size: number, purpose: 'any' | 'maskable') => ({ src: iconName(size), sizes: `${size}x${size}`, type: 'image/png', purpose })
  return {
    name: 'Sorting Line',
    short_name: 'Sorting Line',
    description: 'A sorting line that fills jars while you watch, help or look away.',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: BACKGROUND,
    theme_color: BACKGROUND,
    icons: [icon(192, 'any'), icon(512, 'any'), icon(512, 'maskable')],
  }
}

/**
 * The worker that lets the installed game open with no network. It keeps every file of one build under one name.
 * The page itself is fetched fresh whenever there is a network, so a new build is picked up on the next visit.
 */
export function workerSource(files: string[], version: string): string {
  return `const CACHE = 'sorting-line-${version}'
const FILES = ${JSON.stringify(files)}
// The kept files are the same for every request. Without this, a host that answers "Vary: Origin"
// makes the page's own script and style miss their kept copies, and the game opens blank with no network.
const KEPT = { cacheName: CACHE, ignoreVary: true }

self.addEventListener('install', (event) => {
  // Each file is fetched afresh: a copy of the page the browser kept from before this build names files that are gone.
  const fresh = FILES.map((file) => new Request(file, { cache: 'reload' }))
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('sorting-line-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./', KEPT).then((page) => page || Response.error())))
    return
  }
  event.respondWith(caches.match(request, KEPT).then((kept) => kept || fetch(request)))
})
`
}

/** The Vite plugin: serves the icon and manifest while developing, and adds them and the worker to a build. */
export function pwa(): Plugin {
  let made: Map<string, Buffer | string> | null = null
  const files = () =>
    (made ??= new Map<string, Buffer | string>([
      ...ICON_SIZES.map((size) => [iconName(size), encodePng(drawIcon(size), size)] as [string, Buffer]),
      ['manifest.webmanifest', JSON.stringify(manifest(), null, 2)],
    ]))
  const types: Record<string, string> = { png: 'image/png', webmanifest: 'application/manifest+json' }
  return {
    name: 'sorting-line-pwa',
    enforce: 'post',
    transformIndexHtml: () => [
      { tag: 'link', attrs: { rel: 'manifest', href: 'manifest.webmanifest' }, injectTo: 'head' },
      { tag: 'meta', attrs: { name: 'theme-color', content: BACKGROUND }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'icon', type: 'image/png', href: iconName(192) }, injectTo: 'head' },
      { tag: 'link', attrs: { rel: 'apple-touch-icon', href: iconName(180) }, injectTo: 'head' },
    ],
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = (request.url ?? '').split('?')[0].replace(/^\//, '')
        const file = files().get(name)
        if (file === undefined) return next()
        response.setHeader('Content-Type', types[name.split('.').pop() ?? ''] ?? 'application/octet-stream')
        response.end(file)
      })
    },
    generateBundle(_, bundle) {
      for (const [fileName, source] of files()) this.emitFile({ type: 'asset', fileName, source })
      const names = [...new Set([...Object.keys(bundle), ...files().keys()])].filter((name) => name !== 'sw.js').sort()
      // The name of the kept copy changes whenever any file of the build does.
      const hash = createHash('sha256')
      for (const name of names) {
        const file = bundle[name]
        hash.update(name)
        hash.update(file ? (file.type === 'chunk' ? file.code : file.source) : (files().get(name) ?? ''))
      }
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: workerSource(['./', ...names], hash.digest('hex').slice(0, 12)) })
    },
  }
}
