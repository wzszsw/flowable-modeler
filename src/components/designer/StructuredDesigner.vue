<script setup lang="ts">
import {
  computed,
  markRaw,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
} from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  GitBranch,
  Pencil,
  Plus,
  Maximize2,
  Redo2,
  RefreshCw,
  Save,
  Trash2,
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

type CmmnMappingKind = 'in' | 'out'
type CmmnMappingSourceType = 'source' | 'sourceExpression'
type CmmnMappingTargetType = 'target' | 'targetExpression'

interface CmmnMapping {
  sourceType: CmmnMappingSourceType
  source: string
  targetType: CmmnMappingTargetType
  target: string
}

const FLOWABLE_CMMN_NAMESPACE = 'http://flowable.org/cmmn'

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
const selectedIsBlocking = ref(true)
const selectedBlockingExpression = ref('')
const selectedFallbackToDefaultTenant = ref(false)
const selectedSameDeployment = ref(false)
const selectedIdVariableName = ref('')
const selectedBusinessKey = ref('')
const selectedInheritBusinessKey = ref(false)
const selectedThrowErrorOnNoHits = ref(false)
const selectedDecisionFallbackToDefaultTenant = ref(false)
const inputMappings = ref<CmmnMapping[]>([])
const outputMappings = ref<CmmnMapping[]>([])
const mappingDialogVisible = ref(false)
const mappingKind = ref<CmmnMappingKind>('in')
const editingMappingIndex = ref<number | null>(null)
const mappingForm = reactive({
  sourceType: 'source' as CmmnMappingSourceType,
  source: '',
  targetType: 'target' as CmmnMappingTargetType,
  target: '',
})
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

function flowableAttribute(object: Record<string, any> | null, name: string) {
  return object?.$attrs?.[`flowable:${name}`] ?? object?.[`flowable:${name}`] ?? ''
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true'
}

function extensionValues(object: Record<string, any> | null) {
  return Array.isArray(object?.extensionElements?.values)
    ? (object.extensionElements.values as Record<string, any>[])
    : []
}

function extensionLocalName(value: Record<string, any>) {
  return String(
    value.$descriptor?.ns?.localName || value.$type || value.$name || '',
  ).replace(/^.*:/, '')
}

function extensionProperty(value: Record<string, any>, name: string) {
  return value[name] ?? value.$attrs?.[name] ?? ''
}

function cmmnMappings(object: Record<string, any> | null, kind: CmmnMappingKind) {
  return extensionValues(object)
    .filter((value) => extensionLocalName(value) === kind)
    .map((value): CmmnMapping => {
      const sourceExpression = String(extensionProperty(value, 'sourceExpression'))
      const targetExpression = String(extensionProperty(value, 'targetExpression'))
      return {
        sourceType: sourceExpression ? 'sourceExpression' : 'source',
        source: sourceExpression || String(extensionProperty(value, 'source')),
        targetType: targetExpression ? 'targetExpression' : 'target',
        target: targetExpression || String(extensionProperty(value, 'target')),
      }
    })
}

function decisionFieldValue(object: Record<string, any> | null, name: string) {
  const field = extensionValues(object).find(
    (value) =>
      extensionLocalName(value) === 'field' &&
      String(extensionProperty(value, 'name')) === name,
  )
  const child = Array.isArray(field?.$children) ? field.$children[0] : undefined
  return booleanValue(child?.$body ?? extensionProperty(field || {}, 'stringValue'))
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
  selectedIsBlocking.value = booleanValue(object?.isBlocking, true)
  selectedBlockingExpression.value = String(
    flowableAttribute(object, 'isBlockingExpression'),
  )
  selectedFallbackToDefaultTenant.value = booleanValue(
    flowableAttribute(object, 'fallbackToDefaultTenant'),
  )
  selectedSameDeployment.value = booleanValue(
    flowableAttribute(object, 'sameDeployment'),
  )
  selectedIdVariableName.value = String(flowableAttribute(object, 'idVariableName'))
  selectedBusinessKey.value = String(flowableAttribute(object, 'businessKey'))
  selectedInheritBusinessKey.value = booleanValue(
    flowableAttribute(object, 'inheritBusinessKey'),
  )
  selectedThrowErrorOnNoHits.value = decisionFieldValue(
    object,
    'decisionTaskThrowErrorOnNoHits',
  )
  selectedDecisionFallbackToDefaultTenant.value = decisionFieldValue(
    object,
    'fallbackToDefaultTenant',
  )
  inputMappings.value = cmmnMappings(object, 'in')
  outputMappings.value = cmmnMappings(object, 'out')
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
const selectedIsCmmnTask = computed(() =>
  ['cmmn:ProcessTask', 'cmmn:CaseTask', 'cmmn:DecisionTask'].includes(
    selectedObjectType.value,
  ),
)
const selectedIsChildTask = computed(() =>
  ['cmmn:ProcessTask', 'cmmn:CaseTask'].includes(selectedObjectType.value),
)
const selectedIsCaseTask = computed(() => selectedObjectType.value === 'cmmn:CaseTask')
const selectedIsDecisionTask = computed(
  () => selectedObjectType.value === 'cmmn:DecisionTask',
)
const mappingDialogTitle = computed(() =>
  mappingKind.value === 'in'
    ? t('designer.structured.inputMapping')
    : t('designer.structured.outputMapping'),
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
  viewer.on?.('commandStack.changed', () => {
    markDirty()
    if (selectedElement.value) hydrateSelection(selectedElement.value)
  })
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

function updateCmmnProperties(properties: Record<string, unknown>) {
  const element = selectedElement.value
  const object = cmmnDefinition(element)
  const modeling = service('modeling')
  if (!element || !object || !modeling?.updateProperties) return
  modeling.updateProperties(object, properties, element)
}

function updateBlockingProperties() {
  updateCmmnProperties({
    isBlocking: selectedIsBlocking.value,
    'flowable:isBlockingExpression': selectedBlockingExpression.value.trim() || undefined,
  })
}

function updateChildTaskProperties() {
  const properties: Record<string, unknown> = {
    'flowable:fallbackToDefaultTenant':
      selectedFallbackToDefaultTenant.value || undefined,
    'flowable:sameDeployment': selectedSameDeployment.value || undefined,
    'flowable:idVariableName': selectedIdVariableName.value.trim() || undefined,
  }
  if (selectedIsCaseTask.value) {
    properties['flowable:businessKey'] = selectedBusinessKey.value.trim() || undefined
    properties['flowable:inheritBusinessKey'] =
      selectedInheritBusinessKey.value || undefined
  }
  updateCmmnProperties(properties)
}

function createGenericElement(
  name: string,
  properties: Record<string, unknown>,
  children: Record<string, any>[] = [],
) {
  const moddle = service('moddle')
  if (!moddle?.createAny) return null
  const serializableProperties = Object.fromEntries(
    Object.entries(properties).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  )
  const value = moddle.createAny(
    `flowable:${name}`,
    FLOWABLE_CMMN_NAMESPACE,
    serializableProperties,
  )
  if (children.length) {
    value.$children = children
    for (const child of children) child.$parent = value
  }
  return value as Record<string, any>
}

function replaceExtensionValues(
  isManaged: (value: Record<string, any>) => boolean,
  replacements: Record<string, any>[],
) {
  const element = selectedElement.value
  const object = cmmnDefinition(element)
  const modeling = service('modeling')
  const moddle = service('moddle')
  if (!element || !object || !modeling?.updateProperties || !moddle?.create) return
  const existing = object.extensionElements as Record<string, any> | undefined
  const values = [...extensionValues(object).filter((value) => !isManaged(value)), ...replacements]
  if (existing) {
    for (const value of replacements) value.$parent = existing
    modeling.updateProperties(existing, { values }, element)
    return
  }
  if (!values.length) return
  const extensionElements = moddle.create('cmmn:ExtensionElements', { values })
  extensionElements.$parent = object
  for (const value of values) value.$parent = extensionElements
  modeling.updateProperties(object, { extensionElements }, element)
}

function createDecisionField(name: string, value: boolean) {
  const stringValue = createGenericElement('string', { $body: String(value) })
  return stringValue
    ? createGenericElement('field', { name }, [stringValue])
    : null
}

function updateDecisionTaskProperties() {
  const fieldNames = new Set([
    'decisionTaskThrowErrorOnNoHits',
    'fallbackToDefaultTenant',
  ])
  const fields = [
    createDecisionField(
      'decisionTaskThrowErrorOnNoHits',
      selectedThrowErrorOnNoHits.value,
    ),
    createDecisionField(
      'fallbackToDefaultTenant',
      selectedDecisionFallbackToDefaultTenant.value,
    ),
  ].filter((value): value is Record<string, any> => Boolean(value))
  replaceExtensionValues(
    (value) =>
      extensionLocalName(value) === 'field' &&
      fieldNames.has(String(extensionProperty(value, 'name'))),
    fields,
  )
}

function createMappingElement(kind: CmmnMappingKind, mapping: CmmnMapping) {
  return createGenericElement(kind, {
    source: mapping.sourceType === 'source' ? mapping.source : undefined,
    sourceExpression:
      mapping.sourceType === 'sourceExpression' ? mapping.source : undefined,
    target: mapping.targetType === 'target' ? mapping.target : undefined,
    targetExpression:
      mapping.targetType === 'targetExpression' ? mapping.target : undefined,
  })
}

function persistMappings(input: CmmnMapping[], output: CmmnMapping[]) {
  const values = [
    ...input.map((mapping) => createMappingElement('in', mapping)),
    ...output.map((mapping) => createMappingElement('out', mapping)),
  ].filter((value): value is Record<string, any> => Boolean(value))
  replaceExtensionValues(
    (value) => ['in', 'out'].includes(extensionLocalName(value)),
    values,
  )
}

function openMappingDialog(kind: CmmnMappingKind, index?: number) {
  const mappings = kind === 'in' ? inputMappings.value : outputMappings.value
  const mapping = index === undefined ? undefined : mappings[index]
  mappingKind.value = kind
  editingMappingIndex.value = index ?? null
  mappingForm.sourceType = mapping?.sourceType || 'source'
  mappingForm.source = mapping?.source || ''
  mappingForm.targetType = mapping?.targetType || 'target'
  mappingForm.target = mapping?.target || ''
  mappingDialogVisible.value = true
}

function saveMapping() {
  if (!mappingForm.source.trim()) {
    ElMessage.warning(t('designer.structured.mappingSourceRequired'))
    return
  }
  if (!mappingForm.target.trim()) {
    ElMessage.warning(t('designer.structured.mappingTargetRequired'))
    return
  }
  const mapping: CmmnMapping = {
    sourceType: mappingForm.sourceType,
    source: mappingForm.source.trim(),
    targetType: mappingForm.targetType,
    target: mappingForm.target.trim(),
  }
  const input = [...inputMappings.value]
  const output = [...outputMappings.value]
  const mappings = mappingKind.value === 'in' ? input : output
  if (editingMappingIndex.value === null) mappings.push(mapping)
  else mappings[editingMappingIndex.value] = mapping
  persistMappings(input, output)
  mappingDialogVisible.value = false
}

async function removeMapping(kind: CmmnMappingKind, index: number) {
  try {
    await ElMessageBox.confirm(
      t('designer.structured.confirmDeleteMapping'),
      t('designer.structured.deleteMapping'),
      {
        confirmButtonText: t('designer.structured.confirm'),
        cancelButtonText: t('designer.structured.cancel'),
        type: 'warning',
      },
    )
  } catch {
    return
  }
  const input = [...inputMappings.value]
  const output = [...outputMappings.value]
  ;(kind === 'in' ? input : output).splice(index, 1)
  persistMappings(input, output)
}

function mappingLabel(mapping: CmmnMapping) {
  return `${mapping.source} -> ${mapping.target}`
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

async function performSave(
  showSuccess = true,
  version: { newVersion?: boolean; comment?: string } = {},
) {
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
      ...version,
    })
    lastSavedAt.value = result.savedAt
    dirty.value = revision.value !== savedRevision
    emit('saved')
    if (showSuccess) {
      ElMessage.success(
        version.newVersion
          ? t('designer.save.newVersionSuccess')
          : t('designer.save.success'),
      )
    }
    return true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('designer.errors.saveFailed'))
    return false
  } finally {
    saving.value = false
  }
}

function saveModel(
  showSuccess = true,
  version: { newVersion?: boolean; comment?: string } = {},
) {
  if (savePromise) return savePromise
  savePromise = performSave(showSuccess, version).finally(() => {
    savePromise = null
  })
  return savePromise
}

async function saveNewVersion() {
  try {
    const result = await ElMessageBox.prompt(
      t('designer.save.newVersionMessage'),
      t('designer.save.newVersionTitle'),
      {
        inputType: 'textarea',
        inputPlaceholder: t('designer.save.versionCommentPlaceholder'),
        confirmButtonText: t('designer.save.createVersion'),
        cancelButtonText: t('designer.save.cancelVersion'),
      },
    )
    await saveModel(true, { newVersion: true, comment: result.value.trim() })
  } catch {
    // Cancel keeps the current editor state unchanged.
  }
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
      <el-button-group>
        <el-button type="primary" :icon="Save" :loading="saving" :disabled="!ready" data-testid="save-model" @click="saveModel()">
          {{ t('designer.toolbar.save') }}
        </el-button>
        <el-dropdown :disabled="!ready || saving" trigger="click">
          <el-button
            type="primary"
            :icon="ChevronDown"
            :disabled="!ready || saving"
            data-testid="save-model-menu"
            :aria-label="t('designer.toolbar.saveOptions')"
            :title="t('designer.toolbar.saveOptions')"
          />
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item data-testid="save-new-version" :icon="GitBranch" @click="saveNewVersion">
                {{ t('designer.toolbar.saveNewVersion') }}
              </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-button-group>
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
            <template v-if="selectedIsCmmnTask">
              <div class="task-options">
                <div class="switch-row">
                  <span>{{ t('designer.structured.blocking') }}</span>
                  <el-switch
                    v-model="selectedIsBlocking"
                    data-testid="cmmn-is-blocking"
                    @change="updateBlockingProperties"
                  />
                </div>
                <el-form-item :label="t('designer.structured.blockingExpression')">
                  <el-input
                    v-model="selectedBlockingExpression"
                    data-testid="cmmn-blocking-expression"
                    placeholder="${isBlocking}"
                    @change="updateBlockingProperties"
                  />
                </el-form-item>
              </div>

              <template v-if="selectedIsChildTask">
                <div class="switch-row">
                  <span>{{ t('designer.structured.fallbackTenant') }}</span>
                  <el-switch
                    v-model="selectedFallbackToDefaultTenant"
                    data-testid="cmmn-fallback-default-tenant"
                    @change="updateChildTaskProperties"
                  />
                </div>
                <div class="switch-row">
                  <span>{{ t('designer.structured.sameDeployment') }}</span>
                  <el-switch
                    v-model="selectedSameDeployment"
                    data-testid="cmmn-same-deployment"
                    @change="updateChildTaskProperties"
                  />
                </div>
                <el-form-item :label="t('designer.structured.idVariable')">
                  <el-input
                    v-model="selectedIdVariableName"
                    data-testid="cmmn-id-variable-name"
                    placeholder="instanceId"
                    @change="updateChildTaskProperties"
                  />
                </el-form-item>
                <template v-if="selectedIsCaseTask">
                  <el-form-item :label="t('designer.structured.businessKey')">
                    <el-input
                      v-model="selectedBusinessKey"
                      data-testid="cmmn-business-key"
                      placeholder="${businessKey}"
                      @change="updateChildTaskProperties"
                    />
                  </el-form-item>
                  <div class="switch-row">
                    <span>{{ t('designer.structured.inheritBusinessKey') }}</span>
                    <el-switch
                      v-model="selectedInheritBusinessKey"
                      data-testid="cmmn-inherit-business-key"
                      @change="updateChildTaskProperties"
                    />
                  </div>
                </template>

                <div class="mapping-header">
                  <span>{{ t('designer.structured.inputParameters') }}</span>
                  <el-button
                    link
                    type="primary"
                    :icon="Plus"
                    data-testid="add-cmmn-input-mapping"
                    @click="openMappingDialog('in')"
                  >
                    {{ t('designer.structured.add') }}
                  </el-button>
                </div>
                <div v-if="inputMappings.length" class="mapping-list">
                  <div
                    v-for="(mapping, index) in inputMappings"
                    :key="`${mapping.sourceType}:${mapping.source}:${mapping.targetType}:${mapping.target}:${index}`"
                    class="mapping-item"
                    data-testid="cmmn-input-mapping-row"
                  >
                    <div class="mapping-value">
                      <span>{{ mappingLabel(mapping) }}</span>
                      <small>flowable:in</small>
                    </div>
                    <el-button
                      link
                      :icon="Pencil"
                      :title="t('designer.structured.edit')"
                      :aria-label="t('designer.structured.edit')"
                      @click="openMappingDialog('in', index)"
                    />
                    <el-button
                      link
                      type="danger"
                      :icon="Trash2"
                      :title="t('designer.structured.deleteMapping')"
                      :aria-label="t('designer.structured.deleteMapping')"
                      @click="removeMapping('in', index)"
                    />
                  </div>
                </div>
                <div v-else class="empty-inline">
                  {{ t('designer.structured.noInputParameters') }}
                </div>

                <div class="mapping-header">
                  <span>{{ t('designer.structured.outputParameters') }}</span>
                  <el-button
                    link
                    type="primary"
                    :icon="Plus"
                    data-testid="add-cmmn-output-mapping"
                    @click="openMappingDialog('out')"
                  >
                    {{ t('designer.structured.add') }}
                  </el-button>
                </div>
                <div v-if="outputMappings.length" class="mapping-list">
                  <div
                    v-for="(mapping, index) in outputMappings"
                    :key="`${mapping.sourceType}:${mapping.source}:${mapping.targetType}:${mapping.target}:${index}`"
                    class="mapping-item"
                    data-testid="cmmn-output-mapping-row"
                  >
                    <div class="mapping-value">
                      <span>{{ mappingLabel(mapping) }}</span>
                      <small>flowable:out</small>
                    </div>
                    <el-button
                      link
                      :icon="Pencil"
                      :title="t('designer.structured.edit')"
                      :aria-label="t('designer.structured.edit')"
                      @click="openMappingDialog('out', index)"
                    />
                    <el-button
                      link
                      type="danger"
                      :icon="Trash2"
                      :title="t('designer.structured.deleteMapping')"
                      :aria-label="t('designer.structured.deleteMapping')"
                      @click="removeMapping('out', index)"
                    />
                  </div>
                </div>
                <div v-else class="empty-inline">
                  {{ t('designer.structured.noOutputParameters') }}
                </div>
              </template>

              <template v-if="selectedIsDecisionTask">
                <div class="switch-row">
                  <span>{{ t('designer.structured.throwErrorOnNoHits') }}</span>
                  <el-switch
                    v-model="selectedThrowErrorOnNoHits"
                    data-testid="cmmn-decision-throw-error-on-no-hits"
                    @change="updateDecisionTaskProperties"
                  />
                </div>
                <div class="switch-row">
                  <span>{{ t('designer.structured.fallbackTenant') }}</span>
                  <el-switch
                    v-model="selectedDecisionFallbackToDefaultTenant"
                    data-testid="cmmn-decision-fallback-default-tenant"
                    @change="updateDecisionTaskProperties"
                  />
                </div>
              </template>
            </template>
          </el-form>
        </div>
        <el-empty v-else-if="!isDecisionTable" :description="t('designer.structured.selectElement')" :image-size="64" />
      </aside>
    </main>

    <el-dialog
      v-model="mappingDialogVisible"
      :title="mappingDialogTitle"
      width="min(520px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('designer.structured.sourceType')">
          <el-radio-group v-model="mappingForm.sourceType">
            <el-radio-button value="source">
              {{ t('designer.structured.variable') }}
            </el-radio-button>
            <el-radio-button value="sourceExpression">
              {{ t('designer.structured.expression') }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('designer.structured.source')" required>
          <el-input
            v-model="mappingForm.source"
            data-testid="cmmn-mapping-source"
            :placeholder="mappingForm.sourceType === 'sourceExpression' ? '${source}' : 'sourceVariable'"
          />
        </el-form-item>
        <el-form-item :label="t('designer.structured.targetType')">
          <el-radio-group v-model="mappingForm.targetType">
            <el-radio-button value="target">
              {{ t('designer.structured.variable') }}
            </el-radio-button>
            <el-radio-button value="targetExpression">
              {{ t('designer.structured.expression') }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('designer.structured.target')" required>
          <el-input
            v-model="mappingForm.target"
            data-testid="cmmn-mapping-target"
            :placeholder="mappingForm.targetType === 'targetExpression' ? '${target}' : 'targetVariable'"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mappingDialogVisible = false">
          {{ t('designer.structured.cancel') }}
        </el-button>
        <el-button type="primary" data-testid="save-cmmn-mapping" @click="saveMapping">
          {{ t('designer.structured.confirm') }}
        </el-button>
      </template>
    </el-dialog>
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
.task-options { margin-top: 4px; padding-top: 14px; border-top: 1px solid #eaecf0; }
.switch-row { display: flex; min-height: 34px; align-items: center; justify-content: space-between; margin-bottom: 12px; gap: 12px; color: #475467; font-size: 12px; }
.mapping-header { display: flex; min-height: 36px; align-items: center; justify-content: space-between; margin-top: 10px; color: #344054; font-size: 12px; font-weight: 600; }
.mapping-header :deep(.el-button) { margin-left: 8px; }
.mapping-list { border-top: 1px solid #eaecf0; }
.mapping-item { display: flex; min-width: 0; min-height: 50px; align-items: center; border-bottom: 1px solid #eaecf0; gap: 2px; }
.mapping-value { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }
.mapping-value span { overflow: hidden; color: #344054; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.mapping-value small { color: #98a2b3; font-size: 10px; }
.empty-inline { padding: 8px 0 12px; color: #98a2b3; font-size: 12px; }
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
