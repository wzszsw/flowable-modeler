import { layoutProcess } from 'bpmn-auto-layout'

import { cmmnOryxToXml, cmmnXmlToOryx } from './cmmnConverter'
import {
  decisionTableXmlToOryx,
  dmnOryxToXml,
  dmnXmlToOryx,
} from './dmnConverter'
import type { ModelerModel } from './modelerApi'
import { MODEL_TYPES, type ModelType } from './modelTypes'
import { bpmnXmlToOryxJson, oryxJsonToBpmnXml } from './oryxConverter'

const BPMNDI_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/DI'

function hasBpmnDiagramInterchange(xml: string) {
  const document = new DOMParser().parseFromString(xml, 'application/xml')
  return document.getElementsByTagNameNS(BPMNDI_NAMESPACE, 'BPMNShape').length > 0
}

async function ensureBpmnDiagramInterchange(xml: string) {
  return hasBpmnDiagramInterchange(xml) ? xml : layoutProcess(xml)
}

export interface ModelAdapterContext {
  model: ModelerModel
  references?: readonly ModelerModel[]
}

function options(context: ModelAdapterContext) {
  return {
    modelId: context.model.id,
    name: context.model.name,
    key: context.model.key,
    description: context.model.description,
    references: context.references,
  }
}

export async function editorJsonToXml(
  editorJson: Record<string, unknown>,
  context: ModelAdapterContext,
) {
  if (context.model.modelType === MODEL_TYPES.process) {
    return oryxJsonToBpmnXml(editorJson)
  }
  if (context.model.modelType === MODEL_TYPES.case) {
    return cmmnOryxToXml(editorJson, options(context))
  }
  return dmnOryxToXml(editorJson, context.model.modelType, options(context))
}

export async function xmlToEditorJson(
  xml: string,
  context: ModelAdapterContext,
) {
  if (context.model.modelType === MODEL_TYPES.process) {
    const diagramXml = await ensureBpmnDiagramInterchange(xml)
    return bpmnXmlToOryxJson(diagramXml, {
      preserveOryxSnapshot: true,
      references: context.references,
    })
  }
  if (context.model.modelType === MODEL_TYPES.case) {
    return cmmnXmlToOryx(xml, options(context))
  }
  return dmnXmlToOryx(xml, context.model.modelType, options(context))
}

export async function decisionTableXmlToEditorJson(
  xml: string,
  context: ModelAdapterContext,
  decisionId: string,
) {
  return decisionTableXmlToOryx(xml, { ...options(context), decisionId })
}

export function retargetEditorJson(
  editorJson: Record<string, unknown>,
  modelType: ModelType,
  metadata: { name: string; key: string; description: string },
) {
  const copy = structuredClone(editorJson)
  delete copy.flowableModelerBpmn20Xml
  delete copy.flowableModelerOryxFingerprint
  delete copy.flowableModelerCmmn11Xml
  delete copy.flowableModelerDmn13Xml

  if (modelType === MODEL_TYPES.decisionTable) {
    copy.key = metadata.key
    copy.name = metadata.name
    copy.description = metadata.description
    return copy
  }

  const currentProperties = copy.properties
  const properties =
    currentProperties && typeof currentProperties === 'object' && !Array.isArray(currentProperties)
      ? { ...(currentProperties as Record<string, unknown>) }
      : {}
  if (modelType === MODEL_TYPES.process) properties.process_id = metadata.key
  else if (modelType === MODEL_TYPES.case) properties.case_id = metadata.key
  else properties.drd_id = metadata.key
  properties.name = metadata.name
  if (metadata.description) properties.documentation = metadata.description
  else delete properties.documentation
  copy.properties = properties
  return copy
}
