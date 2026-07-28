declare module 'diagram-js-minimap'
declare module 'bpmn-js-token-simulation'
declare module 'diagram-js-grid'
declare module 'bpmn-auto-layout' {
  export function layoutProcess(xml: string): Promise<string>
}
declare module 'cmmn-js/lib/Modeler' {
  const Modeler: new (options?: Record<string, unknown>) => any
  export default Modeler
}
declare module 'cmmn-js/lib/features/palette/PaletteProvider' {
  const PaletteProvider: any
  export default PaletteProvider
}
declare module 'cmmn-js/lib/features/context-pad/ContextPadProvider' {
  const ContextPadProvider: any
  export default ContextPadProvider
}
declare module 'cmmn-js/lib/features/popup-menu/ReplaceMenuProvider' {
  const ReplaceMenuProvider: any
  export default ReplaceMenuProvider
}
declare module 'dmn-js/lib/Modeler' {
  const Modeler: new (options?: Record<string, unknown>) => any
  export default Modeler
}

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
