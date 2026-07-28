import CmmnContextPadProvider from 'cmmn-js/lib/features/context-pad/ContextPadProvider'
import CmmnPaletteProvider from 'cmmn-js/lib/features/palette/PaletteProvider'
import CmmnReplaceMenuProvider from 'cmmn-js/lib/features/popup-menu/ReplaceMenuProvider'

type EntryMap = Record<string, unknown>

interface ProviderRegistry {
  registerProvider(priority: number, provider: object): void
}

interface PopupMenuRegistry {
  registerProvider(id: string, priority: number, provider: object): void
}

const FILTER_PRIORITY = 500

function retainEntries(allowedIds: ReadonlySet<string>) {
  return (entries: EntryMap) => {
    for (const id of Object.keys(entries)) {
      if (!allowedIds.has(id)) delete entries[id]
    }
    return entries
  }
}

function retainedEntryMap(entries: EntryMap, allowedIds: ReadonlySet<string>) {
  return retainEntries(allowedIds)({ ...entries })
}

function removeAllEntries() {
  return () => ({})
}

const CMMN_PALETTE_ENTRIES = new Set([
  'hand-tool',
  'lasso-tool',
  'space-tool',
  'global-connect-tool',
  'tool-separator',
  'create.task',
  'create.stage',
  'create.milestone',
  'create.eventListener',
  'create.criterion',
])

const CMMN_CONTEXT_PAD_ENTRIES = new Set([
  'append.entryCriterion',
  'replace',
  'connect',
  'delete',
])

const CMMN_REPLACE_ENTRIES = new Set([
  'replace-with-task-plan-item',
  'replace-with-blocking-human-task-plan-item',
  'replace-with-non-blocking-human-task-plan-item',
  'replace-with-decision-task-plan-item',
  'replace-with-process-task-plan-item',
  'replace-with-case-task-plan-item',
  'replace-with-expanded-stage-plan-item',
  'replace-with-stage-plan-item',
  'replace-with-event-listener-plan-item',
  'replace-with-timer-event-listener-plan-item',
  'replace-with-user-event-listener-plan-item',
  'replace-with-entry-criterion',
  'replace-with-exit-criterion',
])

const DMN_PALETTE_ENTRIES = new Set([
  'hand-tool',
  'lasso-tool',
  'tool-separator',
  'create.decision',
])

const DMN_CONTEXT_PAD_ENTRIES = new Set([
  'append.decision',
  'connect',
  'delete',
])

class FlowableCmmnPaletteProvider extends CmmnPaletteProvider {
  getPaletteEntries(element: unknown) {
    return retainedEntryMap(super.getPaletteEntries(element), CMMN_PALETTE_ENTRIES)
  }
}

class FlowableCmmnContextPadProvider extends CmmnContextPadProvider {
  getContextPadEntries(element: unknown) {
    return retainedEntryMap(
      super.getContextPadEntries(element),
      CMMN_CONTEXT_PAD_ENTRIES,
    )
  }
}

class FlowableCmmnReplaceMenuProvider extends CmmnReplaceMenuProvider {
  getEntries(element: unknown) {
    return (super.getEntries(element) as Array<{ id?: string }>).filter(
      (entry) => entry.id && CMMN_REPLACE_ENTRIES.has(entry.id),
    )
  }

  getHeaderEntries() {
    return []
  }
}

class DmnPaletteFilter {
  static $inject = ['palette']

  constructor(palette: ProviderRegistry) {
    palette.registerProvider(FILTER_PRIORITY, this)
  }

  getPaletteEntries() {
    return retainEntries(DMN_PALETTE_ENTRIES)
  }
}

class DmnContextPadFilter {
  static $inject = ['contextPad']

  constructor(contextPad: ProviderRegistry) {
    contextPad.registerProvider(FILTER_PRIORITY, this)
  }

  getContextPadEntries() {
    return retainEntries(DMN_CONTEXT_PAD_ENTRIES)
  }
}

class DmnReplaceMenuFilter {
  static $inject = ['popupMenu']

  constructor(popupMenu: PopupMenuRegistry) {
    popupMenu.registerProvider('dmn-replace', FILTER_PRIORITY, this)
  }

  getPopupMenuEntries() {
    return removeAllEntries()
  }

  getPopupMenuHeaderEntries() {
    return removeAllEntries()
  }
}

export const flowableCmmnModelerModule = {
  paletteProvider: ['type', FlowableCmmnPaletteProvider],
  contextPadProvider: ['type', FlowableCmmnContextPadProvider],
  replaceMenuProvider: ['type', FlowableCmmnReplaceMenuProvider],
}

export const flowableDmnDrdModelerModule = {
  __init__: [
    'flowableDmnPaletteFilter',
    'flowableDmnContextPadFilter',
    'flowableDmnReplaceMenuFilter',
  ],
  flowableDmnPaletteFilter: ['type', DmnPaletteFilter],
  flowableDmnContextPadFilter: ['type', DmnContextPadFilter],
  flowableDmnReplaceMenuFilter: ['type', DmnReplaceMenuFilter],
}
