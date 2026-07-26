import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

const flowableBackend = 'http://localhost:8080'
const flowableModelerOutput = fileURLToPath(
  new URL('../../IdeaProjects/flowable-lab/src/main/resources/static/flowable-modeler', import.meta.url),
)

// https://vite.dev/config/
export default defineConfig({
  base: './',
  build: {
    outDir: flowableModelerOutput,
    emptyOutDir: true,
  },
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/app': {
        target: flowableBackend,
        changeOrigin: true,
      },
      '/modeler-app': {
        target: flowableBackend,
        changeOrigin: true,
      },
    },
  },
})
