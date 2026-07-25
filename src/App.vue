<script setup lang="ts">
import { shallowRef, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import LoginView from '@/components/auth/LoginView.vue'
import BpmnDesigner from '@/components/designer/BpmnDesigner.vue'
import ProcessModelList from '@/components/models/ProcessModelList.vue'
import { parseBpmnMetadata } from '@/modeler/bpmnMetadata'
import { isEmbeddedMode } from '@/modeler/integration'
import {
  ModelerApi,
  ModelerApiError,
  type ModelerCredentials,
  type ProcessModel,
  type ProcessModelQuery,
} from '@/modeler/modelerApi'
import { bpmnXmlToOryxJson, oryxJsonToBpmnXml } from '@/modeler/oryxConverter'

interface ModelSnapshot {
  xml: string
  fileName: string
  name: string
  key: string
  description: string
}

interface CreateModelInput {
  name: string
  key: string
  description: string
}

interface ImportModelInput extends CreateModelInput {
  xml: string
  fileName: string
}

const embeddedMode = isEmbeddedMode()
const api = shallowRef<ModelerApi | null>(null)
const authenticated = ref(false)
const authenticating = ref(false)
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
  activeModel.value = null
  activeXml.value = ''
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
  const candidate = new ModelerApi(credentials)
  try {
    const result = await candidate.listModels(currentQuery.value)
    if (generation !== authGeneration) return
    api.value = candidate
    username.value = credentials.username
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

function logout() {
  resetSession()
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

async function openModel(id: string) {
  const context = requireSession()
  const operation = beginOperation()
  try {
    const [model, editorDocument] = await Promise.all([
      context.client.getModel(id),
      context.client.getEditorModel(id),
    ])
    assertCurrentSession(context)
    const xml = await oryxJsonToBpmnXml(editorDocument.model)
    assertCurrentSession(context)
    activeModel.value = {
      ...model,
      name: editorDocument.name,
      key: editorDocument.key,
      description: editorDocument.description,
      lastUpdated: editorDocument.lastUpdated,
      lastUpdatedBy: editorDocument.lastUpdatedBy,
    }
    activeXml.value = xml
  } catch (error) {
    handleSessionError(error, context, '无法打开流程模型')
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
    await openModel(created.id)
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

function closeEditor() {
  activeModel.value = null
  activeXml.value = ''
  void loadModels()
}
</script>

<template>
  <BpmnDesigner v-if="embeddedMode" />
  <LoginView
    v-else-if="!authenticated"
    :busy="authenticating"
    :error="loginError"
    @login="login"
  />
  <BpmnDesigner
    v-else-if="activeModel"
    :key="activeModel.id"
    :initial-xml="activeXml"
    :initial-file-name="`${activeModel.key}.bpmn20.xml`"
    :initial-saved-at="activeModel.lastUpdated"
    :persist-model="saveActiveModel"
    @close="closeEditor"
  />
  <ProcessModelList
    v-else
    :models="models"
    :total="totalModels"
    :loading="listLoading"
    :username="username"
    @create="createModel"
    @import="importModel"
    @open="openModel"
    @delete="deleteModel"
    @query-change="loadModels"
    @refresh="loadModels()"
    @logout="logout"
  />
</template>
