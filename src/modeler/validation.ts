import type {
  BpmnBusinessObject,
  BpmnExtensionElement,
  DiagramElement,
  ValidationParams,
  ValidationProblem,
} from './types'
import { translate } from '@/i18n'
import { isFlowableServiceTaskType } from './serviceTaskTypes'

const START_EVENT = 'bpmn:StartEvent'
const END_EVENT = 'bpmn:EndEvent'
const BOUNDARY_EVENT = 'bpmn:BoundaryEvent'
const SEQUENCE_FLOW = 'bpmn:SequenceFlow'

const isFlowNode = (element: DiagramElement) =>
  element.type.startsWith('bpmn:') &&
  ![
    'bpmn:Process',
    'bpmn:Collaboration',
    'bpmn:Participant',
    'bpmn:Lane',
    'bpmn:TextAnnotation',
    'bpmn:Group',
    'bpmn:DataObjectReference',
    'bpmn:DataStoreReference',
    'bpmn:Association',
    SEQUENCE_FLOW,
  ].includes(element.type)

const valueOf = (businessObject: BpmnBusinessObject, property: string) => {
  const getterValue = businessObject.get?.(property)
  if (getterValue !== undefined) return getterValue
  const plainName = property.includes(':') ? property.split(':')[1] : property
  return plainName ? businessObject[plainName] : undefined
}

const hasText = (value: unknown) => typeof value === 'string' && value.trim().length > 0
const isTrue = (value: unknown) => value === true || value === 'true'
const isFalse = (value: unknown) => value === false || value === 'false'

const businessJsonExtensions = new Map([
  ['flowable:StaticAssigneeVariables', 'StaticAssigneeVariables'],
  ['flowable:IdmAssignee', 'IdmAssignee'],
  ['flowable:IdmCandidateUsers', 'IdmCandidateUsers'],
  ['flowable:IdmCandidateGroups', 'IdmCandidateGroups'],
  ['flowable:NextUser', 'NextUser'],
  ['flowable:NextSequenceFlow', 'NextSequenceFlow'],
  ['flowable:NodeFormExp', 'NodeFormExp'],
  ['flowable:ModelBpmnExtension', 'ModelBpmnExtension'],
  ['flowable:MultiInstanceVariables', 'MultiInstanceVariables'],
])

const extensionBody = (extension: BpmnExtensionElement) => {
  try {
    const value = (extension as { get?: (name: string) => unknown }).get?.('body')
    if (value !== undefined && value !== null) return String(value)
  } catch {
    // Fall back to the plain moddle property.
  }
  return extension.body === undefined || extension.body === null ? '' : String(extension.body)
}

export interface ValidationOptions {
  allowedServiceTaskTypes?: Iterable<string>
}

export function validateElements(
  elements: DiagramElement[],
  options: ValidationOptions = {},
): ValidationProblem[] {
  const problems: ValidationProblem[] = []
  let sequence = 0
  const allowedServiceTaskTypes = new Set(
    [...(options.allowedServiceTaskTypes || [])].map((value) => value.trim()).filter(Boolean),
  )

  const add = (
    element: DiagramElement,
    level: ValidationProblem['level'],
    code: string,
    params: ValidationParams = {},
  ) => {
    problems.push({
      id: `${element.id}-${sequence++}`,
      elementId: element.id,
      elementName: String(element.businessObject.name || element.id),
      level,
      code,
      params,
      message: translate(`modeler.validation.${code}`, params),
    })
  }

  const diagramElements = elements.filter((element) => !element.labelTarget)
  const processes = diagramElements.filter((element) => element.type === 'bpmn:Process')
  const startEvents = diagramElements.filter((element) => element.type === START_EVENT)
  const endEvents = diagramElements.filter((element) => element.type === END_EVENT)

  for (const process of processes) {
    const id = String(process.businessObject.id || '')
    if (!id) add(process, 'error', 'processIdRequired')
    else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) {
      add(process, 'error', 'processIdInvalid')
    }
    if (valueOf(process.businessObject, 'isExecutable') !== true) {
      add(process, 'warning', 'processNotExecutable')
    }
    if (valueOf(process.businessObject, 'flowable:enableEagerExecutionTreeFetching') !== undefined) {
      add(process, 'warning', 'legacyEagerExecutionTreeFetching')
    }
  }

  if (!startEvents.length && processes.length) add(processes[0]!, 'error', 'startEventRequired')
  if (!endEvents.length && processes.length) add(processes[0]!, 'warning', 'endEventRecommended')

  for (const element of diagramElements) {
    const businessObject = element.businessObject

    if (isFlowNode(element)) {
      const incoming = element.incoming || []
      const outgoing = element.outgoing || []

      if (element.type !== START_EVENT && element.type !== BOUNDARY_EVENT && incoming.length === 0) {
        add(element, 'warning', 'incomingFlowMissing')
      }
      if (element.type !== END_EVENT && element.type !== BOUNDARY_EVENT && outgoing.length === 0) {
        add(element, 'warning', 'outgoingFlowMissing')
      }
      if (element.type === START_EVENT && outgoing.length === 0) {
        add(element, 'error', 'startEventOutgoingMissing')
      }
      if (element.type === END_EVENT && incoming.length === 0) {
        add(element, 'error', 'endEventIncomingMissing')
      }

      if (
        isFalse(valueOf(businessObject, 'flowable:exclusive')) &&
        !isTrue(valueOf(businessObject, 'flowable:async')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncBefore'))
      ) {
        add(element, 'warning', 'asyncExclusiveRequiresAsync')
      }
      if (
        isFalse(valueOf(businessObject, 'flowable:asyncLeaveExclusive')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncLeave')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncAfter'))
      ) {
        add(
          element,
          'warning',
          'asyncLeaveExclusiveRequiresAsyncLeave',
        )
      }
      if (hasText(valueOf(businessObject, 'flowable:jobCategory'))) {
        add(
          element,
          'warning',
          'legacyJobCategoryAttribute',
        )
      }
      if (hasText(valueOf(businessObject, 'flowable:leaveJobCategory'))) {
        add(
          element,
          'warning',
          'unsupportedLeaveJobCategoryAttribute',
        )
      }
    }

    if (element.type === 'bpmn:UserTask') {
      const assignee = valueOf(businessObject, 'flowable:assignee')
      const users = valueOf(businessObject, 'flowable:candidateUsers')
      const groups = valueOf(businessObject, 'flowable:candidateGroups')
      if (![assignee, users, groups].some(hasText)) {
        add(element, 'warning', 'userTaskAssigneeMissing')
      }

      const customResources = (businessObject.extensionElements?.values || []).filter(
        (extension) => extension.$type === 'flowable:CustomResource',
      )
      for (const customResource of customResources) {
        if (!hasText(valueOf(customResource, 'name'))) {
          add(element, 'error', 'customIdentityLinkTypeRequired')
        }
        const assignmentExpression = customResource.resourceAssignmentExpression as
          | BpmnBusinessObject
          | undefined
        const formalExpression = assignmentExpression
          ? (valueOf(
              assignmentExpression,
              'bpmn:formalExpression',
            ) as BpmnBusinessObject | undefined)
          : undefined
        if (!hasText(formalExpression?.body)) {
          add(
            element,
            'error',
            'customIdentityLinkExpressionRequired',
            { name: String(valueOf(customResource, 'name') || '') },
          )
        }
      }
    }

    if (element.type === 'bpmn:ServiceTask') {
      const serviceTaskType = valueOf(businessObject, 'flowable:type')
      const implementation = [
        valueOf(businessObject, 'flowable:class'),
        valueOf(businessObject, 'flowable:expression'),
        valueOf(businessObject, 'flowable:delegateExpression'),
        serviceTaskType,
      ]
      if (!implementation.some(hasText)) {
        add(element, 'error', 'serviceTaskImplementationRequired')
      }
      if (implementation.filter(hasText).length > 1) {
        add(element, 'error', 'serviceTaskMultipleImplementations')
      }

      const normalizedType = typeof serviceTaskType === 'string' ? serviceTaskType.trim() : ''
      if (
        normalizedType &&
        !isFlowableServiceTaskType(normalizedType) &&
        !allowedServiceTaskTypes.has(normalizedType)
      ) {
        add(
          element,
          'error',
          'serviceTaskTypeUnsupported',
          { type: normalizedType },
        )
      }
      if (
        ['external-worker', 'external'].includes(normalizedType) &&
        !hasText(valueOf(businessObject, 'flowable:topic'))
      ) {
        add(element, 'error', 'externalWorkerTopicRequired')
      }

      const serviceExtensions = businessObject.extensionElements?.values || []
      const serviceField = (name: string) => {
        const field = serviceExtensions.find(
          (extension) => extension.$type === 'flowable:Field' && extension.name === name,
        )
        return field?.expression || field?.string || field?.stringValue
      }
      const serviceExtensionBody = (type: string) => {
        const extension = serviceExtensions.find((value) => value.$type === type)
        return extension ? extensionBody(extension) : ''
      }

      if (normalizedType === 'mail') {
        if (!['to', 'cc', 'bcc'].some((name) => hasText(serviceField(name)))) {
          add(element, 'error', 'mailRecipientsRequired')
        }
        if (!['text', 'textVar', 'html', 'htmlVar'].some((name) => hasText(serviceField(name)))) {
          add(element, 'error', 'mailBodyRequired')
        }
      } else if (normalizedType === 'shell') {
        if (!hasText(serviceField('command'))) add(element, 'error', 'shellCommandRequired')
      } else if (normalizedType === 'dmn') {
        if (
          !hasText(serviceField('decisionTableReferenceKey')) &&
          !hasText(serviceField('decisionServiceReferenceKey'))
        ) {
          add(element, 'error', 'dmnReferenceRequired')
        }
      } else if (normalizedType === 'http') {
        if (!hasText(serviceField('requestMethod'))) {
          add(element, 'error', 'httpMethodRequired')
        }
        if (!hasText(serviceField('requestUrl'))) {
          add(element, 'error', 'httpUrlRequired')
        }
      } else if (normalizedType === 'send-event') {
        if (!hasText(serviceExtensionBody('flowable:EventType'))) {
          add(element, 'error', 'sendEventTypeRequired')
        }
        if (
          !hasText(serviceExtensionBody('flowable:ChannelKey')) &&
          !serviceExtensions.some((value) => value.$type === 'flowable:SystemChannel')
        ) {
          add(element, 'error', 'sendEventChannelRequired')
        }
      }

      const resultVariableName =
        valueOf(businessObject, 'flowable:resultVariableName') ||
        valueOf(businessObject, 'flowable:resultVariable')
      const hasResultVariable = hasText(resultVariableName)
      const expressionOnly =
        hasText(valueOf(businessObject, 'flowable:expression')) &&
        !hasText(valueOf(businessObject, 'flowable:class')) &&
        !hasText(valueOf(businessObject, 'flowable:delegateExpression')) &&
        !hasText(serviceTaskType)
      if (hasResultVariable && !expressionOnly) {
        add(element, 'error', 'resultVariableExpressionOnly')
      }
      if (
        !hasResultVariable &&
        (
          isTrue(valueOf(businessObject, 'flowable:useLocalScopeForResultVariable')) ||
          isTrue(valueOf(businessObject, 'flowable:storeResultVariableAsTransient'))
        )
      ) {
        add(element, 'warning', 'resultVariableScopeIgnored')
      }
      if (hasText(valueOf(businessObject, 'flowable:resultVariable'))) {
        add(element, 'warning', 'legacyResultVariable')
      }
    }

    if (element.type === 'bpmn:ScriptTask') {
      if (!hasText(businessObject.scriptFormat)) add(element, 'error', 'scriptFormatRequired')
      if (!hasText(businessObject.script)) add(element, 'error', 'scriptBodyRequired')
    }

    if (element.type === 'bpmn:CallActivity') {
      if (!hasText(businessObject.calledElement)) {
        add(element, 'error', 'calledElementRequired')
      }

      const calledElementType = valueOf(businessObject, 'flowable:calledElementType')
      const serializedCalledElementType =
        calledElementType === undefined || calledElementType === null
          ? ''
          : String(calledElementType)
      if (
        serializedCalledElementType &&
        !['key', 'id'].includes(serializedCalledElementType)
      ) {
        add(element, 'error', 'calledElementTypeInvalid')
      }
    }

    const eventDefinition = businessObject.eventDefinitions?.[0]
    if (eventDefinition?.$type === 'bpmn:TimerEventDefinition') {
      const timerValues = [
        eventDefinition.timeDate,
        eventDefinition.timeDuration,
        eventDefinition.timeCycle,
      ] as Array<BpmnBusinessObject | undefined>
      if (!timerValues.some((value) => hasText(value?.body))) {
        add(element, 'error', 'timerExpressionRequired')
      }
    }
    if (eventDefinition?.$type === 'bpmn:ConditionalEventDefinition') {
      const condition = eventDefinition.condition as BpmnBusinessObject | undefined
      if (!hasText(condition?.body)) add(element, 'error', 'conditionalExpressionRequired')
    }
    if (eventDefinition?.$type === 'bpmn:MessageEventDefinition') {
      const messageRef = eventDefinition.messageRef as BpmnBusinessObject | undefined
      const messageExpression = valueOf(eventDefinition, 'flowable:messageExpression')
      if (!messageRef?.id && !hasText(messageExpression)) {
        add(element, 'error', 'messageReferenceRequired')
      }
    }
    if (eventDefinition?.$type === 'bpmn:SignalEventDefinition') {
      const signalRef = eventDefinition.signalRef as BpmnBusinessObject | undefined
      const signalExpression = valueOf(eventDefinition, 'flowable:signalExpression')
      if (!signalRef?.id && !hasText(signalExpression)) {
        add(element, 'error', 'signalReferenceRequired')
      }
    }
    if (eventDefinition?.$type === 'bpmn:ErrorEventDefinition') {
      const errorRef = eventDefinition.errorRef as BpmnBusinessObject | undefined
      if (
        !errorRef?.id &&
        ['bpmn:EndEvent', 'bpmn:IntermediateThrowEvent'].includes(element.type)
      ) {
        add(element, 'error', 'errorReferenceRequired')
      }
    }

    const loop = businessObject.loopCharacteristics
    if (loop?.$type === 'bpmn:MultiInstanceLoopCharacteristics') {
      const cardinality = loop.loopCardinality as { body?: string } | undefined
      const collectionHandler = loop.extensionElements?.values?.find(
        (value) => value.$type === 'flowable:Collection',
      )
      const collection =
        valueOf(loop, 'flowable:collection') ||
        collectionHandler?.expression ||
        collectionHandler?.string
      if (!hasText(cardinality?.body) && !hasText(collection)) {
        add(element, 'error', 'multiInstanceSourceRequired')
      }
      if (hasText(collection) && !hasText(valueOf(loop, 'flowable:elementVariable'))) {
        add(element, 'warning', 'multiInstanceElementVariableRecommended')
      }
    }

    const extensions = businessObject.extensionElements?.values || []
    const extensionsByType = new Map<string, BpmnExtensionElement[]>()
    for (const extension of extensions) {
      const values = extensionsByType.get(extension.$type) || []
      values.push(extension)
      extensionsByType.set(extension.$type, values)
    }

    for (const [extensionType, values] of extensionsByType) {
      if (
        values.length > 1 &&
        (
          businessJsonExtensions.has(extensionType) ||
          [
            'flowable:AssigneeType',
            'flowable:Properties',
            'flowable:FailedJobRetryTimeCycle',
            'flowable:JobCategory',
          ].includes(extensionType)
        )
      ) {
        add(element, 'warning', 'duplicateExtension', {
          extensionType: extensionType.replace('flowable:', ''),
        })
      }
    }

    for (const retryCycle of extensionsByType.get('flowable:FailedJobRetryTimeCycle') || []) {
      if (!hasText(extensionBody(retryCycle))) {
        add(element, 'error', 'retryCycleRequired')
      }
    }
    for (const jobCategory of extensionsByType.get('flowable:JobCategory') || []) {
      if (!hasText(extensionBody(jobCategory))) add(element, 'error', 'jobCategoryRequired')
    }
    if (
      extensionsByType.has('flowable:FailedJobRetryTimeCycle') &&
      element.type !== 'bpmn:ServiceTask'
    ) {
      add(element, 'warning', 'retryCycleServiceTaskOnly')
    }

    for (const container of extensionsByType.get('flowable:Properties') || []) {
      const values = (container.values as BpmnExtensionElement[] | undefined) || []
      for (const property of values) {
        if (!hasText(property.name)) add(element, 'error', 'extensionPropertyNameRequired')
        if (!hasText(property.value)) {
          add(element, 'error', 'extensionPropertyValueRequired', {
            name: String(property.name || property.id || ''),
          })
        }
      }
    }

    for (const formData of extensionsByType.get('flowable:FormData') || []) {
      const fields = (formData.fields as BpmnExtensionElement[] | undefined) || []
      for (const field of fields) {
        if (!hasText(field.id)) add(element, 'error', 'formDataFieldIdRequired')
        const nestedProperties = field.properties as BpmnExtensionElement | undefined
        for (const property of
          (nestedProperties?.values as BpmnExtensionElement[] | undefined) || []) {
          if (!hasText(property.name)) {
            add(element, 'error', 'formDataPropertyNameRequired', {
              fieldId: String(field.id || ''),
            })
          }
          if (!hasText(property.value)) {
            add(element, 'error', 'formDataPropertyValueRequired', {
              fieldId: String(field.id || ''),
            })
          }
        }
      }
    }

    const mapExceptions = extensionsByType.get('flowable:MapException') || []
    for (const mapException of mapExceptions) {
      if (!hasText(mapException.errorCode)) {
        add(element, 'error', 'mapExceptionErrorCodeRequired')
      }
    }
    if (
      mapExceptions.length &&
      !['bpmn:ServiceTask', 'bpmn:CallActivity'].includes(element.type)
    ) {
      add(element, 'warning', 'mapExceptionUnsupportedElement')
    }
    if (mapExceptions.filter((mapException) => !hasText(mapException.class)).length > 1) {
      add(element, 'warning', 'multipleDefaultMapExceptions')
    }

    for (const mapping of extensions.filter((item) =>
      ['flowable:In', 'flowable:Out'].includes(item.$type),
    )) {
      const variables = String(mapping.variables || '')
      if (isTrue(mapping.local)) {
        add(element, 'warning', 'ioMappingLocalIgnored')
      }
      if (variables) {
        if (variables !== 'all') add(element, 'warning', 'ioMappingVariablesAllRequired')
        if (mapping.$type === 'flowable:Out') {
          add(element, 'error', 'outputVariablesAllUnsupported')
        }
        if (isTrue(mapping.transient)) {
          add(element, 'warning', 'ioMappingTransientIgnored')
        }
        continue
      }
      if (
        isTrue(mapping.transient) &&
        element.type === 'bpmn:CallActivity'
      ) {
        add(
          element,
          'warning',
          'callActivityTransientIgnored',
        )
      }
      if (!hasText(mapping.source) && !hasText(mapping.sourceExpression)) {
        add(element, 'error', 'ioMappingSourceRequired')
      }
      if (!hasText(mapping.target)) add(element, 'error', 'ioMappingTargetRequired')
    }

    for (const [extensionType, label] of businessJsonExtensions) {
      const extension = extensionsByType.get(extensionType)?.[0]
      if (!extension) continue
      const body = extensionBody(extension)
      if (!body.trim()) continue
      try {
        const parsed = JSON.parse(body) as unknown
        if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== 'object')) {
          add(element, 'error', 'businessJsonRootInvalid', { extension: label })
        }
      } catch {
        add(element, 'error', 'businessJsonInvalid', { extension: label })
      }
    }

    if (element.type === 'bpmn:UserTask') {
      const assignmentType = extensionBody(extensionsByType.get('flowable:AssigneeType')?.[0] || ({ $type: '' } as BpmnExtensionElement))
      if (assignmentType && !['static', 'idm'].includes(assignmentType)) {
        add(element, 'warning', 'assigneeTypeUnknown', { type: assignmentType })
      } else if (assignmentType === 'static' && !extensionsByType.has('flowable:StaticAssigneeVariables')) {
        add(element, 'warning', 'staticAssigneeMetadataRequired')
      } else if (
        assignmentType === 'idm' &&
        !['flowable:IdmAssignee', 'flowable:IdmCandidateUsers', 'flowable:IdmCandidateGroups'].some(
          (extensionType) => extensionsByType.has(extensionType),
        )
      ) {
        add(element, 'warning', 'idmAssigneeMetadataRequired')
      }

      const nodeForm = extensionsByType.get('flowable:NodeFormExp')?.[0]
      if (nodeForm) {
        try {
          const parsed = JSON.parse(extensionBody(nodeForm)) as unknown
          if (!Array.isArray(parsed)) {
            add(element, 'warning', 'nodeFormArrayRequired')
          } else {
            if (parsed.length > 1) add(element, 'warning', 'nodeFormSingleOnly')
            for (const item of parsed) {
              if (!item || typeof item !== 'object' || Array.isArray(item)) continue
              const record = item as Record<string, unknown>
              if (!hasText(record.code) || !hasText(record.name)) {
                add(element, 'error', 'nodeFormFieldsRequired')
              }
            }
          }
          const first = Array.isArray(parsed) ? parsed[0] : undefined
          const code = first && typeof first === 'object' ? String((first as Record<string, unknown>).code || '') : ''
          const formKey = String(valueOf(businessObject, 'flowable:formKey') || '')
          if (code && formKey && code !== formKey) {
            add(element, 'warning', 'nodeFormKeyMismatch', { code, formKey })
          }
        } catch {
          // The JSON syntax error is already reported above.
        }
      }

      for (const [extensionType, label] of [
        ['flowable:NextUser', 'NextUser'],
        ['flowable:NextSequenceFlow', 'NextSequenceFlow'],
      ] as const) {
        const extension = extensionsByType.get(extensionType)?.[0]
        if (!extension) continue
        try {
          const parsed = JSON.parse(extensionBody(extension)) as unknown
          if (!Array.isArray(parsed)) {
            add(element, 'warning', 'businessListArrayRequired', { extension: label })
            continue
          }
          for (const item of parsed) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue
            const record = item as Record<string, unknown>
            if (!hasText(record.code) || !hasText(record.name)) {
              add(element, 'error', 'businessListFieldsRequired', { extension: label })
            }
          }
        } catch {
          // The JSON syntax error is already reported above.
        }
      }
    }

    for (const listener of extensions.filter((item) =>
      ['flowable:ExecutionListener', 'flowable:TaskListener'].includes(item.$type),
    )) {
      const isTaskListener = listener.$type === 'flowable:TaskListener'
      const isSequenceFlowListener = element.type === 'bpmn:SequenceFlow'
      const instanceOf = (businessObject as { $instanceOf?: (type: string) => boolean })
        .$instanceOf
      const supportsExecutionListener =
        element.type === 'bpmn:Process' ||
        isSequenceFlowListener ||
        Boolean(instanceOf?.call(businessObject, 'bpmn:FlowNode'))
      if (isTaskListener && element.type !== 'bpmn:UserTask') {
        add(element, 'error', 'taskListenerUserTaskOnly')
      }
      if (!isTaskListener && !supportsExecutionListener) {
        add(element, 'error', 'executionListenerUnsupportedElement')
      }

      const event = hasText(listener.event) ? String(listener.event) : ''
      if (!event && !(isSequenceFlowListener && !isTaskListener)) {
        add(element, 'error', 'listenerEventRequired')
      }
      if (
        isTaskListener &&
        event &&
        !['create', 'assignment', 'complete', 'delete', 'all'].includes(event)
      ) {
        add(element, 'error', 'taskListenerEventInvalid', { event })
      }
      if (
        !isTaskListener &&
        event &&
        !(
          isSequenceFlowListener
            ? ['start', 'take', 'end'].includes(event)
            : ['start', 'end'].includes(event)
        )
      ) {
        add(element, 'error', 'executionListenerEventInvalid', { event })
      }
      const scriptType = listener.type === 'script'
      const script = listener.script as BpmnExtensionElement | undefined
      const implementationCount = [
        listener.class,
        listener.expression,
        listener.delegateExpression,
      ].filter(hasText).length + (scriptType ? 1 : 0)
      if (!implementationCount) add(element, 'error', 'listenerImplementationRequired')
      if (implementationCount > 1) {
        add(element, 'error', 'listenerMultipleImplementations')
      }
      if (hasText(listener.type) && !scriptType) {
        add(element, 'error', 'listenerTypeUnsupported', { type: String(listener.type) })
      }
      if (scriptType) {
        if (!script) add(element, 'error', 'scriptListenerScriptRequired')
        else {
          if (!hasText(script.language)) add(element, 'error', 'scriptListenerLanguageRequired')
          if (!hasText(script.value)) add(element, 'error', 'scriptListenerBodyRequired')
          if (hasText(script.scriptFormat)) {
            add(element, 'warning', 'scriptListenerScriptFormatIgnored')
          }
          if (hasText(script.resource)) {
            add(element, 'warning', 'scriptListenerResourceIgnored')
          }
        }
        if (((listener.fields as BpmnExtensionElement[] | undefined) || []).length) {
          add(element, 'warning', 'scriptListenerFieldsIgnored')
        }
      } else if (script) {
        add(element, 'warning', 'listenerScriptTypeRequired')
      }

      const onTransaction = hasText(listener.onTransaction)
        ? String(listener.onTransaction)
        : ''
      if (
        onTransaction &&
        !['before-commit', 'committed', 'rolled-back'].includes(onTransaction)
      ) {
        add(element, 'error', 'listenerTransactionInvalid', { transaction: onTransaction })
      }
      if (
        onTransaction &&
        (hasText(listener.expression) || scriptType)
      ) {
        add(element, 'error', 'listenerTransactionImplementationInvalid')
      }
      const resolvers = [
        listener.customPropertiesResolverClass,
        listener.customPropertiesResolverExpression,
        listener.customPropertiesResolverDelegateExpression,
      ].filter(hasText)
      if (resolvers.length > 1) {
        add(element, 'error', 'listenerMultiplePropertyResolvers')
      }
      if (resolvers.length && !onTransaction) {
        add(element, 'error', 'listenerPropertyResolverTransactionOnly')
      }
      if (
        onTransaction &&
        hasText(listener.delegateExpression) &&
        ((listener.fields as BpmnExtensionElement[] | undefined) || []).length
      ) {
        add(element, 'warning', 'transactionDelegateFieldsIgnored')
      }
    }
    for (const formProperty of extensions.filter(
      (item) => item.$type === 'flowable:FormProperty',
    )) {
      if (!hasText(formProperty.id)) add(element, 'error', 'formPropertyIdRequired')
    }
  }

  for (const flow of diagramElements.filter((element) => element.type === SEQUENCE_FLOW)) {
    const source = flow.businessObject.sourceRef
    if (!source) continue
    const sourceElement = diagramElements.find((element) => element.id === source.id)
    const outgoing = source.outgoing || []
    const defaultFlow = source.default
    const hasCondition = hasText(flow.businessObject.conditionExpression?.body)

    if (defaultFlow?.id === flow.id && hasCondition) {
      add(flow, 'error', 'defaultFlowConditionForbidden')
    }
    if (source.$type === 'bpmn:ExclusiveGateway' && outgoing.length > 1) {
      if (defaultFlow?.id !== flow.id && !hasCondition) {
        add(flow, 'warning', 'exclusiveGatewayConditionRecommended')
      }
      if (!defaultFlow && sourceElement && outgoing.length > 1) {
        const alreadyReported = problems.some(
          (problem) =>
            problem.elementId === sourceElement.id &&
            problem.code === 'exclusiveGatewayDefaultRecommended',
        )
        if (!alreadyReported) {
          add(sourceElement, 'warning', 'exclusiveGatewayDefaultRecommended')
        }
      }
    }
  }

  return problems
}
