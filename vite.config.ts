import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173 },
  test: {
    environment: 'jsdom',
    setupFiles: `${process.cwd()}/src/test/setup.ts`,
    css: true,
  },
})
