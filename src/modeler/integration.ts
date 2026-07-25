export type BusinessScalar = string | number | boolean | null

export type BusinessValue = BusinessScalar | BusinessRecord | BusinessValue[]

export interface BusinessRecord {
  [key: string]: BusinessValue
}

export type NodeFormRecord = BusinessRecord & {
  code: string
  name: string
  id?: string
  title?: string
  categoryCode?: string
  categoryName?: string
}

export interface NodeFormContext {
  activityId: string
  processId: string
  modelKey: string
  formKey: string
  selectedForms: BusinessRecord[]
}

export type HostServiceTaskTypeDefinition = BusinessRecord & {
  type: string
  label?: string
}

export interface FlowableHostAdapter {
  customServiceTaskTypes?: Array<string | HostServiceTaskTypeDefinition>
  selectNodeForms?: (
    context: NodeFormContext,
  ) => NodeFormRecord[] | null | undefined | Promise<NodeFormRecord[] | null | undefined>
}
