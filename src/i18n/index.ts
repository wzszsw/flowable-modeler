import { computed } from 'vue'
import elementEn from 'element-plus/es/locale/lang/en'
import elementZhCn from 'element-plus/es/locale/lang/zh-cn'
import { createI18n } from 'vue-i18n'

import { designerEn, designerZhCN } from './locales/designer'
import { modelerEn, modelerZhCN } from './locales/modeler'
import { propertiesEn, propertiesZhCN } from './locales/properties'
import { shellEn, shellZhCN } from './locales/shell'

export type AppLocale = 'zh-CN' | 'en'
export type TranslationParams = Record<string, string | number>

export const DEFAULT_LOCALE: AppLocale = 'zh-CN'
export const AVAILABLE_LOCALES: readonly AppLocale[] = ['zh-CN', 'en']

export function normalizeLocale(value: string | null): AppLocale | null {
  if (!value) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'zh' || normalized === 'zh-cn' || normalized === 'zh-hans') return 'zh-CN'
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
  return null
}

function localeFromUrl(): AppLocale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE
  const url = new URL(window.location.href)
  const hashQueryIndex = url.hash.indexOf('?')
  const hashParameter =
    hashQueryIndex >= 0
      ? new URLSearchParams(url.hash.slice(hashQueryIndex + 1).split('#', 1)[0]).get('lang')
      : null
  return normalizeLocale(hashParameter) ?? normalizeLocale(url.searchParams.get('lang')) ?? DEFAULT_LOCALE
}

export const i18n = createI18n({
  legacy: false,
  locale: localeFromUrl(),
  fallbackLocale: DEFAULT_LOCALE,
  messages: {
    'zh-CN': { ...shellZhCN, ...designerZhCN, ...modelerZhCN, ...propertiesZhCN },
    en: { ...shellEn, ...designerEn, ...modelerEn, ...propertiesEn },
  },
})

export const currentLocale = computed<AppLocale>(() => i18n.global.locale.value as AppLocale)

export const elementPlusLocale = computed(() =>
  currentLocale.value === 'en' ? elementEn : elementZhCn,
)

export function translate(key: string, params?: TranslationParams): string {
  const translateMessage = i18n.global.t as (
    messageKey: string,
    named?: TranslationParams,
  ) => string
  return params ? translateMessage(key, params) : translateMessage(key)
}

function syncDocumentLocale(locale: AppLocale) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
  document
    .querySelector<HTMLMetaElement>('meta[name="description"]')
    ?.setAttribute('content', translate('shell.document.description'))
}

export function setLocale(locale: AppLocale) {
  if (!AVAILABLE_LOCALES.includes(locale)) return
  i18n.global.locale.value = locale
  syncDocumentLocale(locale)
}

syncDocumentLocale(currentLocale.value)
