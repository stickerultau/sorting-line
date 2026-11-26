import { defineConfig } from 'vitest/config'
import { pwa } from './tools/pwa.ts'

export default defineConfig({
  base: './',
  plugins: [pwa()],
  // Serve three.js as plain modules in development, so the core is not loaded twice.
  optimizeDeps: { exclude: ['three'] },
  test: { include: ['tests/**/*.test.ts'] },
})
