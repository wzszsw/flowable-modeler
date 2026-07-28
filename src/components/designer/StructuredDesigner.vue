<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Check,
  Maximize2,
  Redo2,
  RefreshCw,
  Save,
  Undo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import CmmnModeler from 'cmmn-js/lib/Modeler'
import DmnModeler from 'dmn-js/lib/Modeler'

import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import type { ModelSnapshot } from '@/modeler/modelerApplication'
import type { ModelerModel } from '@/modeler/modelerApi'
import { MODEL_TYPES, type ModelType } from '@/modeler/modelTypes'
import {
  flowableCmmnModelerModule,
  flowableDmnDrdModelerModule,
} from '@/modeler/structuredModelerModules'

interface PersistenceResult {
  savedAt: number
}

interface DiagramElement {
  id: string
  type?: string
  businessObject?: Record<string, any>
}

interface ViewerService {
  on?: (event: string, callback: (event: any) => void) => void
  get?: (name: string) => any
}

const props = defineProps<{
  modelType: ModelType
  initialXml: string
  initialName: string
  initialKey: string
  initialDescription: string
  initialSavedAt?: number
  referenceModels: readonly ModelerModel[]
  persistModel: (snapshot: ModelSnapshot) => Promise<PersistenceResult>
}>()

const emit = defineEmits<{
  close: []
  saved: []
  openReference: [id: string]
}>()

const { t } = useI18n()
const shellRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)
const modeler = shallowRef<any>(null)
const selectedElement = shallowRef<DiagramElement | null>(null)
const ready = ref(false)
const loading = ref(true)
const saving = ref(false)
const dirty = ref(false)
const canUndo = ref(false)
const canRedo = ref(false)
const zoom = ref(1)
const revision = ref(0)
const name = ref(props.initialName)
const key = ref(props.initialKey)
const description = ref(props.initialDescription)
const selectedName = ref('')
const selectedReferenceId = ref('')
const lastSavedAt = ref(props.initialSavedAt || 0)

let disposed = false
let resizeObserver: ResizeObserver | null = null
let savePromise: Promise<boolean> | null = null

const isCmmn = computed(() => props.modelType === MODEL_TYPES.case)
const isDecisionTable = computed(() => props.modelType === MODEL_TYPES.decisionTable)
const isDecisionService = computed(() => props.modelType === MODEL_TYPES.decisionService)
const modelTypeLabel = computed(() => {
  if (isCmmn.value) return t('shell.modelTypes.case.singular')
  if (isDecisionTable.value) return t('shell.modelTypes.decisionTable.singular')
  return t('shell.modelTypes.decisionService.singular')
})
const savedStatus = computed(() =>
  dirty.value
    ? t('designer.structured.unsaved')
    : t('designer.structured.savedAt', {
        time: lastSavedAt.value
          ? new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(
              lastSavedAt.value,
            )
          : '--:--',
      }),
)

function activeViewer(): ViewerService | null {
  if (!modeler.value) return null
  return isCmmn.value ? modeler.value : modeler.value.getActiveViewer?.() || null
}

function service(name: string) {
  try {
    return activeViewer()?.get?.(name)
  } catch {
    return undefined
  }
}

function updateCommandState() {
  const commandStack = service('commandStack')
  canUndo.value = Boolean(commandStack?.canUndo?.())
  canRedo.value = Boolean(commandStack?.canRedo?.())
}

function markDirty() {
  if (!ready.value || saving.value) return
  revision.value += 1
  dirty.value = true
  updateCommandState()
}

function businessObject(element: DiagramElement | null) {
  return element?.businessObject || null
}

function cmmnDefinition(element: DiagramElement | null) {
  const object = businessObject(element)
  const reference = object?.definitionRef
  return reference && typeof reference === 'object' ? reference : object
}

function customAttribute(object: Record<string, any> | null, name: string) {
  return object?.$attrs?.[`flowablemodeler:${name}`] || ''
}

function selectedReferenceKey() {
  const object = isCmmn.value
    ? cmmnDefinition(selectedElement.value)
    : businessObject(selectedElement.value)
  if (!object) return ''
  if (object.$type === 'cmmn:ProcessTask') return String(object.processRef || '')
  if (object.$type === 'cmmn:CaseTask') return String(object.caseRef || '')
  if (object.$type === 'cmmn:DecisionTask') return String(object.decisionRef || '')
  return customAttribute(object, 'modelKey')
}

function hydrateSelection(element: DiagramElement | null) {
  selectedElement.value = element
  const object = isCmmn.value ? cmmnDefinition(element) : businessObject(element)
  selectedName.value = String(object?.name || '')
  const storedId = customAttribute(object, 'modelId')
  const referenceKey = selectedReferenceKey()
  selectedReferenceId.value =
    props.referenceModels.find((model) => model.id === storedId)?.id ||
    props.referenceModels.find((model) => model.key === referenceKey)?.id ||
    ''
}

const selectedObjectType = computed(() => {
  const object = isCmmn.value
    ? cmmnDefinition(selectedElement.value)
    : businessObject(selectedElement.value)
  return String(object?.$type || '')
})
const selectedLabel = computed(() => {
  const type = selectedObjectType.value
  const labels: Record<string, string> = {
    'cmmn:ProcessTask': t('designer.structured.processTask'),
    'cmmn:CaseTask': t('designer.structured.caseTask'),
    'cmmn:DecisionTask': t('designer.structured.decisionTask'),
    'cmmn:HumanTask': t('designer.structured.humanTask'),
    'cmmn:Stage': t('designer.structured.stage'),
    'dmn:Decision': t('designer.structured.decision'),
  }
  return labels[type] || modelTypeLabel.value
})
const selectedSupportsReference = computed(() =>
  [
    'cmmn:ProcessTask',
    'cmmn:CaseTask',
    'cmmn:DecisionTask',
    'dmn:Decision',
  ].includes(selectedObjectType.value),
)
const referenceOptions = computed(() => {
  const type = selectedObjectType.value
  if (type === 'cmmn:ProcessTask') {
    return props.referenceModels.filter((model) => model.modelType === MODEL_TYPES.process)
  }
  if (type === 'cmmn:CaseTask') {
    return props.referenceModels.filter((model) => model.modelType === MODEL_TYPES.case)
  }
  if (type === 'dmn:Decision') {
    return props.referenceModels.filter(
      (model) => model.modelType === MODEL_TYPES.decisionTable,
    )
  }
  return props.referenceModels.filter(
    (model) =>
      model.modelType === MODEL_TYPES.decisionTable ||
      model.modelType === MODEL_TYPES.decisionService,
  )
})

function bindViewer(viewer: ViewerService) {
  viewer.on?.('selection.changed', (event) => {
    hydrateSelection(event?.newSelection?.[0] || null)
  })
  viewer.on?.('commandStack.changed', markDirty)
}

function bindCmmn(instance: any) {
  const eventBus = instance.get('eventBus')
  bindViewer({
    on: (event, callback) => eventBus.on(event, callback),
    get: (name) => instance.get(name),
  })
}

function importCmmn(instance: any) {
  return new Promise<void>((resolve, reject) => {
    instance.importXML(props.initialXml, (error: Error | null) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

async function initialize() {
  if (!canvasRef.value) return
  if (isCmmn.value) {
    const instance = markRaw(
      new CmmnModeler({
        container: canvasRef.value,
        canvas: { deferUpdate: false },
        additionalModules: [flowableCmmnModelerModule],
      }),
    )
    modeler.value = instance
    bindCmmn(instance)
    await importCmmn(instance)
  } else {
    const instance = markRaw(
      new DmnModeler({
        container: canvasRef.value,
        drd: { additionalModules: [flowableDmnDrdModelerModule] },
      }),
    )
    modeler.value = instance
    instance.on('viewer.created', ({ viewer }: { viewer: ViewerService }) => bindViewer(viewer))
    await instance.importXML(props.initialXml)
  }
  if (disposed) return
  ready.value = true
  loading.value = false
  updateCommandState()
  await nextTick()
  fitCanvas()
  resizeObserver = new ResizeObserver(() => {
    service('canvas')?.resized?.()
  })
  resizeObserver.observe(canvasRef.value)
}

function updateMetadata() {
  revision.value += 1
  dirty.value = true
}

function updateSelectedName() {
  const element = selectedElement.value
  const object = isCmmn.value ? cmmnDefinition(element) : businessObject(element)
  if (!element || !object) return
  const modeling = service('modeling')
  if (!modeling?.updateProperties) return
  if (isCmmn.value) modeling.updateProperties(object, { name: selectedName.value }, element)
  else modeling.updateProperties(element, { name: selectedName.value })
}

function updatedReferenceProperties(model?: ModelerModel) {
  const properties: Record<string, unknown> = {}
  for (const name of ['modelId', 'modelName', 'modelKey', 'modelType']) {
    properties[`flowablemodeler:${name}`] = undefined
  }
  if (model) {
    properties['flowablemodeler:modelId'] = model.id
    properties['flowablemodeler:modelName'] = model.name
    properties['flowablemodeler:modelKey'] = model.key
    properties['flowablemodeler:modelType'] = String(model.modelType)
  }
  return properties
}

function updateSelectedReference() {
  const element = selectedElement.value
  const object = isCmmn.value ? cmmnDefinition(element) : businessObject(element)
  if (!element || !object) return
  const modeling = service('modeling')
  if (!modeling?.updateProperties) return
  const reference = props.referenceModels.find((model) => model.id === selectedReferenceId.value)
  const properties = updatedReferenceProperties(reference)
  if (object.$type === 'cmmn:ProcessTask') properties.processRef = reference?.key
  else if (object.$type === 'cmmn:CaseTask') properties.caseRef = reference?.key
  else if (object.$type === 'cmmn:DecisionTask') properties.decisionRef = reference?.key
  if (object.$type === 'dmn:Decision' && reference) {
    properties.name = reference.name
    selectedName.value = reference.name
  }
  if (isCmmn.value) modeling.updateProperties(object, properties, element)
  else modeling.updateProperties(element, properties)
}

function undo() {
  service('commandStack')?.undo?.()
  updateCommandState()
}

function redo() {
  service('commandStack')?.redo?.()
  updateCommandState()
}

function zoomBy(delta: number) {
  const canvas = service('canvas')
  if (!canvas?.zoom) return
  zoom.value = Math.min(2.5, Math.max(0.25, canvas.zoom() + delta))
  canvas.zoom(zoom.value)
}

function fitCanvas() {
  const canvas = service('canvas')
  if (!canvas?.zoom) return
  canvas.zoom('fit-viewport')
  zoom.value = Number(canvas.zoom()) || 1
}

function saveCmmnXml(instance: any) {
  return new Promise<string>((resolve, reject) => {
    instance.saveXML({ format: true, preamble: true }, (error: Error | null, xml: string) => {
      if (error) reject(error)
      else resolve(xml)
    })
  })
}

async function currentXml() {
  if (!modeler.value) return ''
  if (document.activeElement instanceof HTMLElement && shellRef.value?.contains(document.activeElement)) {
    document.activeElement.blur()
    await nextTick()
  }
  if (isCmmn.value) return saveCmmnXml(modeler.value)
  const result = await modeler.value.saveXML({ format: true, preamble: true })
  return result.xml || ''
}

async function performSave(showSuccess = true) {
  if (!ready.value || !modeler.value) return false
  saving.value = true
  const savedRevision = revision.value
  try {
    const xml = await currentXml()
    const result = await props.persistModel({
      xml,
      fileName: `${key.value}.${isCmmn.value ? 'cmmn' : 'dmn'}`,
      name: name.value.trim(),
      key: key.value.trim(),
      description: description.value.trim(),
    })
    lastSavedAt.value = result.savedAt
    dirty.value = revision.value !== savedRevision
    emit('saved')
    if (showSuccess) ElMessage.success(t('designer.save.success'))
    return true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('designer.errors.saveFailed'))
    return false
  } finally {
    saving.value = false
  }
}

function saveModel(showSuccess = true) {
  if (savePromise) return savePromise
  savePromise = performSave(showSuccess).finally(() => {
    savePromise = null
  })
  return savePromise
}

async function confirmClose() {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm(
      t('designer.leave.message'),
      t('designer.leave.title'),
      {
        confirmButtonText: t('designer.leave.saveAndReturn'),
        cancelButtonText: t('designer.leave.discard'),
        distinguishCancelAndClose: true,
        closeOnClickModal: false,
        type: 'warning',
      },
    )
    return saveModel(false)
  } catch (action) {
    return action === 'cancel'
  }
}

async function requestClose() {
  if (await confirmClose()) emit('close')
}

async function requestOpenReference() {
  const referenceId = selectedReferenceId.value
  if (!referenceId) return
  if (await saveModel(false)) emit('openReference', referenceId)
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  void initialize().catch((error) => {
    loading.value = false
    console.error('Failed to initialize structured modeler', error)
    ElMessage.error(error instanceof Error ? error.message : t('designer.errors.loadFailed'))
  })
})

onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  window.removeEventListener('beforeunload', handleBeforeUnload)
  const instance = modeler.value
  modeler.value = null
  instance?.destroy?.()
})

defineExpose({ confirmClose })
</script>

<template>
  <div
    ref="shellRef"
    class="structured-designer"
    :class="{ 'cmmn-designer': isCmmn }"
    data-testid="structured-designer"
  >
    <header class="designer-header">
      <div class="brand-block">
        <span class="brand-mark" aria-hidden="true"><Check :size="18" /></span>
        <span>
          <strong>Flowable Modeler</strong>
          <small>{{ modelTypeLabel }}</small>
        </span>
      </div>
      <div class="model-heading">
        <strong>{{ name || key }}</strong>
        <span>{{ key }}</span>
      </div>
      <div class="header-status">
        <LanguageSwitcher />
        <span class="status-dot" :class="{ dirty }" />
        <span>{{ savedStatus }}</span>
      </div>
    </header>

    <div class="designer-toolbar">
      <el-button text :icon="ArrowLeft" :disabled="saving" data-testid="back-to-models" @click="requestClose">
        {{ t('designer.toolbar.back') }}
      </el-button>
      <el-button type="primary" :icon="Save" :loading="saving" :disabled="!ready" data-testid="save-model" @click="saveModel()">
        {{ t('designer.toolbar.save') }}
      </el-button>
      <span class="toolbar-divider" />
      <el-button :icon="Undo2" :disabled="!canUndo || saving" :title="t('designer.toolbar.undo')" @click="undo" />
      <el-button :icon="Redo2" :disabled="!canRedo || saving" :title="t('designer.toolbar.redo')" @click="redo" />
      <template v-if="!isDecisionTable">
        <span class="toolbar-divider" />
        <el-button :icon="ZoomOut" :disabled="!ready" @click="zoomBy(-0.1)" />
        <span class="zoom-value">{{ Math.round(zoom * 100) }}%</span>
        <el-button :icon="ZoomIn" :disabled="!ready" @click="zoomBy(0.1)" />
        <el-button :icon="Maximize2" :disabled="!ready" :title="t('designer.toolbar.fit')" @click="fitCanvas" />
      </template>
    </div>

    <main class="designer-main">
      <section class="canvas-host" :class="{ 'decision-table-host': isDecisionTable }">
        <div ref="canvasRef" class="structured-canvas" />
        <div v-if="loading" class="canvas-loading" data-testid="structured-loading">
          <el-icon class="is-loading" :size="28"><RefreshCw /></el-icon>
          <span>{{ t('designer.loading.initializing') }}</span>
        </div>
      </section>

      <aside class="properties-panel">
        <div class="panel-section">
          <h2>{{ t('designer.structured.modelProperties') }}</h2>
          <el-form label-position="top" size="small">
            <el-form-item :label="t('shell.models.name')">
              <el-input v-model="name" data-testid="structured-model-name" @change="updateMetadata" />
            </el-form-item>
            <el-form-item :label="t('shell.models.key')">
              <el-input v-model="key" data-testid="structured-model-key" @change="updateMetadata" />
            </el-form-item>
            <el-form-item :label="t('shell.models.description')">
              <el-input v-model="description" type="textarea" :rows="3" resize="none" @change="updateMetadata" />
            </el-form-item>
          </el-form>
        </div>

        <div v-if="selectedElement && !isDecisionTable" class="panel-section selected-section">
          <h2>{{ selectedLabel }}</h2>
          <el-form label-position="top" size="small">
            <el-form-item :label="t('designer.structured.elementName')">
              <el-input v-model="selectedName" data-testid="structured-element-name" @change="updateSelectedName" />
            </el-form-item>
            <el-form-item v-if="selectedSupportsReference" :label="t('designer.structured.modelReference')">
              <div class="flex w-full items-center gap-2">
                <el-select
                  v-model="selectedReferenceId"
                  class="min-w-0 flex-1"
                  clearable
                  filterable
                  data-testid="structured-model-reference"
                  @change="updateSelectedReference"
                >
                  <el-option
                    v-for="reference in referenceOptions"
                    :key="reference.id"
                    :label="`${reference.name} (${reference.key})`"
                    :value="reference.id"
                  />
                </el-select>
                <el-button
                  :disabled="!selectedReferenceId || saving"
                  data-testid="open-structured-model-reference"
                  @click="requestOpenReference"
                >
                  {{ t('shell.models.open') }}
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </div>
        <el-empty v-else-if="!isDecisionTable" :description="t('designer.structured.selectElement')" :image-size="64" />
      </aside>
    </main>
  </div>
</template>

<style scoped>
.structured-designer { display: flex; width: 100%; height: 100%; flex-direction: column; color: #172033; background: #f7f8fb; }
.designer-header { display: grid; min-height: 64px; grid-template-columns: minmax(220px, 1fr) minmax(260px, 1.2fr) minmax(220px, 1fr); align-items: center; padding: 0 18px; border-bottom: 1px solid #e4e7ec; background: #fff; }
.brand-block { display: flex; min-width: 0; align-items: center; gap: 10px; }
.brand-block > span:last-child { display: flex; min-width: 0; flex-direction: column; }
.brand-block strong { color: #101828; font-size: 14px; }
.brand-block small { margin-top: 2px; color: #98a2b3; font-size: 11px; }
.brand-mark { display: grid; width: 36px; height: 36px; place-items: center; border-radius: 8px; color: #fff; background: #2563eb; }
.model-heading { min-width: 0; text-align: center; }
.model-heading strong, .model-heading span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-heading strong { font-size: 14px; }
.model-heading span { margin-top: 3px; color: #98a2b3; font-family: Consolas, monospace; font-size: 11px; }
.header-status { display: flex; align-items: center; justify-self: end; color: #667085; font-size: 12px; gap: 9px; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: #12b76a; }
.status-dot.dirty { background: #f79009; }
.designer-toolbar { display: flex; min-height: 48px; align-items: center; padding: 6px 14px; border-bottom: 1px solid #e4e7ec; gap: 6px; background: #fff; box-shadow: 0 2px 8px rgb(16 24 40 / 3%); z-index: 3; }
.designer-toolbar :deep(.el-button + .el-button) { margin-left: 0; }
.toolbar-divider { width: 1px; height: 24px; margin: 0 4px; background: #e4e7ec; }
.zoom-value { min-width: 52px; color: #667085; text-align: center; font-size: 12px; }
.designer-main { display: flex; min-height: 0; flex: 1; }
.canvas-host { position: relative; min-width: 0; flex: 1; overflow: hidden; background-color: #f8f9fc; background-image: linear-gradient(#eceff3 1px, transparent 1px), linear-gradient(90deg, #eceff3 1px, transparent 1px); background-size: 20px 20px; }
.decision-table-host { background: #fff; }
.structured-canvas { width: 100%; height: 100%; }
.canvas-loading { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; color: #667085; background: rgb(248 249 252 / 92%); gap: 12px; z-index: 5; }
.properties-panel { width: 330px; flex: 0 0 330px; overflow: auto; border-left: 1px solid #e4e7ec; background: #fff; box-shadow: -6px 0 20px rgb(16 24 40 / 4%); }
.panel-section { padding: 18px; border-bottom: 1px solid #eaecf0; }
.panel-section h2 { margin: 0 0 14px; color: #344054; font-size: 13px; font-weight: 650; letter-spacing: 0; }
.panel-section :deep(.el-form-item:last-child) { margin-bottom: 0; }
.selected-section { background: #fcfcfd; }
.cmmn-designer :deep(.djs-shape .djs-hit) { pointer-events: all; }
.cmmn-designer :deep(.djs-connection .djs-hit),
.cmmn-designer :deep(.djs-frame .djs-hit) { pointer-events: stroke; }

@media (max-width: 780px) {
  .designer-header { grid-template-columns: minmax(0, 1fr) auto; padding-inline: 12px; }
  .model-heading { display: none; }
  .header-status > span:last-child { display: none; }
  .designer-main { position: relative; }
  .properties-panel { position: absolute; inset: 0 0 0 auto; width: min(330px, calc(100% - 44px)); z-index: 2; }
  .designer-toolbar { overflow-x: auto; }
}
</style>
