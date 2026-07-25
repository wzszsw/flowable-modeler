import axios from 'axios'
import { ElLoading, type LoadingInstance } from 'element-plus'

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
    text: '加载中',
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

export class ModelerApiError extends Error {
  readonly status: number
  readonly details: unknown

  constructor(message: string, status: number, details?: unknown) {
    super(message)
    this.name = 'ModelerApiError'
    this.status = status
    this.details = details
  }
}

function errorMessage(details: unknown, status: number) {
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
    return status
      ? `Flowable 请求失败（HTTP ${status}）`
      : '无法连接 Flowable 服务'
  }
  return message
}

export function createModelerHttpClient() {
  const client = axios.create({
    baseURL: MODELER_REST_BASE,
    withCredentials: true,
  })

  client.interceptors.request.use((config) => {
    beginLoading()
    config.headers.set('Accept', 'application/json')
    config.headers.set('Cache-Control', 'no-cache')
    config.headers.set('Pragma', 'no-cache')
    return config
  })

  client.interceptors.response.use(
    (response) => {
      finishLoading()
      return response
    },
    (error: unknown) => {
      finishLoading()
      if (error instanceof ModelerApiError) return Promise.reject(error)
      if (!axios.isAxiosError(error)) return Promise.reject(error)

      const status = error.response?.status ?? 0
      const details = error.response?.data
      return Promise.reject(new ModelerApiError(errorMessage(details, status), status, details))
    },
  )

  return client
}
