declare module 'diagram-js-minimap'
declare module 'bpmn-js-token-simulation'
declare module 'diagram-js-grid'

declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(packages?: Record<string, unknown>, options?: Record<string, unknown>)
    create(type: string, properties?: Record<string, unknown>): Record<string, unknown>
    fromXML(xml: string): Promise<{
      rootElement: Record<string, unknown>
      warnings: Error[]
      elementsById: Record<string, Record<string, unknown>>
    }>
    toXML(
      element: Record<string, unknown>,
      options?: Record<string, unknown>,
    ): Promise<{ xml: string }>
  }
}
