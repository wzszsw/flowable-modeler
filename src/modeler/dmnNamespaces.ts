export const DMN_MODEL_NAMESPACE_11 = 'http://www.omg.org/spec/DMN/20151101'
export const DMN_MODEL_NAMESPACE_12 = 'http://www.omg.org/spec/DMN/20180521/MODEL/'
export const DMN_MODEL_NAMESPACE_13 = 'https://www.omg.org/spec/DMN/20191111/MODEL/'

export const DMN_MODEL_NAMESPACES = [
  DMN_MODEL_NAMESPACE_11,
  DMN_MODEL_NAMESPACE_12,
  DMN_MODEL_NAMESPACE_13,
] as const

export const DMN_DI_NAMESPACE_12 = 'http://www.omg.org/spec/DMN/20180521/DMNDI/'
export const DMN_DI_NAMESPACE_13 = 'https://www.omg.org/spec/DMN/20191111/DMNDI/'

export const DMN_DI_NAMESPACES = [DMN_DI_NAMESPACE_12, DMN_DI_NAMESPACE_13] as const

export type DmnModelNamespace = (typeof DMN_MODEL_NAMESPACES)[number]

export function isDmnModelNamespace(value: string | null): value is DmnModelNamespace {
  return DMN_MODEL_NAMESPACES.some((namespace) => namespace === value)
}
