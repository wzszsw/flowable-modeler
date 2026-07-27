import { inject, type InjectionKey, type Ref } from 'vue'

import { translate } from '@/i18n'
import type {
  ModelerCredentials,
  ProcessModel,
  ProcessModelQuery,
} from '@/modeler/modelerApi'

export interface ModelSnapshot {
  xml: string
  fileName: string
  name: string
  key: string
  description: string
}

export interface CreateModelInput {
  name: string
  key: string
  description: string
}

export interface ImportModelInput extends CreateModelInput {
  xml: string
  fileName: string
}

export interface ModelerApplication {
  authenticated: Ref<boolean>
  authenticationPending: Ref<boolean>
  modelMutationPending: Ref<boolean>
  loginError: Ref<string>
  username: Ref<string>
  models: Ref<ProcessModel[]>
  totalModels: Ref<number>
  activeModel: Ref<ProcessModel | null>
  activeXml: Ref<string>
  login: (credentials: ModelerCredentials) => Promise<void>
  logout: () => Promise<void>
  loadModels: (query?: ProcessModelQuery) => Promise<void>
  loadModelForRoute: (id: string) => Promise<boolean>
  createModel: (input: CreateModelInput) => Promise<void>
  importModel: (input: ImportModelInput) => Promise<void>
  saveActiveModel: (snapshot: ModelSnapshot) => Promise<{ savedAt: number }>
  deleteModel: (id: string) => Promise<void>
  clearActiveModel: () => void
}

export const modelerApplicationKey: InjectionKey<ModelerApplication> = Symbol(
  'flowable-modeler-application',
)

export function useModelerApplication() {
  const application = inject(modelerApplicationKey)
  if (!application) throw new Error(translate('modeler.errors.applicationContextMissing'))
  return application
}
