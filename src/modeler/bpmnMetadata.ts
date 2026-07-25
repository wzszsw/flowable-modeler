const BPMN_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const PROCESS_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export interface BpmnMetadata {
  name: string
  key: string
  description: string
}

export function parseBpmnMetadata(xml: string): BpmnMetadata {
  if (!xml.trim()) throw new Error('BPMN XML 内容为空')

  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = Array.from(document.getElementsByTagName('*')).find(
    (element) => element.localName === 'parsererror',
  )
  if (parseError) throw new Error('BPMN XML 格式不正确，请检查文件内容')

  const definitions = document.documentElement
  if (definitions.localName !== 'definitions' || definitions.namespaceURI !== BPMN_NAMESPACE) {
    throw new Error('文件不是有效的 BPMN 2.0 XML')
  }

  const process = Array.from(definitions.children).find(
    (element) => element.localName === 'process' && element.namespaceURI === BPMN_NAMESPACE,
  )
  if (!process) throw new Error('BPMN XML 中未找到流程定义')

  const key = process.getAttribute('id')?.trim() || ''
  if (!key) throw new Error('BPMN 流程缺少必需的 id')
  if (!PROCESS_KEY_PATTERN.test(key)) {
    throw new Error('流程标识需以字母或下划线开头，且只能包含字母、数字、点、短横线和下划线')
  }

  const documentation = Array.from(process.children).find(
    (element) =>
      element.localName === 'documentation' && element.namespaceURI === BPMN_NAMESPACE,
  )
  return {
    name: process.getAttribute('name')?.trim() || key,
    key,
    description: documentation?.textContent?.trim() || '',
  }
}
