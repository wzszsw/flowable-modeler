import { baseCompile } from '@intlify/message-compiler'

import { designerEn, designerZhCN } from '../src/i18n/locales/designer.ts'
import { modelerEn, modelerZhCN } from '../src/i18n/locales/modeler.ts'
import { propertiesEn, propertiesZhCN } from '../src/i18n/locales/properties.ts'
import { shellEn, shellZhCN } from '../src/i18n/locales/shell.ts'

const catalogs = [
  ['shell', shellZhCN, shellEn],
  ['designer', designerZhCN, designerEn],
  ['modeler', modelerZhCN, modelerEn],
  ['properties', propertiesZhCN, propertiesEn],
]

function flatten(value, path = '', result = new Map()) {
  for (const [key, item] of Object.entries(value)) {
    const next = path ? `${path}.${key}` : key
    if (item && typeof item === 'object') flatten(item, next, result)
    else result.set(next, String(item))
  }
  return result
}

function placeholders(message) {
  return [...new Set([...message.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]))].sort()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const summary = {}
for (const [name, chineseSource, englishSource] of catalogs) {
  const chinese = flatten(chineseSource)
  const english = flatten(englishSource)
  const chineseKeys = [...chinese.keys()].sort()
  const englishKeys = [...english.keys()].sort()
  assert(
    JSON.stringify(chineseKeys) === JSON.stringify(englishKeys),
    `${name} 中英文资源键不对称`,
  )

  for (const key of chineseKeys) {
    const chineseMessage = chinese.get(key)
    const englishMessage = english.get(key)
    assert(
      JSON.stringify(placeholders(chineseMessage)) === JSON.stringify(placeholders(englishMessage)),
      `${name}.${key} 的中英文参数占位不一致`,
    )
    for (const [locale, message] of [
      ['zh-CN', chineseMessage],
      ['en', englishMessage],
    ]) {
      const errors = []
      baseCompile(message, { onError: (error) => errors.push(error.message) })
      assert(!errors.length, `${locale} ${name}.${key} 无法编译：${errors.join('; ')}`)
    }
  }
  summary[name] = chineseKeys.length
}

console.log(JSON.stringify({ ok: true, keys: summary }))
