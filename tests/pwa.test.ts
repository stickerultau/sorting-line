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
