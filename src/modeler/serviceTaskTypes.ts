export const FLOWABLE_BPMN_SERVICE_TASK_TYPES = [
  'mail',
  'shell',
  'dmn',
  'case',
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
  case: 'modeler.serviceTaskTypes.case',
  http: 'modeler.serviceTaskTypes.http',
  'send-event': 'modeler.serviceTaskTypes.sendEvent',
  'external-worker': 'modeler.serviceTaskTypes.externalWorker',
  mule: 'modeler.serviceTaskTypes.mule',
  camel: 'modeler.serviceTaskTypes.camel',
  external: 'modeler.serviceTaskTypes.external',
}

export function isFlowableServiceTaskType(type: string) {
  return nativeServiceTaskTypes.has(type.trim())
}
