import { MODEL_TYPES, modelCategory, type ModelType } from '@/modeler/modelTypes'

export const ROUTE_NAMES = {
  login: 'login',
  processes: 'processes',
  cases: 'cases',
  decisions: 'decisions',
  processEditor: 'process-editor',
  caseEditor: 'case-editor',
  decisionEditor: 'decision-editor',
} as const

export const LIST_ROUTE_NAMES = [
  ROUTE_NAMES.processes,
  ROUTE_NAMES.cases,
  ROUTE_NAMES.decisions,
] as const

export const EDITOR_ROUTE_NAMES = [
  ROUTE_NAMES.processEditor,
  ROUTE_NAMES.caseEditor,
  ROUTE_NAMES.decisionEditor,
] as const

export function listRouteName(modelType: ModelType) {
  const category = modelCategory(modelType)
  if (category === 'cases') return ROUTE_NAMES.cases
  if (category === 'decisions') return ROUTE_NAMES.decisions
  return ROUTE_NAMES.processes
}

export function editorRouteName(modelType: ModelType) {
  if (modelType === MODEL_TYPES.case) return ROUTE_NAMES.caseEditor
  if (
    modelType === MODEL_TYPES.decisionTable ||
    modelType === MODEL_TYPES.decisionService
  ) {
    return ROUTE_NAMES.decisionEditor
  }
  return ROUTE_NAMES.processEditor
}
