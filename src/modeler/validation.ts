import type {
  BpmnBusinessObject,
  BpmnExtensionElement,
  DiagramElement,
  ValidationProblem,
} from './types'
import {
  isFlowableServiceTaskType,
  isOutOfScopeServiceTaskType,
} from './serviceTaskTypes'

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
    message: string,
  ) => {
    problems.push({
      id: `${element.id}-${sequence++}`,
      elementId: element.id,
      elementName: String(element.businessObject.name || element.id),
      level,
      message,
    })
  }

  const diagramElements = elements.filter((element) => !element.labelTarget)
  const processes = diagramElements.filter((element) => element.type === 'bpmn:Process')
  const startEvents = diagramElements.filter((element) => element.type === START_EVENT)
  const endEvents = diagramElements.filter((element) => element.type === END_EVENT)

  for (const process of processes) {
    const id = String(process.businessObject.id || '')
    if (!id) add(process, 'error', '流程标识不能为空')
    else if (!/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(id)) {
      add(process, 'error', '流程标识必须以字母或下划线开头，且不能包含空格')
    }
    if (valueOf(process.businessObject, 'isExecutable') !== true) {
      add(process, 'warning', '流程尚未设置为可执行，部署后不能启动')
    }
    if (valueOf(process.businessObject, 'flowable:enableEagerExecutionTreeFetching') !== undefined) {
      add(process, 'warning', '旧预取执行树属性不会被 Flowable 6.8.1 读取，请改用 isEagerExecutionFetching')
    }
  }

  if (!startEvents.length && processes.length) add(processes[0]!, 'error', '流程至少需要一个开始事件')
  if (!endEvents.length && processes.length) add(processes[0]!, 'warning', '流程建议至少配置一个结束事件')

  for (const element of diagramElements) {
    const businessObject = element.businessObject

    if (isFlowNode(element)) {
      const incoming = element.incoming || []
      const outgoing = element.outgoing || []

      if (element.type !== START_EVENT && element.type !== BOUNDARY_EVENT && incoming.length === 0) {
        add(element, 'warning', '节点没有入口连线')
      }
      if (element.type !== END_EVENT && element.type !== BOUNDARY_EVENT && outgoing.length === 0) {
        add(element, 'warning', '节点没有出口连线')
      }
      if (element.type === START_EVENT && outgoing.length === 0) add(element, 'error', '开始事件没有出口连线')
      if (element.type === END_EVENT && incoming.length === 0) add(element, 'error', '结束事件没有入口连线')

      if (
        isFalse(valueOf(businessObject, 'flowable:exclusive')) &&
        !isTrue(valueOf(businessObject, 'flowable:async')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncBefore'))
      ) {
        add(element, 'warning', 'exclusive="false" 仅在 flowable:async="true" 时生效')
      }
      if (
        isFalse(valueOf(businessObject, 'flowable:asyncLeaveExclusive')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncLeave')) &&
        !isTrue(valueOf(businessObject, 'flowable:asyncAfter'))
      ) {
        add(
          element,
          'warning',
          'asyncLeaveExclusive="false" 仅在 flowable:asyncLeave="true" 时生效',
        )
      }
      if (hasText(valueOf(businessObject, 'flowable:jobCategory'))) {
        add(
          element,
          'warning',
          'flowable:jobCategory 属性不会被 Flowable 6.8.1 读取，请改用 jobCategory 扩展元素',
        )
      }
      if (hasText(valueOf(businessObject, 'flowable:leaveJobCategory'))) {
        add(
          element,
          'warning',
          'flowable:leaveJobCategory 属性不会被 Flowable 6.8.1 读取',
        )
      }
    }

    if (element.type === 'bpmn:UserTask') {
      const assignee = valueOf(businessObject, 'flowable:assignee')
      const users = valueOf(businessObject, 'flowable:candidateUsers')
      const groups = valueOf(businessObject, 'flowable:candidateGroups')
      if (![assignee, users, groups].some(hasText)) {
        add(element, 'warning', '用户任务未配置办理人、候选用户或候选组')
      }

      const customResources = (businessObject.extensionElements?.values || []).filter(
        (extension) => extension.$type === 'flowable:CustomResource',
      )
      for (const customResource of customResources) {
        if (!hasText(valueOf(customResource, 'name'))) {
          add(element, 'error', '自定义身份链接类型不能为空')
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
            `自定义身份链接 ${String(valueOf(customResource, 'name') || '')} 的分配表达式不能为空`,
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
      if (!implementation.some(hasText)) add(element, 'error', '服务任务未配置实现方式')
      if (implementation.filter(hasText).length > 1) {
        add(element, 'error', '服务任务配置了多个实现方式，Flowable 只会使用其中一个')
      }

      const normalizedType = typeof serviceTaskType === 'string' ? serviceTaskType.trim() : ''
      if (normalizedType && isOutOfScopeServiceTaskType(normalizedType)) {
        add(element, 'error', '服务任务类型 case 依赖 CMMN，不在当前 BPMN-only 范围内')
      } else if (
        normalizedType &&
        !isFlowableServiceTaskType(normalizedType) &&
        !allowedServiceTaskTypes.has(normalizedType)
      ) {
        add(
          element,
          'error',
          `服务任务类型 ${normalizedType} 不是当前支持的 Flowable 6.8.1 BPMN 类型，且宿主未声明运行时适配`,
        )
      }
      if (
        ['external-worker', 'external'].includes(normalizedType) &&
        !hasText(valueOf(businessObject, 'flowable:topic'))
      ) {
        add(element, 'error', '外部工作任务未配置主题')
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
          add(element, 'error', '邮件任务未配置收件人、抄送或密送地址')
        }
        if (!['text', 'textVar', 'html', 'htmlVar'].some((name) => hasText(serviceField(name)))) {
          add(element, 'error', '邮件任务未配置文本或 HTML 正文')
        }
      } else if (normalizedType === 'shell') {
        if (!hasText(serviceField('command'))) add(element, 'error', 'Shell 任务未配置命令')
      } else if (normalizedType === 'dmn') {
        if (
          !hasText(serviceField('decisionTableReferenceKey')) &&
          !hasText(serviceField('decisionServiceReferenceKey'))
        ) {
          add(element, 'error', 'DMN 任务未配置决策表或决策服务标识')
        }
      } else if (normalizedType === 'http') {
        if (!hasText(serviceField('requestMethod'))) {
          add(element, 'error', 'HTTP 任务未配置请求方式')
        }
        if (!hasText(serviceField('requestUrl'))) {
          add(element, 'error', 'HTTP 任务未配置请求地址')
        }
      } else if (normalizedType === 'send-event') {
        if (!hasText(serviceExtensionBody('flowable:EventType'))) {
          add(element, 'error', '发送事件任务未配置事件类型')
        }
        if (
          !hasText(serviceExtensionBody('flowable:ChannelKey')) &&
          !serviceExtensions.some((value) => value.$type === 'flowable:SystemChannel')
        ) {
          add(element, 'error', '发送事件任务未配置出站通道或系统通道')
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
        add(element, 'error', '结果变量仅对表达式服务任务生效')
      }
      if (
        !hasResultVariable &&
        (
          isTrue(valueOf(businessObject, 'flowable:useLocalScopeForResultVariable')) ||
          isTrue(valueOf(businessObject, 'flowable:storeResultVariableAsTransient'))
        )
      ) {
        add(element, 'warning', '未配置结果变量时，结果变量作用域选项不会生效')
      }
      if (hasText(valueOf(businessObject, 'flowable:resultVariable'))) {
        add(element, 'warning', '旧结果变量属性将在编辑后规范化为 resultVariableName')
      }
    }

    if (element.type === 'bpmn:ScriptTask') {
      if (!hasText(businessObject.scriptFormat)) add(element, 'error', '脚本任务未配置脚本格式')
      if (!hasText(businessObject.script)) add(element, 'error', '脚本任务内容不能为空')
    }

    if (element.type === 'bpmn:CallActivity') {
      if (!hasText(businessObject.calledElement)) {
        add(element, 'error', '调用活动未配置被调用流程标识')
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
        add(element, 'error', '调用活动的被调用流程类型必须为 key 或 id')
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
        add(element, 'error', '定时事件未配置时间或周期表达式')
      }
    }
    if (eventDefinition?.$type === 'bpmn:ConditionalEventDefinition') {
      const condition = eventDefinition.condition as BpmnBusinessObject | undefined
      if (!hasText(condition?.body)) add(element, 'error', '条件事件未配置条件表达式')
    }
    if (eventDefinition?.$type === 'bpmn:MessageEventDefinition') {
      const messageRef = eventDefinition.messageRef as BpmnBusinessObject | undefined
      const messageExpression = valueOf(eventDefinition, 'flowable:messageExpression')
      if (!messageRef?.id && !hasText(messageExpression)) {
        add(element, 'error', '消息事件必须配置消息引用或消息表达式')
      }
    }
    if (eventDefinition?.$type === 'bpmn:SignalEventDefinition') {
      const signalRef = eventDefinition.signalRef as BpmnBusinessObject | undefined
      const signalExpression = valueOf(eventDefinition, 'flowable:signalExpression')
      if (!signalRef?.id && !hasText(signalExpression)) {
        add(element, 'error', '信号事件必须配置信号引用或信号表达式')
      }
    }
    if (eventDefinition?.$type === 'bpmn:ErrorEventDefinition') {
      const errorRef = eventDefinition.errorRef as BpmnBusinessObject | undefined
      if (
        !errorRef?.id &&
        ['bpmn:EndEvent', 'bpmn:IntermediateThrowEvent'].includes(element.type)
      ) {
        add(element, 'error', '抛出错误事件必须引用全局错误定义')
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
        add(element, 'error', '多实例需要配置循环基数或集合表达式')
      }
      if (hasText(collection) && !hasText(valueOf(loop, 'flowable:elementVariable'))) {
        add(element, 'warning', '集合多实例建议配置元素变量')
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
        add(element, 'warning', `${extensionType.replace('flowable:', '')} 存在重复扩展，属性面板只编辑第一项`)
      }
    }

    for (const retryCycle of extensionsByType.get('flowable:FailedJobRetryTimeCycle') || []) {
      if (!hasText(extensionBody(retryCycle))) {
        add(element, 'error', '失败作业重试周期不能为空')
      }
    }
    for (const jobCategory of extensionsByType.get('flowable:JobCategory') || []) {
      if (!hasText(extensionBody(jobCategory))) add(element, 'error', '作业分类不能为空')
    }
    if (
      extensionsByType.has('flowable:FailedJobRetryTimeCycle') &&
      element.type !== 'bpmn:ServiceTask'
    ) {
      add(element, 'warning', 'Flowable 6.8.1 仅从服务任务读取失败作业重试周期')
    }

    for (const container of extensionsByType.get('flowable:Properties') || []) {
      const values = (container.values as BpmnExtensionElement[] | undefined) || []
      for (const property of values) {
        if (!hasText(property.name)) add(element, 'error', '扩展属性名称不能为空')
        if (!hasText(property.value)) add(element, 'error', `扩展属性 ${property.name || property.id || ''} 的值不能为空`)
      }
    }

    for (const formData of extensionsByType.get('flowable:FormData') || []) {
      const fields = (formData.fields as BpmnExtensionElement[] | undefined) || []
      for (const field of fields) {
        if (!hasText(field.id)) add(element, 'error', 'FormData 表单字段标识不能为空')
        const nestedProperties = field.properties as BpmnExtensionElement | undefined
        for (const property of
          (nestedProperties?.values as BpmnExtensionElement[] | undefined) || []) {
          if (!hasText(property.name)) add(element, 'error', `表单字段 ${field.id || ''} 的扩展属性名称不能为空`)
          if (!hasText(property.value)) add(element, 'error', `表单字段 ${field.id || ''} 的扩展属性值不能为空`)
        }
      }
    }

    const mapExceptions = extensionsByType.get('flowable:MapException') || []
    for (const mapException of mapExceptions) {
      if (!hasText(mapException.errorCode)) add(element, 'error', '异常映射的错误码不能为空')
    }
    if (
      mapExceptions.length &&
      !['bpmn:ServiceTask', 'bpmn:CallActivity'].includes(element.type)
    ) {
      add(element, 'warning', 'Flowable 仅在服务任务和调用活动中执行异常映射')
    }
    if (mapExceptions.filter((mapException) => !hasText(mapException.class)).length > 1) {
      add(element, 'warning', '存在多个默认异常映射，只有列表中的第一个会作为兜底项')
    }

    for (const mapping of extensions.filter((item) =>
      ['flowable:In', 'flowable:Out'].includes(item.$type),
    )) {
      const variables = String(mapping.variables || '')
      if (isTrue(mapping.local)) {
        add(element, 'warning', 'Flowable 6.8.1 不执行输入/输出映射的 local 属性')
      }
      if (variables) {
        if (variables !== 'all') add(element, 'warning', '变量集合映射应使用 variables="all"')
        if (mapping.$type === 'flowable:Out') {
          add(element, 'error', 'Flowable 6.8.1 不支持输出参数 variables="all"')
        }
        if (isTrue(mapping.transient)) {
          add(element, 'warning', '变量集合映射不会执行 transient 属性')
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
          'Flowable 6.8.1 在调用活动中按普通变量处理 transient 映射',
        )
      }
      if (!hasText(mapping.source) && !hasText(mapping.sourceExpression)) {
        add(element, 'error', '输入/输出映射必须配置来源变量或表达式')
      }
      if (!hasText(mapping.target)) add(element, 'error', '普通输入/输出映射必须配置目标变量')
    }

    for (const [extensionType, label] of businessJsonExtensions) {
      const extension = extensionsByType.get(extensionType)?.[0]
      if (!extension) continue
      const body = extensionBody(extension)
      if (!body.trim()) continue
      try {
        const parsed = JSON.parse(body) as unknown
        if (!Array.isArray(parsed) && (parsed === null || typeof parsed !== 'object')) {
          add(element, 'error', `${label} 顶层必须是 JSON 数组或对象`)
        }
      } catch {
        add(element, 'error', `${label} 不是合法 JSON`)
      }
    }

    if (element.type === 'bpmn:UserTask') {
      const assignmentType = extensionBody(extensionsByType.get('flowable:AssigneeType')?.[0] || ({ $type: '' } as BpmnExtensionElement))
      if (assignmentType && !['static', 'idm'].includes(assignmentType)) {
        add(element, 'warning', `AssigneeType 使用了未识别的模式：${assignmentType}`)
      } else if (assignmentType === 'static' && !extensionsByType.has('flowable:StaticAssigneeVariables')) {
        add(element, 'warning', 'static 分配模式尚未配置 StaticAssigneeVariables')
      } else if (
        assignmentType === 'idm' &&
        !['flowable:IdmAssignee', 'flowable:IdmCandidateUsers', 'flowable:IdmCandidateGroups'].some(
          (extensionType) => extensionsByType.has(extensionType),
        )
      ) {
        add(element, 'warning', 'IDM 分配模式尚未配置人员或组元数据')
      }

      const nodeForm = extensionsByType.get('flowable:NodeFormExp')?.[0]
      if (nodeForm) {
        try {
          const parsed = JSON.parse(extensionBody(nodeForm)) as unknown
          if (!Array.isArray(parsed)) {
            add(element, 'warning', 'NodeFormExp 应使用表单对象数组')
          } else {
            if (parsed.length > 1) add(element, 'warning', 'NodeFormExp 只支持选择一个表单')
            for (const item of parsed) {
              if (!item || typeof item !== 'object' || Array.isArray(item)) continue
              const record = item as Record<string, unknown>
              if (!hasText(record.code) || !hasText(record.name)) {
                add(element, 'error', 'NodeFormExp 表单项必须包含 code 和 name')
              }
            }
          }
          const first = Array.isArray(parsed) ? parsed[0] : undefined
          const code = first && typeof first === 'object' ? String((first as Record<string, unknown>).code || '') : ''
          const formKey = String(valueOf(businessObject, 'flowable:formKey') || '')
          if (code && formKey && code !== formKey) {
            add(element, 'warning', `NodeFormExp 首项 code（${code}）与 formKey（${formKey}）不一致`)
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
            add(element, 'warning', `${label} 应使用对象数组`)
            continue
          }
          for (const item of parsed) {
            if (!item || typeof item !== 'object' || Array.isArray(item)) continue
            const record = item as Record<string, unknown>
            if (!hasText(record.code) || !hasText(record.name)) {
              add(element, 'error', `${label} 配置项必须包含 name 和 code`)
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
        add(element, 'error', '任务监听器只能配置在用户任务上')
      }
      if (!isTaskListener && !supportsExecutionListener) {
        add(element, 'error', '当前 BPMN 元素不支持执行监听器')
      }

      const event = hasText(listener.event) ? String(listener.event) : ''
      if (!event && !(isSequenceFlowListener && !isTaskListener)) {
        add(element, 'error', '监听器事件不能为空')
      }
      if (
        isTaskListener &&
        event &&
        !['create', 'assignment', 'complete', 'delete', 'all'].includes(event)
      ) {
        add(element, 'error', `任务监听器事件无效：${event}`)
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
        add(element, 'error', `执行监听器事件无效：${event}`)
      }
      const scriptType = listener.type === 'script'
      const script = listener.script as BpmnExtensionElement | undefined
      const implementationCount = [
        listener.class,
        listener.expression,
        listener.delegateExpression,
      ].filter(hasText).length + (scriptType ? 1 : 0)
      if (!implementationCount) add(element, 'error', '监听器未配置实现方式')
      if (implementationCount > 1) {
        add(element, 'error', '监听器配置了多个实现方式，Flowable 只会使用其中一个')
      }
      if (hasText(listener.type) && !scriptType) {
        add(element, 'error', `监听器使用了不支持的实现类型：${listener.type}`)
      }
      if (scriptType) {
        if (!script) add(element, 'error', '脚本监听器缺少 script 子元素')
        else {
          if (!hasText(script.language)) add(element, 'error', '脚本监听器未配置脚本语言')
          if (!hasText(script.value)) add(element, 'error', '脚本监听器内容不能为空')
          if (hasText(script.scriptFormat)) {
            add(element, 'warning', 'Flowable 6.8.1 不读取监听器脚本的 scriptFormat 属性')
          }
          if (hasText(script.resource)) {
            add(element, 'warning', 'Flowable 6.8.1 不读取监听器脚本的 resource 属性')
          }
        }
        if (((listener.fields as BpmnExtensionElement[] | undefined) || []).length) {
          add(element, 'warning', 'Flowable 会忽略脚本监听器的字段注入')
        }
      } else if (script) {
        add(element, 'warning', '缺少 type="script"，监听器的 script 子元素不会执行')
      }

      const onTransaction = hasText(listener.onTransaction)
        ? String(listener.onTransaction)
        : ''
      if (
        onTransaction &&
        !['before-commit', 'committed', 'rolled-back'].includes(onTransaction)
      ) {
        add(element, 'error', `监听器事务阶段无效：${onTransaction}`)
      }
      if (
        onTransaction &&
        (hasText(listener.expression) || scriptType)
      ) {
        add(element, 'error', '表达式或脚本监听器不能配置事务阶段')
      }
      const resolvers = [
        listener.customPropertiesResolverClass,
        listener.customPropertiesResolverExpression,
        listener.customPropertiesResolverDelegateExpression,
      ].filter(hasText)
      if (resolvers.length > 1) {
        add(element, 'error', '监听器配置了多个自定义属性解析器')
      }
      if (resolvers.length && !onTransaction) {
        add(element, 'error', '自定义属性解析器只能配置在事务监听器上')
      }
      if (
        onTransaction &&
        hasText(listener.delegateExpression) &&
        ((listener.fields as BpmnExtensionElement[] | undefined) || []).length
      ) {
        add(element, 'warning', 'Flowable 会忽略事务代理表达式监听器的字段注入')
      }
    }
    for (const formProperty of extensions.filter(
      (item) => item.$type === 'flowable:FormProperty',
    )) {
      if (!hasText(formProperty.id)) add(element, 'error', '表单字段标识不能为空')
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
      add(flow, 'error', '默认流转路径不能同时配置条件表达式')
    }
    if (source.$type === 'bpmn:ExclusiveGateway' && outgoing.length > 1) {
      if (defaultFlow?.id !== flow.id && !hasCondition) {
        add(flow, 'warning', '排他网关的非默认出口建议配置条件表达式')
      }
      if (!defaultFlow && sourceElement && outgoing.length > 1) {
        const alreadyReported = problems.some(
          (problem) =>
            problem.elementId === sourceElement.id && problem.message.includes('默认流转路径'),
        )
        if (!alreadyReported) add(sourceElement, 'warning', '排他网关建议配置默认流转路径')
      }
    }
  }

  return problems
}
