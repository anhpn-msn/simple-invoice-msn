import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

const routerDist = (file: string) =>
  path.resolve(import.meta.dirname, 'node_modules/react-router/dist/development', file)

// Under vitest, `react-router` resolves to the CJS build while `react-router/dom`
// resolves to the ESM build, giving two router contexts. Pin both to ESM.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:3000'

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      proxy: {
        '/api/docs': { target: apiTarget, changeOrigin: false, xfwd: true },
        '/api': {
          target: apiTarget,
          changeOrigin: false,
          xfwd: true,
          rewrite: (p) => p.replace(/^\/api/, ''),
        },
      },
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      css: false,
      restoreMocks: true,
      alias: [
        { find: /^react-router$/, replacement: routerDist('index.mjs') },
        { find: /^react-router\/dom$/, replacement: routerDist('dom-export.mjs') },
      ],
    },
  }
})
