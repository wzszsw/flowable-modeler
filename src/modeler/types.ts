export interface BpmnBusinessObject {
  $type: string
  id?: string
  name?: string
  documentation?: Array<{ text?: string }>
  extensionElements?: { values?: BpmnExtensionElement[] }
  loopCharacteristics?: BpmnBusinessObject
  conditionExpression?: BpmnBusinessObject
  completionCondition?: BpmnBusinessObject
  loopCardinality?: BpmnBusinessObject
  eventDefinitions?: BpmnBusinessObject[]
  incoming?: BpmnBusinessObject[]
  outgoing?: BpmnBusinessObject[]
  sourceRef?: BpmnBusinessObject
  targetRef?: BpmnBusinessObject
  default?: BpmnBusinessObject
  get?: (name: string) => unknown
  [key: string]: unknown
}

export interface BpmnExtensionElement {
  $type: string
  event?: string
  class?: string
  expression?: string
  delegateExpression?: string
  [key: string]: unknown
}

export interface DiagramElement {
  id: string
  type: string
  businessObject: BpmnBusinessObject
  incoming?: DiagramElement[]
  outgoing?: DiagramElement[]
  parent?: DiagramElement
  labelTarget?: DiagramElement
  [key: string]: unknown
}

export type ValidationLevel = 'error' | 'warning'

export interface ValidationProblem {
  id: string
  elementId: string
  elementName: string
  level: ValidationLevel
  message: string
}
