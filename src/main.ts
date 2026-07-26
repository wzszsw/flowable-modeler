import '@unocss/reset/tailwind.css'
import 'uno.css'

import 'element-plus/dist/index.css'
import 'bpmn-js/dist/assets/diagram-js.css'
import 'bpmn-js/dist/assets/bpmn-js.css'
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css'
import 'diagram-js-minimap/assets/diagram-js-minimap.css'
import 'bpmn-js-token-simulation/assets/css/bpmn-js-token-simulation.css'
import './assets/main.css'

import { createApp, reactive, watch } from 'vue'
import ElementPlus from 'element-plus'
import App from './App.vue'
import { elementPlusLocale, i18n } from './i18n'
import { router } from './router'

const app = createApp(App)
const elementPlusOptions = reactive({ locale: elementPlusLocale.value })
watch(
  elementPlusLocale,
  (locale) => {
    elementPlusOptions.locale = locale
  },
  { flush: 'sync' },
)
app.use(i18n)
app.use(router)
app.use(ElementPlus, elementPlusOptions)

await router.isReady()
app.mount('#app')
