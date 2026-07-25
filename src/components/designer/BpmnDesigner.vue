<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Modeler from 'bpmn-js/lib/Modeler'
import minimapModule from 'diagram-js-minimap'
import TokenSimulationModule from 'bpmn-js-token-simulation'
import gridModule from 'diagram-js-grid'
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus'
import {
  ArrowLeft,
  ArrowRight,
  CircleCheck,
  Clock,
  CopyDocument,
  Download,
  WarningFilled,
} from '@element-plus/icons-vue'

import DesignerToolbar from './DesignerToolbar.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import flowableDescriptor from '@/modeler/flowableDescriptor'
import { createDefaultDiagram } from '@/modeler/defaultDiagram'
import { isEmbeddedMode, type FlowableHostAdapter } from '@/modeler/integration'
import { resolveHostServiceTaskTypeNames } from '@/modeler/serviceTaskTypes'
import type { BpmnBusinessObject, DiagramElement, ValidationProblem } from '@/modeler/types'
import { validateElements } from '@/modeler/validation'
import { normalizeLegacyActivitiNamespace } from '@/modeler/xmlCompatibility'

type CanvasService = {
  zoom: (value?: number | string, center?: string) => number
  getRootElement: () => DiagramElement
  getRootElements: () => DiagramElement[]
  viewbox: (box?: CanvasViewboxRect) => CanvasViewbox
  resized: () => void
  addMarker: (elementId: string, marker: string) => void
  removeMarker: (elementId: string, marker: string) => void
  scrollToElement: (element: DiagramElement, padding?: number) => void
}

type CanvasViewboxRect = {
  x: number
  y: number
  width: number
  height: number
}

type CanvasViewbox = CanvasViewboxRect & {
  scale: number
}

type CommandStackService = {
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => void
  redo: () => void
}

type ElementRegistryService = {
  getAll: () => DiagramElement[]
  get: (id: string) => DiagramElement | undefined
}

type SelectionService = {
  get: () => DiagramElement[]
  select: (element: DiagramElement | DiagramElement[] | null) => void
}

type KeyboardService = {
  bind: () => void
  unbind: () => void
}

type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

type AlignElementsService = {
  trigger: (elements: DiagramElement[], alignment: Alignment) => void
}

type ToggleModeService = {
  toggleMode: (active?: boolean) => void
}

type EventBusService = {
  on: (event: string, callback: (event: Record<string, unknown>) => void) => void
}

interface ModelSnapshot {
  xml: string
  fileName: string
  name: string
  key: string
  description: string
}

interface ModelPersistenceResult {
  savedAt: string
}

type NativeImportXML = Modeler['importXML']
type ImportTarget = Parameters<NativeImportXML>[1]
type ImportResult = Awaited<ReturnType<NativeImportXML>>
type LeaveDecision = 'save' | 'discard' | 'stay'

interface ImportDiagramOptions {
  importedFileName?: string
  markClean?: boolean
  reportError?: boolean
}

const props = defineProps<{
  initialXml?: string
  initialFileName?: string
  initialSavedAt?: string
  persistModel?: (snapshot: ModelSnapshot) => Promise<ModelPersistenceResult>
}>()

const emit = defineEmits<{
  close: []
  saved: []
}>()

type BpmnDiagramDefinition = {
  id?: string
  plane?: BpmnPlaneDefinition
}

type BpmnPlaneDefinition = {
  bpmnElement?: { id?: string }
  $parent?: BpmnDiagramDefinition
}

type BpmnDefinitions = {
  diagrams?: BpmnDiagramDefinition[]
}

interface ImportSnapshot {
  definitions: ReturnType<Modeler['getDefinitions']> | null
  activeDiagramId?: string
  xml: string
  coherent: boolean
  canvasRoot: DiagramElement | null
  selectedElementId?: string
  selectionIds: string[]
  viewbox?: CanvasViewboxRect
  dirty: boolean
  fileName: string
  lastSavedAt: string
  importWarnings: string[]
  importWarningsDialogVisible: boolean
  problems: ValidationProblem[]
  problemsDrawerVisible: boolean
  commandRevision: number
}

const shellRef = ref<HTMLElement | null>(null)
const canvasHostRef = ref<HTMLElement | null>(null)
const canvasRef = ref<HTMLElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const modeler = shallowRef<Modeler | null>(null)
const rootElement = shallowRef<DiagramElement | null>(null)
const selectedElement = shallowRef<DiagramElement | null>(null)
const selectedElements = shallowRef<DiagramElement[]>([])
const hostAdapter = shallowRef<FlowableHostAdapter | null>(null)
const hostAdapterGeneration = ref(0)

const embeddedMode = isEmbeddedMode()

const ready = ref(false)
const loading = ref(true)
const loadingText = ref('正在初始化设计器…')
const initializationError = ref('')
const dirty = ref(false)
const fileName = ref(props.initialFileName || 'leave-request.bpmn20.xml')
const lastSavedAt = ref('')
const commandRevision = ref(0)
const canUndo = ref(false)
const canRedo = ref(false)
const zoom = ref(1)
const simulationActive = ref(false)
const propertyPanelVisible = ref(true)
const fullscreenActive = ref(false)
const importWarnings = ref<string[]>([])

const xmlDialogVisible = ref(false)
const xmlContent = ref('')
const previewDialogVisible = ref(false)
const previewSvg = ref('')
const leaveDialogVisible = ref(false)
const problemsDrawerVisible = ref(false)
const problems = ref<ValidationProblem[]>([])
const importWarningsDialogVisible = ref(false)
const pendingImportCount = ref(0)
const importStateCoherent = ref(true)
const saving = ref(false)

let importing = false
let importQueue: Promise<void> = Promise.resolve()
let savePromise: Promise<boolean> | null = null
let leaveDecisionPromise: Promise<LeaveDecision> | null = null
let resolveLeaveDecision: ((decision: LeaveDecision) => void) | null = null
let nativeImportXML: NativeImportXML | null = null
let resizeObserver: ResizeObserver | null = null

const importPending = computed(() => pendingImportCount.value > 0)
const interactionLocked = computed(
  () => saving.value || importPending.value || !ready.value || !importStateCoherent.value,
)

function asBusinessObject(value: unknown): BpmnBusinessObject | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<BpmnBusinessObject>
  return typeof candidate.$type === 'string' ? (candidate as BpmnBusinessObject) : null
}

function resolvePrimaryProcess() {
  const rootBusinessObject = rootElement.value?.businessObject
  let owner: BpmnBusinessObject | null = rootBusinessObject || null
  while (owner) {
    if (owner.$type === 'bpmn:Process') return owner
    owner = asBusinessObject(owner.$parent)
  }

  const participants = Array.isArray(rootBusinessObject?.participants)
    ? rootBusinessObject.participants
    : []
  for (const participant of participants) {
    const processRef = asBusinessObject(asBusinessObject(participant)?.processRef)
    if (processRef?.$type === 'bpmn:Process') return processRef
  }

  const definitions = modeler.value?.getDefinitions() as unknown as {
    rootElements?: unknown[]
  } | null
  const processes = (definitions?.rootElements || [])
    .map(asBusinessObject)
    .filter((element): element is BpmnBusinessObject => element?.$type === 'bpmn:Process')
  return processes.find((process) => process.isExecutable !== false) || processes[0] || null
}

const processName = computed(() => {
  commandRevision.value
  const process = resolvePrimaryProcess()
  return String(process?.name || process?.id || '未命名流程')
})
const processId = computed(() => {
  commandRevision.value
  return String(resolvePrimaryProcess()?.id || 'Process')
})
const processDescription = computed(() => {
  commandRevision.value
  const documentation = resolvePrimaryProcess()?.documentation
  if (!Array.isArray(documentation)) return ''
  return String(documentation[0]?.text || '').trim()
})
const selectedLabel = computed(() => {
  if (!selectedElement.value || selectedElement.value === rootElement.value) return '流程'
  return String(
    selectedElement.value.businessObject.name || selectedElement.value.businessObject.id || '未命名元素',
  )
})
const errorCount = computed(() => problems.value.filter((item) => item.level === 'error').length)
const warningCount = computed(() => problems.value.filter((item) => item.level === 'warning').length)
const savedStatus = computed(() => {
  if (importPending.value) return '正在载入流程'
  if (saving.value) return '正在保存模型'
  if (dirty.value) return '有未保存更改'
  if (lastSavedAt.value) return `已保存 ${lastSavedAt.value}`
  return '已就绪'
})

function service<T>(name: string) {
  if (!modeler.value) throw new Error('BPMN modeler is not ready')
  return modeler.value.get<T>(name)
}

function syncCommandState() {
  if (!modeler.value) return
  const commandStack = service<CommandStackService>('commandStack')
  canUndo.value = commandStack.canUndo()
  canRedo.value = commandStack.canRedo()
}

function setModelerKeyboardEnabled(instance: Modeler, enabled: boolean) {
  const keyboard = instance.get<KeyboardService>('keyboard')
  if (enabled) keyboard.bind()
  else keyboard.unbind()
}

function isInteractionReady() {
  return ready.value && !saving.value && !importPending.value && importStateCoherent.value
}

function assertImportStateCoherent() {
  if (!importStateCoherent.value) {
    throw new Error('BPMN 导入恢复失败，当前流程不可操作')
  }
}

function clearValidationMarkers() {
  if (!modeler.value) return
  const canvas = service<CanvasService>('canvas')
  const ids = new Set(problems.value.map((problem) => problem.elementId))
  for (const id of ids) {
    try {
      canvas.removeMarker(id, 'validation-error')
      canvas.removeMarker(id, 'validation-warning')
    } catch {
      // Root elements do not always have a rendered gfx node.
    }
  }
}

function resetValidation() {
  clearValidationMarkers()
  problems.value = []
}

function applyValidationMarkers(items: ValidationProblem[]) {
  if (!modeler.value) return
  const canvas = service<CanvasService>('canvas')
  const grouped = new Map<string, ValidationProblem['level']>()

  for (const problem of items) {
    const existing = grouped.get(problem.elementId)
    if (!existing || problem.level === 'error') grouped.set(problem.elementId, problem.level)
  }
  for (const [id, level] of grouped) {
    try {
      canvas.addMarker(id, level === 'error' ? 'validation-error' : 'validation-warning')
    } catch {
      // Root process markers may not have a visual representation.
    }
  }
}

function normalizeImportWarnings(warnings: unknown[] | undefined) {
  return (warnings || []).map((warning) => {
    if (warning instanceof Error) return warning.message
    if (warning && typeof warning === 'object' && 'message' in warning) {
      return String((warning as { message: unknown }).message)
    }
    return String(warning)
  })
}

function getCanvasRoot(instance: Modeler) {
  try {
    const canvas = instance.get<CanvasService>('canvas')
    if (!canvas.getRootElements().length) return null
    return canvas.getRootElement() || null
  } catch {
    return null
  }
}

function findActiveDiagram(
  definitions: ReturnType<Modeler['getDefinitions']>,
  canvasRoot: DiagramElement | null,
) {
  if (!definitions || !canvasRoot) return undefined
  const diagrams = (definitions as BpmnDefinitions).diagrams || []
  const activePlane = (canvasRoot as DiagramElement & { di?: BpmnPlaneDefinition }).di
  const exactDiagram = activePlane
    ? diagrams.find(
        (diagram) => diagram.plane === activePlane || diagram.id === activePlane.$parent?.id,
      )
    : undefined
  if (exactDiagram) return exactDiagram

  const rootOwners = new Set<object>()
  const rootOwnerIds = new Set<string>()
  let owner: ({ id?: string; $parent?: object } & object) | undefined = canvasRoot.businessObject
  while (owner && !rootOwners.has(owner)) {
    rootOwners.add(owner)
    if (owner.id) rootOwnerIds.add(owner.id)
    owner = owner.$parent as ({ id?: string; $parent?: object } & object) | undefined
  }
  return diagrams.find(
    (diagram) =>
      (diagram.plane?.bpmnElement && rootOwners.has(diagram.plane.bpmnElement)) ||
      (diagram.plane?.bpmnElement?.id && rootOwnerIds.has(diagram.plane.bpmnElement.id)),
  )
}

async function captureImportSnapshot(instance: Modeler): Promise<ImportSnapshot> {
  const definitions = instance.getDefinitions() || null
  const canvasRoot = getCanvasRoot(instance)
  const activeDiagram = definitions ? findActiveDiagram(definitions, canvasRoot) : undefined
  const selection = instance
    .get<SelectionService>('selection')
    .get()
    .map((element) => element.labelTarget || element)

  let xml = ''
  if (definitions) {
    xml = (await instance.saveXML({ format: true, preamble: true })).xml || ''
    if (!xml) throw new Error('无法创建当前流程的导入回滚快照')
  }

  let viewbox: CanvasViewboxRect | undefined
  if (canvasRoot) {
    try {
      const current = instance.get<CanvasService>('canvas').viewbox()
      viewbox = { x: current.x, y: current.y, width: current.width, height: current.height }
    } catch {
      // A diagram without a rendered plane has no restorable viewbox.
    }
  }

  return {
    definitions,
    activeDiagramId: activeDiagram?.id,
    xml,
    coherent: importStateCoherent.value,
    canvasRoot,
    selectedElementId: selectedElement.value?.id,
    selectionIds: [...new Set(selection.map((element) => element.id))],
    viewbox,
    dirty: dirty.value,
    fileName: fileName.value,
    lastSavedAt: lastSavedAt.value,
    importWarnings: [...importWarnings.value],
    importWarningsDialogVisible: importWarningsDialogVisible.value,
    problems: problems.value.map((problem) => ({ ...problem })),
    problemsDrawerVisible: problemsDrawerVisible.value,
    commandRevision: commandRevision.value,
  }
}

function restoreImportUiState(instance: Modeler, snapshot: ImportSnapshot) {
  const canvas = instance.get<CanvasService>('canvas')
  const restoredRoot = getCanvasRoot(instance)
  if (snapshot.canvasRoot && !restoredRoot) {
    throw new Error('原流程定义已恢复，但画布根元素未能重新渲染')
  }

  rootElement.value = restoredRoot
  const registry = instance.get<ElementRegistryService>('elementRegistry')
  const restoredSelection = snapshot.selectionIds
    .map((id) => registry.get(id))
    .filter((element): element is DiagramElement => Boolean(element))
  instance
    .get<SelectionService>('selection')
    .select(restoredSelection.length ? restoredSelection : null)
  selectedElements.value = restoredSelection
  selectedElement.value =
    (snapshot.selectedElementId && registry.get(snapshot.selectedElementId)) || restoredRoot

  if (snapshot.viewbox && restoredRoot) canvas.viewbox(snapshot.viewbox)
  zoom.value = restoredRoot ? canvas.zoom() : 1
  dirty.value = snapshot.dirty
  fileName.value = snapshot.fileName
  lastSavedAt.value = snapshot.lastSavedAt
  importWarnings.value = [...snapshot.importWarnings]
  importWarningsDialogVisible.value = snapshot.importWarningsDialogVisible
  problems.value = snapshot.problems.map((problem) => ({ ...problem }))
  problemsDrawerVisible.value = snapshot.problemsDrawerVisible
  applyValidationMarkers(problems.value)
  commandRevision.value = snapshot.commandRevision + 1
  syncCommandState()
}

async function restoreFailedImport(
  instance: Modeler,
  importXML: NativeImportXML,
  snapshot: ImportSnapshot,
) {
  if ((instance.getDefinitions() || null) !== snapshot.definitions) {
    if (!snapshot.definitions || !snapshot.xml) {
      throw new Error('导入已替换当前定义，但没有可重新导入的流程快照')
    }
    await importXML(snapshot.xml, snapshot.activeDiagramId)
  }

  restoreImportUiState(instance, snapshot)
}

function bindModelerEvents(instance: Modeler) {
  const eventBus = instance.get<EventBusService>('eventBus')

  eventBus.on('selection.changed', (event) => {
    const selection = (event.newSelection as DiagramElement[] | undefined) || []
    const selected = selection[0]
    selectedElements.value = [
      ...new Set(selection.map((element) => element.labelTarget || element)),
    ]
    selectedElement.value = selected?.labelTarget || selected || rootElement.value
  })

  eventBus.on('commandStack.changed', () => {
    commandRevision.value += 1
    syncCommandState()
    if (!importing) {
      dirty.value = true
      resetValidation()
    }
  })

  eventBus.on('canvas.viewbox.changed', (event) => {
    const viewbox = event.viewbox as { scale?: number } | undefined
    zoom.value = viewbox?.scale || service<CanvasService>('canvas').zoom()
  })

  eventBus.on('tokenSimulation.toggleMode', (event) => {
    simulationActive.value = Boolean(event.active)
  })

  eventBus.on('import.done', (event) => {
    if (importing || event.error) return
    const canvas = instance.get<CanvasService>('canvas')
    rootElement.value = canvas.getRootElement()
    selectedElement.value = rootElement.value
    selectedElements.value = []
    instance.get<SelectionService>('selection').select(null)
    importWarnings.value = normalizeImportWarnings(event.warnings as unknown[] | undefined)
    if (importWarnings.value.length) {
      ElNotification({
        title: '流程已载入，存在兼容提示',
        message: `bpmn-js 返回 ${importWarnings.value.length} 条导入提示；未识别内容再次导出时可能丢失。`,
        type: 'warning',
      })
    }
    dirty.value = false
    commandRevision.value += 1
    syncCommandState()
    resetValidation()
  })
}

function exposeIntegrationBridge(instance: Modeler) {
  nativeImportXML = instance.importXML.bind(instance)
  instance.importXML = ((xml: string, bpmnDiagram?: ImportTarget) =>
    enqueueDiagramImport(xml, {}, bpmnDiagram)) as NativeImportXML
  window.bpmnModeler = instance
  window.flowableProcessModeler = {
    getXML: getXml,
    importXML: async (xml: string, importedFileName?: string) => {
      return importDiagram(xml, { importedFileName, markClean: true })
    },
    validate: () => {
      runValidation(false)
      return [...problems.value]
    },
    saveModel,
    configureHost: (adapter) => {
      hostAdapterGeneration.value += 1
      hostAdapter.value = adapter ? markRaw(adapter) : null
    },
  }
}

async function performDiagramImport(
  instance: Modeler,
  importXML: NativeImportXML,
  xml: string,
  options: ImportDiagramOptions,
  bpmnDiagram?: ImportTarget,
): Promise<ImportResult> {
  importing = true
  let snapshot: ImportSnapshot
  try {
    snapshot = await captureImportSnapshot(instance)
  } catch (error) {
    importing = false
    throw error
  }
  resetValidation()
  importWarnings.value = []
  importWarningsDialogVisible.value = false

  try {
    const compatibility = normalizeLegacyActivitiNamespace(xml)
    const nativeResult = await importXML(compatibility.xml, bpmnDiagram)
    const result = compatibility.normalizedLegacyNamespace
      ? ({
          ...nativeResult,
          warnings: [
            ...(nativeResult.warnings || []),
            new Error(
              '已将旧 Activiti 扩展命名空间规范化为 http://flowable.org/bpmn',
            ),
          ],
        } as ImportResult)
      : nativeResult
    importWarnings.value = normalizeImportWarnings(result.warnings)
    const canvas = instance.get<CanvasService>('canvas')
    rootElement.value = canvas.getRootElement()
    selectedElement.value = rootElement.value
    selectedElements.value = []
    canvas.zoom('fit-viewport', 'auto')
    zoom.value = canvas.zoom()
    instance.get<SelectionService>('selection').select(null)
    if (options.importedFileName) fileName.value = normalizeFileName(options.importedFileName)
    dirty.value = options.markClean === false
    importStateCoherent.value = true
    commandRevision.value += 1
    syncCommandState()

    if (importWarnings.value.length) {
      ElNotification({
        title: '流程已载入，存在兼容提示',
        message: `导入包含 ${importWarnings.value.length} 条兼容处理或解析提示，请在保存前确认。`,
        type: 'warning',
      })
    }
    return result
  } catch (error) {
    let recoveryError: unknown
    try {
      await restoreFailedImport(instance, importXML, snapshot)
      importStateCoherent.value = snapshot.coherent
    } catch (rollbackError) {
      recoveryError = rollbackError
      importStateCoherent.value = false
    }
    const message = error instanceof Error ? error.message : String(error)
    const recoveryMessage = recoveryError
      ? `；原流程恢复失败：${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}`
      : ''
    if (options.reportError !== false) {
      ElNotification({
        title: 'BPMN 导入失败',
        message: `${message}${recoveryMessage}`,
        type: 'error',
        duration: 7000,
      })
    }
    throw error
  } finally {
    importing = false
  }
}

function enqueueDiagramImport(
  xml: string,
  options: ImportDiagramOptions = {},
  bpmnDiagram?: ImportTarget,
): Promise<ImportResult> {
  const instance = modeler.value
  const importXML = nativeImportXML
  if (!instance || !importXML) return Promise.reject(new Error('BPMN modeler is not ready'))

  const wasIdle = pendingImportCount.value === 0
  pendingImportCount.value += 1
  ready.value = false
  canUndo.value = false
  canRedo.value = false
  loading.value = true
  loadingText.value = '正在载入 BPMN 流程…'
  if (wasIdle) setModelerKeyboardEnabled(instance, false)

  const operation = importQueue.then(async () => {
    await nextTick()
    return performDiagramImport(instance, importXML, xml, options, bpmnDiagram)
  })
  const settledOperation = operation.finally(async () => {
    pendingImportCount.value -= 1
    if (pendingImportCount.value === 0) {
      loading.value = false
      ready.value = importStateCoherent.value && Boolean(rootElement.value)
      if (ready.value) setModelerKeyboardEnabled(instance, true)
    }
    await nextTick()
  })

  importQueue = settledOperation.then(
    () => undefined,
    () => undefined,
  )
  return settledOperation
}

function importDiagram(xml: string, options: ImportDiagramOptions = {}) {
  return enqueueDiagramImport(xml, options)
}

async function waitForQueuedImports() {
  while (pendingImportCount.value > 0) {
    const queuedImports = importQueue
    await queuedImports
    if (queuedImports === importQueue && pendingImportCount.value === 0) return
  }
}

async function loadInitialDiagram() {
  if (props.initialXml) {
    await importDiagram(props.initialXml, {
      importedFileName: props.initialFileName,
      reportError: false,
    })
    if (props.initialSavedAt) lastSavedAt.value = formatTime(props.initialSavedAt)
  } else {
    await importDiagram(createDefaultDiagram())
  }
}

async function initialize() {
  if (!canvasRef.value) return
  const instance = new Modeler({
    container: canvasRef.value,
    additionalModules: [minimapModule, TokenSimulationModule, gridModule],
    moddleExtensions: {
      flowable: flowableDescriptor,
    },
    minimap: {
      open: false,
    },
  })
  modeler.value = markRaw(instance)
  bindModelerEvents(instance)
  exposeIntegrationBridge(instance)
  await loadInitialDiagram()
  await waitForQueuedImports()
  await nextTick()
  window.dispatchEvent(
    new CustomEvent('flowable-modeler-ready', {
      detail: window.flowableProcessModeler,
    }),
  )

  resizeObserver = new ResizeObserver(() => {
    if (!modeler.value) return
    service<CanvasService>('canvas').resized()
  })
  if (canvasHostRef.value) resizeObserver.observe(canvasHostRef.value)
}

function handleInitializationError(error: unknown) {
  loading.value = false
  ready.value = false
  initializationError.value = error instanceof Error ? error.message : '无法载入 BPMN 流程模型'
}

function reloadPage() {
  window.location.reload()
}

async function performModelSave(showSuccess: boolean) {
  if (!modeler.value) return false
  assertImportStateCoherent()
  if (!props.persistModel) {
    throw new Error('嵌入模式不支持直接保存，请通过 getXML() 交由宿主持久化')
  }
  const instance = modeler.value
  saving.value = true
  setModelerKeyboardEnabled(instance, false)
  try {
    await commitActiveEditor()
    const savedRevision = commandRevision.value
    const { xml } = await instance.saveXML({ format: true, preamble: true })
    if (!xml) throw new Error('未生成 BPMN XML')
    const { savedAt } = await props.persistModel({
      xml,
      fileName: fileName.value,
      name: processName.value,
      key: processId.value,
      description: processDescription.value,
    })
    dirty.value = commandRevision.value !== savedRevision
    lastSavedAt.value = formatTime(savedAt)
    emit('saved')
    if (showSuccess) {
      ElMessage.success(dirty.value ? '当前快照已保存，仍有后续更改' : '流程模型已保存')
    }
    return true
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '保存失败')
    return false
  } finally {
    saving.value = false
    if (modeler.value === instance && ready.value && !importPending.value) {
      setModelerKeyboardEnabled(instance, true)
    }
  }
}

function persistCurrentModel(showSuccess = true) {
  if (savePromise) return savePromise
  if (!modeler.value) return Promise.resolve(false)
  assertImportStateCoherent()
  if (!isInteractionReady()) return Promise.resolve(false)
  const operation = performModelSave(showSuccess)
  savePromise = operation.finally(() => {
    savePromise = null
  })
  return savePromise
}

async function saveModel() {
  await persistCurrentModel()
}

function chooseLeaveDecision(decision: LeaveDecision) {
  const resolve = resolveLeaveDecision
  resolveLeaveDecision = null
  leaveDialogVisible.value = false
  resolve?.(decision)
}

function waitForLeaveDecision() {
  if (!leaveDecisionPromise) {
    leaveDialogVisible.value = true
    leaveDecisionPromise = new Promise<LeaveDecision>((resolve) => {
      resolveLeaveDecision = resolve
    }).finally(() => {
      leaveDecisionPromise = null
    })
  }
  return leaveDecisionPromise
}

function handleLeaveDialogClosed() {
  if (resolveLeaveDecision) chooseLeaveDecision('stay')
}

async function confirmClose() {
  if (embeddedMode) return false
  if (!isInteractionReady()) {
    ElMessage.warning('编辑器正在载入或保存，请稍后再离开')
    return false
  }
  try {
    await commitActiveEditor()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '无法提交当前编辑内容')
    return false
  }
  if (!dirty.value) return true
  const decision = await waitForLeaveDecision()
  if (decision === 'stay') return false
  if (decision === 'discard') return true
  return persistCurrentModel(false)
}

async function requestClose() {
  if (await confirmClose()) emit('close')
}

async function confirmDiscard() {
  if (!dirty.value) return true
  try {
    await ElMessageBox.confirm('导入会替换当前流程，未保存更改将丢失。', '导入 BPMN', {
      confirmButtonText: '继续导入',
      cancelButtonText: '取消',
      type: 'warning',
    })
    return true
  } catch {
    return false
  }
}

function chooseImportFile() {
  if (!isInteractionReady()) return
  fileInputRef.value?.click()
}

async function handleFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!isInteractionReady()) return
  if (!file || !(await confirmDiscard())) return

  const xml = await file.text()
  if (!isInteractionReady()) return
  try {
    await importDiagram(xml, { importedFileName: file.name, markClean: false })
    lastSavedAt.value = ''
    ElMessage.success(`已导入 ${file.name}`)
  } catch {
    // importDiagram already displayed the error.
  }
}

async function getXml() {
  if (!modeler.value) return ''
  await waitForQueuedImports()
  assertImportStateCoherent()
  await commitActiveEditor()
  const { xml } = await modeler.value.saveXML({ format: true, preamble: true })
  return xml || ''
}

async function commitActiveEditor() {
  const activeElement = document.activeElement
  if (
    activeElement instanceof HTMLElement &&
    shellRef.value?.contains(activeElement)
  ) {
    activeElement.blur()
    await nextTick()
  }
}

async function exportXml() {
  if (!isInteractionReady()) return
  const xml = await getXml()
  if (!xml) return
  downloadBlob(xml, normalizedExportName('bpmn20.xml'), 'application/xml;charset=utf-8')
  ElMessage.success('BPMN 2.0 XML 已导出')
}

async function exportSvg() {
  if (!modeler.value || !isInteractionReady()) return
  const { svg } = await modeler.value.saveSVG()
  if (!svg) return
  downloadBlob(svg, normalizedExportName('svg'), 'image/svg+xml;charset=utf-8')
  ElMessage.success('SVG 图片已导出')
}

async function exportPng() {
  if (!modeler.value || !isInteractionReady()) return
  const { svg } = await modeler.value.saveSVG()
  if (!svg) return
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const svgUrl = URL.createObjectURL(svgBlob)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = svgUrl
    await image.decode()
    const scale = 2
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, image.naturalWidth || image.width) * scale
    canvas.height = Math.max(1, image.naturalHeight || image.height) * scale
    const context = canvas.getContext('2d')
    if (!context) throw new Error('当前浏览器不支持 Canvas 导出')
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('PNG 图片生成失败')
    const url = URL.createObjectURL(png)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = normalizedExportName('png')
    anchor.click()
    URL.revokeObjectURL(url)
    ElMessage.success('PNG 图片已导出')
  } finally {
    URL.revokeObjectURL(svgUrl)
  }
}

async function showXml() {
  if (!isInteractionReady()) return
  xmlContent.value = await getXml()
  xmlDialogVisible.value = true
}

async function copyXml() {
  try {
    await navigator.clipboard.writeText(xmlContent.value)
    ElMessage.success('XML 已复制到剪贴板')
  } catch {
    ElMessage.warning('浏览器未授予剪贴板权限，请在编辑器中手动复制')
  }
}

async function showPreview() {
  if (!modeler.value || !isInteractionReady()) return
  const { svg } = await modeler.value.saveSVG()
  previewSvg.value = svg || ''
  previewDialogVisible.value = true
}

function runValidation(showDrawer = true) {
  if (!modeler.value) return
  assertImportStateCoherent()
  if (!isInteractionReady()) return
  clearValidationMarkers()
  const registry = service<ElementRegistryService>('elementRegistry')
  problems.value = validateElements(registry.getAll(), {
    allowedServiceTaskTypes: resolveHostServiceTaskTypeNames(hostAdapter.value),
  })
  applyValidationMarkers(problems.value)

  if (!problems.value.length) {
    ElNotification({ title: '流程校验通过', message: '未发现结构或 Flowable 配置问题。', type: 'success' })
    problemsDrawerVisible.value = false
  } else if (showDrawer) {
    problemsDrawerVisible.value = true
  }
}

function locateProblem(problem: ValidationProblem) {
  if (!isInteractionReady()) return
  const element = service<ElementRegistryService>('elementRegistry').get(problem.elementId)
  if (!element) return
  problemsDrawerVisible.value = false
  service<SelectionService>('selection').select(element)
  service<CanvasService>('canvas').scrollToElement(element, 140)
}

function toggleSimulation() {
  if (!modeler.value || !isInteractionReady()) return
  if (!simulationActive.value) {
    runValidation(false)
    if (errorCount.value) {
      problemsDrawerVisible.value = true
      ElMessage.warning('请先处理流程校验错误，再启动模拟')
      return
    }
  }
  service<ToggleModeService>('toggleMode').toggleMode()
}

function undo() {
  if (!isInteractionReady()) return
  service<CommandStackService>('commandStack').undo()
}

function redo() {
  if (!isInteractionReady()) return
  service<CommandStackService>('commandStack').redo()
}

function zoomBy(delta: number) {
  if (!isInteractionReady()) return
  const canvas = service<CanvasService>('canvas')
  const next = Math.min(4, Math.max(0.2, canvas.zoom() + delta))
  canvas.zoom(next)
  zoom.value = next
}

function fitCanvas() {
  if (!isInteractionReady()) return
  const canvas = service<CanvasService>('canvas')
  canvas.zoom('fit-viewport', 'auto')
  zoom.value = canvas.zoom()
}

function alignSelection(alignment: Alignment) {
  if (!isInteractionReady()) return
  const alignableElements = selectedElements.value.filter(
    (element) =>
      !element.waypoints &&
      !element.host &&
      typeof element.x === 'number' &&
      typeof element.y === 'number',
  )
  if (alignableElements.length < 2) {
    ElMessage.warning('请至少选择两个元素进行对齐')
    return
  }
  service<AlignElementsService>('alignElements').trigger(alignableElements, alignment)
}

async function togglePropertyPanel() {
  if (!isInteractionReady()) return
  propertyPanelVisible.value = !propertyPanelVisible.value
  await nextTick()
  service<CanvasService>('canvas').resized()
}

async function toggleFullscreen() {
  if (!shellRef.value) return
  if (!document.fullscreenElement) await shellRef.value.requestFullscreen()
  else await document.exitFullscreen()
}

function onFullscreenChange() {
  fullscreenActive.value = Boolean(document.fullscreenElement)
  nextTick(() => modeler.value && service<CanvasService>('canvas').resized())
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier) return
  if (embeddedMode && ['s', 'o'].includes(event.key.toLowerCase())) {
    event.preventDefault()
    return
  }
  if (event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (isInteractionReady()) void saveModel()
  }
  if (event.key.toLowerCase() === 'o') {
    event.preventDefault()
    chooseImportFile()
  }
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (embeddedMode || !dirty.value) return
  event.preventDefault()
}

function normalizeFileName(name: string) {
  const base = name.replace(/\.(bpmn20\.xml|bpmn|xml)$/i, '') || 'process'
  return `${base}.bpmn20.xml`
}

function normalizedExportName(extension: string) {
  const base = fileName.value.replace(/\.(bpmn20\.xml|bpmn|xml)$/i, '') || sanitizeFileName(processName.value)
  return `${base}.${extension}`
}

function sanitizeFileName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '-') || 'process'
}

function downloadBlob(content: string, name: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = name
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  void initialize().catch(handleInitializationError)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  delete window.bpmnModeler
  delete window.flowableProcessModeler
  nativeImportXML = null
  modeler.value?.destroy()
})

defineExpose({
  getXML: getXml,
  importXML: importDiagram,
  validate: runValidation,
  saveModel,
  confirmClose,
})
</script>

<template>
  <div
    ref="shellRef"
    class="designer-shell"
    :class="{
      'is-fullscreen': fullscreenActive,
      'is-embedded': embeddedMode,
      'is-importing': importPending,
      'is-interaction-locked': interactionLocked,
    }"
    :aria-busy="importPending || saving"
  >
    <header v-if="!embeddedMode" class="designer-header">
      <div class="brand-block">
        <div class="brand-mark" aria-hidden="true">
          <span class="brand-node node-a" />
          <span class="brand-node node-b" />
          <span class="brand-node node-c" />
          <span class="brand-link link-a" />
          <span class="brand-link link-b" />
        </div>
        <div>
          <div class="brand-title">Flowable Modeler</div>
          <div class="brand-subtitle">BPMN 2.0 · Engine 6.8.1</div>
        </div>
      </div>

      <div class="process-heading">
        <div class="flex items-center gap-2">
          <span class="process-name">{{ processName }}</span>
          <el-tag v-if="dirty" type="warning" size="small" effect="light">未保存</el-tag>
          <el-tag v-else type="success" size="small" effect="light">已保存</el-tag>
        </div>
        <div class="process-id">{{ processId }}</div>
      </div>

      <div class="header-status">
        <div class="status-dot" :class="{ dirty }" />
        <div>
          <div class="text-xs font-500 text-gray-600">{{ savedStatus }}</div>
          <div class="mt-1 text-[11px] text-gray-400">Ctrl+S 保存模型</div>
        </div>
      </div>
    </header>

    <DesignerToolbar
      :ready="ready && !saving"
      :saving="saving"
      :can-undo="canUndo"
      :can-redo="canRedo"
      :zoom="zoom"
      :simulation-active="simulationActive"
      :problem-count="problems.length"
      :embedded="embeddedMode"
      @back="requestClose"
      @save="saveModel"
      @import="chooseImportFile"
      @export-xml="exportXml"
      @export-svg="exportSvg"
      @export-png="exportPng"
      @preview="showPreview"
      @show-xml="showXml"
      @validate="runValidation"
      @simulate="toggleSimulation"
      @undo="undo"
      @redo="redo"
      @zoom-in="zoomBy(0.1)"
      @zoom-out="zoomBy(-0.1)"
      @fit="fitCanvas"
      @fullscreen="toggleFullscreen"
      @align="alignSelection"
    />

    <section
      v-if="initializationError"
      class="designer-initialization-error"
      data-testid="designer-initialization-error"
      role="alert"
    >
      <el-result
        icon="error"
        title="无法打开 BPMN 流程模型"
        :sub-title="initializationError"
      >
        <template #extra>
          <el-button
            v-if="!embeddedMode"
            type="primary"
            data-testid="return-from-load-error"
            @click="emit('close')"
          >
            返回流程模型
          </el-button>
          <el-button v-else type="primary" @click="reloadPage">重新加载</el-button>
        </template>
      </el-result>
    </section>

    <main
      v-else
      class="designer-main"
      :class="{ 'panel-open': propertyPanelVisible, 'is-importing': importPending }"
      :inert="interactionLocked"
      :aria-busy="importPending"
      :aria-disabled="interactionLocked"
    >
      <section ref="canvasHostRef" class="canvas-host">
        <div ref="canvasRef" class="bpmn-canvas" />

        <div v-if="loading" class="canvas-loading" role="status" aria-live="polite">
          <div class="loading-orbit"><span /></div>
          <div class="mt-4 text-sm text-gray-600">{{ loadingText }}</div>
        </div>

        <div class="canvas-statusbar">
          <span>当前：{{ selectedLabel }}</span>
          <span class="status-separator" />
          <span>{{ Math.round(zoom * 100) }}%</span>
          <template v-if="importWarnings.length">
            <span class="status-separator" />
            <button
              class="import-warning-link"
              :disabled="interactionLocked"
              @click="importWarningsDialogVisible = true"
            >
              {{ importWarnings.length }} 条导入提示
            </button>
          </template>
          <template v-if="simulationActive">
            <span class="status-separator" />
            <span class="text-emerald-600">模拟模式</span>
          </template>
        </div>

        <button
          class="panel-toggle"
          :title="propertyPanelVisible ? '收起属性面板' : '展开属性面板'"
          :disabled="interactionLocked"
          @click="togglePropertyPanel"
        >
          <el-icon><ArrowRight v-if="propertyPanelVisible" /><ArrowLeft v-else /></el-icon>
        </button>
      </section>

      <transition name="panel-slide">
        <section
          v-if="propertyPanelVisible"
          class="property-panel-host"
          :inert="interactionLocked"
          :aria-busy="importPending"
          :aria-disabled="interactionLocked"
        >
          <PropertiesPanel
            :modeler="ready ? modeler : null"
            :element="ready ? selectedElement : null"
            :revision="commandRevision"
            :host-adapter="hostAdapter"
            :host-adapter-generation="hostAdapterGeneration"
            @changed="commandRevision += 1"
          />
        </section>
      </transition>
    </main>

    <input
      ref="fileInputRef"
      class="hidden"
      type="file"
      accept=".bpmn,.xml,.bpmn20.xml,application/xml,text/xml"
      @change="handleFileChange"
    />

    <el-dialog v-model="xmlDialogVisible" title="BPMN 2.0 XML" width="78%" top="6vh">
      <div class="xml-toolbar">
        <div>
          <div class="text-sm font-600">Flowable XML</div>
          <div class="mt-1 text-xs text-gray-400">namespace: http://flowable.org/bpmn</div>
        </div>
        <div>
          <el-button :icon="CopyDocument" @click="copyXml">复制</el-button>
          <el-button :icon="Download" :disabled="!ready" @click="exportXml">下载 XML</el-button>
        </div>
      </div>
      <el-input
        v-model="xmlContent"
        class="xml-editor"
        type="textarea"
        :rows="26"
        resize="none"
        spellcheck="false"
      />
      <template #footer>
        <el-button @click="xmlDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="previewDialogVisible" title="流程预览" width="84%" top="5vh">
      <div class="preview-surface" v-html="previewSvg" />
      <template #footer>
        <el-button @click="previewDialogVisible = false">关闭</el-button>
        <el-button type="primary" :icon="Download" :disabled="!ready" @click="exportSvg">
          下载 SVG
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="leaveDialogVisible"
      title="返回流程模型"
      width="min(460px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      @closed="handleLeaveDialogClosed"
    >
      <p class="leave-dialog-message">当前流程有未保存更改。</p>
      <template #footer>
        <el-button @click="chooseLeaveDecision('stay')">继续编辑</el-button>
        <el-button type="danger" plain @click="chooseLeaveDecision('discard')">
          放弃更改
        </el-button>
        <el-button type="primary" @click="chooseLeaveDecision('save')">
          保存并返回
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importWarningsDialogVisible"
      title="BPMN 导入提示"
      width="min(680px, calc(100vw - 32px))"
      top="8vh"
    >
      <el-alert
        class="mb-3"
        type="warning"
        :closable="false"
        show-icon
        title="提示可能包含自动兼容处理或未识别 XML；请在保存前确认导出结果。"
      />
      <div class="import-warning-list">
        <div v-for="(warning, index) in importWarnings" :key="index" class="import-warning-item">
          <span>{{ index + 1 }}</span>
          <code>{{ warning }}</code>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="importWarningsDialogVisible = false">知道了</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="problemsDrawerVisible" title="流程校验" size="430px">
      <div class="validation-summary">
        <div class="validation-number error">{{ errorCount }}</div>
        <div>
          <div class="text-sm font-600">错误</div>
          <div class="text-xs text-gray-400">必须处理后再部署或模拟</div>
        </div>
        <div class="validation-number warning">{{ warningCount }}</div>
        <div>
          <div class="text-sm font-600">警告</div>
          <div class="text-xs text-gray-400">建议检查流程设计意图</div>
        </div>
      </div>

      <div v-if="problems.length" class="problem-list">
        <button
          v-for="problem in problems"
          :key="problem.id"
          class="problem-item"
          :disabled="!ready"
          @click="locateProblem(problem)"
        >
          <el-icon :class="problem.level">
            <WarningFilled v-if="problem.level === 'error'" />
            <CircleCheck v-else />
          </el-icon>
          <span class="min-w-0 flex-1 text-left">
            <span class="block text-sm text-gray-700">{{ problem.message }}</span>
            <span class="mt-1 block truncate text-xs text-gray-400">
              {{ problem.elementName }} · {{ problem.elementId }}
            </span>
          </span>
          <span class="text-xs text-blue-500">定位</span>
        </button>
      </div>
      <el-empty v-else description="流程校验通过" />

      <template #footer>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1 text-xs text-gray-400">
            <el-icon><Clock /></el-icon> 校验结果会在修改后自动清除
          </span>
          <el-button type="primary" :disabled="!ready" @click="runValidation">重新校验</el-button>
        </div>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.designer-shell {
  display: flex;
  width: 100%;
  height: 100%;
  flex-direction: column;
  background: #f7f8fb;
}

.designer-shell.is-interaction-locked :deep(.designer-toolbar),
.designer-shell.is-interaction-locked .property-panel-host,
.designer-shell.is-interaction-locked .panel-toggle {
  pointer-events: none;
  user-select: none;
}

.leave-dialog-message {
  margin: 0;
  color: #475467;
  line-height: 1.6;
}

.designer-shell.is-interaction-locked :deep(.designer-toolbar),
.designer-shell.is-interaction-locked .property-panel-host {
  opacity: 0.68;
}

.designer-header {
  display: grid;
  min-height: 64px;
  grid-template-columns: minmax(280px, 1fr) minmax(300px, 1.25fr) minmax(260px, 1fr);
  align-items: center;
  padding: 0 18px;
  border-bottom: 1px solid var(--app-border);
  background: #fff;
  z-index: 6;
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  position: relative;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  border-radius: 11px;
  background: linear-gradient(145deg, #155eef, #3538cd);
  box-shadow: 0 6px 16px rgb(37 99 235 / 24%);
}

.brand-node {
  position: absolute;
  z-index: 2;
  width: 7px;
  height: 7px;
  border: 2px solid #fff;
  border-radius: 50%;
  background: #84adff;
}

.node-a { left: 8px; top: 8px; }
.node-b { right: 8px; top: 15px; }
.node-c { left: 10px; bottom: 7px; }

.brand-link {
  position: absolute;
  z-index: 1;
  height: 2px;
  transform-origin: left center;
  background: rgb(255 255 255 / 80%);
}

.link-a { left: 14px; top: 13px; width: 14px; transform: rotate(27deg); }
.link-b { left: 14px; top: 16px; width: 13px; transform: rotate(102deg); }

.brand-title {
  color: #101828;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.brand-subtitle {
  margin-top: 2px;
  color: #98a2b3;
  font-size: 10px;
}

.process-heading {
  min-width: 0;
  justify-self: center;
  text-align: center;
}

.process-name {
  overflow: hidden;
  max-width: 340px;
  color: #1d2939;
  font-size: 15px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.process-id {
  overflow: hidden;
  max-width: 380px;
  margin-top: 3px;
  color: #98a2b3;
  font-family: Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.header-status {
  display: flex;
  align-items: center;
  justify-self: end;
  gap: 9px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #12b76a;
  box-shadow: 0 0 0 4px rgb(18 183 106 / 10%);
}

.status-dot.dirty {
  background: #f79009;
  box-shadow: 0 0 0 4px rgb(247 144 9 / 10%);
}

.designer-main {
  display: flex;
  min-height: 0;
  flex: 1;
}

.designer-initialization-error {
  display: grid;
  min-height: 0;
  flex: 1;
  place-items: center;
  padding: 24px;
  background: #f7f8fb;
}

.canvas-host {
  position: relative;
  z-index: 0;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  background-color: #f8f9fc;
  background-image:
    linear-gradient(#e9ecf2 1px, transparent 1px),
    linear-gradient(90deg, #e9ecf2 1px, transparent 1px),
    linear-gradient(#f1f3f7 1px, transparent 1px),
    linear-gradient(90deg, #f1f3f7 1px, transparent 1px);
  background-position: -1px -1px;
  background-size: 100px 100px, 100px 100px, 20px 20px, 20px 20px;
}

.bpmn-canvas {
  width: 100%;
  height: 100%;
}

.property-panel-host {
  width: 390px;
  height: 100%;
  flex: 0 0 390px;
  border-left: 1px solid var(--app-border);
  box-shadow: -8px 0 24px rgb(16 24 40 / 4%);
  z-index: 4;
}

.panel-toggle {
  position: absolute;
  top: 18px;
  right: 14px;
  z-index: 5;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid #dfe3ea;
  border-radius: 8px;
  color: #667085;
  background: rgb(255 255 255 / 95%);
  box-shadow: 0 4px 12px rgb(16 24 40 / 8%);
  cursor: pointer;
}

.panel-toggle:hover {
  color: var(--app-primary);
  border-color: #b2ccff;
  background: #eff6ff;
}

.canvas-loading {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: grid;
  place-content: center;
  justify-items: center;
  background: rgb(248 249 252 / 86%);
  backdrop-filter: blur(2px);
}

.loading-orbit {
  position: relative;
  width: 42px;
  height: 42px;
  border: 2px solid #d1e0ff;
  border-radius: 50%;
  animation: spin 1.1s linear infinite;
}

.loading-orbit span {
  position: absolute;
  top: -4px;
  left: 16px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--app-primary);
  box-shadow: 0 0 0 4px rgb(37 99 235 / 12%);
}

@keyframes spin { to { transform: rotate(360deg); } }

.canvas-statusbar {
  position: absolute;
  bottom: 14px;
  left: 18px;
  z-index: 3;
  display: flex;
  align-items: center;
  min-height: 28px;
  padding: 5px 10px;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  color: #667085;
  background: rgb(255 255 255 / 90%);
  box-shadow: 0 4px 12px rgb(16 24 40 / 5%);
  font-size: 11px;
  backdrop-filter: blur(5px);
}

.status-separator {
  width: 1px;
  height: 12px;
  margin: 0 8px;
  background: #d0d5dd;
}

.import-warning-link {
  padding: 0;
  border: 0;
  color: #b54708;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.import-warning-link:hover {
  color: #93370d;
  text-decoration: underline;
}

.import-warning-list {
  display: flex;
  max-height: 52vh;
  flex-direction: column;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.import-warning-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  padding: 10px 12px;
  border-bottom: 1px solid #f2f4f7;
  color: #667085;
  gap: 8px;
}

.import-warning-item:last-child { border-bottom: 0; }

.import-warning-item code {
  overflow-wrap: anywhere;
  color: #344054;
  font-family: Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.xml-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.xml-editor :deep(textarea) {
  color: #d0d5dd;
  border: 0;
  background: #101828;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  line-height: 1.65;
}

.preview-surface {
  display: grid;
  height: 70vh;
  place-items: center;
  overflow: auto;
  border: 1px solid #eaecf0;
  border-radius: 10px;
  background-color: #fafbfc;
  background-image:
    linear-gradient(#eef0f4 1px, transparent 1px),
    linear-gradient(90deg, #eef0f4 1px, transparent 1px);
  background-size: 20px 20px;
}

.preview-surface :deep(svg) {
  max-width: 95%;
  max-height: 95%;
}

.validation-summary {
  display: grid;
  grid-template-columns: 48px 1fr 48px 1fr;
  align-items: center;
  margin-bottom: 18px;
  padding: 14px;
  border-radius: 10px;
  background: #f8fafc;
  gap: 8px;
}

.validation-number {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  border-radius: 10px;
  font-size: 18px;
  font-weight: 700;
}

.validation-number.error { color: #d92d20; background: #fef3f2; }
.validation-number.warning { color: #dc6803; background: #fffaeb; }

.problem-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.problem-item {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 12px;
  border: 1px solid #eaecf0;
  border-radius: 9px;
  background: #fff;
  cursor: pointer;
  gap: 10px;
}

.problem-item:hover {
  border-color: #b2ccff;
  background: #f5f8ff;
}

.problem-item .error { color: #f04438; }
.problem-item .warning { color: #f79009; }

.fade-enter-active,
.fade-leave-active { transition: opacity 0.2s ease; }
.fade-enter-from,
.fade-leave-to { opacity: 0; }

.panel-slide-enter-active,
.panel-slide-leave-active { transition: width 0.2s ease, flex-basis 0.2s ease, opacity 0.15s ease; }
.panel-slide-enter-from,
.panel-slide-leave-to { width: 0; flex-basis: 0; opacity: 0; }

.is-fullscreen .designer-header {
  min-height: 58px;
}

@media (max-width: 767px) {
  .designer-header {
    min-height: 58px;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0 12px;
    gap: 10px;
  }

  .brand-block { gap: 8px; }
  .brand-mark {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }
  .brand-title { font-size: 13px; }
  .brand-subtitle { display: none; }
  .process-heading {
    justify-self: end;
    text-align: right;
  }
  .process-name {
    max-width: 110px;
    font-size: 13px;
  }
  .process-id { max-width: 150px; }
  .process-heading :deep(.el-tag) { display: none; }
  .header-status { display: none; }

  .designer-main { position: relative; }
  .property-panel-host {
    position: absolute;
    inset: 0 0 0 auto;
    width: calc(100% - 48px);
    max-width: 390px;
    height: 100%;
    flex-basis: auto;
  }
  .panel-open .panel-toggle {
    right: calc(100% - 40px);
  }
  .panel-toggle { top: 12px; }

  :global(.el-dialog) {
    width: calc(100% - 24px) !important;
  }
  :global(.el-drawer) {
    width: 100% !important;
    max-width: 430px;
  }
}
</style>
