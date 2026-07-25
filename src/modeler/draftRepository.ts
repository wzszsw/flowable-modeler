import { createDefaultDiagram } from './defaultDiagram'

export const DRAFTS_STORAGE_KEY = 'flowable-modeler:drafts:v1'

const DRAFTS_SCHEMA_VERSION = 1
const BPMN_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const BPMN_DI_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/DI'
const PROCESS_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export interface BpmnDraft {
  id: string
  type: 'bpmn'
  name: string
  key: string
  description: string
  fileName: string
  xml: string
  createdAt: string
  updatedAt: string
}

export interface BpmnMetadata {
  name: string
  key: string
  description: string
}

export interface CreateBpmnDraftInput {
  name: string
  key: string
  description?: string
  fileName?: string
}

export interface ImportBpmnDraftInput {
  xml: string
  fileName: string
  name: string
  key: string
  description: string
}

export type UpdateBpmnDraftInput = Partial<
  Pick<BpmnDraft, 'name' | 'key' | 'description' | 'fileName' | 'xml'>
>

interface DraftStorageEnvelope {
  schemaVersion: 1
  drafts: BpmnDraft[]
}

function cleanRequired(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label}不能为空`)
  return normalized
}

function normalizeProcessKey(value: string) {
  const key = cleanRequired(value, '流程标识')
  if (!PROCESS_KEY_PATTERN.test(key)) {
    throw new Error('流程标识需以字母或下划线开头，且只能包含字母、数字、点、短横线和下划线')
  }
  return key
}

function escapeXmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function defaultFileName(key: string) {
  return `${key}.bpmn20.xml`
}

function makeDraftId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `draft-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function isValidDate(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

function parseStoredDraft(value: unknown): BpmnDraft | null {
  if (!value || typeof value !== 'object') return null
  const draft = value as Record<string, unknown>
  if (
    typeof draft.id !== 'string' ||
    !draft.id ||
    draft.type !== 'bpmn' ||
    typeof draft.name !== 'string' ||
    !draft.name.trim() ||
    typeof draft.key !== 'string' ||
    !draft.key.trim() ||
    typeof draft.description !== 'string' ||
    typeof draft.fileName !== 'string' ||
    !draft.fileName.trim() ||
    typeof draft.xml !== 'string' ||
    !draft.xml.trim() ||
    !isValidDate(draft.createdAt) ||
    !isValidDate(draft.updatedAt)
  ) {
    return null
  }

  return {
    id: draft.id,
    type: 'bpmn',
    name: draft.name,
    key: draft.key,
    description: draft.description,
    fileName: draft.fileName,
    xml: draft.xml,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
  }
}

function getStorage() {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function readDrafts(): BpmnDraft[] {
  const storage = getStorage()
  if (!storage) return []

  let raw: string | null
  try {
    raw = storage.getItem(DRAFTS_STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const envelope = parsed as Record<string, unknown>
    if (envelope.schemaVersion !== DRAFTS_SCHEMA_VERSION || !Array.isArray(envelope.drafts)) {
      return []
    }

    const ids = new Set<string>()
    const drafts: BpmnDraft[] = []
    for (const item of envelope.drafts) {
      const draft = parseStoredDraft(item)
      if (!draft || ids.has(draft.id)) continue
      ids.add(draft.id)
      drafts.push(draft)
    }
    return drafts
  } catch {
    return []
  }
}

function writeDrafts(drafts: BpmnDraft[]) {
  const storage = getStorage()
  if (!storage) throw new Error('浏览器存储不可用，无法保存草稿')

  const envelope: DraftStorageEnvelope = {
    schemaVersion: DRAFTS_SCHEMA_VERSION,
    drafts,
  }
  try {
    storage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(envelope))
  } catch (error) {
    throw new Error('草稿保存失败，请检查浏览器存储空间或隐私设置', { cause: error })
  }
}

function cloneDraft(draft: BpmnDraft) {
  return { ...draft }
}

export function parseBpmnMetadata(xml: string): BpmnMetadata {
  if (!xml.trim()) throw new Error('BPMN XML 内容为空')
  if (typeof DOMParser === 'undefined') throw new Error('当前环境不支持 BPMN XML 解析')

  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = Array.from(document.getElementsByTagName('*')).find(
    (element) => element.localName === 'parsererror',
  )
  if (parseError) throw new Error('BPMN XML 格式不正确，请检查文件内容')

  const definitions = document.documentElement
  if (definitions.localName !== 'definitions' || definitions.namespaceURI !== BPMN_NAMESPACE) {
    throw new Error('文件不是有效的 BPMN 2.0 XML')
  }

  const processes = Array.from(definitions.children).filter(
    (element) => element.localName === 'process' && element.namespaceURI === BPMN_NAMESPACE,
  )
  if (!processes.length) throw new Error('BPMN XML 中未找到流程定义')

  const diagram = Array.from(definitions.children).find(
    (element) => element.localName === 'BPMNDiagram' && element.namespaceURI === BPMN_DI_NAMESPACE,
  )
  const plane = diagram
    ? Array.from(diagram.children).find(
        (element) => element.localName === 'BPMNPlane' && element.namespaceURI === BPMN_DI_NAMESPACE,
      )
    : undefined
  if (!plane) throw new Error('BPMN XML 缺少 DI 图形信息，无法在设计器中打开')

  const planeProcessId = plane.getAttribute('bpmnElement')?.trim()
  const diagramElement = planeProcessId
    ? Array.from(definitions.getElementsByTagName('*')).find(
        (element) => element.getAttribute('id') === planeProcessId,
      )
    : undefined
  let owningProcess = diagramElement
  while (owningProcess && owningProcess.localName !== 'process') {
    owningProcess = owningProcess.parentElement || undefined
  }
  const participantProcessId =
    diagramElement?.localName === 'collaboration'
      ? Array.from(diagramElement.children)
          .find((element) => element.localName === 'participant' && element.hasAttribute('processRef'))
          ?.getAttribute('processRef')
          ?.trim()
      : undefined
  const process =
    processes.find((element) => element === owningProcess) ||
    processes.find((element) => element.getAttribute('id') === participantProcessId) ||
    processes.find((element) => element.getAttribute('id') === planeProcessId) ||
    processes[0]
  if (!process) throw new Error('BPMN XML 中未找到可编辑的流程定义')

  const rawKey = process.getAttribute('id')?.trim() || ''
  if (!rawKey) throw new Error('BPMN 流程缺少必需的 id')
  const key = normalizeProcessKey(rawKey)

  const name = process.getAttribute('name')?.trim() || key
  const documentation = Array.from(process.children).find(
    (element) => element.localName === 'documentation' && element.namespaceURI === BPMN_NAMESPACE,
  )

  return {
    name,
    key,
    description: documentation?.textContent?.trim() || '',
  }
}

export const draftRepository = {
  list(): BpmnDraft[] {
    return readDrafts()
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .map(cloneDraft)
  },

  get(id: string): BpmnDraft | undefined {
    const draft = readDrafts().find((item) => item.id === id)
    return draft ? cloneDraft(draft) : undefined
  },

  create(input: CreateBpmnDraftInput): BpmnDraft {
    const name = cleanRequired(input.name, '流程名称')
    const key = normalizeProcessKey(input.key)
    const description = input.description?.trim() || ''
    const fileName = input.fileName?.trim() || defaultFileName(key)
    const timestamp = new Date().toISOString()
    const draft: BpmnDraft = {
      id: makeDraftId(),
      type: 'bpmn',
      name,
      key,
      description,
      fileName,
      xml: createDefaultDiagram(key, escapeXmlAttribute(name)),
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    writeDrafts([draft, ...readDrafts()])
    return cloneDraft(draft)
  },

  import(input: ImportBpmnDraftInput): BpmnDraft {
    const xml = cleanRequired(input.xml, 'BPMN XML')
    const metadata = parseBpmnMetadata(xml)
    const name = cleanRequired(input.name || metadata.name, '流程名称')
    const key = normalizeProcessKey(input.key || metadata.key)
    const fileName = cleanRequired(input.fileName || defaultFileName(key), '文件名')
    const timestamp = new Date().toISOString()
    const draft: BpmnDraft = {
      id: makeDraftId(),
      type: 'bpmn',
      name,
      key,
      description: input.description.trim(),
      fileName,
      xml,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    writeDrafts([draft, ...readDrafts()])
    return cloneDraft(draft)
  },

  update(id: string, changes: UpdateBpmnDraftInput): BpmnDraft | undefined {
    const drafts = readDrafts()
    const index = drafts.findIndex((item) => item.id === id)
    if (index < 0) return undefined

    const current = drafts[index]
    if (!current) return undefined
    const updated: BpmnDraft = {
      ...current,
      ...(changes.name === undefined ? {} : { name: cleanRequired(changes.name, '流程名称') }),
      ...(changes.key === undefined ? {} : { key: normalizeProcessKey(changes.key) }),
      ...(changes.description === undefined
        ? {}
        : { description: changes.description.trim() }),
      ...(changes.fileName === undefined
        ? {}
        : { fileName: cleanRequired(changes.fileName, '文件名') }),
      ...(changes.xml === undefined ? {} : { xml: cleanRequired(changes.xml, 'BPMN XML') }),
      updatedAt: new Date().toISOString(),
    }
    drafts[index] = updated
    writeDrafts(drafts)
    return cloneDraft(updated)
  },

  delete(id: string): boolean {
    const drafts = readDrafts()
    const remaining = drafts.filter((item) => item.id !== id)
    if (remaining.length === drafts.length) return false
    writeDrafts(remaining)
    return true
  },
}
