<script setup lang="ts">
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import type { PropType } from 'vue'
import type Modeler from 'bpmn-js/lib/Modeler'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowDown, ArrowUp, Delete, Edit, Plus, Search } from '@element-plus/icons-vue'

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
import type {
  BusinessRecord,
  BusinessValue,
  FlowableHostAdapter,
  NodeFormContext,
  NodeFormRecord,
} from '@/modeler/integration'
import {
  FLOWABLE_BPMN_SERVICE_TASK_TYPES,
  FLOWABLE_SERVICE_TASK_TYPE_LABELS,
  resolveHostServiceTaskTypes,
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
  hostAdapter: {
    type: Object as PropType<FlowableHostAdapter | null>,
    default: null,
  },
  hostAdapterGeneration: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits<{
  changed: []
}>()

const activeSections = ref<string[]>(['general'])

type AssignmentMode = 'legacy' | 'static' | 'idm'
type JsonContainer = Record<string, unknown> | unknown[]
type CommittedNodeFormState = {
  activityId: string
  processId: string
  modelKey: string
  formKey: string
  selectedForms: BusinessRecord[]
  extensionBody: string
  signature: string
}
type JsonExtensionKey =
  | 'staticAssigneeVariables'
  | 'idmAssignee'
  | 'idmCandidateUsers'
  | 'idmCandidateGroups'
  | 'nextUser'
  | 'nextSequenceFlow'
  | 'nodeFormExp'
  | 'modelBpmnExtension'
  | 'multiInstanceVariables'

const jsonExtensionTypes: Record<JsonExtensionKey, string> = {
  staticAssigneeVariables: 'flowable:StaticAssigneeVariables',
  idmAssignee: 'flowable:IdmAssignee',
  idmCandidateUsers: 'flowable:IdmCandidateUsers',
  idmCandidateGroups: 'flowable:IdmCandidateGroups',
  nextUser: 'flowable:NextUser',
  nextSequenceFlow: 'flowable:NextSequenceFlow',
  nodeFormExp: 'flowable:NodeFormExp',
  modelBpmnExtension: 'flowable:ModelBpmnExtension',
  multiInstanceVariables: 'flowable:MultiInstanceVariables',
}

const jsonExtensionLabels: Record<JsonExtensionKey, string> = {
  staticAssigneeVariables: '静态分配变量',
  idmAssignee: 'IDM 办理人',
  idmCandidateUsers: 'IDM 候选用户',
  idmCandidateGroups: 'IDM 候选组',
  nextUser: '下一审批人',
  nextSequenceFlow: '下一流转',
  nodeFormExp: '表单选择元数据',
  modelBpmnExtension: '模型业务扩展',
  multiInstanceVariables: '多实例业务变量',
}

const jsonExtensionKeys = Object.keys(jsonExtensionTypes) as JsonExtensionKey[]

const extensionJson = reactive<Record<JsonExtensionKey, string>>({
  staticAssigneeVariables: '',
  idmAssignee: '',
  idmCandidateUsers: '',
  idmCandidateGroups: '',
  nextUser: '',
  nextSequenceFlow: '',
  nodeFormExp: '',
  modelBpmnExtension: '',
  multiInstanceVariables: '',
})

const extensionJsonErrors = reactive<Record<JsonExtensionKey, string>>({
  staticAssigneeVariables: '',
  idmAssignee: '',
  idmCandidateUsers: '',
  idmCandidateGroups: '',
  nextUser: '',
  nextSequenceFlow: '',
  nodeFormExp: '',
  modelBpmnExtension: '',
  multiInstanceVariables: '',
})

const extensionJsonDirty = reactive<Record<JsonExtensionKey, boolean>>({
  staticAssigneeVariables: false,
  idmAssignee: false,
  idmCandidateUsers: false,
  idmCandidateGroups: false,
  nextUser: false,
  nextSequenceFlow: false,
  nodeFormExp: false,
  modelBpmnExtension: false,
  multiInstanceVariables: false,
})

type JsonDrafts = Partial<Record<JsonExtensionKey, string>>
const extensionJsonDrafts = new WeakMap<BpmnBusinessObject, JsonDrafts>()
let extensionJsonOwner: BpmnBusinessObject | null = null
let hydratingExtensionJson = false

const unsupportedAssignmentMode = ref('')

const form = reactive({
  id: '',
  name: '',
  documentation: '',
  isExecutable: true,
  isEagerExecutionFetching: false,
  versionTag: '',
  processNameExp: '',
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
  assignmentMode: 'legacy' as AssignmentMode,
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

const nodeFormMode = ref<'selection' | 'json'>('selection')
const nodeFormDialogVisible = ref(false)
const editingNodeFormIndex = ref(-1)
const editingNodeFormOriginal = shallowRef<BusinessRecord | null>(null)
const nodeFormHostLoading = ref(false)
const nodeFormEditor = reactive({
  id: '',
  code: '',
  name: '',
  title: '',
  categoryCode: '',
  categoryName: '',
})
let nodeFormHostRequest = 0

type FreeApprovalKind = 'nextUser' | 'nextSequenceFlow'
const freeApprovalMode = ref<'structured' | 'json'>('structured')
const freeApprovalDialogVisible = ref(false)
const freeApprovalKind = ref<FreeApprovalKind>('nextUser')
const editingFreeApprovalIndex = ref(-1)
const editingFreeApprovalOriginal = shallowRef<BusinessRecord | null>(null)
const freeApprovalEditor = reactive({
  name: '',
  code: '',
  multiple: false,
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
const booleanOptions = [
  { label: '否', value: 'false' },
  { label: '是', value: 'true' },
]
const calledElementTypeOptions = [
  { label: '流程定义 Key', value: 'key' },
  { label: '流程定义 ID', value: 'id' },
]

const serviceFieldPresets: Record<string, ServiceFieldSpec[]> = {
  'external-worker': [],
  external: [],
  shell: [
    { name: 'command', label: '命令', valueType: 'string', required: true },
    { name: 'arg1', label: '参数 1', valueType: 'expression' },
    { name: 'arg2', label: '参数 2', valueType: 'expression' },
    { name: 'arg3', label: '参数 3', valueType: 'expression' },
    { name: 'wait', label: '等待命令结束', valueType: 'string', control: 'boolean' },
    { name: 'redirectError', label: '合并错误输出', valueType: 'string', control: 'boolean' },
    { name: 'cleanEnv', label: '清理环境变量', valueType: 'string', control: 'boolean' },
    { name: 'outputVariable', label: '输出变量', valueType: 'string' },
    { name: 'errorCodeVariable', label: '退出码变量', valueType: 'string' },
    { name: 'directory', label: '工作目录', valueType: 'string' },
  ],
  sc: [
    { name: 'serviceId', label: '服务标识', valueType: 'string', required: true },
    { name: 'url', label: '请求路径', valueType: 'string', required: true },
    {
      name: 'method',
      label: '请求方式',
      valueType: 'string',
      control: 'select',
      options: methodOptions.slice(0, 2),
      required: true,
    },
    { name: 'params', label: '请求参数', valueType: 'expression', control: 'textarea' },
    { name: 'responseVariableName', label: '响应变量', valueType: 'string' },
    { name: 'ignoreException', label: '忽略异常', valueType: 'string', control: 'boolean' },
  ],
  rest: [
    { name: 'requestUrl', label: '请求地址', valueType: 'string', required: true },
    {
      name: 'requestMethod',
      label: '请求方式',
      valueType: 'string',
      control: 'select',
      options: methodOptions,
      required: true,
    },
    { name: 'requestHeaders', label: '请求头', valueType: 'string', control: 'textarea' },
    { name: 'requestBody', label: '请求体', valueType: 'expression', control: 'textarea' },
    { name: 'responseVariableName', label: '响应变量', valueType: 'string' },
    { name: 'ignoreException', label: '忽略异常', valueType: 'string', control: 'boolean' },
  ],
  http: [
    { name: 'requestUrl', label: '请求地址', valueType: 'string', required: true },
    {
      name: 'requestMethod',
      label: '请求方式',
      valueType: 'string',
      control: 'select',
      options: methodOptions,
      required: true,
    },
    { name: 'requestHeaders', label: '请求头', valueType: 'string', control: 'textarea' },
    { name: 'requestBody', label: '请求体', valueType: 'string', control: 'textarea' },
    { name: 'responseVariableName', label: '响应变量', valueType: 'string' },
    { name: 'ignoreException', label: '忽略异常', valueType: 'string', control: 'boolean' },
    { name: 'disallowRedirects', label: '禁止重定向', valueType: 'string', control: 'boolean' },
    {
      name: 'saveResponseVariableAsJson',
      label: '响应保存为 JSON',
      valueType: 'string',
      control: 'boolean',
    },
  ],
  mail: [
    { name: 'to', label: '收件人', valueType: 'expression' },
    { name: 'cc', label: '抄送', valueType: 'expression' },
    { name: 'bcc', label: '密送', valueType: 'expression' },
    { name: 'from', label: '发件人', valueType: 'expression' },
    { name: 'subject', label: '邮件主题', valueType: 'expression' },
    { name: 'text', label: '纯文本正文', valueType: 'expression', control: 'textarea' },
    { name: 'html', label: 'HTML 正文', valueType: 'expression', control: 'textarea' },
    { name: 'charset', label: '字符集', valueType: 'string', placeholder: 'utf-8' },
  ],
  mq: [
    { name: 'queue', label: '队列名称', valueType: 'string', required: true },
    { name: 'params', label: '消息参数', valueType: 'expression', control: 'textarea' },
  ],
  dmn: [
    { name: 'decisionTableReferenceKey', label: '决策表标识', valueType: 'string' },
    { name: 'decisionServiceReferenceKey', label: '决策服务标识', valueType: 'string' },
    {
      name: 'fallbackToDefaultTenant',
      label: '回退到默认租户',
      valueType: 'string',
      control: 'boolean',
    },
    {
      name: 'decisionTaskThrowErrorOnNoHits',
      label: '无匹配结果时抛错',
      valueType: 'string',
      control: 'boolean',
    },
  ],
  copy: [
    { name: 'transferToUserNos', label: '抄送人员', valueType: 'string', required: true },
    { name: 'messageType', label: '消息类型', valueType: 'string', placeholder: 'system' },
  ],
}

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
const supportsForm = computed(() => isUserTask.value || isStartEvent.value)
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

const typeLabels: Record<string, string> = {
  'bpmn:Process': '流程',
  'bpmn:StartEvent': '开始事件',
  'bpmn:EndEvent': '结束事件',
  'bpmn:IntermediateCatchEvent': '中间捕获事件',
  'bpmn:IntermediateThrowEvent': '中间抛出事件',
  'bpmn:BoundaryEvent': '边界事件',
  'bpmn:UserTask': '用户任务',
  'bpmn:ServiceTask': '服务任务',
  'bpmn:ScriptTask': '脚本任务',
  'bpmn:BusinessRuleTask': '业务规则任务',
  'bpmn:ManualTask': '手工任务',
  'bpmn:ReceiveTask': '接收任务',
  'bpmn:SendTask': '发送任务',
  'bpmn:CallActivity': '调用活动',
  'bpmn:SubProcess': '子流程',
  'bpmn:ExclusiveGateway': '排他网关',
  'bpmn:ParallelGateway': '并行网关',
  'bpmn:InclusiveGateway': '包容网关',
  'bpmn:ComplexGateway': '复杂网关',
  'bpmn:EventBasedGateway': '事件网关',
  'bpmn:SequenceFlow': '顺序流',
  'bpmn:Participant': '参与者/池',
  'bpmn:Lane': '泳道',
}

const elementTypeLabel = computed(() => typeLabels[type.value] || type.value.replace('bpmn:', ''))
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

const owningProcessId = computed(() => {
  let current = businessObject.value || undefined
  while (current && current.$type !== 'bpmn:Process') {
    current = current.$parent as BpmnBusinessObject | undefined
  }
  return text(current?.id)
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
const selectedNodeForms = computed(() => {
  props.revision
  if (!extensionJson.nodeFormExp.trim()) return [] as BusinessRecord[]
  try {
    const value = JSON.parse(extensionJson.nodeFormExp) as unknown
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is BusinessRecord =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  } catch {
    return []
  }
})
const nodeFormStructuredError = computed(() => {
  if (!extensionJson.nodeFormExp.trim()) return ''
  try {
    const value = JSON.parse(extensionJson.nodeFormExp) as unknown
    if (!Array.isArray(value)) return '当前 NodeFormExp 顶层不是数组，请在高级 JSON 中处理。'
    if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      return 'NodeFormExp 数组包含非对象项，请在高级 JSON 中处理。'
    }
    return ''
  } catch {
    return 'NodeFormExp JSON 语法有误，请在高级 JSON 中修正。'
  }
})
const structuredNextUsers = computed(() => structuredJsonRecords(extensionJson.nextUser))
const structuredNextSequenceFlows = computed(() =>
  structuredJsonRecords(extensionJson.nextSequenceFlow),
)
const nextUserStructuredError = computed(() =>
  inspectStructuredJsonArray(extensionJson.nextUser, 'NextUser'),
)
const nextSequenceFlowStructuredError = computed(() =>
  inspectStructuredJsonArray(extensionJson.nextSequenceFlow, 'NextSequenceFlow'),
)
const freeApprovalCount = computed(
  () => structuredNextUsers.value.length + structuredNextSequenceFlows.value.length,
)
const selectedServiceType = computed(() =>
  form.implementationType === 'type' ? form.implementation : '',
)
const hostServiceTaskTypes = computed(() => resolveHostServiceTaskTypes(props.hostAdapter))
const serviceTaskTypeOptions = computed(() => {
  const options: Array<{ value: string; label: string }> = FLOWABLE_BPMN_SERVICE_TASK_TYPES.map((value) => ({
    value,
    label: FLOWABLE_SERVICE_TASK_TYPE_LABELS[value] || value,
  }))
  options.push(...hostServiceTaskTypes.value.map(({ type: value, label }) => ({ value, label })))

  const current = selectedServiceType.value.trim()
  if (current && !options.some((option) => option.value === current)) {
    options.push({
      value: current,
      label:
        FLOWABLE_SERVICE_TASK_TYPE_LABELS[current] ||
        `导入类型：${current}（宿主未授权）`,
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
const activeServiceFields = computed(() => serviceFieldPresets[selectedServiceType.value] || [])
const mappingSupportsTransient = computed(() =>
  ['eventIn', 'eventOut'].includes(mappingForm.kind),
)
const mappingIsInput = computed(() => ['in', 'eventIn'].includes(mappingForm.kind))
const calledElementTypeError = computed(() => {
  const value = form.calledElementType
  return value && !['key', 'id'].includes(value)
    ? '被调用流程类型必须为 key 或 id'
    : ''
})

const text = (value: unknown) => (value === undefined || value === null ? '' : String(value))
const booleanValue = (value: unknown, defaultValue = false) =>
  value === undefined || value === null ? defaultValue : value === true || value === 'true'

function isPlainBusinessRecord(value: object) {
  const prototype = Object.getPrototypeOf(value)
  if (prototype === null) return true
  if (Object.getPrototypeOf(prototype) !== null) return false

  const constructor = Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
  return (
    typeof constructor === 'function' &&
    Function.prototype.toString.call(constructor) === Function.prototype.toString.call(Object)
  )
}

function hostErrorMessage(error: unknown, fallback: string) {
  if (!error || (typeof error !== 'object' && typeof error !== 'function')) return fallback
  try {
    const message = (error as { message?: unknown }).message
    return typeof message === 'string' && message.trim() ? message : fallback
  } catch {
    return fallback
  }
}

function cloneBusinessValue(
  value: unknown,
  path: string,
  ancestors = new WeakSet<object>(),
): BusinessValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${path} 必须是有限数字`)
    return value
  }
  if (!value || typeof value !== 'object') {
    throw new Error(`${path} 必须是 JSON 可表示的数据`)
  }
  if (ancestors.has(value)) throw new Error(`${path} 不能包含循环引用`)

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const clone: BusinessValue[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) throw new Error(`${path}[${index}] 不能是空数组项`)
        clone.push(cloneBusinessValue(value[index], `${path}[${index}]`, ancestors))
      }
      return clone
    }

    if (!isPlainBusinessRecord(value)) {
      throw new Error(`${path} 必须是普通对象`)
    }

    const clone: BusinessRecord = {}
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue
      Object.defineProperty(clone, key, {
        configurable: true,
        enumerable: true,
        writable: true,
        value: cloneBusinessValue(item, `${path}.${key}`, ancestors),
      })
    }
    return clone
  } finally {
    ancestors.delete(value)
  }
}

function cloneBusinessRecord(value: unknown, path: string): BusinessRecord {
  const clone = cloneBusinessValue(value, path)
  if (!clone || typeof clone !== 'object' || Array.isArray(clone)) {
    throw new Error(`${path} 必须是对象`)
  }
  return clone
}

function property(name: string) {
  return businessObject.value ? getBusinessProperty(businessObject.value, name) : undefined
}

function inspectJsonContainer(raw: string) {
  if (!raw.trim()) return ''
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== 'object')) {
      return '顶层必须是 JSON 数组或对象'
    }
    return ''
  } catch (error) {
    return `JSON 语法错误：${error instanceof Error ? error.message : String(error)}`
  }
}

function structuredJsonRecords(raw: string) {
  if (!raw.trim()) return [] as BusinessRecord[]
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return []
    return value.filter(
      (item): item is BusinessRecord =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  } catch {
    return []
  }
}

function committedNodeFormRecords(raw: string) {
  if (!raw.trim()) return [] as BusinessRecord[]
  try {
    const value = JSON.parse(raw) as unknown
    if (
      !Array.isArray(value) ||
      value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))
    ) {
      return []
    }
    return value as BusinessRecord[]
  } catch {
    return []
  }
}

function readCommittedNodeFormState(): CommittedNodeFormState {
  const extensionBody = props.element
    ? getExtensionBody(props.element, jsonExtensionTypes.nodeFormExp)
    : ''
  const formKey = text(
    businessObject.value
      ? getBusinessProperty(businessObject.value, 'flowable:formKey')
      : undefined,
  )
  const activityId = text(businessObject.value?.id)
  let current = businessObject.value || undefined
  while (current && current.$type !== 'bpmn:Process') {
    current = current.$parent as BpmnBusinessObject | undefined
  }
  const processId = text(current?.id)

  return {
    activityId,
    processId,
    modelKey: processId,
    formKey,
    selectedForms: committedNodeFormRecords(extensionBody),
    extensionBody,
    signature: JSON.stringify([activityId, processId, formKey, extensionBody]),
  }
}

const optionalNodeFormStringFields = [
  'id',
  'title',
  'categoryCode',
  'categoryName',
] as const

function validateSelectedNodeForms(value: unknown): NodeFormRecord[] {
  if (!Array.isArray(value)) {
    throw new Error('宿主表单选择器必须返回对象数组、null 或 undefined')
  }
  if (value.length > 1) throw new Error('NodeFormExp 只支持选择一个表单')

  return value.map((item, index) => {
    const label = `宿主表单选择结果第 ${index + 1} 项`
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`${label}必须是对象`)
    }

    const source = item as Record<string, unknown>
    if (typeof source.code !== 'string' || !source.code.trim()) {
      throw new Error(`${label}必须包含非空字符串 code`)
    }
    if (typeof source.name !== 'string' || !source.name.trim()) {
      throw new Error(`${label}必须包含非空字符串 name`)
    }
    for (const field of optionalNodeFormStringFields) {
      if (
        Object.hasOwn(source, field) &&
        source[field] !== null &&
        source[field] !== undefined &&
        typeof source[field] !== 'string'
      ) {
        throw new Error(`${label}的 ${field} 必须是字符串`)
      }
    }

    const record = cloneBusinessRecord(item, label)
    for (const field of optionalNodeFormStringFields) {
      if (source[field] === null || source[field] === undefined) delete record[field]
    }
    return record as NodeFormRecord
  })
}

function nodeFormSelectionStateSignature() {
  return JSON.stringify([
    readCommittedNodeFormState().signature,
    extensionJson.nodeFormExp,
    form.formKey,
  ])
}

function invalidateNodeFormHostRequest() {
  nodeFormHostRequest += 1
  nodeFormHostLoading.value = false
}

function inspectStructuredJsonArray(raw: string, label: string) {
  if (!raw.trim()) return ''
  try {
    const value = JSON.parse(raw) as unknown
    if (!Array.isArray(value)) return `${label} 顶层不是数组，请在高级 JSON 中处理。`
    if (value.some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
      return `${label} 数组包含非对象项，请在高级 JSON 中处理。`
    }
    return ''
  } catch {
    return `${label} JSON 语法有误，请在高级 JSON 中修正。`
  }
}

watch(
  () => jsonExtensionKeys.map((key) => extensionJson[key]),
  (values, previousValues) => {
    if (hydratingExtensionJson || !extensionJsonOwner) return

    const drafts = { ...(extensionJsonDrafts.get(extensionJsonOwner) || {}) }
    jsonExtensionKeys.forEach((key, index) => {
      if (values[index] === previousValues[index]) return
      const raw = values[index] || ''
      extensionJsonDirty[key] = true
      extensionJsonErrors[key] = inspectJsonContainer(raw)
      drafts[key] = raw
    })
    extensionJsonDrafts.set(extensionJsonOwner, drafts)
  },
  { flush: 'sync' },
)

watch(
  () => [extensionJson.nodeFormExp, form.formKey],
  () => invalidateNodeFormHostRequest(),
  { flush: 'sync' },
)

function clearJsonDraft(key: JsonExtensionKey) {
  extensionJsonDirty[key] = false
  if (!extensionJsonOwner) return

  const drafts = extensionJsonDrafts.get(extensionJsonOwner)
  if (!drafts || !Object.prototype.hasOwnProperty.call(drafts, key)) return
  const nextDrafts = { ...drafts }
  delete nextDrafts[key]
  if (Object.keys(nextDrafts).length) extensionJsonDrafts.set(extensionJsonOwner, nextDrafts)
  else extensionJsonDrafts.delete(extensionJsonOwner)
}

function parseJsonDraft(
  key: JsonExtensionKey,
  options: { requireArray?: boolean; notify?: boolean } = {},
): { ok: true; value?: JsonContainer } | { ok: false } {
  const raw = extensionJson[key]
  if (!raw.trim()) {
    extensionJsonErrors[key] = ''
    return { ok: true }
  }

  const error = inspectJsonContainer(raw)
  if (error) {
    extensionJsonErrors[key] = error
    if (options.notify !== false) ElMessage.warning(`${jsonExtensionLabels[key]}：${error}`)
    return { ok: false }
  }

  const value = JSON.parse(raw) as JsonContainer
  if (options.requireArray && !Array.isArray(value)) {
    const message = '该操作要求顶层为 JSON 数组'
    extensionJsonErrors[key] = message
    if (options.notify !== false) ElMessage.warning(`${jsonExtensionLabels[key]}：${message}`)
    return { ok: false }
  }

  extensionJsonErrors[key] = ''
  return { ok: true, value }
}

function hydrateBusinessExtensions() {
  if (!props.element) return

  const assignmentType = getExtensionBody(props.element, 'flowable:AssigneeType')
  unsupportedAssignmentMode.value =
    assignmentType && assignmentType !== 'static' && assignmentType !== 'idm' ? assignmentType : ''
  form.assignmentMode =
    assignmentType === 'static' || assignmentType === 'idm' ? assignmentType : 'legacy'

  const nextOwner = props.element.businessObject
  const ownerChanged = extensionJsonOwner !== nextOwner
  extensionJsonOwner = nextOwner
  const drafts = extensionJsonDrafts.get(nextOwner)

  hydratingExtensionJson = true
  try {
    for (const key of jsonExtensionKeys) {
      const hasDraft = Boolean(drafts && Object.prototype.hasOwnProperty.call(drafts, key))
      if (!ownerChanged && extensionJsonDirty[key] && !hasDraft) continue

      const raw = hasDraft ? drafts?.[key] || '' : getExtensionBody(props.element, jsonExtensionTypes[key])
      extensionJson[key] = raw
      extensionJsonDirty[key] = hasDraft
      extensionJsonErrors[key] = inspectJsonContainer(raw)
    }
  } finally {
    hydratingExtensionJson = false
  }
}

function hydrate() {
  const bo = businessObject.value
  if (!bo) return

  form.id = text(bo.id)
  form.name = text(bo.name)
  form.documentation = text(bo.documentation?.[0]?.text)
  form.isExecutable = booleanValue(property('isExecutable'), true)
  const eagerExecutionFetching = property('flowable:isEagerExecutionFetching')
  form.isEagerExecutionFetching =
    eagerExecutionFetching === undefined
      ? booleanValue(property('flowable:enableEagerExecutionTreeFetching'))
      : booleanValue(eagerExecutionFetching)
  form.versionTag = text(property('flowable:versionTag'))
  form.processNameExp = props.element
    ? getExtensionBody(props.element, 'flowable:ProcessNameExp')
    : ''
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
  hydrateBusinessExtensions()
  form.formKey = text(property('flowable:formKey'))
  form.formFieldValidation = booleanValue(property('flowable:formFieldValidation'), true)
  form.sameDeployment = booleanValue(property('flowable:sameDeployment'), true)
  form.skipExpression = text(property('flowable:skipExpression'))
  form.async =
    booleanValue(property('flowable:async')) ||
    booleanValue(property('flowable:asyncBefore'))
  form.asyncLeave =
    booleanValue(property('flowable:asyncLeave')) ||
    booleanValue(property('flowable:asyncAfter'))
  form.exclusive = booleanValue(property('flowable:exclusive'), true)
  form.asyncLeaveExclusive = booleanValue(
    property('flowable:asyncLeaveExclusive'),
    true,
  )
  form.jobCategory = props.element
    ? getExtensionBody(props.element, 'flowable:JobCategory') ||
      text(property('flowable:jobCategory')) ||
      text(property('flowable:leaveJobCategory'))
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

  for (const specs of Object.values(serviceFieldPresets)) {
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
  () => [props.hostAdapter, props.hostAdapterGeneration] as const,
  ([adapter, generation], [previousAdapter, previousGeneration]) => {
    if (adapter === previousAdapter && generation === previousGeneration) return
    invalidateNodeFormHostRequest()
  },
  { flush: 'sync' },
)

watch(
  () => {
    props.revision
    const state = readCommittedNodeFormState()
    return [businessObject.value, state.signature] as const
  },
  ([owner, signature], [previousOwner, previousSignature]) => {
    if (owner === previousOwner && signature === previousSignature) return
    invalidateNodeFormHostRequest()
  },
  { flush: 'sync' },
)

watch(
  () => props.element?.id,
  () => {
    invalidateNodeFormHostRequest()
    nodeFormMode.value = 'selection'
    nodeFormDialogVisible.value = false
    freeApprovalMode.value = 'structured'
    freeApprovalDialogVisible.value = false
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
    ElMessage.warning('元素标识不能为空')
    hydrate()
    return
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(form.id)) {
    ElMessage.warning('标识必须以字母或下划线开头，且不能包含空格')
    hydrate()
    return
  }
  if (props.modeler && businessObject.value) {
    const claimed = getClaimedIdOwner(props.modeler, form.id.trim())
    if (claimed && claimed !== businessObject.value) {
      ElMessage.warning(`标识 ${form.id.trim()} 已被其他 BPMN 元素使用`)
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

function updateProcessNameExp() {
  if (!props.modeler || !props.element || !isProcess.value) return
  const changed = setExtensionBody(
    props.modeler,
    props.element,
    'flowable:ProcessNameExp',
    form.processNameExp,
  )
  if (changed) emit('changed')
}

function updateAssignmentMode() {
  if (!props.modeler || !props.element) return
  const body = form.assignmentMode === 'legacy' ? '' : form.assignmentMode
  const changed = setExtensionBody(
    props.modeler,
    props.element,
    'flowable:AssigneeType',
    body,
  )
  unsupportedAssignmentMode.value = ''
  if (changed) emit('changed')
}

function saveJsonExtension(key: JsonExtensionKey) {
  if (!props.modeler || !props.element) return
  const parsed = parseJsonDraft(key)
  if (!parsed.ok) return

  const changed = setExtensionBody(
    props.modeler,
    props.element,
    jsonExtensionTypes[key],
    extensionJson[key],
  )
  if (changed) emit('changed')
  clearJsonDraft(key)

  if (key === 'nodeFormExp' && Array.isArray(parsed.value) && parsed.value.length) {
    const first = parsed.value[0]
    const code = first && typeof first === 'object' ? text((first as Record<string, unknown>).code) : ''
    if (code && form.formKey && code !== form.formKey) {
      ElMessage.warning(`NodeFormExp 首项 code（${code}）与当前 formKey 不一致`)
      return
    }
  }

  ElMessage.success(extensionJson[key].trim() ? `${jsonExtensionLabels[key]}已保存` : `${jsonExtensionLabels[key]}已清除`)
}

function formatJsonExtension(key: JsonExtensionKey) {
  const parsed = parseJsonDraft(key)
  if (!parsed.ok || parsed.value === undefined) return
  extensionJson[key] = JSON.stringify(parsed.value, null, 2)
}

function recordArray(value: JsonContainer | undefined) {
  return Array.isArray(value)
    ? value.filter(
        (item): item is BusinessRecord => Boolean(item) && typeof item === 'object' && !Array.isArray(item),
      )
    : []
}

function nodeFormRecordsForStructuredEdit() {
  const parsed = parseJsonDraft('nodeFormExp', { requireArray: true })
  if (!parsed.ok) return null
  if (parsed.value === undefined) return []
  if (!Array.isArray(parsed.value)) return null
  const records = recordArray(parsed.value)
  if (records.length !== parsed.value.length) {
    ElMessage.warning('NodeFormExp 数组包含非对象项，请先在高级 JSON 中处理')
    return null
  }
  return records
}

function nodeFormContext(selectedForms = selectedNodeForms.value): NodeFormContext {
  return cloneBusinessRecord(
    {
      activityId: text(businessObject.value?.id),
      processId: owningProcessId.value,
      modelKey: owningProcessId.value,
      formKey: form.formKey,
      selectedForms,
    },
    'nodeFormContext',
  ) as unknown as NodeFormContext
}

function writeNodeFormRecords(records: BusinessRecord[]) {
  extensionJson.nodeFormExp = records.length ? JSON.stringify(records, null, 2) : ''
  saveJsonExtension('nodeFormExp')
}

function openNodeFormDialog(index = -1) {
  const records = nodeFormRecordsForStructuredEdit()
  if (!records) return
  if (index < 0 && records.length) {
    ElMessage.warning('NodeFormExp 只支持选择一个表单，请编辑或移除当前表单')
    return
  }
  const original = index >= 0 ? records[index] : undefined
  editingNodeFormIndex.value = original ? index : -1
  editingNodeFormOriginal.value = original ? { ...original } : null
  nodeFormEditor.id = text(original?.id)
  nodeFormEditor.code = text(original?.code)
  nodeFormEditor.name = text(original?.name)
  nodeFormEditor.title = text(original?.title)
  nodeFormEditor.categoryCode = text(original?.categoryCode)
  nodeFormEditor.categoryName = text(original?.categoryName)
  nodeFormDialogVisible.value = true
}

function saveNodeFormRecord() {
  const records = nodeFormRecordsForStructuredEdit()
  if (!records) return
  const code = nodeFormEditor.code.trim()
  const name = nodeFormEditor.name.trim()
  if (!code || !name) {
    ElMessage.warning('表单标识和名称不能为空')
    return
  }
  if (
    records.some(
      (item, index) => index !== editingNodeFormIndex.value && text(item.code).trim() === code,
    )
  ) {
    ElMessage.warning(`表单标识 ${code} 已存在`)
    return
  }

  const nextRecord: BusinessRecord = { ...(editingNodeFormOriginal.value || {}), code, name }
  const optionalValues = {
    id: nodeFormEditor.id.trim(),
    title: nodeFormEditor.title.trim(),
    categoryCode: nodeFormEditor.categoryCode.trim(),
    categoryName: nodeFormEditor.categoryName.trim(),
  }
  for (const field of optionalNodeFormStringFields) {
    if (optionalValues[field]) nextRecord[field] = optionalValues[field]
    else delete nextRecord[field]
  }
  const nextRecords = [...records]
  if (editingNodeFormIndex.value >= 0) nextRecords[editingNodeFormIndex.value] = nextRecord
  else nextRecords.push(nextRecord)
  writeNodeFormRecords(nextRecords)
  nodeFormDialogVisible.value = false
}

async function removeNodeFormRecord(index: number) {
  const records = nodeFormRecordsForStructuredEdit()
  if (!records || !records[index]) return
  const record = records[index]
  if (!(await confirmDelete(`确定移除表单“${record.name || record.code}”吗？`, '移除表单'))) return
  writeNodeFormRecords(records.filter((_, currentIndex) => currentIndex !== index))
}

async function selectNodeFormsFromHost() {
  const adapter = props.hostAdapter
  if (!adapter?.selectNodeForms) return
  const records = nodeFormRecordsForStructuredEdit()
  if (!records) return
  const owner = businessObject.value
  const sourceSignature = nodeFormSelectionStateSignature()
  const sourceRevision = props.revision
  const adapterGeneration = props.hostAdapterGeneration
  const request = ++nodeFormHostRequest
  nodeFormHostLoading.value = true
  const isCurrentRequest = () =>
    request === nodeFormHostRequest &&
    businessObject.value === owner &&
    props.hostAdapter === adapter &&
    props.hostAdapterGeneration === adapterGeneration &&
    props.revision === sourceRevision &&
    nodeFormSelectionStateSignature() === sourceSignature
  try {
    const selected = await adapter.selectNodeForms(nodeFormContext(records))
    if (!isCurrentRequest()) return
    if (selected === null || selected === undefined) return
    writeNodeFormRecords(validateSelectedNodeForms(selected))
  } catch (error) {
    if (isCurrentRequest()) {
      ElMessage.error(hostErrorMessage(error, '宿主表单选择失败'))
    }
  } finally {
    if (
      request === nodeFormHostRequest &&
      props.hostAdapterGeneration === adapterGeneration
    ) nodeFormHostLoading.value = false
  }
}

function freeApprovalRecordsForEdit(kind: FreeApprovalKind) {
  const parsed = parseJsonDraft(kind, { requireArray: true })
  if (!parsed.ok) return null
  if (parsed.value === undefined) return []
  if (!Array.isArray(parsed.value)) return null
  const records = recordArray(parsed.value)
  if (records.length !== parsed.value.length) {
    ElMessage.warning(`${jsonExtensionLabels[kind]}数组包含非对象项，请先在高级 JSON 中处理`)
    return null
  }
  return records
}

function openFreeApprovalDialog(kind: FreeApprovalKind, index = -1) {
  const records = freeApprovalRecordsForEdit(kind)
  if (!records) return
  const original = index >= 0 ? records[index] : undefined
  freeApprovalKind.value = kind
  editingFreeApprovalIndex.value = original ? index : -1
  editingFreeApprovalOriginal.value = original ? { ...original } : null
  freeApprovalEditor.name = text(original?.name)
  freeApprovalEditor.code = text(original?.code)
  freeApprovalEditor.multiple = booleanValue(original?.multiple)
  freeApprovalDialogVisible.value = true
}

function saveFreeApprovalRecord() {
  const records = freeApprovalRecordsForEdit(freeApprovalKind.value)
  if (!records) return
  const name = freeApprovalEditor.name.trim()
  const code = freeApprovalEditor.code.trim()
  if (!name || !code) {
    ElMessage.warning('名称和编码不能为空')
    return
  }
  if (
    records.some(
      (item, index) =>
        index !== editingFreeApprovalIndex.value && text(item.code).trim() === code,
    )
  ) {
    ElMessage.warning(`编码 ${code} 已存在`)
    return
  }

  const nextRecord: BusinessRecord = {
    ...(editingFreeApprovalOriginal.value || {}),
    name,
    code,
  }
  if (freeApprovalKind.value === 'nextUser') {
    nextRecord.multiple = freeApprovalEditor.multiple
  }
  const nextRecords = [...records]
  if (editingFreeApprovalIndex.value >= 0) {
    nextRecords[editingFreeApprovalIndex.value] = nextRecord
  } else {
    nextRecords.push(nextRecord)
  }
  extensionJson[freeApprovalKind.value] = JSON.stringify(nextRecords, null, 2)
  saveJsonExtension(freeApprovalKind.value)
  freeApprovalDialogVisible.value = false
}

async function removeFreeApprovalRecord(kind: FreeApprovalKind, index: number) {
  const records = freeApprovalRecordsForEdit(kind)
  if (!records || !records[index]) return
  const record = records[index]
  if (!(await confirmDelete(`确定删除“${record.name || record.code}”吗？`, '删除自由审批配置'))) return
  const nextRecords = records.filter((_, currentIndex) => currentIndex !== index)
  extensionJson[kind] = nextRecords.length ? JSON.stringify(nextRecords, null, 2) : ''
  saveJsonExtension(kind)
}

function collectValues(items: Array<Record<string, unknown>>, propertyName: string) {
  return items.flatMap((item) => {
    const value = item[propertyName]
    if (Array.isArray(value)) return value.map(text).map((item) => item.trim()).filter(Boolean)
    const normalized = text(value).trim()
    return normalized ? [normalized] : []
  })
}

function syncStaticAssignment() {
  const parsed = parseJsonDraft('staticAssigneeVariables', { requireArray: true })
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    if (parsed.ok) ElMessage.warning('请先填写静态分配变量数组')
    return
  }

  const items = recordArray(parsed.value)
  const values = collectValues(items, 'value')
  if (items.length && !values.length) {
    ElMessage.warning('静态分配数组中没有可同步的 value')
    return
  }

  form.assignee = values.join(',')
  update({ 'flowable:assignee': form.assignee })
  ElMessage.success('已同步到 Flowable 办理人字段')
}

function syncIdmAssignment() {
  const mappings = [
    ['idmAssignee', 'code', 'assignee', 'flowable:assignee'],
    ['idmCandidateUsers', 'code', 'candidateUsers', 'flowable:candidateUsers'],
    ['idmCandidateGroups', 'sn', 'candidateGroups', 'flowable:candidateGroups'],
  ] as const
  const properties: Record<string, unknown> = {}
  const nextValues: Partial<Pick<typeof form, 'assignee' | 'candidateUsers' | 'candidateGroups'>> = {}
  let hasDraft = false

  for (const [key, codeProperty, formProperty, bpmnProperty] of mappings) {
    if (!extensionJson[key].trim()) continue
    hasDraft = true
    const parsed = parseJsonDraft(key, { requireArray: true })
    if (!parsed.ok || !Array.isArray(parsed.value)) return
    const items = recordArray(parsed.value)
    const values = collectValues(items, codeProperty)
    if (items.length && !values.length) {
      ElMessage.warning(`${jsonExtensionLabels[key]}中没有可同步的 ${codeProperty}`)
      return
    }
    nextValues[formProperty] = values.join(',')
    properties[bpmnProperty] = values.join(',')
  }

  if (!hasDraft) {
    ElMessage.warning('请先填写至少一项 IDM JSON 元数据')
    return
  }

  Object.assign(form, nextValues)
  update(properties)
  ElMessage.success('已同步 IDM code/sn 到 Flowable 基础分配字段')
}

function syncNodeFormKey() {
  const parsed = parseJsonDraft('nodeFormExp', { requireArray: true })
  if (!parsed.ok || !Array.isArray(parsed.value) || !parsed.value.length) {
    if (parsed.ok) ElMessage.warning('NodeFormExp 中没有可同步的表单')
    return
  }
  const first = parsed.value[0]
  const code = first && typeof first === 'object' ? text((first as Record<string, unknown>).code).trim() : ''
  if (!code) {
    ElMessage.warning('NodeFormExp 首项缺少 code')
    return
  }
  form.formKey = code
  update({ 'flowable:formKey': code })
  ElMessage.success('已同步 NodeFormExp 首项 code 到 formKey')
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
    upsertServiceField({ name: 'charset', label: '字符集', valueType: 'string' })
  }
  if (form.implementation === 'http' && !serviceFieldForm.requestHeaders) {
    serviceFieldForm.requestHeaders = 'Content-Type: application/json'
    upsertServiceField({ name: 'requestHeaders', label: '请求头', valueType: 'string' })
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
    'flowable:asyncBefore': undefined,
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
  return kind === 'message' ? '消息' : kind === 'signal' ? '信号' : '错误'
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
    ElMessage.warning('全局定义标识不能为空')
    return
  }
  if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) {
    ElMessage.warning('全局定义标识必须以字母或下划线开头，且不能包含空格')
    return
  }

  const claimedIdOwner = getClaimedIdOwner(props.modeler, id)
  if (claimedIdOwner && claimedIdOwner !== editingDefinition.value) {
    ElMessage.warning(`标识 ${id} 已被其他 BPMN 元素使用`)
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
    ElMessage.warning(`该${definitionKindLabel(value)}仍被 ${references} 个流程元素引用，不能删除`)
    return
  }
  if (
    !(await confirmDelete(
      `确定删除${definitionKindLabel(value)}“${value.name || value.id}”吗？`,
      '删除全局定义',
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
    ElMessage.warning('身份链接类型不能为空')
    return
  }
  if (!expression) {
    ElMessage.warning('分配表达式不能为空')
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
  if (!(await confirmDelete('确定删除这个自定义身份链接吗？', '删除身份链接'))) return
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
    ElMessage.warning('请选择监听事件')
    return
  }
  const isScript = listenerForm.implementationType === 'script'
  if (isScript && (!listenerForm.scriptLanguage.trim() || !listenerForm.scriptBody.trim())) {
    ElMessage.warning('请填写脚本语言和脚本内容')
    return
  }
  if (!isScript && !listenerForm.implementation.trim()) {
    ElMessage.warning('请填写监听器实现内容')
    return
  }
  if (listenerForm.onTransaction && !listenerSupportsTransaction.value) {
    ElMessage.warning('表达式和脚本监听器不支持事务阶段')
    return
  }
  if (!listenerForm.onTransaction && listenerForm.resolverType) {
    ElMessage.warning('自定义属性解析器只能用于事务监听器')
    return
  }
  if (listenerForm.resolverType && !listenerForm.resolverImplementation.trim()) {
    ElMessage.warning('请填写自定义属性解析器实现')
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
  if (!(await confirmDelete('确定删除这个监听器吗？', '删除监听器'))) return
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
    ElMessage.warning('表单字段标识不能为空')
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
  if (!(await confirmDelete('确定删除这个表单字段吗？', '删除表单字段'))) return
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
    ElMessage.warning('扩展属性名称和值不能为空')
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
  if (!(await confirmDelete('确定删除这个扩展属性吗？', '删除扩展属性'))) return
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
    ElMessage.warning('异常映射错误码不能为空')
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
  if (!(await confirmDelete(`确定删除错误码“${text(value.errorCode)}”的异常映射吗？`, '删除异常映射'))) {
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
    ElMessage.warning('字段名称不能为空')
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
  if (!(await confirmDelete('确定删除这个注入字段吗？', '删除字段'))) return
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
    ElMessage.warning('请输入来源变量或表达式')
    return
  }
  if (
    mappingForm.sourceType === 'variables' &&
    mappingForm.source.trim().toLowerCase() !== 'all'
  ) {
    ElMessage.warning('变量集合映射只支持 variables="all"')
    return
  }
  if (mappingForm.sourceType !== 'variables' && !mappingForm.target.trim()) {
    ElMessage.warning('普通输入/输出映射必须填写目标变量')
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
  if (!(await confirmDelete('确定删除这个变量映射吗？', '删除变量映射'))) return
  removeExtensionValue(props.modeler, props.element, mapping)
  emit('changed')
}

function mappingLabel(mapping: BpmnExtensionElement) {
  const source = mapping.sourceExpression || mapping.source || mapping.variables || '未配置'
  return `${source}${mapping.target ? ` → ${mapping.target}` : ''}`
}

function mappingTypeLabel(mapping: BpmnExtensionElement) {
  if (mapping.$type === 'flowable:EventInParameter') return 'flowable:eventInParameter'
  if (mapping.$type === 'flowable:EventOutParameter') return 'flowable:eventOutParameter'
  return mapping.$type === 'flowable:In' ? 'flowable:in' : 'flowable:out'
}

function listenerImplementationLabel(listener: BpmnExtensionElement) {
  if (listener.class) return `类：${listener.class}`
  if (listener.delegateExpression) return `代理表达式：${listener.delegateExpression}`
  if (listener.expression) return `表达式：${listener.expression}`
  if (listener.type === 'script') {
    const script = listener.script as BpmnExtensionElement | undefined
    return `脚本：${text(script?.language) || '未指定语言'}`
  }
  return '未配置'
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
          <div class="truncate text-sm font-600">{{ form.name || form.id || '未命名元素' }}</div>
          <div class="mt-1 text-xs text-gray-500">{{ elementTypeLabel }}</div>
        </div>
        <el-tag size="small" effect="plain">Flowable</el-tag>
      </div>

      <el-collapse v-model="activeSections">
        <el-collapse-item name="general" title="常规">
          <el-form label-position="top" size="small">
            <el-form-item label="标识（ID）" required>
              <el-input v-model="form.id" spellcheck="false" @change="updateId" />
            </el-form-item>
            <el-form-item label="名称">
              <el-input v-model="form.name" clearable @change="update({ name: form.name })" />
            </el-form-item>
            <el-form-item label="描述文档">
              <el-input
                v-model="form.documentation"
                type="textarea"
                :rows="3"
                resize="vertical"
                placeholder="说明此节点的业务含义"
                @change="updateDoc"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="isProcess" name="process" title="流程配置">
          <el-form label-position="top" size="small">
            <div class="switch-row">
              <span>可执行</span>
              <el-switch v-model="form.isExecutable" @change="update({ isExecutable: form.isExecutable })" />
            </div>
            <div class="switch-row">
              <span>预取执行树</span>
              <el-switch
                v-model="form.isEagerExecutionFetching"
                data-testid="process-eager-execution"
                @change="update({
                  'flowable:isEagerExecutionFetching': form.isEagerExecutionFetching || undefined,
                  'flowable:enableEagerExecutionTreeFetching': undefined,
                })"
              />
            </div>
            <el-form-item label="版本标签">
              <el-input
                v-model="form.versionTag"
                placeholder="例如：v1.0"
                @change="update({ 'flowable:versionTag': form.versionTag })"
              />
            </el-form-item>
            <el-form-item label="流程名称表达式（ProcessNameExp）">
              <el-input
                v-model="form.processNameExp"
                data-testid="process-name-exp"
                clearable
                placeholder="${form.title}"
                @change="updateProcessNameExp"
              />
            </el-form-item>
            <el-form-item label="候选启动用户">
              <el-input
                v-model="form.candidateStarterUsers"
                placeholder="多个用户用逗号分隔"
                @change="update({ 'flowable:candidateStarterUsers': form.candidateStarterUsers })"
              />
            </el-form-item>
            <el-form-item label="候选启动组">
              <el-input
                v-model="form.candidateStarterGroups"
                placeholder="多个组用逗号分隔"
                @change="update({ 'flowable:candidateStarterGroups': form.candidateStarterGroups })"
              />
            </el-form-item>
          </el-form>

          <div class="section-list-header">
            <span>全局事件定义</span>
          </div>
          <div class="definition-actions">
            <el-button
              size="small"
              data-testid="add-global-message"
              @click="openDefinitionDialog('message')"
            >
              添加消息
            </el-button>
            <el-button size="small" @click="openDefinitionDialog('signal')">添加信号</el-button>
            <el-button size="small" @click="openDefinitionDialog('error')">添加错误</el-button>
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
          <div v-else class="empty-inline mt-3">暂无消息、信号或错误定义</div>
        </el-collapse-item>

        <el-collapse-item v-if="isStartEvent" name="process" title="启动配置">
          <el-form label-position="top" size="small">
            <el-form-item label="发起人变量">
              <el-input
                v-model="form.initiator"
                placeholder="initiator"
                @change="update({ 'flowable:initiator': form.initiator })"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="isUserTask" name="assignment" title="人员分配">
          <el-form label-position="top" size="small">
            <el-form-item label="办理人">
              <el-input
                v-model="form.assignee"
                clearable
                placeholder="用户 ID 或 ${expression}"
                @change="update({ 'flowable:assignee': form.assignee })"
              />
            </el-form-item>
            <el-form-item label="任务所有者">
              <el-input
                v-model="form.owner"
                clearable
                placeholder="用户 ID 或表达式"
                @change="update({ 'flowable:owner': form.owner })"
              />
            </el-form-item>
            <el-form-item label="候选用户">
              <el-input
                v-model="form.candidateUsers"
                clearable
                placeholder="user1,user2 或 ${users}"
                @change="update({ 'flowable:candidateUsers': form.candidateUsers })"
              />
            </el-form-item>
            <el-form-item label="候选组">
              <el-input
                v-model="form.candidateGroups"
                clearable
                placeholder="group1,group2 或 ${groups}"
                @change="update({ 'flowable:candidateGroups': form.candidateGroups })"
              />
            </el-form-item>
            <div class="section-list-header">
              <span>自定义身份链接 <span class="section-count">{{ customResources.length }}</span></span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-custom-resource"
                @click="openCustomResourceDialog()"
              >
                添加
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
                    {{ text(getBusinessProperty(item, 'name')) || '未设置类型' }}
                  </div>
                  <div class="truncate text-xs text-gray-500">
                    {{ customResourceExpression(item) || '未设置分配表达式' }}
                  </div>
                </div>
                <el-button
                  link
                  :icon="Edit"
                  aria-label="编辑自定义身份链接"
                  @click="openCustomResourceDialog(item)"
                />
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  aria-label="删除自定义身份链接"
                  @click="removeCustomResource(item)"
                />
              </div>
            </div>
            <div v-else class="empty-inline mb-4">暂无自定义身份链接</div>
            <div class="metadata-divider">
              <span>参考系统业务分配元数据</span>
              <el-tag size="small" effect="plain">兼容扩展</el-tag>
            </div>
            <el-form-item label="业务分配模式">
              <el-select
                v-model="form.assignmentMode"
                data-testid="assignment-mode"
                class="w-full"
                @change="updateAssignmentMode"
              >
                <el-option label="仅使用基础字段" value="legacy" />
                <el-option label="静态分配 static" value="static" />
                <el-option label="身份目录 IDM" value="idm" />
              </el-select>
              <div class="form-help">
                模式只写入 AssigneeType；切换时不会清空办理人、候选人或另一模式的 JSON。
              </div>
              <div v-if="unsupportedAssignmentMode" class="json-error">
                导入了未识别的 AssigneeType：{{ unsupportedAssignmentMode }}。选择新模式后才会覆盖。
              </div>
            </el-form-item>

            <template v-if="form.assignmentMode === 'static'">
              <el-form-item label="StaticAssigneeVariables JSON">
                <el-input
                  v-model="extensionJson.staticAssigneeVariables"
                  data-testid="static-assignee-json"
                  class="code-input"
                  type="textarea"
                  :rows="5"
                  resize="vertical"
                  placeholder='[{"name":"审批人","tabKey":"user","value":"user01"}]'
                />
                <div v-if="extensionJsonErrors.staticAssigneeVariables" class="json-error">
                  {{ extensionJsonErrors.staticAssigneeVariables }}
                </div>
                <div class="json-editor-actions">
                  <el-button size="small" @click="formatJsonExtension('staticAssigneeVariables')">
                    格式化
                  </el-button>
                  <el-button
                    size="small"
                    data-testid="save-static-assignee-json"
                    @click="saveJsonExtension('staticAssigneeVariables')"
                  >
                    保存 JSON
                  </el-button>
                  <el-button
                    size="small"
                    type="primary"
                    plain
                    data-testid="sync-static-assignment"
                    @click="syncStaticAssignment"
                  >
                    同步到办理人
                  </el-button>
                </div>
              </el-form-item>
            </template>

            <template v-if="form.assignmentMode === 'idm'">
              <el-form-item label="IdmAssignee JSON">
                <el-input
                  v-model="extensionJson.idmAssignee"
                  class="code-input"
                  type="textarea"
                  :rows="4"
                  resize="vertical"
                  placeholder='[{"code":"user01","name":"张三"}]'
                />
                <div v-if="extensionJsonErrors.idmAssignee" class="json-error">
                  {{ extensionJsonErrors.idmAssignee }}
                </div>
                <div class="json-editor-actions">
                  <el-button size="small" @click="formatJsonExtension('idmAssignee')">格式化</el-button>
                  <el-button size="small" @click="saveJsonExtension('idmAssignee')">保存 JSON</el-button>
                </div>
              </el-form-item>
              <el-form-item label="IdmCandidateUsers JSON">
                <el-input
                  v-model="extensionJson.idmCandidateUsers"
                  class="code-input"
                  type="textarea"
                  :rows="4"
                  resize="vertical"
                  placeholder='[{"code":"user02","name":"李四"}]'
                />
                <div v-if="extensionJsonErrors.idmCandidateUsers" class="json-error">
                  {{ extensionJsonErrors.idmCandidateUsers }}
                </div>
                <div class="json-editor-actions">
                  <el-button size="small" @click="formatJsonExtension('idmCandidateUsers')">格式化</el-button>
                  <el-button size="small" @click="saveJsonExtension('idmCandidateUsers')">保存 JSON</el-button>
                </div>
              </el-form-item>
              <el-form-item label="IdmCandidateGroups JSON">
                <el-input
                  v-model="extensionJson.idmCandidateGroups"
                  class="code-input"
                  type="textarea"
                  :rows="4"
                  resize="vertical"
                  placeholder='[{"sn":"finance","name":"财务组"}]'
                />
                <div v-if="extensionJsonErrors.idmCandidateGroups" class="json-error">
                  {{ extensionJsonErrors.idmCandidateGroups }}
                </div>
                <div class="json-editor-actions">
                  <el-button size="small" @click="formatJsonExtension('idmCandidateGroups')">格式化</el-button>
                  <el-button size="small" @click="saveJsonExtension('idmCandidateGroups')">保存 JSON</el-button>
                </div>
              </el-form-item>
              <el-button class="mb-4 w-full" type="primary" plain @click="syncIdmAssignment">
                同步 IDM code/sn 到基础分配字段
              </el-button>
            </template>
            <div class="two-column">
              <el-form-item label="到期时间">
                <el-input
                  v-model="form.dueDate"
                  placeholder="P3D 或 ${dueDate}"
                  @change="update({ 'flowable:dueDate': form.dueDate })"
                />
              </el-form-item>
              <el-form-item label="优先级">
                <el-input
                  v-model="form.priority"
                  placeholder="50"
                  @change="update({ 'flowable:priority': form.priority })"
                />
              </el-form-item>
            </div>
            <el-form-item label="业务日历">
              <el-input
                v-model="form.businessCalendarName"
                @change="update({ 'flowable:businessCalendarName': form.businessCalendarName })"
              />
            </el-form-item>
            <el-form-item label="分类">
              <el-input
                v-model="form.category"
                @change="update({ 'flowable:category': form.category })"
              />
            </el-form-item>
            <el-form-item label="任务 ID 变量">
              <el-input
                v-model="form.taskIdVariableName"
                @change="update({ 'flowable:taskIdVariableName': form.taskIdVariableName })"
              />
            </el-form-item>
            <el-form-item label="完成人变量">
              <el-input
                v-model="form.taskCompleterVariableName"
                @change="update({ 'flowable:taskCompleterVariableName': form.taskCompleterVariableName })"
              />
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="isUserTask" name="freeApproval">
          <template #title>
            <span class="collapse-title">自由审批 <span class="section-count">{{ freeApprovalCount }}</span></span>
          </template>
          <el-tabs v-model="freeApprovalMode" class="node-form-tabs">
            <el-tab-pane label="结构化配置" name="structured">
              <el-alert
                v-if="nextUserStructuredError || nextSequenceFlowStructuredError"
                class="mb-3"
                type="warning"
                :closable="false"
                show-icon
                :title="nextUserStructuredError || nextSequenceFlowStructuredError"
              />
              <div class="section-list-header">
                <span>下一审批人 <span class="section-count">{{ structuredNextUsers.length }}</span></span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-next-user"
                  @click="openFreeApprovalDialog('nextUser')"
                >
                  添加
                </el-button>
              </div>
              <div v-if="structuredNextUsers.length" class="item-list">
                <div
                  v-for="(item, index) in structuredNextUsers"
                  :key="String(item.code || index)"
                  class="list-item"
                  data-testid="next-user-row"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{{ item.name || item.code }}</div>
                    <div class="truncate text-xs text-gray-500">{{ item.code }}</div>
                  </div>
                  <el-tag v-if="booleanValue(item.multiple)" size="small" effect="plain">多选</el-tag>
                  <el-button link :icon="Edit" aria-label="编辑下一审批人" @click="openFreeApprovalDialog('nextUser', index)" />
                  <el-button link type="danger" :icon="Delete" aria-label="删除下一审批人" @click="removeFreeApprovalRecord('nextUser', index)" />
                </div>
              </div>
              <div v-else class="empty-inline">暂无下一审批人配置</div>

              <div class="section-list-header mt-4!">
                <span>下一流转 <span class="section-count">{{ structuredNextSequenceFlows.length }}</span></span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-next-sequence-flow"
                  @click="openFreeApprovalDialog('nextSequenceFlow')"
                >
                  添加
                </el-button>
              </div>
              <div v-if="structuredNextSequenceFlows.length" class="item-list">
                <div
                  v-for="(item, index) in structuredNextSequenceFlows"
                  :key="String(item.code || index)"
                  class="list-item"
                  data-testid="next-sequence-flow-row"
                >
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-sm">{{ item.name || item.code }}</div>
                    <div class="truncate text-xs text-gray-500">{{ item.code }}</div>
                  </div>
                  <el-button link :icon="Edit" aria-label="编辑下一流转" @click="openFreeApprovalDialog('nextSequenceFlow', index)" />
                  <el-button link type="danger" :icon="Delete" aria-label="删除下一流转" @click="removeFreeApprovalRecord('nextSequenceFlow', index)" />
                </div>
              </div>
              <div v-else class="empty-inline">暂无下一流转配置</div>
            </el-tab-pane>
            <el-tab-pane label="高级 JSON" name="json">
              <el-form label-position="top" size="small">
                <el-form-item label="NextUser JSON（下一审批人）">
                  <el-input
                    v-model="extensionJson.nextUser"
                    data-testid="next-user-json"
                    class="code-input"
                    type="textarea"
                    :rows="5"
                    resize="vertical"
                    placeholder='[{"name":"指定审批人","code":"nextApprover","multiple":false}]'
                  />
                  <div v-if="extensionJsonErrors.nextUser" class="json-error">
                    {{ extensionJsonErrors.nextUser }}
                  </div>
                  <div class="json-editor-actions">
                    <el-button size="small" @click="formatJsonExtension('nextUser')">格式化</el-button>
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      data-testid="save-next-user-json"
                      @click="saveJsonExtension('nextUser')"
                    >
                      保存 JSON
                    </el-button>
                  </div>
                </el-form-item>
                <el-form-item label="NextSequenceFlow JSON（下一流转）">
                  <el-input
                    v-model="extensionJson.nextSequenceFlow"
                    data-testid="next-sequence-flow-json"
                    class="code-input"
                    type="textarea"
                    :rows="5"
                    resize="vertical"
                    placeholder='[{"name":"同意","code":"Flow_approved"}]'
                  />
                  <div v-if="extensionJsonErrors.nextSequenceFlow" class="json-error">
                    {{ extensionJsonErrors.nextSequenceFlow }}
                  </div>
                  <div class="json-editor-actions">
                    <el-button size="small" @click="formatJsonExtension('nextSequenceFlow')">格式化</el-button>
                    <el-button size="small" type="primary" plain @click="saveJsonExtension('nextSequenceFlow')">
                      保存 JSON
                    </el-button>
                  </div>
                </el-form-item>
              </el-form>
            </el-tab-pane>
          </el-tabs>
        </el-collapse-item>

        <el-collapse-item
          v-if="isServiceTask || isScriptTask || isCallActivity"
          name="implementation"
          title="任务实现"
        >
          <el-form v-if="isServiceTask" label-position="top" size="small">
            <el-form-item label="实现方式" required>
              <el-select
                v-model="form.implementationType"
                class="w-full"
                data-testid="service-implementation-type"
                @change="changeImplementationType"
              >
                <el-option label="Java 类" value="class" />
                <el-option label="表达式" value="expression" />
                <el-option label="代理表达式" value="delegateExpression" />
                <el-option label="Flowable 内置类型" value="type" />
              </el-select>
            </el-form-item>
            <el-form-item label="实现内容" required>
              <el-select
                v-if="form.implementationType === 'type'"
                v-model="form.implementation"
                class="w-full"
                data-testid="service-built-in-type"
                placeholder="请选择内置服务类型"
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
            <el-form-item v-if="isExternalWorker" label="主题" required>
              <el-input
                v-model="form.serviceTopic"
                data-testid="external-worker-topic"
                placeholder="${topic}"
                @change="updateExternalWorkerTopic"
              />
            </el-form-item>
            <template v-if="form.implementationType === 'type' && activeServiceFields.length">
              <div class="preset-divider">
                <span>{{ form.implementation.toUpperCase() }} 参数</span>
                <span>保存为 flowable:field</span>
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
                <div class="form-help">字段名：{{ spec.name }} · {{ spec.valueType }}</div>
              </el-form-item>
            </template>
            <template v-if="isSendEventServiceTask">
              <div class="preset-divider">
                <span>Event Registry 参数</span>
                <span>Flowable 原生扩展</span>
              </div>
              <el-form-item label="事件类型" required>
                <el-input
                  v-model="form.serviceEventType"
                  data-testid="send-event-type"
                  placeholder="order.updated"
                  @change="updateServiceExtensionBody('flowable:EventType', form.serviceEventType)"
                />
              </el-form-item>
              <el-form-item label="触发回调事件类型">
                <el-input
                  v-model="form.serviceTriggerEventType"
                  data-testid="send-event-trigger-type"
                  placeholder="order.acknowledged"
                  @change="updateServiceExtensionBody('flowable:TriggerEventType', form.serviceTriggerEventType)"
                />
              </el-form-item>
              <el-form-item label="出站通道 Key" :required="!form.serviceSystemChannel">
                <el-input
                  v-model="form.serviceChannelKey"
                  data-testid="send-event-channel-key"
                  :disabled="form.serviceSystemChannel"
                  placeholder="outbound-orders"
                  @change="updateServiceExtensionBody('flowable:ChannelKey', form.serviceChannelKey)"
                />
              </el-form-item>
              <div class="switch-row">
                <span>使用系统通道</span>
                <el-switch
                  v-model="form.serviceSystemChannel"
                  data-testid="send-event-system-channel"
                  @change="updateServiceSystemChannel"
                />
              </div>
              <div class="switch-row">
                <span>同步发送</span>
                <el-switch
                  v-model="form.serviceSendSynchronously"
                  data-testid="send-event-synchronously"
                  @change="updateServiceExtensionBody('flowable:SendSynchronously', form.serviceSendSynchronously ? 'true' : '')"
                />
              </div>
            </template>
            <template v-if="isSendEventServiceTask">
              <div class="preset-divider">
                <span>事件变量映射</span>
                <span>eventIn / eventOut</span>
              </div>
              <div class="section-list-header">
                <span>输入参数</span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-input-mapping"
                  @click="openMappingDialog('eventIn')"
                >添加</el-button>
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
                      <span v-if="item.transient"> · 瞬态</span>
                    </div>
                  </div>
                  <el-button link :icon="Edit" aria-label="编辑输入参数" @click="openMappingDialog('eventIn', item)" />
                  <el-button link type="danger" :icon="Delete" aria-label="删除输入参数" @click="removeMapping(item)" />
                </div>
              </div>
              <div v-else class="empty-inline">暂无输入参数</div>

              <div class="section-list-header mt-4!">
                <span>输出参数</span>
                <el-button
                  link
                  type="primary"
                  :icon="Plus"
                  data-testid="add-output-mapping"
                  @click="openMappingDialog('eventOut')"
                >添加</el-button>
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
                      <span v-if="item.transient"> · 瞬态</span>
                    </div>
                  </div>
                  <el-button link :icon="Edit" aria-label="编辑输出参数" @click="openMappingDialog('eventOut', item)" />
                  <el-button link type="danger" :icon="Delete" aria-label="删除输出参数" @click="removeMapping(item)" />
                </div>
              </div>
              <div v-else class="empty-inline">暂无输出参数</div>
            </template>
            <el-form-item v-if="form.implementationType === 'expression'" label="结果变量">
              <el-input
                v-model="form.resultVariableName"
                data-testid="service-result-variable"
                @change="updateServiceResultVariable"
              />
            </el-form-item>
            <template v-if="form.implementationType === 'expression' && form.resultVariableName">
              <div class="switch-row">
                <span>结果写入局部作用域</span>
                <el-switch
                  v-model="form.useLocalScopeForResultVariable"
                  data-testid="service-result-local-scope"
                  @change="updateServiceResultVariable"
                />
              </div>
              <div class="switch-row">
                <span>结果存为瞬态变量</span>
                <el-switch
                  v-model="form.storeResultVariableAsTransient"
                  data-testid="service-result-transient"
                  @change="updateServiceResultVariable"
                />
              </div>
            </template>
            <div class="switch-row">
              <span>可触发</span>
              <el-switch
                v-model="form.triggerable"
                @change="update({ 'flowable:triggerable': form.triggerable || undefined })"
              />
            </div>
          </el-form>

          <el-form v-if="isScriptTask" label-position="top" size="small">
            <el-form-item label="脚本格式" required>
              <el-input
                v-model="form.scriptFormat"
                placeholder="groovy / javascript"
                @change="update({ scriptFormat: form.scriptFormat })"
              />
            </el-form-item>
            <el-form-item label="脚本内容" required>
              <el-input
                v-model="form.script"
                type="textarea"
                :rows="7"
                class="code-input"
                @change="update({ script: form.script })"
              />
            </el-form-item>
            <el-form-item label="结果变量">
              <el-input
                v-model="form.scriptResultVariable"
                @change="update({ 'flowable:resultVariable': form.scriptResultVariable })"
              />
            </el-form-item>
          </el-form>

          <el-form v-if="isCallActivity" label-position="top" size="small">
            <el-form-item label="被调用流程类型" :error="calledElementTypeError">
              <el-segmented
                v-model="form.calledElementType"
                :options="calledElementTypeOptions"
                class="call-type-segmented"
                data-testid="call-activity-called-element-type"
                @change="updateCalledElementType"
              />
            </el-form-item>
            <el-form-item
              :label="form.calledElementType === 'id' ? '流程定义 ID' : '流程定义 Key'"
              required
            >
              <el-input
                v-model="form.calledElement"
                data-testid="call-activity-called-element"
                :placeholder="form.calledElementType === 'id' ? 'processDefinitionId 或 ${processDefinitionId}' : 'processKey 或 ${processKey}'"
                @change="update({ calledElement: form.calledElement })"
              />
            </el-form-item>
            <el-form-item label="实例名称">
              <el-input
                v-model="form.processInstanceName"
                @change="update({ 'flowable:processInstanceName': form.processInstanceName })"
              />
            </el-form-item>
            <el-form-item label="子流程实例 ID 变量">
              <el-input
                v-model="form.idVariableName"
                data-testid="call-activity-id-variable-name"
                placeholder="childProcessInstanceId 或 ${idVariableName}"
                @change="update({ 'flowable:idVariableName': form.idVariableName })"
              />
            </el-form-item>
            <el-form-item label="业务键">
              <el-input
                v-model="form.businessKey"
                @change="update({ 'flowable:businessKey': form.businessKey })"
              />
            </el-form-item>
            <div class="switch-row">
              <span>继承流程变量</span>
              <el-switch
                v-model="form.inheritVariables"
                data-testid="call-activity-inherit-variables"
                @change="update({ 'flowable:inheritVariables': form.inheritVariables || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>继承业务键</span>
              <el-switch
                v-model="form.inheritBusinessKey"
                @change="update({ 'flowable:inheritBusinessKey': form.inheritBusinessKey || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>同部署查找流程</span>
              <el-switch
                v-model="form.callSameDeployment"
                data-testid="call-activity-same-deployment"
                @change="update({ 'flowable:sameDeployment': form.callSameDeployment || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>输出参数写入局部作用域</span>
              <el-switch
                v-model="form.useLocalScopeForOutParameters"
                data-testid="call-activity-local-out"
                @change="update({ 'flowable:useLocalScopeForOutParameters': form.useLocalScopeForOutParameters || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>异步完成调用活动</span>
              <el-switch
                v-model="form.completeAsync"
                data-testid="call-activity-complete-async"
                @change="update({ 'flowable:completeAsync': form.completeAsync || undefined })"
              />
            </div>
            <div class="switch-row">
              <span>回退到默认租户</span>
              <el-switch
                v-model="form.fallbackToDefaultTenant"
                @change="update({ 'flowable:fallbackToDefaultTenant': form.fallbackToDefaultTenant || undefined })"
              />
            </div>

            <div class="section-list-header mt-3!">
              <span>输入参数</span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-input-mapping"
                @click="openMappingDialog('in')"
              >添加</el-button>
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
                    flowable:in<span v-if="item.transient"> · 已导入 transient（按普通变量处理）</span>
                  </div>
                </div>
                <el-button link :icon="Edit" aria-label="编辑输入参数" @click="openMappingDialog('in', item)" />
                <el-button link type="danger" :icon="Delete" aria-label="删除输入参数" @click="removeMapping(item)" />
              </div>
            </div>
            <div v-else class="empty-inline">暂无输入参数</div>

            <div class="section-list-header mt-4!">
              <span>输出参数</span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                data-testid="add-output-mapping"
                @click="openMappingDialog('out')"
              >添加</el-button>
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
                    flowable:out<span v-if="item.transient"> · 已导入 transient（按普通变量处理）</span>
                  </div>
                </div>
                <el-button link :icon="Edit" aria-label="编辑输出参数" @click="openMappingDialog('out', item)" />
                <el-button link type="danger" :icon="Delete" aria-label="删除输出参数" @click="removeMapping(item)" />
              </div>
            </div>
            <div v-else class="empty-inline">暂无输出参数</div>
          </el-form>
        </el-collapse-item>

        <el-collapse-item
          v-if="isBpmnEvent"
          name="event"
          title="事件配置"
        >
          <el-form label-position="top" size="small">
            <div v-if="isBoundaryEvent" class="switch-row">
              <div>
                <div>中断附着活动</div>
                <div class="text-xs text-gray-400">关闭后作为非中断边界事件</div>
              </div>
              <el-switch
                v-model="form.cancelActivity"
                @change="update({ cancelActivity: form.cancelActivity })"
              />
            </div>
            <div v-if="isStartEvent && eventDefinition" class="switch-row">
              <div>
                <div>中断事件子流程</div>
                <div class="text-xs text-gray-400">仅事件子流程开始事件生效</div>
              </div>
              <el-switch
                v-model="form.isInterrupting"
                @change="update({ isInterrupting: form.isInterrupting })"
              />
            </div>

            <template v-if="isTimerEvent">
              <el-form-item label="定时器类型" required>
                <el-select v-model="form.timerType" class="w-full" @change="updateTimerDefinition">
                  <el-option label="持续时间（timeDuration）" value="timeDuration" />
                  <el-option label="指定时间（timeDate）" value="timeDate" />
                  <el-option label="循环周期（timeCycle）" value="timeCycle" />
                </el-select>
              </el-form-item>
              <el-form-item label="定时表达式" required>
                <el-input
                  v-model="form.timerExpression"
                  data-testid="timer-expression"
                  :placeholder="form.timerType === 'timeCycle' ? 'R3/PT10M 或 ${cycle}' : 'PT30M 或 ${duration}'"
                  @change="updateTimerExpression"
                />
              </el-form-item>
              <el-form-item v-if="form.timerType === 'timeCycle'" label="循环结束时间">
                <el-input
                  v-model="form.timerEndDate"
                  data-testid="timer-end-date"
                  placeholder="2026-12-31T23:59:59Z 或 ${endDate}"
                  @change="updateTimerEndDate"
                />
              </el-form-item>
              <el-form-item label="业务日历">
                <el-input
                  v-model="form.timerBusinessCalendarName"
                  data-testid="timer-business-calendar"
                  placeholder="例如：workCalendar 或 ${calendarName}"
                  @change="updateTimerBusinessCalendar"
                />
              </el-form-item>
            </template>

            <el-form-item v-else-if="isConditionalEvent" label="条件表达式" required>
              <el-input
                v-model="form.conditionalExpression"
                type="textarea"
                :rows="3"
                placeholder="${orderAmount > 1000}"
                @change="updateConditionalDefinition"
              />
            </el-form-item>

            <template v-else-if="isMessageEvent">
              <el-form-item label="全局消息引用">
                <el-select
                  v-model="form.messageRef"
                  data-testid="event-message-ref"
                  clearable
                  class="w-full"
                  placeholder="请选择 bpmn:message"
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
                  请先在流程配置中添加全局消息。
                </div>
              </el-form-item>
              <el-form-item label="消息表达式">
                <el-input
                  v-model="form.messageExpression"
                  placeholder="${dynamicMessage}"
                  @change="updateEventDefinition({ 'flowable:messageExpression': form.messageExpression || undefined })"
                />
                <div class="form-help">与全局消息引用二选一；Flowable 6.8 会在运行时计算该表达式。</div>
              </el-form-item>
            </template>

            <template v-else-if="isSignalEvent">
              <el-form-item label="全局信号引用">
                <el-select
                  v-model="form.signalRef"
                  data-testid="event-signal-ref"
                  clearable
                  class="w-full"
                  placeholder="请选择 bpmn:signal"
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
                  请先在流程配置中添加全局信号。
                </div>
              </el-form-item>
              <el-form-item label="信号表达式">
                <el-input
                  v-model="form.signalExpression"
                  placeholder="${dynamicSignal}"
                  @change="updateEventDefinition({ 'flowable:signalExpression': form.signalExpression || undefined })"
                />
                <div class="form-help">与全局信号引用二选一。</div>
              </el-form-item>
              <div class="switch-row">
                <span>异步处理信号</span>
                <el-switch
                  v-model="form.signalAsync"
                  @change="updateEventDefinition({ 'flowable:async': form.signalAsync || undefined })"
                />
              </div>
            </template>

            <template v-else-if="isErrorEvent">
              <el-form-item label="全局错误引用" :required="isThrowingEvent">
                <el-select
                  v-model="form.errorRef"
                  data-testid="event-error-ref"
                  clearable
                  class="w-full"
                  placeholder="请选择 bpmn:error"
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
                  请先在流程配置中添加全局错误。
                </div>
                <div v-else-if="!isThrowingEvent" class="form-help">
                  捕获事件可以不指定错误，作为低优先级的 catch-all 处理器。
                </div>
              </el-form-item>
              <el-form-item label="错误变量名">
                <el-input
                  v-model="form.errorVariableName"
                  placeholder="caughtErrorCode"
                  @change="updateErrorVariableConfiguration"
                />
              </el-form-item>
              <div v-if="form.errorVariableName" class="switch-row">
                <span>瞬态变量</span>
                <el-switch
                  v-model="form.errorVariableTransient"
                  @change="updateErrorVariableConfiguration"
                />
              </div>
              <div v-if="form.errorVariableName" class="switch-row">
                <span>仅局部作用域</span>
                <el-switch
                  v-model="form.errorVariableLocalScope"
                  @change="updateErrorVariableConfiguration"
                />
              </div>
            </template>

            <div v-else-if="!eventDefinition" class="empty-inline">
              当前为普通事件。可通过节点旁扳手菜单切换消息、定时、错误、信号等事件类型。
            </div>
          </el-form>
        </el-collapse-item>

        <el-collapse-item
          v-if="isSequenceFlow || supportsDefaultFlow"
          name="flow"
          title="流转配置"
        >
          <el-form label-position="top" size="small">
            <el-form-item v-if="isSequenceFlow" label="条件表达式">
              <el-input
                v-model="form.conditionExpression"
                type="textarea"
                :rows="3"
                placeholder="${approved == true}"
                @change="updateConditionExpression"
              />
              <div class="form-help">默认流转路径不能同时设置条件。</div>
            </el-form-item>
            <el-form-item v-if="supportsDefaultFlow" label="默认流转路径">
              <el-select
                v-model="form.defaultFlow"
                clearable
                class="w-full"
                placeholder="请选择出口连线"
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

        <el-collapse-item v-if="supportsMultiInstance" name="multiInstance" title="多实例">
          <el-form label-position="top" size="small">
            <el-form-item label="多实例类型">
              <el-select
                v-model="form.multiType"
                class="w-full"
                data-testid="multi-instance-type"
                @change="updateMultiInstance"
              >
                <el-option label="无" value="none" />
                <el-option label="并行多实例" value="parallel" />
                <el-option label="串行多实例" value="sequential" />
              </el-select>
            </el-form-item>
            <template v-if="form.multiType !== 'none'">
              <el-form-item label="循环来源">
                <el-radio-group
                  v-model="form.multiSource"
                  @change="updateMultiInstance"
                >
                  <el-radio-button value="collection">集合</el-radio-button>
                  <el-radio-button value="cardinality">基数</el-radio-button>
                </el-radio-group>
              </el-form-item>
              <div v-if="multiInstanceCollectionHandler" class="form-help mb-3">
                当前使用自定义集合处理器；编辑不会移除处理器或变量聚合配置。
              </div>
              <template v-if="form.multiSource === 'collection' || multiInstanceCollectionHandler">
                <el-form-item
                  :label="form.multiSource === 'cardinality' ? '集合处理器输入' : '集合表达式'"
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
                  <el-form-item label="元素变量">
                    <el-input
                      v-model="form.elementVariable"
                      placeholder="participant"
                      @change="updateMultiInstance"
                    />
                  </el-form-item>
                  <el-form-item label="索引变量">
                    <el-input
                      v-model="form.elementIndexVariable"
                      placeholder="loopCounter"
                      @change="updateMultiInstance"
                    />
                  </el-form-item>
                </div>
              </template>
              <el-form-item v-if="form.multiSource === 'cardinality'" label="循环基数" required>
                <el-input
                  v-model="form.loopCardinality"
                  placeholder="3 或 ${count}"
                  @change="updateMultiInstance"
                />
              </el-form-item>
              <el-form-item label="完成条件">
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

        <el-collapse-item v-if="supportsForm" name="form" title="表单配置">
          <el-form label-position="top" size="small">
            <el-form-item label="表单标识">
              <el-input
                v-model="form.formKey"
                placeholder="表单 key 或表达式"
                @change="update({ 'flowable:formKey': form.formKey })"
              />
            </el-form-item>
            <div class="switch-row">
              <span>表单字段校验</span>
              <el-switch
                v-model="form.formFieldValidation"
                @change="update({ 'flowable:formFieldValidation': form.formFieldValidation })"
              />
            </div>
            <div class="switch-row">
              <span>同部署查找表单</span>
              <el-switch
                v-model="form.sameDeployment"
                @change="update({ 'flowable:sameDeployment': form.sameDeployment ? undefined : false })"
              />
            </div>
            <div class="metadata-divider">
              <span>外部表单选择元数据</span>
              <el-tag size="small" effect="plain">NodeFormExp</el-tag>
            </div>
            <el-tabs v-model="nodeFormMode" class="node-form-tabs">
              <el-tab-pane label="已选表单" name="selection">
                <el-alert
                  v-if="nodeFormStructuredError"
                  class="mb-3"
                  type="warning"
                  :closable="false"
                  show-icon
                  :title="nodeFormStructuredError"
                />
                <div class="section-list-header">
                  <span>表单 <span class="section-count">{{ selectedNodeForms.length }}</span></span>
                  <div class="flex items-center gap-1">
                    <el-button
                      v-if="hostAdapter?.selectNodeForms"
                      link
                      type="primary"
                      :icon="Search"
                      :loading="nodeFormHostLoading"
                      data-testid="select-node-forms-from-host"
                      @click="selectNodeFormsFromHost"
                    >
                      从表单库选择
                    </el-button>
                    <el-button
                      link
                      type="primary"
                      :icon="Plus"
                      :disabled="selectedNodeForms.length >= 1"
                      data-testid="add-node-form"
                      @click="openNodeFormDialog()"
                    >
                      添加
                    </el-button>
                  </div>
                </div>
                <div v-if="selectedNodeForms.length" class="item-list">
                  <div
                    v-for="(item, index) in selectedNodeForms"
                    :key="String(item.code || index)"
                    class="list-item"
                    data-testid="node-form-row"
                  >
                    <div class="min-w-0 flex-1">
                      <div class="truncate text-sm">{{ item.name || item.code || '未命名表单' }}</div>
                      <div class="truncate text-xs text-gray-500">
                        {{ item.code || '未设置 code' }}<template v-if="item.categoryName"> · {{ item.categoryName }}</template>
                      </div>
                    </div>
                    <el-button
                      link
                      :icon="Edit"
                      aria-label="编辑表单"
                      @click="openNodeFormDialog(index)"
                    />
                    <el-button
                      link
                      type="danger"
                      :icon="Delete"
                      aria-label="移除表单"
                      @click="removeNodeFormRecord(index)"
                    />
                  </div>
                </div>
                <div v-else class="empty-inline">暂无已选表单</div>
                <div v-if="selectedNodeForms.length" class="node-form-actions">
                  <el-button
                    size="small"
                    data-testid="sync-node-form-key"
                    @click="syncNodeFormKey"
                  >
                    同步首项 code 到 formKey
                  </el-button>
                </div>
              </el-tab-pane>
              <el-tab-pane label="高级 JSON" name="json">
                <el-form-item label="NodeFormExp JSON">
                  <el-input
                    v-model="extensionJson.nodeFormExp"
                    data-testid="node-form-exp-json"
                    class="code-input"
                    type="textarea"
                    :rows="6"
                    resize="vertical"
                    placeholder='[{"code":"leaveForm","name":"请假申请表"}]'
                  />
                  <div v-if="extensionJsonErrors.nodeFormExp" class="json-error">
                    {{ extensionJsonErrors.nodeFormExp }}
                  </div>
                  <div class="json-editor-actions">
                    <el-button size="small" @click="formatJsonExtension('nodeFormExp')">格式化</el-button>
                    <el-button
                      size="small"
                      type="primary"
                      plain
                      data-testid="save-node-form-exp-json"
                      @click="saveJsonExtension('nodeFormExp')"
                    >
                      保存 JSON
                    </el-button>
                  </div>
                </el-form-item>
              </el-tab-pane>
            </el-tabs>
            <div class="form-help">
              字段权限由宿主适配器单独读取和保存，不写入 BPMN XML。
            </div>
          </el-form>

          <div class="section-list-header">
            <span>内嵌表单字段</span>
            <el-button link type="primary" :icon="Plus" @click="openFormPropertyDialog()">添加</el-button>
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
          <el-empty v-else :image-size="42" description="暂无内嵌字段" />
        </el-collapse-item>

        <el-collapse-item
          v-if="isUserTask || isCallActivity || supportsMultiInstance"
          name="businessExtensions"
          title="业务扩展 JSON"
        >
          <el-alert
            class="mb-3"
            type="info"
            :closable="false"
            show-icon
            title="编辑器只校验 JSON 语法与顶层结构，不会删除未知业务字段。"
          />
          <el-form label-position="top" size="small">
            <el-form-item v-if="isUserTask || isCallActivity" label="ModelBpmnExtension JSON">
              <el-input
                v-model="extensionJson.modelBpmnExtension"
                class="code-input"
                type="textarea"
                :rows="5"
                resize="vertical"
                placeholder='{"version":1,"options":{}}'
              />
              <div v-if="extensionJsonErrors.modelBpmnExtension" class="json-error">
                {{ extensionJsonErrors.modelBpmnExtension }}
              </div>
              <div class="json-editor-actions">
                <el-button size="small" @click="formatJsonExtension('modelBpmnExtension')">格式化</el-button>
                <el-button size="small" type="primary" plain @click="saveJsonExtension('modelBpmnExtension')">
                  保存 JSON
                </el-button>
              </div>
            </el-form-item>
            <el-form-item v-if="supportsMultiInstance" label="MultiInstanceVariables JSON">
              <el-input
                v-model="extensionJson.multiInstanceVariables"
                class="code-input"
                type="textarea"
                :rows="5"
                resize="vertical"
                placeholder='{"collection":"participants","elementVariable":"participant"}'
              />
              <div v-if="extensionJsonErrors.multiInstanceVariables" class="json-error">
                {{ extensionJsonErrors.multiInstanceVariables }}
              </div>
              <div class="json-editor-actions">
                <el-button size="small" @click="formatJsonExtension('multiInstanceVariables')">格式化</el-button>
                <el-button size="small" type="primary" plain @click="saveJsonExtension('multiInstanceVariables')">
                  保存 JSON
                </el-button>
              </div>
            </el-form-item>
          </el-form>
        </el-collapse-item>

        <el-collapse-item v-if="supportsMapExceptions" name="mapExceptions">
          <template #title>
            <span class="collapse-title">
              异常映射 <span class="section-count">{{ mapExceptions.length }}</span>
            </span>
          </template>
          <div class="section-list-header">
            <span>Flowable 异常映射</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-map-exception"
              @click="openMapExceptionDialog()"
            >
              添加
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
                  <span class="truncate text-sm">{{ item.errorCode || '未设置错误码' }}</span>
                  <el-tag
                    v-if="booleanValue(item.includeChildExceptions)"
                    size="small"
                    effect="plain"
                  >
                    含子类
                  </el-tag>
                </div>
                <div class="truncate text-xs text-gray-500">
                  {{ item.class || '默认映射' }}
                  <template v-if="item.rootCause"> · 根因 {{ item.rootCause }}</template>
                </div>
              </div>
              <el-button
                link
                :icon="ArrowUp"
                :disabled="index === 0"
                aria-label="上移异常映射"
                @click="moveMapException(index, -1)"
              />
              <el-button
                link
                :icon="ArrowDown"
                :disabled="index === mapExceptions.length - 1"
                aria-label="下移异常映射"
                @click="moveMapException(index, 1)"
              />
              <el-button
                link
                :icon="Edit"
                aria-label="编辑异常映射"
                @click="openMapExceptionDialog(item)"
              />
              <el-button
                link
                type="danger"
                :icon="Delete"
                aria-label="删除异常映射"
                @click="removeMapException(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">暂无异常映射</div>
        </el-collapse-item>

        <el-collapse-item name="extensionProperties">
          <template #title>
            <span class="collapse-title">扩展属性 <span class="section-count">{{ extensionProperties.length }}</span></span>
          </template>
          <div class="section-list-header">
            <span>Flowable 属性</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-extension-property"
              @click="openExtensionPropertyDialog()"
            >
              添加
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
              <el-button link :icon="Edit" aria-label="编辑扩展属性" @click="openExtensionPropertyDialog(item)" />
              <el-button
                link
                type="danger"
                :icon="Delete"
                aria-label="删除扩展属性"
                @click="removeExtensionProperty(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">暂无扩展属性</div>
        </el-collapse-item>

        <el-collapse-item v-if="supportsListeners" name="listeners">
          <template #title>
            <span class="collapse-title">监听器 <span class="section-count">{{ listenerCount }}</span></span>
          </template>
          <div class="section-list-header">
            <span>执行监听器 <span class="section-count">{{ executionListeners.length }}</span></span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              @click="openListenerDialog('executionListener')"
            >
              添加
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
                <div class="text-sm">{{ item.event || '未设置事件' }}</div>
                <div class="truncate text-xs text-gray-500">{{ listenerImplementationLabel(item) }}</div>
              </div>
              <el-button
                link
                :icon="Edit"
                aria-label="编辑执行监听器"
                @click="openListenerDialog('executionListener', item)"
              />
              <el-button
                link
                type="danger"
                :icon="Delete"
                aria-label="删除执行监听器"
                @click="removeListener(item)"
              />
            </div>
          </div>
          <div v-else class="empty-inline">暂无执行监听器</div>

          <template v-if="isUserTask">
            <div class="section-list-header mt-4!">
              <span>任务监听器 <span class="section-count">{{ taskListeners.length }}</span></span>
              <el-button
                link
                type="primary"
                :icon="Plus"
                @click="openListenerDialog('taskListener')"
              >
                添加
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
                  <div class="text-sm">{{ item.event || '未设置事件' }}</div>
                  <div class="truncate text-xs text-gray-500">{{ listenerImplementationLabel(item) }}</div>
                </div>
                <el-button
                  link
                  :icon="Edit"
                  aria-label="编辑任务监听器"
                  @click="openListenerDialog('taskListener', item)"
                />
                <el-button
                  link
                  type="danger"
                  :icon="Delete"
                  aria-label="删除任务监听器"
                  @click="removeListener(item)"
                />
              </div>
            </div>
            <div v-else class="empty-inline">暂无任务监听器</div>
          </template>
        </el-collapse-item>

        <el-collapse-item
          v-if="isServiceTask || executionListeners.length || injectedFields.length"
          name="fields"
          title="字段注入"
        >
          <div class="section-list-header">
            <span>扩展字段</span>
            <el-button link type="primary" :icon="Plus" @click="openFieldDialog()">添加</el-button>
          </div>
          <div v-if="injectedFields.length" class="item-list">
            <div v-for="item in injectedFields" :key="String(item.name)" class="list-item">
              <div class="min-w-0 flex-1">
                <div class="text-sm">{{ item.name }}</div>
                <div class="truncate text-xs text-gray-500">
                  {{ item.expression ? '表达式' : '字符串' }}：{{ item.expression || item.string || item.stringValue }}
                </div>
              </div>
              <el-button link :icon="Edit" @click="openFieldDialog(item)" />
              <el-button link type="danger" :icon="Delete" @click="removeField(item)" />
            </div>
          </div>
          <div v-else class="empty-inline">暂无扩展字段</div>
        </el-collapse-item>

        <el-collapse-item
          v-if="supportsAsync || isUserTask || isServiceTask || supportsFailedJobRetryTimeCycle"
          name="advanced"
          title="高级配置"
        >
          <el-form label-position="top" size="small">
            <template v-if="supportsAsync">
              <div class="switch-row">
                <span>进入前异步</span>
                <el-switch
                  v-model="form.async"
                  data-testid="async-before"
                  @change="updateAsync"
                />
              </div>
              <div v-if="form.async" class="switch-row">
                <span>进入作业独占</span>
                <el-switch
                  v-model="form.exclusive"
                  data-testid="async-before-exclusive"
                  @change="updateAsync"
                />
              </div>
              <div class="switch-row">
                <span>离开时异步</span>
                <el-switch
                  v-model="form.asyncLeave"
                  data-testid="async-after"
                  @change="updateAsync"
                />
              </div>
              <div v-if="form.asyncLeave" class="switch-row">
                <span>离开作业独占</span>
                <el-switch
                  v-model="form.asyncLeaveExclusive"
                  data-testid="async-after-exclusive"
                  @change="updateAsync"
                />
              </div>
              <el-form-item label="作业分类">
                <el-input
                  v-model="form.jobCategory"
                  data-testid="job-category"
                  placeholder="例如：critical 或 ${category}"
                  @change="updateJobCategory"
                />
              </el-form-item>
            </template>
            <el-form-item
              v-if="supportsFailedJobRetryTimeCycle"
              label="失败作业重试周期"
            >
              <el-input
                v-model="form.failedJobRetryTimeCycle"
                data-testid="failed-job-retry-cycle"
                placeholder="R5/PT5M 或 ${retryCycle}"
                @change="updateFailedJobRetryTimeCycle"
              />
            </el-form-item>
            <el-form-item v-if="isUserTask || isServiceTask" label="跳过表达式">
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
      <p>请选择流程元素</p>
    </div>

    <el-dialog
      v-model="customResourceDialogVisible"
      :title="editingCustomResource ? '编辑自定义身份链接' : '新增自定义身份链接'"
      width="min(560px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="身份链接类型" required>
          <el-input
            v-model="customResourceForm.name"
            data-testid="custom-resource-name"
            placeholder="watcher"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="分配表达式" required>
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
        <el-button @click="customResourceDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-testid="save-custom-resource"
          @click="saveCustomResource"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="definitionDialogVisible"
      :title="editingDefinition ? '编辑全局事件定义' : '新增全局事件定义'"
      width="560px"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="定义类型">
          <el-radio-group v-model="definitionForm.kind" :disabled="!!editingDefinition">
            <el-radio-button value="message">消息</el-radio-button>
            <el-radio-button value="signal">信号</el-radio-button>
            <el-radio-button value="error">错误</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <div class="two-column">
          <el-form-item label="标识（ID）" required>
            <el-input v-model="definitionForm.id" data-testid="global-definition-id" spellcheck="false" />
          </el-form-item>
          <el-form-item label="名称">
            <el-input v-model="definitionForm.name" data-testid="global-definition-name" />
          </el-form-item>
        </div>
        <template v-if="definitionForm.kind === 'signal'">
          <el-form-item label="信号范围">
            <el-input v-model="definitionForm.scope" placeholder="global 或 processInstance" />
          </el-form-item>
        </template>
        <template v-else-if="definitionForm.kind === 'error'">
          <el-form-item label="错误码">
            <el-input v-model="definitionForm.errorCode" placeholder="ORDER_NOT_FOUND" />
          </el-form-item>
          <el-form-item label="错误消息">
            <el-input v-model="definitionForm.errorMessage" placeholder="可选的 Flowable 错误消息" />
          </el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="definitionDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-global-definition" @click="saveGlobalDefinition">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="freeApprovalDialogVisible"
      :title="`${editingFreeApprovalIndex >= 0 ? '编辑' : '新增'}${freeApprovalKind === 'nextUser' ? '下一审批人' : '下一流转'}`"
      width="min(520px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="名称" required>
          <el-input v-model="freeApprovalEditor.name" data-testid="free-approval-name" />
        </el-form-item>
        <el-form-item label="编码" required>
          <el-input v-model="freeApprovalEditor.code" data-testid="free-approval-code" spellcheck="false" />
        </el-form-item>
        <div v-if="freeApprovalKind === 'nextUser'" class="switch-row">
          <span>允许多选</span>
          <el-switch v-model="freeApprovalEditor.multiple" data-testid="free-approval-multiple" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="freeApprovalDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-free-approval" @click="saveFreeApprovalRecord">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="nodeFormDialogVisible"
      :title="editingNodeFormIndex >= 0 ? '编辑所选表单' : '添加表单'"
      width="min(520px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="表单 ID">
          <el-input v-model="nodeFormEditor.id" data-testid="node-form-id" spellcheck="false" />
        </el-form-item>
        <el-form-item label="表单标识" required>
          <el-input v-model="nodeFormEditor.code" data-testid="node-form-code" spellcheck="false" />
        </el-form-item>
        <el-form-item label="表单名称" required>
          <el-input v-model="nodeFormEditor.name" data-testid="node-form-name" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="nodeFormEditor.title" data-testid="node-form-title" />
        </el-form-item>
        <div class="two-column">
          <el-form-item label="分类编码">
            <el-input v-model="nodeFormEditor.categoryCode" data-testid="node-form-category-code" />
          </el-form-item>
          <el-form-item label="分类名称">
            <el-input v-model="nodeFormEditor.categoryName" data-testid="node-form-category-name" />
          </el-form-item>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="nodeFormDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-node-form" @click="saveNodeFormRecord">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mapExceptionDialogVisible"
      :title="editingMapException ? '编辑异常映射' : '新增异常映射'"
      width="min(560px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="BPMN 错误码" required>
          <el-input
            v-model="mapExceptionForm.errorCode"
            data-testid="map-exception-error-code"
            placeholder="BUSINESS_ERROR"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="异常类">
          <el-input
            v-model="mapExceptionForm.exceptionClass"
            data-testid="map-exception-class"
            placeholder="java.lang.RuntimeException"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="根因类型">
          <el-input
            v-model="mapExceptionForm.rootCause"
            data-testid="map-exception-root-cause"
            placeholder="java.lang.IllegalArgumentException"
            spellcheck="false"
          />
        </el-form-item>
        <div class="switch-row">
          <span>包含子类异常</span>
          <el-switch
            v-model="mapExceptionForm.includeChildExceptions"
            data-testid="map-exception-include-children"
          />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mapExceptionDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-map-exception" @click="saveMapException">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="extensionPropertyDialogVisible"
      :title="editingExtensionProperty ? '编辑扩展属性' : '新增扩展属性'"
      width="min(520px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="属性标识">
          <el-input
            v-model="extensionPropertyForm.id"
            data-testid="extension-property-id"
            spellcheck="false"
          />
        </el-form-item>
        <el-form-item label="属性名称" required>
          <el-input v-model="extensionPropertyForm.name" data-testid="extension-property-name" />
        </el-form-item>
        <el-form-item label="属性值" required>
          <el-input
            v-model="extensionPropertyForm.value"
            data-testid="extension-property-value"
            type="textarea"
            :rows="3"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="extensionPropertyDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-testid="save-extension-property"
          @click="saveExtensionProperty"
        >
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="listenerDialogVisible"
      title="监听器配置"
      width="min(600px, calc(100vw - 32px))"
      append-to-body
      data-testid="listener-dialog"
    >
      <el-form label-position="top">
        <div class="two-column">
          <el-form-item label="监听器类型">
            <el-select
              v-model="listenerForm.kind"
              class="w-full"
              :disabled="!!editingListener"
              data-testid="listener-kind"
              @change="changeListenerKind"
            >
              <el-option label="执行监听器" value="executionListener" />
              <el-option v-if="isUserTask" label="任务监听器" value="taskListener" />
            </el-select>
          </el-form-item>
          <el-form-item label="事件" required>
            <el-select v-model="listenerForm.event" class="w-full" data-testid="listener-event">
              <template v-if="listenerForm.kind === 'taskListener'">
                <el-option label="创建 create" value="create" />
                <el-option label="分配 assignment" value="assignment" />
                <el-option label="完成 complete" value="complete" />
                <el-option label="删除 delete" value="delete" />
                <el-option label="所有 all" value="all" />
              </template>
              <template v-else-if="isSequenceFlow">
                <el-option label="开始 start" value="start" />
                <el-option label="流转 take" value="take" />
                <el-option label="结束 end" value="end" />
              </template>
              <template v-else>
                <el-option label="开始 start" value="start" />
                <el-option label="结束 end" value="end" />
              </template>
            </el-select>
          </el-form-item>
        </div>
        <el-form-item label="实现方式" required>
          <el-radio-group
            v-model="listenerForm.implementationType"
            class="listener-implementation-types"
            data-testid="listener-implementation-type"
            @change="changeListenerImplementationType"
          >
            <el-radio-button value="class">Java 类</el-radio-button>
            <el-radio-button value="expression">表达式</el-radio-button>
            <el-radio-button value="delegateExpression">代理表达式</el-radio-button>
            <el-radio-button value="script">脚本</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <template v-if="listenerForm.implementationType === 'script'">
          <div class="two-column">
            <el-form-item label="脚本语言" required>
              <el-input
                v-model="listenerForm.scriptLanguage"
                data-testid="listener-script-language"
                placeholder="groovy"
              />
            </el-form-item>
            <el-form-item label="结果变量">
              <el-input
                v-model="listenerForm.scriptResultVariable"
                data-testid="listener-script-result-variable"
              />
            </el-form-item>
          </div>
          <el-form-item label="脚本内容" required>
            <el-input
              v-model="listenerForm.scriptBody"
              data-testid="listener-script-body"
              type="textarea"
              :rows="7"
              class="code-input"
            />
          </el-form-item>
        </template>
        <el-form-item v-else label="实现内容" required>
          <el-input
            v-model="listenerForm.implementation"
            data-testid="listener-implementation"
          />
        </el-form-item>

        <el-form-item v-if="listenerSupportsTransaction" label="事务阶段">
          <el-select
            v-model="listenerForm.onTransaction"
            class="w-full"
            clearable
            data-testid="listener-on-transaction"
            @change="changeListenerTransaction"
          >
            <el-option label="提交前 before-commit" value="before-commit" />
            <el-option label="提交后 committed" value="committed" />
            <el-option label="回滚后 rolled-back" value="rolled-back" />
          </el-select>
        </el-form-item>
        <div v-if="listenerForm.onTransaction" class="two-column">
          <el-form-item label="属性解析器类型">
            <el-select
              v-model="listenerForm.resolverType"
              class="w-full"
              clearable
              data-testid="listener-resolver-type"
            >
              <el-option label="Java 类" value="class" />
              <el-option label="表达式" value="expression" />
              <el-option label="代理表达式" value="delegateExpression" />
            </el-select>
          </el-form-item>
          <el-form-item v-if="listenerForm.resolverType" label="属性解析器实现" required>
            <el-input
              v-model="listenerForm.resolverImplementation"
              data-testid="listener-resolver-implementation"
            />
          </el-form-item>
        </div>

        <template v-if="listenerSupportsFields">
          <div class="dialog-list-header">
            <span>字段注入</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              data-testid="add-listener-field"
              @click="addListenerField"
            >
              添加字段
            </el-button>
          </div>
          <div v-for="(field, index) in listenerForm.fields" :key="index" class="field-row">
            <el-input
              v-model="field.name"
              :data-testid="`listener-field-name-${index}`"
              placeholder="字段名"
            />
            <el-select v-model="field.valueType" style="width: 110px">
              <el-option label="字符串" value="string" />
              <el-option label="表达式" value="expression" />
            </el-select>
            <el-input v-model="field.value" placeholder="字段值" />
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
        <el-button @click="listenerDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-listener" @click="saveListener">
          确定
        </el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="formDialogVisible" title="表单字段" width="660px" append-to-body>
      <el-form label-position="top">
        <div class="two-column">
          <el-form-item label="字段标识" required>
            <el-input v-model="formPropertyForm.id" />
          </el-form-item>
          <el-form-item label="字段名称">
            <el-input v-model="formPropertyForm.name" />
          </el-form-item>
        </div>
        <div class="two-column">
          <el-form-item label="字段类型">
            <el-select v-model="formPropertyForm.type" class="w-full">
              <el-option label="字符串" value="string" />
              <el-option label="长整数" value="long" />
              <el-option label="小数" value="double" />
              <el-option label="布尔值" value="boolean" />
              <el-option label="日期" value="date" />
              <el-option label="枚举" value="enum" />
            </el-select>
          </el-form-item>
          <el-form-item label="变量名">
            <el-input v-model="formPropertyForm.variable" />
          </el-form-item>
        </div>
        <div class="two-column">
          <el-form-item label="默认值">
            <el-input v-model="formPropertyForm.default" />
          </el-form-item>
          <el-form-item v-if="formPropertyForm.type === 'date'" label="日期格式">
            <el-input v-model="formPropertyForm.datePattern" placeholder="yyyy-MM-dd" />
          </el-form-item>
          <el-form-item v-else label="取值表达式">
            <el-input v-model="formPropertyForm.expression" />
          </el-form-item>
        </div>
        <div class="switches-inline">
          <el-checkbox v-model="formPropertyForm.readable">可读</el-checkbox>
          <el-checkbox v-model="formPropertyForm.writable">可写</el-checkbox>
          <el-checkbox v-model="formPropertyForm.required">必填</el-checkbox>
        </div>
        <template v-if="formPropertyForm.type === 'enum'">
          <div class="dialog-list-header mt-4">
            <span>枚举选项</span>
            <el-button
              link
              type="primary"
              :icon="Plus"
              @click="formPropertyForm.values.push({ id: '', name: '' })"
            >
              添加选项
            </el-button>
          </div>
          <div v-for="(item, index) in formPropertyForm.values" :key="index" class="field-row enum-row">
            <el-input v-model="item.id" placeholder="选项值" />
            <el-input v-model="item.name" placeholder="显示名称" />
            <el-button link type="danger" :icon="Delete" @click="formPropertyForm.values.splice(index, 1)" />
          </div>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="formDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveFormProperty">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="fieldDialogVisible" title="字段注入" width="520px" append-to-body>
      <el-form label-position="top">
        <el-form-item label="字段名" required>
          <el-input v-model="fieldForm.name" />
        </el-form-item>
        <el-form-item label="值类型">
          <el-radio-group v-model="fieldForm.valueType">
            <el-radio-button value="string">字符串</el-radio-button>
            <el-radio-button value="expression">表达式</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="字段值">
          <el-input v-model="fieldForm.value" type="textarea" :rows="3" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="fieldDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="saveField">确定</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="mappingDialogVisible"
      :title="mappingIsInput ? '输入参数映射' : '输出参数映射'"
      width="min(540px, calc(100vw - 32px))"
      append-to-body
    >
      <el-form label-position="top">
        <el-form-item label="来源类型">
          <el-radio-group v-model="mappingForm.sourceType" data-testid="mapping-source-type">
            <el-radio-button value="source">变量</el-radio-button>
            <el-radio-button value="sourceExpression">表达式</el-radio-button>
            <el-radio-button v-if="mappingForm.sourceType === 'variables'" value="variables">
              变量集合
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="来源" required>
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
          label="目标变量"
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
          title="Flowable 6.8.1 在调用活动中按普通变量处理 transient；本次编辑会原样保留该属性。"
        />
        <div
          v-if="mappingForm.sourceType !== 'variables' && mappingSupportsTransient"
          class="switch-row"
        >
          <span>瞬态变量</span>
          <el-switch v-model="mappingForm.transient" data-testid="mapping-transient" />
        </div>
      </el-form>
      <template #footer>
        <el-button @click="mappingDialogVisible = false">取消</el-button>
        <el-button type="primary" data-testid="save-mapping" @click="saveMapping">确定</el-button>
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
