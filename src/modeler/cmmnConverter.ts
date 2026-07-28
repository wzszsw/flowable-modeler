import type { ModelerModel } from './modelerApi'
import { MODEL_TYPES, type ModelType } from './modelTypes'

type JsonObject = Record<string, unknown>

interface Point {
  x: number
  y: number
}

interface Bounds {
  lowerRight: Point
  upperLeft: Point
}

interface OryxShape extends JsonObject {
  resourceId: string
  properties: JsonObject
  stencil: { id: string }
  childShapes: OryxShape[]
  outgoing: Array<{ resourceId: string }>
  bounds: Bounds
  dockers: Point[]
  target?: { resourceId: string }
}

interface CmmnConverterOptions {
  modelId: string
  name: string
  key: string
  description: string
  references?: readonly ModelerModel[]
}

const CMMN_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/MODEL'
const CMMNDI_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/CMMNDI'
const DC_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/DC'
const DI_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/DI'
const FLOWABLE_NAMESPACE = 'http://flowable.org/cmmn'
const MODELER_NAMESPACE = 'http://flowable.org/modeler/frontend'
const RAW_XML_PROPERTY = 'flowableModelerCmmn11Xml'

const snapshots = new Map<string, JsonObject>()

const STENCIL_TO_ELEMENT: Record<string, string> = {
  Stage: 'stage',
  Task: 'task',
  HumanTask: 'humanTask',
  DecisionTask: 'decisionTask',
  ProcessTask: 'processTask',
  CaseTask: 'caseTask',
  Milestone: 'milestone',
  EventListener: 'eventListener',
  UserEventListener: 'userEventListener',
  TimerEventListener: 'timerEventListener',
  VariableEventListener: 'eventListener',
  ServiceTask: 'task',
  ScriptTask: 'task',
  HttpTask: 'task',
  MailTask: 'task',
  SendEventTask: 'task',
  ExternalWorkerTask: 'task',
  ExternalWorkerServiceTask: 'task',
}

const ELEMENT_TO_STENCIL: Record<string, string> = {
  stage: 'Stage',
  task: 'Task',
  humanTask: 'HumanTask',
  decisionTask: 'DecisionTask',
  processTask: 'ProcessTask',
  caseTask: 'CaseTask',
  milestone: 'Milestone',
  eventListener: 'EventListener',
  userEventListener: 'UserEventListener',
  timerEventListener: 'TimerEventListener',
}

const KNOWN_PROPERTIES = new Set([
  'overrideid',
  'name',
  'documentation',
  'isblocking',
  'isblockingexpression',
  'processtaskprocessreference',
  'processtaskinparameters',
  'processtaskoutparameters',
  'casetaskcasereference',
  'casetaskinparameters',
  'casetaskoutparameters',
  'casetaskbusinesskey',
  'casetaskinheritbusinesskey',
  'decisiontaskdecisiontablereference',
  'decisiontaskdecisionservicereference',
  'decisiontaskthrowerroronnohits',
  'decisiontaskfallbacktodefaulttenant',
  'fallbacktodefaulttenant',
  'samedeployment',
  'idvariablename',
  'idVariableName',
  'condition',
  'ifpartcondition',
  'triggerMode',
  'transitionevent',
])

function deepClone<T>(value: T): T {
  return structuredClone(value)
}

function objectValue(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : {}
}

function arrayValue<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

function stringValue(value: unknown) {
  return value === undefined || value === null ? '' : String(value)
}

function numberValue(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  return value === true || value === 'true'
}

function xmlEscape(value: unknown) {
  return stringValue(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function xmlAttribute(name: string, value: unknown) {
  const text = stringValue(value)
  return text ? ` ${name}="${xmlEscape(text)}"` : ''
}

function makeBounds(left: number, top: number, width: number, height: number): Bounds {
  return {
    upperLeft: { x: left, y: top },
    lowerRight: { x: left + width, y: top + height },
  }
}

function normalizedBounds(value: unknown, fallback = makeBounds(0, 0, 100, 80)): Bounds {
  const source = objectValue(value)
  const upperLeft = objectValue(source.upperLeft)
  const lowerRight = objectValue(source.lowerRight)
  const left = numberValue(upperLeft.x, fallback.upperLeft.x)
  const top = numberValue(upperLeft.y, fallback.upperLeft.y)
  const right = numberValue(lowerRight.x, fallback.lowerRight.x)
  const bottom = numberValue(lowerRight.y, fallback.lowerRight.y)
  return {
    upperLeft: { x: left, y: top },
    lowerRight: { x: Math.max(left + 1, right), y: Math.max(top + 1, bottom) },
  }
}

function absoluteBounds(bounds: Bounds, origin: Point): Bounds {
  return {
    upperLeft: {
      x: bounds.upperLeft.x + origin.x,
      y: bounds.upperLeft.y + origin.y,
    },
    lowerRight: {
      x: bounds.lowerRight.x + origin.x,
      y: bounds.lowerRight.y + origin.y,
    },
  }
}

function relativeBounds(bounds: Bounds, origin: Point): Bounds {
  return {
    upperLeft: {
      x: bounds.upperLeft.x - origin.x,
      y: bounds.upperLeft.y - origin.y,
    },
    lowerRight: {
      x: bounds.lowerRight.x - origin.x,
      y: bounds.lowerRight.y - origin.y,
    },
  }
}

function center(bounds: Bounds): Point {
  return {
    x: (bounds.upperLeft.x + bounds.lowerRight.x) / 2,
    y: (bounds.upperLeft.y + bounds.lowerRight.y) / 2,
  }
}

function absoluteWaypoints(
  dockers: readonly Point[],
  sourceBounds: Bounds,
  targetBounds: Bounds,
) {
  if (dockers.length < 2) return [center(sourceBounds), center(targetBounds)]
  const source = dockers[0]!
  const target = dockers[dockers.length - 1]!
  return [
    {
      x: sourceBounds.upperLeft.x + numberValue(source.x),
      y: sourceBounds.upperLeft.y + numberValue(source.y),
    },
    ...dockers.slice(1, -1).map((point) => ({
      x: numberValue(point.x),
      y: numberValue(point.y),
    })),
    {
      x: targetBounds.upperLeft.x + numberValue(target.x),
      y: targetBounds.upperLeft.y + numberValue(target.y),
    },
  ]
}

function relativeDockers(
  waypoints: readonly Point[],
  sourceBounds: Bounds,
  targetBounds: Bounds,
) {
  const points = waypoints.length >= 2 ? waypoints : [center(sourceBounds), center(targetBounds)]
  const source = points[0]!
  const target = points[points.length - 1]!
  return [
    {
      x: source.x - sourceBounds.upperLeft.x,
      y: source.y - sourceBounds.upperLeft.y,
    },
    ...points.slice(1, -1),
    {
      x: target.x - targetBounds.upperLeft.x,
      y: target.y - targetBounds.upperLeft.y,
    },
  ]
}

function shapeProperties(shape: OryxShape) {
  return objectValue(shape.properties)
}

function stencilId(shape: OryxShape) {
  return stringValue(objectValue(shape.stencil).id)
}

function elementId(shape: OryxShape) {
  return stringValue(shapeProperties(shape).overrideid).trim() || shape.resourceId
}

function isCriterion(shape: OryxShape) {
  return ['EntryCriterion', 'ExitCriterion'].includes(stencilId(shape))
}

function isConnection(shape: OryxShape) {
  return stencilId(shape) === 'Association'
}

function indexShapes(shapes: OryxShape[], target = new Map<string, OryxShape>()) {
  for (const shape of shapes) {
    target.set(shape.resourceId, shape)
    target.set(elementId(shape), shape)
    indexShapes(arrayValue<OryxShape>(shape.childShapes), target)
  }
  return target
}

function stripKnownProperties(properties: JsonObject) {
  return Object.fromEntries(
    Object.entries(properties).filter(([name]) => !KNOWN_PROPERTIES.has(name)),
  )
}

function mergeShape(generated: OryxShape, existing?: OryxShape): OryxShape {
  if (!existing) return generated
  return {
    ...deepClone(existing),
    ...generated,
    properties: {
      ...stripKnownProperties(shapeProperties(existing)),
      ...generated.properties,
    },
    childShapes: generated.childShapes,
  }
}

function referenceValue(
  value: unknown,
  expectedTypes: readonly ModelType[],
  references: readonly ModelerModel[],
) {
  const reference = objectValue(value)
  const storedId = stringValue(reference.id)
  const storedKey = stringValue(reference.key) || (typeof value === 'string' ? value : '')
  const match =
    references.find(
      (model) => expectedTypes.includes(model.modelType) && model.id === storedId,
    ) ||
    references.find(
      (model) => expectedTypes.includes(model.modelType) && model.key === storedKey,
    )
  const key = storedKey || match?.key || ''
  if (!key) return null
  return {
    id: storedId || match?.id || '',
    name: stringValue(reference.name) || match?.name || key,
    key,
  }
}

function referenceAttributes(
  reference: ReturnType<typeof referenceValue>,
  modelType?: ModelType,
) {
  if (!reference) return ''
  return [
    xmlAttribute('flowablemodeler:modelId', reference.id),
    xmlAttribute('flowablemodeler:modelName', reference.name),
    xmlAttribute('flowablemodeler:modelKey', reference.key),
    modelType === undefined ? '' : xmlAttribute('flowablemodeler:modelType', modelType),
  ].join('')
}

function referenceForShape(shape: OryxShape, references: readonly ModelerModel[]) {
  const properties = shapeProperties(shape)
  const stencil = stencilId(shape)
  if (stencil === 'ProcessTask') {
    const reference = referenceValue(
      properties.processtaskprocessreference,
      [MODEL_TYPES.process],
      references,
    )
    return reference
      ? { attribute: 'processRef', reference, modelType: MODEL_TYPES.process }
      : null
  }
  if (stencil === 'CaseTask') {
    const reference = referenceValue(
      properties.casetaskcasereference,
      [MODEL_TYPES.case],
      references,
    )
    return reference
      ? { attribute: 'caseRef', reference, modelType: MODEL_TYPES.case }
      : null
  }
  if (stencil === 'DecisionTask') {
    const service = referenceValue(
      properties.decisiontaskdecisionservicereference,
      [MODEL_TYPES.decisionService],
      references,
    )
    const table = referenceValue(
      properties.decisiontaskdecisiontablereference,
      [MODEL_TYPES.decisionTable],
      references,
    )
    if (service) {
      return {
        attribute: 'decisionRef',
        reference: service,
        modelType: MODEL_TYPES.decisionService,
      }
    }
    return table
      ? {
          attribute: 'decisionRef',
          reference: table,
          modelType: MODEL_TYPES.decisionTable,
        }
      : null
  }
  return null
}

function documentationXml(properties: JsonObject) {
  const documentation = stringValue(properties.documentation)
  return documentation
    ? `<cmmn:documentation><cmmn:text>${xmlEscape(documentation)}</cmmn:text></cmmn:documentation>`
    : ''
}

function flowableBooleanAttribute(name: string, value: unknown) {
  return booleanValue(value) ? xmlAttribute(`flowable:${name}`, 'true') : ''
}

function ioParameters(
  properties: JsonObject,
  propertyName: string,
  collectionName: string,
) {
  const container = objectValue(properties[propertyName])
  return arrayValue<JsonObject>(container[collectionName])
}

function ioParameterXml(elementName: 'in' | 'out', parameter: JsonObject) {
  const attributes = [
    xmlAttribute('source', parameter.source),
    xmlAttribute('sourceExpression', parameter.sourceExpression),
    xmlAttribute('target', parameter.target),
    xmlAttribute('targetExpression', parameter.targetExpression),
  ].join('')
  return attributes ? `<flowable:${elementName}${attributes} />` : ''
}

function taskExtensionElementsXml(stencil: string, properties: JsonObject) {
  const values: string[] = []
  if (stencil === 'ProcessTask' || stencil === 'CaseTask') {
    const prefix = stencil === 'ProcessTask' ? 'processtask' : 'casetask'
    for (const parameter of ioParameters(properties, `${prefix}inparameters`, 'inParameters')) {
      values.push(ioParameterXml('in', parameter))
    }
    for (const parameter of ioParameters(properties, `${prefix}outparameters`, 'outParameters')) {
      values.push(ioParameterXml('out', parameter))
    }
  } else if (stencil === 'DecisionTask') {
    for (const [name, propertyName] of [
      ['decisionTaskThrowErrorOnNoHits', 'decisiontaskthrowerroronnohits'],
      ['fallbackToDefaultTenant', 'decisiontaskfallbacktodefaulttenant'],
    ] as const) {
      values.push(
        `<flowable:field name="${name}"><flowable:string>${booleanValue(properties[propertyName])}</flowable:string></flowable:field>`,
      )
    }
  }
  const xml = values.filter(Boolean).join('')
  return xml ? `<cmmn:extensionElements>${xml}</cmmn:extensionElements>` : ''
}

function taskFlowableAttributes(stencil: string, properties: JsonObject) {
  const attributes = [
    xmlAttribute('flowable:isBlockingExpression', properties.isblockingexpression),
  ]
  if (stencil === 'ProcessTask' || stencil === 'CaseTask') {
    attributes.push(
      flowableBooleanAttribute('fallbackToDefaultTenant', properties.fallbacktodefaulttenant),
      flowableBooleanAttribute('sameDeployment', properties.samedeployment),
      xmlAttribute(
        'flowable:idVariableName',
        properties.idvariablename ?? properties.idVariableName,
      ),
    )
  }
  if (stencil === 'CaseTask') {
    attributes.push(
      xmlAttribute('flowable:businessKey', properties.casetaskbusinesskey),
      flowableBooleanAttribute('inheritBusinessKey', properties.casetaskinheritbusinesskey),
    )
  }
  return attributes.join('')
}

interface XmlBuildContext {
  shapeById: Map<string, OryxShape>
  absoluteBoundsByResourceId: Map<string, Bounds>
  connectionSource: Map<string, string>
  references: readonly ModelerModel[]
  diShapes: string[]
  diEdges: string[]
  connectionShapes: OryxShape[]
  generatedId: number
}

function nextId(context: XmlBuildContext, prefix: string) {
  context.generatedId += 1
  return `${prefix}_${context.generatedId}`
}

function criterionOwner(
  criterion: OryxShape,
  planShapes: OryxShape[],
) {
  return planShapes.find((shape) =>
    arrayValue<{ resourceId?: unknown }>(shape.outgoing).some(
      (outgoing) => stringValue(outgoing.resourceId) === criterion.resourceId,
    ),
  )
}

function criterionXml(
  context: XmlBuildContext,
  criterion: OryxShape,
  planItemId: string,
) {
  const type = stencilId(criterion) === 'ExitCriterion' ? 'exitCriterion' : 'entryCriterion'
  const criterionId = elementId(criterion)
  const sentryId = `${criterionId}_sentry`
  const properties = shapeProperties(criterion)
  const criterionTag = `<cmmn:${type} id="${xmlEscape(criterionId)}" sentryRef="${xmlEscape(sentryId)}" flowablemodeler:oryxId="${xmlEscape(criterion.resourceId)}" />`

  const onParts: string[] = []
  for (const connection of context.connectionShapes) {
    const sourceId = context.connectionSource.get(connection.resourceId) || ''
    const targetId = stringValue(objectValue(connection.target).resourceId)
    let eventSource = ''
    if (sourceId === criterion.resourceId) eventSource = targetId
    else if (targetId === criterion.resourceId) eventSource = sourceId
    if (!eventSource) continue
    const sourceShape = context.shapeById.get(eventSource)
    if (!sourceShape || isCriterion(sourceShape) || isConnection(sourceShape)) continue
    const sourcePlanItemId = `${sourceShape.resourceId}_planItem`
    const onPartId = elementId(connection) || nextId(context, 'PlanItemOnPart')
    const transitionEvent =
      stringValue(shapeProperties(connection).transitionevent).trim() || 'complete'
    onParts.push(
      `<cmmn:planItemOnPart id="${xmlEscape(onPartId)}" sourceRef="${xmlEscape(sourcePlanItemId)}" flowablemodeler:oryxId="${xmlEscape(connection.resourceId)}"><cmmn:standardEvent>${xmlEscape(transitionEvent)}</cmmn:standardEvent></cmmn:planItemOnPart>`,
    )
    const sourceBounds = context.absoluteBoundsByResourceId.get(sourceShape.resourceId)
    const targetBounds = context.absoluteBoundsByResourceId.get(criterion.resourceId)
    if (!sourceBounds || !targetBounds) continue
    const dockers = arrayValue<Point>(connection.dockers)
    const connectionIsReversed = sourceId === criterion.resourceId
    const orderedDockers = connectionIsReversed ? [...dockers].reverse() : dockers
    const waypoints = absoluteWaypoints(orderedDockers, sourceBounds, targetBounds)
    context.diEdges.push(
      `<cmmndi:CMMNEdge id="${xmlEscape(connection.resourceId)}_di" cmmnElementRef="${xmlEscape(onPartId)}">${waypoints
        .map((point) => `<di:waypoint x="${numberValue(point.x)}" y="${numberValue(point.y)}" />`)
        .join('')}</cmmndi:CMMNEdge>`,
    )
  }
  const condition = stringValue(properties.ifpartcondition ?? properties.condition)
  const ifPart = condition
    ? `<cmmn:ifPart><cmmn:condition id="${xmlEscape(sentryId)}_condition"><cmmn:body>${xmlEscape(condition)}</cmmn:body></cmmn:condition></cmmn:ifPart>`
    : ''
  const sentry = `<cmmn:sentry id="${xmlEscape(sentryId)}"${xmlAttribute('name', properties.name)}>${onParts.join('')}${ifPart}</cmmn:sentry>`
  return { criterionTag, sentry, planItemId }
}

function diShapeXml(id: string, elementRef: string, shapeBounds: Bounds, collapsed = false) {
  const width = shapeBounds.lowerRight.x - shapeBounds.upperLeft.x
  const height = shapeBounds.lowerRight.y - shapeBounds.upperLeft.y
  return `<cmmndi:CMMNShape id="${xmlEscape(id)}_di" cmmnElementRef="${xmlEscape(elementRef)}"${collapsed ? ' isCollapsed="true"' : ''}><dc:Bounds x="${shapeBounds.upperLeft.x}" y="${shapeBounds.upperLeft.y}" width="${width}" height="${height}" /></cmmndi:CMMNShape>`
}

function buildContainerXml(
  context: XmlBuildContext,
  containerShape: OryxShape,
  origin: Point,
  isCasePlanModel: boolean,
): { xml: string; planItemTag?: string } {
  const properties = shapeProperties(containerShape)
  const definitionId = elementId(containerShape)
  const elementName = isCasePlanModel ? 'casePlanModel' : 'stage'
  const planShapes = arrayValue<OryxShape>(containerShape.childShapes).filter(
    (shape) => !isCriterion(shape) && !isConnection(shape),
  )
  const criteria = arrayValue<OryxShape>(containerShape.childShapes).filter(isCriterion)
  const containerBounds = absoluteBounds(normalizedBounds(containerShape.bounds), origin)
  context.absoluteBoundsByResourceId.set(containerShape.resourceId, containerBounds)
  const childOrigin = containerBounds.upperLeft
  const planItemTags: string[] = []
  const definitionTags: string[] = []
  const sentryTags: string[] = []

  for (const shape of planShapes) {
    const stencil = stencilId(shape)
    const localName = STENCIL_TO_ELEMENT[stencil] || 'task'
    const childProperties = shapeProperties(shape)
    const childDefinitionId = elementId(shape)
    const planItemId = `${shape.resourceId}_planItem`
    const childBounds = absoluteBounds(normalizedBounds(shape.bounds), childOrigin)
    context.absoluteBoundsByResourceId.set(shape.resourceId, childBounds)
    const ownedCriteria = criteria.filter((criterion) => criterionOwner(criterion, planShapes) === shape)
    const criterionTags: string[] = []
    for (const criterion of ownedCriteria) {
      const criterionBounds = absoluteBounds(normalizedBounds(criterion.bounds), childOrigin)
      context.absoluteBoundsByResourceId.set(criterion.resourceId, criterionBounds)
      const built = criterionXml(context, criterion, planItemId)
      criterionTags.push(built.criterionTag)
      sentryTags.push(built.sentry)
      context.diShapes.push(diShapeXml(criterion.resourceId, elementId(criterion), criterionBounds))
    }
    planItemTags.push(
      `<cmmn:planItem id="${xmlEscape(planItemId)}" definitionRef="${xmlEscape(childDefinitionId)}" flowablemodeler:oryxId="${xmlEscape(shape.resourceId)}">${criterionTags.join('')}</cmmn:planItem>`,
    )

    const reference = referenceForShape(shape, context.references)
    const referenceXml = reference
      ? `${xmlAttribute(reference.attribute, reference.reference.key)}${referenceAttributes(reference.reference, reference.modelType)}`
      : ''
    const blockingExpression = stringValue(childProperties.isblockingexpression)
    const blocking = ['Task', 'HumanTask', 'DecisionTask', 'ProcessTask', 'CaseTask'].includes(stencil)
      ? ` isBlocking="${blockingExpression ? true : booleanValue(childProperties.isblocking, true)}"`
      : ''
    if (localName === 'stage') {
      definitionTags.push(buildContainerXml(context, shape, childOrigin, false).xml)
    } else {
      definitionTags.push(
        `<cmmn:${localName} id="${xmlEscape(childDefinitionId)}"${xmlAttribute('name', childProperties.name)}${blocking}${referenceXml}${taskFlowableAttributes(stencil, childProperties)} flowablemodeler:oryxId="${xmlEscape(shape.resourceId)}">${documentationXml(childProperties)}${taskExtensionElementsXml(stencil, childProperties)}</cmmn:${localName}>`,
      )
    }
    context.diShapes.push(
      diShapeXml(shape.resourceId, planItemId, childBounds, stencil === 'Stage' && !shape.childShapes.length),
    )
  }

  const tag = `<cmmn:${elementName} id="${xmlEscape(definitionId)}"${xmlAttribute('name', properties.name)} flowablemodeler:oryxId="${xmlEscape(containerShape.resourceId)}">${documentationXml(properties)}${planItemTags.join('')}${definitionTags.join('')}${sentryTags.join('')}</cmmn:${elementName}>`
  context.diShapes.push(diShapeXml(containerShape.resourceId, definitionId, containerBounds))
  if (isCasePlanModel) return { xml: tag }
  return {
    xml: tag,
    planItemTag: `<cmmn:planItem id="${xmlEscape(containerShape.resourceId)}_planItem" definitionRef="${xmlEscape(definitionId)}" flowablemodeler:oryxId="${xmlEscape(containerShape.resourceId)}" />`,
  }
}

function collectConnectionSources(shapes: OryxShape[], target = new Map<string, string>()) {
  for (const shape of shapes) {
    for (const outgoing of arrayValue<{ resourceId?: unknown }>(shape.outgoing)) {
      const id = stringValue(outgoing.resourceId)
      if (id && !target.has(id)) target.set(id, shape.resourceId)
    }
    collectConnectionSources(arrayValue<OryxShape>(shape.childShapes), target)
  }
  return target
}

function collectAbsoluteBounds(
  shapes: OryxShape[],
  origin: Point,
  target = new Map<string, Bounds>(),
) {
  for (const shape of shapes) {
    if (isConnection(shape)) continue
    const shapeBounds = absoluteBounds(normalizedBounds(shape.bounds), origin)
    target.set(shape.resourceId, shapeBounds)
    collectAbsoluteBounds(arrayValue<OryxShape>(shape.childShapes), shapeBounds.upperLeft, target)
  }
  return target
}

export function cmmnOryxToXml(model: JsonObject, options: CmmnConverterOptions) {
  snapshots.set(options.modelId, deepClone(model))
  const shapes = arrayValue<OryxShape>(model.childShapes)
  const casePlanModel =
    shapes.find((shape) => stencilId(shape) === 'CasePlanModel') ||
    ({
      resourceId: 'casePlanModel',
      properties: {},
      stencil: { id: 'CasePlanModel' },
      childShapes: [],
      outgoing: [],
      bounds: makeBounds(40, 40, 718, 714),
      dockers: [],
    } satisfies OryxShape)
  const allShapes = indexShapes(shapes)
  const connectionShapes = [...allShapes.values()].filter(isConnection)
  const context: XmlBuildContext = {
    shapeById: allShapes,
    absoluteBoundsByResourceId: collectAbsoluteBounds(shapes, { x: 0, y: 0 }),
    connectionSource: collectConnectionSources(shapes),
    references: options.references || [],
    diShapes: [],
    diEdges: [],
    connectionShapes: [...new Set(connectionShapes)],
    generatedId: 0,
  }
  const casePlan = buildContainerXml(context, casePlanModel, { x: 0, y: 0 }, true)
  const properties = objectValue(model.properties)
  const key = stringValue(properties.case_id) || options.key
  const name = stringValue(properties.name) || options.name
  const description = stringValue(properties.documentation) || options.description
  const definitionsId = `${key}_definitions`
  return `<?xml version="1.0" encoding="UTF-8"?>
<cmmn:definitions xmlns:cmmn="${CMMN_NAMESPACE}" xmlns:cmmndi="${CMMNDI_NAMESPACE}" xmlns:dc="${DC_NAMESPACE}" xmlns:di="${DI_NAMESPACE}" xmlns:flowable="${FLOWABLE_NAMESPACE}" xmlns:flowablemodeler="${MODELER_NAMESPACE}" id="${xmlEscape(definitionsId)}" targetNamespace="http://flowable.org/cmmn">
  <cmmn:case id="${xmlEscape(key)}" name="${xmlEscape(name)}">
    ${description ? `<cmmn:documentation><cmmn:text>${xmlEscape(description)}</cmmn:text></cmmn:documentation>` : ''}
    ${casePlan.xml}
  </cmmn:case>
  <cmmndi:CMMNDI>
    <cmmndi:CMMNDiagram id="${xmlEscape(key)}_diagram">
      ${context.diShapes.join('\n      ')}
      ${context.diEdges.join('\n      ')}
    </cmmndi:CMMNDiagram>
  </cmmndi:CMMNDI>
</cmmn:definitions>`
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError) throw new Error(parseError.textContent || 'Invalid CMMN XML')
  return document
}

function directChildren(element: Element, names?: readonly string[]) {
  return [...element.children].filter(
    (child) => !names || names.includes(child.localName),
  )
}

function firstDirectChild(element: Element | undefined, name: string) {
  return element ? directChildren(element, [name])[0] : undefined
}

function directText(element: Element | undefined, name: string) {
  return firstDirectChild(element, name)?.textContent?.trim() || ''
}

function modelerAttribute(element: Element, name: string) {
  return (
    element.getAttributeNS(MODELER_NAMESPACE, name) ||
    element.getAttribute(`flowablemodeler:${name}`) ||
    ''
  )
}

function flowableAttribute(element: Element, name: string) {
  return (
    element.getAttributeNS(FLOWABLE_NAMESPACE, name) ||
    element.getAttribute(`flowable:${name}`) ||
    ''
  )
}

function flowableExtensionChildren(element: Element, localName: string) {
  const extensionElements = firstDirectChild(element, 'extensionElements')
  return extensionElements
    ? directChildren(extensionElements).filter(
        (child) =>
          child.localName === localName && child.namespaceURI === FLOWABLE_NAMESPACE,
      )
    : []
}

function parsedIoParameters(element: Element, localName: 'in' | 'out') {
  return flowableExtensionChildren(element, localName)
    .map((parameter) =>
      Object.fromEntries(
        [
          ['source', parameter.getAttribute('source')],
          ['sourceExpression', parameter.getAttribute('sourceExpression')],
          ['target', parameter.getAttribute('target')],
          ['targetExpression', parameter.getAttribute('targetExpression')],
        ].filter((entry) => Boolean(entry[1])),
      ),
    )
    .filter((parameter) => Object.values(parameter).some(Boolean))
}

function decisionFieldValue(element: Element, name: string) {
  const field = flowableExtensionChildren(element, 'field').find(
    (candidate) => candidate.getAttribute('name') === name,
  )
  if (!field) return false
  return booleanValue(
    directText(field, 'string') ||
      field.getAttribute('stringValue') ||
      directText(field, 'expression'),
  )
}

function referenceFromElement(
  element: Element,
  key: string,
  expectedTypes: readonly number[],
  references: readonly ModelerModel[],
) {
  const storedId = modelerAttribute(element, 'modelId')
  const storedName = modelerAttribute(element, 'modelName')
  const match =
    references.find((model) => model.id === storedId) ||
    references.find((model) => expectedTypes.includes(model.modelType) && model.key === key)
  if (match) return { id: match.id, name: match.name, key: match.key }
  if (!key) return null
  return { id: storedId, name: storedName || key, key }
}

function boundsFromDi(shape: Element | undefined, fallback: Bounds) {
  const bounds = shape
    ? [...shape.getElementsByTagNameNS('*', 'Bounds')][0]
    : undefined
  if (!bounds) return fallback
  return makeBounds(
    numberValue(bounds.getAttribute('x'), fallback.upperLeft.x),
    numberValue(bounds.getAttribute('y'), fallback.upperLeft.y),
    numberValue(bounds.getAttribute('width'), fallback.lowerRight.x - fallback.upperLeft.x),
    numberValue(bounds.getAttribute('height'), fallback.lowerRight.y - fallback.upperLeft.y),
  )
}

function existingShapeFor(
  existingShapes: Map<string, OryxShape>,
  planItem: Element | undefined,
  definition: Element,
) {
  const oryxId = modelerAttribute(planItem || definition, 'oryxId') || modelerAttribute(definition, 'oryxId')
  return (
    existingShapes.get(oryxId) ||
    existingShapes.get(definition.id) ||
    (planItem ? existingShapes.get(planItem.id) : undefined)
  )
}

function generatedProperties(
  definition: Element,
  existing: OryxShape | undefined,
  references: readonly ModelerModel[],
) {
  const properties: JsonObject = {
    overrideid: definition.id,
    name: definition.getAttribute('name') || '',
    documentation: directText(definition, 'documentation') || directText(firstDirectChild(definition, 'documentation'), 'text'),
  }
  if (['task', 'humanTask', 'decisionTask', 'processTask', 'caseTask'].includes(definition.localName)) {
    properties.isblocking = booleanValue(definition.getAttribute('isBlocking'), true)
    properties.isblockingexpression = flowableAttribute(definition, 'isBlockingExpression')
  }
  if (definition.localName === 'processTask') {
    const key =
      definition.getAttribute('processRef') || directText(definition, 'processRefExpression')
    const reference = referenceFromElement(definition, key, [MODEL_TYPES.process], references)
    if (reference) properties.processtaskprocessreference = reference
    properties.fallbacktodefaulttenant = booleanValue(
      flowableAttribute(definition, 'fallbackToDefaultTenant'),
    )
    properties.samedeployment = booleanValue(flowableAttribute(definition, 'sameDeployment'))
    properties.idvariablename = flowableAttribute(definition, 'idVariableName')
    const inParameters = parsedIoParameters(definition, 'in')
    const outParameters = parsedIoParameters(definition, 'out')
    if (inParameters.length) properties.processtaskinparameters = { inParameters }
    if (outParameters.length) properties.processtaskoutparameters = { outParameters }
  } else if (definition.localName === 'caseTask') {
    const key = definition.getAttribute('caseRef') || directText(definition, 'caseRefExpression')
    const reference = referenceFromElement(definition, key, [MODEL_TYPES.case], references)
    if (reference) properties.casetaskcasereference = reference
    properties.fallbacktodefaulttenant = booleanValue(
      flowableAttribute(definition, 'fallbackToDefaultTenant'),
    )
    properties.samedeployment = booleanValue(flowableAttribute(definition, 'sameDeployment'))
    properties.idvariablename = flowableAttribute(definition, 'idVariableName')
    properties.casetaskbusinesskey = flowableAttribute(definition, 'businessKey')
    properties.casetaskinheritbusinesskey = booleanValue(
      flowableAttribute(definition, 'inheritBusinessKey'),
    )
    const inParameters = parsedIoParameters(definition, 'in')
    const outParameters = parsedIoParameters(definition, 'out')
    if (inParameters.length) properties.casetaskinparameters = { inParameters }
    if (outParameters.length) properties.casetaskoutparameters = { outParameters }
  } else if (definition.localName === 'decisionTask') {
    const key =
      definition.getAttribute('decisionRef') || directText(definition, 'decisionRefExpression')
    const reference = referenceFromElement(
      definition,
      key,
      [MODEL_TYPES.decisionTable, MODEL_TYPES.decisionService],
      references,
    )
    if (reference) {
      const storedModelType = Number(modelerAttribute(definition, 'modelType'))
      const type = references.find((model) => model.id === reference.id)?.modelType ??
        (storedModelType === MODEL_TYPES.decisionTable ||
        storedModelType === MODEL_TYPES.decisionService
          ? storedModelType
          : MODEL_TYPES.decisionTable)
      properties[
        type === MODEL_TYPES.decisionService
          ? 'decisiontaskdecisionservicereference'
          : 'decisiontaskdecisiontablereference'
      ] = reference
    }
    properties.decisiontaskthrowerroronnohits = decisionFieldValue(
      definition,
      'decisionTaskThrowErrorOnNoHits',
    )
    properties.decisiontaskfallbacktodefaulttenant = decisionFieldValue(
      definition,
      'fallbackToDefaultTenant',
    )
  }
  return {
    ...(existing ? stripKnownProperties(shapeProperties(existing)) : {}),
    ...properties,
  }
}

interface XmlExportContext {
  definitions: Element
  diShapes: Map<string, Element>
  diEdges: Map<string, Element>
  existingShapes: Map<string, OryxShape>
  references: readonly ModelerModel[]
  absoluteBoundsByResourceId: Map<string, Bounds>
  shapeByPlanItemId: Map<string, OryxShape>
  shapeByCriterionId: Map<string, OryxShape>
  rootConnections: OryxShape[]
  pendingSentries: Array<{ sentry: Element; criterionShape: OryxShape }>
}

function createOryxShape(
  resourceId: string,
  stencil: string,
  properties: JsonObject,
  shapeBounds: Bounds,
  existing?: OryxShape,
): OryxShape {
  return mergeShape(
    {
      resourceId,
      properties,
      stencil: { id: stencil },
      childShapes: [],
      outgoing: [],
      bounds: shapeBounds,
      dockers: [],
    },
    existing,
  )
}

function definitionElements(container: Element) {
  return directChildren(container).filter((child) =>
    Object.prototype.hasOwnProperty.call(ELEMENT_TO_STENCIL, child.localName),
  )
}

function buildOryxContainer(
  context: XmlExportContext,
  container: Element,
  origin: Point,
  planItem?: Element,
): OryxShape {
  const existing = existingShapeFor(context.existingShapes, planItem, container)
  const resourceId =
    modelerAttribute(planItem || container, 'oryxId') ||
    existing?.resourceId ||
    container.id
  const diRef = planItem?.id || container.id
  const absolute = boundsFromDi(context.diShapes.get(diRef), makeBounds(40, 40, 718, 714))
  const shape = createOryxShape(
    resourceId,
    planItem ? 'Stage' : 'CasePlanModel',
    generatedProperties(container, existing, context.references),
    relativeBounds(absolute, origin),
    existing,
  )
  context.absoluteBoundsByResourceId.set(resourceId, absolute)
  const childOrigin = absolute.upperLeft
  const definitions = new Map(definitionElements(container).map((definition) => [definition.id, definition]))

  for (const childPlanItem of directChildren(container, ['planItem'])) {
    const definitionRef = (childPlanItem.getAttribute('definitionRef') || '').replace(/^#/, '')
    const definition = definitions.get(definitionRef)
    if (!definition) continue
    const childExisting = existingShapeFor(context.existingShapes, childPlanItem, definition)
    const childResourceId =
      modelerAttribute(childPlanItem, 'oryxId') ||
      modelerAttribute(definition, 'oryxId') ||
      childExisting?.resourceId ||
      childPlanItem.id
    let childShape: OryxShape
    if (definition.localName === 'stage') {
      childShape = buildOryxContainer(context, definition, childOrigin, childPlanItem)
    } else {
      const absoluteBounds = boundsFromDi(
        context.diShapes.get(childPlanItem.id),
        makeBounds(childOrigin.x + 80, childOrigin.y + 80, 100, 80),
      )
      context.absoluteBoundsByResourceId.set(childResourceId, absoluteBounds)
      const generatedStencil = ELEMENT_TO_STENCIL[definition.localName] || 'Task'
      const stencil =
        childExisting && STENCIL_TO_ELEMENT[stencilId(childExisting)] === definition.localName
          ? stencilId(childExisting)
          : generatedStencil
      childShape = createOryxShape(
        childResourceId,
        stencil,
        generatedProperties(definition, childExisting, context.references),
        relativeBounds(absoluteBounds, childOrigin),
        childExisting,
      )
    }
    shape.childShapes.push(childShape)
    context.shapeByPlanItemId.set(childPlanItem.id, childShape)

    for (const criterion of directChildren(childPlanItem, ['entryCriterion', 'exitCriterion'])) {
      const criterionExisting = context.existingShapes.get(modelerAttribute(criterion, 'oryxId')) || context.existingShapes.get(criterion.id)
      const criterionResourceId = modelerAttribute(criterion, 'oryxId') || criterionExisting?.resourceId || criterion.id
      const criterionAbsolute = boundsFromDi(
        context.diShapes.get(criterion.id),
        makeBounds(absolute.upperLeft.x, absolute.upperLeft.y, 14, 22),
      )
      const sentryRef = (criterion.getAttribute('sentryRef') || '').replace(/^#/, '')
      const sentry = [...context.definitions.getElementsByTagNameNS('*', 'sentry')].find(
        (candidate) => candidate.id === sentryRef,
      )
      const condition = sentry
        ? directText(firstDirectChild(sentry, 'ifPart'), 'condition') ||
          directText(firstDirectChild(firstDirectChild(sentry, 'ifPart'), 'condition'), 'body')
        : ''
      const criterionShape = createOryxShape(
        criterionResourceId,
        criterion.localName === 'exitCriterion' ? 'ExitCriterion' : 'EntryCriterion',
        {
          ...(criterionExisting ? stripKnownProperties(shapeProperties(criterionExisting)) : {}),
          overrideid: criterion.id,
          name: sentry?.getAttribute('name') || '',
          ifpartcondition: condition,
        },
        relativeBounds(criterionAbsolute, childOrigin),
        criterionExisting,
      )
      context.absoluteBoundsByResourceId.set(criterionResourceId, criterionAbsolute)
      childShape.outgoing.push({ resourceId: criterionShape.resourceId })
      shape.childShapes.push(criterionShape)
      context.shapeByCriterionId.set(criterion.id, criterionShape)
      if (sentry) context.pendingSentries.push({ sentry, criterionShape })
    }
  }
  return shape
}

function buildSentryConnections(
  context: XmlExportContext,
  sentry: Element,
  criterionShape: OryxShape,
) {
  for (const onPart of directChildren(sentry, ['planItemOnPart'])) {
    const sourceRef = (onPart.getAttribute('sourceRef') || '').replace(/^#/, '')
    const sourceShape = context.shapeByPlanItemId.get(sourceRef)
    if (!sourceShape) continue
    const existing =
      context.existingShapes.get(modelerAttribute(onPart, 'oryxId')) ||
      context.existingShapes.get(onPart.id)
    const resourceId = modelerAttribute(onPart, 'oryxId') || existing?.resourceId || onPart.id
    const edge = context.diEdges.get(onPart.id)
    const waypoints = edge
      ? [...edge.getElementsByTagNameNS('*', 'waypoint')].map((point) => ({
          x: numberValue(point.getAttribute('x')),
          y: numberValue(point.getAttribute('y')),
        }))
      : []
    const sourceBounds = context.absoluteBoundsByResourceId.get(sourceShape.resourceId)
    const targetBounds = context.absoluteBoundsByResourceId.get(criterionShape.resourceId)
    if (!sourceBounds || !targetBounds) continue
    const dockers = relativeDockers(waypoints, sourceBounds, targetBounds)
    const absoluteDockers = absoluteWaypoints(dockers, sourceBounds, targetBounds)
    const edgeBounds = {
      upperLeft: {
        x: Math.min(...absoluteDockers.map((point) => point.x)),
        y: Math.min(...absoluteDockers.map((point) => point.y)),
      },
      lowerRight: {
        x: Math.max(...absoluteDockers.map((point) => point.x)),
        y: Math.max(...absoluteDockers.map((point) => point.y)),
      },
    }
    const connection = mergeShape(
      {
        resourceId,
        properties: {
          ...(existing ? stripKnownProperties(shapeProperties(existing)) : {}),
          overrideid: onPart.id,
          transitionevent: directText(onPart, 'standardEvent') || 'complete',
        },
        stencil: { id: 'Association' },
        childShapes: [],
        outgoing: [{ resourceId: criterionShape.resourceId }],
        bounds: edgeBounds,
        dockers,
        target: { resourceId: criterionShape.resourceId },
      },
      existing,
    )
    sourceShape.outgoing.push({ resourceId })
    context.rootConnections.push(connection)
  }
}

export function cmmnXmlToOryx(
  xml: string,
  options: CmmnConverterOptions,
): JsonObject {
  const document = parseXml(xml)
  const definitions = document.documentElement
  if (definitions.localName !== 'definitions') throw new Error('CMMN definitions are missing')
  const caseElement = [...definitions.getElementsByTagNameNS(CMMN_NAMESPACE, 'case')][0]
  const casePlanModel = caseElement
    ? [...caseElement.getElementsByTagNameNS(CMMN_NAMESPACE, 'casePlanModel')][0]
    : undefined
  if (!caseElement || !casePlanModel) throw new Error('CMMN case plan model is missing')

  const snapshot = snapshots.get(options.modelId)
  const existingShapes = indexShapes(arrayValue<OryxShape>(snapshot?.childShapes))
  const diShapes = new Map<string, Element>()
  for (const shape of definitions.getElementsByTagNameNS(CMMNDI_NAMESPACE, 'CMMNShape')) {
    const reference = (shape.getAttribute('cmmnElementRef') || '').replace(/^#/, '')
    if (reference) diShapes.set(reference, shape)
  }
  const diEdges = new Map<string, Element>()
  for (const edge of definitions.getElementsByTagNameNS(CMMNDI_NAMESPACE, 'CMMNEdge')) {
    const reference = (edge.getAttribute('cmmnElementRef') || '').replace(/^#/, '')
    if (reference) diEdges.set(reference, edge)
  }
  const context: XmlExportContext = {
    definitions,
    diShapes,
    diEdges,
    existingShapes,
    references: options.references || [],
    absoluteBoundsByResourceId: new Map(),
    shapeByPlanItemId: new Map(),
    shapeByCriterionId: new Map(),
    rootConnections: [],
    pendingSentries: [],
  }
  const rootShape = buildOryxContainer(context, casePlanModel, { x: 0, y: 0 })
  for (const pending of context.pendingSentries) {
    buildSentryConnections(context, pending.sentry, pending.criterionShape)
  }
  const key = options.key || caseElement.id
  const name = options.name || caseElement.getAttribute('name') || key
  const description =
    options.description ||
    directText(caseElement, 'documentation') ||
    directText(firstDirectChild(caseElement, 'documentation'), 'text')
  const model: JsonObject = {
    ...(snapshot ? deepClone(snapshot) : {}),
    id: 'canvas',
    resourceId: 'canvas',
    bounds: snapshot?.bounds || makeBounds(0, 0, 1200, 1050),
    properties: {
      ...objectValue(snapshot?.properties),
      case_id: key,
      name,
      documentation: description,
    },
    childShapes: [rootShape, ...context.rootConnections],
    stencil: { id: 'CMMNDiagram' },
    stencilset: {
      namespace: 'http://b3mn.org/stencilset/cmmn1.1#',
      url: '../editor/stencilsets/cmmn1.1/cmmn1.1.json',
    },
    [RAW_XML_PROPERTY]: xml,
  }
  snapshots.set(options.modelId, deepClone(model))
  return model
}
