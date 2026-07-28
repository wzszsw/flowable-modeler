import { inject, type InjectionKey, type Ref } from 'vue'

import { translate } from '@/i18n'
import type {
  ModelerModel,
  ModelerCredentials,
  ModelQuery,
} from '@/modeler/modelerApi'
import type { ModelType } from '@/modeler/modelTypes'

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
  modelType: ModelType
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
  models: Ref<ModelerModel[]>
  totalModels: Ref<number>
  activeModel: Ref<ModelerModel | null>
  activeXml: Ref<string>
  referenceModels: Ref<ModelerModel[]>
  login: (credentials: ModelerCredentials) => Promise<void>
  logout: () => Promise<void>
  loadModels: (query?: ModelQuery) => Promise<void>
  loadModelForRoute: (id: string) => Promise<boolean>
  createModel: (input: CreateModelInput) => Promise<void>
  importModel: (input: ImportModelInput) => Promise<void>
  saveActiveModel: (snapshot: ModelSnapshot) => Promise<{ savedAt: number }>
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
