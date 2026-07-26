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
import { isEmbeddedMode } from '@/modeler/integration'
import {
  modelerApplicationKey,
  type CreateModelInput,
  type ImportModelInput,
  type ModelerApplication,
  type ModelSnapshot,
} from '@/modeler/modelerApplication'
import {
  ModelerApi,
  ModelerApiError,
  type ModelerCredentials,
  type ProcessModel,
  type ProcessModelQuery,
} from '@/modeler/modelerApi'
import { bpmnXmlToOryxJson, oryxJsonToBpmnXml } from '@/modeler/oryxConverter'
import { ROUTE_NAMES } from '@/routes'

const embeddedMode = isEmbeddedMode()
const route = useRoute()
const router = useRouter()
const api = shallowRef<ModelerApi | null>(null)
const authenticated = ref(false)
const sessionRestoring = ref(!embeddedMode)
const loginError = ref('')
const loginErrorKey = ref<string | null>(null)
const loginErrorParams = ref<TranslationParams>({})
const username = ref('')
const models = ref<ProcessModel[]>([])
const totalModels = ref(0)
const activeModel = ref<ProcessModel | null>(null)
const activeXml = ref('')
const currentQuery = ref<ProcessModelQuery>({ sort: 'modifiedDesc' })

interface SessionContext {
  client: ModelerApi
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

function isProcessEditorRoute(modelId?: string) {
  return (
    route.name === ROUTE_NAMES.processEditor &&
    (!modelId || currentModelId() === modelId)
  )
}

function clearActiveModel() {
  editorRequest += 1
  activeModel.value = null
  activeXml.value = ''
}

function redirectAfterLogin() {
  const redirect = route.query.redirect
  if (typeof redirect !== 'string' || !redirect.startsWith('/') || redirect.startsWith('//')) {
    return { name: ROUTE_NAMES.processes }
  }
  const resolved = router.resolve(redirect)
  if (
    resolved.name !== ROUTE_NAMES.processes &&
    resolved.name !== ROUTE_NAMES.processEditor
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
    preserveEditorRoute && isProcessEditorRoute()
      ? router.resolve({ path: route.path, query: redirectQuery, hash: route.hash }).fullPath
      : undefined
  await router.replace({
    name: ROUTE_NAMES.login,
    query: redirect ? { redirect } : undefined,
  })
}

function requireSession(): SessionContext {
  const client = api.value
  if (!client) throw new Error(translate('shell.auth.required'))
  return { client, generation: authGeneration }
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
  username.value = ''
  models.value = []
  totalModels.value = 0
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

function replaceModel(updated: ProcessModel) {
  const index = models.value.findIndex((model) => model.id === updated.id)
  if (index >= 0) models.value[index] = updated
}

async function login(credentials: ModelerCredentials) {
  const generation = ++authGeneration
  clearLoginError()
  const candidate = new ModelerApi()
  try {
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
  }
}

async function restoreSession() {
  const generation = ++authGeneration
  const candidate = new ModelerApi()
  try {
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
    if (generation === authGeneration) sessionRestoring.value = false
  }
}

async function logout() {
  const client = api.value
  if (!client) return

  const generation = ++authGeneration
  listRequest += 1
  api.value = null
  authenticated.value = false
  username.value = ''
  models.value = []
  totalModels.value = 0
  clearActiveModel()
  clearLoginError()

  try {
    await client.logout()
  } catch (error) {
    if (generation === authGeneration) {
      setLoginErrorFrom(error, 'shell.auth.logoutFailed')
    }
  }
}

async function loadModels(query: ProcessModelQuery = currentQuery.value) {
  const context = requireSession()
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
  const context = requireSession()
  const request = ++editorRequest
  try {
    const [model, editorDocument] = await Promise.all([
      context.client.getModel(id),
      context.client.getEditorModel(id),
    ])
    assertCurrentSession(context)
    if (request !== editorRequest || !isProcessEditorRoute(id)) {
      throw new SessionChangedError()
    }
    const xml = await oryxJsonToBpmnXml(editorDocument.model)
    assertCurrentSession(context)
    if (request !== editorRequest || !isProcessEditorRoute(id)) {
      throw new SessionChangedError()
    }
    activeModel.value = {
      ...model,
      name: editorDocument.name,
      key: editorDocument.key,
      description: editorDocument.description,
      lastUpdated: editorDocument.lastUpdated,
      lastUpdatedBy: editorDocument.lastUpdatedBy,
    }
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
  const context = requireSession()
  try {
    const created = await context.client.createModel(input)
    assertCurrentSession(context)
    await router.push({
      name: ROUTE_NAMES.processEditor,
      params: { modelId: created.id },
      query: route.query,
    })
  } catch (error) {
    handleSessionError(error, context, translate('shell.models.createFailed'))
  }
}

async function importModel(input: ImportModelInput) {
  const context = requireSession()
  let created: ProcessModel | null = null
  try {
    const metadata = parseBpmnMetadata(input.xml)
    const editorJson = await bpmnXmlToOryxJson(input.xml)
    assertCurrentSession(context)
    created = await context.client.createModel({
      name: input.name || metadata.name,
      key: input.key || metadata.key,
      description: input.description || metadata.description,
    })
    assertCurrentSession(context)
    const saved = await context.client.saveEditorModel(created.id, {
      name: input.name || metadata.name,
      key: input.key || metadata.key,
      description: input.description || metadata.description,
      model: editorJson,
      lastUpdated: created.lastUpdated,
    })
    assertCurrentSession(context)
    const xml = await oryxJsonToBpmnXml(editorJson)
    assertCurrentSession(context)
    activeModel.value = saved
    activeXml.value = xml
    await router.push({
      name: ROUTE_NAMES.processEditor,
      params: { modelId: saved.id },
      query: route.query,
    })
    ElMessage.success(translate('shell.models.importSuccess', { fileName: input.fileName }))
  } catch (error) {
    if (created) {
      try {
        await context.client.deleteModel(created.id)
      } catch {
        if (isCurrentSession(context)) {
          ElMessage.warning(translate('shell.models.importCleanupFailed'))
        }
      }
    }
    handleSessionError(error, context, translate('shell.models.importFailed'))
  }
}

async function saveActiveModel(snapshot: ModelSnapshot) {
  const context = requireSession()
  const model = activeModel.value
  if (!model) throw new Error(translate('shell.models.currentMissing'))

  const editorJson = await bpmnXmlToOryxJson(snapshot.xml, {
    preserveOryxSnapshot: true,
  })
  assertCurrentSession(context)
  const input = {
    name: snapshot.name,
    key: snapshot.key,
    description: snapshot.description,
    model: editorJson,
    lastUpdated: model.lastUpdated,
  }

  let saved: ProcessModel
  try {
    saved = await context.client.saveEditorModel(model.id, input)
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
      saved = await context.client.saveEditorModel(model.id, {
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

async function deleteModel(id: string) {
  const context = requireSession()
  try {
    await context.client.deleteModel(id)
    assertCurrentSession(context)
    models.value = models.value.filter((model) => model.id !== id)
    totalModels.value = Math.max(0, totalModels.value - 1)
    ElMessage.success(translate('shell.models.deleteSuccess'))
  } catch (error) {
    handleSessionError(error, context, translate('shell.models.deleteFailed'))
  }
}

async function syncRouteState() {
  if (embeddedMode) {
    if (route.name !== ROUTE_NAMES.embedded) {
      await router.replace({ name: ROUTE_NAMES.embedded })
    }
    return
  }
  if (sessionRestoring.value) return

  if (!authenticated.value) {
    await navigateToLogin(isProcessEditorRoute())
    return
  }

  if (route.name === ROUTE_NAMES.login) {
    await router.replace(redirectAfterLogin())
    return
  }

  if (route.name === ROUTE_NAMES.embedded) {
    await router.replace({ name: ROUTE_NAMES.processes })
  }
}

const modelerApplication: ModelerApplication = {
  authenticated,
  loginError,
  username,
  models,
  totalModels,
  activeModel,
  activeXml,
  login,
  logout,
  loadModels,
  loadModelForRoute,
  createModel,
  importModel,
  saveActiveModel,
  deleteModel,
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
      routeName === ROUTE_NAMES.processes &&
      previous?.[2] === ROUTE_NAMES.processEditor
    ) {
      currentQuery.value = { sort: 'modifiedDesc' }
      void loadModels(currentQuery.value)
    }
    void syncRouteState()
  },
  { immediate: true },
)

onMounted(() => {
  if (!embeddedMode) void restoreSession()
})
</script>

<template>
  <el-config-provider :locale="elementPlusLocale">
    <RouterView />
  </el-config-provider>
</template>
