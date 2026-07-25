import { createRouter, createWebHashHistory } from 'vue-router'

import { isEmbeddedMode } from '@/modeler/integration'
import { ROUTE_NAMES } from '@/routes'

export const router = createRouter({
  // The modeler is deployed as static files. Hash history keeps deep-link refreshes
  // on index.html without requiring a Spring MVC fallback route.
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      redirect: () => ({
        name: isEmbeddedMode() ? ROUTE_NAMES.embedded : ROUTE_NAMES.processes,
      }),
    },
    {
      path: '/embedded',
      name: ROUTE_NAMES.embedded,
      component: () => import('@/views/EmbeddedModelerPage.vue'),
    },
    {
      path: '/login',
      name: ROUTE_NAMES.login,
      component: () => import('@/views/LoginPage.vue'),
    },
    {
      path: '/processes',
      name: ROUTE_NAMES.processes,
      component: () => import('@/views/ProcessesPage.vue'),
    },
    {
      path: '/processes/:modelId',
      name: ROUTE_NAMES.processEditor,
      component: () => import('@/views/ProcessEditorPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: ROUTE_NAMES.processes },
    },
  ],
})
