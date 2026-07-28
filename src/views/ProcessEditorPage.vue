<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import BpmnDesigner from '@/components/designer/BpmnDesigner.vue'
import StructuredDesigner from '@/components/designer/StructuredDesigner.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import { MODEL_TYPES } from '@/modeler/modelTypes'
import { editorRouteName, listRouteName, ROUTE_NAMES } from '@/routes'

const application = useModelerApplication()
const route = useRoute()
const router = useRouter()
const modelId = computed(() => {
  const value = route.params.modelId
  return typeof value === 'string' ? value : ''
})
const routeModel = computed(() => {
  const model = application.activeModel.value
  return model?.id === modelId.value ? model : null
})

let loadGeneration = 0

async function loadRouteModel() {
  const generation = ++loadGeneration
  const id = modelId.value
  if (!application.authenticated.value) return
  if (!id) {
    await router.replace({ name: ROUTE_NAMES.processes })
    return
  }
  if (application.activeModel.value?.id === id) return

  application.clearActiveModel()
  const loaded = await application.loadModelForRoute(id)
  if (
    !loaded &&
    generation === loadGeneration &&
    application.authenticated.value &&
    modelId.value === id &&
    application.activeModel.value?.id !== id
  ) {
    await router.replace({ name: ROUTE_NAMES.processes })
  }
}

function closeEditor() {
  const model = routeModel.value
  const query: Record<string, string> = {}
  if (typeof route.query.lang === 'string') query.lang = route.query.lang
  if (model?.modelType === MODEL_TYPES.decisionService) query.type = 'service'
  else if (model?.modelType === MODEL_TYPES.decisionTable) query.type = 'table'
  void router.push({
    name: model ? listRouteName(model.modelType) : ROUTE_NAMES.processes,
    query,
  })
}

function openReference(referenceId: string) {
  const reference = application.referenceModels.value.find((model) => model.id === referenceId)
  if (!reference) return
  const query: Record<string, string> = {}
  if (typeof route.query.lang === 'string') query.lang = route.query.lang
  void router.push({
    name: editorRouteName(reference.modelType),
    params: { modelId: reference.id },
    query,
  })
}

watch(
  () => [application.authenticated.value, modelId.value] as const,
  () => void loadRouteModel(),
  { immediate: true },
)

onBeforeUnmount(() => {
  loadGeneration += 1
  application.clearActiveModel()
})
</script>

<template>
  <BpmnDesigner
    v-if="routeModel?.modelType === MODEL_TYPES.process"
    :key="routeModel.id"
    :initial-xml="application.activeXml.value"
    :initial-file-name="`${routeModel.key}.bpmn20.xml`"
    :initial-saved-at="routeModel.lastUpdated"
    :reference-models="application.referenceModels.value"
    :persist-model="application.saveActiveModel"
    @close="closeEditor"
    @open-reference="openReference"
  />
  <StructuredDesigner
    v-else-if="routeModel"
    :key="routeModel.id"
    :model-type="routeModel.modelType"
    :initial-xml="application.activeXml.value"
    :initial-name="routeModel.name"
    :initial-key="routeModel.key"
    :initial-description="routeModel.description"
    :initial-saved-at="routeModel.lastUpdated"
    :reference-models="application.referenceModels.value"
    :persist-model="application.saveActiveModel"
    @close="closeEditor"
    @open-reference="openReference"
  />
</template>
