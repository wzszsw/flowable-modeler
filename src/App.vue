<script setup lang="ts">
import { onMounted, provide, shallowRef, ref, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { RouterView, useRoute, useRouter } from 'vue-router'

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
const authenticating = ref(false)
const sessionRestoring = ref(!embeddedMode)
const loginError = ref('')
const username = ref('')
const models = ref<ProcessModel[]>([])
const totalModels = ref(0)
const listLoading = ref(false)
const activeModel = ref<ProcessModel | null>(null)
const activeXml = ref('')
const currentQuery = ref<ProcessModelQuery>({ sort: 'modifiedDesc' })

interface SessionContext {
  client: ModelerApi
  generation: number
}

class SessionChangedError extends Error {
  constructor() {
    super('登录状态已变化，请重新操作')
    this.name = 'SessionChangedError'
  }
}

const pendingOperations = new Set<symbol>()
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
  return redirect
}

async function navigateToLogin(preserveEditorRoute = false) {
  if (route.name === ROUTE_NAMES.login) return
  const redirect = preserveEditorRoute && isProcessEditorRoute() ? route.fullPath : undefined
  await router.replace({
    name: ROUTE_NAMES.login,
    query: redirect ? { redirect } : undefined,
  })
}

function requireSession(): SessionContext {
  const client = api.value
  if (!client) throw new Error('请先登录 Flowable Modeler')
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

function beginOperation() {
  const token = Symbol('model-operation')
  pendingOperations.add(token)
  listLoading.value = true
  return token
}

function finishOperation(token: symbol) {
  pendingOperations.delete(token)
  listLoading.value = pendingOperations.size > 0
}

function reportError(error: unknown, fallback: string) {
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

function resetSession(message = '') {
  authGeneration += 1
  listRequest += 1
  pendingOperations.clear()
  api.value = null
  authenticated.value = false
  authenticating.value = false
  username.value = ''
  models.value = []
  totalModels.value = 0
  listLoading.value = false
  clearActiveModel()
  sessionRestoring.value = false
  loginError.value = message
}

function handleSessionError(error: unknown, context: SessionContext, fallback: string) {
  if (!isCurrentSession(context) || error instanceof SessionChangedError) return
  if (isAuthenticationError(error)) {
    resetSession('认证已失效，请重新登录')
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
  authenticating.value = true
  loginError.value = ''
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
    loginError.value =
      isAuthenticationError(error)
        ? '用户名或密码错误'
        : error instanceof Error
          ? error.message
          : '无法连接 Flowable Modeler'
  } finally {
    if (generation === authGeneration) authenticating.value = false
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
      loginError.value = error instanceof Error ? error.message : '无法连接 Flowable Modeler'
    }
  } finally {
    if (generation === authGeneration) sessionRestoring.value = false
  }
}

async function logout() {
  const client = api.value
  if (!client || authenticating.value) return

  const generation = ++authGeneration
  listRequest += 1
  pendingOperations.clear()
  api.value = null
  authenticated.value = false
  authenticating.value = true
  username.value = ''
  models.value = []
  totalModels.value = 0
  listLoading.value = false
  clearActiveModel()
  loginError.value = ''

  try {
    await client.logout()
  } catch (error) {
    if (generation === authGeneration) {
      loginError.value = error instanceof Error ? error.message : '退出登录失败'
    }
  } finally {
    if (generation === authGeneration) authenticating.value = false
  }
}

async function loadModels(query: ProcessModelQuery = currentQuery.value) {
  const context = requireSession()
  currentQuery.value = { ...query }
  const request = ++listRequest
  const operation = beginOperation()
  try {
    const result = await context.client.listModels(query)
    assertCurrentSession(context)
    if (request !== listRequest) return
    models.value = result.data
    totalModels.value = result.total
  } catch (error) {
    if (request !== listRequest) return
    handleSessionError(error, context, '加载流程模型失败')
  } finally {
    finishOperation(operation)
  }
}

async function loadModelForRoute(id: string) {
  const context = requireSession()
  const request = ++editorRequest
  const operation = beginOperation()
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
      handleSessionError(error, context, '无法打开流程模型')
    }
    return false
  } finally {
    finishOperation(operation)
  }
}

async function createModel(input: CreateModelInput) {
  const context = requireSession()
  const operation = beginOperation()
  try {
    const created = await context.client.createModel(input)
    assertCurrentSession(context)
    await router.push({ name: ROUTE_NAMES.processEditor, params: { modelId: created.id } })
  } catch (error) {
    handleSessionError(error, context, '创建流程模型失败')
  } finally {
    finishOperation(operation)
  }
}

async function importModel(input: ImportModelInput) {
  const context = requireSession()
  const operation = beginOperation()
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
    await router.push({ name: ROUTE_NAMES.processEditor, params: { modelId: saved.id } })
    ElMessage.success(`已导入 ${input.fileName}`)
  } catch (error) {
    if (created) {
      try {
        await context.client.deleteModel(created.id)
      } catch {
        if (isCurrentSession(context)) {
          ElMessage.warning('导入失败，且未能清理已创建的空模型，请返回列表检查')
        }
      }
    }
    handleSessionError(error, context, '导入流程模型失败')
  } finally {
    finishOperation(operation)
  }
}

async function saveActiveModel(snapshot: ModelSnapshot) {
  const context = requireSession()
  const model = activeModel.value
  if (!model) throw new Error('当前流程模型不存在，无法保存')

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
      resetSession('认证已失效，请重新登录')
      throw new Error('认证已失效，请重新登录')
    }
    if (!(error instanceof ModelerApiError) || error.status !== 409) throw error
    try {
      await ElMessageBox.confirm(
        '服务器中的模型已被其他用户更新。覆盖会以当前编辑内容替换服务器版本。',
        '流程模型存在冲突',
        {
          confirmButtonText: '覆盖保存',
          cancelButtonText: '继续编辑',
          distinguishCancelAndClose: true,
          closeOnClickModal: false,
          type: 'warning',
        },
      )
    } catch {
      throw new Error('保存已取消，当前更改仍未保存')
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
        resetSession('认证已失效，请重新登录')
        throw new Error('认证已失效，请重新登录')
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
  const operation = beginOperation()
  try {
    await context.client.deleteModel(id)
    assertCurrentSession(context)
    models.value = models.value.filter((model) => model.id !== id)
    totalModels.value = Math.max(0, totalModels.value - 1)
    ElMessage.success('流程模型已删除')
  } catch (error) {
    handleSessionError(error, context, '删除流程模型失败')
  } finally {
    finishOperation(operation)
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
  authenticating,
  sessionRestoring,
  loginError,
  username,
  models,
  totalModels,
  listLoading,
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
  <RouterView />
</template>
