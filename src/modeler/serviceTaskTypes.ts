import type {
  FlowableHostAdapter,
  HostServiceTaskTypeDefinition,
} from './integration'

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

const outOfScopeServiceTaskTypes = new Set(['case'])

const nativeServiceTaskTypes = new Set<string>([
  ...FLOWABLE_BPMN_SERVICE_TASK_TYPES,
  ...FLOWABLE_LEGACY_SERVICE_TASK_TYPES,
])

export const FLOWABLE_SERVICE_TASK_TYPE_LABELS: Record<string, string> = {
  mail: '邮件任务',
  shell: 'Shell 任务',
  dmn: 'DMN 决策',
  http: 'HTTP 任务',
  'send-event': 'Event Registry 发送事件',
  'external-worker': '外部工作器',
  mule: 'Mule 任务',
  camel: 'Camel 任务',
  external: '外部工作器（兼容 external）',
}

export const HOST_SERVICE_TASK_TYPE_LABELS: Record<string, string> = {
  rest: 'REST 服务',
  sc: '服务编排（SC）',
  mq: '消息队列',
  copy: '抄送任务',
}

export type ResolvedHostServiceTaskType = {
  type: string
  label: string
}

export function isFlowableServiceTaskType(type: string) {
  return nativeServiceTaskTypes.has(type.trim())
}

export function isOutOfScopeServiceTaskType(type: string) {
  return outOfScopeServiceTaskTypes.has(type.trim())
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
      outOfScopeServiceTaskTypes.has(type) ||
      seen.has(type)
    ) {
      continue
    }

    seen.add(type)
    resolved.push({
      type,
      label:
        String(definition.label || '').trim() ||
        HOST_SERVICE_TASK_TYPE_LABELS[type] ||
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
