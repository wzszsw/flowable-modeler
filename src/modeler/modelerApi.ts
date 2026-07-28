import { createModelerHttpClient, ModelerApiError } from './modelerHttpClient'
import { MODEL_TYPES, isModelType, type ModelType } from './modelTypes'

export { ModelerApiError }

export type ModelSort = 'modifiedDesc' | 'modifiedAsc' | 'nameAsc' | 'nameDesc'

export interface ModelerCredentials {
  username: string
  password: string
}

export interface ModelerAccount {
  id: string
  fullName: string
}

export interface ModelerModel {
  id: string
  name: string
  key: string
  description: string
  createdBy: string
  lastUpdatedBy: string
  lastUpdated: number
  latestVersion: boolean
  version: number
  comment: string
  modelType: ModelType
  tenantId: string
}

export interface ModelListResult {
  size: number
  total: number
  start: number
  data: ModelerModel[]
}

export interface ModelQuery {
  filterText?: string
  sort?: ModelSort
  modelTypes?: readonly ModelType[]
}

export interface ModelerRequestOptions {
  showGlobalLoading?: boolean
}

export interface CreateModelInput {
  name: string
  key: string
  description?: string
  modelType: ModelType
}

export interface EditorModelDocument {
  modelId: string
  name: string
  key: string
  description: string
  lastUpdated: number
  lastUpdatedBy: string
  model: Record<string, unknown>
}

export interface SaveEditorModelInput {
  name: string
  key: string
  description: string
  model: Record<string, unknown>
  lastUpdated: number
  conflictResolveAction?: 'overwrite' | 'newVersion'
}

const AUTHENTICATION_URL = '/app/authentication'
const LOGOUT_URL = '/app/logout'
const REPEATABLE_REQUEST_TIMEOUT_MS = 30_000
const TRANSPARENT_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function modelFilter(modelType: ModelType) {
  if (modelType === MODEL_TYPES.case) return 'cases'
  if (modelType === MODEL_TYPES.decisionTable) return 'decisionTables'
  if (modelType === MODEL_TYPES.decisionService) return 'decisionServices'
  return 'processes'
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw ModelerApiError.fromMessageKey('shell.api.invalidResponse')
  }
  return value as Record<string, unknown>
}

function requiredString(value: unknown, field: string) {
  if (typeof value !== 'string' || !value) {
    throw ModelerApiError.fromMessageKey('shell.api.missingField', {
      messageParams: { field },
    })
  }
  return value
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function requiredTimestamp(value: unknown, field: string) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value
  throw ModelerApiError.fromMessageKey('shell.api.missingField', {
    messageParams: { field },
  })
}

function parseModel(value: unknown): ModelerModel {
  const model = asRecord(value)
  const modelType = typeof model.modelType === 'number' ? model.modelType : MODEL_TYPES.process
  if (!isModelType(modelType)) {
    throw ModelerApiError.fromMessageKey('shell.api.unsupportedModelType', {
      messageParams: { modelType },
    })
  }
  return {
    id: requiredString(model.id, 'id'),
    name: requiredString(model.name, 'name'),
    key: requiredString(model.key, 'key'),
    description: optionalString(model.description),
    createdBy: optionalString(model.createdBy),
    lastUpdatedBy: optionalString(model.lastUpdatedBy),
    lastUpdated: requiredTimestamp(model.lastUpdated, 'lastUpdated'),
    latestVersion: model.latestVersion !== false,
    version: typeof model.version === 'number' ? model.version : 1,
    comment: optionalString(model.comment),
    modelType,
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
    lastUpdated: requiredTimestamp(document.lastUpdated, 'lastUpdated'),
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
      timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      },
    })
  }

  async getAccount() {
    const response = await this.http.get('/account', {
      timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
    })
    return parseAccount(response.data)
  }

  async logout() {
    await this.http.post(LOGOUT_URL, undefined, {
      baseURL: '/',
      timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
      validateStatus: (status) => (status >= 200 && status < 300) || status === 401,
    })
  }

  async listModels(
    query: ModelQuery = {},
    options: ModelerRequestOptions = {},
  ): Promise<ModelListResult> {
    const modelTypes = query.modelTypes?.length
      ? [...new Set(query.modelTypes)]
      : [MODEL_TYPES.process]
    const filterText = query.filterText?.trim()
    const responses = await Promise.all(
      modelTypes.map(async (modelType, index) => {
        const parameters = new URLSearchParams({
          filter: modelFilter(modelType),
          sort: query.sort || 'modifiedDesc',
          modelType: String(modelType),
        })
        if (filterText) parameters.set('filterText', filterText)
        const response = await this.http.get('/models', {
          params: parameters,
          showGlobalLoading: index === 0 ? options.showGlobalLoading : false,
          timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
        })
        const result = asRecord(response.data)
        return Array.isArray(result.data) ? result.data.map(parseModel) : []
      }),
    )
    const data = responses.flat().sort((left, right) => {
      if (query.sort === 'modifiedAsc') return left.lastUpdated - right.lastUpdated
      if (query.sort === 'nameAsc') return left.name.localeCompare(right.name)
      if (query.sort === 'nameDesc') return right.name.localeCompare(left.name)
      return right.lastUpdated - left.lastUpdated
    })
    return { size: data.length, total: data.length, start: 0, data }
  }

  async createModel(input: CreateModelInput) {
    const response = await this.http.post('/models', {
      name: input.name,
      key: input.key,
      description: input.description || '',
      modelType: input.modelType,
    })
    return parseModel(response.data)
  }

  async getModel(id: string) {
    const response = await this.http.get(`/models/${encodeURIComponent(id)}`, {
      timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
    })
    return parseModel(response.data)
  }

  async getEditorModel(id: string, modelType: ModelType) {
    if (modelType === MODEL_TYPES.decisionTable) {
      const response = await this.http.get(
        `/decision-table-models/${encodeURIComponent(id)}`,
        { timeout: REPEATABLE_REQUEST_TIMEOUT_MS },
      )
      return parseDecisionTableDocument(response.data)
    }
    const response = await this.http.get(`/models/${encodeURIComponent(id)}/editor/json`, {
      timeout: REPEATABLE_REQUEST_TIMEOUT_MS,
    })
    return parseEditorDocument(response.data)
  }

  async saveEditorModel(
    id: string,
    modelType: ModelType,
    input: SaveEditorModelInput,
  ) {
    if (modelType === MODEL_TYPES.decisionTable) {
      const response = await this.http.put(
        `/decision-table-models/${encodeURIComponent(id)}`,
        {
          newVersion: input.conflictResolveAction === 'newVersion',
          decisionTableImageBase64: TRANSPARENT_PNG_DATA_URL,
          decisionTableRepresentation: {
            name: input.name,
            key: input.key,
            description: input.description,
            decisionTableDefinition: input.model,
          },
        },
      )
      return parseSavedDecisionTable(response.data)
    }
    const body = new URLSearchParams({
      name: input.name,
      key: input.key,
      description: input.description,
      json_xml: JSON.stringify(input.model),
      lastUpdated: String(input.lastUpdated),
      newversion: 'false',
    })
    if (input.conflictResolveAction) {
      body.set('conflictResolveAction', input.conflictResolveAction)
    }

    const response = await this.http.post(`/models/${encodeURIComponent(id)}/editor/json`, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
    })
    return parseModel(response.data)
  }

}

function parseDecisionTableDocument(value: unknown): EditorModelDocument {
  const document = asRecord(value)
  return {
    modelId: requiredString(document.id, 'id'),
    name: requiredString(document.name, 'name'),
    key: requiredString(document.key, 'key'),
    description: optionalString(document.description),
    lastUpdated: requiredTimestamp(document.lastUpdated, 'lastUpdated'),
    lastUpdatedBy: optionalString(document.lastUpdatedBy),
    model: asRecord(document.decisionTableDefinition),
  }
}

function parseSavedDecisionTable(value: unknown) {
  const decisionTable = asRecord(value)
  return parseModel({
    ...decisionTable,
    modelType: MODEL_TYPES.decisionTable,
  })
}
