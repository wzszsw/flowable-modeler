import axios, { type InternalAxiosRequestConfig } from 'axios'
import { ElLoading, type LoadingInstance } from 'element-plus'

import { translate, type TranslationParams } from '@/i18n'

declare module 'axios' {
  interface AxiosRequestConfig {
    showGlobalLoading?: boolean
  }

  interface InternalAxiosRequestConfig {
    globalLoadingStarted?: boolean
  }
}

const MODELER_REST_BASE = '/modeler-app/rest'

let pendingRequests = 0
let loadingInstance: LoadingInstance | undefined
let loadingCloseTimer: number | undefined

function setApplicationBusy(busy: boolean) {
  const applicationRoot = document.querySelector<HTMLElement>('#app')
  if (!applicationRoot) return
  applicationRoot.inert = busy
  if (busy) applicationRoot.setAttribute('aria-busy', 'true')
  else applicationRoot.removeAttribute('aria-busy')
}

function beginLoading() {
  pendingRequests += 1
  if (loadingCloseTimer !== undefined) {
    window.clearTimeout(loadingCloseTimer)
    loadingCloseTimer = undefined
  }
  setApplicationBusy(true)
  loadingInstance ??= ElLoading.service({
    fullscreen: true,
    lock: true,
    text: translate('shell.common.loading'),
  })
}

function finishLoading() {
  pendingRequests = Math.max(0, pendingRequests - 1)
  if (pendingRequests || loadingCloseTimer !== undefined) return

  // Keep sequential requests under one mask instead of flashing between awaits.
  loadingCloseTimer = window.setTimeout(() => {
    loadingCloseTimer = undefined
    if (pendingRequests) return
    loadingInstance?.close()
    loadingInstance = undefined
    setApplicationBusy(false)
  }, 0)
}

function finishRequestLoading(config: InternalAxiosRequestConfig | undefined) {
  if (!config?.globalLoadingStarted) return
  config.globalLoadingStarted = false
  finishLoading()
}

export class ModelerApiError extends Error {
  readonly status: number
  readonly details: unknown
  readonly messageKey: string | null
  readonly messageParams: TranslationParams

  constructor(
    message: string,
    status: number,
    details?: unknown,
    localization?: { messageKey: string; messageParams?: TranslationParams },
  ) {
    super(message)
    this.name = 'ModelerApiError'
    this.status = status
    this.details = details
    this.messageKey = localization?.messageKey ?? null
    this.messageParams = { ...(localization?.messageParams || {}) }
  }

  static fromMessageKey(
    messageKey: string,
    options: {
      status?: number
      details?: unknown
      messageParams?: TranslationParams
    } = {},
  ) {
    const messageParams = { ...(options.messageParams || {}) }
    return new ModelerApiError(
      translate(messageKey, messageParams),
      options.status ?? 0,
      options.details,
      { messageKey, messageParams },
    )
  }
}

function serverErrorMessage(details: unknown) {
  let message = ''

  if (typeof details === 'string') {
    message = details.trim()
  } else if (details && typeof details === 'object' && !Array.isArray(details)) {
    const record = details as Record<string, unknown>
    if (typeof record.message === 'string') message = record.message.trim()
    if (!message && typeof record.error === 'string') message = record.error.trim()
  }

  const normalizedMessage = message.toLowerCase()
  if (!message || normalizedMessage.startsWith('<!doctype') || normalizedMessage.startsWith('<html')) {
    return ''
  }
  return message
}

export function createModelerHttpClient() {
  const client = axios.create({
    baseURL: MODELER_REST_BASE,
    withCredentials: true,
  })

  client.interceptors.request.use((config) => {
    try {
      config.headers.set('Accept', 'application/json')
      config.headers.set('Cache-Control', 'no-cache')
      config.headers.set('Pragma', 'no-cache')
      if (config.showGlobalLoading !== false) {
        config.globalLoadingStarted = true
        beginLoading()
      }
      return config
    } catch (error) {
      finishRequestLoading(config)
      throw error
    }
  })

  client.interceptors.response.use(
    (response) => {
      finishRequestLoading(response.config)
      return response
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) finishRequestLoading(error.config)
      if (error instanceof ModelerApiError) return Promise.reject(error)
      if (!axios.isAxiosError(error)) return Promise.reject(error)

      const status = error.response?.status ?? 0
      const details = error.response?.data
      const message = serverErrorMessage(details)
      if (message) return Promise.reject(new ModelerApiError(message, status, details))

      const messageKey = status ? 'shell.api.requestFailed' : 'shell.api.unreachable'
      const messageParams = status ? { status } : undefined
      return Promise.reject(ModelerApiError.fromMessageKey(messageKey, {
        status,
        details,
        messageParams,
      }))
    },
  )

  return client
}
