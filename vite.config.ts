import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

const flowableBackend = 'http://localhost:8080'

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    vue(),
    UnoCSS(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    include: [
      'cmmn-js/lib/Modeler',
      'cmmn-js/lib/features/context-pad/ContextPadProvider',
      'cmmn-js/lib/features/palette/PaletteProvider',
      'cmmn-js/lib/features/popup-menu/ReplaceMenuProvider',
    ],
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
