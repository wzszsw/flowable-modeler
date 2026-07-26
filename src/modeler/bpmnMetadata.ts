import { translate } from '@/i18n'

const BPMN_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
const PROCESS_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

export interface BpmnMetadata {
  name: string
  key: string
  description: string
}

export function parseBpmnMetadata(xml: string): BpmnMetadata {
  if (!xml.trim()) throw new Error(translate('modeler.errors.bpmnXmlEmpty'))

  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const parseError = Array.from(document.getElementsByTagName('*')).find(
    (element) => element.localName === 'parsererror',
  )
  if (parseError) throw new Error(translate('modeler.errors.bpmnXmlInvalid'))

  const definitions = document.documentElement
  if (definitions.localName !== 'definitions' || definitions.namespaceURI !== BPMN_NAMESPACE) {
    throw new Error(translate('modeler.errors.notBpmnXml'))
  }

  const process = Array.from(definitions.children).find(
    (element) => element.localName === 'process' && element.namespaceURI === BPMN_NAMESPACE,
  )
  if (!process) throw new Error(translate('modeler.errors.bpmnProcessMissing'))

  const key = process.getAttribute('id')?.trim() || ''
  if (!key) throw new Error(translate('modeler.errors.bpmnProcessIdMissing'))
  if (!PROCESS_KEY_PATTERN.test(key)) {
    throw new Error(translate('modeler.errors.bpmnProcessIdInvalid'))
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
