import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  // Serve three.js as plain modules in development, so the core is not loaded twice.
  optimizeDeps: { exclude: ['three'] },
  test: { include: ['tests/**/*.test.ts'] },
})
