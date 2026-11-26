import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { ICON_SIZES, drawIcon, encodePng, manifest, workerSource } from '../tools/pwa'

describe('the app icon, drawn by code', () => {
  it('is a square picture with a dark corner and bright marbles in the middle', () => {
    const size = 64
    const rgba = drawIcon(size)
    expect(rgba).toHaveLength(size * size * 4)
    const at = (x: number, y: number) => [...rgba.slice((y * size + x) * 4, (y * size + x) * 4 + 4)]
    const corner = at(1, 1)
    expect(corner[3]).toBe(255)
    expect(corner[0] + corner[1] + corner[2]).toBeLessThan(200)
    // The middle marble is yellow: plenty of red and green, little blue.
    const [r, g, b] = at(size / 2, Math.round(size * 0.47))
    expect(r).toBeGreaterThan(180)
    expect(g).toBeGreaterThan(130)
    expect(b).toBeLessThan(120)
    // Every pixel is solid, so the icon can be cut to any shape.
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255)
  })

  it('comes out the same every time', () => {
    expect(drawIcon(48)).toEqual(drawIcon(48))
  })

  it('is written as a PNG a browser can read', () => {
    const size = 32
    const png = encodePng(drawIcon(size), size)
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
    expect(png.subarray(12, 16).toString('latin1')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(size)
    expect(png.readUInt32BE(20)).toBe(size)
    // Eight bits a channel, red green blue alpha.
    expect([png[24], png[25]]).toEqual([8, 6])
    const dataAt = png.indexOf('IDAT', 0, 'latin1')
    const length = png.readUInt32BE(dataAt - 4)
    // One filter byte in front of every row.
    expect(inflateSync(png.subarray(dataAt + 4, dataAt + 4 + length))).toHaveLength(size * (size * 4 + 1))
    expect(png.subarray(png.length - 8, png.length - 4).toString('latin1')).toBe('IEND')
  })
})

describe('installing the game', () => {
  it('the manifest opens the game on its own, from wherever it is hosted', () => {
    const data = manifest()
    expect(data.display).toBe('standalone')
    expect(data.start_url).toBe('./')
    expect(data.scope).toBe('./')
    const sizes = data.icons.map((icon) => icon.sizes)
    expect(sizes).toEqual(expect.arrayContaining(['192x192', '512x512']))
    expect(data.icons.some((icon) => icon.purpose === 'maskable')).toBe(true)
    for (const icon of data.icons) expect(ICON_SIZES.map((size) => `icon-${size}.png`)).toContain(icon.src)
  })

  it('the worker keeps every file of the build, under a name that changes with the build', () => {
    const files = ['./', 'index.html', 'assets/index-abc.js', 'assets/index-def.css']
    const source = workerSource(files, 'v1')
    for (const file of files) expect(source).toContain(JSON.stringify(file))
    expect(source).toContain('sorting-line-v1')
    expect(workerSource(files, 'v2')).not.toBe(source)
    // It is a script a browser can parse.
    expect(() => new Function(source)).not.toThrow()
  })
})

/** Runs the worker against a pretend browser, and returns the handles a test needs. */
function runWorker(files: string[], version: string, oldCaches: string[] = []) {
  const origin = 'https://example.test'
  const scope = `${origin}/game/`
  const stores = new Map<string, Map<string, string>>(oldCaches.map((name) => [name, new Map()]))
  const asked: { url: string; cache?: string }[] = []
  let online = true
  const listeners: Record<string, (event: never) => void> = {}
  const url = (target: string | { url: string }) => new URL(typeof target === 'string' ? target : target.url, scope).href
  const fetchIt = async (target: string | { url: string; cache?: string }) => {
    asked.push({ url: url(target), cache: typeof target === 'string' ? undefined : target.cache })
    if (!online) throw new TypeError('offline')
    return `fresh ${url(target)}`
  }
  const caches = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map())
      const store = stores.get(name)!
      return {
        async addAll(requests: (string | { url: string; cache?: string })[]) {
          for (const request of requests) store.set(url(request), `kept ${(await fetchIt(request)).slice(6)}`)
        },
      }
    },
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    // A real browser also checks "Vary" unless told not to: a lookup without `ignoreVary` finds nothing here.
    async match(target: string | { url: string }, options: { cacheName: string; ignoreVary?: boolean }) {
      return options.ignoreVary ? stores.get(options.cacheName)?.get(url(target)) : undefined
    },
  }
  class FakeRequest {
    url: string
    cache?: string
    constructor(target: string, init: { cache?: string } = {}) {
      this.url = url(target)
      this.cache = init.cache
    }
  }
  const self = {
    location: { origin },
    addEventListener: (type: string, listener: (event: never) => void) => (listeners[type] = listener),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  new Function('self', 'caches', 'fetch', 'Request', 'Response', workerSource(files, version))(self, caches, fetchIt, FakeRequest, { error: () => 'error' })
  const fire = async (type: 'install' | 'activate') => {
    let done: Promise<unknown> = Promise.resolve()
    listeners[type]({ waitUntil: (promise: Promise<unknown>) => (done = promise) } as never)
    await done
  }
  const request = async (path: string, mode = 'no-cors', method = 'GET') => {
    let answer: Promise<unknown> | undefined
    listeners.fetch({ request: { url: url(path), mode, method }, respondWith: (promise: Promise<unknown>) => (answer = promise) } as never)
    return answer === undefined ? 'left to the browser' : await answer
  }
  return { stores, asked, fire, request, setOnline: (value: boolean) => (online = value) }
}

describe('the worker that keeps the game for use with no network', () => {
  const files = ['./', 'index.html', 'assets/index-abc.js']

  it('fetches every file afresh when it installs, so an old copy of the page never joins new files', async () => {
    const worker = runWorker(files, 'v2')
    await worker.fire('install')
    expect(worker.asked).toHaveLength(files.length)
    for (const asked of worker.asked) expect(asked.cache).toBe('reload')
    expect([...worker.stores.get('sorting-line-v2')!.keys()]).toEqual([
      'https://example.test/game/',
      'https://example.test/game/index.html',
      'https://example.test/game/assets/index-abc.js',
    ])
  })

  it('throws away the files of older builds, and nothing that is not its own', async () => {
    const worker = runWorker(files, 'v2', ['sorting-line-v1', 'someone-else'])
    await worker.fire('install')
    await worker.fire('activate')
    expect([...worker.stores.keys()].sort()).toEqual(['someone-else', 'sorting-line-v2'])
  })

  it('with a network the page is always fetched fresh; without one the kept page opens, whatever follows the question mark', async () => {
    const worker = runWorker(files, 'v2')
    await worker.fire('install')
    expect(await worker.request('./?fresh', 'navigate')).toBe('fresh https://example.test/game/?fresh')
    worker.setOnline(false)
    expect(await worker.request('./?fresh&hour=13', 'navigate')).toBe('kept https://example.test/game/')
  })

  it('the script and the style come from the kept copies, even on a host that answers "Vary: Origin"', async () => {
    const worker = runWorker(files, 'v2')
    await worker.fire('install')
    worker.setOnline(false)
    expect(await worker.request('assets/index-abc.js', 'cors')).toBe('kept https://example.test/game/assets/index-abc.js')
  })

  it('leaves alone what is not its business: other sites, and anything that is not a plain read', async () => {
    const worker = runWorker(files, 'v2')
    await worker.fire('install')
    expect(await worker.request('https://elsewhere.test/thing.js')).toBe('left to the browser')
    expect(await worker.request('assets/index-abc.js', 'cors', 'POST')).toBe('left to the browser')
    // A file it does not keep is fetched in the ordinary way.
    expect(await worker.request('extra.png')).toBe('fresh https://example.test/game/extra.png')
  })
})
