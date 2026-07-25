import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

import { BpmnModdle } from 'bpmn-moddle'

import flowableDescriptor from '../src/modeler/flowableDescriptor.ts'

const fixturePath = 'scripts/fixtures/flowable-p0-extensions.bpmn20.xml'
const artifactPath = 'artifacts/flowable-p0-extensions-roundtrip.bpmn20.xml'
const customResourceFixturePath =
  'scripts/fixtures/user-task-custom-resource.bpmn20.xml'

function requireExtension(element, type) {
  const extension = element.extensionElements?.values?.find((value) => value.$type === type)
  assert(extension, `${element.id || element.$type} is missing ${type}`)
  return extension
}

function assertSemantics(definitions, phase) {
  const process = definitions.rootElements.find(
    (element) => element.$type === 'bpmn:Process' && element.id === 'Process_p0_extensions',
  )
  assert(process, `${phase}: process was not parsed`)
  assert.equal(
    process.get('flowable:isEagerExecutionFetching'),
    true,
    `${phase}: eager execution fetching changed`,
  )

  const historyLevel = requireExtension(process, 'flowable:HistoryLevel')
  assert.equal(historyLevel.body, 'activity', `${phase}: history level changed`)
  const listeners = process.extensionElements.values.filter(
    (value) => value.$type === 'flowable:EventListener',
  )
  assert.equal(listeners.length, 2, `${phase}: event listener count changed`)
  assert.deepEqual(
    {
      events: listeners[0].events,
      entityType: listeners[0].entityType,
      delegateExpression: listeners[0].delegateExpression,
      onTransaction: listeners[0].onTransaction,
    },
    {
      events: 'ENTITY_CREATED',
      entityType: 'task',
      delegateExpression: '${auditListener}',
      onTransaction: 'COMMITTED',
    },
    `${phase}: event listener attributes changed`,
  )
  assert.equal(listeners[1].throwEvent, 'message', `${phase}: throw listener type changed`)
  assert.equal(listeners[1].messageName, 'taskCompleted', `${phase}: throw listener name changed`)

  const start = process.flowElements.find((element) => element.id === 'Start_registry')
  assert.equal(requireExtension(start, 'flowable:EventType').body, 'order-created')
  assert.equal(requireExtension(start, 'flowable:EventName').body, 'Order created')
  assert.equal(requireExtension(start, 'flowable:ChannelKey').body, 'orders-in')
  assert.equal(requireExtension(start, 'flowable:SerializerType').body, 'json')
  assert.equal(requireExtension(start, 'flowable:DeserializerType').body, 'json')
  const correlation = requireExtension(start, 'flowable:EventCorrelationParameter')
  assert.equal(correlation.name, 'customerId', `${phase}: correlation name changed`)
  assert.equal(correlation.value, '${customerId}', `${phase}: correlation value changed`)
  const eventOutput = requireExtension(start, 'flowable:EventOutParameter')
  assert.equal(eventOutput.sourceType, 'string', `${phase}: event output source type changed`)
  assert.equal(eventOutput.transient, true, `${phase}: event output transient flag changed`)

  const multiTask = process.flowElements.find((element) => element.id === 'Task_multi_instance')
  assert.equal(requireExtension(multiTask, 'flowable:IncludeInHistory').body, 'true')
  const loop = multiTask.loopCharacteristics
  assert.equal(loop.$type, 'bpmn:MultiInstanceLoopCharacteristics')
  assert.equal(loop.get('flowable:noWaitStatesAsyncLeave'), true)
  const collection = requireExtension(loop, 'flowable:Collection')
  assert.equal(collection.delegateExpression, '${collectionHandler}')
  assert.equal(collection.expression, '${items}')
  const aggregation = requireExtension(loop, 'flowable:VariableAggregation')
  assert.equal(aggregation.storeAsTransientVariable, true)
  assert.equal(aggregation.createOverviewVariable, true)
  assert.equal(aggregation.delegateExpression, '${variableAggregator}')
  assert.deepEqual(
    aggregation.get('bpmn:variable').map((variable) => ({
      type: variable.$type,
      source: variable.source,
      sourceExpression: variable.sourceExpression,
      target: variable.target,
      targetExpression: variable.targetExpression,
    })),
    [
      {
        type: 'flowable:Variable',
        source: 'approved',
        sourceExpression: undefined,
        target: 'value',
        targetExpression: undefined,
      },
      {
        type: 'flowable:Variable',
        source: undefined,
        sourceExpression: '${score * 2}',
        target: undefined,
        targetExpression: '${targetKey}',
      },
    ],
    `${phase}: aggregation variables changed`,
  )

  const boundary = process.flowElements.find((element) => element.id === 'Boundary_variable')
  const variableListener = requireExtension(
    boundary,
    'flowable:VariableListenerEventDefinition',
  )
  assert.equal(variableListener.variableName, 'approvalState')
  assert.equal(variableListener.variableChangeType, 'update-create')

  const timerEvent = process.flowElements.find((element) => element.id === 'Timer_cycle')
  assert(timerEvent, `${phase}: timer event was not parsed`)
  const timerDefinition = timerEvent.eventDefinitions?.[0]
  assert.equal(timerDefinition?.$type, 'bpmn:TimerEventDefinition')
  assert.equal(timerDefinition.get('flowable:businessCalendarName'), 'workCalendar')
  assert.equal(timerDefinition.timeCycle?.$type, 'bpmn:Expression')
  assert.equal(timerDefinition.timeCycle?.body, 'R5/PT15M')
  assert.equal(timerDefinition.timeCycle?.get('flowable:endDate'), '${timerEndDate}')

  const expressionTask = process.flowElements.find((element) => element.id === 'Task_expression')
  assert(expressionTask, `${phase}: expression Service Task was not parsed`)
  assert.equal(expressionTask.get('flowable:expression'), '${orderService.calculate(execution)}')
  assert.equal(expressionTask.get('flowable:resultVariableName'), 'calculationResult')
  assert.equal(expressionTask.get('flowable:resultVariable'), undefined)
  assert.equal(expressionTask.get('flowable:useLocalScopeForResultVariable'), true)
  assert.equal(expressionTask.get('flowable:storeResultVariableAsTransient'), true)

  const executionListeners = expressionTask.extensionElements.values.filter(
    (value) => value.$type === 'flowable:ExecutionListener',
  )
  assert.equal(executionListeners.length, 2, `${phase}: execution listener count changed`)
  const scriptListener = executionListeners.find((listener) => listener.type === 'script')
  assert(scriptListener, `${phase}: script execution listener was not parsed`)
  assert.equal(scriptListener.event, 'start')
  assert.equal(scriptListener.script?.$type, 'flowable:Script')
  assert.equal(scriptListener.script?.language, 'groovy')
  assert.equal(scriptListener.script?.resultVariable, 'listenerResult')
  assert.match(scriptListener.script?.value || '', /scriptListenerInvoked/)

  const transactionListener = executionListeners.find(
    (listener) => listener.delegateExpression === '${transactionListener}',
  )
  assert(transactionListener, `${phase}: transaction execution listener was not parsed`)
  assert.equal(transactionListener.event, 'end')
  assert.equal(transactionListener.onTransaction, 'committed')
  assert.equal(
    transactionListener.customPropertiesResolverDelegateExpression,
    '${listenerPropertiesResolver}',
  )

  const sendTask = process.flowElements.find((element) => element.id === 'Task_send_event')
  assert.equal(requireExtension(sendTask, 'flowable:TriggerEventType').body, 'order-acknowledged')
  assert.equal(requireExtension(sendTask, 'flowable:TriggerEventName').body, 'Order acknowledged')
  assert.equal(requireExtension(sendTask, 'flowable:SendSynchronously').body, 'true')
  requireExtension(sendTask, 'flowable:SystemChannel')
  const eventInput = requireExtension(sendTask, 'flowable:EventInParameter')
  assert.equal(eventInput.sourceExpression, '${order.id}')
  assert.equal(eventInput.targetType, 'string')
  const triggerCorrelation = requireExtension(
    sendTask,
    'flowable:TriggerEventCorrelationParameter',
  )
  assert.equal(triggerCorrelation.value, '${order.id}')

  const httpTask = process.flowElements.find((element) => element.id === 'Task_http')
  const requestHandler = requireExtension(httpTask, 'flowable:HttpRequestHandler')
  assert.equal(requestHandler.type, 'script')
  assert.equal(requestHandler.script.$type, 'flowable:Script')
  assert.equal(requestHandler.script.language, 'groovy')
  assert.equal(requestHandler.script.resultVariable, 'requestPayload')
  assert.match(requestHandler.script.value, /execution\.getVariable\('order'\)/)
  const responseHandler = requireExtension(httpTask, 'flowable:HttpResponseHandler')
  assert.equal(responseHandler.delegateExpression, '${responseHandler}')
}

function assertCustomResourceSemantics(definitions, phase) {
  const process = definitions.rootElements.find(
    (element) =>
      element.$type === 'bpmn:Process' && element.id === 'Process_custom_resource',
  )
  assert(process, `${phase}: custom-resource process was not parsed`)

  const userTask = process.flowElements.find(
    (element) => element.id === 'Task_custom_resource',
  )
  assert(userTask, `${phase}: custom-resource UserTask was not parsed`)

  const customResources = userTask.extensionElements?.values?.filter(
    (value) => value.$type === 'flowable:CustomResource',
  )
  assert.equal(customResources?.length, 2, `${phase}: custom resource count changed`)

  const businessAdministrator = customResources.find(
    (resource) => resource.name === 'businessAdministrator',
  )
  assert(businessAdministrator, `${phase}: businessAdministrator resource is missing`)
  assert.equal(businessAdministrator.get('vendor:legacyHint'), 'keep-business-admin')
  assert.equal(businessAdministrator.get('vendor:policy'), '${businessAdminPolicy}')
  assert.equal(
    businessAdministrator.resourceAssignmentExpression?.$type,
    'bpmn:ResourceAssignmentExpression',
  )
  assert.equal(
    businessAdministrator.resourceAssignmentExpression?.get('vendor:assignmentHint'),
    'keep-assignment',
  )
  assert.equal(
    businessAdministrator.resourceAssignmentExpression?.get('vendor:source'),
    'identity-service',
  )
  const businessAdministratorExpression =
    businessAdministrator.resourceAssignmentExpression?.get('bpmn:formalExpression')
  assert.equal(businessAdministratorExpression?.$type, 'bpmn:FormalExpression')
  assert.equal(
    businessAdministratorExpression?.body,
    'user(${userVar}), group(${groupVar})',
    `${phase}: user/group expression changed`,
  )
  assert.equal(
    businessAdministratorExpression?.get('vendor:expressionHint'),
    'keep-expression',
  )
  assert.equal(
    businessAdministratorExpression?.get('vendor:dialect'),
    'flowable-identity',
  )

  const manager = customResources.find((resource) => resource.name === 'manager')
  assert(manager, `${phase}: manager resource is missing`)
  assert.equal(manager.get('vendor:legacyHint'), 'keep-manager')
  assert.equal(manager.get('vendor:policy'), 'manager-policy')
  assert.equal(
    manager.resourceAssignmentExpression?.get('bpmn:formalExpression')?.body,
    'user(kermit), group(management), group(${reviewerGroup})',
    `${phase}: manager identity-link expression changed`,
  )
}

const moddle = new BpmnModdle({ flowable: flowableDescriptor })
const sourceXml = readFileSync(fixturePath, 'utf8')
const first = await moddle.fromXML(sourceXml)
assert.deepEqual(first.warnings, [], 'fixture import produced moddle warnings')
assertSemantics(first.rootElement, 'initial parse')

const { xml } = await moddle.toXML(first.rootElement, { format: true })
assert(xml.includes('<bpmn:variable source="approved" target="value" />'))
assert(!xml.includes('<flowable:variable '), 'aggregation variable changed namespace')
assert(xml.includes('<flowable:httpRequestHandler type="script">'))
assert(xml.includes('flowable:isEagerExecutionFetching="true"'))
assert(!xml.includes('flowable:enableEagerExecutionTreeFetching='))
assert(xml.includes('<bpmn:timeCycle flowable:endDate="${timerEndDate}">R5/PT15M</bpmn:timeCycle>'))
assert(!xml.includes('<bpmn:timeCycle xsi:type='), 'plain timeCycle gained an xsi:type')
assert(xml.includes('flowable:resultVariableName="calculationResult"'))
assert(!xml.includes('flowable:resultVariable="calculationResult"'))
assert(xml.includes('flowable:useLocalScopeForResultVariable="true"'))
assert(xml.includes('flowable:storeResultVariableAsTransient="true"'))

const second = await moddle.fromXML(xml)
assert.deepEqual(second.warnings, [], 'round-trip import produced moddle warnings')
assertSemantics(second.rootElement, 'round trip')

const customResourceSourceXml = readFileSync(customResourceFixturePath, 'utf8')
let customResourceRoundTrip = await moddle.fromXML(customResourceSourceXml)
assert.deepEqual(
  customResourceRoundTrip.warnings,
  [],
  'custom-resource fixture import produced moddle warnings',
)
assertCustomResourceSemantics(customResourceRoundTrip.rootElement, 'custom-resource import')

for (let round = 1; round <= 2; round += 1) {
  const result = await moddle.toXML(customResourceRoundTrip.rootElement, { format: true })
  assert(result.xml.includes('<flowable:customResource name="businessAdministrator"'))
  assert.match(
    result.xml,
    /<formalExpression[^>]*>user\(\$\{userVar\}\), group\(\$\{groupVar\}\)<\/formalExpression>/,
  )
  assert(
    !result.xml.includes('<expression xsi:type="tFormalExpression"'),
    'custom resource expression changed to the xsi:type form rejected by Flowable',
  )
  assert(result.xml.includes('user(${userVar}), group(${groupVar})'))
  assert(result.xml.includes('user(kermit), group(management), group(${reviewerGroup})'))
  assert(result.xml.includes('vendor:legacyHint="keep-business-admin"'))
  assert(result.xml.includes('vendor:policy="${businessAdminPolicy}"'))
  assert(result.xml.includes('vendor:assignmentHint="keep-assignment"'))
  assert(result.xml.includes('vendor:source="identity-service"'))
  assert(result.xml.includes('vendor:expressionHint="keep-expression"'))
  assert(result.xml.includes('vendor:dialect="flowable-identity"'))

  customResourceRoundTrip = await moddle.fromXML(result.xml)
  assert.deepEqual(
    customResourceRoundTrip.warnings,
    [],
    `custom-resource round ${round} import produced moddle warnings`,
  )
  assertCustomResourceSemantics(
    customResourceRoundTrip.rootElement,
    `custom-resource round ${round}`,
  )
}

mkdirSync('artifacts', { recursive: true })
writeFileSync(artifactPath, xml, 'utf8')
console.log(
  JSON.stringify({
    ok: true,
    artifact: artifactPath,
    extensionTypes: flowableDescriptor.types.length,
    xmlLength: xml.length,
  }),
)
