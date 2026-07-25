import { defineConfig, presetIcons, presetWind3, transformerDirectives } from 'unocss'

export default defineConfig({
  presets: [
    presetWind3(),
    presetIcons({
      scale: 1.15,
    }),
  ],
  transformers: [transformerDirectives()],
  shortcuts: {
    'toolbar-divider': 'mx-1 h-5 w-px bg-gray-200',
  },
})
