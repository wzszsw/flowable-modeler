import { createDefaultEditorModel } from './defaultEditorModel'
import {
  ModelerApiError,
  type CreateModelInput,
  type EditorModelDocument,
  type ModelerModel,
  type ModelerAccount,
  type ModelerCredentials,
  type ModelerRequestOptions,
  type ModelListResult,
  type ModelQuery,
  type SaveEditorModelInput,
} from './modelerApi'
import { MODEL_TYPES, type ModelType } from './modelTypes'

const DATABASE_NAME = 'flowable-modeler'
const DATABASE_VERSION = 2
const MODEL_STORE = 'process-models'
const HISTORY_STORE = 'model-history'
const LOCAL_ACCOUNT_ID = 'local'

interface StoredModel extends ModelerModel {
  editorModel: Record<string, unknown>
}

interface StoredModelHistory extends StoredModel {
  modelId: string
}

let databasePromise: Promise<IDBDatabase> | null = null
let databaseInstance: IDBDatabase | null = null

function storageError(details?: unknown) {
  return ModelerApiError.fromMessageKey('shell.local.storageUnavailable', { details })
}

function modelNotFound(id: string) {
  return ModelerApiError.fromMessageKey('shell.local.modelNotFound', {
    status: 404,
    messageParams: { id },
  })
}

function invalidateDatabase(database: IDBDatabase) {
  database.close()
  if (databaseInstance !== database) return
  databaseInstance = null
  databasePromise = null
}

function rethrowStorageError(database: IDBDatabase, error: unknown): never {
  if (error instanceof ModelerApiError) throw error
  invalidateDatabase(database)
  throw storageError(error)
}

function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(storageError())
  if (databasePromise) return databasePromise

  let abandoned = false
  const openingPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(MODEL_STORE)) {
        database.createObjectStore(MODEL_STORE, { keyPath: 'id' })
      }
      if (!database.objectStoreNames.contains(HISTORY_STORE)) {
        const history = database.createObjectStore(HISTORY_STORE, { keyPath: 'id' })
        history.createIndex('modelId', 'modelId', { unique: false })
      }
    }
    request.onsuccess = () => {
      const database = request.result
      if (abandoned) {
        database.close()
        return
      }
      const clearCachedConnection = () => {
        if (databaseInstance === database) databaseInstance = null
        if (databasePromise === openingPromise) databasePromise = null
      }
      database.onversionchange = () => {
        database.close()
        clearCachedConnection()
      }
      database.onclose = clearCachedConnection
      databaseInstance = database
      resolve(database)
    }
    request.onerror = () => {
      reject(storageError(request.error))
    }
    request.onblocked = () => {
      abandoned = true
      reject(storageError())
    }
  })

  databasePromise = openingPromise
  void openingPromise.catch(() => {
    if (databasePromise === openingPromise) databasePromise = null
  })
  return openingPromise
}

async function runTransaction<T>(
  mode: IDBTransactionMode,
  execute: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(MODEL_STORE, mode)
      const request = execute(transaction.objectStore(MODEL_STORE))
      let requestCompleted = false
      let result: T

      request.onsuccess = () => {
        requestCompleted = true
        result = request.result
      }
      transaction.oncomplete = () => {
        if (requestCompleted) resolve(result)
        else reject(storageError(request.error))
      }
      transaction.onerror = () => reject(storageError(transaction.error || request.error))
      transaction.onabort = () => reject(storageError(transaction.error || request.error))
    })
  } catch (error) {
    rethrowStorageError(database, error)
  }
}

function cloneEditorModel(model: Record<string, unknown>) {
  try {
    return structuredClone(model)
  } catch (error) {
    throw storageError(error)
  }
}

async function readRecord(id: string) {
  const record = await runTransaction<StoredModel | undefined>('readonly', (store) =>
    store.get(id),
  )
  if (!record) throw modelNotFound(id)
  return record
}

function toModel(record: StoredModel): ModelerModel {
  return {
    id: record.id,
    name: record.name,
    key: record.key,
    description: record.description,
    createdBy: record.createdBy,
    lastUpdatedBy: record.lastUpdatedBy,
    lastUpdated: record.lastUpdated,
    latestVersion: record.latestVersion,
    version: record.version,
    comment: record.comment,
    modelType: record.modelType,
    tenantId: record.tenantId,
  }
}

function nextUpdatedAt(previous = 0) {
  const now = Date.now()
  return Math.max(now, previous + 1)
}

function createHistory(record: StoredModel): StoredModelHistory {
  return {
    ...record,
    id: crypto.randomUUID(),
    modelId: record.id,
    latestVersion: false,
    editorModel: cloneEditorModel(record.editorModel),
  }
}

function compareModels(left: ModelerModel, right: ModelerModel, sort = 'modifiedDesc') {
  if (sort === 'modifiedAsc') {
    return left.lastUpdated - right.lastUpdated
  }
  if (sort === 'nameAsc') return left.name.localeCompare(right.name)
  if (sort === 'nameDesc') return right.name.localeCompare(left.name)
  return right.lastUpdated - left.lastUpdated
}

export class IndexedDbModelerApi {
  async authenticate(_credentials: ModelerCredentials) {}

  async getAccount(): Promise<ModelerAccount> {
    await openDatabase()
    return { id: LOCAL_ACCOUNT_ID, fullName: LOCAL_ACCOUNT_ID }
  }

  async logout() {}

  async listModels(
    query: ModelQuery = {},
    _options: ModelerRequestOptions = {},
  ): Promise<ModelListResult> {
    const records = await runTransaction<StoredModel[]>('readonly', (store) =>
      store.getAll(),
    )
    const filterText = query.filterText?.trim().toLocaleLowerCase()
    const modelTypes = new Set(query.modelTypes || [])
    const data = records
      .map(toModel)
      .filter((model) => !modelTypes.size || modelTypes.has(model.modelType))
      .filter((model) =>
        filterText
          ? [model.name, model.description].some((value) =>
              value.toLocaleLowerCase().includes(filterText),
            )
          : true,
      )
      .sort((left, right) => compareModels(left, right, query.sort))

    return { size: data.length, total: data.length, start: 0, data }
  }

  async createModel(input: CreateModelInput) {
    const id = crypto.randomUUID()
    const lastUpdated = nextUpdatedAt()
    const editorModel = await createDefaultEditorModel(
      input.modelType,
      input.key,
      input.name,
      input.description,
    )
    const record: StoredModel = {
      id,
      name: input.name,
      key: input.key,
      description: input.description || '',
      createdBy: LOCAL_ACCOUNT_ID,
      lastUpdatedBy: LOCAL_ACCOUNT_ID,
      lastUpdated,
      latestVersion: true,
      version: 1,
      comment: '',
      modelType: input.modelType,
      tenantId: '',
      editorModel,
    }
    await runTransaction<IDBValidKey>('readwrite', (store) => store.add(record))
    return toModel(record)
  }

  async getModel(id: string) {
    return toModel(await readRecord(id))
  }

  async getEditorModel(id: string, _modelType: ModelType): Promise<EditorModelDocument> {
    const record = await readRecord(id)
    return {
      modelId: record.id,
      name: record.name,
      key: record.key,
      description: record.description,
      lastUpdated: record.lastUpdated,
      lastUpdatedBy: record.lastUpdatedBy,
      model: cloneEditorModel(record.editorModel),
    }
  }

  async saveEditorModel(
    id: string,
    modelType: ModelType,
    input: SaveEditorModelInput,
  ) {
    const editorModel = cloneEditorModel(input.model)
    const database = await openDatabase()
    try {
      return await new Promise<ModelerModel>((resolve, reject) => {
        const transaction = database.transaction([MODEL_STORE, HISTORY_STORE], 'readwrite')
        const store = transaction.objectStore(MODEL_STORE)
        const historyStore = transaction.objectStore(HISTORY_STORE)
        const request = store.get(id) as IDBRequest<StoredModel | undefined>
        let saved: StoredModel | undefined
        let expectedError: ModelerApiError | undefined

        request.onsuccess = () => {
          try {
            const record = request.result
            if (!record) {
              expectedError = modelNotFound(id)
              transaction.abort()
              return
            }
            if (
              modelType !== MODEL_TYPES.decisionTable &&
              record.lastUpdated !== input.lastUpdated &&
              input.newVersion !== true &&
              input.conflictResolveAction !== 'overwrite'
            ) {
              expectedError = ModelerApiError.fromMessageKey('shell.local.modelConflict', {
                status: 409,
              })
              transaction.abort()
              return
            }

            const createVersion =
              input.newVersion === true || input.conflictResolveAction === 'newVersion'
            if (createVersion) historyStore.add(createHistory(record))
            saved = {
              ...record,
              name: input.name,
              key: input.key,
              description: input.description,
              lastUpdated: nextUpdatedAt(record.lastUpdated),
              lastUpdatedBy: LOCAL_ACCOUNT_ID,
              version: createVersion ? record.version + 1 : record.version,
              comment: createVersion ? input.comment || '' : record.comment,
              editorModel,
            }
            store.put(saved)
          } catch (error) {
            expectedError = storageError(error)
            try {
              transaction.abort()
            } catch {
              reject(expectedError)
            }
          }
        }
        transaction.oncomplete = () => {
          if (saved) resolve(toModel(saved))
          else reject(storageError())
        }
        transaction.onerror = () => reject(expectedError || storageError(transaction.error))
        transaction.onabort = () => reject(expectedError || storageError(transaction.error))
      })
    } catch (error) {
      rethrowStorageError(database, error)
    }
  }

  async deleteModel(id: string) {
    const database = await openDatabase()
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction([MODEL_STORE, HISTORY_STORE], 'readwrite')
        const modelStore = transaction.objectStore(MODEL_STORE)
        const historyStore = transaction.objectStore(HISTORY_STORE)
        const request = modelStore.getKey(id)
        let expectedError: ModelerApiError | undefined

        request.onsuccess = () => {
          try {
            if (request.result === undefined) {
              expectedError = modelNotFound(id)
              transaction.abort()
              return
            }
            modelStore.delete(id)
            const histories = historyStore.index('modelId').openKeyCursor(IDBKeyRange.only(id))
            histories.onsuccess = () => {
              const cursor = histories.result
              if (!cursor) return
              historyStore.delete(cursor.primaryKey)
              cursor.continue()
            }
          } catch (error) {
            expectedError = storageError(error)
            try {
              transaction.abort()
            } catch {
              reject(expectedError)
            }
          }
        }
        transaction.oncomplete = () => resolve()
        transaction.onerror = () => reject(expectedError || storageError(transaction.error))
        transaction.onabort = () => reject(expectedError || storageError(transaction.error))
      })
    } catch (error) {
      rethrowStorageError(database, error)
    }
  }

  async listModelHistory(id: string): Promise<ModelListResult> {
    await readRecord(id)
    const database = await openDatabase()
    try {
      const records = await new Promise<StoredModelHistory[]>((resolve, reject) => {
        const transaction = database.transaction(HISTORY_STORE, 'readonly')
        const request = transaction
          .objectStore(HISTORY_STORE)
          .index('modelId')
          .getAll(IDBKeyRange.only(id))
        let result: StoredModelHistory[] = []
        request.onsuccess = () => {
          result = request.result
        }
        transaction.oncomplete = () => resolve(result)
        transaction.onerror = () => reject(storageError(transaction.error || request.error))
        transaction.onabort = () => reject(storageError(transaction.error || request.error))
      })
      const data = records
        .map(toModel)
        .sort((left, right) => right.version - left.version || right.lastUpdated - left.lastUpdated)
      return { size: data.length, total: data.length, start: 0, data }
    } catch (error) {
      rethrowStorageError(database, error)
    }
  }

  async restoreModelHistory(id: string, historyId: string, comment: string) {
    const database = await openDatabase()
    try {
      return await new Promise<ModelerModel>((resolve, reject) => {
        const transaction = database.transaction([MODEL_STORE, HISTORY_STORE], 'readwrite')
        const modelStore = transaction.objectStore(MODEL_STORE)
        const historyStore = transaction.objectStore(HISTORY_STORE)
        const modelRequest = modelStore.get(id) as IDBRequest<StoredModel | undefined>
        const historyRequest = historyStore.get(historyId) as IDBRequest<
          StoredModelHistory | undefined
        >
        let saved: StoredModel | undefined
        let expectedError: ModelerApiError | undefined
        let modelReady = false
        let historyReady = false

        const restore = () => {
          if (!modelReady || !historyReady) return
          if (!modelRequest.result || !historyRequest.result) return
          const current = modelRequest.result
          const history = historyRequest.result
          if (history.modelId !== id) {
            expectedError = modelNotFound(historyId)
            transaction.abort()
            return
          }
          historyStore.add(createHistory(current))
          saved = {
            ...current,
            name: history.name,
            key: history.key,
            description: history.description,
            lastUpdated: nextUpdatedAt(current.lastUpdated),
            lastUpdatedBy: LOCAL_ACCOUNT_ID,
            version: current.version + 1,
            comment,
            editorModel: cloneEditorModel(history.editorModel),
          }
          modelStore.put(saved)
        }

        modelRequest.onsuccess = () => {
          modelReady = true
          restore()
        }
        historyRequest.onsuccess = () => {
          historyReady = true
          restore()
        }
        transaction.oncomplete = () => {
          if (saved) resolve(toModel(saved))
          else reject(expectedError || modelNotFound(historyId))
        }
        transaction.onerror = () => reject(expectedError || storageError(transaction.error))
        transaction.onabort = () => reject(expectedError || storageError(transaction.error))
      })
    } catch (error) {
      rethrowStorageError(database, error)
    }
  }
}
