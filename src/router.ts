import { createRouter, createWebHashHistory } from 'vue-router'

import {
  currentLocale,
  DEFAULT_LOCALE,
  normalizeLocale,
  setLocale,
  type AppLocale,
} from '@/i18n'
import { ROUTE_NAMES } from '@/routes'

function hashHistoryBase() {
  if (typeof window === 'undefined') return undefined
  const url = new URL(window.location.href)
  url.searchParams.delete('lang')
  return `${url.pathname}${url.search}`
}

function queryLocale(value: unknown): AppLocale | null {
  const parameter = Array.isArray(value) ? value[0] : value
  return normalizeLocale(typeof parameter === 'string' ? parameter : null)
}

export const router = createRouter({
  // The modeler is deployed as static files. Hash history keeps deep-link refreshes
  // on index.html without requiring a Spring MVC fallback route.
  history: createWebHashHistory(hashHistoryBase()),
  routes: [
    {
      path: '/',
      redirect: { name: ROUTE_NAMES.processes },
    },
    {
      path: '/login',
      name: ROUTE_NAMES.login,
      component: () => import('@/views/LoginPage.vue'),
    },
    {
      path: '/processes',
      name: ROUTE_NAMES.processes,
      component: () => import('@/views/ModelsPage.vue'),
    },
    {
      path: '/cases',
      name: ROUTE_NAMES.cases,
      component: () => import('@/views/ModelsPage.vue'),
    },
    {
      path: '/decisions',
      name: ROUTE_NAMES.decisions,
      component: () => import('@/views/ModelsPage.vue'),
    },
    {
      path: '/processes/:modelId',
      name: ROUTE_NAMES.processEditor,
      component: () => import('@/views/ProcessEditorPage.vue'),
    },
    {
      path: '/cases/:modelId',
      name: ROUTE_NAMES.caseEditor,
      component: () => import('@/views/ProcessEditorPage.vue'),
    },
    {
      path: '/decisions/:modelId',
      name: ROUTE_NAMES.decisionEditor,
      component: () => import('@/views/ProcessEditorPage.vue'),
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: { name: ROUTE_NAMES.processes },
    },
  ],
})

router.beforeEach((to, from) => {
  const requestedLocale = queryLocale(to.query.lang)
  const inheritedLocale =
    requestedLocale ??
    queryLocale(from.query.lang) ??
    (currentLocale.value !== DEFAULT_LOCALE ? currentLocale.value : null)

  if (inheritedLocale && currentLocale.value !== inheritedLocale) setLocale(inheritedLocale)
})

router.afterEach((to, from, failure) => {
  if (failure || queryLocale(to.query.lang)) return
  const inheritedLocale =
    queryLocale(from.query.lang) ??
    (currentLocale.value !== DEFAULT_LOCALE ? currentLocale.value : null)
  if (!inheritedLocale) return

  void router.replace({
    path: to.path,
    query: { ...to.query, lang: inheritedLocale },
    hash: to.hash,
  })
})
