<script setup lang="ts">
import { onMounted, provide, shallowRef, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RouterView, useRoute, useRouter } from 'vue-router'

import {
  currentLocale,
  elementPlusLocale,
  translate,
  type TranslationParams,
} from '@/i18n'
import { parseBpmnMetadata } from '@/modeler/bpmnMetadata'
import {
  modelerApplicationKey,
  type CreateModelInput,
  type ImportModelInput,
  type ModelerApplication,
  type ModelSnapshot,
} from '@/modeler/modelerApplication'
import {
  ModelerApiError,
  type ModelerCredentials,
  type ModelerModel,
  type ModelQuery,
} from '@/modeler/modelerApi'
import { createModelerClient, type ModelerClient } from '@/modeler/modelerClient'
import { editorJsonToXml, xmlToEditorJson } from '@/modeler/modelAdapters'
import {
  MODEL_TYPES,
  modelTypesForCategory,
  referenceModelTypes,
  type DecisionModelType,
  type ModelCategory,
} from '@/modeler/modelTypes'
import {
  EDITOR_ROUTE_NAMES,
  LIST_ROUTE_NAMES,
  editorRouteName,
  ROUTE_NAMES,
} from '@/routes'

const route = useRoute()
const router = useRouter()
const api = shallowRef<ModelerClient | null>(null)
const authenticated = ref(false)
const sessionRestoring = ref(true)
const authenticationPending = ref(true)
const modelMutationPending = ref(false)
const loginError = ref('')
const loginErrorKey = ref<string | null>(null)
const loginErrorParams = ref<TranslationParams>({})
const username = ref('')
const models = ref<ModelerModel[]>([])
const totalModels = ref(0)
const activeModel = ref<ModelerModel | null>(null)
const activeXml = ref('')
const referenceModels = ref<ModelerModel[]>([])
const currentQuery = ref<ModelQuery>(defaultListQuery())

interface SessionContext {
  client: ModelerClient
  generation: number
}

class SessionChangedError extends Error {
  constructor() {
    super(translate('shell.session.changed'))
    this.name = 'SessionChangedError'
  }
}

let authGeneration = 0
let listRequest = 0
let editorRequest = 0

function currentModelId() {
  const value = route.params.modelId
  return typeof value === 'string' ? value : ''
}

function routeCategory(): ModelCategory {
  if (route.name === ROUTE_NAMES.cases) return 'cases'
  if (route.name === ROUTE_NAMES.decisions) return 'decisions'
  return 'processes'
}

function routeDecisionType(): DecisionModelType {
  return route.query.type === 'service'
    ? MODEL_TYPES.decisionService
    : MODEL_TYPES.decisionTable
}

function defaultListQuery(): ModelQuery {
  return {
    sort: 'modifiedDesc',
    modelTypes: modelTypesForCategory(routeCategory(), routeDecisionType()),
  }
}

function isEditorRoute(modelId?: string) {
  return (
    EDITOR_ROUTE_NAMES.includes(route.name as (typeof EDITOR_ROUTE_NAMES)[number]) &&
    (!modelId || currentModelId() === modelId)
  )
}

function clearActiveModel() {
  editorRequest += 1
  activeModel.value = null
  activeXml.value = ''
  referenceModels.value = []
}

function redirectAfterLogin() {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return { name: ROUTE_NAMES.processes }
  }
  const resolved = router.resolve(redirect)
  if (
    !LIST_ROUTE_NAMES.includes(resolved.name as (typeof LIST_ROUTE_NAMES)[number]) &&
    !EDITOR_ROUTE_NAMES.includes(resolved.name as (typeof EDITOR_ROUTE_NAMES)[number])
  ) {
    return { name: ROUTE_NAMES.processes }
  }
  const redirectQuery = { ...resolved.query }
  delete redirectQuery.lang
  return { path: resolved.path, query: redirectQuery, hash: resolved.hash }
}

async function navigateToLogin(preserveEditorRoute = false) {
  if (route.name === ROUTE_NAMES.login) return
  const redirectQuery = { ...route.query }
  delete redirectQuery.lang
  const redirect =
    preserveEditorRoute && isEditorRoute()
      ? router.resolve({ path: route.path, query: redirectQuery, hash: route.hash }).fullPath
      : undefined
  await router.replace({
    name: ROUTE_NAMES.login,
    query: redirect ? { redirect } : undefined,
  })
}

function currentSession(): SessionContext | null {
  const client = api.value
  return client ? { client, generation: authGeneration } : null
}

function requireSession(): SessionContext {
  const context = currentSession()
  if (!context) throw new Error(translate('shell.auth.required'))
  return context
}

function isCurrentSession(context: SessionContext) {
  return context.client === api.value && context.generation === authGeneration
}

function assertCurrentSession(context: SessionContext) {
  if (!isCurrentSession(context)) throw new SessionChangedError()
}

function isAuthenticationError(error: unknown) {
  return error instanceof ModelerApiError && (error.status === 401 || error.status === 403)
}

function reportError(error: unknown, fallback: string) {
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

function clearLoginError() {
  loginErrorKey.value = null
  loginErrorParams.value = {}
  loginError.value = ''
}

function sessionOrReport(fallback: string) {
  try {
    return requireSession()
  } catch (error) {
    reportError(error, fallback)
    return null
  }
}

function setLoginError(
  message: string,
  messageKey: string | null = null,
  messageParams: TranslationParams = {},
) {
  loginErrorKey.value = messageKey
  loginErrorParams.value = { ...messageParams }
  loginError.value = message
}

function setTranslatedLoginError(messageKey: string, messageParams: TranslationParams = {}) {
  setLoginError(translate(messageKey, messageParams), messageKey, messageParams)
}

function setLoginErrorFrom(error: unknown, fallbackKey: string) {
  if (error instanceof ModelerApiError && error.messageKey) {
    setTranslatedLoginError(error.messageKey, error.messageParams)
  } else if (error instanceof Error) {
    setLoginError(error.message)
  } else {
    setTranslatedLoginError(fallbackKey)
  }
}

function resetSession(messageKey?: string) {
  authGeneration += 1
  listRequest += 1
  api.value = null
  authenticated.value = false
  authenticationPending.value = false
  modelMutationPending.value = false
  username.value = ''
  models.value = []
  totalModels.value = 0
  currentQuery.value = defaultListQuery()
  clearActiveModel()
  sessionRestoring.value = false
  if (messageKey) setTranslatedLoginError(messageKey)
  else clearLoginError()
}

function handleSessionError(error: unknown, context: SessionContext, fallback: string) {
  if (!isCurrentSession(context) || error instanceof SessionChangedError) return
  if (isAuthenticationError(error)) {
    resetSession('shell.auth.expired')
    return
  }
  reportError(error, fallback)
}

function replaceModel(updated: ModelerModel) {
  const index = models.value.findIndex((model) => model.id === updated.id)
  if (index >= 0) models.value[index] = updated
}

async function login(credentials: ModelerCredentials) {
  if (authenticationPending.value) return
  authenticationPending.value = true
  const generation = ++authGeneration
  clearLoginError()
  try {
    const candidate = createModelerClient()
    await candidate.authenticate(credentials)
    if (generation !== authGeneration) return
    const account = await candidate.getAccount()
    if (generation !== authGeneration) return
    const result = await candidate.listModels(currentQuery.value)
    if (generation !== authGeneration) return
    api.value = candidate
    username.value = account.id
    models.value = result.data
    totalModels.value = result.total
    authenticated.value = true
  } catch (error) {
    if (generation !== authGeneration) return
    if (isAuthenticationError(error)) setTranslatedLoginError('shell.auth.invalidCredentials')
    else setLoginErrorFrom(error, 'shell.auth.unavailable')
  } finally {
    if (generation === authGeneration) authenticationPending.value = false
  }
}

async function restoreSession() {
  const generation = ++authGeneration
  try {
    const candidate = createModelerClient()
    const account = await candidate.getAccount()
    if (generation !== authGeneration) return
    const result = await candidate.listModels(currentQuery.value)
    if (generation !== authGeneration) return
    api.value = candidate
    username.value = account.id
    models.value = result.data
    totalModels.value = result.total
    authenticated.value = true
  } catch (error) {
    if (generation !== authGeneration) return
    if (!isAuthenticationError(error)) {
      setLoginErrorFrom(error, 'shell.auth.unavailable')
    }
  } finally {
    if (generation === authGeneration) {
      sessionRestoring.value = false
      authenticationPending.value = false
    }
  }
}

async function logout() {
  if (authenticationPending.value) return
  const client = api.value
  if (!client) return

  authenticationPending.value = true
  const generation = ++authGeneration
  listRequest += 1
  api.value = null
  authenticated.value = false
  modelMutationPending.value = false
  username.value = ''
  models.value = []
  totalModels.value = 0
  currentQuery.value = defaultListQuery()
  clearActiveModel()
  clearLoginError()

  try {
    await client.logout()
  } catch (error) {
    if (generation === authGeneration) {
      setLoginErrorFrom(error, 'shell.auth.logoutFailed')
    }
  } finally {
    if (generation === authGeneration) authenticationPending.value = false
  }
}

async function loadModels(query: ModelQuery = currentQuery.value) {
  const context = currentSession()
  if (!context) return
  currentQuery.value = { ...query }
  const request = ++listRequest
  try {
    const result = await context.client.listModels(query, {
      showGlobalLoading: !Object.prototype.hasOwnProperty.call(query, 'filterText'),
    })
    assertCurrentSession(context)
    if (request !== listRequest) return
    models.value = result.data
    totalModels.value = result.total
  } catch (error) {
    if (request !== listRequest) return
    handleSessionError(error, context, translate('shell.models.loadFailed'))
  }
}

async function loadModelForRoute(id: string) {
  const context = currentSession()
  if (!context) return false
  const request = ++editorRequest
  try {
    const model = await context.client.getModel(id)
    assertCurrentSession(context)
    const editorDocument = await context.client.getEditorModel(id, model.modelType)
    assertCurrentSession(context)
    if (request !== editorRequest || !isEditorRoute(id)) {
      throw new SessionChangedError()
    }
    const expectedRoute = editorRouteName(model.modelType)
    if (route.name !== expectedRoute) {
      await router.replace({
        name: expectedRoute,
        params: { modelId: id },
        query: route.query,
      })
      assertCurrentSession(context)
    }
    const resolvedModel: ModelerModel = {
      ...model,
      name: editorDocument.name,
      key: editorDocument.key,
      description: editorDocument.description,
      lastUpdated: editorDocument.lastUpdated,
      lastUpdatedBy: editorDocument.lastUpdatedBy,
    }
    const referenceTypes = referenceModelTypes(model.modelType)
    const references = referenceTypes.length
      ? (
          await context.client.listModels(
            { sort: 'nameAsc', modelTypes: referenceTypes },
            { showGlobalLoading: false },
          )
        ).data
      : []
    assertCurrentSession(context)
    const xml = await editorJsonToXml(editorDocument.model, {
      model: resolvedModel,
      references,
    })
    assertCurrentSession(context)
    if (request !== editorRequest || !isEditorRoute(id)) {
      throw new SessionChangedError()
    }
    activeModel.value = resolvedModel
    referenceModels.value = references.filter((reference) => reference.id !== id)
    activeXml.value = xml
    return true
  } catch (error) {
    if (request === editorRequest) {
      handleSessionError(error, context, translate('shell.models.openFailed'))
    }
    return false
  }
}

async function createModel(input: CreateModelInput) {
  if (modelMutationPending.value) return
  const fallback = translate('shell.models.createFailed')
  const context = sessionOrReport(fallback)
  if (!context) return
  modelMutationPending.value = true
  try {
    const created = await context.client.createModel(input)
    assertCurrentSession(context)
    await router.push({
      name: editorRouteName(created.modelType),
      params: { modelId: created.id },
      query: route.query,
    })
  } catch (error) {
    handleSessionError(error, context, fallback)
  } finally {
    if (isCurrentSession(context)) modelMutationPending.value = false
  }
}

async function importModel(input: ImportModelInput) {
  if (modelMutationPending.value) return
  const fallback = translate('shell.models.importFailed')
  const context = sessionOrReport(fallback)
  if (!context) return
  modelMutationPending.value = true
  try {
    if (input.modelType !== MODEL_TYPES.process) {
      throw new Error(translate('shell.models.importUnsupported'))
    }
    const metadata = parseBpmnMetadata(input.xml)
    const references = (
      await context.client.listModels(
        {
          sort: 'nameAsc',
          modelTypes: referenceModelTypes(MODEL_TYPES.process),
        },
        { showGlobalLoading: false },
      )
    ).data
    assertCurrentSession(context)
    const importedModel: ModelerModel = {
      id: crypto.randomUUID(),
      name: input.name || metadata.name,
      key: input.key || metadata.key,
      description: input.description || metadata.description,
      createdBy: username.value,
      lastUpdatedBy: username.value,
      lastUpdated: 0,
      latestVersion: true,
      version: 1,
      comment: '',
      modelType: MODEL_TYPES.process,
      tenantId: '',
    }
    const editorJson = await xmlToEditorJson(input.xml, {
      model: importedModel,
      references,
    })
    assertCurrentSession(context)
    const created = await context.client.createModel({
      name: importedModel.name,
      key: importedModel.key,
      description: importedModel.description,
      modelType: MODEL_TYPES.process,
    })
    assertCurrentSession(context)
    const saved = await context.client.saveEditorModel(created.id, created.modelType, {
      name: importedModel.name,
      key: importedModel.key,
      description: importedModel.description,
      model: editorJson,
      lastUpdated: created.lastUpdated,
    })
    assertCurrentSession(context)
    const xml = await editorJsonToXml(editorJson, {
      model: saved,
      references,
    })
    assertCurrentSession(context)
    activeModel.value = saved
    referenceModels.value = references.filter((reference) => reference.id !== saved.id)
    activeXml.value = xml
    await router.push({
      name: ROUTE_NAMES.processEditor,
      params: { modelId: saved.id },
      query: route.query,
    })
    ElMessage.success(translate('shell.models.importSuccess', { fileName: input.fileName }))
  } catch (error) {
    handleSessionError(error, context, fallback)
  } finally {
    if (isCurrentSession(context)) modelMutationPending.value = false
  }
}

async function saveActiveModel(snapshot: ModelSnapshot) {
  const context = requireSession()
  const model = activeModel.value
  if (!model) throw new Error(translate('shell.models.currentMissing'))

  const modelForSave: ModelerModel = {
    ...model,
    name: snapshot.name,
    key: snapshot.key,
    description: snapshot.description,
  }
  const editorJson = await xmlToEditorJson(snapshot.xml, {
    model: modelForSave,
    references: referenceModels.value,
  })
  assertCurrentSession(context)
  const input = {
    name: snapshot.name,
    key: snapshot.key,
    description: snapshot.description,
    model: editorJson,
    lastUpdated: model.lastUpdated,
  }

  let saved: ModelerModel
  try {
    saved = await context.client.saveEditorModel(model.id, model.modelType, input)
  } catch (error) {
    if (!isCurrentSession(context)) throw new SessionChangedError()
    if (isAuthenticationError(error)) {
      resetSession('shell.auth.expired')
      throw new Error(translate('shell.auth.expired'))
    }
    if (!(error instanceof ModelerApiError) || error.status !== 409) throw error
    try {
      await ElMessageBox.confirm(
        translate('shell.conflict.message'),
        translate('shell.conflict.title'),
        {
          confirmButtonText: translate('shell.conflict.overwrite'),
          cancelButtonText: translate('shell.conflict.continueEditing'),
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          type: 'warning',
        },
      )
    } catch {
      throw new Error(translate('shell.conflict.saveCanceled'))
    }
    assertCurrentSession(context)
    try {
      saved = await context.client.saveEditorModel(model.id, model.modelType, {
        ...input,
        conflictResolveAction: 'overwrite',
      })
    } catch (overwriteError) {
      if (!isCurrentSession(context)) throw new SessionChangedError()
      if (isAuthenticationError(overwriteError)) {
        resetSession('shell.auth.expired')
        throw new Error(translate('shell.auth.expired'))
      }
      throw overwriteError
    }
  }

  assertCurrentSession(context)
  activeModel.value = saved
  replaceModel(saved)
  return { savedAt: saved.lastUpdated }
}

async function syncRouteState() {
  if (sessionRestoring.value) return

  if (!authenticated.value) {
    await navigateToLogin(isEditorRoute())
    return
  }

  if (route.name === ROUTE_NAMES.login) {
    await router.replace(redirectAfterLogin())
    return
  }
}

const modelerApplication: ModelerApplication = {
  authenticated,
  authenticationPending,
  modelMutationPending,
  loginError,
  username,
  models,
  totalModels,
  activeModel,
  activeXml,
  referenceModels,
  login,
  logout,
  loadModels,
  loadModelForRoute,
  createModel,
  importModel,
  saveActiveModel,
  clearActiveModel,
}

watch(currentLocale, () => {
  if (loginErrorKey.value) {
    loginError.value = translate(loginErrorKey.value, loginErrorParams.value)
  }
})

provide(modelerApplicationKey, modelerApplication)

watch(
  () => [sessionRestoring.value, authenticated.value, route.name, currentModelId()] as const,
  ([restoring, isAuthenticated, routeName], previous) => {
    if (
      !restoring &&
      isAuthenticated &&
      LIST_ROUTE_NAMES.includes(routeName as (typeof LIST_ROUTE_NAMES)[number]) &&
      EDITOR_ROUTE_NAMES.includes(previous?.[2] as (typeof EDITOR_ROUTE_NAMES)[number])
    ) {
      currentQuery.value = defaultListQuery()
      void loadModels(currentQuery.value)
    }
    void syncRouteState()
  },
  { immediate: true },
)

onMounted(() => {
  void restoreSession()
})
</script>

<template>
  <el-config-provider :locale="elementPlusLocale">
    <RouterView />
  </el-config-provider>
</template>
