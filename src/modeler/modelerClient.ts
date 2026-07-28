import { FLOWABLE_BACKEND_ENABLED } from '@/config/features'

import { IndexedDbModelerApi } from './indexedDbModelerApi'
import { ModelerApi } from './modelerApi'

export type ModelerClient = Pick<
  ModelerApi,
  | 'authenticate'
  | 'getAccount'
  | 'logout'
  | 'listModels'
  | 'createModel'
  | 'getModel'
  | 'getEditorModel'
  | 'saveEditorModel'
>

export function createModelerClient(): ModelerClient {
  return FLOWABLE_BACKEND_ENABLED ? new ModelerApi() : new IndexedDbModelerApi()
}
