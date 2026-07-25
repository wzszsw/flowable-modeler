import { BpmnModdle } from 'bpmn-moddle'

import flowableDescriptor from './flowableDescriptor'

type JsonObject = Record<string, unknown>

interface ModdleElement extends JsonObject {
  $type: string
  $parent?: ModdleElement
  get?: (name: string) => unknown
}

export interface OryxPoint {
  x: number
  y: number
}

export interface OryxBounds {
  lowerRight: OryxPoint
  upperLeft: OryxPoint
}

export interface OryxShape extends JsonObject {
  resourceId: string
  properties?: JsonObject
  stencil: { id: string }
  childShapes: OryxShape[]
  outgoing: Array<{ resourceId: string }>
  bounds: OryxBounds
  dockers: OryxPoint[]
  target?: { resourceId: string }
}

export interface OryxModel extends JsonObject {
  resourceId: string
  properties: JsonObject
  stencil: { id: string }
  childShapes: OryxShape[]
  bounds: OryxBounds
  stencilset: { namespace: string; url: string }
  ssextensions: unknown[]
}

const RAW_XML_PROPERTY = 'flowableModelerBpmn20Xml'
const FINGERPRINT_PROPERTY = 'flowableModelerOryxFingerprint'
const CONVERTER_VERSION_PROPERTY = 'flowableModelerConverterVersion'
const CONVERTER_VERSION = 1

const BPMN_STENCILSET = {
  namespace: 'http://b3mn.org/stencilset/bpmn2.0#',
  url: '../editor/stencilsets/bpmn2.0/bpmn2.0.json',
}

const CONNECTION_STENCILS = new Set([
  'SequenceFlow',
  'MessageFlow',
  'Association',
  'DataAssociation',
])

const CONTAINER_STENCILS = new Set([
  'SubProcess',
  'CollapsedSubProcess',
  'EventSubProcess',
  'AdhocSubProcess',
])

const STENCIL_TO_BPMN: Record<string, string> = {
  Task: 'bpmn:Task',
  UserTask: 'bpmn:UserTask',
  ServiceTask: 'bpmn:ServiceTask',
  MailTask: 'bpmn:ServiceTask',
  CamelTask: 'bpmn:ServiceTask',
  MuleTask: 'bpmn:ServiceTask',
  HttpTask: 'bpmn:ServiceTask',
  ExternalWorkerTask: 'bpmn:ServiceTask',
  ShellTask: 'bpmn:ServiceTask',
  DecisionTask: 'bpmn:ServiceTask',
  SendEventTask: 'bpmn:ServiceTask',
  ScriptTask: 'bpmn:ScriptTask',
  BusinessRule: 'bpmn:BusinessRuleTask',
  BusinessRuleTask: 'bpmn:BusinessRuleTask',
  ManualTask: 'bpmn:ManualTask',
  ReceiveTask: 'bpmn:ReceiveTask',
  ReceiveEventTask: 'bpmn:ReceiveTask',
  SendTask: 'bpmn:SendTask',
  CallActivity: 'bpmn:CallActivity',
  SubProcess: 'bpmn:SubProcess',
  CollapsedSubProcess: 'bpmn:SubProcess',
  EventSubProcess: 'bpmn:SubProcess',
  AdhocSubProcess: 'bpmn:SubProcess',
  ExclusiveGateway: 'bpmn:ExclusiveGateway',
  ParallelGateway: 'bpmn:ParallelGateway',
  InclusiveGateway: 'bpmn:InclusiveGateway',
  ComplexGateway: 'bpmn:ComplexGateway',
  EventGateway: 'bpmn:EventBasedGateway',
  EventBasedGateway: 'bpmn:EventBasedGateway',
  StartNoneEvent: 'bpmn:StartEvent',
  StartTimerEvent: 'bpmn:StartEvent',
  StartMessageEvent: 'bpmn:StartEvent',
  StartSignalEvent: 'bpmn:StartEvent',
  StartErrorEvent: 'bpmn:StartEvent',
  StartEscalationEvent: 'bpmn:StartEvent',
  StartConditionalEvent: 'bpmn:StartEvent',
  StartEventRegistryEvent: 'bpmn:StartEvent',
  StartVariableListenerEvent: 'bpmn:StartEvent',
  EndNoneEvent: 'bpmn:EndEvent',
  EndErrorEvent: 'bpmn:EndEvent',
  EndEscalationEvent: 'bpmn:EndEvent',
  EndCancelEvent: 'bpmn:EndEvent',
  EndTerminateEvent: 'bpmn:EndEvent',
  EndMessageEvent: 'bpmn:EndEvent',
  EndSignalEvent: 'bpmn:EndEvent',
  CatchTimerEvent: 'bpmn:IntermediateCatchEvent',
  CatchMessageEvent: 'bpmn:IntermediateCatchEvent',
  CatchSignalEvent: 'bpmn:IntermediateCatchEvent',
  CatchConditionalEvent: 'bpmn:IntermediateCatchEvent',
  CatchEventRegistryEvent: 'bpmn:IntermediateCatchEvent',
  CatchVariableListenerEvent: 'bpmn:IntermediateCatchEvent',
  ThrowNoneEvent: 'bpmn:IntermediateThrowEvent',
  ThrowSignalEvent: 'bpmn:IntermediateThrowEvent',
  ThrowEscalationEvent: 'bpmn:IntermediateThrowEvent',
  ThrowCompensationEvent: 'bpmn:IntermediateThrowEvent',
  ThrowMessageEvent: 'bpmn:IntermediateThrowEvent',
  BoundaryTimerEvent: 'bpmn:BoundaryEvent',
  BoundaryErrorEvent: 'bpmn:BoundaryEvent',
  BoundaryConditionalEvent: 'bpmn:BoundaryEvent',
  BoundaryEscalationEvent: 'bpmn:BoundaryEvent',
  BoundarySignalEvent: 'bpmn:BoundaryEvent',
  BoundaryMessageEvent: 'bpmn:BoundaryEvent',
  BoundaryEventRegistryEvent: 'bpmn:BoundaryEvent',
  BoundaryVariableListenerEvent: 'bpmn:BoundaryEvent',
  BoundaryCancelEvent: 'bpmn:BoundaryEvent',
  BoundaryCompensationEvent: 'bpmn:BoundaryEvent',
  TextAnnotation: 'bpmn:TextAnnotation',
  DataObject: 'bpmn:DataObjectReference',
  DataObjectReference: 'bpmn:DataObjectReference',
  DataStore: 'bpmn:DataStoreReference',
  DataStoreReference: 'bpmn:DataStoreReference',
  Group: 'bpmn:Group',
}

const SERVICE_STENCIL_TYPES: Record<string, string> = {
  MailTask: 'mail',
  CamelTask: 'camel',
  MuleTask: 'mule',
  HttpTask: 'http',
  ExternalWorkerTask: 'external-worker',
  ShellTask: 'shell',
  DecisionTask: 'dmn',
  SendEventTask: 'send-event',
}

const SERVICE_TYPE_STENCILS: Record<string, string> = Object.fromEntries(
  Object.entries(SERVICE_STENCIL_TYPES).map(([stencil, type]) => [type, stencil]),
)

const FLOWABLE_ATTRIBUTE_TO_ORYX: Record<string, string> = {
  skipExpression: 'skipexpression',
  formKey: 'formkeydefinition',
  formFieldValidation: 'formfieldvalidation',
  initiator: 'initiator',
  priority: 'prioritydefinition',
  dueDate: 'duedatedefinition',
  businessCalendarName: 'calendarname',
  category: 'categorydefinition',
  taskIdVariableName: 'taskidvariablename',
  calledElementType: 'callactivitycalledelementtype',
  sameDeployment: 'callactivitysamedeployment',
  inheritVariables: 'callactivityinheritvariables',
  inheritBusinessKey: 'callactivityinheritbusinesskey',
  useLocalScopeForOutParameters: 'callactivityuselocalscopeforoutparameters',
  completeAsync: 'callactivitycompleteasync',
  idVariableName: 'callactivityidvariablename',
  businessKey: 'callactivitybusinesskey',
  fallbackToDefaultTenant: 'callactivityfallbacktodefaulttenant',
  processInstanceName: 'callactivityprocessinstancename',
}

const SERVICE_FIELD_PROPERTIES: Record<string, Record<string, string>> = {
  mail: {
    headers: 'mailtaskheaders',
    to: 'mailtaskto',
    from: 'mailtaskfrom',
    subject: 'mailtasksubject',
    cc: 'mailtaskcc',
    bcc: 'mailtaskbcc',
    text: 'mailtasktext',
    html: 'mailtaskhtml',
    htmlVar: 'mailtaskhtmlvar',
    textVar: 'mailtasktextvar',
    charset: 'mailtaskcharset',
  },
  camel: { camelContext: 'cameltaskcamelcontext' },
  mule: {
    endpointUrl: 'muletaskendpointurl',
    language: 'muletasklanguage',
    payloadExpression: 'muletaskpayloadexpression',
    resultVariable: 'muletaskresultvariable',
  },
  http: {
    requestMethod: 'httptaskrequestmethod',
    requestUrl: 'httptaskrequesturl',
    requestHeaders: 'httptaskrequestheaders',
    requestBody: 'httptaskrequestbody',
    requestBodyEncoding: 'httptaskrequestbodyencoding',
    requestTimeout: 'httptaskrequesttimeout',
    disallowRedirects: 'httptaskdisallowredirects',
    failStatusCodes: 'httptaskfailstatuscodes',
    handleStatusCodes: 'httptaskhandlestatuscodes',
    ignoreException: 'httptaskignoreexception',
    responseVariableName: 'httptaskresponsevariablename',
    saveRequestVariables: 'httptasksaverequestvariables',
    saveResponseParameters: 'httptasksaveresponseparameters',
    resultVariablePrefix: 'httptaskresultvariableprefix',
    saveResponseParametersTransient: 'httptasksaveresponseparameterstransient',
    saveResponseAsJson: 'httptasksaveresponseasjson',
    parallelInSameTransaction: 'httptaskparallelinsametransaction',
  },
  shell: {
    command: 'shellcommand',
    arg1: 'shellarg1',
    arg2: 'shellarg2',
    arg3: 'shellarg3',
    arg4: 'shellarg4',
    arg5: 'shellarg5',
    wait: 'shellwait',
    outputVariable: 'shelloutputvariable',
    errorCodeVariable: 'shellerrorcodevariable',
    errorRedirect: 'shellerrorredirect',
    cleanEnv: 'shellcleanenv',
    directory: 'shelldirectory',
  },
}

const KNOWN_ORYX_PROPERTIES = new Set([
  'overrideid',
  'name',
  'documentation',
  'process_id',
  'process_namespace',
  'process_author',
  'process_version',
  'process_historylevel',
  'process_potentialstarteruser',
  'process_potentialstartergroup',
  'isexecutable',
  'iseagerexecutionfetch',
  'asynchronousdefinition',
  'exclusivedefinition',
  'isforcompensation',
  'multiinstance_type',
  'multiinstance_cardinality',
  'multiinstance_collection',
  'multiinstance_variable',
  'multiinstance_condition',
  'multiinstance_index_variable',
  'multiinstance_variableaggregations',
  'executionlisteners',
  'tasklisteners',
  'eventlisteners',
  'formproperties',
  'formreference',
  'formkeydefinition',
  'formfieldvalidation',
  'initiator',
  'usertaskassignment',
  'prioritydefinition',
  'duedatedefinition',
  'calendarname',
  'categorydefinition',
  'taskidvariablename',
  'skipexpression',
  'servicetaskclass',
  'servicetaskexpression',
  'servicetaskdelegateexpression',
  'servicetaskresultvariable',
  'servicetaskfields',
  'servicetaskexceptions',
  'servicetasktriggerable',
  'servicetaskuselocalscopeforresultvariable',
  'servicetaskfailedjobretrytimecycle',
  'servicetaskstoreresultvariabletransient',
  'scriptformat',
  'scripttext',
  'scriptautostorevariables',
  'callactivitycalledelement',
  'callactivitycalledelementtype',
  'callactivityinparameters',
  'callactivityoutparameters',
  'callactivityfallbacktodefaulttenant',
  'callactivityidvariablename',
  'callactivityinheritvariables',
  'callactivitysamedeployment',
  'callactivityprocessinstancename',
  'callactivitybusinesskey',
  'callactivityinheritbusinesskey',
  'callactivityuselocalscopeforoutparameters',
  'callactivitycompleteasync',
  'conditionsequenceflow',
  'defaultflow',
  'timerdurationdefinition',
  'timerdatedefinition',
  'timercycledefinition',
  'timerenddatedefinition',
  'conditionaleventcondition',
  'cancelactivity',
  'interrupting',
  'messageref',
  'messageexpression',
  'signalref',
  'signalexpression',
  'errorref',
  'errorvariablename',
  'errorvariabletransient',
  'errorvariablelocalscope',
  'escalationref',
  'terminateall',
  'terminateMultiInstance',
  'compensationactivityref',
  'variablelistenervariablename',
  'variablelistenervariablechangetype',
  'messages',
  'messagedefinitions',
  'signaldefinitions',
  'escalationdefinitions',
  ...Object.values(SERVICE_FIELD_PROPERTIES).flatMap((fields) => Object.values(fields)),
])

const snapshotByProcessId = new Map<string, OryxModel>()

function createModdle() {
  return new BpmnModdle({ flowable: flowableDescriptor })
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function objectValue(value: unknown): JsonObject {
  return isObject(value) ? value : {}
}

function arrayValue<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function parseNested(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function stringValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  return typeof value === 'string' ? value : String(value)
}

function booleanValue(value: unknown, fallback = false): boolean {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', 'yes', '1'].includes(String(value).trim().toLowerCase())
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function propertiesOf(shape: JsonObject): JsonObject {
  return objectValue(shape.properties)
}

function propertyOf(shape: JsonObject, name: string): unknown {
  return propertiesOf(shape)[name]
}

function nestedProperty(shape: JsonObject, name: string): JsonObject {
  return objectValue(parseNested(propertyOf(shape, name)))
}

function nestedArray(shape: JsonObject, property: string, keys: string[]): JsonObject[] {
  const value = parseNested(propertyOf(shape, property))
  if (Array.isArray(value)) return value.filter(isObject)
  const container = objectValue(value)
  for (const key of keys) {
    const candidate = parseNested(container[key])
    if (Array.isArray(candidate)) return candidate.filter(isObject)
  }
  return []
}

function oryxElementId(shape: JsonObject): string {
  return stringValue(propertyOf(shape, 'overrideid')).trim() || stringValue(shape.resourceId).trim()
}

function point(value: unknown): OryxPoint {
  const candidate = objectValue(value)
  return { x: numberValue(candidate.x), y: numberValue(candidate.y) }
}

function bounds(value: unknown): OryxBounds {
  const candidate = objectValue(value)
  return {
    upperLeft: point(candidate.upperLeft),
    lowerRight: point(candidate.lowerRight),
  }
}

function makeBounds(x: number, y: number, width: number, height: number): OryxBounds {
  return {
    upperLeft: { x, y },
    lowerRight: { x: x + width, y: y + height },
  }
}

function stencilId(shape: JsonObject): string {
  return stringValue(objectValue(shape.stencil).id)
}

function propertyFingerprint(model: JsonObject): string {
  const copy = deepClone(model)
  delete copy[RAW_XML_PROPERTY]
  delete copy[FINGERPRINT_PROPERTY]
  delete copy[CONVERTER_VERSION_PROPERTY]
  // ApiModelResource adds this transient decoration to every GET response.
  delete copy.modelType
  const source = JSON.stringify(copy)
  let hash = 0x811c9dc5
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function assertOryxModel(value: unknown): asserts value is OryxModel {
  if (!isObject(value) || !Array.isArray(value.childShapes)) {
    throw new Error('Flowable editor JSON is not a BPMN Oryx canvas')
  }
  const rootStencil = stencilId(value)
  if (rootStencil && rootStencil !== 'BPMNDiagram') {
    throw new Error(`Unsupported Oryx stencil set root: ${rootStencil}`)
  }
}

function moddleValue(element: ModdleElement | undefined, name: string): unknown {
  if (!element) return undefined
  const fromGetter = element.get?.(name)
  if (fromGetter !== undefined) return fromGetter
  if (element[name] !== undefined) return element[name]
  const localName = name.includes(':') ? name.slice(name.indexOf(':') + 1) : name
  if (element[localName] !== undefined) return element[localName]
  return objectValue(element.$attrs)[name]
}

function flowableValue(element: ModdleElement | undefined, name: string): unknown {
  return moddleValue(element, `flowable:${name}`)
}

function documentationText(element: ModdleElement): string {
  const documentation = arrayValue<ModdleElement>(element.documentation)
  return stringValue(documentation[0]?.text)
}

function extensionValues(element: ModdleElement | undefined): ModdleElement[] {
  return arrayValue<ModdleElement>(objectValue(element?.extensionElements).values)
}

function extensionsOfType(element: ModdleElement | undefined, type: string): ModdleElement[] {
  return extensionValues(element).filter((extension) => extension.$type === type)
}

function extensionBody(element: ModdleElement | undefined, type: string): string {
  const extension = extensionsOfType(element, type)[0]
  return stringValue(extension?.body ?? extension?.value)
}

function ensureExtensionElements(moddle: BpmnModdle, element: ModdleElement): ModdleElement {
  let extensionElements = element.extensionElements as ModdleElement | undefined
  if (!extensionElements) {
    extensionElements = moddle.create('bpmn:ExtensionElements', { values: [] }) as ModdleElement
    element.extensionElements = extensionElements
  }
  if (!Array.isArray(extensionElements.values)) extensionElements.values = []
  return extensionElements
}

function addExtension(
  moddle: BpmnModdle,
  element: ModdleElement,
  type: string,
  values: JsonObject = {},
): ModdleElement {
  const extension = moddle.create(type, values) as ModdleElement
  const extensionElements = ensureExtensionElements(moddle, element)
  ;(extensionElements.values as ModdleElement[]).push(extension)
  return extension
}

function addDocumentation(moddle: BpmnModdle, element: ModdleElement, value: unknown) {
  const text = stringValue(value)
  if (!text) return
  element.documentation = [moddle.create('bpmn:Documentation', { text })]
}

function setIfText(target: JsonObject, name: string, value: unknown) {
  const text = stringValue(value)
  if (text) target[name] = text
}

function setFlowableIfText(target: JsonObject, name: string, value: unknown) {
  const text = stringValue(value)
  if (text) target[`flowable:${name}`] = text
}

function setFlowableBoolean(target: JsonObject, name: string, value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return
  target[`flowable:${name}`] = booleanValue(value, fallback)
}

function stripKnownProperties(properties: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(properties).filter(([key]) => !KNOWN_ORYX_PROPERTIES.has(key)))
}

function mergeShapeWithSnapshot(generated: OryxShape, existing?: OryxShape): OryxShape {
  if (!existing) return generated
  return {
    ...deepClone(existing),
    ...generated,
    properties: {
      ...stripKnownProperties(propertiesOf(existing)),
      ...generated.properties,
    },
    childShapes: generated.childShapes,
  }
}

function indexOryxShapes(shapes: OryxShape[], target = new Map<string, OryxShape>()) {
  for (const shape of shapes) {
    target.set(shape.resourceId, shape)
    target.set(oryxElementId(shape), shape)
    indexOryxShapes(shape.childShapes || [], target)
  }
  return target
}

interface ShapeContext {
  shape: OryxShape
  originX: number
  originY: number
  absoluteBounds: OryxBounds
  owner: ModdleElement
  process: ModdleElement
  lane?: ModdleElement
  semantic?: ModdleElement
}

interface OryxImportState {
  moddle: BpmnModdle
  definitions: ModdleElement
  collaboration?: ModdleElement
  mainProcess: ModdleElement
  rootElements: ModdleElement[]
  shapeContexts: ShapeContext[]
  contextByResourceId: Map<string, ShapeContext>
  semanticByResourceId: Map<string, ModdleElement>
  semanticById: Map<string, ModdleElement>
  sourceResourceByConnection: Map<string, string>
  globalById: Map<string, ModdleElement>
}

function createGlobalDefinitions(state: OryxImportState, model: OryxModel) {
  const rootProperties = model.properties
  for (const item of arrayValue<JsonObject>(parseNested(rootProperties.messagedefinitions))) {
    const id = stringValue(item.id)
    if (!id) continue
    const message = state.moddle.create('bpmn:Message', {
      id,
      name: stringValue(item.name) || id,
      itemRef: stringValue(item.message_item_ref) || undefined,
    }) as ModdleElement
    state.rootElements.push(message)
    state.globalById.set(id, message)
  }
  for (const item of arrayValue<JsonObject>(parseNested(rootProperties.signaldefinitions))) {
    const id = stringValue(item.id)
    if (!id) continue
    const signal = state.moddle.create('bpmn:Signal', {
      id,
      name: stringValue(item.name) || id,
      'flowable:scope': stringValue(item.scope) || undefined,
    }) as ModdleElement
    state.rootElements.push(signal)
    state.globalById.set(id, signal)
  }
  for (const item of arrayValue<JsonObject>(parseNested(rootProperties.escalationdefinitions))) {
    const id = stringValue(item.id)
    if (!id) continue
    const escalation = state.moddle.create('bpmn:Escalation', {
      id,
      name: stringValue(item.name) || undefined,
      escalationCode: id,
    }) as ModdleElement
    state.rootElements.push(escalation)
    state.globalById.set(id, escalation)
  }
}

function ensureGlobalReference(
  state: OryxImportState,
  type: 'bpmn:Message' | 'bpmn:Signal' | 'bpmn:Error' | 'bpmn:Escalation',
  id: string,
) {
  const existing = state.globalById.get(id)
  if (existing) return existing
  const values: JsonObject = { id, name: id }
  if (type === 'bpmn:Error') values.errorCode = id
  if (type === 'bpmn:Escalation') values.escalationCode = id
  const created = state.moddle.create(type, values) as ModdleElement
  state.rootElements.push(created)
  state.globalById.set(id, created)
  return created
}

function createListenerExtensions(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  const listenerSpecs: Array<[string, string, string]> = [
    ['executionlisteners', 'executionListeners', 'flowable:ExecutionListener'],
    ['tasklisteners', 'taskListeners', 'flowable:TaskListener'],
  ]
  for (const [property, key, type] of listenerSpecs) {
    for (const listener of nestedArray(shape, property, [key, 'items'])) {
      const event = stringValue(listener.event)
      if (!event) continue
      const values: JsonObject = { event }
      setIfText(values, 'class', listener.className ?? listener.class)
      setIfText(values, 'expression', listener.expression)
      setIfText(values, 'delegateExpression', listener.delegateExpression)
      const fields = arrayValue<JsonObject>(parseNested(listener.fields))
        .filter((field) => stringValue(field.name))
        .map((field) => {
          const fieldValues: JsonObject = { name: stringValue(field.name) }
          setIfText(fieldValues, 'stringValue', field.stringValue ?? field.string)
          setIfText(fieldValues, 'expression', field.expression)
          return state.moddle.create('flowable:Field', fieldValues)
        })
      if (fields.length) values.fields = fields
      addExtension(state.moddle, semantic, type, values)
    }
  }
}

function createFormPropertyExtensions(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  for (const formProperty of nestedArray(shape, 'formproperties', ['formProperties', 'items'])) {
    const id = stringValue(formProperty.id ?? formProperty.formproperty_id)
    if (!id) continue
    const values: JsonObject = { id }
    setIfText(values, 'name', formProperty.name ?? formProperty.formproperty_name)
    setIfText(values, 'type', formProperty.type ?? formProperty.formproperty_type)
    setIfText(values, 'variable', formProperty.variable ?? formProperty.formproperty_variable)
    setIfText(values, 'expression', formProperty.expression ?? formProperty.formproperty_expression)
    setIfText(values, 'default', formProperty.default)
    setIfText(values, 'datePattern', formProperty.datePattern)
    if (formProperty.readable !== undefined) values.readable = booleanValue(formProperty.readable, true)
    if (formProperty.writable !== undefined) values.writable = booleanValue(formProperty.writable, true)
    if (formProperty.required !== undefined) values.required = booleanValue(formProperty.required)
    const enumValues = arrayValue<JsonObject>(parseNested(formProperty.enumValues))
      .filter((value) => stringValue(value.id ?? value.value))
      .map((value) =>
        state.moddle.create('flowable:Value', {
          id: stringValue(value.id ?? value.value),
          name: stringValue(value.name ?? value.value),
        }),
      )
    if (enumValues.length) values.values = enumValues
    addExtension(state.moddle, semantic, 'flowable:FormProperty', values)
  }
}

function createServiceExtensions(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
  serviceType: string,
) {
  const properties = propertiesOf(shape)
  for (const item of nestedArray(shape, 'servicetaskfields', ['fields', 'items'])) {
    const name = stringValue(item.name)
    if (!name) continue
    const values: JsonObject = { name }
    setIfText(values, 'stringValue', item.stringValue ?? item.string)
    setIfText(values, 'expression', item.expression)
    addExtension(state.moddle, semantic, 'flowable:Field', values)
  }
  for (const [fieldName, propertyName] of Object.entries(SERVICE_FIELD_PROPERTIES[serviceType] || {})) {
    const value = properties[propertyName]
    if (value === undefined || value === null || value === '') continue
    const values: JsonObject = { name: fieldName }
    const text = stringValue(value)
    if (text.includes('${') || text.includes('#{')) values.expression = text
    else values.stringValue = text
    addExtension(state.moddle, semantic, 'flowable:Field', values)
  }
  for (const item of nestedArray(shape, 'servicetaskexceptions', ['exceptions', 'items'])) {
    const className = stringValue(item.class)
    if (!className) continue
    addExtension(state.moddle, semantic, 'flowable:MapException', {
      class: className,
      errorCode: stringValue(item.code) || undefined,
      includeChildExceptions: booleanValue(item.children),
    })
  }
  const retryCycle = stringValue(properties.servicetaskfailedjobretrytimecycle)
  if (retryCycle) {
    addExtension(state.moddle, semantic, 'flowable:FailedJobRetryTimeCycle', {
      body: retryCycle,
    })
  }
}

function createCallActivityMappings(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  const specs: Array<[string, string, string]> = [
    ['callactivityinparameters', 'inParameters', 'flowable:In'],
    ['callactivityoutparameters', 'outParameters', 'flowable:Out'],
  ]
  for (const [property, key, type] of specs) {
    for (const item of nestedArray(shape, property, [key, 'items'])) {
      const source = stringValue(item.source)
      const sourceExpression = stringValue(item.sourceExpression)
      const target = stringValue(item.target)
      if (!source && !sourceExpression) continue
      addExtension(state.moddle, semantic, type, {
        source: source || undefined,
        sourceExpression: sourceExpression || undefined,
        target: target || undefined,
      })
    }
  }
}

function createMultiInstance(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  const properties = propertiesOf(shape)
  const type = stringValue(properties.multiinstance_type || properties.looptype)
  if (!type || ['none', 'None'].includes(type)) return
  const values: JsonObject = { isSequential: type.toLowerCase() === 'sequential' }
  const cardinality = stringValue(properties.multiinstance_cardinality)
  const completion = stringValue(properties.multiinstance_condition)
  if (cardinality) values.loopCardinality = state.moddle.create('bpmn:FormalExpression', { body: cardinality })
  if (completion) values.completionCondition = state.moddle.create('bpmn:FormalExpression', { body: completion })
  setFlowableIfText(values, 'collection', properties.multiinstance_collection)
  setFlowableIfText(values, 'elementVariable', properties.multiinstance_variable)
  setFlowableIfText(values, 'elementIndexVariable', properties.multiinstance_index_variable)

  const aggregations = nestedProperty(shape, 'multiinstance_variableaggregations')
  for (const aggregation of arrayValue<JsonObject>(aggregations.aggregations)) {
    const aggregationValues: JsonObject = {
      target: stringValue(aggregation.target) || undefined,
      targetExpression: stringValue(aggregation.targetExpression) || undefined,
      storeAsTransientVariable: booleanValue(aggregation.storeAsTransient),
      createOverviewVariable: booleanValue(aggregation.createOverview),
      class: stringValue(aggregation.class) || undefined,
      delegateExpression: stringValue(aggregation.delegateExpression) || undefined,
      'bpmn:variable': arrayValue<JsonObject>(aggregation.definitions).map((definition) =>
        state.moddle.create('flowable:Variable', {
          source: stringValue(definition.source) || undefined,
          sourceExpression: stringValue(definition.sourceExpression) || undefined,
          target: stringValue(definition.target) || undefined,
          targetExpression: stringValue(definition.targetExpression) || undefined,
        }),
      ),
    }
    const loop = (semantic.loopCharacteristics ||= state.moddle.create(
      'bpmn:MultiInstanceLoopCharacteristics',
      values,
    )) as ModdleElement
    addExtension(state.moddle, loop, 'flowable:VariableAggregation', aggregationValues)
  }
  if (!semantic.loopCharacteristics) {
    semantic.loopCharacteristics = state.moddle.create('bpmn:MultiInstanceLoopCharacteristics', values)
  }
}

function createEventDefinition(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  const stencil = stencilId(shape)
  const properties = propertiesOf(shape)
  let eventDefinition: ModdleElement | undefined

  if (stencil.includes('Timer')) {
    const timeDate = stringValue(properties.timerdatedefinition)
    const timeCycle = stringValue(properties.timercycledefinition)
    const timeDuration = stringValue(properties.timerdurationdefinition)
    const expressionName = timeDate ? 'timeDate' : timeCycle ? 'timeCycle' : 'timeDuration'
    const expressionBody = timeDate || timeCycle || timeDuration
    const expression = state.moddle.create('bpmn:Expression', {
      body: expressionBody,
      'flowable:endDate': stringValue(properties.timerenddatedefinition) || undefined,
    })
    eventDefinition = state.moddle.create('bpmn:TimerEventDefinition', {
      [expressionName]: expression,
      'flowable:businessCalendarName': stringValue(properties.calendarname) || undefined,
    }) as ModdleElement
  } else if (stencil.includes('Conditional')) {
    eventDefinition = state.moddle.create('bpmn:ConditionalEventDefinition', {
      condition: state.moddle.create('bpmn:FormalExpression', {
        body: stringValue(properties.conditionaleventcondition),
      }),
    }) as ModdleElement
  } else if (stencil.includes('Message')) {
    const ref = stringValue(properties.messageref)
    eventDefinition = state.moddle.create('bpmn:MessageEventDefinition', {
      messageRef: ref ? ensureGlobalReference(state, 'bpmn:Message', ref) : undefined,
      'flowable:messageExpression': stringValue(properties.messageexpression) || undefined,
    }) as ModdleElement
  } else if (stencil.includes('Signal')) {
    const ref = stringValue(properties.signalref)
    eventDefinition = state.moddle.create('bpmn:SignalEventDefinition', {
      signalRef: ref ? ensureGlobalReference(state, 'bpmn:Signal', ref) : undefined,
      'flowable:signalExpression': stringValue(properties.signalexpression) || undefined,
      'flowable:async': booleanValue(properties.asynchronousdefinition),
    }) as ModdleElement
  } else if (stencil.includes('Error')) {
    const ref = stringValue(properties.errorref)
    eventDefinition = state.moddle.create('bpmn:ErrorEventDefinition', {
      errorRef: ref ? ensureGlobalReference(state, 'bpmn:Error', ref) : undefined,
      'flowable:errorVariableName': stringValue(properties.errorvariablename) || undefined,
      'flowable:errorVariableTransient': booleanValue(properties.errorvariabletransient),
      'flowable:errorVariableLocalScope': booleanValue(properties.errorvariablelocalscope),
    }) as ModdleElement
  } else if (stencil.includes('Escalation')) {
    const ref = stringValue(properties.escalationref)
    eventDefinition = state.moddle.create('bpmn:EscalationEventDefinition', {
      escalationRef: ref ? ensureGlobalReference(state, 'bpmn:Escalation', ref) : undefined,
    }) as ModdleElement
  } else if (stencil.includes('Cancel')) {
    eventDefinition = state.moddle.create('bpmn:CancelEventDefinition') as ModdleElement
  } else if (stencil.includes('Terminate')) {
    eventDefinition = state.moddle.create('bpmn:TerminateEventDefinition', {
      terminateAll: booleanValue(properties.terminateall),
      terminateMultiInstance: booleanValue(properties.terminateMultiInstance),
    }) as ModdleElement
  } else if (stencil.includes('Compensation')) {
    const activityRef = stringValue(properties.compensationactivityref)
    eventDefinition = state.moddle.create('bpmn:CompensateEventDefinition', {
      activityRef: activityRef ? state.semanticById.get(activityRef) : undefined,
    }) as ModdleElement
  } else if (stencil.includes('VariableListener')) {
    addExtension(state.moddle, semantic, 'flowable:VariableListenerEventDefinition', {
      variableName: stringValue(properties.variablelistenervariablename) || undefined,
      variableChangeType: stringValue(properties.variablelistenervariablechangetype) || undefined,
    })
  } else if (stencil.includes('EventRegistry')) {
    const bodyExtensions: Record<string, string> = {
      EventType: 'eventkey',
      EventName: 'eventname',
      ChannelKey: 'channelkey',
      ChannelName: 'channelname',
      ChannelType: 'channeltype',
      ChannelDestination: 'channeldestination',
    }
    for (const [type, property] of Object.entries(bodyExtensions)) {
      const body = stringValue(properties[property])
      if (body) addExtension(state.moddle, semantic, `flowable:${type}`, { body })
    }
  }
  if (eventDefinition) semantic.eventDefinitions = [eventDefinition]
}

function applyOryxProperties(
  state: OryxImportState,
  shape: OryxShape,
  semantic: ModdleElement,
) {
  const properties = propertiesOf(shape)
  semantic.name = stringValue(properties.name) || undefined
  addDocumentation(state.moddle, semantic, properties.documentation)

  if (/Task$|Gateway$|Event$|Activity$|SubProcess$/.test(semantic.$type.replace('bpmn:', ''))) {
    setFlowableBoolean(semantic, 'async', properties.asynchronousdefinition)
    setFlowableBoolean(semantic, 'exclusive', properties.exclusivedefinition, true)
  }
  if (/Task$|Activity$|SubProcess$/.test(semantic.$type.replace('bpmn:', ''))) {
    semantic.isForCompensation = booleanValue(properties.isforcompensation)
    createMultiInstance(state, shape, semantic)
  }

  setFlowableIfText(semantic, 'skipExpression', properties.skipexpression)
  createListenerExtensions(state, shape, semantic)

  if (semantic.$type === 'bpmn:StartEvent') {
    setFlowableIfText(semantic, 'initiator', properties.initiator)
    setFlowableIfText(semantic, 'formKey', properties.formkeydefinition)
    setFlowableBoolean(semantic, 'formFieldValidation', properties.formfieldvalidation, true)
    semantic.isInterrupting = booleanValue(properties.interrupting, true)
    createFormPropertyExtensions(state, shape, semantic)
  } else if (semantic.$type === 'bpmn:UserTask') {
    const assignment = objectValue(parseNested(nestedProperty(shape, 'usertaskassignment').assignment))
    setFlowableIfText(semantic, 'assignee', assignment.assignee)
    setFlowableIfText(semantic, 'owner', assignment.owner)
    const candidateUsers = arrayValue<JsonObject>(assignment.candidateUsers)
      .map((candidate) => stringValue(candidate.value ?? candidate.id))
      .filter(Boolean)
    const candidateGroups = arrayValue<JsonObject>(assignment.candidateGroups)
      .map((candidate) => stringValue(candidate.value ?? candidate.id))
      .filter(Boolean)
    setFlowableIfText(semantic, 'candidateUsers', candidateUsers.join(','))
    setFlowableIfText(semantic, 'candidateGroups', candidateGroups.join(','))
    setFlowableIfText(semantic, 'priority', properties.prioritydefinition)
    setFlowableIfText(semantic, 'dueDate', properties.duedatedefinition)
    setFlowableIfText(semantic, 'businessCalendarName', properties.calendarname)
    setFlowableIfText(semantic, 'category', properties.categorydefinition)
    setFlowableIfText(semantic, 'taskIdVariableName', properties.taskidvariablename)
    setFlowableIfText(semantic, 'formKey', properties.formkeydefinition)
    setFlowableBoolean(semantic, 'formFieldValidation', properties.formfieldvalidation, true)
    createFormPropertyExtensions(state, shape, semantic)
  } else if (semantic.$type === 'bpmn:ServiceTask') {
    const serviceType = SERVICE_STENCIL_TYPES[stencilId(shape)] || ''
    if (serviceType) semantic['flowable:type'] = serviceType
    setFlowableIfText(semantic, 'class', properties.servicetaskclass)
    setFlowableIfText(semantic, 'expression', properties.servicetaskexpression)
    setFlowableIfText(semantic, 'delegateExpression', properties.servicetaskdelegateexpression)
    setFlowableIfText(semantic, 'resultVariableName', properties.servicetaskresultvariable)
    setFlowableBoolean(semantic, 'triggerable', properties.servicetasktriggerable)
    setFlowableBoolean(
      semantic,
      'useLocalScopeForResultVariable',
      properties.servicetaskuselocalscopeforresultvariable,
    )
    setFlowableBoolean(
      semantic,
      'storeResultVariableAsTransient',
      properties.servicetaskstoreresultvariabletransient,
    )
    if (serviceType === 'external-worker') setFlowableIfText(semantic, 'topic', properties.topic)
    createServiceExtensions(state, shape, semantic, serviceType)
  } else if (semantic.$type === 'bpmn:ScriptTask') {
    semantic.scriptFormat = stringValue(properties.scriptformat) || undefined
    semantic.script = stringValue(properties.scripttext) || undefined
    setFlowableBoolean(semantic, 'autoStoreVariables', properties.scriptautostorevariables)
  } else if (semantic.$type === 'bpmn:CallActivity') {
    semantic.calledElement = stringValue(properties.callactivitycalledelement) || undefined
    for (const [flowableName, oryxName] of Object.entries(FLOWABLE_ATTRIBUTE_TO_ORYX)) {
      if (!oryxName.startsWith('callactivity')) continue
      const value = properties[oryxName]
      if (typeof value === 'boolean') semantic[`flowable:${flowableName}`] = value
      else setFlowableIfText(semantic, flowableName, value)
    }
    createCallActivityMappings(state, shape, semantic)
  } else if (semantic.$type === 'bpmn:BoundaryEvent') {
    semantic.cancelActivity = booleanValue(properties.cancelactivity, true)
  }

  if (semantic.$type.endsWith('Event')) createEventDefinition(state, shape, semantic)

  if (semantic.$type === 'bpmn:SequenceFlow') {
    const condition = stringValue(properties.conditionsequenceflow)
    if (condition) {
      semantic.conditionExpression = state.moddle.create('bpmn:FormalExpression', { body: condition })
    }
    setFlowableIfText(semantic, 'skipExpression', properties.skipexpression)
  }
}

function semanticCollection(owner: ModdleElement, semantic: ModdleElement): ModdleElement[] {
  if (['bpmn:TextAnnotation', 'bpmn:Group', 'bpmn:Association'].includes(semantic.$type)) {
    return (owner.artifacts ||= []) as ModdleElement[]
  }
  return (owner.flowElements ||= []) as ModdleElement[]
}

function registerSemantic(state: OryxImportState, context: ShapeContext, semantic: ModdleElement) {
  context.semantic = semantic
  state.semanticByResourceId.set(context.shape.resourceId, semantic)
  state.semanticById.set(stringValue(semantic.id), semantic)
  semanticCollection(context.owner, semantic).push(semantic)
  if (context.lane && !CONNECTION_STENCILS.has(stencilId(context.shape))) {
    ;((context.lane.flowNodeRef ||= []) as ModdleElement[]).push(semantic)
  }
}

function collectConnectionSources(shapes: OryxShape[], target: Map<string, string>) {
  for (const shape of shapes) {
    for (const outgoing of arrayValue<{ resourceId?: unknown }>(shape.outgoing)) {
      const resourceId = stringValue(outgoing.resourceId)
      if (resourceId && !target.has(resourceId)) target.set(resourceId, shape.resourceId)
    }
    collectConnectionSources(shape.childShapes || [], target)
  }
}

function createNodeContext(
  state: OryxImportState,
  shape: OryxShape,
  owner: ModdleElement,
  process: ModdleElement,
  originX: number,
  originY: number,
  lane?: ModdleElement,
) {
  const localBounds = bounds(shape.bounds)
  const absoluteBounds = makeBounds(
    originX + localBounds.upperLeft.x,
    originY + localBounds.upperLeft.y,
    localBounds.lowerRight.x - localBounds.upperLeft.x,
    localBounds.lowerRight.y - localBounds.upperLeft.y,
  )
  const context: ShapeContext = { shape, originX, originY, absoluteBounds, owner, process, lane }
  state.shapeContexts.push(context)
  state.contextByResourceId.set(shape.resourceId, context)
  return context
}

function importShapeContainer(
  state: OryxImportState,
  shapes: OryxShape[],
  owner: ModdleElement,
  process: ModdleElement,
  originX: number,
  originY: number,
  lane?: ModdleElement,
) {
  for (const shape of shapes) {
    const stencil = stencilId(shape)
    if (CONNECTION_STENCILS.has(stencil)) {
      createNodeContext(state, shape, owner, process, originX, originY, lane)
      continue
    }
    if (stencil === 'Lane') {
      const context = createNodeContext(state, shape, owner, process, originX, originY)
      const laneSemantic = state.moddle.create('bpmn:Lane', {
        id: oryxElementId(shape),
        name: stringValue(propertyOf(shape, 'name')) || undefined,
        flowNodeRef: [],
      }) as ModdleElement
      context.semantic = laneSemantic
      state.semanticByResourceId.set(shape.resourceId, laneSemantic)
      state.semanticById.set(stringValue(laneSemantic.id), laneSemantic)
      let laneSet = arrayValue<ModdleElement>(process.laneSets)[0]
      if (!laneSet) {
        laneSet = state.moddle.create('bpmn:LaneSet', {
          id: `LaneSet_${stringValue(process.id)}`,
          lanes: [],
        }) as ModdleElement
        process.laneSets = [laneSet]
      }
      ;(laneSet.lanes as ModdleElement[]).push(laneSemantic)
      importShapeContainer(
        state,
        shape.childShapes || [],
        owner,
        process,
        context.absoluteBounds.upperLeft.x,
        context.absoluteBounds.upperLeft.y,
        laneSemantic,
      )
      continue
    }

    const type = STENCIL_TO_BPMN[stencil]
    if (!type) {
      throw new Error(
        `Unsupported Flowable Oryx stencil "${stencil}" on "${shape.resourceId}"`,
      )
    }
    const semantic = state.moddle.create(type, { id: oryxElementId(shape) }) as ModdleElement
    const context = createNodeContext(state, shape, owner, process, originX, originY, lane)
    registerSemantic(state, context, semantic)
    applyOryxProperties(state, shape, semantic)

    if (CONTAINER_STENCILS.has(stencil)) {
      if (stencil === 'EventSubProcess') semantic.triggeredByEvent = true
      if (stencil === 'AdhocSubProcess') {
        semantic.adHocOrdering = 'Parallel'
        semantic.completionCondition = state.moddle.create('bpmn:FormalExpression', {
          body: stringValue(propertyOf(shape, 'completioncondition')),
        })
      }
      importShapeContainer(
        state,
        shape.childShapes || [],
        semantic,
        process,
        stencil === 'CollapsedSubProcess' ? 0 : context.absoluteBounds.upperLeft.x,
        stencil === 'CollapsedSubProcess' ? 0 : context.absoluteBounds.upperLeft.y,
        undefined,
      )
    }
  }
}

function importPools(state: OryxImportState, model: OryxModel) {
  const poolShapes = model.childShapes.filter((shape) => stencilId(shape) === 'Pool')
  if (!poolShapes.length) {
    importShapeContainer(state, model.childShapes, state.mainProcess, state.mainProcess, 0, 0)
    return
  }

  const collaboration = state.moddle.create('bpmn:Collaboration', {
    id: 'Collaboration_flowable_modeler',
    participants: [],
    messageFlows: [],
  }) as ModdleElement
  state.collaboration = collaboration
  state.rootElements.push(collaboration)

  for (const poolShape of poolShapes) {
    const properties = propertiesOf(poolShape)
    const processId = stringValue(properties.process_id).trim()
    let process: ModdleElement | undefined
    if (processId) {
      process = state.rootElements.find(
        (element) => element.$type === 'bpmn:Process' && element.id === processId,
      )
      if (!process) {
        process = state.moddle.create('bpmn:Process', {
          id: processId,
          name: stringValue(properties.name) || undefined,
          isExecutable: booleanValue(properties.isexecutable, true),
          flowElements: [],
          laneSets: [],
          artifacts: [],
        }) as ModdleElement
        state.rootElements.push(process)
      }
    }

    const participantValues: JsonObject = {
      id: oryxElementId(poolShape),
      name: stringValue(properties.name) || undefined,
    }
    if (process) participantValues.processRef = process
    const participant = state.moddle.create(
      'bpmn:Participant',
      participantValues,
    ) as ModdleElement
    ;(collaboration.participants as ModdleElement[]).push(participant)
    const contextOwner = process || state.mainProcess
    const context = createNodeContext(state, poolShape, contextOwner, contextOwner, 0, 0)
    context.semantic = participant
    state.semanticByResourceId.set(poolShape.resourceId, participant)
    state.semanticById.set(stringValue(participant.id), participant)
    if (process) {
      importShapeContainer(
        state,
        poolShape.childShapes || [],
        process,
        process,
        context.absoluteBounds.upperLeft.x,
        context.absoluteBounds.upperLeft.y,
      )
    } else if (poolShape.childShapes?.length) {
      throw new Error(`Black-box pool "${poolShape.resourceId}" cannot contain child shapes`)
    }
  }

  for (const shape of model.childShapes.filter((candidate) => stencilId(candidate) !== 'Pool')) {
    if (stencilId(shape) === 'MessageFlow') {
      createNodeContext(state, shape, collaboration, state.mainProcess, 0, 0)
    } else {
      importShapeContainer(state, [shape], state.mainProcess, state.mainProcess, 0, 0)
    }
  }
}

function importConnections(state: OryxImportState) {
  for (const context of state.shapeContexts) {
    const stencil = stencilId(context.shape)
    if (!CONNECTION_STENCILS.has(stencil)) continue
    const type =
      stencil === 'MessageFlow'
        ? 'bpmn:MessageFlow'
        : stencil === 'Association'
          ? 'bpmn:Association'
          : stencil === 'DataAssociation'
            ? 'bpmn:Association'
            : 'bpmn:SequenceFlow'
    const semantic = state.moddle.create(type, { id: oryxElementId(context.shape) }) as ModdleElement
    context.semantic = semantic
    state.semanticByResourceId.set(context.shape.resourceId, semantic)
    state.semanticById.set(stringValue(semantic.id), semantic)
    applyOryxProperties(state, context.shape, semantic)

    const sourceResource = state.sourceResourceByConnection.get(context.shape.resourceId)
    const targetResource = stringValue(context.shape.target?.resourceId)
    const source = sourceResource ? state.semanticByResourceId.get(sourceResource) : undefined
    const target = targetResource ? state.semanticByResourceId.get(targetResource) : undefined
    if (source) semantic.sourceRef = source
    if (target) semantic.targetRef = target

    if (semantic.$type === 'bpmn:SequenceFlow') {
      semanticCollection(context.owner, semantic).push(semantic)
      if (source) ((source.outgoing ||= []) as ModdleElement[]).push(semantic)
      if (target) ((target.incoming ||= []) as ModdleElement[]).push(semantic)
      if (source && booleanValue(propertyOf(context.shape, 'defaultflow'))) source.default = semantic
    } else if (semantic.$type === 'bpmn:MessageFlow' && state.collaboration) {
      ;((state.collaboration.messageFlows ||= []) as ModdleElement[]).push(semantic)
    } else {
      ;((context.owner.artifacts ||= []) as ModdleElement[]).push(semantic)
    }
  }

  for (const context of state.shapeContexts) {
    if (context.semantic?.$type !== 'bpmn:BoundaryEvent') continue
    const sourceResource = state.sourceResourceByConnection.get(context.shape.resourceId)
    const attachedTo = sourceResource ? state.semanticByResourceId.get(sourceResource) : undefined
    if (attachedTo) context.semantic.attachedToRef = attachedTo
  }
}

function connectionWaypoints(state: OryxImportState, context: ShapeContext): OryxPoint[] {
  const sourceResource = state.sourceResourceByConnection.get(context.shape.resourceId)
  const targetResource = stringValue(context.shape.target?.resourceId)
  const source = sourceResource ? state.contextByResourceId.get(sourceResource) : undefined
  const target = targetResource ? state.contextByResourceId.get(targetResource) : undefined
  const dockers = arrayValue<unknown>(context.shape.dockers).map(point)

  const sourceCenter = source
    ? {
        x: (source.absoluteBounds.upperLeft.x + source.absoluteBounds.lowerRight.x) / 2,
        y: (source.absoluteBounds.upperLeft.y + source.absoluteBounds.lowerRight.y) / 2,
      }
    : { x: context.absoluteBounds.upperLeft.x, y: context.absoluteBounds.upperLeft.y }
  const targetCenter = target
    ? {
        x: (target.absoluteBounds.upperLeft.x + target.absoluteBounds.lowerRight.x) / 2,
        y: (target.absoluteBounds.upperLeft.y + target.absoluteBounds.lowerRight.y) / 2,
      }
    : { x: context.absoluteBounds.lowerRight.x, y: context.absoluteBounds.lowerRight.y }

  if (dockers.length < 2) return [sourceCenter, targetCenter]
  return dockers.map((docker, index) => {
    if (index === 0 && source) {
      return {
        x: source.absoluteBounds.upperLeft.x + docker.x,
        y: source.absoluteBounds.upperLeft.y + docker.y,
      }
    }
    if (index === dockers.length - 1 && target) {
      return {
        x: target.absoluteBounds.upperLeft.x + docker.x,
        y: target.absoluteBounds.upperLeft.y + docker.y,
      }
    }
    return docker
  })
}

function createDiagramInterchange(state: OryxImportState) {
  const planeElements: ModdleElement[] = []
  for (const context of state.shapeContexts) {
    if (!context.semantic) continue
    const stencil = stencilId(context.shape)
    if (CONNECTION_STENCILS.has(stencil)) {
      const waypoints = connectionWaypoints(state, context).map((waypoint) =>
        state.moddle.create('dc:Point', { ...waypoint }),
      )
      planeElements.push(
        state.moddle.create('bpmndi:BPMNEdge', {
          id: `${stringValue(context.semantic.id)}_di`,
          bpmnElement: context.semantic,
          waypoint: waypoints,
        }) as ModdleElement,
      )
      continue
    }
    const shapeBounds = context.absoluteBounds
    const values: JsonObject = {
      id: `${stringValue(context.semantic.id)}_di`,
      bpmnElement: context.semantic,
      bounds: state.moddle.create('dc:Bounds', {
        x: shapeBounds.upperLeft.x,
        y: shapeBounds.upperLeft.y,
        width: Math.max(1, shapeBounds.lowerRight.x - shapeBounds.upperLeft.x),
        height: Math.max(1, shapeBounds.lowerRight.y - shapeBounds.upperLeft.y),
      }),
    }
    if (CONTAINER_STENCILS.has(stencil)) values.isExpanded = stencil !== 'CollapsedSubProcess'
    if (stencil === 'Pool' || stencil === 'Lane') values.isHorizontal = true
    planeElements.push(state.moddle.create('bpmndi:BPMNShape', values) as ModdleElement)
  }

  const plane = state.moddle.create('bpmndi:BPMNPlane', {
    id: 'BPMNPlane_flowable_modeler',
    bpmnElement: state.collaboration || state.mainProcess,
    planeElement: planeElements,
  }) as ModdleElement
  const diagram = state.moddle.create('bpmndi:BPMNDiagram', {
    id: 'BPMNDiagram_flowable_modeler',
    plane,
  }) as ModdleElement
  state.definitions.diagrams = [diagram]
}

function createProcessFromCanvas(moddle: BpmnModdle, model: OryxModel): ModdleElement {
  const properties = model.properties
  const process = moddle.create('bpmn:Process', {
    id: stringValue(properties.process_id) || 'Process_flowable_modeler',
    name: stringValue(properties.name) || undefined,
    isExecutable: booleanValue(properties.isexecutable, true),
    flowElements: [],
    artifacts: [],
    laneSets: [],
    'flowable:candidateStarterUsers': stringValue(properties.process_potentialstarteruser) || undefined,
    'flowable:candidateStarterGroups': stringValue(properties.process_potentialstartergroup) || undefined,
    'flowable:isEagerExecutionFetching': booleanValue(properties.iseagerexecutionfetch),
  }) as ModdleElement
  addDocumentation(moddle, process, properties.documentation)
  const historyLevel = stringValue(properties.process_historylevel)
  if (historyLevel) addExtension(moddle, process, 'flowable:HistoryLevel', { body: historyLevel })
  return process
}

export async function oryxJsonToBpmnXml(model: unknown): Promise<string> {
  assertOryxModel(model)
  const snapshot = deepClone(model)
  const processIds = new Set([
    stringValue(model.properties.process_id),
    ...model.childShapes
      .filter((shape) => stencilId(shape) === 'Pool')
      .map((shape) => stringValue(propertyOf(shape, 'process_id'))),
  ])
  for (const processId of processIds) {
    if (processId) snapshotByProcessId.set(processId, snapshot)
  }

  const rawXml = stringValue(model[RAW_XML_PROPERTY])
  const storedFingerprint = stringValue(model[FINGERPRINT_PROPERTY])
  if (rawXml && storedFingerprint && storedFingerprint === propertyFingerprint(model)) {
    return rawXml
  }

  const moddle = createModdle()
  const mainProcess = createProcessFromCanvas(moddle, model)
  const rootElements: ModdleElement[] = [mainProcess]
  const definitions = moddle.create('bpmn:Definitions', {
    id: 'Definitions_flowable_modeler',
    targetNamespace:
      stringValue(model.properties.process_namespace) || 'http://flowable.org/processdef',
    exporter: 'flowable-modeler',
    exporterVersion: String(CONVERTER_VERSION),
    rootElements,
  }) as ModdleElement
  const state: OryxImportState = {
    moddle,
    definitions,
    mainProcess,
    rootElements,
    shapeContexts: [],
    contextByResourceId: new Map(),
    semanticByResourceId: new Map(),
    semanticById: new Map([[stringValue(mainProcess.id), mainProcess]]),
    sourceResourceByConnection: new Map(),
    globalById: new Map(),
  }
  collectConnectionSources(model.childShapes, state.sourceResourceByConnection)
  createGlobalDefinitions(state, model)
  importPools(state, model)
  importConnections(state)
  createDiagramInterchange(state)
  const result = await moddle.toXML(definitions, { format: true, preamble: true })
  return result.xml
}

interface XmlExportState {
  moddle: BpmnModdle
  definitions: ModdleElement
  process: ModdleElement
  snapshot?: OryxModel
  existingShapes: Map<string, OryxShape>
  shapeByElementId: Map<string, OryxShape>
  diShapeByElementId: Map<string, ModdleElement>
  diEdgeByElementId: Map<string, ModdleElement>
  fallbackPosition: number
}

function elementId(element: ModdleElement | undefined): string {
  return stringValue(element?.id)
}

function referencedElement(value: unknown): ModdleElement | undefined {
  return isObject(value) && typeof value.$type === 'string' ? (value as ModdleElement) : undefined
}

function referenceId(value: unknown): string {
  if (typeof value === 'string') return value
  return elementId(referencedElement(value))
}

function bodyOf(expression: unknown): string {
  if (!isObject(expression)) return stringValue(expression)
  return stringValue(expression.body ?? expression.text ?? expression.value)
}

function diElementReference(diElement: ModdleElement): string {
  return referenceId(diElement.bpmnElement)
}

function createDiIndexes(definitions: ModdleElement) {
  const shapeMap = new Map<string, ModdleElement>()
  const edgeMap = new Map<string, ModdleElement>()
  for (const diagram of arrayValue<ModdleElement>(definitions.diagrams)) {
    const plane = referencedElement(diagram.plane)
    for (const planeElement of arrayValue<ModdleElement>(plane?.planeElement)) {
      const id = diElementReference(planeElement)
      if (!id) continue
      if (planeElement.$type === 'bpmndi:BPMNEdge') edgeMap.set(id, planeElement)
      else if (planeElement.$type === 'bpmndi:BPMNShape') shapeMap.set(id, planeElement)
    }
  }
  return { shapeMap, edgeMap }
}

function fallbackDimensions(type: string) {
  if (type.includes('Event')) return { width: 36, height: 36 }
  if (type.includes('Gateway')) return { width: 50, height: 50 }
  if (type === 'bpmn:Participant') return { width: 900, height: 260 }
  if (type === 'bpmn:Lane') return { width: 870, height: 130 }
  if (type === 'bpmn:SubProcess') return { width: 360, height: 220 }
  if (type === 'bpmn:TextAnnotation') return { width: 100, height: 50 }
  return { width: 110, height: 80 }
}

function absoluteElementBounds(state: XmlExportState, element: ModdleElement): OryxBounds {
  const diShape = state.diShapeByElementId.get(elementId(element))
  const diBounds = objectValue(diShape?.bounds)
  if (diBounds.x !== undefined && diBounds.y !== undefined) {
    return makeBounds(
      numberValue(diBounds.x),
      numberValue(diBounds.y),
      numberValue(diBounds.width, 1),
      numberValue(diBounds.height, 1),
    )
  }
  const dimensions = fallbackDimensions(element.$type)
  const position = state.fallbackPosition++
  return makeBounds(120 + (position % 6) * 170, 120 + Math.floor(position / 6) * 130, dimensions.width, dimensions.height)
}

function listenerExtensionsToJson(element: ModdleElement, type: string) {
  return extensionsOfType(element, type).map((listener) => {
    const value: JsonObject = { event: stringValue(listener.event) }
    setIfText(value, 'className', listener.class)
    setIfText(value, 'expression', listener.expression)
    setIfText(value, 'delegateExpression', listener.delegateExpression)
    const fields = arrayValue<ModdleElement>(listener.fields).map((field) => {
      const fieldValue: JsonObject = { name: stringValue(field.name) }
      setIfText(fieldValue, 'stringValue', field.stringValue ?? field.string)
      setIfText(fieldValue, 'expression', field.expression)
      return fieldValue
    })
    if (fields.length) value.fields = fields
    return value
  })
}

function formPropertiesToJson(element: ModdleElement) {
  return extensionsOfType(element, 'flowable:FormProperty').map((formProperty) => {
    const value: JsonObject = {
      id: stringValue(formProperty.id),
      name: stringValue(formProperty.name),
      type: stringValue(formProperty.type),
      variable: stringValue(formProperty.variable),
      expression: stringValue(formProperty.expression),
      default: stringValue(formProperty.default),
      datePattern: stringValue(formProperty.datePattern),
      readable: booleanValue(formProperty.readable, true),
      writable: booleanValue(formProperty.writable, true),
      required: booleanValue(formProperty.required),
    }
    const enumValues = arrayValue<ModdleElement>(formProperty.values).map((enumValue) => ({
      id: stringValue(enumValue.id),
      name: stringValue(enumValue.name),
    }))
    if (enumValues.length) value.enumValues = enumValues
    return value
  })
}

function flowableFields(element: ModdleElement) {
  return extensionsOfType(element, 'flowable:Field')
}

function fieldValue(field: ModdleElement): string {
  return stringValue(field.stringValue ?? field.string ?? field.expression)
}

function fieldsToOryx(fields: ModdleElement[]) {
  return fields.map((field) => {
    const value: JsonObject = { name: stringValue(field.name) }
    setIfText(value, 'stringValue', field.stringValue ?? field.string)
    setIfText(value, 'expression', field.expression)
    return value
  })
}

function mappingsToOryx(element: ModdleElement, type: 'flowable:In' | 'flowable:Out') {
  return extensionsOfType(element, type).map((mapping) => ({
    source: stringValue(mapping.source) || null,
    sourceExpression: stringValue(mapping.sourceExpression) || null,
    target: stringValue(mapping.target) || null,
  }))
}

function applyXmlMultiInstance(properties: JsonObject, semantic: ModdleElement) {
  const loop = referencedElement(semantic.loopCharacteristics)
  if (!loop || loop.$type !== 'bpmn:MultiInstanceLoopCharacteristics') return
  properties.multiinstance_type = booleanValue(loop.isSequential) ? 'Sequential' : 'Parallel'
  setIfText(properties, 'multiinstance_cardinality', bodyOf(loop.loopCardinality))
  setIfText(properties, 'multiinstance_collection', flowableValue(loop, 'collection'))
  setIfText(properties, 'multiinstance_variable', flowableValue(loop, 'elementVariable'))
  setIfText(properties, 'multiinstance_index_variable', flowableValue(loop, 'elementIndexVariable'))
  setIfText(properties, 'multiinstance_condition', bodyOf(loop.completionCondition))

  const aggregations = extensionsOfType(loop, 'flowable:VariableAggregation').map((aggregation) => ({
    target: stringValue(aggregation.target),
    targetExpression: stringValue(aggregation.targetExpression),
    storeAsTransient: booleanValue(aggregation.storeAsTransientVariable),
    createOverview: booleanValue(aggregation.createOverviewVariable),
    class: stringValue(aggregation.class),
    delegateExpression: stringValue(aggregation.delegateExpression),
    definitions: arrayValue<ModdleElement>(moddleValue(aggregation, 'bpmn:variable')).map(
      (definition) => ({
        source: stringValue(definition.source),
        sourceExpression: stringValue(definition.sourceExpression),
        target: stringValue(definition.target),
        targetExpression: stringValue(definition.targetExpression),
      }),
    ),
  }))
  if (aggregations.length) properties.multiinstance_variableaggregations = { aggregations }
}

function applyXmlEventProperties(properties: JsonObject, semantic: ModdleElement) {
  const eventDefinition = arrayValue<ModdleElement>(semantic.eventDefinitions)[0]
  if (eventDefinition?.$type === 'bpmn:TimerEventDefinition') {
    setIfText(properties, 'timerdatedefinition', bodyOf(eventDefinition.timeDate))
    setIfText(properties, 'timercycledefinition', bodyOf(eventDefinition.timeCycle))
    setIfText(properties, 'timerdurationdefinition', bodyOf(eventDefinition.timeDuration))
    const cycle = referencedElement(eventDefinition.timeCycle)
    setIfText(properties, 'timerenddatedefinition', flowableValue(cycle, 'endDate'))
    setIfText(properties, 'calendarname', flowableValue(eventDefinition, 'businessCalendarName'))
  } else if (eventDefinition?.$type === 'bpmn:ConditionalEventDefinition') {
    setIfText(properties, 'conditionaleventcondition', bodyOf(eventDefinition.condition))
  } else if (eventDefinition?.$type === 'bpmn:MessageEventDefinition') {
    setIfText(properties, 'messageref', referenceId(eventDefinition.messageRef))
    setIfText(properties, 'messageexpression', flowableValue(eventDefinition, 'messageExpression'))
  } else if (eventDefinition?.$type === 'bpmn:SignalEventDefinition') {
    setIfText(properties, 'signalref', referenceId(eventDefinition.signalRef))
    setIfText(properties, 'signalexpression', flowableValue(eventDefinition, 'signalExpression'))
    if (flowableValue(eventDefinition, 'async') !== undefined) {
      properties.asynchronousdefinition = booleanValue(flowableValue(eventDefinition, 'async'))
    }
  } else if (eventDefinition?.$type === 'bpmn:ErrorEventDefinition') {
    const error = referencedElement(eventDefinition.errorRef)
    setIfText(properties, 'errorref', error?.errorCode ?? error?.id)
    setIfText(properties, 'errorvariablename', flowableValue(eventDefinition, 'errorVariableName'))
    properties.errorvariabletransient = booleanValue(flowableValue(eventDefinition, 'errorVariableTransient'))
    properties.errorvariablelocalscope = booleanValue(flowableValue(eventDefinition, 'errorVariableLocalScope'))
  } else if (eventDefinition?.$type === 'bpmn:EscalationEventDefinition') {
    const escalation = referencedElement(eventDefinition.escalationRef)
    setIfText(properties, 'escalationref', escalation?.escalationCode ?? escalation?.id)
  } else if (eventDefinition?.$type === 'bpmn:TerminateEventDefinition') {
    properties.terminateall = booleanValue(eventDefinition.terminateAll)
    properties.terminateMultiInstance = booleanValue(eventDefinition.terminateMultiInstance)
  } else if (eventDefinition?.$type === 'bpmn:CompensateEventDefinition') {
    setIfText(properties, 'compensationactivityref', referenceId(eventDefinition.activityRef))
  }

  const variableListener = extensionsOfType(
    semantic,
    'flowable:VariableListenerEventDefinition',
  )[0]
  if (variableListener) {
    setIfText(properties, 'variablelistenervariablename', variableListener.variableName)
    setIfText(properties, 'variablelistenervariablechangetype', variableListener.variableChangeType)
  }
  const registryMapping: Record<string, string> = {
    'flowable:EventType': 'eventkey',
    'flowable:EventName': 'eventname',
    'flowable:ChannelKey': 'channelkey',
    'flowable:ChannelName': 'channelname',
    'flowable:ChannelType': 'channeltype',
    'flowable:ChannelDestination': 'channeldestination',
  }
  for (const [type, property] of Object.entries(registryMapping)) {
    setIfText(properties, property, extensionBody(semantic, type))
  }
}

function semanticProperties(semantic: ModdleElement): JsonObject {
  const properties: JsonObject = { overrideid: elementId(semantic) }
  setIfText(properties, 'name', semantic.name)
  setIfText(properties, 'documentation', documentationText(semantic))

  if (/Task$|Gateway$|Event$|Activity$|SubProcess$/.test(semantic.$type.replace('bpmn:', ''))) {
    properties.asynchronousdefinition = booleanValue(flowableValue(semantic, 'async'))
    properties.exclusivedefinition = booleanValue(flowableValue(semantic, 'exclusive'), true)
  }
  if (/Task$|Activity$|SubProcess$/.test(semantic.$type.replace('bpmn:', ''))) {
    properties.isforcompensation = booleanValue(semantic.isForCompensation)
    applyXmlMultiInstance(properties, semantic)
  }
  setIfText(properties, 'skipexpression', flowableValue(semantic, 'skipExpression'))

  const executionListeners = listenerExtensionsToJson(semantic, 'flowable:ExecutionListener')
  if (executionListeners.length) properties.executionlisteners = { executionListeners }
  const taskListeners = listenerExtensionsToJson(semantic, 'flowable:TaskListener')
  if (taskListeners.length) properties.tasklisteners = { taskListeners }

  if (semantic.$type === 'bpmn:StartEvent') {
    setIfText(properties, 'initiator', flowableValue(semantic, 'initiator'))
    setIfText(properties, 'formkeydefinition', flowableValue(semantic, 'formKey'))
    properties.formfieldvalidation = booleanValue(flowableValue(semantic, 'formFieldValidation'), true)
    properties.interrupting = booleanValue(semantic.isInterrupting, true)
  } else if (semantic.$type === 'bpmn:UserTask') {
    const assignment: JsonObject = { type: 'static' }
    setIfText(assignment, 'assignee', flowableValue(semantic, 'assignee'))
    setIfText(assignment, 'owner', flowableValue(semantic, 'owner'))
    const users = stringValue(flowableValue(semantic, 'candidateUsers'))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ value }))
    const groups = stringValue(flowableValue(semantic, 'candidateGroups'))
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .map((value) => ({ value }))
    if (users.length) assignment.candidateUsers = users
    if (groups.length) assignment.candidateGroups = groups
    if (Object.keys(assignment).length > 1) properties.usertaskassignment = { assignment }
    setIfText(properties, 'prioritydefinition', flowableValue(semantic, 'priority'))
    setIfText(properties, 'duedatedefinition', flowableValue(semantic, 'dueDate'))
    setIfText(properties, 'calendarname', flowableValue(semantic, 'businessCalendarName'))
    setIfText(properties, 'categorydefinition', flowableValue(semantic, 'category'))
    setIfText(properties, 'taskidvariablename', flowableValue(semantic, 'taskIdVariableName'))
    setIfText(properties, 'formkeydefinition', flowableValue(semantic, 'formKey'))
    properties.formfieldvalidation = booleanValue(flowableValue(semantic, 'formFieldValidation'), true)
  } else if (semantic.$type === 'bpmn:ServiceTask') {
    setIfText(properties, 'servicetaskclass', flowableValue(semantic, 'class'))
    setIfText(properties, 'servicetaskexpression', flowableValue(semantic, 'expression'))
    setIfText(
      properties,
      'servicetaskdelegateexpression',
      flowableValue(semantic, 'delegateExpression'),
    )
    setIfText(
      properties,
      'servicetaskresultvariable',
      flowableValue(semantic, 'resultVariableName') ?? flowableValue(semantic, 'resultVariable'),
    )
    properties.servicetasktriggerable = booleanValue(flowableValue(semantic, 'triggerable'))
    properties.servicetaskuselocalscopeforresultvariable = booleanValue(
      flowableValue(semantic, 'useLocalScopeForResultVariable'),
    )
    properties.servicetaskstoreresultvariabletransient = booleanValue(
      flowableValue(semantic, 'storeResultVariableAsTransient'),
    )
    const retryCycle = extensionBody(semantic, 'flowable:FailedJobRetryTimeCycle')
    setIfText(properties, 'servicetaskfailedjobretrytimecycle', retryCycle)
    const fields = flowableFields(semantic)
    if (fields.length) properties.servicetaskfields = { fields: fieldsToOryx(fields) }
    const serviceType = stringValue(flowableValue(semantic, 'type')).toLowerCase()
    for (const [fieldName, propertyName] of Object.entries(SERVICE_FIELD_PROPERTIES[serviceType] || {})) {
      const field = fields.find((candidate) => stringValue(candidate.name) === fieldName)
      if (field) properties[propertyName] = fieldValue(field)
    }
    if (serviceType === 'external-worker') setIfText(properties, 'topic', flowableValue(semantic, 'topic'))
    const exceptions = extensionsOfType(semantic, 'flowable:MapException').map((exception) => ({
      class: stringValue(exception.class ?? exception.body),
      code: stringValue(exception.errorCode),
      children: booleanValue(exception.includeChildExceptions),
    }))
    if (exceptions.length) properties.servicetaskexceptions = { exceptions }
  } else if (semantic.$type === 'bpmn:ScriptTask') {
    setIfText(properties, 'scriptformat', semantic.scriptFormat)
    setIfText(properties, 'scripttext', semantic.script)
    properties.scriptautostorevariables = booleanValue(flowableValue(semantic, 'autoStoreVariables'))
  } else if (semantic.$type === 'bpmn:CallActivity') {
    setIfText(properties, 'callactivitycalledelement', semantic.calledElement)
    for (const [flowableName, oryxName] of Object.entries(FLOWABLE_ATTRIBUTE_TO_ORYX)) {
      if (!oryxName.startsWith('callactivity')) continue
      const value = flowableValue(semantic, flowableName)
      if (value !== undefined && value !== null && value !== '') properties[oryxName] = value
    }
    const inParameters = mappingsToOryx(semantic, 'flowable:In')
    const outParameters = mappingsToOryx(semantic, 'flowable:Out')
    if (inParameters.length) properties.callactivityinparameters = { inParameters }
    if (outParameters.length) properties.callactivityoutparameters = { outParameters }
  } else if (semantic.$type === 'bpmn:BoundaryEvent') {
    properties.cancelactivity = booleanValue(semantic.cancelActivity, true)
  } else if (semantic.$type === 'bpmn:SequenceFlow') {
    setIfText(properties, 'conditionsequenceflow', bodyOf(semantic.conditionExpression))
    const source = referencedElement(semantic.sourceRef)
    if (source?.default === semantic) properties.defaultflow = true
  }

  if (semantic.$type.endsWith('Event')) applyXmlEventProperties(properties, semantic)

  const formProperties = formPropertiesToJson(semantic)
  if (formProperties.length) properties.formproperties = { formProperties }
  return properties
}

function semanticStencil(semantic: ModdleElement, diShape?: ModdleElement): string {
  if (semantic.$type === 'bpmn:ServiceTask') {
    return SERVICE_TYPE_STENCILS[stringValue(flowableValue(semantic, 'type')).toLowerCase()] || 'ServiceTask'
  }
  if (semantic.$type === 'bpmn:StartEvent') {
    const definition = arrayValue<ModdleElement>(semantic.eventDefinitions)[0]
    if (extensionsOfType(semantic, 'flowable:VariableListenerEventDefinition').length) {
      return 'StartVariableListenerEvent'
    }
    if (extensionBody(semantic, 'flowable:EventType')) return 'StartEventRegistryEvent'
    const suffix = eventDefinitionStencilSuffix(definition)
    return suffix ? `Start${suffix}Event` : 'StartNoneEvent'
  }
  if (semantic.$type === 'bpmn:EndEvent') {
    const definition = arrayValue<ModdleElement>(semantic.eventDefinitions)[0]
    const suffix = eventDefinitionStencilSuffix(definition)
    return suffix ? `End${suffix}Event` : 'EndNoneEvent'
  }
  if (semantic.$type === 'bpmn:IntermediateCatchEvent') {
    if (extensionsOfType(semantic, 'flowable:VariableListenerEventDefinition').length) {
      return 'CatchVariableListenerEvent'
    }
    if (extensionBody(semantic, 'flowable:EventType')) return 'CatchEventRegistryEvent'
    return `Catch${eventDefinitionStencilSuffix(arrayValue<ModdleElement>(semantic.eventDefinitions)[0]) || 'Timer'}Event`
  }
  if (semantic.$type === 'bpmn:IntermediateThrowEvent') {
    const suffix = eventDefinitionStencilSuffix(arrayValue<ModdleElement>(semantic.eventDefinitions)[0])
    return suffix ? `Throw${suffix}Event` : 'ThrowNoneEvent'
  }
  if (semantic.$type === 'bpmn:BoundaryEvent') {
    if (extensionsOfType(semantic, 'flowable:VariableListenerEventDefinition').length) {
      return 'BoundaryVariableListenerEvent'
    }
    if (extensionBody(semantic, 'flowable:EventType')) return 'BoundaryEventRegistryEvent'
    return `Boundary${eventDefinitionStencilSuffix(arrayValue<ModdleElement>(semantic.eventDefinitions)[0]) || 'Timer'}Event`
  }
  const typeMap: Record<string, string> = {
    'bpmn:Task': 'Task',
    'bpmn:UserTask': 'UserTask',
    'bpmn:ScriptTask': 'ScriptTask',
    'bpmn:BusinessRuleTask': 'BusinessRule',
    'bpmn:ManualTask': 'ManualTask',
    'bpmn:ReceiveTask': 'ReceiveTask',
    'bpmn:SendTask': 'SendTask',
    'bpmn:CallActivity': 'CallActivity',
    'bpmn:ExclusiveGateway': 'ExclusiveGateway',
    'bpmn:ParallelGateway': 'ParallelGateway',
    'bpmn:InclusiveGateway': 'InclusiveGateway',
    'bpmn:ComplexGateway': 'ComplexGateway',
    'bpmn:EventBasedGateway': 'EventGateway',
    'bpmn:SequenceFlow': 'SequenceFlow',
    'bpmn:MessageFlow': 'MessageFlow',
    'bpmn:Association': 'Association',
    'bpmn:TextAnnotation': 'TextAnnotation',
    'bpmn:DataObjectReference': 'DataObject',
    'bpmn:DataStoreReference': 'DataStore',
    'bpmn:Group': 'Group',
  }
  if (semantic.$type === 'bpmn:SubProcess') {
    if (booleanValue(semantic.triggeredByEvent)) return 'EventSubProcess'
    return diShape?.isExpanded === false ? 'CollapsedSubProcess' : 'SubProcess'
  }
  return typeMap[semantic.$type] || semantic.$type.replace('bpmn:', '')
}

function eventDefinitionStencilSuffix(definition?: ModdleElement): string {
  const typeMap: Record<string, string> = {
    'bpmn:TimerEventDefinition': 'Timer',
    'bpmn:MessageEventDefinition': 'Message',
    'bpmn:SignalEventDefinition': 'Signal',
    'bpmn:ErrorEventDefinition': 'Error',
    'bpmn:EscalationEventDefinition': 'Escalation',
    'bpmn:ConditionalEventDefinition': 'Conditional',
    'bpmn:CancelEventDefinition': 'Cancel',
    'bpmn:TerminateEventDefinition': 'Terminate',
    'bpmn:CompensateEventDefinition': 'Compensation',
  }
  return definition ? typeMap[definition.$type] || '' : ''
}

function baseOryxShape(
  state: XmlExportState,
  semantic: ModdleElement,
  stencil: string,
  shapeBounds: OryxBounds,
): OryxShape {
  const id = elementId(semantic)
  const existing = state.existingShapes.get(id)
  const generated: OryxShape = {
    resourceId: existing?.resourceId || id,
    properties: semanticProperties(semantic),
    stencil: { id: stencil },
    childShapes: [],
    outgoing: [],
    bounds: shapeBounds,
    dockers: [],
  }
  const merged = mergeShapeWithSnapshot(generated, existing)
  state.shapeByElementId.set(id, merged)
  return merged
}

function relativeBounds(absolute: OryxBounds, originX: number, originY: number): OryxBounds {
  return {
    upperLeft: {
      x: absolute.upperLeft.x - originX,
      y: absolute.upperLeft.y - originY,
    },
    lowerRight: {
      x: absolute.lowerRight.x - originX,
      y: absolute.lowerRight.y - originY,
    },
  }
}

function processArtifacts(process: ModdleElement): ModdleElement[] {
  return arrayValue<ModdleElement>(process.artifacts)
}

function shapeForSemantic(
  state: XmlExportState,
  semantic: ModdleElement,
  originX: number,
  originY: number,
): OryxShape {
  const absolute = absoluteElementBounds(state, semantic)
  const stencil = semanticStencil(
    semantic,
    state.diShapeByElementId.get(elementId(semantic)),
  )
  const shape = baseOryxShape(
    state,
    semantic,
    stencil,
    relativeBounds(absolute, originX, originY),
  )
  if (semantic.$type === 'bpmn:SubProcess') {
    const children = [
      ...arrayValue<ModdleElement>(semantic.flowElements),
      ...arrayValue<ModdleElement>(semantic.artifacts),
    ]
    const childOrigin = stencil === 'CollapsedSubProcess'
      ? { x: 0, y: 0 }
      : absolute.upperLeft
    shape.childShapes = shapesForElements(
      state,
      children,
      childOrigin.x,
      childOrigin.y,
    )
  }
  return shape
}

function connectionPoints(state: XmlExportState, semantic: ModdleElement): OryxPoint[] {
  const edge = state.diEdgeByElementId.get(elementId(semantic))
  const waypoints = arrayValue<ModdleElement>(edge?.waypoint).map((waypoint) => ({
    x: numberValue(waypoint.x),
    y: numberValue(waypoint.y),
  }))
  if (waypoints.length >= 2) return waypoints
  const source = referencedElement(semantic.sourceRef)
  const target = referencedElement(semantic.targetRef)
  const sourceBounds = source ? absoluteElementBounds(state, source) : makeBounds(0, 0, 1, 1)
  const targetBounds = target ? absoluteElementBounds(state, target) : makeBounds(100, 0, 1, 1)
  return [
    {
      x: (sourceBounds.upperLeft.x + sourceBounds.lowerRight.x) / 2,
      y: (sourceBounds.upperLeft.y + sourceBounds.lowerRight.y) / 2,
    },
    {
      x: (targetBounds.upperLeft.x + targetBounds.lowerRight.x) / 2,
      y: (targetBounds.upperLeft.y + targetBounds.lowerRight.y) / 2,
    },
  ]
}

function shapeForConnection(
  state: XmlExportState,
  semantic: ModdleElement,
  originX: number,
  originY: number,
): OryxShape {
  const points = connectionPoints(state, semantic)
  const minX = Math.min(...points.map((point) => point.x))
  const minY = Math.min(...points.map((point) => point.y))
  const maxX = Math.max(...points.map((point) => point.x))
  const maxY = Math.max(...points.map((point) => point.y))
  const shape = baseOryxShape(
    state,
    semantic,
    semanticStencil(semantic),
    makeBounds(minX - originX, minY - originY, Math.max(1, maxX - minX), Math.max(1, maxY - minY)),
  )
  const source = referencedElement(semantic.sourceRef)
  const target = referencedElement(semantic.targetRef)
  const sourceBounds = source ? absoluteElementBounds(state, source) : undefined
  const targetBounds = target ? absoluteElementBounds(state, target) : undefined
  shape.dockers = points.map((waypoint, index) => {
    if (index === 0 && sourceBounds) {
      return {
        x: waypoint.x - sourceBounds.upperLeft.x,
        y: waypoint.y - sourceBounds.upperLeft.y,
      }
    }
    if (index === points.length - 1 && targetBounds) {
      return {
        x: waypoint.x - targetBounds.upperLeft.x,
        y: waypoint.y - targetBounds.upperLeft.y,
      }
    }
    return waypoint
  })
  if (target) shape.target = { resourceId: state.shapeByElementId.get(elementId(target))?.resourceId || elementId(target) }
  return shape
}

function shapesForElements(
  state: XmlExportState,
  elements: ModdleElement[],
  originX: number,
  originY: number,
): OryxShape[] {
  const nodes = elements.filter(
    (element) => !['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association'].includes(element.$type),
  )
  const connections = elements.filter((element) =>
    ['bpmn:SequenceFlow', 'bpmn:MessageFlow', 'bpmn:Association'].includes(element.$type),
  )
  const result = nodes.map((element) => shapeForSemantic(state, element, originX, originY))
  result.push(...connections.map((element) => shapeForConnection(state, element, originX, originY)))
  return result
}

function laneElements(process: ModdleElement) {
  const byLane = new Map<string, Set<string>>()
  const lanes: ModdleElement[] = []
  for (const laneSet of arrayValue<ModdleElement>(process.laneSets)) {
    for (const lane of arrayValue<ModdleElement>(laneSet.lanes)) {
      lanes.push(lane)
      byLane.set(elementId(lane), new Set(arrayValue<ModdleElement>(lane.flowNodeRef).map(elementId)))
    }
  }
  return { lanes, byLane }
}

function processShapesInPool(
  state: XmlExportState,
  process: ModdleElement,
  poolAbsolute: OryxBounds,
): OryxShape[] {
  const flowElements = arrayValue<ModdleElement>(process.flowElements)
  const { lanes, byLane } = laneElements(process)
  const assigned = new Set<string>()
  const result: OryxShape[] = []

  for (const lane of lanes) {
    const ids = byLane.get(elementId(lane)) || new Set<string>()
    const laneOwned = flowElements.filter((element) => {
      if (ids.has(elementId(element))) return true
      if (element.$type === 'bpmn:SequenceFlow') return ids.has(referenceId(element.sourceRef))
      if (element.$type === 'bpmn:BoundaryEvent') return ids.has(referenceId(element.attachedToRef))
      return false
    })
    laneOwned.forEach((element) => assigned.add(elementId(element)))
    const absolute = absoluteElementBounds(state, lane)
    const laneShape = baseOryxShape(
      state,
      lane,
      'Lane',
      relativeBounds(absolute, poolAbsolute.upperLeft.x, poolAbsolute.upperLeft.y),
    )
    laneShape.childShapes = shapesForElements(
      state,
      laneOwned,
      absolute.upperLeft.x,
      absolute.upperLeft.y,
    )
    result.push(laneShape)
  }

  const unassigned = flowElements.filter((element) => !assigned.has(elementId(element)))
  if (unassigned.length) {
    const poolWidth = Math.max(1, poolAbsolute.lowerRight.x - poolAbsolute.upperLeft.x)
    const poolHeight = Math.max(1, poolAbsolute.lowerRight.y - poolAbsolute.upperLeft.y)
    const labelWidth = Math.min(30, poolWidth - 1)
    const laneAbsolute = makeBounds(
      poolAbsolute.upperLeft.x + labelWidth,
      poolAbsolute.upperLeft.y,
      Math.max(1, poolWidth - labelWidth),
      poolHeight,
    )
    const laneIds = new Set(lanes.map(elementId))
    const baseId = `Lane_flowable_unassigned_${elementId(process)}`
    let laneId = baseId
    let suffix = 2
    while (laneIds.has(laneId)) laneId = `${baseId}_${suffix++}`
    const lane = {
      $type: 'bpmn:Lane',
      id: laneId,
      name: '',
    } as ModdleElement
    const laneShape = baseOryxShape(
      state,
      lane,
      'Lane',
      relativeBounds(laneAbsolute, poolAbsolute.upperLeft.x, poolAbsolute.upperLeft.y),
    )
    laneShape.childShapes = shapesForElements(
      state,
      unassigned,
      laneAbsolute.upperLeft.x,
      laneAbsolute.upperLeft.y,
    )
    result.push(laneShape)
  }
  return result
}

function populateOutgoing(state: XmlExportState) {
  const allElements = allSemanticElements(state.definitions)
  const connectionTypes = new Set([
    'bpmn:SequenceFlow',
    'bpmn:MessageFlow',
    'bpmn:Association',
  ])
  for (const [id, shape] of state.shapeByElementId) {
    const semantic = allElements.find((candidate) => elementId(candidate) === id)
    if (!semantic) continue
    const outgoingIds = new Set(
      arrayValue<ModdleElement>(semantic.outgoing).map(elementId).filter(Boolean),
    )
    if (!connectionTypes.has(semantic.$type)) {
      for (const candidate of allElements) {
        if (
          candidate.$type === 'bpmn:BoundaryEvent' &&
          referenceId(candidate.attachedToRef) === id
        ) {
          outgoingIds.add(elementId(candidate))
        }
        if (
          referenceId(candidate.sourceRef) === id &&
          state.shapeByElementId.has(elementId(candidate))
        ) {
          outgoingIds.add(elementId(candidate))
        }
      }
    } else {
      const target = referencedElement(semantic.targetRef)
      if (target) outgoingIds.add(elementId(target))
    }
    shape.outgoing = [...outgoingIds].map((outgoingId) => ({
      resourceId: state.shapeByElementId.get(outgoingId)?.resourceId || outgoingId,
    }))
  }
}

function allSemanticElements(definitions: ModdleElement): ModdleElement[] {
  const result: ModdleElement[] = []
  const visit = (element: ModdleElement) => {
    result.push(element)
    for (const property of [
      'rootElements',
      'flowElements',
      'artifacts',
      'participants',
      'messageFlows',
      'laneSets',
      'lanes',
    ]) {
      for (const child of arrayValue<ModdleElement>(element[property])) visit(child)
    }
  }
  visit(definitions)
  return result
}

function rootCanvasProperties(definitions: ModdleElement, process: ModdleElement): JsonObject {
  const properties: JsonObject = {
    process_id: elementId(process),
    name: stringValue(process.name),
    documentation: documentationText(process),
    isexecutable: booleanValue(process.isExecutable, true),
    process_namespace: stringValue(definitions.targetNamespace),
    process_potentialstarteruser: stringValue(flowableValue(process, 'candidateStarterUsers')),
    process_potentialstartergroup: stringValue(flowableValue(process, 'candidateStarterGroups')),
    iseagerexecutionfetch: booleanValue(flowableValue(process, 'isEagerExecutionFetching')),
  }
  const historyLevel = extensionBody(process, 'flowable:HistoryLevel')
  setIfText(properties, 'process_historylevel', historyLevel)

  const executionListeners = listenerExtensionsToJson(process, 'flowable:ExecutionListener')
  if (executionListeners.length) properties.executionlisteners = { executionListeners }

  const messages = arrayValue<ModdleElement>(definitions.rootElements)
    .filter((element) => element.$type === 'bpmn:Message')
    .map((message) => ({
      id: elementId(message),
      name: stringValue(message.name),
      message_item_ref: referenceId(message.itemRef),
    }))
  if (messages.length) properties.messagedefinitions = messages
  const signals = arrayValue<ModdleElement>(definitions.rootElements)
    .filter((element) => element.$type === 'bpmn:Signal')
    .map((signal) => ({
      id: elementId(signal),
      name: stringValue(signal.name),
      scope: stringValue(flowableValue(signal, 'scope')),
    }))
  if (signals.length) properties.signaldefinitions = signals
  const escalations = arrayValue<ModdleElement>(definitions.rootElements)
    .filter((element) => element.$type === 'bpmn:Escalation')
    .map((escalation) => ({
      id: stringValue(escalation.escalationCode) || elementId(escalation),
      name: stringValue(escalation.name),
    }))
  if (escalations.length) properties.escalationdefinitions = escalations
  return properties
}

function canvasBounds(state: XmlExportState): OryxBounds {
  let maxX = 0
  let maxY = 0
  for (const shape of state.diShapeByElementId.values()) {
    const diBounds = objectValue(shape.bounds)
    maxX = Math.max(maxX, numberValue(diBounds.x) + numberValue(diBounds.width))
    maxY = Math.max(maxY, numberValue(diBounds.y) + numberValue(diBounds.height))
  }
  return makeBounds(0, 0, Math.max(1485, maxX + 50), Math.max(700, maxY + 50))
}

export async function bpmnXmlToOryxJson(
  xml: string,
  options: { preserveOryxSnapshot?: boolean } = {},
): Promise<OryxModel> {
  if (!xml.trim()) throw new Error('BPMN XML is empty')
  const moddle = createModdle()
  const parsed = await moddle.fromXML(xml)
  const definitions = parsed.rootElement as ModdleElement
  if (definitions.$type !== 'bpmn:Definitions') throw new Error('XML root is not BPMN definitions')
  const rootElements = arrayValue<ModdleElement>(definitions.rootElements)
  const processes = rootElements.filter((element) => element.$type === 'bpmn:Process')
  if (!processes.length) throw new Error('BPMN definitions contain no process')
  const collaboration = rootElements.find((element) => element.$type === 'bpmn:Collaboration')
  const participantProcess = arrayValue<ModdleElement>(collaboration?.participants)
    .map((participant) => referencedElement(participant.processRef))
    .find((candidate): candidate is ModdleElement => Boolean(candidate))
  const process = participantProcess || processes[0]!
  const processId = elementId(process)
  const snapshot = options.preserveOryxSnapshot
    ? snapshotByProcessId.get(processId)
    : undefined
  const indexes = createDiIndexes(definitions)
  if (!indexes.shapeMap.size) {
    throw new Error('BPMN XML 缺少 BPMN DI 图形信息')
  }
  const state: XmlExportState = {
    moddle,
    definitions,
    process,
    snapshot,
    existingShapes: indexOryxShapes(snapshot?.childShapes || []),
    shapeByElementId: new Map(),
    diShapeByElementId: indexes.shapeMap,
    diEdgeByElementId: indexes.edgeMap,
    fallbackPosition: 0,
  }

  const childShapes: OryxShape[] = []
  if (collaboration) {
    const artifactProcesses = new Map<string, ModdleElement>()
    for (const participant of arrayValue<ModdleElement>(collaboration.participants)) {
      const participantProcess = referencedElement(participant.processRef)
      const absolute = absoluteElementBounds(state, participant)
      const pool = baseOryxShape(state, participant, 'Pool', absolute)
      if (participantProcess) {
        const poolProperties = propertiesOf(pool)
        poolProperties.process_id = elementId(participantProcess)
        poolProperties.isexecutable = booleanValue(participantProcess.isExecutable, true)
        pool.childShapes = processShapesInPool(state, participantProcess, absolute)
        artifactProcesses.set(elementId(participantProcess), participantProcess)
      }
      childShapes.push(pool)
    }
    for (const poolProcess of artifactProcesses.values()) {
      childShapes.push(...shapesForElements(state, processArtifacts(poolProcess), 0, 0))
    }
    childShapes.push(
      ...arrayValue<ModdleElement>(collaboration.messageFlows).map((messageFlow) =>
        shapeForConnection(state, messageFlow, 0, 0),
      ),
    )
  } else {
    childShapes.push(
      ...shapesForElements(
        state,
        [...arrayValue<ModdleElement>(process.flowElements), ...processArtifacts(process)],
        0,
        0,
      ),
    )
  }
  populateOutgoing(state)

  const generatedProperties = rootCanvasProperties(definitions, process)
  const model: OryxModel = {
    ...(snapshot ? deepClone(snapshot) : {}),
    resourceId: 'canvas',
    properties: {
      ...(snapshot ? stripKnownProperties(snapshot.properties) : {}),
      ...generatedProperties,
    },
    stencil: { id: 'BPMNDiagram' },
    childShapes,
    bounds: canvasBounds(state),
    stencilset: { ...BPMN_STENCILSET },
    ssextensions: arrayValue(snapshot?.ssextensions),
    [RAW_XML_PROPERTY]: xml,
    [CONVERTER_VERSION_PROPERTY]: CONVERTER_VERSION,
  }
  model[FINGERPRINT_PROPERTY] = propertyFingerprint(model)
  const stored = deepClone(model)
  snapshotByProcessId.set(processId, stored)
  return model
}
