import { MODEL_TYPES, type ModelType } from './modelTypes'

type JsonObject = Record<string, unknown>

interface EmptyShape extends JsonObject {
  resourceId: string
  stencil: { id: string }
  childShapes: EmptyShape[]
  outgoing: JsonObject[]
  bounds: JsonObject
  dockers: JsonObject[]
}

function bounds(left: number, top: number, right: number, bottom: number) {
  return {
    lowerRight: { x: right, y: bottom },
    upperLeft: { x: left, y: top },
  }
}

function emptyShape(
  resourceId: string,
  stencil: string,
  shapeBounds: JsonObject,
): EmptyShape {
  return {
    resourceId,
    stencil: { id: stencil },
    childShapes: [],
    outgoing: [],
    bounds: shapeBounds,
    dockers: [],
  }
}

function modelProperties(
  idProperty: string,
  key: string,
  name: string,
  description: string,
) {
  return {
    [idProperty]: key,
    name,
    ...(description ? { documentation: description } : {}),
  }
}

function createProcessModel(key: string, name: string, description: string): JsonObject {
  return {
    id: 'canvas',
    resourceId: 'canvas',
    stencilset: { namespace: 'http://b3mn.org/stencilset/bpmn2.0#' },
    properties: modelProperties('process_id', key, name, description),
    childShapes: [
      emptyShape('startEvent1', 'StartNoneEvent', bounds(100, 163, 130, 193)),
    ],
  }
}

function createCaseModel(key: string, name: string, description: string): JsonObject {
  return {
    id: 'canvas',
    resourceId: 'canvas',
    stencilset: { namespace: 'http://b3mn.org/stencilset/cmmn1.1#' },
    properties: modelProperties('case_id', key, name, description),
    childShapes: [
      emptyShape('casePlanModel', 'CasePlanModel', bounds(40, 40, 758, 754)),
    ],
  }
}

function createDecisionTable(name: string): JsonObject {
  return {
    modelVersion: '3',
    key: name.replaceAll(' ', ''),
    forceDMN11: false,
  }
}

function createDecisionService(key: string, name: string, description: string): JsonObject {
  const service = emptyShape(
    'expandedDecisionService',
    'ExpandedDecisionService',
    bounds(150, 74, 750, 554),
  )
  service.childShapes = [
    emptyShape(
      'outputDecisions',
      'OutputDecisionsDecisionServiceSection',
      bounds(0, 0, 600, 240),
    ),
    emptyShape(
      'encapsulatedDecisions',
      'EncapsulatedDecisionsDecisionServiceSection',
      bounds(0, 240, 600, 480),
    ),
  ]
  return {
    id: 'canvas',
    resourceId: 'canvas',
    stencilset: { namespace: 'http://b3mn.org/stencilset/dmn1.2#' },
    bounds: bounds(0, 0, 1200, 1050),
    properties: modelProperties('drd_id', key, name, description),
    childShapes: [service],
  }
}

export async function createDefaultEditorModel(
  modelType: ModelType,
  key: string,
  name: string,
  description = '',
): Promise<JsonObject> {
  if (modelType === MODEL_TYPES.process) {
    return createProcessModel(key, name, description)
  }
  if (modelType === MODEL_TYPES.case) return createCaseModel(key, name, description)
  if (modelType === MODEL_TYPES.decisionService) {
    return createDecisionService(key, name, description)
  }
  return createDecisionTable(name)
}
