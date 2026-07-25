import type Modeler from 'bpmn-js/lib/Modeler'

import type {
  BpmnBusinessObject,
  BpmnExtensionElement,
  DiagramElement,
} from './types'

type ModelingService = {
  updateProperties: (element: DiagramElement, properties: Record<string, unknown>) => void
  updateModdleProperties: (
    element: DiagramElement,
    moddleElement: object,
    properties: Record<string, unknown>,
  ) => void
}

type BpmnFactoryService = {
  create: <T = Record<string, unknown>>(type: string, properties?: Record<string, unknown>) => T
}

type ModdleIdsService = {
  assigned: (id: string) => unknown
  claim: (id: string, element: object) => void
  unclaim: (id: string) => void
}

type ModdleService = {
  ids: ModdleIdsService
}

type GlobalDefinitionOperation = 'add' | 'update' | 'remove'

export type CustomResourceOperation = 'add' | 'update' | 'remove'

export type CustomResourceProperties = {
  name: string
  expression: string
}

type GlobalDefinitionCommandContext = {
  element: DiagramElement
  definitions: BpmnBusinessObject
  definition?: BpmnBusinessObject
  definitionType?: string
  operation: GlobalDefinitionOperation
  properties?: Record<string, unknown>
  oldProperties?: Record<string, unknown>
  oldRootElements?: BpmnBusinessObject[]
  oldParent?: object
  initialized?: boolean
}

type JobCategoryCommandContext = {
  element: DiagramElement
  body: string
  category?: BpmnExtensionElement
  categoryExisted?: boolean
  extensionElements?: BpmnBusinessObject
  oldExtensionElements?: BpmnBusinessObject
  oldExtensionValues?: BpmnExtensionElement[]
  oldBody?: unknown
  oldCategoryParent?: object
  oldLegacyJobCategory?: unknown
  oldLegacyLeaveJobCategory?: unknown
  initialized?: boolean
}

type CustomResourceCommandContext = {
  element: DiagramElement
  operation: CustomResourceOperation
  resource?: BpmnExtensionElement
  properties?: CustomResourceProperties
  extensionElements?: BpmnBusinessObject
  oldExtensionElements?: BpmnBusinessObject
  oldExtensionValues?: BpmnExtensionElement[]
  oldExtensionElementsParent?: object
  assignmentExpression?: BpmnBusinessObject
  formalExpression?: BpmnBusinessObject
  oldResourceParent?: object
  oldAssignmentParent?: object
  oldFormalExpressionParent?: object
  oldAssignmentExpression?: unknown
  oldFormalExpression?: unknown
  oldName?: unknown
  oldExpressionBody?: unknown
  resourceIndex?: number
  createdAssignmentExpression?: boolean
  createdFormalExpression?: boolean
  initialized?: boolean
}

type CommandStackService = {
  execute: <TContext>(command: string, context: TContext) => void
  register: <TContext>(
    command: string,
    handler: {
      execute: (context: TContext) => DiagramElement[]
      revert: (context: TContext) => DiagramElement[]
    },
  ) => void
}

const GLOBAL_DEFINITION_COMMAND = 'flowable-modeler.global-definition.update'
const JOB_CATEGORY_COMMAND = 'flowable-modeler.job-category.update'
const CUSTOM_RESOURCE_COMMAND = 'flowable-modeler.custom-resource.update'
const registeredGlobalDefinitionCommands = new WeakSet<object>()
const registeredJobCategoryCommands = new WeakSet<object>()
const registeredCustomResourceCommands = new WeakSet<object>()

const getModdleProperty = (element: BpmnBusinessObject, name: string) => {
  const getter = element.get as ((property: string) => unknown) | undefined
  return getter ? getter.call(element, name) : element[name]
}

const setModdleProperty = (element: BpmnBusinessObject, name: string, value: unknown) => {
  const setter = element.set as ((property: string, nextValue: unknown) => void) | undefined
  if (setter) setter.call(element, name, value)
  else element[name] = value
}

const idText = (value: unknown) =>
  value === undefined || value === null ? '' : String(value)

function updateIdClaim(
  ids: ModdleIdsService,
  definition: BpmnBusinessObject,
  oldId: unknown,
  newId: unknown,
) {
  const previous = idText(oldId)
  const next = idText(newId)
  if (previous === next) return
  if (previous) ids.unclaim(previous)
  if (next) ids.claim(next, definition)
}

function setModdleProperties(
  element: BpmnBusinessObject,
  properties: Record<string, unknown>,
) {
  for (const [name, value] of Object.entries(properties)) {
    setModdleProperty(element, name, value)
  }
}

function createGlobalDefinitionCommandHandler(
  ids: ModdleIdsService,
  bpmnFactory: BpmnFactoryService,
) {
  return {
    execute(context: GlobalDefinitionCommandContext) {
      const { definitions, element, operation } = context
      if (operation === 'add' && !context.definition) {
        if (!context.definitionType) throw new Error('definitionType is required for add')
        context.definition = bpmnFactory.create<BpmnBusinessObject>(
          context.definitionType,
          context.properties,
        )
      }
      const definition = context.definition
      if (!definition) throw new Error('definition is required')
      if (!context.initialized) {
        context.oldRootElements = [
          ...(((getModdleProperty(definitions, 'rootElements') as BpmnBusinessObject[] | undefined) || [])),
        ]
        if (operation === 'update') {
          context.oldProperties = Object.fromEntries(
            Object.keys(context.properties || {}).map((name) => [
              name,
              getModdleProperty(definition, name),
            ]),
          )
        }
        context.oldParent = definition.$parent as object | undefined
        context.initialized = true
      }

      if (operation === 'add') {
        definition.$parent = definitions
        setModdleProperty(definitions, 'rootElements', [
          ...(context.oldRootElements || []),
          definition,
        ])
        if (definition.id) ids.claim(definition.id, definition)
      } else if (operation === 'remove') {
        setModdleProperty(
          definitions,
          'rootElements',
          (context.oldRootElements || []).filter((value) => value !== definition),
        )
        if (definition.id) ids.unclaim(definition.id)
      } else {
        const properties = context.properties || {}
        updateIdClaim(ids, definition, context.oldProperties?.id, properties.id)
        setModdleProperties(definition, properties)
      }

      return [element]
    },

    revert(context: GlobalDefinitionCommandContext) {
      const { definition, definitions, element, operation } = context
      if (!definition) throw new Error('definition is required')
      if (operation === 'add') {
        definition.$parent = context.oldParent
        setModdleProperty(definitions, 'rootElements', context.oldRootElements || [])
        if (definition.id) ids.unclaim(definition.id)
      } else if (operation === 'remove') {
        setModdleProperty(definitions, 'rootElements', context.oldRootElements || [])
        if (definition.id) ids.claim(definition.id, definition)
      } else {
        const properties = context.properties || {}
        const oldProperties = context.oldProperties || {}
        updateIdClaim(ids, definition, properties.id, oldProperties.id)
        setModdleProperties(definition, oldProperties)
      }

      return [element]
    },
  }
}

function globalDefinitionCommandStack(modeler: Modeler) {
  const commandStack = modeler.get<CommandStackService>('commandStack')
  if (!registeredGlobalDefinitionCommands.has(commandStack)) {
    const ids = modeler.get<ModdleService>('moddle').ids
    const bpmnFactory = modeler.get<BpmnFactoryService>('bpmnFactory')
    commandStack.register(
      GLOBAL_DEFINITION_COMMAND,
      createGlobalDefinitionCommandHandler(ids, bpmnFactory),
    )
    registeredGlobalDefinitionCommands.add(commandStack)
  }
  return commandStack
}

function createJobCategoryCommandHandler(bpmnFactory: BpmnFactoryService) {
  return {
    execute(context: JobCategoryCommandContext) {
      const businessObject = context.element.businessObject
      if (!context.initialized) {
        const extensionElements = businessObject.extensionElements as
          | BpmnBusinessObject
          | undefined
        const extensionValues = [
          ...((extensionElements?.values as BpmnExtensionElement[] | undefined) || []),
        ]
        const category = extensionValues.find(
          (value) => value.$type === 'flowable:JobCategory',
        )

        context.oldExtensionElements = extensionElements
        context.oldExtensionValues = extensionValues
        context.category = category
        context.categoryExisted = Boolean(category)
        context.oldBody = category ? getModdleProperty(category, 'body') : undefined
        context.oldCategoryParent = category?.$parent as object | undefined
        context.oldLegacyJobCategory = getModdleProperty(
          businessObject,
          'flowable:jobCategory',
        )
        context.oldLegacyLeaveJobCategory = getModdleProperty(
          businessObject,
          'flowable:leaveJobCategory',
        )

        if (context.body && !context.category) {
          context.category = bpmnFactory.create<BpmnExtensionElement>(
            'flowable:JobCategory',
            { body: context.body },
          )
        }
        if (context.body && !extensionElements) {
          context.extensionElements = bpmnFactory.create<BpmnBusinessObject>(
            'bpmn:ExtensionElements',
            { values: [] },
          )
        } else {
          context.extensionElements = extensionElements
        }
        context.initialized = true
      }

      const extensionElements = context.extensionElements
      const category = context.category
      if (context.body) {
        if (!extensionElements || !category) {
          throw new Error('JobCategory command was not initialized')
        }
        extensionElements.$parent = businessObject
        category.$parent = extensionElements
        setModdleProperty(category, 'body', context.body)
        setModdleProperty(
          extensionElements,
          'values',
          context.categoryExisted
            ? context.oldExtensionValues || []
            : [...(context.oldExtensionValues || []), category],
        )
        setModdleProperty(businessObject, 'extensionElements', extensionElements)
      } else if (context.oldExtensionElements) {
        setModdleProperty(
          context.oldExtensionElements,
          'values',
          (context.oldExtensionValues || []).filter((value) => value !== category),
        )
        setModdleProperty(
          businessObject,
          'extensionElements',
          context.oldExtensionElements,
        )
      }

      setModdleProperty(businessObject, 'flowable:jobCategory', undefined)
      setModdleProperty(businessObject, 'flowable:leaveJobCategory', undefined)
      return [context.element]
    },

    revert(context: JobCategoryCommandContext) {
      const businessObject = context.element.businessObject
      if (context.categoryExisted && context.category) {
        setModdleProperty(context.category, 'body', context.oldBody)
      }
      if (context.category) context.category.$parent = context.oldCategoryParent

      if (context.oldExtensionElements) {
        context.oldExtensionElements.$parent = businessObject
        setModdleProperty(
          context.oldExtensionElements,
          'values',
          context.oldExtensionValues || [],
        )
        setModdleProperty(
          businessObject,
          'extensionElements',
          context.oldExtensionElements,
        )
      } else {
        if (context.extensionElements) context.extensionElements.$parent = undefined
        setModdleProperty(businessObject, 'extensionElements', undefined)
      }

      setModdleProperty(
        businessObject,
        'flowable:jobCategory',
        context.oldLegacyJobCategory,
      )
      setModdleProperty(
        businessObject,
        'flowable:leaveJobCategory',
        context.oldLegacyLeaveJobCategory,
      )
      return [context.element]
    },
  }
}

function jobCategoryCommandStack(modeler: Modeler) {
  const commandStack = modeler.get<CommandStackService>('commandStack')
  if (!registeredJobCategoryCommands.has(commandStack)) {
    commandStack.register(
      JOB_CATEGORY_COMMAND,
      createJobCategoryCommandHandler(modeler.get<BpmnFactoryService>('bpmnFactory')),
    )
    registeredJobCategoryCommands.add(commandStack)
  }
  return commandStack
}

function createCustomResourceCommandHandler(bpmnFactory: BpmnFactoryService) {
  const requireProperties = (context: CustomResourceCommandContext) => {
    if (!context.properties) {
      throw new Error(`properties are required for custom resource ${context.operation}`)
    }
    return context.properties
  }

  const initialize = (context: CustomResourceCommandContext) => {
    if (context.initialized) return

    const businessObject = context.element.businessObject
    const oldExtensionElements = businessObject.extensionElements as
      | BpmnBusinessObject
      | undefined
    const oldExtensionValues = [
      ...((oldExtensionElements
        ? (getModdleProperty(oldExtensionElements, 'values') as
            | BpmnExtensionElement[]
            | undefined)
        : undefined) || []),
    ]

    context.oldExtensionElements = oldExtensionElements
    context.oldExtensionValues = oldExtensionValues
    context.oldExtensionElementsParent = oldExtensionElements?.$parent as
      | object
      | undefined

    if (context.operation === 'add') {
      requireProperties(context)
      context.extensionElements =
        oldExtensionElements ||
        bpmnFactory.create<BpmnBusinessObject>('bpmn:ExtensionElements', {
          values: [],
        })
      context.resource = bpmnFactory.create<BpmnExtensionElement>(
        'flowable:CustomResource',
      )
      context.assignmentExpression = bpmnFactory.create<BpmnBusinessObject>(
        'bpmn:ResourceAssignmentExpression',
      )
      context.formalExpression = bpmnFactory.create<BpmnBusinessObject>(
        'bpmn:FormalExpression',
      )
      context.oldResourceParent = context.resource.$parent as object | undefined
      context.oldAssignmentParent = context.assignmentExpression.$parent as
        | object
        | undefined
      context.oldFormalExpressionParent = context.formalExpression.$parent as
        | object
        | undefined
    } else {
      const resource = context.resource
      if (!resource) {
        throw new Error(`resource is required for custom resource ${context.operation}`)
      }

      context.extensionElements = oldExtensionElements
      context.oldResourceParent = resource.$parent as object | undefined
      context.resourceIndex = oldExtensionValues.indexOf(resource)
      if (context.resourceIndex < 0) {
        throw new Error('custom resource is not attached to the selected element')
      }

      if (context.operation === 'remove') {
        context.initialized = true
        return
      }

      const oldAssignmentExpression = getModdleProperty(
        resource,
        'resourceAssignmentExpression',
      )
      const assignmentExpression = oldAssignmentExpression as
        | BpmnBusinessObject
        | undefined
      const oldFormalExpression = assignmentExpression
        ? getModdleProperty(assignmentExpression, 'bpmn:formalExpression')
        : undefined
      const formalExpression = oldFormalExpression as
        | BpmnBusinessObject
        | undefined

      context.oldAssignmentExpression = oldAssignmentExpression
      context.oldFormalExpression = oldFormalExpression
      context.assignmentExpression =
        assignmentExpression ||
        bpmnFactory.create<BpmnBusinessObject>(
          'bpmn:ResourceAssignmentExpression',
        )
      context.formalExpression =
        formalExpression ||
        bpmnFactory.create<BpmnBusinessObject>('bpmn:FormalExpression')
      context.createdAssignmentExpression = !assignmentExpression
      context.createdFormalExpression = !formalExpression
      context.oldAssignmentParent = context.assignmentExpression.$parent as
        | object
        | undefined
      context.oldFormalExpressionParent = context.formalExpression.$parent as
        | object
        | undefined

      requireProperties(context)
      context.oldName = getModdleProperty(resource, 'name')
      context.oldExpressionBody = getModdleProperty(
        context.formalExpression,
        'body',
      )
    }

    context.initialized = true
  }

  return {
    execute(context: CustomResourceCommandContext) {
      initialize(context)

      const businessObject = context.element.businessObject
      const resource = context.resource
      if (!resource) throw new Error('custom resource command was not initialized')

      if (context.operation === 'remove') {
        const extensionElements = context.extensionElements
        if (!extensionElements || context.resourceIndex === undefined) {
          throw new Error('custom resource removal was not initialized')
        }
        const values = [...(context.oldExtensionValues || [])]
        values.splice(context.resourceIndex, 1)
        setModdleProperty(extensionElements, 'values', values)
        resource.$parent = undefined
        return [context.element]
      }

      const properties = requireProperties(context)
      const assignmentExpression = context.assignmentExpression
      const formalExpression = context.formalExpression
      if (!assignmentExpression || !formalExpression) {
        throw new Error('custom resource expression was not initialized')
      }

      if (context.operation === 'add') {
        const extensionElements = context.extensionElements
        if (!extensionElements) {
          throw new Error('custom resource extension elements were not initialized')
        }
        extensionElements.$parent = businessObject
        resource.$parent = extensionElements
        assignmentExpression.$parent = resource
        formalExpression.$parent = assignmentExpression
        setModdleProperty(
          assignmentExpression,
          'bpmn:formalExpression',
          formalExpression,
        )
        setModdleProperty(
          resource,
          'resourceAssignmentExpression',
          assignmentExpression,
        )
        setModdleProperty(extensionElements, 'values', [
          ...(context.oldExtensionValues || []),
          resource,
        ])
        setModdleProperty(businessObject, 'extensionElements', extensionElements)
      } else {
        if (context.createdFormalExpression) {
          formalExpression.$parent = assignmentExpression
          setModdleProperty(
            assignmentExpression,
            'bpmn:formalExpression',
            formalExpression,
          )
        }
        if (context.createdAssignmentExpression) {
          assignmentExpression.$parent = resource
          setModdleProperty(
            resource,
            'resourceAssignmentExpression',
            assignmentExpression,
          )
        }
      }

      setModdleProperty(resource, 'name', properties.name)
      setModdleProperty(formalExpression, 'body', properties.expression)
      return [context.element]
    },

    revert(context: CustomResourceCommandContext) {
      const businessObject = context.element.businessObject
      const resource = context.resource
      if (!resource) throw new Error('custom resource command was not initialized')

      if (context.operation === 'add') {
        const extensionElements = context.extensionElements
        if (!extensionElements) {
          throw new Error('custom resource extension elements were not initialized')
        }
        setModdleProperty(
          extensionElements,
          'values',
          context.oldExtensionValues || [],
        )
        extensionElements.$parent = context.oldExtensionElementsParent
        resource.$parent = context.oldResourceParent
        setModdleProperty(
          businessObject,
          'extensionElements',
          context.oldExtensionElements,
        )
      } else if (context.operation === 'remove') {
        const extensionElements = context.extensionElements
        if (!extensionElements) {
          throw new Error('custom resource removal was not initialized')
        }
        setModdleProperty(
          extensionElements,
          'values',
          context.oldExtensionValues || [],
        )
        resource.$parent = context.oldResourceParent
      } else {
        const assignmentExpression = context.assignmentExpression
        const formalExpression = context.formalExpression
        if (!assignmentExpression || !formalExpression) {
          throw new Error('custom resource expression was not initialized')
        }
        setModdleProperty(resource, 'name', context.oldName)
        setModdleProperty(formalExpression, 'body', context.oldExpressionBody)
        if (context.createdFormalExpression) {
          setModdleProperty(
            assignmentExpression,
            'bpmn:formalExpression',
            context.oldFormalExpression,
          )
          formalExpression.$parent = context.oldFormalExpressionParent
        }
        if (context.createdAssignmentExpression) {
          setModdleProperty(
            resource,
            'resourceAssignmentExpression',
            context.oldAssignmentExpression,
          )
          assignmentExpression.$parent = context.oldAssignmentParent
        }
      }

      return [context.element]
    },
  }
}

function customResourceCommandStack(modeler: Modeler) {
  const commandStack = modeler.get<CommandStackService>('commandStack')
  if (!registeredCustomResourceCommands.has(commandStack)) {
    commandStack.register(
      CUSTOM_RESOURCE_COMMAND,
      createCustomResourceCommandHandler(
        modeler.get<BpmnFactoryService>('bpmnFactory'),
      ),
    )
    registeredCustomResourceCommands.add(commandStack)
  }
  return commandStack
}

export function getClaimedIdOwner(modeler: Modeler, id: string) {
  return modeler.get<ModdleService>('moddle').ids.assigned(id)
}

export function setJobCategoryBody(
  modeler: Modeler,
  element: DiagramElement,
  body: string,
) {
  const normalizedBody = body.trim()
  const businessObject = element.businessObject
  const currentBody = getExtensionBody(element, 'flowable:JobCategory')
  const legacyJobCategory = getModdleProperty(businessObject, 'flowable:jobCategory')
  const legacyLeaveJobCategory = getModdleProperty(
    businessObject,
    'flowable:leaveJobCategory',
  )
  if (
    currentBody === normalizedBody &&
    legacyJobCategory === undefined &&
    legacyLeaveJobCategory === undefined
  ) {
    return false
  }

  jobCategoryCommandStack(modeler).execute(JOB_CATEGORY_COMMAND, {
    element,
    body: normalizedBody,
  } satisfies JobCategoryCommandContext)
  return true
}

export function mutateGlobalDefinition(
  modeler: Modeler,
  element: DiagramElement,
  definitions: BpmnBusinessObject,
  definition: BpmnBusinessObject | undefined,
  operation: GlobalDefinitionOperation,
  properties?: Record<string, unknown>,
  definitionType?: string,
) {
  globalDefinitionCommandStack(modeler).execute(GLOBAL_DEFINITION_COMMAND, {
    element,
    definitions,
    definition,
    operation,
    properties,
    definitionType,
  })
}

export function mutateCustomResource(
  modeler: Modeler,
  element: DiagramElement,
  operation: CustomResourceOperation,
  resource?: BpmnExtensionElement,
  properties?: CustomResourceProperties,
): BpmnExtensionElement {
  const context: CustomResourceCommandContext = {
    element,
    operation,
    resource,
    properties,
  }
  customResourceCommandStack(modeler).execute(CUSTOM_RESOURCE_COMMAND, context)
  if (!context.resource) {
    throw new Error('custom resource command did not create a resource')
  }
  return context.resource
}

export const emptyToUndefined = <T>(value: T) =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

export function getBusinessProperty(
  businessObject: BpmnBusinessObject,
  property: string,
): unknown {
  try {
    const value = businessObject.get?.(property)
    if (value !== undefined) return value
  } catch {
    // Fall back to the plain property for imported unknown attributes.
  }
  const plainName = property.includes(':') ? property.split(':')[1] : property
  return plainName ? businessObject[plainName] : undefined
}

export function updateElementProperties(
  modeler: Modeler,
  element: DiagramElement,
  properties: Record<string, unknown>,
) {
  const normalized = Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [key, emptyToUndefined(value)]),
  )
  modeler.get<ModelingService>('modeling').updateProperties(element, normalized)
}

export function updateDocumentation(modeler: Modeler, element: DiagramElement, text: string) {
  const bpmnFactory = modeler.get<BpmnFactoryService>('bpmnFactory')
  const documentation = text.trim()
    ? [bpmnFactory.create('bpmn:Documentation', { text })]
    : undefined
  if (documentation) (documentation[0] as { $parent?: object }).$parent = element.businessObject
  updateElementProperties(modeler, element, { documentation })
}

export function createFormalExpression(
  modeler: Modeler,
  body: string,
  parent?: object,
) {
  if (!body.trim()) return undefined
  const expression = modeler
    .get<BpmnFactoryService>('bpmnFactory')
    .create<BpmnBusinessObject>('bpmn:FormalExpression', { body })
  if (parent) (expression as { $parent?: object }).$parent = parent
  return expression
}

export function getExtensionValues(element: DiagramElement) {
  return element.businessObject.extensionElements?.values || []
}

export function findExtensionValue(element: DiagramElement, type: string) {
  return getExtensionValues(element).find((value) => value.$type === type)
}

export function getExtensionBody(element: DiagramElement, type: string) {
  const value = findExtensionValue(element, type)
  if (!value) return ''

  try {
    const body = (value as { get?: (name: string) => unknown }).get?.('body')
    if (body !== undefined && body !== null) return String(body)
  } catch {
    // Fall back to the plain property for imported moddle values.
  }

  return value.body === undefined || value.body === null ? '' : String(value.body)
}

export function addExtensionValue(
  modeler: Modeler,
  element: DiagramElement,
  value: BpmnExtensionElement,
) {
  const modeling = modeler.get<ModelingService>('modeling')
  const bpmnFactory = modeler.get<BpmnFactoryService>('bpmnFactory')
  const businessObject = element.businessObject
  let extensionElements = businessObject.extensionElements as
    | { values?: BpmnExtensionElement[]; $parent?: object }
    | undefined

  if (!extensionElements) {
    extensionElements = bpmnFactory.create<{ values: BpmnExtensionElement[]; $parent?: object }>(
      'bpmn:ExtensionElements',
      { values: [] },
    )
    extensionElements.$parent = businessObject
    ;(value as { $parent?: object }).$parent = extensionElements
    extensionElements.values = [value]
    modeling.updateProperties(element, { extensionElements })
    return
  }

  ;(value as { $parent?: object }).$parent = extensionElements
  modeling.updateModdleProperties(element, extensionElements, {
    values: [...(extensionElements.values || []), value],
  })
}

export function updateExtensionValue(
  modeler: Modeler,
  element: DiagramElement,
  value: BpmnExtensionElement,
  properties: Record<string, unknown>,
) {
  updateModdleProperties(modeler, element, value, properties)
}

export function updateModdleProperties(
  modeler: Modeler,
  element: DiagramElement,
  moddleElement: object,
  properties: Record<string, unknown>,
) {
  modeler
    .get<ModelingService>('modeling')
    .updateModdleProperties(element, moddleElement, properties)
}

export function removeExtensionValue(
  modeler: Modeler,
  element: DiagramElement,
  value: BpmnExtensionElement,
) {
  const extensionElements = element.businessObject.extensionElements
  if (!extensionElements) return
  modeler.get<ModelingService>('modeling').updateModdleProperties(element, extensionElements, {
    values: (extensionElements.values || []).filter((item) => item !== value),
  })
}

export function createModdleElement<T = BpmnExtensionElement>(
  modeler: Modeler,
  type: string,
  properties: Record<string, unknown>,
  parent?: object,
) {
  const value = modeler.get<BpmnFactoryService>('bpmnFactory').create<T>(type, properties)
  if (parent) (value as { $parent?: object }).$parent = parent
  return value
}

export function setExtensionBody(
  modeler: Modeler,
  element: DiagramElement,
  type: string,
  body: string,
) {
  const existing = findExtensionValue(element, type)

  if (!body.trim()) {
    if (!existing) return false
    removeExtensionValue(modeler, element, existing)
    return true
  }

  if (existing) {
    if (getExtensionBody(element, type) === body) return false
    updateExtensionValue(modeler, element, existing, { body })
    return true
  }

  const value = createModdleElement<BpmnExtensionElement>(modeler, type, { body })
  addExtensionValue(modeler, element, value)
  return true
}
