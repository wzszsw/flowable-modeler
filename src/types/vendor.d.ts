declare module 'diagram-js-minimap'
declare module 'bpmn-js-token-simulation'
declare module 'diagram-js-grid'

interface FlowableModelerBridge {
  getXML: () => Promise<string>
  importXML: (xml: string, fileName?: string) => Promise<{ warnings: unknown[] }>
  validate: () => import('@/modeler/types').ValidationProblem[]
  saveDraft: () => Promise<void>
  configureHost: (adapter: import('@/modeler/integration').FlowableHostAdapter | null) => void
}

interface Window {
  bpmnModeler?: import('bpmn-js/lib/Modeler').default
  flowableProcessModeler?: FlowableModelerBridge
}
