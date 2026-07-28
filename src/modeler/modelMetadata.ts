import { translate } from '@/i18n'

import { parseBpmnMetadata, type BpmnMetadata } from './bpmnMetadata'
import {
  DMN_DI_NAMESPACES,
  isDmnModelNamespace,
  type DmnModelNamespace,
} from './dmnNamespaces'
import { MODEL_TYPES, type ModelType } from './modelTypes'

const CMMN_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/MODEL'
const CMMNDI_NAMESPACE = 'http://www.omg.org/spec/CMMN/20151109/CMMNDI'
const MODEL_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export interface ModelMetadata extends BpmnMetadata {}

export interface DecisionTableMetadata extends ModelMetadata {
  decisionId: string
}

function parseXml(xml: string) {
  if (!xml.trim()) throw new Error(translate('modeler.errors.modelXmlEmpty'))
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = Array.from(document.getElementsByTagName('*')).find(
    (element) => element.localName === 'parsererror',
  )
  if (parseError) throw new Error(translate('modeler.errors.modelXmlInvalid'))
  return document
}

function directChild(element: Element, namespace: string, localName: string) {
  return Array.from(element.children).find(
    (child) => child.namespaceURI === namespace && child.localName === localName,
  )
}

function directText(element: Element, namespace: string, localName: string) {
  return directChild(element, namespace, localName)?.textContent?.trim() || ''
}

function requiredKey(value: string, missingKey: string) {
  const key = value.trim()
  if (!key) throw new Error(translate(missingKey))
  if (!MODEL_KEY_PATTERN.test(key)) {
    throw new Error(translate('modeler.errors.modelKeyInvalid'))
  }
  return key
}

function cmmnMetadata(xml: string): ModelMetadata {
  const document = parseXml(xml)
  const definitions = document.documentElement
  if (definitions.localName !== 'definitions' || definitions.namespaceURI !== CMMN_NAMESPACE) {
    throw new Error(translate('modeler.errors.notCmmnXml'))
  }
  const caseElement = directChild(definitions, CMMN_NAMESPACE, 'case')
  if (!caseElement) throw new Error(translate('modeler.errors.cmmnCaseMissing'))
  if (!document.getElementsByTagNameNS(CMMNDI_NAMESPACE, 'CMMNShape').length) {
    throw new Error(translate('modeler.errors.cmmnDiagramMissing'))
  }
  const key = requiredKey(
    caseElement.getAttribute('id') || '',
    'modeler.errors.cmmnCaseIdMissing',
  )
  const documentation = directChild(caseElement, CMMN_NAMESPACE, 'documentation')
  return {
    name: caseElement.getAttribute('name')?.trim() || key,
    key,
    description:
      documentation?.textContent?.trim() ||
      (documentation ? directText(documentation, CMMN_NAMESPACE, 'text') : ''),
  }
}

function dmnDefinitions(xml: string) {
  const document = parseXml(xml)
  const definitions = document.documentElement
  if (
    definitions.localName !== 'definitions' ||
    !isDmnModelNamespace(definitions.namespaceURI)
  ) {
    throw new Error(translate('modeler.errors.notDmnXml'))
  }
  return { document, definitions, namespace: definitions.namespaceURI }
}

function dmnDecisions(definitions: Element, namespace: DmnModelNamespace) {
  return Array.from(definitions.children).filter(
    (element) => element.namespaceURI === namespace && element.localName === 'decision',
  )
}

export function parseDecisionTableMetadata(xml: string): DecisionTableMetadata {
  const { definitions, namespace } = dmnDefinitions(xml)
  const decision = dmnDecisions(definitions, namespace).find((candidate) =>
    Boolean(directChild(candidate, namespace, 'decisionTable')),
  )
  if (!decision) throw new Error(translate('modeler.errors.dmnDecisionTableMissing'))
  const key = requiredKey(
    decision.getAttribute('id') || '',
    'modeler.errors.dmnDecisionIdMissing',
  )
  return {
    decisionId: key,
    name:
      definitions.getAttribute('name')?.trim() ||
      decision.getAttribute('name')?.trim() ||
      key,
    key,
    description:
      directText(definitions, namespace, 'description') ||
      directText(decision, namespace, 'description'),
  }
}

export function parseDecisionServiceTables(xml: string): DecisionTableMetadata[] {
  const { definitions, namespace } = dmnDefinitions(xml)
  return dmnDecisions(definitions, namespace)
    .filter((decision) => Boolean(directChild(decision, namespace, 'decisionTable')))
    .map((decision) => {
      const key = requiredKey(
        decision.getAttribute('id') || '',
        'modeler.errors.dmnDecisionIdMissing',
      )
      return {
        decisionId: key,
        name: decision.getAttribute('name')?.trim() || key,
        key,
        description: directText(decision, namespace, 'description'),
      }
    })
}

function decisionServiceMetadata(xml: string): ModelMetadata {
  const { document, definitions, namespace } = dmnDefinitions(xml)
  const service = directChild(definitions, namespace, 'decisionService')
  if (!service) throw new Error(translate('modeler.errors.dmnDecisionServiceMissing'))
  const hasDiagram = DMN_DI_NAMESPACES.some(
    (diagramNamespace) =>
      document.getElementsByTagNameNS(diagramNamespace, 'DMNShape').length > 0,
  )
  if (!hasDiagram) {
    throw new Error(translate('modeler.errors.dmnDiagramMissing'))
  }
  const key = requiredKey(
    service.getAttribute('id') || '',
    'modeler.errors.dmnDecisionServiceIdMissing',
  )
  return {
    name: service.getAttribute('name')?.trim() || key,
    key,
    description: directText(definitions, namespace, 'description'),
  }
}

export function parseModelMetadata(xml: string, modelType: ModelType): ModelMetadata {
  if (modelType === MODEL_TYPES.process) return parseBpmnMetadata(xml)
  if (modelType === MODEL_TYPES.case) return cmmnMetadata(xml)
  if (modelType === MODEL_TYPES.decisionTable) return parseDecisionTableMetadata(xml)
  return decisionServiceMetadata(xml)
}
