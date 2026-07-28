import type { ModelerModel } from './modelerApi'
import {
  DMN_DI_NAMESPACE_13,
  DMN_DI_NAMESPACES,
  DMN_MODEL_NAMESPACE_13,
  isDmnModelNamespace,
} from './dmnNamespaces'
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

interface DmnConverterOptions {
  modelId: string
  name: string
  key: string
  description: string
  references?: readonly ModelerModel[]
  decisionId?: string
}

const DMN_NAMESPACE = DMN_MODEL_NAMESPACE_13
const DMNDI_NAMESPACE = DMN_DI_NAMESPACE_13
const DC_NAMESPACE = 'http://www.omg.org/spec/DMN/20180521/DC/'
const DI_NAMESPACE = 'http://www.omg.org/spec/DMN/20180521/DI/'
const MODELER_NAMESPACE = 'http://flowable.org/modeler/frontend'
const RAW_XML_PROPERTY = 'flowableModelerDmn13Xml'

const snapshots = new Map<string, JsonObject>()

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

function shapeProperties(shape: OryxShape) {
  return objectValue(shape.properties)
}

function stencilId(shape: OryxShape) {
  return stringValue(objectValue(shape.stencil).id)
}

function elementId(shape: OryxShape) {
  return stringValue(shapeProperties(shape).overrideid).trim() || shape.resourceId
}

function indexShapes(shapes: OryxShape[], target = new Map<string, OryxShape>()) {
  for (const shape of shapes) {
    target.set(shape.resourceId, shape)
    target.set(elementId(shape), shape)
    indexShapes(arrayValue<OryxShape>(shape.childShapes), target)
  }
  return target
}

function stripKnown(properties: JsonObject, known: readonly string[]) {
  const names = new Set(known)
  return Object.fromEntries(Object.entries(properties).filter(([name]) => !names.has(name)))
}

function mergeShape(generated: OryxShape, existing?: OryxShape): OryxShape {
  if (!existing) return generated
  return {
    ...deepClone(existing),
    ...generated,
    properties: { ...shapeProperties(existing), ...generated.properties },
    childShapes: generated.childShapes,
  }
}

function parseXml(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = document.querySelector('parsererror')
  if (parseError) throw new Error(parseError.textContent || 'Invalid DMN XML')
  return document
}

function directChildren(element: Element, names?: readonly string[]) {
  return [...element.children].filter(
    (child) => !names || names.includes(child.localName),
  )
}

function dmnElements(element: Element, localName: string) {
  const namespace = element.ownerDocument?.documentElement.namespaceURI
  return isDmnModelNamespace(namespace)
    ? [...element.getElementsByTagNameNS(namespace, localName)]
    : []
}

function dmnDiElements(element: Element, localName: string) {
  return DMN_DI_NAMESPACES.flatMap((namespace) => [
    ...element.getElementsByTagNameNS(namespace, localName),
  ])
}

function firstDirectChild(element: Element | undefined, name: string) {
  return element ? directChildren(element, [name])[0] : undefined
}

function childText(element: Element | undefined, name: string) {
  return firstDirectChild(element, name)?.textContent?.trim() || ''
}

function modelerAttribute(element: Element, name: string) {
  return (
    element.getAttributeNS(MODELER_NAMESPACE, name) ||
    element.getAttribute(`flowablemodeler:${name}`) ||
    ''
  )
}

function referenceAttributes(reference: JsonObject) {
  return [
    xmlAttribute('flowablemodeler:modelId', reference.id),
    xmlAttribute('flowablemodeler:modelName', reference.name),
    xmlAttribute('flowablemodeler:modelKey', reference.key),
  ].join('')
}

function dmnType(value: unknown) {
  const type = stringValue(value).toLowerCase()
  if (['string', 'number', 'boolean', 'date', 'time', 'date and time', 'duration'].includes(type)) {
    return type
  }
  if (type === 'integer' || type === 'long' || type === 'double') return 'number'
  return 'Any'
}

function flowableType(value: unknown) {
  const type = stringValue(value).toLowerCase()
  if (type === 'any') return 'string'
  return type || 'string'
}

function feelValue(value: string, type: string) {
  if (!value || value === '-' || value.startsWith('${') || value.startsWith('#{')) {
    return value
  }
  if (type === 'string' && !(value.startsWith('"') && value.endsWith('"'))) {
    return JSON.stringify(value)
  }
  if (
    type === 'date' &&
    !value.startsWith('date(') &&
    !value.startsWith('fn_date(') &&
    !value.startsWith('date:toDate(')
  ) {
    return `date(${JSON.stringify(value)})`
  }
  return value
}

function expressionEntries(expression: JsonObject) {
  const entries = Array.isArray(expression.entries)
    ? expression.entries.map((entry) => stringValue(entry)).filter(Boolean)
    : []
  if (!entries.length) return stringValue(expression.entries)
  const type = flowableType(expression.type)
  return entries.map((entry) => feelValue(entry, type)).join(', ')
}

function ruleInputText(rule: JsonObject, input: JsonObject) {
  const id = stringValue(input.id)
  const expression = stringValue(rule[`${id}_expression`]) || '-'
  if (expression === '-' || expression.startsWith('${') || expression.startsWith('#{')) {
    return expression
  }
  const operator = stringValue(rule[`${id}_operator`]).trim()
  const value = feelValue(expression, flowableType(input.type))
  return operator ? `${operator} ${value}` : value
}

function ruleOutputText(rule: JsonObject, output: JsonObject) {
  const value = stringValue(rule[stringValue(output.id)])
  if (output.complexExpression === true) return value
  return feelValue(value, flowableType(output.type))
}

function isEmptyFlowableExpression(expression: JsonObject) {
  return (
    !stringValue(expression.label) &&
    !stringValue(expression.variableId) &&
    !stringValue(expression.type) &&
    (expression.newVariable === undefined || expression.newVariable === null) &&
    (expression.entries === undefined ||
      expression.entries === null ||
      arrayValue(expression.entries).length === 0) &&
    expression.complexExpression !== true
  )
}

function decisionTableExpressions(model: JsonObject) {
  const inputExpressions = arrayValue<JsonObject>(model.inputExpressions)
  const outputExpressions = arrayValue<JsonObject>(model.outputExpressions)
  const usedIds = new Set(
    [...inputExpressions, ...outputExpressions]
      .map((expression) => stringValue(expression.id))
      .filter(Boolean),
  )
  const createEmptyExpression = (prefix: string): JsonObject => {
    let nextId = 1
    while (usedIds.has(`${prefix}_${nextId}`)) nextId += 1
    const id = `${prefix}_${nextId}`
    usedIds.add(id)
    return {
      id,
      label: null,
      variableId: null,
      type: null,
      newVariable: null,
      entries: null,
    }
  }

  // Flowable UI creates one empty input and output column when the backend
  // returns a newly-created decision table without expressions. dmn-js also
  // requires an output clause before it can initialize its table viewer.
  return {
    inputs: inputExpressions.length ? inputExpressions : [createEmptyExpression('Input')],
    outputs: outputExpressions.length ? outputExpressions : [createEmptyExpression('Output')],
  }
}

export function decisionTableOryxToXml(model: JsonObject, options: DmnConverterOptions) {
  snapshots.set(options.modelId, deepClone(model))
  const key = stringValue(model.key) || options.key
  const name = stringValue(model.name) || options.name
  const description = stringValue(model.description) || options.description
  const { inputs, outputs } = decisionTableExpressions(model)
  const rules = arrayValue<JsonObject>(model.rules)
  const hitPolicy = stringValue(model.hitIndicator) || 'UNIQUE'
  const aggregation = stringValue(model.collectOperator)

  const inputXml = inputs
    .map((input, index) => {
      const id = stringValue(input.id) || `Input_${index + 1}`
      const emptyExpression = isEmptyFlowableExpression(input)
      const variableId = emptyExpression
        ? `input${index + 1}`
        : stringValue(input.variableId) || stringValue(input.label) || `input${index + 1}`
      const entries = expressionEntries(input)
      const modelerProperties = emptyExpression
        ? ' flowablemodeler:defaultExpression="true"'
        : ` flowablemodeler:variableType="${xmlEscape(stringValue(input.variableType) || 'variable')}" flowablemodeler:newVariable="${input.newVariable === true}" flowablemodeler:complexExpression="${input.complexExpression === true}"`
      return `<dmn:input id="${xmlEscape(`${id}_clause`)}"${xmlAttribute('label', input.label)}${modelerProperties}>
        <dmn:inputExpression id="${xmlEscape(id)}" typeRef="${xmlEscape(emptyExpression ? 'string' : dmnType(input.type))}"><dmn:text>${xmlEscape(variableId)}</dmn:text></dmn:inputExpression>
        ${entries ? `<dmn:inputValues><dmn:text>${xmlEscape(entries)}</dmn:text></dmn:inputValues>` : ''}
      </dmn:input>`
    })
    .join('\n      ')
  const outputXml = outputs
    .map((output, index) => {
      const id = stringValue(output.id) || `Output_${index + 1}`
      const emptyExpression = isEmptyFlowableExpression(output)
      const variableId = emptyExpression
        ? `output${index + 1}`
        : stringValue(output.variableId) || stringValue(output.label) || `output${index + 1}`
      const entries = expressionEntries(output)
      const modelerProperties = emptyExpression
        ? ' flowablemodeler:defaultExpression="true"'
        : ` flowablemodeler:variableType="${xmlEscape(stringValue(output.variableType) || 'variable')}" flowablemodeler:newVariable="${output.newVariable === true}" flowablemodeler:complexExpression="${output.complexExpression === true}"`
      return `<dmn:output id="${xmlEscape(id)}" name="${xmlEscape(variableId)}"${xmlAttribute('label', output.label)} typeRef="${xmlEscape(emptyExpression ? 'string' : dmnType(output.type))}"${modelerProperties}>${entries ? `<dmn:outputValues><dmn:text>${xmlEscape(entries)}</dmn:text></dmn:outputValues>` : ''}</dmn:output>`
    })
    .join('\n      ')
  const ruleXml = rules
    .map((rule, ruleIndex) => {
      const inputEntries = inputs
        .map((input, index) => `<dmn:inputEntry id="Rule_${ruleIndex + 1}_Input_${index + 1}"><dmn:text>${xmlEscape(ruleInputText(rule, input))}</dmn:text></dmn:inputEntry>`)
        .join('')
      const outputEntries = outputs
        .map((output, index) => `<dmn:outputEntry id="Rule_${ruleIndex + 1}_Output_${index + 1}"><dmn:text>${xmlEscape(ruleOutputText(rule, output))}</dmn:text></dmn:outputEntry>`)
        .join('')
      return `<dmn:rule id="Rule_${ruleIndex + 1}">${inputEntries}${outputEntries}</dmn:rule>`
    })
    .join('\n      ')

  return `<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="${DMN_NAMESPACE}" xmlns:flowablemodeler="${MODELER_NAMESPACE}" id="${xmlEscape(key)}_definitions" name="${xmlEscape(name)}" namespace="http://flowable.org/dmn">
  <dmn:decision id="${xmlEscape(key)}" name="${xmlEscape(name)}">
    ${description ? `<dmn:description>${xmlEscape(description)}</dmn:description>` : ''}
    <dmn:decisionTable id="${xmlEscape(key)}_table" hitPolicy="${xmlEscape(hitPolicy)}"${xmlAttribute('aggregation', aggregation)}>
      ${inputXml}
      ${outputXml}
      ${ruleXml}
    </dmn:decisionTable>
  </dmn:decision>
</dmn:definitions>`
}

function parseEntries(text: string, type: string) {
  if (!text.trim()) return null
  return text
    .split(/\s*,\s*/)
    .map((entry) => unwrapFeelValue(entry, type))
    .filter(Boolean)
}

function unwrapFeelValue(value: string, type: string) {
  let result = value.trim()
  if (type === 'date') {
    const match = result.match(/^(?:date|fn_date|date:toDate)\((?:'|")(.+?)(?:'|")\)$/)
    if (match?.[1]) return match[1]
  }
  if (result.startsWith('"') && result.endsWith('"')) {
    try {
      result = JSON.parse(result)
    } catch {
      result = result.slice(1, -1)
    }
  }
  return result
}

function splitUnaryTest(value: string, type: string) {
  const text = value.trim() || '-'
  if (text === '-' || text.startsWith('${') || text.startsWith('#{')) {
    return { operator: null, expression: text }
  }
  const separator = text.indexOf(' ')
  const operator = separator > 0 ? text.slice(0, separator) : null
  const expression = separator > 0 ? text.slice(separator + 1) : text
  return { operator, expression: unwrapFeelValue(expression, type) }
}

function expressionFromInput(
  input: Element,
  index: number,
  existing: JsonObject = {},
): JsonObject {
  const expression = firstDirectChild(input, 'inputExpression')
  const id = expression?.id || input.id.replace(/_clause$/, '') || `Input_${index + 1}`
  const defaultExpression = modelerAttribute(input, 'defaultExpression') === 'true'
  const rawType = expression?.getAttribute('typeRef') || ''
  const type = rawType ? flowableType(rawType) : null
  const variableId = childText(expression, 'text')
  const defaultVariableId = `input${index + 1}`
  const variableType = modelerAttribute(input, 'variableType')
  const newVariable = modelerAttribute(input, 'newVariable')
  const complexExpression = modelerAttribute(input, 'complexExpression')
  const entries = childText(firstDirectChild(input, 'inputValues'), 'text')
  const result: JsonObject = {
    ...existing,
    id,
    label: input.getAttribute('label') || (defaultExpression ? null : ''),
    type: defaultExpression && type === 'string' ? null : type ?? (defaultExpression ? null : 'string'),
    variableId:
      defaultExpression && variableId === defaultVariableId
        ? null
        : variableId || (defaultExpression ? null : defaultVariableId),
    entries: parseEntries(entries, type || 'string'),
    newVariable: newVariable ? newVariable === 'true' : defaultExpression ? null : false,
  }
  if (variableType || !defaultExpression) result.variableType = variableType || 'variable'
  if (complexExpression || !defaultExpression) {
    result.complexExpression = complexExpression === 'true'
  }
  return result
}

function expressionFromOutput(
  output: Element,
  index: number,
  existing: JsonObject = {},
): JsonObject {
  const defaultExpression = modelerAttribute(output, 'defaultExpression') === 'true'
  const rawType = output.getAttribute('typeRef') || ''
  const type = rawType ? flowableType(rawType) : null
  const variableId = output.getAttribute('name') || ''
  const defaultVariableId = `output${index + 1}`
  const variableType = modelerAttribute(output, 'variableType')
  const newVariable = modelerAttribute(output, 'newVariable')
  const complexExpression = modelerAttribute(output, 'complexExpression')
  const result: JsonObject = {
    ...existing,
    id: output.id || `Output_${index + 1}`,
    label: output.getAttribute('label') || (defaultExpression ? null : ''),
    type: defaultExpression && type === 'string' ? null : type ?? (defaultExpression ? null : 'string'),
    variableId:
      defaultExpression && variableId === defaultVariableId
        ? null
        : variableId || (defaultExpression ? null : defaultVariableId),
    entries: parseEntries(
      childText(firstDirectChild(output, 'outputValues'), 'text'),
      type || 'string',
    ),
    newVariable: newVariable ? newVariable === 'true' : defaultExpression ? null : false,
  }
  if (variableType || !defaultExpression) result.variableType = variableType || 'variable'
  if (complexExpression || !defaultExpression) {
    result.complexExpression = complexExpression === 'true'
  }
  return result
}

export function decisionTableXmlToOryx(xml: string, options: DmnConverterOptions) {
  const document = parseXml(xml)
  const definitions = document.documentElement
  const decisions = dmnElements(definitions, 'decision')
  const decision = options.decisionId
    ? decisions.find((candidate) => candidate.id === options.decisionId)
    : decisions.find(
        (candidate) => candidate.id === options.key && dmnElements(candidate, 'decisionTable').length,
      ) || decisions.find((candidate) => dmnElements(candidate, 'decisionTable').length)
  const table = decision ? dmnElements(decision, 'decisionTable')[0] : undefined
  if (!decision || !table) throw new Error('DMN decision table is missing')
  const snapshot = snapshots.get(options.modelId)
  const previousInputs = new Map(
    arrayValue<JsonObject>(snapshot?.inputExpressions).map((input) => [stringValue(input.id), input]),
  )
  const previousOutputs = new Map(
    arrayValue<JsonObject>(snapshot?.outputExpressions).map((output) => [stringValue(output.id), output]),
  )
  const inputs = directChildren(table, ['input']).map((input, index) => {
    const expression = firstDirectChild(input, 'inputExpression')
    const id = expression?.id || input.id.replace(/_clause$/, '')
    return expressionFromInput(input, index, previousInputs.get(id))
  })
  const outputs = directChildren(table, ['output']).map((output, index) =>
    expressionFromOutput(output, index, previousOutputs.get(output.id)),
  )
  const rules = directChildren(table, ['rule']).map((rule) => {
    const result: JsonObject = {}
    directChildren(rule, ['inputEntry']).forEach((entry, index) => {
      const input = inputs[index]
      if (!input) return
      const id = stringValue(input.id)
      const split = splitUnaryTest(childText(entry, 'text'), flowableType(input.type))
      result[`${id}_operator`] = split.operator
      result[`${id}_expression`] = split.expression
    })
    directChildren(rule, ['outputEntry']).forEach((entry, index) => {
      const output = outputs[index]
      if (output) {
        result[stringValue(output.id)] = unwrapFeelValue(
          childText(entry, 'text'),
          flowableType(output.type),
        )
      }
    })
    return result
  })
  const result: JsonObject = {
    ...(snapshot ? deepClone(snapshot) : {}),
    modelVersion: stringValue(snapshot?.modelVersion) || '3',
    key: options.key || decision.id,
    name: options.name || decision.getAttribute('name') || decision.id,
    description: options.description || childText(decision, 'description'),
    forceDMN11: snapshot?.forceDMN11 === true,
    hitIndicator: table.getAttribute('hitPolicy') || 'UNIQUE',
    collectOperator: table.getAttribute('aggregation') || undefined,
    inputExpressions: inputs,
    outputExpressions: outputs,
    rules,
    [RAW_XML_PROPERTY]: xml,
  }
  snapshots.set(options.modelId, deepClone(result))
  return result
}

function findServiceShapes(model: JsonObject) {
  const shapes = arrayValue<OryxShape>(model.childShapes)
  const service = shapes.find((shape) => stencilId(shape) === 'ExpandedDecisionService')
  const sections = arrayValue<OryxShape>(service?.childShapes)
  const output = sections.find(
    (shape) => stencilId(shape) === 'OutputDecisionsDecisionServiceSection',
  )
  const encapsulated = sections.find(
    (shape) => stencilId(shape) === 'EncapsulatedDecisionsDecisionServiceSection',
  )
  return { shapes, service, output, encapsulated }
}

function addBounds(left: number, top: number, bounds: Bounds): Bounds {
  return {
    upperLeft: { x: left + bounds.upperLeft.x, y: top + bounds.upperLeft.y },
    lowerRight: { x: left + bounds.lowerRight.x, y: top + bounds.lowerRight.y },
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

function dmnShapeXml(id: string, reference: string, bounds: Bounds) {
  const width = bounds.lowerRight.x - bounds.upperLeft.x
  const height = bounds.lowerRight.y - bounds.upperLeft.y
  return `<dmndi:DMNShape id="${xmlEscape(id)}_di" dmnElementRef="${xmlEscape(reference)}"><dc:Bounds x="${bounds.upperLeft.x}" y="${bounds.upperLeft.y}" width="${width}" height="${height}" /></dmndi:DMNShape>`
}

function connectionSources(shapes: OryxShape[]) {
  const result = new Map<string, string>()
  for (const shape of indexShapes(shapes).values()) {
    for (const outgoing of arrayValue<{ resourceId?: unknown }>(shape.outgoing)) {
      const id = stringValue(outgoing.resourceId)
      if (id && !result.has(id)) result.set(id, shape.resourceId)
    }
  }
  return result
}

export function decisionServiceOryxToXml(model: JsonObject, options: DmnConverterOptions) {
  snapshots.set(options.modelId, deepClone(model))
  const { shapes, service, output, encapsulated } = findServiceShapes(model)
  const serviceShape =
    service ||
    ({
      resourceId: 'expandedDecisionService',
      properties: {},
      stencil: { id: 'ExpandedDecisionService' },
      childShapes: [],
      outgoing: [],
      bounds: makeBounds(150, 74, 600, 480),
      dockers: [],
    } satisfies OryxShape)
  const outputShape =
    output ||
    ({
      resourceId: 'outputDecisions',
      properties: {},
      stencil: { id: 'OutputDecisionsDecisionServiceSection' },
      childShapes: [],
      outgoing: [],
      bounds: makeBounds(0, 0, 600, 240),
      dockers: [],
    } satisfies OryxShape)
  const encapsulatedShape =
    encapsulated ||
    ({
      resourceId: 'encapsulatedDecisions',
      properties: {},
      stencil: { id: 'EncapsulatedDecisionsDecisionServiceSection' },
      childShapes: [],
      outgoing: [],
      bounds: makeBounds(0, 240, 600, 240),
      dockers: [],
    } satisfies OryxShape)
  const outputDecisions = arrayValue<OryxShape>(outputShape.childShapes)
  const encapsulatedDecisions = arrayValue<OryxShape>(encapsulatedShape.childShapes)
  const decisions = [...outputDecisions, ...encapsulatedDecisions]
  const decisionByResourceId = new Map(decisions.map((decision) => [decision.resourceId, decision]))
  const sources = connectionSources(shapes)
  const requirements = arrayValue<OryxShape>(shapes).filter(
    (shape) => stencilId(shape) === 'InformationRequirement',
  )
  const requirementsByTarget = new Map<string, OryxShape[]>()
  for (const requirement of requirements) {
    const target = stringValue(objectValue(requirement.target).resourceId)
    if (!target) continue
    const list = requirementsByTarget.get(target) || []
    list.push(requirement)
    requirementsByTarget.set(target, list)
  }

  const decisionXml = decisions
    .map((decision) => {
      const properties = shapeProperties(decision)
      const reference = objectValue(properties.decisiondecisiontablereference)
      const id = elementId(decision)
      const requirementXml = (requirementsByTarget.get(decision.resourceId) || [])
        .map((requirement) => {
          const sourceShape = decisionByResourceId.get(sources.get(requirement.resourceId) || '')
          if (!sourceShape) return ''
          const requirementId = elementId(requirement)
          return `<dmn:informationRequirement id="${xmlEscape(requirementId)}" flowablemodeler:oryxId="${xmlEscape(requirement.resourceId)}"><dmn:requiredDecision href="#${xmlEscape(elementId(sourceShape))}" /></dmn:informationRequirement>`
        })
        .join('')
      return `<dmn:decision id="${xmlEscape(id)}"${xmlAttribute('name', properties.name)} flowablemodeler:oryxId="${xmlEscape(decision.resourceId)}"${referenceAttributes(reference)}>${requirementXml}</dmn:decision>`
    })
    .join('\n  ')

  const serviceId = elementId(serviceShape)
  const outputRefs = outputDecisions
    .map((decision) => `<dmn:outputDecision href="#${xmlEscape(elementId(decision))}" />`)
    .join('')
  const encapsulatedRefs = encapsulatedDecisions
    .map((decision) => `<dmn:encapsulatedDecision href="#${xmlEscape(elementId(decision))}" />`)
    .join('')
  const serviceProperties = shapeProperties(serviceShape)
  const serviceXml = `<dmn:decisionService id="${xmlEscape(serviceId)}"${xmlAttribute('name', serviceProperties.name || options.name)} flowablemodeler:oryxId="${xmlEscape(serviceShape.resourceId)}">${outputRefs}${encapsulatedRefs}</dmn:decisionService>`

  const serviceBounds = normalizedBounds(serviceShape.bounds, makeBounds(150, 74, 600, 480))
  const outputBounds = normalizedBounds(outputShape.bounds, makeBounds(0, 0, 600, 240))
  const encapsulatedBounds = normalizedBounds(encapsulatedShape.bounds, makeBounds(0, 240, 600, 240))
  const dmnShapes = [dmnShapeXml(serviceShape.resourceId, serviceId, serviceBounds)]
  const absoluteDecisionBounds = new Map<string, Bounds>()
  for (const decision of outputDecisions) {
    const absolute = addBounds(
      serviceBounds.upperLeft.x + outputBounds.upperLeft.x,
      serviceBounds.upperLeft.y + outputBounds.upperLeft.y,
      normalizedBounds(decision.bounds),
    )
    absoluteDecisionBounds.set(decision.resourceId, absolute)
    dmnShapes.push(
      dmnShapeXml(
        decision.resourceId,
        elementId(decision),
        absolute,
      ),
    )
  }
  for (const decision of encapsulatedDecisions) {
    const absolute = addBounds(
      serviceBounds.upperLeft.x + encapsulatedBounds.upperLeft.x,
      serviceBounds.upperLeft.y + encapsulatedBounds.upperLeft.y,
      normalizedBounds(decision.bounds),
    )
    absoluteDecisionBounds.set(decision.resourceId, absolute)
    dmnShapes.push(
      dmnShapeXml(
        decision.resourceId,
        elementId(decision),
        absolute,
      ),
    )
  }
  const dmnEdges = requirements.map((requirement) => {
    const source = decisionByResourceId.get(sources.get(requirement.resourceId) || '')
    const target = decisionByResourceId.get(stringValue(objectValue(requirement.target).resourceId))
    if (!source || !target) return ''
    const sourceBounds = absoluteDecisionBounds.get(source.resourceId)
    const targetBounds = absoluteDecisionBounds.get(target.resourceId)
    if (!sourceBounds || !targetBounds) return ''
    const waypoints = absoluteWaypoints(
      arrayValue<Point>(requirement.dockers),
      sourceBounds,
      targetBounds,
    )
    const requirementId = elementId(requirement)
    return `<dmndi:DMNEdge id="${xmlEscape(requirement.resourceId)}_di" dmnElementRef="${xmlEscape(requirementId)}">${waypoints.map((point) => `<di:waypoint x="${point.x}" y="${point.y}" />`).join('')}</dmndi:DMNEdge>`
  })

  const properties = objectValue(model.properties)
  const key = stringValue(properties.drd_id) || options.key
  const name = stringValue(properties.name) || options.name
  const description = stringValue(properties.documentation) || options.description
  return `<?xml version="1.0" encoding="UTF-8"?>
<dmn:definitions xmlns:dmn="${DMN_NAMESPACE}" xmlns:dmndi="${DMNDI_NAMESPACE}" xmlns:dc="${DC_NAMESPACE}" xmlns:di="${DI_NAMESPACE}" xmlns:flowablemodeler="${MODELER_NAMESPACE}" id="${xmlEscape(key)}_definitions" name="${xmlEscape(name)}" namespace="http://flowable.org/dmn">
  ${description ? `<dmn:description>${xmlEscape(description)}</dmn:description>` : ''}
  ${serviceXml}
  ${decisionXml}
  <dmndi:DMNDI><dmndi:DMNDiagram id="${xmlEscape(key)}_diagram">${dmnShapes.join('')}${dmnEdges.join('')}</dmndi:DMNDiagram></dmndi:DMNDI>
</dmn:definitions>`
}

function hrefId(element: Element | undefined) {
  return (element?.getAttribute('href') || '').replace(/^#/, '')
}

function boundsFromDmnShape(shape: Element | undefined, fallback: Bounds) {
  const bounds = shape ? [...shape.getElementsByTagNameNS(DC_NAMESPACE, 'Bounds')][0] : undefined
  if (!bounds) return fallback
  return makeBounds(
    numberValue(bounds.getAttribute('x'), fallback.upperLeft.x),
    numberValue(bounds.getAttribute('y'), fallback.upperLeft.y),
    numberValue(bounds.getAttribute('width'), fallback.lowerRight.x - fallback.upperLeft.x),
    numberValue(bounds.getAttribute('height'), fallback.lowerRight.y - fallback.upperLeft.y),
  )
}

function modelReference(
  decision: Element,
  references: readonly ModelerModel[],
) {
  const storedId = modelerAttribute(decision, 'modelId')
  const storedKey = modelerAttribute(decision, 'modelKey') || decision.id
  const match =
    references.find((model) => model.id === storedId) ||
    references.find(
      (model) => model.modelType === MODEL_TYPES.decisionTable && model.key === storedKey,
    )
  if (match) return { id: match.id, name: match.name, key: match.key }
  if (!storedKey) return null
  return {
    id: storedId,
    name: modelerAttribute(decision, 'modelName') || decision.getAttribute('name') || storedKey,
    key: storedKey,
  }
}

export function decisionServiceXmlToOryx(xml: string, options: DmnConverterOptions) {
  const document = parseXml(xml)
  const definitions = document.documentElement
  const service = dmnElements(definitions, 'decisionService')[0]
  if (!service) throw new Error('DMN decision service is missing')
  const decisions = dmnElements(definitions, 'decision')
  const outputIds = new Set(directChildren(service, ['outputDecision']).map(hrefId))
  const encapsulatedIds = new Set(directChildren(service, ['encapsulatedDecision']).map(hrefId))
  const snapshot = snapshots.get(options.modelId)
  const existing = indexShapes(arrayValue<OryxShape>(snapshot?.childShapes))
  const previous = findServiceShapes(snapshot || {})
  const serviceBounds = normalizedBounds(
    previous.service?.bounds,
    makeBounds(150, 74, 600, 480),
  )
  const outputBounds = normalizedBounds(previous.output?.bounds, makeBounds(0, 0, 600, 240))
  const encapsulatedBounds = normalizedBounds(
    previous.encapsulated?.bounds,
    makeBounds(0, 240, 600, 240),
  )
  const dmnShapes = new Map<string, Element>()
  for (const shape of dmnDiElements(definitions, 'DMNShape')) {
    const reference = (shape.getAttribute('dmnElementRef') || '').replace(/^#/, '')
    if (reference) dmnShapes.set(reference, shape)
  }
  const dmnEdges = new Map<string, Element>()
  for (const edge of dmnDiElements(definitions, 'DMNEdge')) {
    const reference = (edge.getAttribute('dmnElementRef') || '').replace(/^#/, '')
    if (reference) dmnEdges.set(reference, edge)
  }

  const serviceResourceId = modelerAttribute(service, 'oryxId') || previous.service?.resourceId || 'expandedDecisionService'
  const serviceShape = mergeShape(
    {
      resourceId: serviceResourceId,
      properties: {
        ...stripKnown(shapeProperties(previous.service || ({} as OryxShape)), ['overrideid', 'name']),
        overrideid: service.id,
        name: service.getAttribute('name') || options.name,
      },
      stencil: { id: 'ExpandedDecisionService' },
      childShapes: [],
      outgoing: [],
      bounds: boundsFromDmnShape(dmnShapes.get(service.id), serviceBounds),
      dockers: [],
    },
    previous.service,
  )
  const outputShape = mergeShape(
    {
      resourceId: previous.output?.resourceId || 'outputDecisions',
      properties: shapeProperties(previous.output || ({} as OryxShape)),
      stencil: { id: 'OutputDecisionsDecisionServiceSection' },
      childShapes: [],
      outgoing: [],
      bounds: outputBounds,
      dockers: [],
    },
    previous.output,
  )
  const encapsulatedShape = mergeShape(
    {
      resourceId: previous.encapsulated?.resourceId || 'encapsulatedDecisions',
      properties: shapeProperties(previous.encapsulated || ({} as OryxShape)),
      stencil: { id: 'EncapsulatedDecisionsDecisionServiceSection' },
      childShapes: [],
      outgoing: [],
      bounds: encapsulatedBounds,
      dockers: [],
    },
    previous.encapsulated,
  )
  serviceShape.childShapes = [outputShape, encapsulatedShape]

  const decisionShapeById = new Map<string, OryxShape>()
  const absoluteDecisionBounds = new Map<string, Bounds>()
  for (const [index, decision] of decisions.entries()) {
    const previousDecision =
      existing.get(modelerAttribute(decision, 'oryxId')) || existing.get(decision.id)
    const resourceId = modelerAttribute(decision, 'oryxId') || previousDecision?.resourceId || decision.id
    const absolute = boundsFromDmnShape(
      dmnShapes.get(decision.id),
      makeBounds(220 + index * 130, 150, 100, 62),
    )
    absoluteDecisionBounds.set(decision.id, absolute)
    const isOutput = outputIds.has(decision.id)
    const sectionBounds = isOutput ? outputBounds : encapsulatedBounds
    const sectionOrigin = {
      x: serviceShape.bounds.upperLeft.x + sectionBounds.upperLeft.x,
      y: serviceShape.bounds.upperLeft.y + sectionBounds.upperLeft.y,
    }
    const reference = modelReference(decision, options.references || [])
    const properties: JsonObject = {
      ...(previousDecision
        ? stripKnown(shapeProperties(previousDecision), [
            'overrideid',
            'name',
            'decisiondecisiontablereference',
          ])
        : {}),
      overrideid: decision.id,
      name: decision.getAttribute('name') || decision.id,
    }
    if (reference) properties.decisiondecisiontablereference = reference
    const shape = mergeShape(
      {
        resourceId,
        properties,
        stencil: { id: 'Decision' },
        childShapes: [],
        outgoing: [],
        bounds: {
          upperLeft: {
            x: absolute.upperLeft.x - sectionOrigin.x,
            y: absolute.upperLeft.y - sectionOrigin.y,
          },
          lowerRight: {
            x: absolute.lowerRight.x - sectionOrigin.x,
            y: absolute.lowerRight.y - sectionOrigin.y,
          },
        },
        dockers: [],
      },
      previousDecision,
    )
    ;(isOutput ? outputShape : encapsulatedShape).childShapes.push(shape)
    decisionShapeById.set(decision.id, shape)
  }

  const connections: OryxShape[] = []
  for (const targetDecision of decisions) {
    const targetShape = decisionShapeById.get(targetDecision.id)
    if (!targetShape) continue
    for (const requirement of directChildren(targetDecision, ['informationRequirement'])) {
      const sourceId = hrefId(firstDirectChild(requirement, 'requiredDecision'))
      const sourceShape = decisionShapeById.get(sourceId)
      if (!sourceShape) continue
      const previousRequirement =
        existing.get(modelerAttribute(requirement, 'oryxId')) || existing.get(requirement.id)
      const resourceId = modelerAttribute(requirement, 'oryxId') || previousRequirement?.resourceId || requirement.id
      const sourceBounds = absoluteDecisionBounds.get(sourceId)
      const targetBounds = absoluteDecisionBounds.get(targetDecision.id)
      if (!sourceBounds || !targetBounds) continue
      const edge = dmnEdges.get(requirement.id)
      const waypoints = edge
        ? [...edge.getElementsByTagNameNS(DI_NAMESPACE, 'waypoint')].map((point) => ({
            x: numberValue(point.getAttribute('x')),
            y: numberValue(point.getAttribute('y')),
          }))
        : []
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
            ...(previousRequirement
              ? stripKnown(shapeProperties(previousRequirement), ['overrideid'])
              : {}),
            overrideid: requirement.id,
          },
          stencil: { id: 'InformationRequirement' },
          childShapes: [],
          outgoing: [{ resourceId: targetShape.resourceId }],
          bounds: edgeBounds,
          dockers,
          target: { resourceId: targetShape.resourceId },
        },
        previousRequirement,
      )
      sourceShape.outgoing.push({ resourceId })
      connections.push(connection)
    }
  }

  const key = options.key || definitions.id.replace(/_definitions$/, '')
  const name = options.name || definitions.getAttribute('name') || key
  const result: JsonObject = {
    ...(snapshot ? deepClone(snapshot) : {}),
    id: 'canvas',
    resourceId: 'canvas',
    bounds: snapshot?.bounds || makeBounds(0, 0, 1200, 1050),
    properties: {
      ...objectValue(snapshot?.properties),
      drd_id: key,
      name,
      documentation: options.description || childText(definitions, 'description'),
    },
    childShapes: [serviceShape, ...connections],
    stencil: { id: 'DMNDiagram' },
    stencilset: {
      namespace: 'http://b3mn.org/stencilset/dmn1.2#',
      url: '../editor/stencilsets/dmn1.1/dmn1.2.json',
    },
    [RAW_XML_PROPERTY]: xml,
  }
  snapshots.set(options.modelId, deepClone(result))
  return result
}

export function dmnOryxToXml(
  model: JsonObject,
  modelType: ModelType,
  options: DmnConverterOptions,
) {
  return modelType === MODEL_TYPES.decisionService
    ? decisionServiceOryxToXml(model, options)
    : decisionTableOryxToXml(model, options)
}

export function dmnXmlToOryx(
  xml: string,
  modelType: ModelType,
  options: DmnConverterOptions,
) {
  return modelType === MODEL_TYPES.decisionService
    ? decisionServiceXmlToOryx(xml, options)
    : decisionTableXmlToOryx(xml, options)
}
