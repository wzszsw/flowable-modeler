import { createModelerHttpClient } from './modelerHttpClient'

export { ModelerApiError } from './modelerHttpClient'

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

export interface ModelerRequestOptions {
  showGlobalLoading?: boolean
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

const AUTHENTICATION_URL = '/app/authentication'
const LOGOUT_URL = '/app/logout'

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

export class ModelerApi {
  private readonly http = createModelerHttpClient()

  async authenticate(credentials: ModelerCredentials) {
    const body = new URLSearchParams({
      j_username: credentials.username,
      j_password: credentials.password,
      _spring_security_remember_me: 'true',
      submit: 'Login',
    })
    await this.http.post(AUTHENTICATION_URL, body, {
      baseURL: '/',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
    })
  }

  async getAccount() {
    const response = await this.http.get('/account')
    return parseAccount(response.data)
  }

  async logout() {
    await this.http.post(LOGOUT_URL, undefined, {
      baseURL: '/',
      validateStatus: (status) => (status >= 200 && status < 300) || status === 401,
    })
  }

  async listModels(
    query: ProcessModelQuery = {},
    options: ModelerRequestOptions = {},
  ): Promise<ProcessModelListResult> {
    const parameters = new URLSearchParams({
      filter: 'processes',
      sort: query.sort || 'modifiedDesc',
      modelType: String(BPMN_MODEL_TYPE),
    })
    const filterText = query.filterText?.trim()
    if (filterText) parameters.set('filterText', filterText)

    const response = await this.http.get('/models', {
      params: parameters,
      showGlobalLoading: options.showGlobalLoading,
    })
    const result = asRecord(response.data)
    const data = Array.isArray(result.data) ? result.data.map(parseProcessModel) : []
    return {
      size: typeof result.size === 'number' ? result.size : data.length,
      total: typeof result.total === 'number' ? result.total : data.length,
      start: typeof result.start === 'number' ? result.start : 0,
      data,
    }
  }

  async createModel(input: CreateProcessModelInput) {
    const response = await this.http.post('/models', {
      name: input.name,
      key: input.key,
      description: input.description || '',
      modelType: BPMN_MODEL_TYPE,
    })
    return parseProcessModel(response.data)
  }

  async getModel(id: string) {
    const response = await this.http.get(`/models/${encodeURIComponent(id)}`)
    return parseProcessModel(response.data)
  }

  async getEditorModel(id: string) {
    const response = await this.http.get(`/models/${encodeURIComponent(id)}/editor/json`)
    return parseEditorDocument(response.data)
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

    const response = await this.http.post(`/models/${encodeURIComponent(id)}/editor/json`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    })
    return parseProcessModel(response.data)
  }

  async deleteModel(id: string) {
    await this.http.delete(`/models/${encodeURIComponent(id)}`)
  }
}
