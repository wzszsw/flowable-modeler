export const FLOWABLE_NAMESPACE = 'http://flowable.org/bpmn'
export const LEGACY_ACTIVITI_NAMESPACE = 'http://activiti.org/bpmn'

const XMLNS_NAMESPACE = 'http://www.w3.org/2000/xmlns/'
const XML_SCHEMA_INSTANCE_NAMESPACE = 'http://www.w3.org/2001/XMLSchema-instance'
const PARSER_ERROR_NAMESPACES = new Set([
  'http://www.w3.org/1999/xhtml',
  'http://www.mozilla.org/newlayout/xml/parsererror.xml',
])

export type XmlCompatibilityResult = {
  xml: string
  normalizedLegacyNamespace: boolean
}

function normalizeSchemaLocation(value: string) {
  const tokens = value.trim().split(/\s+/)
  let changed = false
  for (let index = 0; index < tokens.length; index += 2) {
    if (tokens[index] === LEGACY_ACTIVITI_NAMESPACE) {
      tokens[index] = FLOWABLE_NAMESPACE
      changed = true
    }
  }
  return changed ? tokens.join(' ') : value
}

function copyNormalizedAttributes(source: Element, target: Element) {
  for (const attribute of Array.from(source.attributes)) {
    if (
      attribute.namespaceURI === XMLNS_NAMESPACE &&
      attribute.value === LEGACY_ACTIVITI_NAMESPACE
    ) {
      target.setAttributeNS(XMLNS_NAMESPACE, attribute.name, FLOWABLE_NAMESPACE)
      continue
    }
    if (attribute.namespaceURI === LEGACY_ACTIVITI_NAMESPACE) {
      target.setAttributeNS(
        FLOWABLE_NAMESPACE,
        `flowable:${attribute.localName}`,
        attribute.value,
      )
      continue
    }
    if (attribute.namespaceURI) {
      target.setAttributeNS(attribute.namespaceURI, attribute.name, attribute.value)
    } else {
      target.setAttribute(attribute.name, attribute.value)
    }
  }
}

export function normalizeLegacyActivitiNamespace(xml: string): XmlCompatibilityResult {
  if (!xml.includes(LEGACY_ACTIVITI_NAMESPACE)) {
    return { xml, normalizedLegacyNamespace: false }
  }

  const document = new DOMParser().parseFromString(xml, 'application/xml')
  const hasParserError = Array.from(document.getElementsByTagName('parsererror')).some(
    (element) => PARSER_ERROR_NAMESPACES.has(element.namespaceURI || ''),
  )
  if (hasParserError) {
    return { xml, normalizedLegacyNamespace: false }
  }

  let normalizedLegacyNamespace = false
  const legacyElements = Array.from(
    document.getElementsByTagNameNS(LEGACY_ACTIVITI_NAMESPACE, '*'),
  )
  for (const element of legacyElements.reverse()) {
    const replacement = document.createElementNS(
      FLOWABLE_NAMESPACE,
      `flowable:${element.localName}`,
    )
    copyNormalizedAttributes(element, replacement)
    while (element.firstChild) replacement.appendChild(element.firstChild)
    element.parentNode?.replaceChild(replacement, element)
    normalizedLegacyNamespace = true
  }

  for (const element of Array.from(document.getElementsByTagName('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      if (
        attribute.namespaceURI === XMLNS_NAMESPACE &&
        attribute.value === LEGACY_ACTIVITI_NAMESPACE
      ) {
        element.setAttributeNS(XMLNS_NAMESPACE, attribute.name, FLOWABLE_NAMESPACE)
        normalizedLegacyNamespace = true
      } else if (attribute.namespaceURI === LEGACY_ACTIVITI_NAMESPACE) {
        element.removeAttributeNode(attribute)
        element.setAttributeNS(
          FLOWABLE_NAMESPACE,
          `flowable:${attribute.localName}`,
          attribute.value,
        )
        normalizedLegacyNamespace = true
      } else if (
        attribute.namespaceURI === XML_SCHEMA_INSTANCE_NAMESPACE &&
        attribute.localName === 'schemaLocation'
      ) {
        const value = normalizeSchemaLocation(attribute.value)
        if (value !== attribute.value) {
          element.setAttributeNS(attribute.namespaceURI, attribute.name, value)
          normalizedLegacyNamespace = true
        }
      }
    }
  }

  if (!normalizedLegacyNamespace || !document.documentElement) {
    return { xml, normalizedLegacyNamespace: false }
  }
  document.documentElement.setAttributeNS(
    XMLNS_NAMESPACE,
    'xmlns:flowable',
    FLOWABLE_NAMESPACE,
  )

  return {
    xml: new XMLSerializer().serializeToString(document),
    normalizedLegacyNamespace: true,
  }
}
