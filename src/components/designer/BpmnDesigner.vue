<script setup lang="ts">
import { computed, markRaw, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
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

import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import DesignerToolbar from './DesignerToolbar.vue'
import PropertiesPanel from './PropertiesPanel.vue'
import {
  bpmnJsChineseCatalog,
  bpmnJsEnglishCatalog,
  type BpmnJsCatalogKey,
} from '@/i18n/locales/designer'
import flowableDescriptor from '@/modeler/flowableDescriptor'
import { FLOWABLE_FORMS_ENABLED } from '@/config/features'
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
  fire: (event: string, payload?: Record<string, unknown>) => unknown
}

type ContextPadService = {
  isOpen: () => boolean
  open: (target: DiagramElement | DiagramElement[], force?: boolean) => void
}

type PopupMenuService = {
  isOpen: () => boolean
  refresh: () => void
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

type MessageParams = Record<string, string | number>

type DiagnosticMessage =
  | { source: 'local'; key: string; params: MessageParams }
  | { source: 'external'; text: string }

class DesignerDiagnosticError extends Error {
  readonly key: string
  readonly params: MessageParams

  constructor(key: string, params: MessageParams, message: string) {
    super(message)
    this.name = 'DesignerDiagnosticError'
    this.key = key
    this.params = params
  }
}

const { t, locale } = useI18n()

const props = defineProps<{
  initialXml: string
  initialFileName?: string
  initialSavedAt?: string
  persistModel: (snapshot: ModelSnapshot) => Promise<ModelPersistenceResult>
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
  importWarnings: DiagnosticMessage[]
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
const ready = ref(false)
const loading = ref(true)
const loadingMessageKey = ref('designer.loading.initializing')
const loadingText = computed(() => t(loadingMessageKey.value))
const initializationError = ref<DiagnosticMessage | null>(null)
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
const importWarnings = ref<DiagnosticMessage[]>([])

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
let modelerDomObserver: MutationObserver | null = null
let modelerDomLocalizationFrame = 0
let disposed = false

const importPending = computed(() => pendingImportCount.value > 0)
const interactionLocked = computed(
  () => saving.value || importPending.value || !ready.value || !importStateCoherent.value,
)

function localDiagnostic(key: string, params: MessageParams = {}): DiagnosticMessage {
  return { source: 'local', key, params }
}

function externalDiagnostic(text: string): DiagnosticMessage {
  return { source: 'external', text }
}

function cloneDiagnostic(message: DiagnosticMessage): DiagnosticMessage {
  return message.source === 'local'
    ? localDiagnostic(message.key, { ...message.params })
    : externalDiagnostic(message.text)
}

function designerError(key: string, params: MessageParams = {}) {
  return new DesignerDiagnosticError(key, params, t(key, params))
}

function diagnosticFromError(error: unknown, fallbackKey: string): DiagnosticMessage {
  if (error instanceof DesignerDiagnosticError) {
    return localDiagnostic(error.key, { ...error.params })
  }
  if (error instanceof Error) return externalDiagnostic(error.message)
  if (typeof error === 'string' && error.trim()) return externalDiagnostic(error)
  return localDiagnostic(fallbackKey)
}

function diagnosticText(message: DiagnosticMessage) {
  return message.source === 'local' ? t(message.key, message.params) : message.text
}

function errorText(error: unknown, fallbackKey: string) {
  return diagnosticText(diagnosticFromError(error, fallbackKey))
}

function translateBpmn(
  template: string,
  replacements: Record<string, string | number> = {},
) {
  const catalog = (locale.value === 'en'
    ? bpmnJsEnglishCatalog
    : bpmnJsChineseCatalog) as Record<string, string>
  const translated = catalog[template as BpmnJsCatalogKey] || template
  return translated.replace(/\{([^}]+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : match,
  )
}

const bpmnI18nModule = {
  translate: ['value', translateBpmn],
}

function setOwnText(element: Element, value: string, trailingSpace = false) {
  const textNode = [...element.childNodes].find(
    (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
  )
  const nextValue = trailingSpace ? `${value} ` : value
  if (textNode) {
    if (textNode.textContent?.trim() !== value) textNode.textContent = nextValue
    return
  }
  element.insertBefore(document.createTextNode(nextValue), element.firstChild)
}

const tokenTitleKeys: Record<string, string> = {
  'Toggle Simulation Log': 'designer.bpmnDom.toggleSimulationLog',
  'Play/Pause Simulation': 'designer.bpmnDom.playPauseSimulation',
  'Reset Simulation': 'designer.bpmnDom.resetSimulation',
  'Set Sequence Flow': 'designer.bpmnDom.setSequenceFlow',
  'Trigger Event': 'designer.bpmnDom.triggerEvent',
  'Add pause point': 'designer.bpmnDom.addPausePoint',
  'Remove pause point': 'designer.bpmnDom.removePausePoint',
}

const tokenTextKeys: Record<string, string> = {
  'Found unsupported elements': 'designer.bpmnDom.unsupportedElements',
  'Not supported': 'designer.bpmnDom.notSupported',
  Finished: 'designer.bpmnDom.finished',
  'Pause Simulation': 'designer.bpmnDom.pauseSimulation',
  'Play Simulation': 'designer.bpmnDom.playSimulation',
  'Reset Simulation': 'designer.bpmnDom.resetSimulation',
}

const tokenElementFallbackKeys: Record<string, string> = {
  'bpmn:ServiceTask': 'designer.bpmnDom.serviceTask',
  'bpmn:UserTask': 'designer.bpmnDom.userTask',
  'bpmn:CallActivity': 'designer.bpmnDom.callActivity',
  'bpmn:ScriptTask': 'designer.bpmnDom.scriptTask',
  'bpmn:BusinessRuleTask': 'designer.bpmnDom.businessRuleTask',
  'bpmn:ManualTask': 'designer.bpmnDom.manualTask',
  'bpmn:ReceiveTask': 'designer.bpmnDom.receiveTask',
  'bpmn:SendTask': 'designer.bpmnDom.sendTask',
  'bpmn:Task': 'designer.bpmnDom.task',
  'bpmn:ExclusiveGateway': 'designer.bpmnDom.exclusiveGateway',
  'bpmn:ParallelGateway': 'designer.bpmnDom.parallelGateway',
  'bpmn:InclusiveGateway': 'designer.bpmnDom.inclusiveGateway',
  'bpmn:StartEvent': 'designer.bpmnDom.startEvent',
  'bpmn:IntermediateCatchEvent': 'designer.bpmnDom.intermediateEvent',
  'bpmn:IntermediateThrowEvent': 'designer.bpmnDom.intermediateEvent',
  'bpmn:BoundaryEvent': 'designer.bpmnDom.boundaryEvent',
  'bpmn:EndEvent': 'designer.bpmnDom.endEvent',
}

type TokenLifecycleState = 'started' | 'finished' | 'canceled'

function localizeTokenLifecycleText(container: HTMLElement, textElement: HTMLElement) {
  const state = container.dataset.designerLifecycleState as TokenLifecycleState | undefined
  const nameKey = container.dataset.designerLifecycleNameKey
  const rawName = container.dataset.designerLifecycleName
  if (!state || (!nameKey && !rawName)) return

  const key = {
    started: 'designer.bpmnDom.lifecycleStarted',
    finished: 'designer.bpmnDom.lifecycleFinished',
    canceled: 'designer.bpmnDom.lifecycleCanceled',
  }[state]
  const name = nameKey ? t(nameKey) : rawName!
  const text = t(key, { name })
  if (textElement.textContent !== text) textElement.textContent = text
  textElement.setAttribute('title', text)
}

function localizeTokenSimulationDom(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('.bts-toggle-mode').forEach((element) => {
    setOwnText(element, t('designer.bpmnDom.tokenSimulation'), true)
  })

  root.querySelectorAll<HTMLElement>('.bts-header').forEach((element) => {
    setOwnText(element, t('designer.bpmnDom.simulationLog'))
  })
  root.querySelectorAll<HTMLElement>('.bts-close').forEach((element) => {
    element.setAttribute('aria-label', t('designer.bpmnDom.close'))
  })
  root.querySelectorAll<HTMLElement>('.bts-log .bts-entry.placeholder').forEach((element) => {
    const text = t('designer.bpmnDom.noEntries')
    if (element.textContent !== text) element.textContent = text
  })

  root.querySelectorAll<HTMLElement>('.bts-entry[title], .bts-context-pad[title]').forEach((element) => {
    if (!element.dataset.designerI18nKey) {
      const key = tokenTitleKeys[element.getAttribute('title') || '']
      if (key) element.dataset.designerI18nKey = key
    }
    if (element.dataset.designerI18nKey) {
      element.setAttribute('title', t(element.dataset.designerI18nKey))
    }
  })

  const speedKeys: Record<string, string> = {
    '0.5': 'designer.bpmnDom.animationSpeedSlow',
    '1': 'designer.bpmnDom.animationSpeedNormal',
    '2': 'designer.bpmnDom.animationSpeedFast',
  }
  root.querySelectorAll<HTMLElement>('.bts-animation-speed-button[data-speed]').forEach((element) => {
    const key = speedKeys[element.dataset.speed || '']
    if (key) element.setAttribute('title', t(key))
  })

  root.querySelectorAll<HTMLElement>('.bts-scopes .bts-scope[title]').forEach((element) => {
    if (!element.dataset.designerProcessInstanceId) {
      const match = element.getAttribute('title')?.match(/^Focus process instance (.+)$/)
      if (match?.[1]) element.dataset.designerProcessInstanceId = match[1]
    }
    if (element.dataset.designerProcessInstanceId) {
      element.setAttribute(
        'title',
        t('designer.bpmnDom.focusProcessInstance', {
          id: element.dataset.designerProcessInstanceId,
        }),
      )
    }
  })

  root
    .querySelectorAll<HTMLElement>('.bts-notification .bts-text, .bts-element-notification .bts-text')
    .forEach((element) => {
      if (!element.dataset.designerI18nKey) {
        const key = tokenTextKeys[element.textContent?.trim() || '']
        if (key) element.dataset.designerI18nKey = key
      }
    })

  root.querySelectorAll<HTMLElement>('.bts-text[data-designer-i18n-key]').forEach((element) => {
    const text = t(element.dataset.designerI18nKey!)
    if (element.textContent !== text) element.textContent = text
    element.setAttribute('title', text)
  })

  root.querySelectorAll<HTMLElement>('.bts-notification').forEach((notification) => {
    const textElement = notification.querySelector<HTMLElement>('.bts-text')
    if (textElement) localizeTokenLifecycleText(notification, textElement)
  })

  root.querySelectorAll<HTMLElement>('.bts-log .bts-entry:not(.placeholder)').forEach((entry) => {
    const textElement = entry.querySelector<HTMLElement>('.bts-text')
    if (textElement) localizeTokenLifecycleText(entry, textElement)
  })
}

function markTokenTraceDom(event: Record<string, unknown>) {
  if (event.action !== 'exit') return
  const element = event.element as DiagramElement | undefined
  const businessObject = element?.businessObject
  const elementType = businessObject?.$type || element?.type
  const key = elementType ? tokenElementFallbackKeys[elementType] : undefined
  if (!element || !key || businessObject?.name) return

  const elementScope = event.scope as { parent?: { id?: string } } | undefined
  const scopeId = elementScope?.parent?.id
  const root = canvasRef.value
  if (!scopeId || !root) return

  const logEntries = [...root.querySelectorAll<HTMLElement>('.bts-log .bts-entry[data-scope-id]')]
    .filter((entry) => entry.dataset.scopeId === String(scopeId))
  const notifications = [...root.querySelectorAll<HTMLElement>('.bts-notification')]
    .filter(
      (notification) =>
        notification.querySelector<HTMLElement>('.bts-scope')?.textContent?.trim() ===
        String(scopeId),
    )

  for (const container of [logEntries.at(-1), notifications.at(-1)]) {
    const textElement = container?.querySelector<HTMLElement>('.bts-text')
    if (textElement) textElement.dataset.designerI18nKey = key
  }
  scheduleModelerDomLocalization()
}

function markTokenLifecycleDom(
  event: Record<string, unknown>,
  state: TokenLifecycleState,
) {
  const scope = event.scope as
    | { id?: string; completed?: boolean; element?: DiagramElement }
    | undefined
  const scopeElement = scope?.element
  const businessObject = scopeElement?.businessObject
  const elementType = businessObject?.$type || scopeElement?.type
  if (!scope?.id || !scopeElement) return

  let nameKey = ''
  let name = ''
  if (elementType === 'bpmn:Process' || elementType === 'bpmn:Participant') {
    nameKey = 'designer.bpmnDom.lifecycleProcess'
  } else if (elementType === 'bpmn:SubProcess') {
    name = businessObject?.name?.trim() || ''
    if (!name) nameKey = 'designer.bpmnDom.lifecycleSubProcess'
  } else {
    return
  }

  const root = canvasRef.value
  if (!root) return
  const scopeId = String(scope.id)
  const logEntries = [...root.querySelectorAll<HTMLElement>('.bts-log .bts-entry[data-scope-id]')]
    .filter((entry) => entry.dataset.scopeId === scopeId)
  const notifications = [...root.querySelectorAll<HTMLElement>('.bts-notification')]
    .filter(
      (notification) =>
        notification.querySelector<HTMLElement>('.bts-scope')?.textContent?.trim() === scopeId,
    )

  for (const container of [logEntries.at(-1), notifications.at(-1)]) {
    if (!container) continue
    container.dataset.designerLifecycleState = state
    if (nameKey) {
      container.dataset.designerLifecycleNameKey = nameKey
      delete container.dataset.designerLifecycleName
    } else {
      container.dataset.designerLifecycleName = name
      delete container.dataset.designerLifecycleNameKey
    }
  }
  scheduleModelerDomLocalization()
}

function localizeDiagramJsDom(root: ParentNode) {
  root.querySelectorAll<HTMLInputElement>('.djs-search-input input').forEach((input) => {
    input.placeholder = t('designer.bpmnDom.searchInDiagram')
    input.setAttribute('aria-label', t('designer.bpmnDom.searchInDiagram'))
  })
  root.querySelectorAll<HTMLInputElement>('.djs-popup-search input').forEach((input) => {
    input.placeholder = t('designer.bpmnDom.search')
    if (input.getAttribute('aria-label') === 'Search' || input.dataset.designerGenericSearch) {
      input.dataset.designerGenericSearch = 'true'
      input.setAttribute('aria-label', t('designer.bpmnDom.search'))
    }
  })
  root.querySelectorAll<HTMLElement>('.djs-popup-search-count').forEach((element) => {
    const rawCount = element.textContent?.match(/\d+/)?.[0]
    if (rawCount) element.dataset.designerResultCount = rawCount
    const count = Number(element.dataset.designerResultCount)
    if (!Number.isFinite(count)) return
    const text = t('designer.bpmnDom.resultsFound', { count })
    if (element.textContent?.trim() !== text) element.textContent = text
  })
  root.querySelectorAll<HTMLElement>('.djs-popup [role="listbox"]').forEach((element) => {
    if (element.getAttribute('aria-label') === 'Results' || element.dataset.designerGenericResults) {
      element.dataset.designerGenericResults = 'true'
      element.setAttribute('aria-label', t('designer.bpmnDom.results'))
    }
  })
  root
    .querySelectorAll<HTMLElement>('.djs-popup-breadcrumbs-item--back')
    .forEach((element) => {
      element.setAttribute('title', t('designer.bpmnDom.back'))
      element.setAttribute('aria-label', t('designer.bpmnDom.back'))
    })
  root.querySelectorAll<HTMLElement>('.djs-popup-entry-docs').forEach((element) => {
    element.setAttribute('title', t('designer.bpmnDom.openDocumentation'))
  })
  root.querySelectorAll<HTMLAnchorElement>('.djs-popup-footer-docs').forEach((element) => {
    setOwnText(element, t('designer.bpmnDom.openDocumentation'))
    const label = element
      .closest('.djs-popup')
      ?.querySelector<HTMLElement>('.entry.selected .djs-popup-label')
      ?.textContent?.trim()
    element.setAttribute(
      'aria-label',
      label
        ? t('designer.bpmnDom.openDocumentationFor', { label })
        : t('designer.bpmnDom.openDocumentation'),
    )
  })

  root.querySelectorAll<HTMLElement>('.djs-minimap').forEach((minimap) => {
    const toggle = minimap.querySelector<HTMLElement>('.toggle')
    if (!toggle) return
    toggle.setAttribute(
      'title',
      translateBpmn(minimap.classList.contains('open') ? 'Close minimap' : 'Open minimap'),
    )
  })
}

function localizeModelerDom() {
  const root = canvasRef.value
  if (!root) return
  localizeDiagramJsDom(root)
  localizeTokenSimulationDom(root)
}

function scheduleModelerDomLocalization() {
  if (modelerDomLocalizationFrame) return
  modelerDomLocalizationFrame = window.requestAnimationFrame(() => {
    modelerDomLocalizationFrame = 0
    localizeModelerDom()
  })
}

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
  return String(process?.name || process?.id || t('designer.header.unnamedProcess'))
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
  if (!selectedElement.value || selectedElement.value === rootElement.value) {
    return t('designer.header.process')
  }
  return String(
    selectedElement.value.businessObject.name ||
      selectedElement.value.businessObject.id ||
      t('designer.header.unnamedElement'),
  )
})
const errorCount = computed(() => problems.value.filter((item) => item.level === 'error').length)
const warningCount = computed(() => problems.value.filter((item) => item.level === 'warning').length)
const savedStatus = computed(() => {
  if (importPending.value) return t('designer.header.status.loading')
  if (saving.value) return t('designer.header.status.saving')
  if (dirty.value) return t('designer.header.status.dirty')
  if (lastSavedAt.value) {
    return t('designer.header.status.savedAt', { time: formatTime(lastSavedAt.value) })
  }
  return t('designer.header.status.ready')
})

function service<T>(name: string) {
  if (!modeler.value) throw designerError('designer.errors.modelerNotReady')
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
    throw designerError('designer.errors.importStateIncoherent')
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
    if (warning instanceof DesignerDiagnosticError) {
      return localDiagnostic(warning.key, { ...warning.params })
    }
    if (warning instanceof Error) return externalDiagnostic(warning.message)
    if (warning && typeof warning === 'object' && 'message' in warning) {
      return externalDiagnostic(String((warning as { message: unknown }).message))
    }
    return externalDiagnostic(String(warning))
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
    if (!xml) throw designerError('designer.errors.snapshotUnavailable')
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
    importWarnings: importWarnings.value.map(cloneDiagnostic),
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
    throw designerError('designer.errors.restoredRootMissing')
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
  importWarnings.value = snapshot.importWarnings.map(cloneDiagnostic)
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
      throw designerError('designer.errors.rollbackDefinitionUnavailable')
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
    scheduleModelerDomLocalization()
  })

  eventBus.on('tokenSimulation.simulator.createScope', (event) => {
    markTokenLifecycleDom(event, 'started')
  })

  eventBus.on('tokenSimulation.simulator.destroyScope', (event) => {
    const scope = event.scope as { completed?: boolean } | undefined
    markTokenLifecycleDom(event, scope?.completed ? 'finished' : 'canceled')
  })

  eventBus.on('tokenSimulation.simulator.trace', markTokenTraceDom)

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
        title: t('designer.import.loadedWithWarnings'),
        message: t('designer.import.externalWarnings', { count: importWarnings.value.length }),
        type: 'warning',
      })
    }
    dirty.value = false
    commandRevision.value += 1
    syncCommandState()
    resetValidation()
  })
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
            designerError('designer.import.legacyNamespaceNormalized'),
          ],
        } as ImportResult)
      : nativeResult
    if (disposed || modeler.value !== instance) return result
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
        title: t('designer.import.loadedWithWarnings'),
        message: t('designer.import.warnings', { count: importWarnings.value.length }),
        type: 'warning',
      })
    }
    return result
  } catch (error) {
    if (disposed || modeler.value !== instance) throw error
    let recoveryError: unknown
    try {
      await restoreFailedImport(instance, importXML, snapshot)
      importStateCoherent.value = snapshot.coherent
    } catch (rollbackError) {
      recoveryError = rollbackError
      importStateCoherent.value = false
    }
    const message = errorText(error, 'designer.import.failedTitle')
    const notificationMessage = recoveryError
      ? t('designer.import.failedWithRecovery', {
          detail: message,
          recovery: errorText(recoveryError, 'designer.errors.importStateIncoherent'),
        })
      : message
    if (options.reportError !== false) {
      ElNotification({
        title: t('designer.import.failedTitle'),
        message: notificationMessage,
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
  if (!instance || !importXML) {
    return Promise.reject(designerError('designer.errors.modelerNotReady'))
  }

  const wasIdle = pendingImportCount.value === 0
  pendingImportCount.value += 1
  ready.value = false
  canUndo.value = false
  canRedo.value = false
  loading.value = true
  loadingMessageKey.value = 'designer.loading.process'
  if (wasIdle) setModelerKeyboardEnabled(instance, false)

  const operation = importQueue.then(async () => {
    await nextTick()
    if (disposed || modeler.value !== instance) {
      throw designerError('designer.errors.modelerNotReady')
    }
    return performDiagramImport(instance, importXML, xml, options, bpmnDiagram)
  })
  const settledOperation = operation.finally(async () => {
    pendingImportCount.value -= 1
    if (pendingImportCount.value === 0 && !disposed && modeler.value === instance) {
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
  await importDiagram(props.initialXml, {
    importedFileName: props.initialFileName,
    reportError: false,
  })
  if (props.initialSavedAt) lastSavedAt.value = props.initialSavedAt
}

async function initialize() {
  if (!canvasRef.value || disposed) return
  const instance = new Modeler({
    container: canvasRef.value,
    additionalModules: [minimapModule, TokenSimulationModule, gridModule, bpmnI18nModule],
    moddleExtensions: {
      flowable: flowableDescriptor,
    },
    minimap: {
      open: false,
    },
  })
  modeler.value = markRaw(instance)
  bindModelerEvents(instance)
  nativeImportXML = instance.importXML.bind(instance)
  await loadInitialDiagram()
  await waitForQueuedImports()
  if (disposed || modeler.value !== instance) return
  await nextTick()
  scheduleModelerDomLocalization()
  resizeObserver = new ResizeObserver(() => {
    if (!modeler.value) return
    service<CanvasService>('canvas').resized()
  })
  if (canvasHostRef.value) resizeObserver.observe(canvasHostRef.value)
}

function handleInitializationError(error: unknown) {
  loading.value = false
  ready.value = false
  initializationError.value = diagnosticFromError(error, 'designer.errors.loadFailed')
}

async function performModelSave(showSuccess: boolean) {
  if (!modeler.value) return false
  assertImportStateCoherent()
  const instance = modeler.value
  saving.value = true
  setModelerKeyboardEnabled(instance, false)
  try {
    await commitActiveEditor()
    const savedRevision = commandRevision.value
    const { xml } = await instance.saveXML({ format: true, preamble: true })
    if (!xml) throw designerError('designer.errors.xmlNotGenerated')
    const { savedAt } = await props.persistModel({
      xml,
      fileName: fileName.value,
      name: processName.value,
      key: processId.value,
      description: processDescription.value,
    })
    dirty.value = commandRevision.value !== savedRevision
    lastSavedAt.value = savedAt
    emit('saved')
    if (showSuccess) {
      ElMessage.success(
        dirty.value ? t('designer.save.snapshotSaved') : t('designer.save.success'),
      )
    }
    return true
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.saveFailed'))
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
  if (!isInteractionReady()) {
    ElMessage.warning(t('designer.save.busy'))
    return false
  }
  try {
    await commitActiveEditor()
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.commitFailed'))
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
    await ElMessageBox.confirm(
      t('designer.import.confirmMessage'),
      t('designer.import.confirmTitle'),
      {
        confirmButtonText: t('designer.import.continue'),
        cancelButtonText: t('shell.common.cancel'),
        type: 'warning',
      },
    )
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

  let xml: string
  try {
    xml = await file.text()
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.fileReadFailed'))
    return
  }
  if (!isInteractionReady()) return
  try {
    await importDiagram(xml, { importedFileName: file.name, markClean: false })
    lastSavedAt.value = ''
    ElMessage.success(t('designer.import.success', { fileName: file.name }))
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
  try {
    const xml = await getXml()
    if (!xml) return
    downloadBlob(xml, normalizedExportName('bpmn20.xml'), 'application/xml;charset=utf-8')
    ElMessage.success(t('designer.export.xmlSuccess'))
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.exportFailed'))
  }
}

async function exportSvg() {
  if (!modeler.value || !isInteractionReady()) return
  try {
    const { svg } = await modeler.value.saveSVG()
    if (!svg) return
    downloadBlob(svg, normalizedExportName('svg'), 'image/svg+xml;charset=utf-8')
    ElMessage.success(t('designer.export.svgSuccess'))
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.exportFailed'))
  }
}

async function exportPng() {
  if (!modeler.value || !isInteractionReady()) return
  try {
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
      if (!context) throw designerError('designer.errors.canvasExportUnsupported')
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
      if (!png) throw designerError('designer.errors.pngGenerationFailed')
      const url = URL.createObjectURL(png)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = normalizedExportName('png')
        anchor.click()
      } finally {
        URL.revokeObjectURL(url)
      }
      ElMessage.success(t('designer.export.pngSuccess'))
    } finally {
      URL.revokeObjectURL(svgUrl)
    }
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.exportFailed'))
  }
}

async function showXml() {
  if (!isInteractionReady()) return
  try {
    xmlContent.value = await getXml()
    xmlDialogVisible.value = true
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.xmlReadFailed'))
  }
}

async function copyXml() {
  try {
    await navigator.clipboard.writeText(xmlContent.value)
    ElMessage.success(t('designer.clipboard.copied'))
  } catch {
    ElMessage.warning(t('designer.clipboard.denied'))
  }
}

async function showPreview() {
  if (!modeler.value || !isInteractionReady()) return
  try {
    const { svg } = await modeler.value.saveSVG()
    previewSvg.value = svg || ''
    previewDialogVisible.value = true
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.previewFailed'))
  }
}

function runValidation(showDrawer = true) {
  if (!modeler.value) return
  assertImportStateCoherent()
  if (!isInteractionReady()) return
  clearValidationMarkers()
  const registry = service<ElementRegistryService>('elementRegistry')
  problems.value = validateElements(registry.getAll(), {
    formsEnabled: FLOWABLE_FORMS_ENABLED,
  })
  applyValidationMarkers(problems.value)

  if (!problems.value.length) {
    ElNotification({
      title: t('designer.validation.passedTitle'),
      message: t('designer.validation.passedMessage'),
      type: 'success',
    })
    problemsDrawerVisible.value = false
  } else if (showDrawer) {
    problemsDrawerVisible.value = true
  }
}

function validationProblemText(problem: ValidationProblem) {
  return t(`modeler.validation.${problem.code}`, problem.params)
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
      ElMessage.warning(t('designer.validation.fixBeforeSimulation'))
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
    ElMessage.warning(t('designer.validation.selectTwo'))
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
  try {
    if (!document.fullscreenElement) await shellRef.value.requestFullscreen()
    else await document.exitFullscreen()
  } catch (error) {
    ElMessage.error(errorText(error, 'designer.errors.fullscreenFailed'))
  }
}

function onFullscreenChange() {
  fullscreenActive.value = Boolean(document.fullscreenElement)
  nextTick(() => modeler.value && service<CanvasService>('canvas').resized())
}

function handleGlobalKeydown(event: KeyboardEvent) {
  const modifier = event.ctrlKey || event.metaKey
  if (!modifier) return
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
  if (!dirty.value) return
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
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(locale.value === 'en' ? 'en-US' : 'zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

watch(locale, async () => {
  const instance = modeler.value
  if (instance) {
    const eventBus = instance.get<EventBusService>('eventBus')
    eventBus.fire('i18n.changed')

    const contextPad = instance.get<ContextPadService>('contextPad')
    const selection = instance.get<SelectionService>('selection').get()
    if (contextPad.isOpen() && selection.length) {
      contextPad.open(selection.length === 1 ? selection[0]! : selection, true)
    }

    const popupMenu = instance.get<PopupMenuService>('popupMenu')
    if (popupMenu.isOpen()) popupMenu.refresh()
  }
  await nextTick()
  scheduleModelerDomLocalization()
})

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('beforeunload', handleBeforeUnload)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  modelerDomObserver = new MutationObserver(scheduleModelerDomLocalization)
  modelerDomObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  void initialize().catch((error: unknown) => {
    if (!disposed) handleInitializationError(error)
  })
})

onBeforeUnmount(() => {
  disposed = true
  resizeObserver?.disconnect()
  modelerDomObserver?.disconnect()
  if (modelerDomLocalizationFrame) window.cancelAnimationFrame(modelerDomLocalizationFrame)
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('beforeunload', handleBeforeUnload)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  nativeImportXML = null
  resolveLeaveDecision?.('stay')
  resolveLeaveDecision = null
  const instance = modeler.value
  modeler.value = null
  instance?.destroy()
})

defineExpose({
  confirmClose,
})
</script>

<template>
  <div
    ref="shellRef"
    class="designer-shell"
    :class="{
      'is-fullscreen': fullscreenActive,
      'is-importing': importPending,
      'is-interaction-locked': interactionLocked,
    }"
    :aria-busy="importPending || saving"
  >
    <header class="designer-header">
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
          <el-tag v-if="dirty" type="warning" size="small" effect="light">
            {{ t('designer.header.unsaved') }}
          </el-tag>
          <el-tag v-else type="success" size="small" effect="light">
            {{ t('designer.header.saved') }}
          </el-tag>
        </div>
        <div class="process-id">{{ processId }}</div>
      </div>

      <div class="header-status">
        <div class="header-language"><LanguageSwitcher /></div>
        <div class="status-dot" :class="{ dirty }" />
        <div class="status-copy">
          <div class="text-xs font-500 text-gray-600">{{ savedStatus }}</div>
          <div class="mt-1 text-[11px] text-gray-400">
            {{ t('designer.header.saveShortcut') }}
          </div>
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
      @back="requestClose"
      @save="saveModel"
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
        :title="t('designer.loadError.title')"
        :sub-title="initializationError ? diagnosticText(initializationError) : ''"
      >
        <template #extra>
          <el-button
            type="primary"
            data-testid="return-from-load-error"
            @click="emit('close')"
          >
            {{ t('designer.loadError.back') }}
          </el-button>
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
          <span>{{ t('designer.canvas.current', { name: selectedLabel }) }}</span>
          <span class="status-separator" />
          <span>{{ Math.round(zoom * 100) }}%</span>
          <template v-if="importWarnings.length">
            <span class="status-separator" />
            <button
              class="import-warning-link"
              :disabled="interactionLocked"
              @click="importWarningsDialogVisible = true"
            >
              {{ t('designer.import.warningCount', { count: importWarnings.length }) }}
            </button>
          </template>
          <template v-if="simulationActive">
            <span class="status-separator" />
            <span class="text-emerald-600">{{ t('designer.canvas.simulationMode') }}</span>
          </template>
        </div>

        <button
          class="panel-toggle"
          :title="
            propertyPanelVisible
              ? t('designer.canvas.collapseProperties')
              : t('designer.canvas.expandProperties')
          "
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
          <el-button :icon="CopyDocument" @click="copyXml">
            {{ t('designer.xml.copy') }}
          </el-button>
          <el-button :icon="Download" :disabled="!ready" @click="exportXml">
            {{ t('designer.xml.download') }}
          </el-button>
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
        <el-button @click="xmlDialogVisible = false">{{ t('designer.xml.close') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="previewDialogVisible"
      :title="t('designer.preview.title')"
      width="84%"
      top="5vh"
    >
      <div class="preview-surface" v-html="previewSvg" />
      <template #footer>
        <el-button @click="previewDialogVisible = false">{{ t('designer.xml.close') }}</el-button>
        <el-button type="primary" :icon="Download" :disabled="!ready" @click="exportSvg">
          {{ t('designer.preview.download') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="leaveDialogVisible"
      :title="t('designer.leave.title')"
      width="min(460px, calc(100vw - 32px))"
      :close-on-click-modal="false"
      @closed="handleLeaveDialogClosed"
    >
      <p class="leave-dialog-message">{{ t('designer.leave.message') }}</p>
      <template #footer>
        <el-button @click="chooseLeaveDecision('stay')">{{ t('designer.leave.stay') }}</el-button>
        <el-button type="danger" plain @click="chooseLeaveDecision('discard')">
          {{ t('designer.leave.discard') }}
        </el-button>
        <el-button type="primary" @click="chooseLeaveDecision('save')">
          {{ t('designer.leave.saveAndReturn') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="importWarningsDialogVisible"
      :title="t('designer.import.dialogTitle')"
      width="min(680px, calc(100vw - 32px))"
      top="8vh"
    >
      <el-alert
        class="mb-3"
        type="warning"
        :closable="false"
        show-icon
        :title="t('designer.import.dialogDescription')"
      />
      <div class="import-warning-list">
        <div v-for="(warning, index) in importWarnings" :key="index" class="import-warning-item">
          <span>{{ index + 1 }}</span>
          <code>{{ diagnosticText(warning) }}</code>
        </div>
      </div>
      <template #footer>
        <el-button type="primary" @click="importWarningsDialogVisible = false">
          {{ t('designer.import.acknowledge') }}
        </el-button>
      </template>
    </el-dialog>

    <el-drawer
      v-model="problemsDrawerVisible"
      :title="t('designer.validation.title')"
      size="430px"
    >
      <div class="validation-summary">
        <div class="validation-number error">{{ errorCount }}</div>
        <div>
          <div class="text-sm font-600">{{ t('designer.validation.errors') }}</div>
          <div class="text-xs text-gray-400">{{ t('designer.validation.errorsHelp') }}</div>
        </div>
        <div class="validation-number warning">{{ warningCount }}</div>
        <div>
          <div class="text-sm font-600">{{ t('designer.validation.warnings') }}</div>
          <div class="text-xs text-gray-400">{{ t('designer.validation.warningsHelp') }}</div>
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
            <span class="block text-sm text-gray-700">{{ validationProblemText(problem) }}</span>
            <span class="mt-1 block truncate text-xs text-gray-400">
              {{ problem.elementName }} · {{ problem.elementId }}
            </span>
          </span>
          <span class="text-xs text-blue-500">{{ t('designer.validation.locate') }}</span>
        </button>
      </div>
      <el-empty v-else :description="t('designer.validation.passed')" />

      <template #footer>
        <div class="flex items-center justify-between">
          <span class="flex items-center gap-1 text-xs text-gray-400">
            <el-icon><Clock /></el-icon> {{ t('designer.validation.autoClear') }}
          </span>
          <el-button type="primary" :disabled="!ready" @click="runValidation">
            {{ t('designer.validation.revalidate') }}
          </el-button>
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
    grid-template-columns: minmax(0, 1fr) auto auto;
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
  .header-status { gap: 0; }
  .header-status .status-dot,
  .header-status .status-copy { display: none; }

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
