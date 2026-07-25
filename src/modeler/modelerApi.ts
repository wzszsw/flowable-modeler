export const BPMN_MODEL_TYPE = 0

export type ModelSort = 'modifiedDesc' | 'modifiedAsc' | 'nameAsc' | 'nameDesc'

export interface ModelerCredentials {
  username: string
  password: string
}

export interface ModelerAccount {
  id: string
  fullName: string
}

export interface ProcessModel {
  id: string
  name: string
  key: string
  description: string
  createdBy: string
  lastUpdatedBy: string
  lastUpdated: string
  latestVersion: boolean
  version: number
  comment: string
  modelType: number
  tenantId: string
}

export interface ProcessModelListResult {
  size: number
  total: number
  start: number
  data: ProcessModel[]
}

export interface ProcessModelQuery {
  filterText?: string
  sort?: ModelSort
}

export interface CreateProcessModelInput {
  name: string
  key: string
  description?: string
}

export interface EditorModelDocument {
  modelId: string
  name: string
  key: string
  description: string
  lastUpdated: string
  lastUpdatedBy: string
  model: Record<string, unknown>
}

export interface SaveEditorModelInput {
  name: string
  key: string
  description: string
  model: Record<string, unknown>
  lastUpdated: string
  conflictResolveAction?: 'overwrite' | 'newVersion'
}

type Fetcher = typeof fetch

const MODELER_REST_BASE = '/modeler-app/rest'
const AUTHENTICATION_URL = '/app/authentication'
const LOGOUT_URL = '/app/logout'

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

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Flowable 返回了无法识别的数据')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) throw new Error(`Flowable 响应缺少 ${field}`)
  return value
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function normalizedDate(value: unknown, field: string) {
  if (typeof value === 'string' && value) return value
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value).toISOString()
  throw new Error(`Flowable 响应缺少 ${field}`)
}

function parseProcessModel(value: unknown): ProcessModel {
  const model = asRecord(value)
  return {
    id: requiredString(model.id, 'id'),
    name: requiredString(model.name, 'name'),
    key: requiredString(model.key, 'key'),
    description: optionalString(model.description),
    createdBy: optionalString(model.createdBy),
    lastUpdatedBy: optionalString(model.lastUpdatedBy),
    lastUpdated: normalizedDate(model.lastUpdated, 'lastUpdated'),
    latestVersion: model.latestVersion !== false,
    version: typeof model.version === 'number' ? model.version : 1,
    comment: optionalString(model.comment),
    modelType: typeof model.modelType === 'number' ? model.modelType : BPMN_MODEL_TYPE,
    tenantId: optionalString(model.tenantId),
  }
}

function parseEditorDocument(value: unknown): EditorModelDocument {
  const document = asRecord(value)
  return {
    modelId: requiredString(document.modelId, 'modelId'),
    name: requiredString(document.name, 'name'),
    key: requiredString(document.key, 'key'),
    description: optionalString(document.description),
    lastUpdated: normalizedDate(document.lastUpdated, 'lastUpdated'),
    lastUpdatedBy: optionalString(document.lastUpdatedBy),
    model: asRecord(document.model),
  }
}

function parseAccount(value: unknown): ModelerAccount {
  const account = asRecord(value)
  return {
    id: requiredString(account.id, 'id'),
    fullName: optionalString(account.fullName),
  }
}

async function responseError(response: Response) {
  const body = await response.text()
  let details: unknown = body
  let message = body.trim()
  if (body) {
    try {
      details = JSON.parse(body) as unknown
      const record = asRecord(details)
      message = optionalString(record.message) || optionalString(record.error) || message
    } catch {
      // Preserve a plain-text error response.
    }
  }
  if (!message || message.startsWith('<!DOCTYPE') || message.startsWith('<html')) {
    message = `Flowable 请求失败（HTTP ${response.status}）`
  }
  return new ModelerApiError(message, response.status, details)
}

export class ModelerApi {
  constructor(
    private readonly fetcher: Fetcher = globalThis.fetch.bind(globalThis),
  ) {}

  async authenticate(credentials: ModelerCredentials) {
    const body = new URLSearchParams({
      j_username: credentials.username,
      j_password: credentials.password,
      _spring_security_remember_me: 'true',
      submit: 'Login',
    })
    const response = await this.fetcher(AUTHENTICATION_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
      body,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw await responseError(response)
  }

  async getAccount() {
    const response = await this.request('/account')
    return parseAccount(await response.json())
  }

  async logout() {
    const response = await this.fetcher(LOGOUT_URL, {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'manual',
    })
    if (response.type !== 'opaqueredirect' && !response.ok && response.status !== 401) {
      throw await responseError(response)
    }
  }

  private async request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers)
    headers.set('Accept', 'application/json')

    const response = await this.fetcher(`${MODELER_REST_BASE}${path}`, {
      ...init,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    })
    if (!response.ok) throw await responseError(response)
    return response
  }

  async listModels(query: ProcessModelQuery = {}): Promise<ProcessModelListResult> {
    const parameters = new URLSearchParams({
      filter: 'processes',
      sort: query.sort || 'modifiedDesc',
      modelType: String(BPMN_MODEL_TYPE),
    })
    const filterText = query.filterText?.trim()
    if (filterText) parameters.set('filterText', filterText)

    const response = await this.request(`/models?${parameters}`)
    const result = asRecord(await response.json())
    const data = Array.isArray(result.data) ? result.data.map(parseProcessModel) : []
    return {
      size: typeof result.size === 'number' ? result.size : data.length,
      total: typeof result.total === 'number' ? result.total : data.length,
      start: typeof result.start === 'number' ? result.start : 0,
      data,
    }
  }

  async createModel(input: CreateProcessModelInput) {
    const response = await this.request('/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name,
        key: input.key,
        description: input.description || '',
        modelType: BPMN_MODEL_TYPE,
      }),
    })
    return parseProcessModel(await response.json())
  }

  async getModel(id: string) {
    const response = await this.request(`/models/${encodeURIComponent(id)}`)
    return parseProcessModel(await response.json())
  }

  async getEditorModel(id: string) {
    const response = await this.request(`/models/${encodeURIComponent(id)}/editor/json`)
    return parseEditorDocument(await response.json())
  }

  async saveEditorModel(id: string, input: SaveEditorModelInput) {
    const body = new URLSearchParams({
      name: input.name,
      key: input.key,
      description: input.description,
      json_xml: JSON.stringify(input.model),
      lastUpdated: input.lastUpdated,
      newversion: 'false',
    })
    if (input.conflictResolveAction) {
      body.set('conflictResolveAction', input.conflictResolveAction)
    }

    const response = await this.request(`/models/${encodeURIComponent(id)}/editor/json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body,
    })
    return parseProcessModel(await response.json())
  }

  async deleteModel(id: string) {
    await this.request(`/models/${encodeURIComponent(id)}`, { method: 'DELETE' })
  }
}
