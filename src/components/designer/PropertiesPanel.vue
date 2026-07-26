<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { PropType } from 'vue'
import { useI18n } from 'vue-i18n'
import type Modeler from 'bpmn-js/lib/Modeler'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Delete, Edit, Plus } from '@element-plus/icons-vue'

import { FLOWABLE_FORMS_ENABLED } from '@/config/features'
import {
  addExtensionValue,
  createFormalExpression,
  createModdleElement,
  getBusinessProperty,
  getClaimedIdOwner,
  getExtensionBody,
  getExtensionValues,
  mutateGlobalDefinition,
  mutateCustomResource,
  removeExtensionValue,
  setExtensionBody,
  setJobCategoryBody,
  updateDocumentation,
  updateElementProperties,
  updateExtensionValue,
  updateModdleProperties,
} from '@/modeler/modeling'
import {
  FLOWABLE_BPMN_SERVICE_TASK_TYPES,
  FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS,
} from '@/modeler/serviceTaskTypes'
import type {
  BpmnBusinessObject,
  BpmnExtensionElement,
  DiagramElement,
} from '@/modeler/types'

const props = defineProps({
  modeler: {
    type: Object as PropType<Modeler | null>,
    default: null,
  },
  element: {
    type: Object as PropType<DiagramElement | null>,
    default: null,
  },
  revision: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits<{
  changed: []
}>()

const { t } = useI18n()

const activeSections = ref<string[]>(['general'])

const form = reactive({
  id: '',
  name: '',
  documentation: '',
  isExecutable: true,
  isEagerExecutionFetching: false,
  candidateStarterUsers: '',
  candidateStarterGroups: '',
  initiator: '',
  assignee: '',
  owner: '',
  candidateUsers: '',
  candidateGroups: '',
  dueDate: '',
  businessCalendarName: '',
  priority: '',
  category: '',
  taskIdVariableName: '',
  taskCompleterVariableName: '',
  formKey: '',
  formFieldValidation: true,
  sameDeployment: true,
  skipExpression: '',
  async: false,
  asyncLeave: false,
  exclusive: true,
  asyncLeaveExclusive: true,
  jobCategory: '',
  failedJobRetryTimeCycle: '',
  implementationType: 'class',
  implementation: '',
  serviceTopic: '',
  resultVariableName: '',
  useLocalScopeForResultVariable: false,
  storeResultVariableAsTransient: false,
  triggerable: false,
  serviceEventType: '',
  serviceTriggerEventType: '',
  serviceChannelKey: '',
  serviceSystemChannel: false,
  serviceSendSynchronously: false,
  scriptFormat: '',
  script: '',
  scriptResultVariable: '',
  calledElement: '',
  calledElementType: 'key',
  callSameDeployment: false,
  inheritVariables: false,
  inheritBusinessKey: false,
  useLocalScopeForOutParameters: false,
  completeAsync: false,
  idVariableName: '',
  businessKey: '',
  fallbackToDefaultTenant: false,
  processInstanceName: '',
  conditionExpression: '',
  defaultFlow: '',
  multiType: 'none',
  multiSource: 'collection',
  loopCardinality: '',
  collection: '',
  elementVariable: '',
  elementIndexVariable: '',
  completionCondition: '',
  timerType: 'timeDuration',
  timerExpression: '',
  timerEndDate: '',
  timerBusinessCalendarName: '',
  conditionalExpression: '',
  cancelActivity: true,
  isInterrupting: true,
  messageRef: '',
  messageExpression: '',
  signalRef: '',
  signalExpression: '',
  signalAsync: false,
  errorRef: '',
  errorVariableName: '',
  errorVariableTransient: false,
  errorVariableLocalScope: false,
})

type GlobalDefinitionKind = 'message' | 'signal' | 'error'

type ModdlePropertyDescriptor = {
  name: string
  isReference?: boolean
  isVirtual?: boolean
}

type TraversableModdleElement = BpmnBusinessObject & {
  $descriptor?: { properties?: ModdlePropertyDescriptor[] }
}

const globalDefinitionTypes = new Set(['bpmn:Message', 'bpmn:Signal', 'bpmn:Error'])

const definitionDialogVisible = ref(false)
const editingDefinition = shallowRef<BpmnBusinessObject | null>(null)
const definitionForm = reactive({
  kind: 'message' as GlobalDefinitionKind,
  id: '',
  name: '',
  errorCode: '',
  errorMessage: '',
  scope: '',
})

type ListenerKind = 'executionListener' | 'taskListener'
type ListenerImplementationType = 'class' | 'expression' | 'delegateExpression' | 'script'
type ListenerTransactionPhase = '' | 'before-commit' | 'committed' | 'rolled-back'
type ListenerResolverType = '' | 'class' | 'expression' | 'delegateExpression'

const listenerDialogVisible = ref(false)
const editingListener = shallowRef<BpmnExtensionElement | null>(null)
const listenerForm = reactive({
  kind: 'executionListener' as ListenerKind,
  event: 'start',
  implementationType: 'class' as ListenerImplementationType,
  implementation: '',
  scriptLanguage: '',
  scriptResultVariable: '',
  scriptBody: '',
  onTransaction: '' as ListenerTransactionPhase,
  resolverType: '' as ListenerResolverType,
  resolverImplementation: '',
  fields: [] as Array<{ name: string; valueType: 'string' | 'expression'; value: string }>,
})
const listenerSupportsTransaction = computed(() =>
  ['class', 'delegateExpression'].includes(listenerForm.implementationType),
)
const listenerSupportsFields = computed(
  () =>
    listenerForm.implementationType !== 'script' &&
    !(listenerForm.implementationType === 'delegateExpression' && listenerForm.onTransaction),
)

const customResourceDialogVisible = ref(false)
const editingCustomResource = shallowRef<BpmnExtensionElement | null>(null)
const customResourceForm = reactive({
  name: '',
  expression: '',
})

const formDialogVisible = ref(false)
const editingFormProperty = shallowRef<BpmnExtensionElement | null>(null)
const formPropertyForm = reactive({
  id: '',
  name: '',
  type: 'string',
  variable: '',
  expression: '',
  default: '',
  datePattern: '',
  readable: true,
  writable: true,
  required: false,
  values: [] as Array<{ id: string; name: string }>,
})

const fieldDialogVisible = ref(false)
const editingField = shallowRef<BpmnExtensionElement | null>(null)
const fieldForm = reactive({
  name: '',
  valueType: 'string' as 'string' | 'expression',
  value: '',
})

const mappingDialogVisible = ref(false)
const editingMapping = shallowRef<BpmnExtensionElement | null>(null)
type MappingKind = 'in' | 'out' | 'eventIn' | 'eventOut'
const mappingForm = reactive({
  kind: 'in' as MappingKind,
  sourceType: 'source' as 'source' | 'sourceExpression' | 'variables',
  source: '',
  target: '',
  transient: false,
})

const extensionPropertyDialogVisible = ref(false)
const editingExtensionProperty = shallowRef<BpmnExtensionElement | null>(null)
const extensionPropertyForm = reactive({
  id: '',
  name: '',
  value: '',
})

const mapExceptionDialogVisible = ref(false)
const editingMapException = shallowRef<BpmnExtensionElement | null>(null)
const mapExceptionForm = reactive({
  errorCode: '',
  exceptionClass: '',
  includeChildExceptions: false,
  rootCause: '',
})

type ServiceFieldSpec = {
  name: string
  label: string
  valueType: 'string' | 'expression'
  control?: 'input' | 'textarea' | 'select' | 'boolean'
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  required?: boolean
}

const methodOptions = ['GET', 'POST', 'PUT', 'DELETE'].map((value) => ({ label: value, value }))
const booleanOptions = computed(() => [
  { label: t('properties.common.no'), value: 'false' },
  { label: t('properties.common.yes'), value: 'true' },
])
const calledElementTypeOptions = computed(() => [
  { label: t('properties.callActivity.processKey'), value: 'key' },
  { label: t('properties.callActivity.processId'), value: 'id' },
])

const serviceFieldPresets = computed<Record<string, ServiceFieldSpec[]>>(() => ({
  'external-worker': [],
  external: [],
  shell: [
    { name: 'command', label: t('properties.serviceFields.command'), valueType: 'string', required: true },
    { name: 'arg1', label: t('properties.serviceFields.argument', { index: 1 }), valueType: 'expression' },
    { name: 'arg2', label: t('properties.serviceFields.argument', { index: 2 }), valueType: 'expression' },
    { name: 'arg3', label: t('properties.serviceFields.argument', { index: 3 }), valueType: 'expression' },
    { name: 'wait', label: t('properties.serviceFields.wait'), valueType: 'string', control: 'boolean' },
    { name: 'redirectError', label: t('properties.serviceFields.redirectError'), valueType: 'string', control: 'boolean' },
    { name: 'cleanEnv', label: t('properties.serviceFields.cleanEnvironment'), valueType: 'string', control: 'boolean' },
    { name: 'outputVariable', label: t('properties.serviceFields.outputVariable'), valueType: 'string' },
    { name: 'errorCodeVariable', label: t('properties.serviceFields.errorCodeVariable'), valueType: 'string' },
    { name: 'directory', label: t('properties.serviceFields.workingDirectory'), valueType: 'string' },
  ],
  http: [
    { name: 'requestUrl', label: t('properties.serviceFields.requestUrl'), valueType: 'string', required: true },
    {
      name: 'requestMethod',
      label: t('properties.serviceFields.requestMethod'),
      valueType: 'string',
      control: 'select',
      options: methodOptions,
      required: true,
    },
    { name: 'requestHeaders', label: t('properties.serviceFields.requestHeaders'), valueType: 'string', control: 'textarea' },
    { name: 'requestBody', label: t('properties.serviceFields.requestBody'), valueType: 'string', control: 'textarea' },
    { name: 'responseVariableName', label: t('properties.serviceFields.responseVariable'), valueType: 'string' },
    { name: 'ignoreException', label: t('properties.serviceFields.ignoreException'), valueType: 'string', control: 'boolean' },
    { name: 'disallowRedirects', label: t('properties.serviceFields.disallowRedirects'), valueType: 'string', control: 'boolean' },
    {
      name: 'saveResponseVariableAsJson',
      label: t('properties.serviceFields.saveResponseAsJson'),
      valueType: 'string',
      control: 'boolean',
    },
  ],
  mail: [
    { name: 'to', label: t('properties.serviceFields.recipient'), valueType: 'expression' },
    { name: 'cc', label: t('properties.serviceFields.cc'), valueType: 'expression' },
    { name: 'bcc', label: t('properties.serviceFields.bcc'), valueType: 'expression' },
    { name: 'from', label: t('properties.serviceFields.sender'), valueType: 'expression' },
    { name: 'subject', label: t('properties.serviceFields.subject'), valueType: 'expression' },
    { name: 'text', label: t('properties.serviceFields.plainTextBody'), valueType: 'expression', control: 'textarea' },
    { name: 'html', label: t('properties.serviceFields.htmlBody'), valueType: 'expression', control: 'textarea' },
    { name: 'charset', label: t('properties.serviceFields.charset'), valueType: 'string', placeholder: 'utf-8' },
  ],
  dmn: [
    { name: 'decisionTableReferenceKey', label: t('properties.serviceFields.decisionTableKey'), valueType: 'string' },
    { name: 'decisionServiceReferenceKey', label: t('properties.serviceFields.decisionServiceKey'), valueType: 'string' },
    {
      name: 'fallbackToDefaultTenant',
      label: t('properties.serviceFields.fallbackDefaultTenant'),
      valueType: 'string',
      control: 'boolean',
    },
    {
      name: 'decisionTaskThrowErrorOnNoHits',
      label: t('properties.serviceFields.throwOnNoHits'),
      valueType: 'string',
      control: 'boolean',
    },
  ],
}))

const serviceFieldForm = reactive<Record<string, string>>({})

const businessObject = computed(() => props.element?.businessObject || null)
const type = computed(() => props.element?.type || '')
const isProcess = computed(() => type.value === 'bpmn:Process')
const isUserTask = computed(() => type.value === 'bpmn:UserTask')
const isServiceTask = computed(() => type.value === 'bpmn:ServiceTask')
const isScriptTask = computed(() => type.value === 'bpmn:ScriptTask')
const isCallActivity = computed(() => type.value === 'bpmn:CallActivity')
const isSequenceFlow = computed(() => type.value === 'bpmn:SequenceFlow')
const isStartEvent = computed(() => type.value === 'bpmn:StartEvent')
const isBoundaryEvent = computed(() => type.value === 'bpmn:BoundaryEvent')
const isBpmnEvent = computed(() => type.value.endsWith('Event'))
const eventDefinition = computed(() => businessObject.value?.eventDefinitions?.[0] || null)
const eventDefinitionType = computed(() => eventDefinition.value?.$type || '')
const isTimerEvent = computed(() => eventDefinitionType.value === 'bpmn:TimerEventDefinition')
const isConditionalEvent = computed(
  () => eventDefinitionType.value === 'bpmn:ConditionalEventDefinition',
)
const isMessageEvent = computed(() => eventDefinitionType.value === 'bpmn:MessageEventDefinition')
const isSignalEvent = computed(() => eventDefinitionType.value === 'bpmn:SignalEventDefinition')
const isErrorEvent = computed(() => eventDefinitionType.value === 'bpmn:ErrorEventDefinition')
const isThrowingEvent = computed(() =>
  ['bpmn:EndEvent', 'bpmn:IntermediateThrowEvent'].includes(type.value),
)
const supportsForm = computed(
  () => FLOWABLE_FORMS_ENABLED && (isUserTask.value || isStartEvent.value),
)
const supportsMultiInstance = computed(() =>
  [
    'bpmn:Task',
    'bpmn:UserTask',
    'bpmn:ServiceTask',
    'bpmn:ScriptTask',
    'bpmn:BusinessRuleTask',
    'bpmn:SendTask',
    'bpmn:ReceiveTask',
    'bpmn:ManualTask',
    'bpmn:CallActivity',
    'bpmn:SubProcess',
  ].includes(type.value),
)
const multiInstanceCollectionHandler = computed(() => {
  props.revision
  const loop = businessObject.value?.loopCharacteristics
  if (loop?.$type !== 'bpmn:MultiInstanceLoopCharacteristics') return null
  const values = (loop.extensionElements as { values?: BpmnExtensionElement[] } | undefined)
    ?.values
  return values?.find((value) => value.$type === 'flowable:Collection') || null
})
const supportsMapExceptions = computed(() => isServiceTask.value || isCallActivity.value)
const supportsAsync = computed(() =>
  /Task$|Gateway$|Event$|Activity$|SubProcess$/.test(type.value.replace('bpmn:', '')),
)
const supportsListeners = computed(() => {
  const instanceOf = (businessObject.value as { $instanceOf?: (type: string) => boolean } | null)
    ?.$instanceOf
  return (
    isProcess.value ||
    isSequenceFlow.value ||
    Boolean(instanceOf?.call(businessObject.value, 'bpmn:FlowNode'))
  )
})
const supportsDefaultFlow = computed(() =>
  ['bpmn:ExclusiveGateway', 'bpmn:InclusiveGateway', 'bpmn:ComplexGateway', 'bpmn:Activity'].some(
    (candidate) => type.value === candidate || (candidate === 'bpmn:Activity' && supportsMultiInstance.value),
  ),
)

const typeLabelKeys: Record<string, string> = {
  'bpmn:Process': 'properties.elementTypes.process',
  'bpmn:StartEvent': 'properties.elementTypes.startEvent',
  'bpmn:EndEvent': 'properties.elementTypes.endEvent',
  'bpmn:IntermediateCatchEvent': 'properties.elementTypes.intermediateCatchEvent',
  'bpmn:IntermediateThrowEvent': 'properties.elementTypes.intermediateThrowEvent',
  'bpmn:BoundaryEvent': 'properties.elementTypes.boundaryEvent',
  'bpmn:UserTask': 'properties.elementTypes.userTask',
  'bpmn:ServiceTask': 'properties.elementTypes.serviceTask',
  'bpmn:ScriptTask': 'properties.elementTypes.scriptTask',
  'bpmn:BusinessRuleTask': 'properties.elementTypes.businessRuleTask',
  'bpmn:ManualTask': 'properties.elementTypes.manualTask',
  'bpmn:ReceiveTask': 'properties.elementTypes.receiveTask',
  'bpmn:SendTask': 'properties.elementTypes.sendTask',
  'bpmn:CallActivity': 'properties.elementTypes.callActivity',
  'bpmn:SubProcess': 'properties.elementTypes.subProcess',
  'bpmn:ExclusiveGateway': 'properties.elementTypes.exclusiveGateway',
  'bpmn:ParallelGateway': 'properties.elementTypes.parallelGateway',
  'bpmn:InclusiveGateway': 'properties.elementTypes.inclusiveGateway',
  'bpmn:ComplexGateway': 'properties.elementTypes.complexGateway',
  'bpmn:EventBasedGateway': 'properties.elementTypes.eventBasedGateway',
  'bpmn:SequenceFlow': 'properties.elementTypes.sequenceFlow',
  'bpmn:Participant': 'properties.elementTypes.participant',
  'bpmn:Lane': 'properties.elementTypes.lane',
}

const elementTypeLabel = computed(() => {
  const key = typeLabelKeys[type.value]
  return key ? t(key) : type.value.replace('bpmn:', '')
})
const outgoingFlows = computed(() =>
  (props.element?.outgoing || []).map((flow) => ({
    label: String(flow.businessObject.name || flow.id),
    value: flow.id,
    businessObject: flow.businessObject,
  })),
)

const definitions = computed(() => {
  props.revision
  let current = businessObject.value || undefined
  while (current && current.$type !== 'bpmn:Definitions') {
    current = current.$parent as BpmnBusinessObject | undefined
  }
  return current
})

const globalDefinitions = computed(() => {
  props.revision
  const rootElements = (definitions.value?.rootElements as BpmnBusinessObject[] | undefined) || []
  return rootElements.filter((value) =>
    ['bpmn:Message', 'bpmn:Signal', 'bpmn:Error'].includes(value.$type),
  )
})

const messageDefinitions = computed(() =>
  globalDefinitions.value.filter((value) => value.$type === 'bpmn:Message'),
)
const signalDefinitions = computed(() =>
  globalDefinitions.value.filter((value) => value.$type === 'bpmn:Signal'),
)
const errorDefinitions = computed(() =>
  globalDefinitions.value.filter((value) => value.$type === 'bpmn:Error'),
)

const extensionValues = computed(() => {
  props.revision
  return props.element ? [...getExtensionValues(props.element)] : []
})
const executionListeners = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:ExecutionListener'),
)
const taskListeners = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:TaskListener'),
)
const customResources = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:CustomResource'),
)
const formProperties = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:FormProperty'),
)
const injectedFields = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:Field'),
)
const inputMappings = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:In'),
)
const outputMappings = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:Out'),
)
const eventInputMappings = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:EventInParameter'),
)
const eventOutputMappings = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:EventOutParameter'),
)
const failedJobRetryTimeCycles = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:FailedJobRetryTimeCycle'),
)
const supportsFailedJobRetryTimeCycle = computed(
  () => isServiceTask.value || failedJobRetryTimeCycles.value.length > 0,
)
const extensionPropertyContainers = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:Properties'),
)
const extensionProperties = computed(() =>
  (extensionPropertyContainers.value[0]?.values as BpmnExtensionElement[] | undefined) || [],
)
const mapExceptions = computed(() =>
  extensionValues.value.filter((value) => value.$type === 'flowable:MapException'),
)
const listenerCount = computed(() => executionListeners.value.length + taskListeners.value.length)
const selectedServiceType = computed(() =>
  form.implementationType === 'type' ? form.implementation : '',
)
const serviceTaskTypeOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = FLOWABLE_BPMN_SERVICE_TASK_TYPES.map((value) => ({
    value,
    label: FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS[value]
      ? t(FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS[value]!)
      : value,
  }))
  const current = selectedServiceType.value.trim()
  if (current && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label:
        (FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS[current]
          ? t(FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS[current]!)
          : t('properties.serviceTypes.unsupportedImported', { type: current })),
    })
  }
  return options
})
const isExternalWorker = computed(() =>
  ['external-worker', 'external'].includes(selectedServiceType.value),
)
const isSendEventServiceTask = computed(
  () => isServiceTask.value && selectedServiceType.value === 'send-event',
)
const activeServiceFields = computed(() => serviceFieldPresets.value[selectedServiceType.value] || [])
const mappingSupportsTransient = computed(() =>
  ['eventIn', 'eventOut'].includes(mappingForm.kind),
)
const mappingIsInput = computed(() => ['in', 'eventIn'].includes(mappingForm.kind))
const calledElementTypeError = computed(() => {
  const value = form.calledElementType
  return value && !['key', 'id'].includes(value)
    ? t('properties.callActivity.invalidType')
    : ''
})

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))
const booleanValue = (value: unknown, defaultValue = false) =>
  value === undefined || value === null ? defaultValue : value === true || value === 'true'

function property(name: string) {
  return businessObject.value ? getBusinessProperty(businessObject.value, name) : undefined
}

function hydrate() {
  const bo = businessObject.value
  if (!bo) return

  form.id = text(bo.id)
  form.name = text(bo.name)
  form.documentation = text(bo.documentation?.[0]?.text)
  form.isExecutable = booleanValue(property('isExecutable'), true)
  form.isEagerExecutionFetching = booleanValue(
    property('flowable:isEagerExecutionFetching'),
  )
  form.candidateStarterUsers = text(property('flowable:candidateStarterUsers'))
  form.candidateStarterGroups = text(property('flowable:candidateStarterGroups'))
  form.initiator = text(property('flowable:initiator'))
  form.assignee = text(property('flowable:assignee'))
  form.owner = text(property('flowable:owner'))
  form.candidateUsers = text(property('flowable:candidateUsers'))
  form.candidateGroups = text(property('flowable:candidateGroups'))
  form.dueDate = text(property('flowable:dueDate'))
  form.businessCalendarName = text(property('flowable:businessCalendarName'))
  form.priority = text(property('flowable:priority'))
  form.category = text(property('flowable:category'))
  form.taskIdVariableName = text(property('flowable:taskIdVariableName'))
  form.taskCompleterVariableName = text(property('flowable:taskCompleterVariableName'))
  form.formKey = text(property('flowable:formKey'))
  form.formFieldValidation = booleanValue(property('flowable:formFieldValidation'), true)
  form.sameDeployment = booleanValue(property('flowable:sameDeployment'), true)
  form.skipExpression = text(property('flowable:skipExpression'))
  form.async = booleanValue(property('flowable:async'))
  form.asyncLeave =
    booleanValue(property('flowable:asyncLeave')) ||
    booleanValue(property('flowable:asyncAfter'))
  form.exclusive = booleanValue(property('flowable:exclusive'), true)
  form.asyncLeaveExclusive = booleanValue(
    property('flowable:asyncLeaveExclusive'),
    true,
  )
  form.jobCategory = props.element
    ? getExtensionBody(props.element, 'flowable:JobCategory')
    : ''
  form.failedJobRetryTimeCycle = props.element
    ? getExtensionBody(props.element, 'flowable:FailedJobRetryTimeCycle')
    : ''

  const implementations = [
    ['class', property('flowable:class')],
    ['expression', property('flowable:expression')],
    ['delegateExpression', property('flowable:delegateExpression')],
    ['type', property('flowable:type')],
  ] as const
  const implementation = implementations.find(([, value]) => text(value))
  form.implementationType = implementation?.[0] || 'class'
  form.implementation = text(implementation?.[1])
  form.serviceTopic = text(property('flowable:topic'))
  form.resultVariableName = text(
    property('flowable:resultVariableName') || property('flowable:resultVariable'),
  )
  form.useLocalScopeForResultVariable = booleanValue(
    property('flowable:useLocalScopeForResultVariable'),
  )
  form.storeResultVariableAsTransient = booleanValue(
    property('flowable:storeResultVariableAsTransient'),
  )
  form.triggerable = booleanValue(property('flowable:triggerable'))
  form.serviceEventType = props.element
    ? getExtensionBody(props.element, 'flowable:EventType')
    : ''
  form.serviceTriggerEventType = props.element
    ? getExtensionBody(props.element, 'flowable:TriggerEventType')
    : ''
  form.serviceChannelKey = props.element
    ? getExtensionBody(props.element, 'flowable:ChannelKey')
    : ''
  form.serviceSystemChannel = extensionValues.value.some(
    (value) => value.$type === 'flowable:SystemChannel',
  )
  form.serviceSendSynchronously = booleanValue(
    props.element ? getExtensionBody(props.element, 'flowable:SendSynchronously') : '',
  )

  for (const specs of Object.values(serviceFieldPresets.value)) {
    for (const spec of specs) {
      const field = extensionValues.value.find(
        (value) => value.$type === 'flowable:Field' && value.name === spec.name,
      )
      serviceFieldForm[spec.name] = text(field?.expression || field?.string || field?.stringValue)
    }
  }

  form.scriptFormat = text(bo.scriptFormat)
  form.script = text(bo.script)
  form.scriptResultVariable = text(property('flowable:resultVariable'))

  form.calledElement = text(bo.calledElement)
  form.calledElementType = text(property('flowable:calledElementType')) || 'key'
  form.callSameDeployment = booleanValue(property('flowable:sameDeployment'))
  form.inheritVariables = booleanValue(property('flowable:inheritVariables'))
  form.inheritBusinessKey = booleanValue(property('flowable:inheritBusinessKey'))
  form.useLocalScopeForOutParameters = booleanValue(
    property('flowable:useLocalScopeForOutParameters'),
  )
  form.completeAsync = booleanValue(property('flowable:completeAsync'))
  form.idVariableName = text(property('flowable:idVariableName'))
  form.businessKey = text(property('flowable:businessKey'))
  form.fallbackToDefaultTenant = booleanValue(property('flowable:fallbackToDefaultTenant'))
  form.processInstanceName = text(property('flowable:processInstanceName'))

  form.conditionExpression = text(bo.conditionExpression?.body)
  form.defaultFlow = text(bo.default?.id)

  const loop = bo.loopCharacteristics
  if (loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
    const collectionHandler = (
      loop.extensionElements as { values?: BpmnExtensionElement[] } | undefined
    )?.values?.find((value) => value.$type === 'flowable:Collection')
    form.multiType = loop.isSequential ? 'sequential' : 'parallel'
    form.loopCardinality = text((loop.loopCardinality as { body?: string } | undefined)?.body)
    form.collection =
      text(getBusinessProperty(loop, 'flowable:collection')) ||
      text(collectionHandler?.expression) ||
      text(collectionHandler?.string)
    form.multiSource = form.loopCardinality
      ? 'cardinality'
      : collectionHandler || form.collection
        ? 'collection'
        : 'collection'
    form.elementVariable = text(getBusinessProperty(loop, 'flowable:elementVariable'))
    form.elementIndexVariable = text(getBusinessProperty(loop, 'flowable:elementIndexVariable'))
    form.completionCondition = text(loop.completionCondition?.body)
  } else {
    form.multiType = 'none'
    form.multiSource = 'collection'
    form.loopCardinality = ''
    form.collection = ''
    form.elementVariable = ''
    form.elementIndexVariable = ''
  form.completionCondition = ''
  }

  const definition = bo.eventDefinitions?.[0]
  form.cancelActivity = booleanValue(bo.cancelActivity, true)
  form.isInterrupting = booleanValue(bo.isInterrupting, true)
  form.timerType = 'timeDuration'
  form.timerExpression = ''
  form.timerEndDate = ''
  form.timerBusinessCalendarName = ''
  form.conditionalExpression = ''
  form.messageRef = ''
  form.messageExpression = ''
  form.signalRef = ''
  form.signalExpression = ''
  form.signalAsync = false
  form.errorRef = ''
  form.errorVariableName = ''
  form.errorVariableTransient = false
  form.errorVariableLocalScope = false
  if (definition?.$type === 'bpmn:TimerEventDefinition') {
    const timerEntries = [
      ['timeDate', definition.timeDate],
      ['timeDuration', definition.timeDuration],
      ['timeCycle', definition.timeCycle],
    ] as const
    const timer = timerEntries.find(([, value]) => text((value as BpmnBusinessObject | undefined)?.body))
    form.timerType = timer?.[0] || 'timeDuration'
    form.timerExpression = text((timer?.[1] as BpmnBusinessObject | undefined)?.body)
    form.timerEndDate = definition.timeCycle
      ? text(
          getBusinessProperty(
            definition.timeCycle as BpmnBusinessObject,
            'flowable:endDate',
          ),
        )
      : ''
    form.timerBusinessCalendarName = text(
      getBusinessProperty(definition, 'flowable:businessCalendarName'),
    )
  } else if (definition?.$type === 'bpmn:ConditionalEventDefinition') {
    form.conditionalExpression = text((definition.condition as BpmnBusinessObject | undefined)?.body)
  } else if (definition?.$type === 'bpmn:MessageEventDefinition') {
    form.messageRef = text((definition.messageRef as BpmnBusinessObject | undefined)?.id)
    form.messageExpression = text(getBusinessProperty(definition, 'flowable:messageExpression'))
  } else if (definition?.$type === 'bpmn:SignalEventDefinition') {
    form.signalRef = text((definition.signalRef as BpmnBusinessObject | undefined)?.id)
    form.signalExpression = text(getBusinessProperty(definition, 'flowable:signalExpression'))
    form.signalAsync = booleanValue(getBusinessProperty(definition, 'flowable:async'))
  } else if (definition?.$type === 'bpmn:ErrorEventDefinition') {
    form.errorRef = text((definition.errorRef as BpmnBusinessObject | undefined)?.id)
    form.errorVariableName = text(getBusinessProperty(definition, 'flowable:errorVariableName'))
    form.errorVariableTransient = booleanValue(
      getBusinessProperty(definition, 'flowable:errorVariableTransient'),
    )
    form.errorVariableLocalScope = booleanValue(
      getBusinessProperty(definition, 'flowable:errorVariableLocalScope'),
    )
  }
}

watch(() => [props.element?.id, props.revision], hydrate, { immediate: true })

watch(
  () => props.element?.id,
  () => {
    customResourceDialogVisible.value = false
    mapExceptionDialogVisible.value = false
    const focusedSection = isProcess.value
      ? 'process'
      : isUserTask.value
        ? 'assignment'
        : isServiceTask.value || isScriptTask.value || isCallActivity.value
          ? 'implementation'
          : isBpmnEvent.value
            ? 'event'
            : isSequenceFlow.value
              ? 'flow'
              : ''
    activeSections.value = focusedSection ? ['general', focusedSection] : ['general']
  },
  { immediate: true },
)

function update(properties: Record<string, unknown>) {
  if (!props.modeler || !props.element) return
  updateElementProperties(props.modeler, props.element, properties)
  emit('changed')
}

function updateId() {
  if (!form.id.trim()) {
    ElMessage.warning(t('properties.messages.elementIdRequired'))
    hydrate()
    return
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(form.id)) {
    ElMessage.warning(t('properties.messages.idInvalid'))
    hydrate()
    return
  }
  if (props.modeler && businessObject.value) {
    const claimed = getClaimedIdOwner(props.modeler, form.id.trim())
    if (claimed && claimed !== businessObject.value) {
      ElMessage.warning(t('properties.messages.idUsed', { id: form.id.trim() }))
      hydrate()
      return
    }
  }
  update({ id: form.id.trim() })
}

function updateDoc() {
  if (!props.modeler || !props.element) return
  updateDocumentation(props.modeler, props.element, form.documentation)
  emit('changed')
}

function updateImplementation() {
  const topic = isExternalWorker.value ? form.serviceTopic.trim() : ''
  const supportsResultVariable = form.implementationType === 'expression'
  if (!isExternalWorker.value) form.serviceTopic = ''
  if (!supportsResultVariable) {
    form.resultVariableName = ''
    form.useLocalScopeForResultVariable = false
    form.storeResultVariableAsTransient = false
  }
  const resultVariableName = supportsResultVariable
    ? form.resultVariableName.trim() || undefined
    : undefined
  update({
    'flowable:class': form.implementationType === 'class' ? form.implementation : undefined,
    'flowable:expression':
      form.implementationType === 'expression' ? form.implementation : undefined,
    'flowable:delegateExpression':
      form.implementationType === 'delegateExpression' ? form.implementation : undefined,
    'flowable:type': form.implementationType === 'type' ? form.implementation : undefined,
    'flowable:topic': topic || undefined,
    'flowable:resultVariableName': resultVariableName,
    'flowable:resultVariable': undefined,
    'flowable:useLocalScopeForResultVariable':
      resultVariableName && form.useLocalScopeForResultVariable ? true : undefined,
    'flowable:storeResultVariableAsTransient':
      resultVariableName && form.storeResultVariableAsTransient ? true : undefined,
  })
}

function updateServiceResultVariable() {
  form.resultVariableName = form.resultVariableName.trim()
  if (!form.resultVariableName) {
    form.useLocalScopeForResultVariable = false
    form.storeResultVariableAsTransient = false
  }
  update({
    'flowable:resultVariableName': form.resultVariableName || undefined,
    'flowable:resultVariable': undefined,
    'flowable:useLocalScopeForResultVariable':
      form.resultVariableName && form.useLocalScopeForResultVariable ? true : undefined,
    'flowable:storeResultVariableAsTransient':
      form.resultVariableName && form.storeResultVariableAsTransient ? true : undefined,
  })
}

function updateExternalWorkerTopic() {
  form.serviceTopic = form.serviceTopic.trim()
  update({ 'flowable:topic': form.serviceTopic || undefined })
}

function updateServiceExtensionBody(type: string, body: string) {
  if (!props.modeler || !props.element) return
  if (setExtensionBody(props.modeler, props.element, type, body.trim())) emit('changed')
}

function updateServiceSystemChannel() {
  if (!props.modeler || !props.element) return
  const existing = extensionValues.value.find(
    (value) => value.$type === 'flowable:SystemChannel',
  )
  if (form.serviceSystemChannel) {
    if (existing) return
    const marker = createModdleElement<BpmnExtensionElement>(
      props.modeler,
      'flowable:SystemChannel',
      {},
    )
    addExtensionValue(props.modeler, props.element, marker)
  } else if (existing) {
    removeExtensionValue(props.modeler, props.element, existing)
  } else {
    return
  }
  emit('changed')
}

function updateCalledElementType() {
  update({
    'flowable:calledElementType':
      form.calledElementType === 'key' ? undefined : form.calledElementType,
  })
}

function changeImplementationType() {
  const implementationIsServiceType = serviceTaskTypeOptions.value.some(
    (option) => option.value === form.implementation,
  )
  if (
    (form.implementationType === 'type' && !implementationIsServiceType) ||
    (form.implementationType !== 'type' && implementationIsServiceType)
  ) {
    form.implementation = ''
    form.serviceTopic = ''
    if (form.implementationType !== 'expression') {
      form.resultVariableName = ''
      form.useLocalScopeForResultVariable = false
      form.storeResultVariableAsTransient = false
    }
    return
  }
  updateImplementation()
}

function changeServiceType() {
  if (form.implementation === 'external') form.implementation = 'external-worker'
  updateImplementation()
  if (form.implementation === 'mail' && !serviceFieldForm.charset) {
    serviceFieldForm.charset = 'utf-8'
    upsertServiceField({ name: 'charset', label: t('properties.serviceFields.charset'), valueType: 'string' })
  }
  if (form.implementation === 'http' && !serviceFieldForm.requestHeaders) {
    serviceFieldForm.requestHeaders = 'Content-Type: application/json'
    upsertServiceField({ name: 'requestHeaders', label: t('properties.serviceFields.requestHeaders'), valueType: 'string' })
    update({ 'flowable:parallelInSameTransaction': true })
  }
}

function upsertServiceField(spec: ServiceFieldSpec) {
  if (!props.modeler || !props.element) return
  const value = serviceFieldForm[spec.name] || ''
  const existing = injectedFields.value.find((field) => field.name === spec.name)
  if (!value.trim()) {
    if (existing) removeExtensionValue(props.modeler, props.element, existing)
    emit('changed')
    return
  }
  const values = {
    name: spec.name,
    stringValue: undefined,
    string: spec.valueType === 'string' ? value : undefined,
    expression: spec.valueType === 'expression' ? value : undefined,
  }
  if (existing) updateExtensionValue(props.modeler, props.element, existing, values)
  else {
    const field = createModdleElement<BpmnExtensionElement>(props.modeler, 'flowable:Field', values)
    addExtensionValue(props.modeler, props.element, field)
  }
  emit('changed')
}

function updateAsync() {
  update({
    'flowable:async': form.async || undefined,
    'flowable:asyncLeave': form.asyncLeave || undefined,
    'flowable:asyncAfter': undefined,
    'flowable:exclusive': form.async && !form.exclusive ? false : undefined,
    'flowable:asyncLeaveExclusive':
      form.asyncLeave && !form.asyncLeaveExclusive ? false : undefined,
  })
}

function updateJobCategory() {
  if (!props.modeler || !props.element) return
  form.jobCategory = form.jobCategory.trim()
  if (setJobCategoryBody(props.modeler, props.element, form.jobCategory)) emit('changed')
}

function updateFailedJobRetryTimeCycle() {
  if (!props.modeler || !props.element) return
  form.failedJobRetryTimeCycle = form.failedJobRetryTimeCycle.trim()
  if (
    setExtensionBody(
      props.modeler,
      props.element,
      'flowable:FailedJobRetryTimeCycle',
      form.failedJobRetryTimeCycle,
    )
  ) {
    emit('changed')
  }
}

function updateConditionExpression() {
  if (!props.modeler || !props.element) return
  const expression = createFormalExpression(
    props.modeler,
    form.conditionExpression,
    props.element.businessObject,
  )
  update({ conditionExpression: expression })
}

function updateDefaultFlow() {
  const selected = outgoingFlows.value.find((flow) => flow.value === form.defaultFlow)
  update({ default: selected?.businessObject })
}

function updateMultiInstance() {
  if (!props.modeler || !props.element) return
  if (form.multiType === 'none') {
    update({ loopCharacteristics: undefined })
    return
  }

  const existingLoop = props.element.businessObject.loopCharacteristics
  const existingCollectionHandler =
    existingLoop?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
      ? (
          existingLoop.extensionElements as
            | { values?: BpmnExtensionElement[] }
            | undefined
        )?.values?.find((value) => value.$type === 'flowable:Collection')
      : undefined
  const hasCollectionHandler = Boolean(existingCollectionHandler)
  const editsCollectionData = form.multiSource === 'collection' || hasCollectionHandler
  const currentCollection = existingLoop
    ? getBusinessProperty(existingLoop, 'flowable:collection')
    : undefined
  const currentElementVariable = existingLoop
    ? getBusinessProperty(existingLoop, 'flowable:elementVariable')
    : undefined
  const currentElementIndexVariable = existingLoop
    ? getBusinessProperty(existingLoop, 'flowable:elementIndexVariable')
    : undefined
  const baseProperties = {
    isSequential: form.multiType === 'sequential',
    'flowable:collection': hasCollectionHandler
      ? currentCollection
      : form.multiSource === 'collection'
        ? form.collection || undefined
        : currentCollection,
    'flowable:elementVariable':
      editsCollectionData
        ? form.elementVariable || undefined
        : currentElementVariable,
    'flowable:elementIndexVariable':
      editsCollectionData
        ? form.elementIndexVariable || undefined
        : currentElementIndexVariable,
  }
  const loop =
    existingLoop?.$type === 'bpmn:MultiInstanceLoopCharacteristics'
      ? existingLoop
      : createModdleElement<BpmnBusinessObject>(
          props.modeler,
          'bpmn:MultiInstanceLoopCharacteristics',
          baseProperties,
          props.element.businessObject,
        )
  let loopCardinality = existingLoop?.loopCardinality
  const existingCompletionCondition = existingLoop?.completionCondition
  let completionCondition = existingCompletionCondition
  let changed = false

  if (form.multiSource === 'cardinality') {
    if (loopCardinality && form.loopCardinality.trim()) {
      if (text((loopCardinality as { body?: string }).body) !== form.loopCardinality) {
        updateModdleProperties(props.modeler, props.element, loopCardinality, {
          body: form.loopCardinality,
        })
        changed = true
      }
    } else {
      loopCardinality = createFormalExpression(props.modeler, form.loopCardinality, loop)
    }
  } else {
    loopCardinality = undefined
  }

  if (completionCondition && form.completionCondition.trim()) {
    if (
      text((completionCondition as { body?: string }).body) !==
      form.completionCondition
    ) {
      updateModdleProperties(props.modeler, props.element, completionCondition, {
        body: form.completionCondition,
      })
      changed = true
    }
  } else {
    completionCondition = createFormalExpression(
      props.modeler,
      form.completionCondition,
      loop,
    )
  }
  const properties = {
    ...baseProperties,
    loopCardinality,
    completionCondition,
  }
  if (loop === existingLoop) {
    if (existingCollectionHandler) {
      const valueProperty = existingCollectionHandler.expression !== undefined
        ? 'expression'
        : 'string'
      const collectionValue = form.collection || undefined
      if (existingCollectionHandler[valueProperty] !== collectionValue) {
        updateModdleProperties(
          props.modeler,
          props.element,
          existingCollectionHandler,
          { [valueProperty]: collectionValue },
        )
        changed = true
      }
    }
    const changedLoopProperties = Object.fromEntries(
      Object.entries(properties).filter(
        ([name, value]) => getBusinessProperty(loop, name) !== value,
      ),
    )
    if (Object.keys(changedLoopProperties).length) {
      updateModdleProperties(
        props.modeler,
        props.element,
        loop,
        changedLoopProperties,
      )
      changed = true
    }
    if (changed) emit('changed')
  } else {
    loop.loopCardinality = loopCardinality
    loop.completionCondition = completionCondition
    update({ loopCharacteristics: loop })
  }
}

function updateEventDefinition(properties: Record<string, unknown>) {
  if (!props.modeler || !props.element || !eventDefinition.value) return
  updateExtensionValue(
    props.modeler,
    props.element,
    eventDefinition.value as unknown as BpmnExtensionElement,
    properties,
  )
  emit('changed')
}

function updateErrorVariableConfiguration() {
  const enabled = Boolean(form.errorVariableName.trim())
  updateEventDefinition({
    'flowable:errorVariableName': enabled ? form.errorVariableName.trim() : undefined,
    'flowable:errorVariableTransient':
      enabled && form.errorVariableTransient ? true : undefined,
    'flowable:errorVariableLocalScope':
      enabled && form.errorVariableLocalScope ? true : undefined,
  })
}

function updateTimerDefinition() {
  if (!props.modeler || !eventDefinition.value) return
  const expression = form.timerExpression.trim()
    ? createModdleElement<BpmnBusinessObject>(
        props.modeler,
        'bpmn:FormalExpression',
        {
          body: form.timerExpression,
          'flowable:endDate':
            form.timerType === 'timeCycle' ? form.timerEndDate.trim() || undefined : undefined,
        },
        eventDefinition.value,
      )
    : undefined
  updateEventDefinition({
    timeDate: form.timerType === 'timeDate' ? expression : undefined,
    timeDuration: form.timerType === 'timeDuration' ? expression : undefined,
    timeCycle: form.timerType === 'timeCycle' ? expression : undefined,
    'flowable:businessCalendarName':
      form.timerBusinessCalendarName.trim() || undefined,
  })
}

function updateTimerExpression() {
  if (!props.modeler || !props.element || !eventDefinition.value) return
  const expression = eventDefinition.value[form.timerType] as
    | BpmnBusinessObject
    | undefined
  if (!expression || !form.timerExpression.trim()) {
    updateTimerDefinition()
    return
  }
  if (text(expression.body) === form.timerExpression) return
  updateModdleProperties(props.modeler, props.element, expression, {
    body: form.timerExpression,
  })
  emit('changed')
}

function updateTimerEndDate() {
  if (!props.modeler || !props.element || !eventDefinition.value) return
  const timeCycle = eventDefinition.value.timeCycle as BpmnBusinessObject | undefined
  if (!timeCycle) {
    updateTimerDefinition()
    return
  }
  const endDate = form.timerEndDate.trim() || undefined
  if (getBusinessProperty(timeCycle, 'flowable:endDate') === endDate) return
  updateModdleProperties(props.modeler, props.element, timeCycle, {
    'flowable:endDate': endDate,
  })
  emit('changed')
}

function updateTimerBusinessCalendar() {
  updateEventDefinition({
    'flowable:businessCalendarName':
      form.timerBusinessCalendarName.trim() || undefined,
  })
}

function updateConditionalDefinition() {
  if (!props.modeler || !eventDefinition.value) return
  updateEventDefinition({
    condition: createFormalExpression(
      props.modeler,
      form.conditionalExpression,
      eventDefinition.value,
    ),
  })
}

function definitionKind(value: BpmnBusinessObject): GlobalDefinitionKind {
  if (value.$type === 'bpmn:Signal') return 'signal'
  if (value.$type === 'bpmn:Error') return 'error'
  return 'message'
}

function definitionKindLabel(value: BpmnBusinessObject) {
  const kind = definitionKind(value)
  return kind === 'message'
    ? t('properties.definitions.message')
    : kind === 'signal'
      ? t('properties.definitions.signal')
      : t('properties.definitions.error')
}

function resetDefinitionForm(kind: GlobalDefinitionKind) {
  editingDefinition.value = null
  Object.assign(definitionForm, {
    kind,
    id: `${kind[0]!.toUpperCase()}${kind.slice(1)}_${Date.now().toString(36)}`,
    name: '',
    errorCode: '',
    errorMessage: '',
    scope: '',
  })
}

function openDefinitionDialog(kind: GlobalDefinitionKind, value?: BpmnBusinessObject) {
  resetDefinitionForm(kind)
  if (value) {
    editingDefinition.value = value
    Object.assign(definitionForm, {
      kind: definitionKind(value),
      id: text(value.id),
      name: text(value.name),
      errorCode: text(value.errorCode),
      errorMessage: text(getBusinessProperty(value, 'flowable:errorMessage')),
      scope: text(getBusinessProperty(value, 'flowable:scope')),
    })
  }
  definitionDialogVisible.value = true
}

function saveGlobalDefinition() {
  if (!props.modeler || !props.element || !definitions.value) return
  const id = definitionForm.id.trim()
  if (!id) {
    ElMessage.warning(t('properties.definitions.idRequired'))
    return
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) {
    ElMessage.warning(t('properties.definitions.idInvalid'))
    return
  }

  const claimedIdOwner = getClaimedIdOwner(props.modeler, id)
  if (claimedIdOwner && claimedIdOwner !== editingDefinition.value) {
    ElMessage.warning(t('properties.messages.idUsed', { id }))
    return
  }

  const commonProperties = {
    id,
    name: definitionForm.name.trim() || undefined,
  }
  const properties =
    definitionForm.kind === 'error'
      ? {
          ...commonProperties,
          errorCode: definitionForm.errorCode.trim() || undefined,
          'flowable:errorMessage': definitionForm.errorMessage.trim() || undefined,
        }
      : definitionForm.kind === 'signal'
        ? {
            ...commonProperties,
            'flowable:scope': definitionForm.scope.trim() || undefined,
          }
        : commonProperties

  if (editingDefinition.value) {
    mutateGlobalDefinition(
      props.modeler,
      props.element,
      definitions.value,
      editingDefinition.value,
      'update',
      properties,
    )
  } else {
    const bpmnType =
      definitionForm.kind === 'message'
        ? 'bpmn:Message'
        : definitionForm.kind === 'signal'
          ? 'bpmn:Signal'
          : 'bpmn:Error'
    mutateGlobalDefinition(
      props.modeler,
      props.element,
      definitions.value,
      undefined,
      'add',
      properties,
      bpmnType,
    )
  }

  definitionDialogVisible.value = false
  emit('changed')
}

function definitionReferenceCount(value: BpmnBusinessObject) {
  const root = definitions.value
  if (!root || root.$type !== 'bpmn:Definitions' || !globalDefinitionTypes.has(value.$type)) {
    return 0
  }

  const visited = new WeakSet<object>()
  let count = 0

  const pointsToDefinition = (candidate: unknown) => {
    if (candidate === value) return true
    if (!value.id) return false
    if (typeof candidate === 'string') return candidate === value.id
    if (!candidate || typeof candidate !== 'object') return false
    const reference = candidate as Partial<BpmnBusinessObject>
    return reference.id === value.id && reference.$type === value.$type
  }

  const visit = (candidate: unknown): void => {
    if (!candidate || typeof candidate !== 'object' || visited.has(candidate)) return
    visited.add(candidate)

    if (Array.isArray(candidate)) {
      candidate.forEach(visit)
      return
    }

    const node = candidate as TraversableModdleElement
    const type = typeof node.$type === 'string' ? node.$type : ''
    if (
      !type ||
      type.startsWith('bpmndi:') ||
      type.startsWith('di:') ||
      type.startsWith('dc:')
    ) return

    for (const property of node.$descriptor?.properties || []) {
      if (property.isVirtual || property.name === 'diagrams') continue
      const child = node[property.name]
      if (child === undefined || child === null) continue
      if (property.isReference) {
        const references = Array.isArray(child) ? child : [child]
        count += references.filter(pointsToDefinition).length
      } else {
        visit(child)
      }
    }
  }

  visit(root)
  return count
}

async function confirmDelete(message: string, title: string) {
  try {
    await ElMessageBox.confirm(message, title, { type: 'warning' })
    return true
  } catch {
    return false
  }
}

async function removeGlobalDefinition(value: BpmnBusinessObject) {
  if (!props.modeler || !props.element || !definitions.value) return
  const references = definitionReferenceCount(value)
  if (references) {
    ElMessage.warning(t('properties.definitions.inUse', {
      kind: definitionKindLabel(value),
      count: references,
    }))
    return
  }
  if (
    !(await confirmDelete(
      t('properties.definitions.confirmDelete', {
        kind: definitionKindLabel(value),
        name: String(value.name || value.id),
      }),
      t('properties.definitions.deleteTitle'),
    ))
  ) return
  mutateGlobalDefinition(props.modeler, props.element, definitions.value, value, 'remove')
  emit('changed')
}

function updateEventReference(
  propertyName: 'messageRef' | 'signalRef' | 'errorRef',
  id: string,
) {
  const reference = globalDefinitions.value.find((value) => value.id === id)
  updateEventDefinition({ [propertyName]: reference })
}

function clearListenerResolver() {
  listenerForm.resolverType = ''
  listenerForm.resolverImplementation = ''
}

function changeListenerImplementationType() {
  if (!listenerSupportsTransaction.value) {
    listenerForm.onTransaction = ''
    clearListenerResolver()
  }
  if (!listenerSupportsFields.value) listenerForm.fields = []
}

function changeListenerTransaction() {
  if (!listenerForm.onTransaction) clearListenerResolver()
  if (!listenerSupportsFields.value) listenerForm.fields = []
}

function changeListenerKind() {
  listenerForm.event =
    listenerForm.kind === 'taskListener' ? 'create' : isSequenceFlow.value ? 'take' : 'start'
}

function resetListenerForm(kind: ListenerKind) {
  editingListener.value = null
  listenerForm.kind = kind
  listenerForm.event = kind === 'taskListener' ? 'create' : isSequenceFlow.value ? 'take' : 'start'
  listenerForm.implementationType = 'class'
  listenerForm.implementation = ''
  listenerForm.scriptLanguage = ''
  listenerForm.scriptResultVariable = ''
  listenerForm.scriptBody = ''
  listenerForm.onTransaction = ''
  clearListenerResolver()
  listenerForm.fields = []
}

function customResourceExpression(resource: BpmnExtensionElement) {
  const assignmentExpression = resource.resourceAssignmentExpression as
    | BpmnBusinessObject
    | undefined
  if (!assignmentExpression) return ''
  const formalExpression = getBusinessProperty(
    assignmentExpression,
    'bpmn:formalExpression',
  ) as BpmnBusinessObject | undefined
  return text(formalExpression?.body)
}

function openCustomResourceDialog(resource?: BpmnExtensionElement) {
  editingCustomResource.value = resource || null
  customResourceForm.name = resource ? text(getBusinessProperty(resource, 'name')) : ''
  customResourceForm.expression = resource ? customResourceExpression(resource) : ''
  customResourceDialogVisible.value = true
}

function saveCustomResource() {
  if (!props.modeler || !props.element) return
  const name = customResourceForm.name.trim()
  const expression = customResourceForm.expression.trim()
  if (!name) {
    ElMessage.warning(t('properties.messages.identityTypeRequired'))
    return
  }
  if (!expression) {
    ElMessage.warning(t('properties.messages.assignmentRequired'))
    return
  }

  mutateCustomResource(
    props.modeler,
    props.element,
    editingCustomResource.value ? 'update' : 'add',
    editingCustomResource.value || undefined,
    { name, expression },
  )
  customResourceDialogVisible.value = false
  emit('changed')
}

async function removeCustomResource(resource: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteIdentity'),
    t('properties.messages.deleteIdentityTitle'),
  ))) return
  mutateCustomResource(props.modeler, props.element, 'remove', resource)
  emit('changed')
}

function openListenerDialog(
  kind: ListenerKind,
  listener?: BpmnExtensionElement,
) {
  resetListenerForm(kind)
  if (listener) {
    editingListener.value = listener
    listenerForm.event = text(listener.event) || (isSequenceFlow.value ? 'take' : listenerForm.event)
    if (text(listener.class)) {
      listenerForm.implementationType = 'class'
      listenerForm.implementation = text(listener.class)
    } else if (text(listener.expression)) {
      listenerForm.implementationType = 'expression'
      listenerForm.implementation = text(listener.expression)
    } else if (text(listener.delegateExpression)) {
      listenerForm.implementationType = 'delegateExpression'
      listenerForm.implementation = text(listener.delegateExpression)
    } else if (text(listener.type) === 'script') {
      listenerForm.implementationType = 'script'
      const script = listener.script as BpmnExtensionElement | undefined
      listenerForm.scriptLanguage = text(script?.language)
      listenerForm.scriptResultVariable = text(script?.resultVariable)
      listenerForm.scriptBody = text(script?.value)
    }

    const onTransaction = text(listener.onTransaction)
    if (
      listenerSupportsTransaction.value &&
      ['before-commit', 'committed', 'rolled-back'].includes(onTransaction)
    ) {
      listenerForm.onTransaction = onTransaction as ListenerTransactionPhase
    }
    if (listenerForm.onTransaction) {
      const resolver = [
        ['class', listener.customPropertiesResolverClass],
        ['expression', listener.customPropertiesResolverExpression],
        ['delegateExpression', listener.customPropertiesResolverDelegateExpression],
      ] as const
      const configuredResolver = resolver.find(([, value]) => text(value))
      listenerForm.resolverType = configuredResolver?.[0] || ''
      listenerForm.resolverImplementation = text(configuredResolver?.[1])
    }
    if (listenerForm.implementationType !== 'script') {
      listenerForm.fields = ((listener.fields as BpmnExtensionElement[] | undefined) || []).map(
        (field) => ({
          name: text(field.name),
          valueType: field.expression ? ('expression' as const) : ('string' as const),
          value: text(field.expression || field.string || field.stringValue),
        }),
      )
    }
  }
  listenerDialogVisible.value = true
}

function addListenerField() {
  listenerForm.fields.push({ name: '', valueType: 'string', value: '' })
}

function saveListener() {
  if (!props.modeler || !props.element) return
  if (!listenerForm.event) {
    ElMessage.warning(t('properties.messages.selectListenerEvent'))
    return
  }
  const isScript = listenerForm.implementationType === 'script'
  if (isScript && (!listenerForm.scriptLanguage.trim() || !listenerForm.scriptBody.trim())) {
    ElMessage.warning(t('properties.messages.scriptDetailsRequired'))
    return
  }
  if (!isScript && !listenerForm.implementation.trim()) {
    ElMessage.warning(t('properties.messages.listenerImplementationRequired'))
    return
  }
  if (listenerForm.onTransaction && !listenerSupportsTransaction.value) {
    ElMessage.warning(t('properties.messages.transactionUnsupported'))
    return
  }
  if (!listenerForm.onTransaction && listenerForm.resolverType) {
    ElMessage.warning(t('properties.messages.resolverTransactionOnly'))
    return
  }
  if (listenerForm.resolverType && !listenerForm.resolverImplementation.trim()) {
    ElMessage.warning(t('properties.messages.resolverRequired'))
    return
  }

  const fields = !listenerSupportsFields.value
    ? []
    : listenerForm.fields
        .filter((field) => field.name.trim())
        .map((field) =>
          createModdleElement<BpmnExtensionElement>(props.modeler!, 'flowable:Field', {
            name: field.name,
            string: field.valueType === 'string' ? field.value : undefined,
            expression: field.valueType === 'expression' ? field.value : undefined,
          }),
        )
  const script = isScript
    ? createModdleElement<BpmnExtensionElement>(props.modeler, 'flowable:Script', {
        language: listenerForm.scriptLanguage,
        resultVariable: listenerForm.scriptResultVariable || undefined,
        value: listenerForm.scriptBody,
      })
    : undefined

  const listenerType =
    listenerForm.kind === 'taskListener' ? 'flowable:TaskListener' : 'flowable:ExecutionListener'
  const resolverType = listenerForm.onTransaction ? listenerForm.resolverType : ''
  const values = {
    event: listenerForm.event,
    class: listenerForm.implementationType === 'class' ? listenerForm.implementation : undefined,
    expression:
      listenerForm.implementationType === 'expression' ? listenerForm.implementation : undefined,
    delegateExpression:
      listenerForm.implementationType === 'delegateExpression'
        ? listenerForm.implementation
        : undefined,
    type: isScript ? 'script' : undefined,
    script,
    onTransaction: listenerForm.onTransaction || undefined,
    customPropertiesResolverClass:
      resolverType === 'class' ? listenerForm.resolverImplementation : undefined,
    customPropertiesResolverExpression:
      resolverType === 'expression' ? listenerForm.resolverImplementation : undefined,
    customPropertiesResolverDelegateExpression:
      resolverType === 'delegateExpression' ? listenerForm.resolverImplementation : undefined,
    fields,
  }

  if (editingListener.value) {
    if (script) (script as { $parent?: object }).$parent = editingListener.value
    fields.forEach((field) => ((field as { $parent?: object }).$parent = editingListener.value!))
    updateExtensionValue(props.modeler, props.element, editingListener.value, values)
  } else {
    const listener = createModdleElement<BpmnExtensionElement>(props.modeler, listenerType, values)
    if (script) (script as { $parent?: object }).$parent = listener
    fields.forEach((field) => ((field as { $parent?: object }).$parent = listener))
    addExtensionValue(props.modeler, props.element, listener)
  }
  listenerDialogVisible.value = false
  emit('changed')
}

async function removeListener(listener: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteListener'),
    t('properties.messages.deleteListenerTitle'),
  ))) return
  removeExtensionValue(props.modeler, props.element, listener)
  emit('changed')
}

function resetFormProperty() {
  editingFormProperty.value = null
  Object.assign(formPropertyForm, {
    id: '',
    name: '',
    type: 'string',
    variable: '',
    expression: '',
    default: '',
    datePattern: '',
    readable: true,
    writable: true,
    required: false,
    values: [],
  })
}

function openFormPropertyDialog(value?: BpmnExtensionElement) {
  resetFormProperty()
  if (value) {
    editingFormProperty.value = value
    Object.assign(formPropertyForm, {
      id: text(value.id),
      name: text(value.name),
      type: text(value.type) || 'string',
      variable: text(value.variable),
      expression: text(value.expression),
      default: text(value.default),
      datePattern: text(value.datePattern),
      readable: booleanValue(value.readable, true),
      writable: booleanValue(value.writable, true),
      required: booleanValue(value.required),
      values: ((value.values as BpmnExtensionElement[] | undefined) || []).map((item) => ({
        id: text(item.id),
        name: text(item.name),
      })),
    })
  }
  formDialogVisible.value = true
}

function saveFormProperty() {
  if (!props.modeler || !props.element) return
  if (!formPropertyForm.id.trim()) {
    ElMessage.warning(t('properties.messages.formFieldIdRequired'))
    return
  }
  const values = formPropertyForm.values
    .filter((item) => item.id.trim())
    .map((item) =>
      createModdleElement<BpmnExtensionElement>(props.modeler!, 'flowable:Value', item),
    )
  const properties = {
    id: formPropertyForm.id,
    name: formPropertyForm.name || undefined,
    type: formPropertyForm.type,
    variable: formPropertyForm.variable || undefined,
    expression: formPropertyForm.expression || undefined,
    default: formPropertyForm.default || undefined,
    datePattern: formPropertyForm.type === 'date' ? formPropertyForm.datePattern || undefined : undefined,
    readable: formPropertyForm.readable,
    writable: formPropertyForm.writable,
    required: formPropertyForm.required,
    values: formPropertyForm.type === 'enum' ? values : [],
  }

  if (editingFormProperty.value) {
    values.forEach((value) => ((value as { $parent?: object }).$parent = editingFormProperty.value!))
    updateExtensionValue(props.modeler, props.element, editingFormProperty.value, properties)
  } else {
    const formProperty = createModdleElement<BpmnExtensionElement>(
      props.modeler,
      'flowable:FormProperty',
      properties,
    )
    values.forEach((value) => ((value as { $parent?: object }).$parent = formProperty))
    addExtensionValue(props.modeler, props.element, formProperty)
  }
  formDialogVisible.value = false
  emit('changed')
}

async function removeFormProperty(value: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteFormField'),
    t('properties.messages.deleteFormFieldTitle'),
  ))) return
  removeExtensionValue(props.modeler, props.element, value)
  emit('changed')
}

function nextExtensionPropertyId() {
  if (!props.modeler) return 'Property_1'
  const registry = props.modeler.get<{ getAll: () => DiagramElement[] }>('elementRegistry')
  const used = new Set<string>()
  for (const element of registry.getAll()) {
    for (const container of getExtensionValues(element).filter(
      (value) => value.$type === 'flowable:Properties',
    )) {
      for (const item of (container.values as BpmnExtensionElement[] | undefined) || []) {
        if (item.id) used.add(String(item.id))
      }
    }
  }
  let sequence = 1
  while (used.has(`Property_${sequence}`)) sequence += 1
  return `Property_${sequence}`
}

function openExtensionPropertyDialog(value?: BpmnExtensionElement) {
  editingExtensionProperty.value = value || null
  extensionPropertyForm.id = text(value?.id) || nextExtensionPropertyId()
  extensionPropertyForm.name = text(value?.name)
  extensionPropertyForm.value = text(value?.value)
  extensionPropertyDialogVisible.value = true
}

function saveExtensionProperty() {
  if (!props.modeler || !props.element) return
  if (!extensionPropertyForm.name.trim() || !extensionPropertyForm.value.trim()) {
    ElMessage.warning(t('properties.messages.extensionPropertyRequired'))
    return
  }
  const values = {
    id: extensionPropertyForm.id.trim() || nextExtensionPropertyId(),
    name: extensionPropertyForm.name.trim(),
    value: extensionPropertyForm.value,
  }

  if (editingExtensionProperty.value) {
    updateExtensionValue(
      props.modeler,
      props.element,
      editingExtensionProperty.value,
      values,
    )
  } else {
    const propertyValue = createModdleElement<BpmnExtensionElement>(
      props.modeler,
      'flowable:Property',
      values,
    )
    const container = extensionPropertyContainers.value[0]
    if (container) {
      ;(propertyValue as { $parent?: object }).$parent = container
      updateExtensionValue(props.modeler, props.element, container, {
        values: [...extensionProperties.value, propertyValue],
      })
    } else {
      const newContainer = createModdleElement<BpmnExtensionElement>(
        props.modeler,
        'flowable:Properties',
        { values: [propertyValue] },
      )
      ;(propertyValue as { $parent?: object }).$parent = newContainer
      addExtensionValue(props.modeler, props.element, newContainer)
    }
  }
  extensionPropertyDialogVisible.value = false
  emit('changed')
}

async function removeExtensionProperty(value: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteProperty'),
    t('properties.messages.deletePropertyTitle'),
  ))) return
  const container = extensionPropertyContainers.value[0]
  if (!container) return
  const remaining = extensionProperties.value.filter((item) => item !== value)
  if (remaining.length) {
    updateExtensionValue(props.modeler, props.element, container, { values: remaining })
  } else {
    removeExtensionValue(props.modeler, props.element, container)
  }
  emit('changed')
}

function openMapExceptionDialog(value?: BpmnExtensionElement) {
  editingMapException.value = value || null
  mapExceptionForm.errorCode = text(value?.errorCode)
  mapExceptionForm.exceptionClass = text(value?.class)
  mapExceptionForm.includeChildExceptions = booleanValue(value?.includeChildExceptions)
  mapExceptionForm.rootCause = text(value?.rootCause)
  mapExceptionDialogVisible.value = true
}

function saveMapException() {
  if (!props.modeler || !props.element) return
  const errorCode = mapExceptionForm.errorCode.trim()
  if (!errorCode) {
    ElMessage.warning(t('properties.messages.mapErrorCodeRequired'))
    return
  }

  const values = {
    errorCode,
    class: mapExceptionForm.exceptionClass.trim() || undefined,
    includeChildExceptions: mapExceptionForm.includeChildExceptions,
    rootCause: mapExceptionForm.rootCause.trim() || undefined,
  }
  if (editingMapException.value) {
    updateExtensionValue(props.modeler, props.element, editingMapException.value, values)
  } else {
    addExtensionValue(
      props.modeler,
      props.element,
      createModdleElement<BpmnExtensionElement>(props.modeler, 'flowable:MapException', values),
    )
  }
  mapExceptionDialogVisible.value = false
  emit('changed')
}

async function removeMapException(value: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteMap', { code: text(value.errorCode) }),
    t('properties.messages.deleteMapTitle'),
  ))) {
    return
  }
  removeExtensionValue(props.modeler, props.element, value)
  emit('changed')
}

function moveMapException(index: number, direction: -1 | 1) {
  if (!props.modeler || !props.element) return
  const targetIndex = index + direction
  if (targetIndex < 0 || targetIndex >= mapExceptions.value.length) return
  const extensionElements = props.element.businessObject.extensionElements
  if (!extensionElements) return

  const ordered = [...mapExceptions.value]
  ;[ordered[index], ordered[targetIndex]] = [ordered[targetIndex]!, ordered[index]!]
  let currentMapIndex = 0
  const values = (extensionElements.values || []).map((value) =>
    value.$type === 'flowable:MapException' ? ordered[currentMapIndex++]! : value,
  )
  updateExtensionValue(
    props.modeler,
    props.element,
    extensionElements as BpmnExtensionElement,
    { values },
  )
  emit('changed')
}

function openFieldDialog(field?: BpmnExtensionElement) {
  editingField.value = field || null
  fieldForm.name = text(field?.name)
  fieldForm.valueType = field?.expression ? 'expression' : 'string'
  fieldForm.value = text(field?.expression || field?.string || field?.stringValue)
  fieldDialogVisible.value = true
}

function saveField() {
  if (!props.modeler || !props.element) return
  if (!fieldForm.name.trim()) {
    ElMessage.warning(t('properties.messages.fieldNameRequired'))
    return
  }
  const values = {
    name: fieldForm.name,
    stringValue: undefined,
    string: fieldForm.valueType === 'string' ? fieldForm.value : undefined,
    expression: fieldForm.valueType === 'expression' ? fieldForm.value : undefined,
  }
  if (editingField.value) updateExtensionValue(props.modeler, props.element, editingField.value, values)
  else {
    const field = createModdleElement<BpmnExtensionElement>(props.modeler, 'flowable:Field', values)
    addExtensionValue(props.modeler, props.element, field)
  }
  fieldDialogVisible.value = false
  emit('changed')
}

async function removeField(field: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteField'),
    t('properties.messages.deleteFieldTitle'),
  ))) return
  removeExtensionValue(props.modeler, props.element, field)
  emit('changed')
}

function openMappingDialog(kind: MappingKind, mapping?: BpmnExtensionElement) {
  editingMapping.value = mapping || null
  mappingForm.kind = kind
  mappingForm.sourceType = mapping?.sourceExpression
    ? 'sourceExpression'
    : mapping?.variables
      ? 'variables'
      : 'source'
  mappingForm.source = text(
    mapping?.sourceExpression || mapping?.source || mapping?.variables,
  )
  mappingForm.target = text(mapping?.target)
  mappingForm.transient = booleanValue(mapping?.transient)
  mappingDialogVisible.value = true
}

function saveMapping() {
  if (!props.modeler || !props.element) return
  if (!mappingForm.source.trim()) {
    ElMessage.warning(t('properties.messages.mappingSourceRequired'))
    return
  }
  if (
    mappingForm.sourceType === 'variables' &&
    mappingForm.source.trim().toLowerCase() !== 'all'
  ) {
    ElMessage.warning(t('properties.messages.allVariablesOnly'))
    return
  }
  if (mappingForm.sourceType !== 'variables' && !mappingForm.target.trim()) {
    ElMessage.warning(t('properties.messages.mappingTargetRequired'))
    return
  }
  const preserveUnsupportedTransient =
    !mappingSupportsTransient.value && booleanValue(editingMapping.value?.transient)
  const properties = {
    source: mappingForm.sourceType === 'source' ? mappingForm.source : undefined,
    sourceExpression:
      mappingForm.sourceType === 'sourceExpression' ? mappingForm.source : undefined,
    variables: mappingForm.sourceType === 'variables' ? 'all' : undefined,
    target: mappingForm.sourceType === 'variables' ? undefined : mappingForm.target,
    local: undefined,
    transient:
      mappingForm.sourceType !== 'variables' &&
      (mappingSupportsTransient.value ? mappingForm.transient : preserveUnsupportedTransient)
        ? true
        : undefined,
  }
  if (editingMapping.value) {
    updateExtensionValue(props.modeler, props.element, editingMapping.value, properties)
  } else {
    const typeByKind: Record<MappingKind, string> = {
      in: 'flowable:In',
      out: 'flowable:Out',
      eventIn: 'flowable:EventInParameter',
      eventOut: 'flowable:EventOutParameter',
    }
    const type = typeByKind[mappingForm.kind]
    const mapping = createModdleElement<BpmnExtensionElement>(props.modeler, type, properties)
    addExtensionValue(props.modeler, props.element, mapping)
  }
  mappingDialogVisible.value = false
  emit('changed')
}

async function removeMapping(mapping: BpmnExtensionElement) {
  if (!props.modeler || !props.element) return
  if (!(await confirmDelete(
    t('properties.messages.confirmDeleteMapping'),
    t('properties.messages.deleteMappingTitle'),
  ))) return
  removeExtensionValue(props.modeler, props.element, mapping)
  emit('changed')
}

function mappingLabel(mapping: BpmnExtensionElement) {
  const source = mapping.sourceExpression || mapping.source || mapping.variables || t('properties.common.notConfigured')
  return `${source}${mapping.target ? ` → ${mapping.target}` : ''}`
}

function mappingTypeLabel(mapping: BpmnExtensionElement) {
  if (mapping.$type === 'flowable:EventInParameter') return 'flowable:eventInParameter'
  if (mapping.$type === 'flowable:EventOutParameter') return 'flowable:eventOutParameter'
  return mapping.$type === 'flowable:In' ? 'flowable:in' : 'flowable:out'
}

function listenerImplementationLabel(listener: BpmnExtensionElement) {
  if (listener.class) return t('properties.extensions.stringOrExpression', {
    type: t('properties.common.javaClass'), value: String(listener.class),
  })
  if (listener.delegateExpression) return t('properties.extensions.stringOrExpression', {
    type: t('properties.common.delegateExpression'), value: String(listener.delegateExpression),
  })
  if (listener.expression) return t('properties.extensions.stringOrExpression', {
    type: t('properties.common.expression'), value: String(listener.expression),
  })
  if (listener.type === 'script') {
    const script = listener.script as BpmnExtensionElement | undefined
    return t('properties.extensions.stringOrExpression', {
      type: t('properties.common.script'),
      value: text(script?.language) || t('properties.common.notConfigured'),
    })
  }
  return t('properties.common.notConfigured')
}

const listenerKeys = new WeakMap<object, string>()
let listenerKeySequence = 0

function listenerKey(listener: BpmnExtensionElement) {
  const existing = listenerKeys.get(listener)
  if (existing) return existing
  const key = `listener-${listenerKeySequence++}`
  listenerKeys.set(listener, key)
  return key
}
</script>

<template>
  <aside class="properties-panel">
    <div v-if="element" class="properties-content">
      <div class="element-summary">
        <div class="element-icon"><span class="i-ep-setting" /></div>
        <div class="min-w-0 flex-1">
          <div class="truncate text-sm font-600">{{ form.name || form.id || t('properties.common.unnamedElement') }}</div>
          <div class="mt-1 text-xs text-gray-500">{{ elementTypeLabel }}</div>
        </div>
        <el-tag size="small" effect="plain">Flowable</el-tag>
      </div>

      <el-collapse v-model="activeSections">
        <el-collapse-item name="general" :title="t('properties.sections.general')">
          <el-form label-position="top" size="small">
            <el-form-item :label="t('properties.common.identifier')" required>
              <el-input v-model="form.id" spellcheck="false" @change="updateId" />
            </el-form-item>
            <el-form-item :label="t('properties.common.name')">
              <el-input v-model="form.name" clearable @change="update({ name: form.name })" />
            </el-form-item>
            <el-form-item :label="t('properties.common.description')">
              <el-input
                v-model="form.documentation"
                type="textarea"
                :rows="3"
                resize="vertical"
                :placeholder="t('properties.general.elementBusinessMeaning')"
                @change="updateDoc"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="isProcess" name="process" :title="t('properties.sections.process')">
          <el-form label-position="top" size="small">
            <div class="switch-row">
              <span>{{ t('properties.general.executable') }}</span>
              <el-switch v-model="form.isExecutable" @change="update({ isExecutable: form.isExecutable })" />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.general.eagerExecutionTree') }}</span>
              <el-switch
                v-model="form.isEagerExecutionFetching"
                data-testid="process-eager-execution"
                @change="update({ 'flowable:isEagerExecutionFetching': form.isEagerExecutionFetching || undefined })"
              />
            </div>
            <el-form-item :label="t('properties.general.candidateStarterUsers')">
              <el-input
                v-model="form.candidateStarterUsers"
                :placeholder="t('properties.general.commaSeparatedUsers')"
                @change="update({ 'flowable:candidateStarterUsers': form.candidateStarterUsers })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.general.candidateStarterGroups')">
              <el-input
                v-model="form.candidateStarterGroups"
                :placeholder="t('properties.general.commaSeparatedGroups')"
                @change="update({ 'flowable:candidateStarterGroups': form.candidateStarterGroups })"
              />
            </el-form-item>
          </el-form>

          <div class="section-list-header">
            <span>{{ t('properties.definitions.title') }}</span>
          </div>
          <div class="definition-actions">
            <el-button
              size="small"
              data-testid="add-global-message"
              @click="openDefinitionDialog('message')"
            >
              {{ t('properties.definitions.addMessage') }}
            </el-button>
            <el-button size="small" @click="openDefinitionDialog('signal')">{{ t('properties.definitions.addSignal') }}</el-button>
            <el-button size="small" @click="openDefinitionDialog('error')">{{ t('properties.definitions.addError') }}</el-button>
          </div>
          <div v-if="globalDefinitions.length" class="item-list mt-3">
            <div v-for="item in globalDefinitions" :key="String(item.id)" class="list-item">
              <el-tag size="small" effect="plain">{{ definitionKindLabel(item) }}</el-tag>
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm">{{ item.name || item.id }}</div>
                <div class="truncate text-xs text-gray-500">
                  {{ item.id }}
                  <template v-if="item.$type === 'bpmn:Error' && item.errorCode">
                    · {{ item.errorCode }}
                  </template>
                  <template v-if="item.$type === 'bpmn:Signal' && getBusinessProperty(item, 'flowable:scope')">
                    · {{ getBusinessProperty(item, 'flowable:scope') }}
                  </template>
                </div>
              </div>
              <el-button link :icon="Edit" @click="openDefinitionDialog(definitionKind(item), item)" />
              <el-button link type="danger" :icon="Delete" @click="removeGlobalDefinition(item)" />
            </div>
          </div>
          <div v-else class="empty-inline mt-3">{{ t('properties.definitions.empty') }}</div>
        </el-collapse-item>

        <el-collapse-item v-if="isStartEvent" name="process" :title="t('properties.sections.startup')">
          <el-form label-position="top" size="small">
            <el-form-item :label="t('properties.general.initiatorVariable')">
              <el-input
                v-model="form.initiator"
                placeholder="initiator"
                @change="update({ 'flowable:initiator': form.initiator })"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="isUserTask" name="assignment" :title="t('properties.sections.assignment')">
          <el-form label-position="top" size="small">
            <el-form-item :label="t('properties.assignment.assignee')">
              <el-input
                v-model="form.assignee"
                clearable
                :placeholder="t('properties.assignment.assigneePlaceholder', { value: '${expression}' })"
                @change="update({ 'flowable:assignee': form.assignee })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.owner')">
              <el-input
                v-model="form.owner"
                clearable
                :placeholder="t('properties.assignment.ownerPlaceholder')"
                @change="update({ 'flowable:owner': form.owner })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.candidateUsers')">
              <el-input
                v-model="form.candidateUsers"
                clearable
                :placeholder="t('properties.assignment.candidateUsersPlaceholder', { value: '${users}' })"
                @change="update({ 'flowable:candidateUsers': form.candidateUsers })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.candidateGroups')">
              <el-input
                v-model="form.candidateGroups"
                clearable
                :placeholder="t('properties.assignment.candidateGroupsPlaceholder', { value: '${groups}' })"
                @change="update({ 'flowable:candidateGroups': form.candidateGroups })"
              />
            </el-form-item>
            <div class="section-list-header">
              <span>{{ t('properties.assignment.customIdentityLinks') }} <span class="section-count">{{ customResources.length }}</span></span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-custom-resource"
                @click="openCustomResourceDialog()"
              >
                {{ t('properties.common.add') }}
              </el-button>
            </div>
            <div v-if="customResources.length" class="item-list mb-4">
              <div
                v-for="(item, index) in customResources"
                :key="`${text(getBusinessProperty(item, 'name'))}-${index}`"
                class="list-item"
                data-testid="custom-resource-row"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-sm">
                    {{ text(getBusinessProperty(item, 'name')) || t('properties.assignment.typeNotSet') }}
                  </div>
                  <div class="truncate text-xs text-gray-500">
                    {{ customResourceExpression(item) || t('properties.assignment.expressionNotSet') }}
                  </div>
                </div>
                <el-button
                  link
                  :icon="Edit"
                  :aria-label="t('properties.dialogs.customIdentityEdit')"
                  @click="openCustomResourceDialog(item)"
                />
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  :aria-label="t('properties.dialogs.customIdentityDelete')"
                  @click="removeCustomResource(item)"
                />
              </div>
            </div>
            <div v-else class="empty-inline mb-4">{{ t('properties.assignment.noCustomIdentityLinks') }}</div>
            <div class="two-column">
              <el-form-item :label="t('properties.assignment.dueDate')">
                <el-input
                  v-model="form.dueDate"
                  :placeholder="t('properties.assignment.dueDatePlaceholder', { value: '${dueDate}' })"
                  @change="update({ 'flowable:dueDate': form.dueDate })"
                />
              </el-form-item>
              <el-form-item :label="t('properties.assignment.priority')">
                <el-input
                  v-model="form.priority"
                  placeholder="50"
                  @change="update({ 'flowable:priority': form.priority })"
                />
              </el-form-item>
            </div>
            <el-form-item :label="t('properties.assignment.businessCalendar')">
              <el-input
                v-model="form.businessCalendarName"
                @change="update({ 'flowable:businessCalendarName': form.businessCalendarName })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.category')">
              <el-input
                v-model="form.category"
                @change="update({ 'flowable:category': form.category })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.taskIdVariable')">
              <el-input
                v-model="form.taskIdVariableName"
                @change="update({ 'flowable:taskIdVariableName': form.taskIdVariableName })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.assignment.completedByVariable')">
              <el-input
                v-model="form.taskCompleterVariableName"
                @change="update({ 'flowable:taskCompleterVariableName': form.taskCompleterVariableName })"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item
          v-if="isServiceTask || isScriptTask || isCallActivity"
          name="implementation"
          :title="t('properties.sections.implementation')"
        >
          <el-form v-if="isServiceTask" label-position="top" size="small">
            <el-form-item :label="t('properties.implementation.method')" required>
              <el-select
                v-model="form.implementationType"
                class="w-full"
                data-testid="service-implementation-type"
                @change="changeImplementationType"
              >
                <el-option :label="t('properties.common.javaClass')" value="class" />
                <el-option :label="t('properties.common.expression')" value="expression" />
                <el-option :label="t('properties.common.delegateExpression')" value="delegateExpression" />
                <el-option :label="t('properties.implementation.builtInType')" value="type" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('properties.implementation.content')" required>
              <el-select
                v-if="form.implementationType === 'type'"
                v-model="form.implementation"
                class="w-full"
                data-testid="service-built-in-type"
                :placeholder="t('properties.implementation.selectBuiltInType')"
                @change="changeServiceType"
              >
                <el-option
                  v-for="option in serviceTaskTypeOptions"
                  :key="option.value"
                  :label="option.label"
                  :value="option.value"
                />
              </el-select>
              <el-input
                v-else
                v-model="form.implementation"
                data-testid="service-implementation"
                :placeholder="form.implementationType === 'class' ? 'com.example.MyDelegate' : '${delegate}'"
                @change="updateImplementation"
              />
            </el-form-item>
            <el-form-item v-if="isExternalWorker" :label="t('properties.implementation.topic')" required>
              <el-input
                v-model="form.serviceTopic"
                data-testid="external-worker-topic"
                placeholder="${topic}"
                @change="updateExternalWorkerTopic"
              />
            </el-form-item>
            <template v-if="form.implementationType === 'type' && activeServiceFields.length">
              <div class="preset-divider">
                <span>{{ t('properties.implementation.parameters', { type: form.implementation.toUpperCase() }) }}</span>
                <span>{{ t('properties.serviceFields.storedAsField') }}</span>
              </div>
              <el-form-item
                v-for="spec in activeServiceFields"
                :key="spec.name"
                :label="spec.label"
                :required="spec.required"
              >
                <el-select
                  v-if="spec.control === 'select' || spec.control === 'boolean'"
                  v-model="serviceFieldForm[spec.name]"
                  class="w-full"
                  clearable
                  @change="upsertServiceField(spec)"
                >
                  <el-option
                    v-for="option in spec.control === 'boolean' ? booleanOptions : spec.options"
                    :key="option.value"
                    :label="option.label"
                    :value="option.value"
                  />
                </el-select>
                <el-input
                  v-else
                  v-model="serviceFieldForm[spec.name]"
                  :type="spec.control === 'textarea' ? 'textarea' : 'text'"
                  :rows="spec.control === 'textarea' ? 3 : undefined"
                  :placeholder="spec.placeholder"
                  @change="upsertServiceField(spec)"
                />
                <div class="form-help">{{ t('properties.serviceFields.fieldNameHelp', { name: spec.name, valueType: spec.valueType }) }}</div>
              </el-form-item>
            </template>
            <template v-if="isSendEventServiceTask">
              <div class="preset-divider">
                <span>{{ t('properties.implementation.eventRegistryParameters') }}</span>
                <span>{{ t('properties.implementation.nativeExtension') }}</span>
              </div>
              <el-form-item :label="t('properties.implementation.eventType')" required>
                <el-input
                  v-model="form.serviceEventType"
                  data-testid="send-event-type"
                  placeholder="order.updated"
                  @change="updateServiceExtensionBody('flowable:EventType', form.serviceEventType)"
                />
              </el-form-item>
              <el-form-item :label="t('properties.implementation.triggerEventType')">
                <el-input
                  v-model="form.serviceTriggerEventType"
                  data-testid="send-event-trigger-type"
                  placeholder="order.acknowledged"
                  @change="updateServiceExtensionBody('flowable:TriggerEventType', form.serviceTriggerEventType)"
                />
              </el-form-item>
              <el-form-item :label="t('properties.implementation.outboundChannelKey')" :required="!form.serviceSystemChannel">
                <el-input
                  v-model="form.serviceChannelKey"
                  data-testid="send-event-channel-key"
                  :disabled="form.serviceSystemChannel"
                  placeholder="outbound-orders"
                  @change="updateServiceExtensionBody('flowable:ChannelKey', form.serviceChannelKey)"
                />
              </el-form-item>
              <div class="switch-row">
                <span>{{ t('properties.implementation.useSystemChannel') }}</span>
                <el-switch
                  v-model="form.serviceSystemChannel"
                  data-testid="send-event-system-channel"
                  @change="updateServiceSystemChannel"
                />
              </div>
              <div class="switch-row">
                <span>{{ t('properties.implementation.synchronousSend') }}</span>
                <el-switch
                  v-model="form.serviceSendSynchronously"
                  data-testid="send-event-synchronously"
                  @change="updateServiceExtensionBody('flowable:SendSynchronously', form.serviceSendSynchronously ? 'true' : '')"
                />
              </div>
            </template>
            <template v-if="isSendEventServiceTask">
              <div class="preset-divider">
                <span>{{ t('properties.implementation.eventVariableMappings') }}</span>
                <span>eventIn / eventOut</span>
              </div>
              <div class="section-list-header">
                <span>{{ t('properties.implementation.inputParameters') }}</span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-input-mapping"
                  @click="openMappingDialog('eventIn')"
                >{{ t('properties.common.add') }}</el-button>
              </div>
              <div v-if="eventInputMappings.length" class="item-list">
                <div
                  v-for="(item, index) in eventInputMappings"
                  :key="String(item.source || item.sourceExpression) + index"
                  class="list-item"
                  data-testid="input-mapping-row"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{{ mappingLabel(item) }}</div>
                    <div class="text-xs text-gray-500">
                      {{ mappingTypeLabel(item) }}
                      <span v-if="item.transient"> · {{ t('properties.common.transient') }}</span>
                    </div>
                  </div>
                  <el-button link :icon="Edit" :aria-label="t('properties.implementation.editInput')" @click="openMappingDialog('eventIn', item)" />
                  <el-button link type="danger" :icon="Delete" :aria-label="t('properties.implementation.deleteInput')" @click="removeMapping(item)" />
                </div>
              </div>
              <div v-else class="empty-inline">{{ t('properties.implementation.noInputParameters') }}</div>

              <div class="section-list-header mt-4!">
                <span>{{ t('properties.implementation.outputParameters') }}</span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-output-mapping"
                  @click="openMappingDialog('eventOut')"
                >{{ t('properties.common.add') }}</el-button>
              </div>
              <div v-if="eventOutputMappings.length" class="item-list">
                <div
                  v-for="(item, index) in eventOutputMappings"
                  :key="String(item.source || item.sourceExpression) + index"
                  class="list-item"
                  data-testid="output-mapping-row"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{{ mappingLabel(item) }}</div>
                    <div class="text-xs text-gray-500">
                      {{ mappingTypeLabel(item) }}
                      <span v-if="item.transient"> · {{ t('properties.common.transient') }}</span>
                    </div>
                  </div>
                  <el-button link :icon="Edit" :aria-label="t('properties.implementation.editOutput')" @click="openMappingDialog('eventOut', item)" />
                  <el-button link type="danger" :icon="Delete" :aria-label="t('properties.implementation.deleteOutput')" @click="removeMapping(item)" />
                </div>
              </div>
              <div v-else class="empty-inline">{{ t('properties.implementation.noOutputParameters') }}</div>
            </template>
            <el-form-item v-if="form.implementationType === 'expression'" :label="t('properties.implementation.resultVariable')">
              <el-input
                v-model="form.resultVariableName"
                data-testid="service-result-variable"
                @change="updateServiceResultVariable"
              />
            </el-form-item>
            <template v-if="form.implementationType === 'expression' && form.resultVariableName">
              <div class="switch-row">
                <span>{{ t('properties.implementation.localResult') }}</span>
                <el-switch
                  v-model="form.useLocalScopeForResultVariable"
                  data-testid="service-result-local-scope"
                  @change="updateServiceResultVariable"
                />
              </div>
              <div class="switch-row">
                <span>{{ t('properties.implementation.transientResult') }}</span>
                <el-switch
                  v-model="form.storeResultVariableAsTransient"
                  data-testid="service-result-transient"
                  @change="updateServiceResultVariable"
                />
              </div>
            </template>
            <div class="switch-row">
              <span>{{ t('properties.implementation.triggerable') }}</span>
              <el-switch
                v-model="form.triggerable"
                @change="update({ 'flowable:triggerable': form.triggerable || undefined })"
              />
            </div>
          </el-form>

          <el-form v-if="isScriptTask" label-position="top" size="small">
            <el-form-item :label="t('properties.implementation.scriptFormat')" required>
              <el-input
                v-model="form.scriptFormat"
                placeholder="groovy / javascript"
                @change="update({ scriptFormat: form.scriptFormat })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.implementation.scriptContent')" required>
              <el-input
                v-model="form.script"
                type="textarea"
                :rows="7"
                class="code-input"
                @change="update({ script: form.script })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.implementation.resultVariable')">
              <el-input
                v-model="form.scriptResultVariable"
                @change="update({ 'flowable:resultVariable': form.scriptResultVariable })"
              />
            </el-form-item>
          </el-form>

          <el-form v-if="isCallActivity" label-position="top" size="small">
            <el-form-item :label="t('properties.callActivity.calledType')" :error="calledElementTypeError">
              <el-segmented
                v-model="form.calledElementType"
                :options="calledElementTypeOptions"
                class="call-type-segmented"
                data-testid="call-activity-called-element-type"
                @change="updateCalledElementType"
              />
            </el-form-item>
            <el-form-item
              :label="form.calledElementType === 'id' ? t('properties.callActivity.processId') : t('properties.callActivity.processKey')"
              required
            >
              <el-input
                v-model="form.calledElement"
                data-testid="call-activity-called-element"
                :placeholder="form.calledElementType === 'id'
                  ? t('properties.callActivity.idPlaceholder', { value: '${processDefinitionId}' })
                  : t('properties.callActivity.keyPlaceholder', { value: '${processKey}' })"
                @change="update({ calledElement: form.calledElement })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.callActivity.instanceName')">
              <el-input
                v-model="form.processInstanceName"
                @change="update({ 'flowable:processInstanceName': form.processInstanceName })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.callActivity.idVariable')">
              <el-input
                v-model="form.idVariableName"
                data-testid="call-activity-id-variable-name"
                :placeholder="t('properties.callActivity.idVariablePlaceholder', { value: '${idVariableName}' })"
                @change="update({ 'flowable:idVariableName': form.idVariableName })"
              />
            </el-form-item>
            <el-form-item :label="t('properties.callActivity.businessKey')">
              <el-input
                v-model="form.businessKey"
                @change="update({ 'flowable:businessKey': form.businessKey })"
              />
            </el-form-item>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.inheritVariables') }}</span>
              <el-switch
                v-model="form.inheritVariables"
                data-testid="call-activity-inherit-variables"
                @change="update({ 'flowable:inheritVariables': form.inheritVariables || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.inheritBusinessKey') }}</span>
              <el-switch
                v-model="form.inheritBusinessKey"
                @change="update({ 'flowable:inheritBusinessKey': form.inheritBusinessKey || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.sameDeployment') }}</span>
              <el-switch
                v-model="form.callSameDeployment"
                data-testid="call-activity-same-deployment"
                @change="update({ 'flowable:sameDeployment': form.callSameDeployment || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.localOut') }}</span>
              <el-switch
                v-model="form.useLocalScopeForOutParameters"
                data-testid="call-activity-local-out"
                @change="update({ 'flowable:useLocalScopeForOutParameters': form.useLocalScopeForOutParameters || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.completeAsync') }}</span>
              <el-switch
                v-model="form.completeAsync"
                data-testid="call-activity-complete-async"
                @change="update({ 'flowable:completeAsync': form.completeAsync || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.callActivity.fallbackTenant') }}</span>
              <el-switch
                v-model="form.fallbackToDefaultTenant"
                @change="update({ 'flowable:fallbackToDefaultTenant': form.fallbackToDefaultTenant || undefined })"
              />
            </div>

            <div class="section-list-header mt-3!">
              <span>{{ t('properties.implementation.inputParameters') }}</span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-input-mapping"
                @click="openMappingDialog('in')"
              >{{ t('properties.common.add') }}</el-button>
            </div>
            <div v-if="inputMappings.length" class="item-list">
              <div
                v-for="(item, index) in inputMappings"
                :key="String(item.source || item.sourceExpression || item.variables) + index"
                class="list-item"
                data-testid="input-mapping-row"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm">{{ mappingLabel(item) }}</div>
                  <div class="text-xs text-gray-500">
                    flowable:in<span v-if="item.transient"> · {{ t('properties.common.importedTransient') }}</span>
                  </div>
                </div>
                <el-button link :icon="Edit" :aria-label="t('properties.implementation.editInput')" @click="openMappingDialog('in', item)" />
                <el-button link type="danger" :icon="Delete" :aria-label="t('properties.implementation.deleteInput')" @click="removeMapping(item)" />
              </div>
            </div>
            <div v-else class="empty-inline">{{ t('properties.implementation.noInputParameters') }}</div>

            <div class="section-list-header mt-4!">
              <span>{{ t('properties.implementation.outputParameters') }}</span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-output-mapping"
                @click="openMappingDialog('out')"
              >{{ t('properties.common.add') }}</el-button>
            </div>
            <div v-if="outputMappings.length" class="item-list">
              <div
                v-for="(item, index) in outputMappings"
                :key="String(item.source || item.sourceExpression || item.variables) + index"
                class="list-item"
                data-testid="output-mapping-row"
              >
                <div class="min-w-0 flex-1">
                  <div class="truncate text-sm">{{ mappingLabel(item) }}</div>
                  <div class="text-xs text-gray-500">
                    flowable:out<span v-if="item.transient"> · {{ t('properties.common.importedTransient') }}</span>
                  </div>
                </div>
                <el-button link :icon="Edit" :aria-label="t('properties.implementation.editOutput')" @click="openMappingDialog('out', item)" />
                <el-button link type="danger" :icon="Delete" :aria-label="t('properties.implementation.deleteOutput')" @click="removeMapping(item)" />
              </div>
            </div>
            <div v-else class="empty-inline">{{ t('properties.implementation.noOutputParameters') }}</div>
          </el-form>
        </el-collapse-item>

        <el-collapse-item
          v-if="isBpmnEvent"
          name="event"
          :title="t('properties.sections.event')"
        >
          <el-form label-position="top" size="small">
            <div v-if="isBoundaryEvent" class="switch-row">
              <div>
                <div>{{ t('properties.event.interruptAttached') }}</div>
                <div class="text-xs text-gray-400">{{ t('properties.event.nonInterruptingBoundaryHelp') }}</div>
              </div>
              <el-switch
                v-model="form.cancelActivity"
                @change="update({ cancelActivity: form.cancelActivity })"
              />
            </div>
            <div v-if="isStartEvent && eventDefinition" class="switch-row">
              <div>
                <div>{{ t('properties.event.interruptEventSubprocess') }}</div>
                <div class="text-xs text-gray-400">{{ t('properties.event.interruptEventSubprocessHelp') }}</div>
              </div>
              <el-switch
                v-model="form.isInterrupting"
                @change="update({ isInterrupting: form.isInterrupting })"
              />
            </div>

            <template v-if="isTimerEvent">
              <el-form-item :label="t('properties.event.timerType')" required>
                <el-select v-model="form.timerType" class="w-full" @change="updateTimerDefinition">
                  <el-option :label="t('properties.event.duration')" value="timeDuration" />
                  <el-option :label="t('properties.event.date')" value="timeDate" />
                  <el-option :label="t('properties.event.cycle')" value="timeCycle" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('properties.event.timerExpression')" required>
                <el-input
                  v-model="form.timerExpression"
                  data-testid="timer-expression"
                  :placeholder="form.timerType === 'timeCycle'
                    ? t('properties.event.cyclePlaceholder', { value: '${cycle}' })
                    : t('properties.event.durationPlaceholder', { value: '${duration}' })"
                  @change="updateTimerExpression"
                />
              </el-form-item>
              <el-form-item v-if="form.timerType === 'timeCycle'" :label="t('properties.event.cycleEnd')">
                <el-input
                  v-model="form.timerEndDate"
                  data-testid="timer-end-date"
                  :placeholder="t('properties.event.cycleEndPlaceholder', { value: '${endDate}' })"
                  @change="updateTimerEndDate"
                />
              </el-form-item>
              <el-form-item :label="t('properties.event.businessCalendar')">
                <el-input
                  v-model="form.timerBusinessCalendarName"
                  data-testid="timer-business-calendar"
                  :placeholder="t('properties.event.calendarPlaceholder', { value: '${calendarName}' })"
                  @change="updateTimerBusinessCalendar"
                />
              </el-form-item>
            </template>

            <el-form-item v-else-if="isConditionalEvent" :label="t('properties.event.conditionalExpression')" required>
              <el-input
                v-model="form.conditionalExpression"
                type="textarea"
                :rows="3"
                placeholder="${orderAmount > 1000}"
                @change="updateConditionalDefinition"
              />
            </el-form-item>

            <template v-else-if="isMessageEvent">
              <el-form-item :label="t('properties.event.globalMessage')">
                <el-select
                  v-model="form.messageRef"
                  data-testid="event-message-ref"
                  clearable
                  class="w-full"
                  :placeholder="t('properties.event.selectMessage')"
                  @change="updateEventReference('messageRef', form.messageRef)"
                >
                  <el-option
                    v-for="item in messageDefinitions"
                    :key="String(item.id)"
                    :label="String(item.name || item.id)"
                    :value="String(item.id)"
                  />
                </el-select>
                <div v-if="!messageDefinitions.length" class="form-help">
                  {{ t('properties.event.addMessageFirst') }}
                </div>
              </el-form-item>
              <el-form-item :label="t('properties.event.messageExpression')">
                <el-input
                  v-model="form.messageExpression"
                  placeholder="${dynamicMessage}"
                  @change="updateEventDefinition({ 'flowable:messageExpression': form.messageExpression || undefined })"
                />
                <div class="form-help">{{ t('properties.event.messageChoiceHelp') }}</div>
              </el-form-item>
            </template>

            <template v-else-if="isSignalEvent">
              <el-form-item :label="t('properties.event.globalSignal')">
                <el-select
                  v-model="form.signalRef"
                  data-testid="event-signal-ref"
                  clearable
                  class="w-full"
                  :placeholder="t('properties.event.selectSignal')"
                  @change="updateEventReference('signalRef', form.signalRef)"
                >
                  <el-option
                    v-for="item in signalDefinitions"
                    :key="String(item.id)"
                    :label="String(item.name || item.id)"
                    :value="String(item.id)"
                  />
                </el-select>
                <div v-if="!signalDefinitions.length" class="form-help">
                  {{ t('properties.event.addSignalFirst') }}
                </div>
              </el-form-item>
              <el-form-item :label="t('properties.event.signalExpression')">
                <el-input
                  v-model="form.signalExpression"
                  placeholder="${dynamicSignal}"
                  @change="updateEventDefinition({ 'flowable:signalExpression': form.signalExpression || undefined })"
                />
                <div class="form-help">{{ t('properties.event.signalChoiceHelp') }}</div>
              </el-form-item>
              <div class="switch-row">
                <span>{{ t('properties.event.asyncSignal') }}</span>
                <el-switch
                  v-model="form.signalAsync"
                  @change="updateEventDefinition({ 'flowable:async': form.signalAsync || undefined })"
                />
              </div>
            </template>

            <template v-else-if="isErrorEvent">
              <el-form-item :label="t('properties.event.globalError')" :required="isThrowingEvent">
                <el-select
                  v-model="form.errorRef"
                  data-testid="event-error-ref"
                  clearable
                  class="w-full"
                  :placeholder="t('properties.event.selectError')"
                  @change="updateEventReference('errorRef', form.errorRef)"
                >
                  <el-option
                    v-for="item in errorDefinitions"
                    :key="String(item.id)"
                    :label="String(item.name || item.id)"
                    :value="String(item.id)"
                  />
                </el-select>
                <div v-if="!errorDefinitions.length" class="form-help">
                  {{ t('properties.event.addErrorFirst') }}
                </div>
                <div v-else-if="!isThrowingEvent" class="form-help">
                  {{ t('properties.event.catchAllHelp') }}
                </div>
              </el-form-item>
              <el-form-item :label="t('properties.event.errorVariable')">
                <el-input
                  v-model="form.errorVariableName"
                  placeholder="caughtErrorCode"
                  @change="updateErrorVariableConfiguration"
                />
              </el-form-item>
              <div v-if="form.errorVariableName" class="switch-row">
                <span>{{ t('properties.dialogs.transientVariable') }}</span>
                <el-switch
                  v-model="form.errorVariableTransient"
                  @change="updateErrorVariableConfiguration"
                />
              </div>
              <div v-if="form.errorVariableName" class="switch-row">
                <span>{{ t('properties.event.localOnly') }}</span>
                <el-switch
                  v-model="form.errorVariableLocalScope"
                  @change="updateErrorVariableConfiguration"
                />
              </div>
            </template>

            <div v-else-if="!eventDefinition" class="empty-inline">
              {{ t('properties.event.plainEventHelp') }}
            </div>
          </el-form>
        </el-collapse-item>

        <el-collapse-item
          v-if="isSequenceFlow || supportsDefaultFlow"
          name="flow"
          :title="t('properties.sections.flow')"
        >
          <el-form label-position="top" size="small">
            <el-form-item v-if="isSequenceFlow" :label="t('properties.flow.condition')">
              <el-input
                v-model="form.conditionExpression"
                type="textarea"
                :rows="3"
                placeholder="${approved == true}"
                @change="updateConditionExpression"
              />
              <div class="form-help">{{ t('properties.flow.conditionConflictHelp') }}</div>
            </el-form-item>
            <el-form-item v-if="supportsDefaultFlow" :label="t('properties.flow.defaultFlow')">
              <el-select
                v-model="form.defaultFlow"
                clearable
                class="w-full"
                :placeholder="t('properties.flow.selectOutgoing')"
                @change="updateDefaultFlow"
              >
                <el-option
                  v-for="flow in outgoingFlows"
                  :key="flow.value"
                  :label="flow.label"
                  :value="flow.value"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="supportsMultiInstance" name="multiInstance" :title="t('properties.sections.multiInstance')">
          <el-form label-position="top" size="small">
            <el-form-item :label="t('properties.multiInstance.type')">
              <el-select
                v-model="form.multiType"
                class="w-full"
                data-testid="multi-instance-type"
                @change="updateMultiInstance"
              >
                <el-option :label="t('properties.common.none')" value="none" />
                <el-option :label="t('properties.multiInstance.parallel')" value="parallel" />
                <el-option :label="t('properties.multiInstance.sequential')" value="sequential" />
              </el-select>
            </el-form-item>
            <template v-if="form.multiType !== 'none'">
              <el-form-item :label="t('properties.multiInstance.source')">
                <el-radio-group
                  v-model="form.multiSource"
                  @change="updateMultiInstance"
                >
                  <el-radio-button value="collection">{{ t('properties.multiInstance.collection') }}</el-radio-button>
                  <el-radio-button value="cardinality">{{ t('properties.multiInstance.cardinality') }}</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <div v-if="multiInstanceCollectionHandler" class="form-help mb-3">
                {{ t('properties.multiInstance.customHandlerHelp') }}
              </div>
              <template v-if="form.multiSource === 'collection' || multiInstanceCollectionHandler">
                <el-form-item
                  :label="form.multiSource === 'cardinality' ? t('properties.multiInstance.handlerInput') : t('properties.multiInstance.collectionExpression')"
                  :required="form.multiSource === 'collection'"
                >
                  <el-input
                    v-model="form.collection"
                    data-testid="multi-instance-collection"
                    placeholder="${participants}"
                    @change="updateMultiInstance"
                  />
                </el-form-item>
                <div class="two-column">
                  <el-form-item :label="t('properties.multiInstance.elementVariable')">
                    <el-input
                      v-model="form.elementVariable"
                      placeholder="participant"
                      @change="updateMultiInstance"
                    />
                  </el-form-item>
                  <el-form-item :label="t('properties.multiInstance.indexVariable')">
                    <el-input
                      v-model="form.elementIndexVariable"
                      placeholder="loopCounter"
                      @change="updateMultiInstance"
                    />
                  </el-form-item>
                </div>
              </template>
              <el-form-item v-if="form.multiSource === 'cardinality'" :label="t('properties.multiInstance.loopCardinality')" required>
                <el-input
                  v-model="form.loopCardinality"
                  :placeholder="t('properties.multiInstance.cardinalityPlaceholder', { value: '${count}' })"
                  @change="updateMultiInstance"
                />
              </el-form-item>
              <el-form-item :label="t('properties.multiInstance.completionCondition')">
                <el-input
                  v-model="form.completionCondition"
                  type="textarea"
                  :rows="2"
                  placeholder="${nrOfCompletedInstances / nrOfInstances >= 0.6}"
                  @change="updateMultiInstance"
                />
              </el-form-item>
            </template>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="supportsForm" name="form" :title="t('properties.sections.form')">
          <el-form label-position="top" size="small">
            <el-form-item :label="t('properties.forms.key')">
              <el-input
                v-model="form.formKey"
                :placeholder="t('properties.forms.keyPlaceholder')"
                @change="update({ 'flowable:formKey': form.formKey })"
              />
            </el-form-item>
            <div class="switch-row">
              <span>{{ t('properties.forms.fieldValidation') }}</span>
              <el-switch
                v-model="form.formFieldValidation"
                @change="update({ 'flowable:formFieldValidation': form.formFieldValidation })"
              />
            </div>
            <div class="switch-row">
              <span>{{ t('properties.forms.sameDeployment') }}</span>
              <el-switch
                v-model="form.sameDeployment"
                @change="update({ 'flowable:sameDeployment': form.sameDeployment ? undefined : false })"
              />
            </div>
          </el-form>

          <div class="section-list-header">
            <span>{{ t('properties.forms.embeddedFields') }}</span>
            <el-button link type="primary" :icon="Plus" @click="openFormPropertyDialog()">{{ t('properties.common.add') }}</el-button>
          </div>
          <div v-if="formProperties.length" class="item-list">
            <div v-for="item in formProperties" :key="String(item.id)" class="list-item">
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm">{{ item.name || item.id }}</div>
                <div class="truncate text-xs text-gray-500">{{ item.id }} · {{ item.type || 'string' }}</div>
              </div>
              <el-button link :icon="Edit" @click="openFormPropertyDialog(item)" />
              <el-button link type="danger" :icon="Delete" @click="removeFormProperty(item)" />
            </div>
          </div>
          <el-empty v-else :image-size="42" :description="t('properties.forms.noEmbeddedFields')" />
        </el-collapse-item>

        <el-collapse-item v-if="supportsMapExceptions" name="mapExceptions">
          <template #title>
            <span class="collapse-title">
              {{ t('properties.extensions.exceptionMappings') }} <span class="section-count">{{ mapExceptions.length }}</span>
            </span>
          </template>
          <div class="section-list-header">
            <span>{{ t('properties.sections.mapExceptions') }}</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-map-exception"
              @click="openMapExceptionDialog()"
            >
              {{ t('properties.common.add') }}
            </el-button>
          </div>
          <div v-if="mapExceptions.length" class="item-list">
            <div
              v-for="(item, index) in mapExceptions"
              :key="`${String(item.errorCode || '')}-${index}`"
              class="list-item"
              data-testid="map-exception-row"
            >
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm">{{ item.errorCode || t('properties.extensions.errorCodeNotSet') }}</span>
                  <el-tag
                    v-if="booleanValue(item.includeChildExceptions)"
                    size="small"
                    effect="plain"
                  >
                    {{ t('properties.extensions.includeSubclasses') }}
                  </el-tag>
                </div>
                <div class="truncate text-xs text-gray-500">
                  {{ item.class || t('properties.extensions.defaultMapping') }}
                  <template v-if="item.rootCause"> · {{ t('properties.extensions.rootCause', { value: String(item.rootCause) }) }}</template>
                </div>
              </div>
              <el-button
                link
                :icon="ArrowUp"
                :disabled="index === 0"
                :aria-label="t('properties.extensions.moveUpException')"
                @click="moveMapException(index, -1)"
              />
              <el-button
                link
                :icon="ArrowDown"
                :disabled="index === mapExceptions.length - 1"
                :aria-label="t('properties.extensions.moveDownException')"
                @click="moveMapException(index, 1)"
              />
              <el-button
                link
                :icon="Edit"
                :aria-label="t('properties.extensions.editException')"
                @click="openMapExceptionDialog(item)"
              />
              <el-button
                link
                type="danger"
                :icon="Delete"
                :aria-label="t('properties.extensions.deleteException')"
                @click="removeMapException(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">{{ t('properties.extensions.noExceptionMappings') }}</div>
        </el-collapse-item>

        <el-collapse-item name="extensionProperties">
          <template #title>
            <span class="collapse-title">{{ t('properties.extensions.properties') }} <span class="section-count">{{ extensionProperties.length }}</span></span>
          </template>
          <div class="section-list-header">
            <span>{{ t('properties.sections.extensionProperties') }}</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-extension-property"
              @click="openExtensionPropertyDialog()"
            >
              {{ t('properties.common.add') }}
            </el-button>
          </div>
          <div v-if="extensionProperties.length" class="item-list">
            <div
              v-for="item in extensionProperties"
              :key="String(item.id || item.name)"
              class="list-item"
              data-testid="extension-property-row"
            >
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm">{{ item.name }}</div>
                <div class="truncate text-xs text-gray-500">{{ item.value }}</div>
              </div>
              <el-button link :icon="Edit" :aria-label="t('properties.extensions.editProperty')" @click="openExtensionPropertyDialog(item)" />
              <el-button
                link
                type="danger"
                :icon="Delete"
                :aria-label="t('properties.extensions.deleteProperty')"
                @click="removeExtensionProperty(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">{{ t('properties.extensions.noProperties') }}</div>
        </el-collapse-item>

        <el-collapse-item v-if="supportsListeners" name="listeners">
          <template #title>
            <span class="collapse-title">{{ t('properties.sections.listeners') }} <span class="section-count">{{ listenerCount }}</span></span>
          </template>
          <div class="section-list-header">
            <span>{{ t('properties.extensions.executionListeners') }} <span class="section-count">{{ executionListeners.length }}</span></span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              @click="openListenerDialog('executionListener')"
            >
              {{ t('properties.common.add') }}
            </el-button>
          </div>
          <div v-if="executionListeners.length" class="item-list">
            <div
              v-for="item in executionListeners"
              :key="listenerKey(item)"
              class="list-item"
              data-testid="execution-listener-row"
            >
              <div class="min-w-0 flex-1">
                <div class="text-sm">{{ item.event || t('properties.extensions.eventNotSet') }}</div>
                <div class="truncate text-xs text-gray-500">{{ listenerImplementationLabel(item) }}</div>
              </div>
              <el-button
                link
                :icon="Edit"
                :aria-label="t('properties.extensions.editExecutionListener')"
                @click="openListenerDialog('executionListener', item)"
              />
              <el-button
                link
                type="danger"
                :icon="Delete"
                :aria-label="t('properties.extensions.deleteExecutionListener')"
                @click="removeListener(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">{{ t('properties.extensions.noExecutionListeners') }}</div>

          <template v-if="isUserTask">
            <div class="section-list-header mt-4!">
              <span>{{ t('properties.extensions.taskListeners') }} <span class="section-count">{{ taskListeners.length }}</span></span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                @click="openListenerDialog('taskListener')"
              >
                {{ t('properties.common.add') }}
              </el-button>
            </div>
            <div v-if="taskListeners.length" class="item-list">
              <div
                v-for="item in taskListeners"
                :key="listenerKey(item)"
                class="list-item"
                data-testid="task-listener-row"
              >
                <div class="min-w-0 flex-1">
                  <div class="text-sm">{{ item.event || t('properties.extensions.eventNotSet') }}</div>
                  <div class="truncate text-xs text-gray-500">{{ listenerImplementationLabel(item) }}</div>
                </div>
                <el-button
                  link
                  :icon="Edit"
                  :aria-label="t('properties.extensions.editTaskListener')"
                  @click="openListenerDialog('taskListener', item)"
                />
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  :aria-label="t('properties.extensions.deleteTaskListener')"
                  @click="removeListener(item)"
                />
              </div>
            </div>
            <div v-else class="empty-inline">{{ t('properties.extensions.noTaskListeners') }}</div>
          </template>
        </el-collapse-item>

        <el-collapse-item
          v-if="isServiceTask || executionListeners.length || injectedFields.length"
          name="fields"
          :title="t('properties.sections.fieldInjection')"
        >
          <div class="section-list-header">
            <span>{{ t('properties.extensions.extensionFields') }}</span>
            <el-button link type="primary" :icon="Plus" @click="openFieldDialog()">{{ t('properties.common.add') }}</el-button>
          </div>
          <div v-if="injectedFields.length" class="item-list">
            <div v-for="item in injectedFields" :key="String(item.name)" class="list-item">
              <div class="min-w-0 flex-1">
                <div class="text-sm">{{ item.name }}</div>
                <div class="truncate text-xs text-gray-500">
                  {{ t('properties.extensions.stringOrExpression', {
                    type: item.expression ? t('properties.common.expression') : t('properties.common.string'),
                    value: String(item.expression || item.string || item.stringValue || ''),
                  }) }}
                </div>
              </div>
              <el-button link :icon="Edit" @click="openFieldDialog(item)" />
              <el-button link type="danger" :icon="Delete" @click="removeField(item)" />
            </div>
          </div>
          <div v-else class="empty-inline">{{ t('properties.extensions.noExtensionFields') }}</div>
        </el-collapse-item>

        <el-collapse-item
          v-if="supportsAsync || isUserTask || isServiceTask || supportsFailedJobRetryTimeCycle"
          name="advanced"
          :title="t('properties.sections.advanced')"
        >
          <el-form label-position="top" size="small">
            <template v-if="supportsAsync">
              <div class="switch-row">
                <span>{{ t('properties.advanced.asyncBefore') }}</span>
                <el-switch
                  v-model="form.async"
                  data-testid="async-before"
                  @change="updateAsync"
                />
              </div>
              <div v-if="form.async" class="switch-row">
                <span>{{ t('properties.advanced.exclusiveBefore') }}</span>
                <el-switch
                  v-model="form.exclusive"
                  data-testid="async-before-exclusive"
                  @change="updateAsync"
                />
              </div>
              <div class="switch-row">
                <span>{{ t('properties.advanced.asyncLeave') }}</span>
                <el-switch
                  v-model="form.asyncLeave"
                  data-testid="async-after"
                  @change="updateAsync"
                />
              </div>
              <div v-if="form.asyncLeave" class="switch-row">
                <span>{{ t('properties.advanced.exclusiveLeave') }}</span>
                <el-switch
                  v-model="form.asyncLeaveExclusive"
                  data-testid="async-after-exclusive"
                  @change="updateAsync"
                />
              </div>
              <el-form-item :label="t('properties.advanced.jobCategory')">
                <el-input
                  v-model="form.jobCategory"
                  data-testid="job-category"
                  :placeholder="t('properties.advanced.jobCategoryPlaceholder', { value: '${category}' })"
                  @change="updateJobCategory"
                />
              </el-form-item>
            </template>
            <el-form-item
              v-if="supportsFailedJobRetryTimeCycle"
              :label="t('properties.advanced.retryCycle')"
            >
              <el-input
                v-model="form.failedJobRetryTimeCycle"
                data-testid="failed-job-retry-cycle"
                :placeholder="t('properties.advanced.retryPlaceholder', { value: '${retryCycle}' })"
                @change="updateFailedJobRetryTimeCycle"
              />
            </el-form-item>
            <el-form-item v-if="isUserTask || isServiceTask" :label="t('properties.advanced.skipExpression')">
              <el-input
                v-model="form.skipExpression"
                placeholder="${skipTask}"
                @change="update({ 'flowable:skipExpression': form.skipExpression })"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>
      </el-collapse>
    </div>

    <div v-else class="panel-empty">
      <span class="i-ep-aim text-3xl text-gray-300" />
      <p>{{ t('properties.advanced.selectElement') }}</p>
    </div>

    <el-dialog
      v-model="customResourceDialogVisible"
      :title="editingCustomResource ? t('properties.dialogs.customIdentityEdit') : t('properties.dialogs.customIdentityAdd')"
      width="min(560px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('properties.dialogs.identityType')" required>
          <el-input
            v-model="customResourceForm.name"
            data-testid="custom-resource-name"
            placeholder="watcher"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.assignmentExpression')" required>
          <el-input
            v-model="customResourceForm.expression"
            data-testid="custom-resource-expression"
            type="textarea"
            :rows="4"
            placeholder="user(${watcherUsers}),group(management)"
            spellcheck="false"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="customResourceDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button
          type="primary"
          data-testid="save-custom-resource"
          @click="saveCustomResource"
        >
          {{ t('properties.common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="definitionDialogVisible"
      :title="editingDefinition ? t('properties.definitions.editTitle') : t('properties.definitions.addTitle')"
      width="560px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('properties.definitions.type')">
          <el-radio-group v-model="definitionForm.kind" :disabled="!!editingDefinition">
            <el-radio-button value="message">{{ t('properties.definitions.message') }}</el-radio-button>
            <el-radio-button value="signal">{{ t('properties.definitions.signal') }}</el-radio-button>
            <el-radio-button value="error">{{ t('properties.definitions.error') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <div class="two-column">
          <el-form-item :label="t('properties.common.identifier')" required>
            <el-input v-model="definitionForm.id" data-testid="global-definition-id" spellcheck="false" />
          </el-form-item>
          <el-form-item :label="t('properties.common.name')">
            <el-input v-model="definitionForm.name" data-testid="global-definition-name" />
          </el-form-item>
        </div>
        <template v-if="definitionForm.kind === 'signal'">
          <el-form-item :label="t('properties.definitions.signalScope')">
            <el-input v-model="definitionForm.scope" :placeholder="t('properties.definitions.scopePlaceholder')" />
          </el-form-item>
        </template>
        <template v-else-if="definitionForm.kind === 'error'">
          <el-form-item :label="t('properties.definitions.errorCode')">
            <el-input v-model="definitionForm.errorCode" placeholder="ORDER_NOT_FOUND" />
          </el-form-item>
          <el-form-item :label="t('properties.definitions.errorMessage')">
            <el-input v-model="definitionForm.errorMessage" :placeholder="t('properties.definitions.optionalErrorMessage')" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="definitionDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" data-testid="save-global-definition" @click="saveGlobalDefinition">
          {{ t('properties.common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mapExceptionDialogVisible"
      :title="editingMapException ? t('properties.dialogs.mapExceptionEdit') : t('properties.dialogs.mapExceptionAdd')"
      width="min(560px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('properties.dialogs.bpmnErrorCode')" required>
          <el-input
            v-model="mapExceptionForm.errorCode"
            data-testid="map-exception-error-code"
            placeholder="BUSINESS_ERROR"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.exceptionClass')">
          <el-input
            v-model="mapExceptionForm.exceptionClass"
            data-testid="map-exception-class"
            placeholder="java.lang.RuntimeException"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.rootCauseType')">
          <el-input
            v-model="mapExceptionForm.rootCause"
            data-testid="map-exception-root-cause"
            placeholder="java.lang.IllegalArgumentException"
            spellcheck="false"
          />
        </el-form-item>
        <div class="switch-row">
          <span>{{ t('properties.dialogs.includeChildExceptions') }}</span>
          <el-switch
            v-model="mapExceptionForm.includeChildExceptions"
            data-testid="map-exception-include-children"
          />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mapExceptionDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" data-testid="save-map-exception" @click="saveMapException">
          {{ t('properties.common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="extensionPropertyDialogVisible"
      :title="editingExtensionProperty ? t('properties.dialogs.propertyEdit') : t('properties.dialogs.propertyAdd')"
      width="min(520px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('properties.dialogs.propertyId')">
          <el-input
            v-model="extensionPropertyForm.id"
            data-testid="extension-property-id"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.propertyName')" required>
          <el-input v-model="extensionPropertyForm.name" data-testid="extension-property-name" />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.propertyValue')" required>
          <el-input
            v-model="extensionPropertyForm.value"
            data-testid="extension-property-value"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="extensionPropertyDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button
          type="primary"
          data-testid="save-extension-property"
          @click="saveExtensionProperty"
        >
          {{ t('properties.common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="listenerDialogVisible"
      :title="t('properties.dialogs.listenerTitle')"
      width="min(600px, calc(100vw - 32px))"
      append-to-body
      data-testid="listener-dialog"
    >
      <el-form label-position="top">
        <div class="two-column">
          <el-form-item :label="t('properties.dialogs.listenerType')">
            <el-select
              v-model="listenerForm.kind"
              class="w-full"
              :disabled="!!editingListener"
              data-testid="listener-kind"
              @change="changeListenerKind"
            >
              <el-option :label="t('properties.dialogs.executionListener')" value="executionListener" />
              <el-option v-if="isUserTask" :label="t('properties.dialogs.taskListener')" value="taskListener" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('properties.dialogs.event')" required>
            <el-select v-model="listenerForm.event" class="w-full" data-testid="listener-event">
              <template v-if="listenerForm.kind === 'taskListener'">
                <el-option :label="t('properties.dialogs.eventCreate')" value="create" />
                <el-option :label="t('properties.dialogs.eventAssignment')" value="assignment" />
                <el-option :label="t('properties.dialogs.eventComplete')" value="complete" />
                <el-option :label="t('properties.dialogs.eventDelete')" value="delete" />
                <el-option :label="t('properties.dialogs.eventAll')" value="all" />
              </template>
              <template v-else-if="isSequenceFlow">
                <el-option :label="t('properties.dialogs.eventStart')" value="start" />
                <el-option :label="t('properties.dialogs.eventTake')" value="take" />
                <el-option :label="t('properties.dialogs.eventEnd')" value="end" />
              </template>
              <template v-else>
                <el-option :label="t('properties.dialogs.eventStart')" value="start" />
                <el-option :label="t('properties.dialogs.eventEnd')" value="end" />
              </template>
            </el-select>
          </el-form-item>
        </div>
        <el-form-item :label="t('properties.dialogs.implementation')" required>
          <el-radio-group
            v-model="listenerForm.implementationType"
            class="listener-implementation-types"
            data-testid="listener-implementation-type"
            @change="changeListenerImplementationType"
          >
            <el-radio-button value="class">{{ t('properties.common.javaClass') }}</el-radio-button>
            <el-radio-button value="expression">{{ t('properties.common.expression') }}</el-radio-button>
            <el-radio-button value="delegateExpression">{{ t('properties.common.delegateExpression') }}</el-radio-button>
            <el-radio-button value="script">{{ t('properties.common.script') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="listenerForm.implementationType === 'script'">
          <div class="two-column">
            <el-form-item :label="t('properties.dialogs.scriptLanguage')" required>
              <el-input
                v-model="listenerForm.scriptLanguage"
                data-testid="listener-script-language"
                placeholder="groovy"
              />
            </el-form-item>
            <el-form-item :label="t('properties.dialogs.resultVariable')">
              <el-input
                v-model="listenerForm.scriptResultVariable"
                data-testid="listener-script-result-variable"
              />
            </el-form-item>
          </div>
          <el-form-item :label="t('properties.dialogs.scriptContent')" required>
            <el-input
              v-model="listenerForm.scriptBody"
              data-testid="listener-script-body"
              type="textarea"
              :rows="7"
              class="code-input"
            />
          </el-form-item>
        </template>
        <el-form-item v-else :label="t('properties.dialogs.implementationContent')" required>
          <el-input
            v-model="listenerForm.implementation"
            data-testid="listener-implementation"
          />
        </el-form-item>

        <el-form-item v-if="listenerSupportsTransaction" :label="t('properties.dialogs.transactionPhase')">
          <el-select
            v-model="listenerForm.onTransaction"
            class="w-full"
            clearable
            data-testid="listener-on-transaction"
            @change="changeListenerTransaction"
          >
            <el-option :label="t('properties.dialogs.beforeCommit')" value="before-commit" />
            <el-option :label="t('properties.dialogs.committed')" value="committed" />
            <el-option :label="t('properties.dialogs.rolledBack')" value="rolled-back" />
          </el-select>
        </el-form-item>
        <div v-if="listenerForm.onTransaction" class="two-column">
          <el-form-item :label="t('properties.dialogs.resolverType')">
            <el-select
              v-model="listenerForm.resolverType"
              class="w-full"
              clearable
              data-testid="listener-resolver-type"
            >
              <el-option :label="t('properties.common.javaClass')" value="class" />
              <el-option :label="t('properties.common.expression')" value="expression" />
              <el-option :label="t('properties.common.delegateExpression')" value="delegateExpression" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="listenerForm.resolverType" :label="t('properties.dialogs.resolverImplementation')" required>
            <el-input
              v-model="listenerForm.resolverImplementation"
              data-testid="listener-resolver-implementation"
            />
          </el-form-item>
        </div>

        <template v-if="listenerSupportsFields">
          <div class="dialog-list-header">
            <span>{{ t('properties.dialogs.fieldInjection') }}</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-listener-field"
              @click="addListenerField"
            >
              {{ t('properties.dialogs.addField') }}
            </el-button>
          </div>
          <div v-for="(field, index) in listenerForm.fields" :key="index" class="field-row">
            <el-input
              v-model="field.name"
              :data-testid="`listener-field-name-${index}`"
              :placeholder="t('properties.dialogs.fieldName')"
            />
            <el-select v-model="field.valueType" style="width: 110px">
              <el-option :label="t('properties.common.string')" value="string" />
              <el-option :label="t('properties.common.expression')" value="expression" />
            </el-select>
            <el-input v-model="field.value" :placeholder="t('properties.dialogs.fieldValue')" />
            <el-button
              link
              type="danger"
              :icon="Delete"
              @click="listenerForm.fields.splice(index, 1)"
            />
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="listenerDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" data-testid="save-listener" @click="saveListener">
          {{ t('properties.common.confirm') }}
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="formDialogVisible" :title="t('properties.dialogs.formField')" width="660px" append-to-body>
      <el-form label-position="top">
        <div class="two-column">
          <el-form-item :label="t('properties.dialogs.fieldId')" required>
            <el-input v-model="formPropertyForm.id" />
          </el-form-item>
          <el-form-item :label="t('properties.dialogs.fieldName')">
            <el-input v-model="formPropertyForm.name" />
          </el-form-item>
        </div>
        <div class="two-column">
          <el-form-item :label="t('properties.dialogs.fieldType')">
            <el-select v-model="formPropertyForm.type" class="w-full">
              <el-option :label="t('properties.common.string')" value="string" />
              <el-option :label="t('properties.dialogs.long')" value="long" />
              <el-option :label="t('properties.dialogs.double')" value="double" />
              <el-option :label="t('properties.dialogs.boolean')" value="boolean" />
              <el-option :label="t('properties.dialogs.date')" value="date" />
              <el-option :label="t('properties.dialogs.enum')" value="enum" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('properties.dialogs.variableName')">
            <el-input v-model="formPropertyForm.variable" />
          </el-form-item>
        </div>
        <div class="two-column">
          <el-form-item :label="t('properties.dialogs.defaultValue')">
            <el-input v-model="formPropertyForm.default" />
          </el-form-item>
          <el-form-item v-if="formPropertyForm.type === 'date'" :label="t('properties.dialogs.datePattern')">
            <el-input v-model="formPropertyForm.datePattern" placeholder="yyyy-MM-dd" />
          </el-form-item>
          <el-form-item v-else :label="t('properties.dialogs.valueExpression')">
            <el-input v-model="formPropertyForm.expression" />
          </el-form-item>
        </div>
        <div class="switches-inline">
          <el-checkbox v-model="formPropertyForm.readable">{{ t('properties.common.readable') }}</el-checkbox>
          <el-checkbox v-model="formPropertyForm.writable">{{ t('properties.common.writable') }}</el-checkbox>
          <el-checkbox v-model="formPropertyForm.required">{{ t('properties.common.required') }}</el-checkbox>
        </div>
        <template v-if="formPropertyForm.type === 'enum'">
          <div class="dialog-list-header mt-4">
            <span>{{ t('properties.dialogs.enumOptions') }}</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              @click="formPropertyForm.values.push({ id: '', name: '' })"
            >
              {{ t('properties.dialogs.addOption') }}
            </el-button>
          </div>
          <div v-for="(item, index) in formPropertyForm.values" :key="index" class="field-row enum-row">
            <el-input v-model="item.id" :placeholder="t('properties.dialogs.optionValue')" />
            <el-input v-model="item.name" :placeholder="t('properties.dialogs.displayName')" />
            <el-button link type="danger" :icon="Delete" @click="formPropertyForm.values.splice(index, 1)" />
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" @click="saveFormProperty">{{ t('properties.common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="fieldDialogVisible" :title="t('properties.dialogs.fieldInjection')" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item :label="t('properties.dialogs.fieldName')" required>
          <el-input v-model="fieldForm.name" />
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.valueType')">
          <el-radio-group v-model="fieldForm.valueType">
            <el-radio-button value="string">{{ t('properties.common.string') }}</el-radio-button>
            <el-radio-button value="expression">{{ t('properties.common.expression') }}</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.fieldValue')">
          <el-input v-model="fieldForm.value" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fieldDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" @click="saveField">{{ t('properties.common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mappingDialogVisible"
      :title="mappingIsInput ? t('properties.dialogs.mappingInput') : t('properties.dialogs.mappingOutput')"
      width="min(540px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item :label="t('properties.dialogs.sourceType')">
          <el-radio-group v-model="mappingForm.sourceType" data-testid="mapping-source-type">
            <el-radio-button value="source">{{ t('properties.common.variable') }}</el-radio-button>
            <el-radio-button value="sourceExpression">{{ t('properties.common.expression') }}</el-radio-button>
            <el-radio-button v-if="mappingForm.sourceType === 'variables'" value="variables">
              {{ t('properties.dialogs.variableCollection') }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('properties.dialogs.source')" required>
          <el-input
            v-model="mappingForm.source"
            data-testid="mapping-source"
            :placeholder="
              mappingForm.sourceType === 'sourceExpression'
                ? '${sourceValue}'
                : mappingForm.sourceType === 'variables'
                  ? 'all'
                  : 'sourceVariable'
            "
          />
        </el-form-item>
        <el-form-item
          v-if="mappingForm.sourceType !== 'variables'"
          :label="t('properties.dialogs.targetVariable')"
          required
        >
          <el-input
            v-model="mappingForm.target"
            data-testid="mapping-target"
            placeholder="targetVariable"
          />
        </el-form-item>
        <el-alert
          v-if="editingMapping?.transient && !mappingSupportsTransient"
          class="mb-3"
          type="warning"
          :closable="false"
          show-icon
          :title="t('properties.dialogs.transientHelp')"
        />
        <div
          v-if="mappingForm.sourceType !== 'variables' && mappingSupportsTransient"
          class="switch-row"
        >
          <span>{{ t('properties.dialogs.transientVariable') }}</span>
          <el-switch v-model="mappingForm.transient" data-testid="mapping-transient" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mappingDialogVisible = false">{{ t('properties.common.cancel') }}</el-button>
        <el-button type="primary" data-testid="save-mapping" @click="saveMapping">{{ t('properties.common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </aside>
</template>

<style scoped>
.properties-panel {
  width: 100%;
  height: 100%;
  color: #344054;
  background: #fff;
}

.properties-content {
  height: 100%;
  overflow-y: auto;
}

.element-summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 72px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--app-border);
}

.element-icon {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 36px;
  place-items: center;
  border-radius: 9px;
  color: var(--app-primary);
  background: var(--app-primary-soft);
}

.properties-panel :deep(.el-collapse) {
  border: 0;
}

.properties-panel :deep(.el-collapse-item__header) {
  height: 46px;
  padding: 0 16px;
  border-bottom-color: #edf0f4;
  color: #344054;
  font-weight: 600;
}

.properties-panel :deep(.el-collapse-item__wrap) {
  border-bottom-color: #edf0f4;
}

.properties-panel :deep(.el-collapse-item__content) {
  padding: 14px 16px 18px;
}

.collapse-title {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.section-count {
  display: inline-grid;
  min-width: 19px;
  height: 19px;
  place-items: center;
  padding: 0 5px;
  border-radius: 9px;
  color: #667085;
  background: #f2f4f7;
  font-size: 11px;
  font-weight: 600;
  line-height: 19px;
}

.properties-panel :deep(.el-form-item) {
  margin-bottom: 14px;
}

.properties-panel :deep(.el-form-item__label) {
  padding-bottom: 6px;
  color: #475467;
  line-height: 1.2;
}

.two-column {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 12px;
}

.listener-implementation-types {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
}

.listener-implementation-types :deep(.el-radio-button__inner) {
  width: 100%;
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
  margin-bottom: 12px;
  gap: 16px;
}

.call-type-segmented {
  width: 100%;
}

.call-type-segmented :deep(.el-segmented__item) {
  flex: 1;
  min-width: 0;
}

.form-help {
  margin-top: 5px;
  color: #98a2b3;
  font-size: 12px;
  line-height: 1.5;
}

.preset-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 2px 0 14px;
  padding: 8px 10px;
  border-radius: 7px;
  color: #667085;
  background: #f8fafc;
  font-size: 11px;
}

.metadata-divider {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 4px 0 14px;
  padding: 9px 10px;
  border-radius: 8px;
  color: #475467;
  background: #f5f8ff;
  font-size: 12px;
  font-weight: 600;
}

.json-editor-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  width: 100%;
  margin-top: 8px;
  gap: 6px;
}

.json-error {
  width: 100%;
  margin-top: 6px;
  color: #d92d20;
  font-size: 11px;
  line-height: 1.45;
}

.node-form-tabs :deep(.el-tabs__header) {
  margin-bottom: 12px;
}

.node-form-tabs :deep(.el-form-item) {
  margin-bottom: 0;
}

.node-form-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  margin-top: 10px;
  gap: 6px;
}

.section-list-header,
.dialog-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
  font-size: 13px;
  font-weight: 600;
}

.definition-actions {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.definition-actions :deep(.el-button) {
  width: 100%;
  margin-left: 0;
}

.item-list {
  overflow: hidden;
  border: 1px solid #eaecf0;
  border-radius: 8px;
}

.list-item {
  display: flex;
  align-items: center;
  min-height: 52px;
  padding: 8px 8px 8px 12px;
  border-bottom: 1px solid #f0f2f5;
  gap: 4px;
}

.list-item:last-child {
  border-bottom: 0;
}

.empty-inline {
  padding: 12px;
  border: 1px dashed #dfe3ea;
  border-radius: 8px;
  color: #98a2b3;
  text-align: center;
  font-size: 12px;
}

.panel-empty {
  display: grid;
  height: 100%;
  place-content: center;
  justify-items: center;
  color: #98a2b3;
  font-size: 13px;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 110px 1.4fr 32px;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}

.enum-row {
  grid-template-columns: 1fr 1fr 32px;
}

.switches-inline {
  display: flex;
  padding: 10px 12px;
  border-radius: 8px;
  background: #f8fafc;
  gap: 28px;
}

.code-input :deep(textarea) {
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
}
</style>
