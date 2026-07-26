import type {
  FlowableHostAdapter,
  HostServiceTaskTypeDefinition,
} from './integration'
import { translate } from '@/i18n'

export const FLOWABLE_BPMN_SERVICE_TASK_TYPES = [
  'mail',
  'shell',
  'dmn',
  'http',
  'send-event',
  'external-worker',
  'mule',
  'camel',
] as const

export const FLOWABLE_LEGACY_SERVICE_TASK_TYPES = ['external'] as const

const nativeServiceTaskTypes = new Set<string>([
  ...FLOWABLE_BPMN_SERVICE_TASK_TYPES,
  ...FLOWABLE_LEGACY_SERVICE_TASK_TYPES,
])

export const FLOWABLE_SERVICE_TASK_TYPE_LABEL_KEYS: Record<string, string> = {
  mail: 'modeler.serviceTaskTypes.mail',
  shell: 'modeler.serviceTaskTypes.shell',
  dmn: 'modeler.serviceTaskTypes.dmn',
  http: 'modeler.serviceTaskTypes.http',
  'send-event': 'modeler.serviceTaskTypes.sendEvent',
  'external-worker': 'modeler.serviceTaskTypes.externalWorker',
  mule: 'modeler.serviceTaskTypes.mule',
  camel: 'modeler.serviceTaskTypes.camel',
  external: 'modeler.serviceTaskTypes.external',
}

export const HOST_SERVICE_TASK_TYPE_LABEL_KEYS: Record<string, string> = {
  rest: 'modeler.serviceTaskTypes.rest',
  sc: 'modeler.serviceTaskTypes.sc',
  mq: 'modeler.serviceTaskTypes.mq',
  copy: 'modeler.serviceTaskTypes.copy',
}

export type ResolvedHostServiceTaskType = {
  type: string
  label: string
}

export function isFlowableServiceTaskType(type: string) {
  return nativeServiceTaskTypes.has(type.trim())
}

export function resolveHostServiceTaskTypes(
  adapter: FlowableHostAdapter | null | undefined,
): ResolvedHostServiceTaskType[] {
  const resolved: ResolvedHostServiceTaskType[] = []
  const seen = new Set<string>()

  for (const entry of adapter?.customServiceTaskTypes || []) {
    const definition: HostServiceTaskTypeDefinition =
      typeof entry === 'string' ? { type: entry } : entry
    const type = String(definition?.type || '').trim()
    if (
      !type ||
      nativeServiceTaskTypes.has(type) ||
      seen.has(type)
    ) {
      continue
    }

    seen.add(type)
    resolved.push({
      type,
      label:
        String(definition.label || '').trim() ||
        (HOST_SERVICE_TASK_TYPE_LABEL_KEYS[type]
          ? translate(HOST_SERVICE_TASK_TYPE_LABEL_KEYS[type]!)
          : '') ||
        type,
    })
  }

  return resolved
}

export function resolveHostServiceTaskTypeNames(
  adapter: FlowableHostAdapter | null | undefined,
) {
  return new Set(resolveHostServiceTaskTypes(adapter).map((entry) => entry.type))
}
