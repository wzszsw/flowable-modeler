export const MODEL_TYPES = {
  process: 0,
  decisionTable: 4,
  case: 5,
  decisionService: 6,
} as const

export type ModelType = (typeof MODEL_TYPES)[keyof typeof MODEL_TYPES]
export type ModelCategory = 'processes' | 'cases' | 'decisions'
export type DecisionModelType =
  | typeof MODEL_TYPES.decisionTable
  | typeof MODEL_TYPES.decisionService

export const SUPPORTED_MODEL_TYPES = new Set<number>(Object.values(MODEL_TYPES))

export function isModelType(value: number): value is ModelType {
  return SUPPORTED_MODEL_TYPES.has(value)
}

export function modelCategory(modelType: ModelType): ModelCategory {
  if (modelType === MODEL_TYPES.case) return 'cases'
  if (
    modelType === MODEL_TYPES.decisionTable ||
    modelType === MODEL_TYPES.decisionService
  ) {
    return 'decisions'
  }
  return 'processes'
}

export function modelTypesForCategory(
  category: ModelCategory,
  decisionType: DecisionModelType = MODEL_TYPES.decisionTable,
): ModelType[] {
  if (category === 'cases') return [MODEL_TYPES.case]
  if (category === 'decisions') return [decisionType]
  return [MODEL_TYPES.process]
}

export function referenceModelTypes(modelType: ModelType): ModelType[] {
  if (modelType === MODEL_TYPES.process) {
    return [MODEL_TYPES.decisionTable, MODEL_TYPES.decisionService]
  }
  if (modelType === MODEL_TYPES.case) {
    return [
      MODEL_TYPES.process,
      MODEL_TYPES.case,
      MODEL_TYPES.decisionTable,
      MODEL_TYPES.decisionService,
    ]
  }
  if (modelType === MODEL_TYPES.decisionService) {
    return [MODEL_TYPES.decisionTable]
  }
  return []
}

export function isDecisionModelType(modelType: ModelType): modelType is DecisionModelType {
  return (
    modelType === MODEL_TYPES.decisionTable ||
    modelType === MODEL_TYPES.decisionService
  )
}
