import type { ModelerModel } from './modelerApi'
import { cmmnOryxToXml, cmmnXmlToOryx } from './cmmnConverter'
import { dmnOryxToXml, dmnXmlToOryx } from './dmnConverter'
import { MODEL_TYPES } from './modelTypes'
import { bpmnXmlToOryxJson, oryxJsonToBpmnXml } from './oryxConverter'

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
    return bpmnXmlToOryxJson(xml, {
      preserveOryxSnapshot: true,
      references: context.references,
    })
  }
  if (context.model.modelType === MODEL_TYPES.case) {
    return cmmnXmlToOryx(xml, options(context))
  }
  return dmnXmlToOryx(xml, context.model.modelType, options(context))
}
