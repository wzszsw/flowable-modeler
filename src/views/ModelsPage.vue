<script setup lang="ts">
import { computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ModelList from '@/components/models/ModelList.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import {
  MODEL_TYPES,
  type DecisionModelType,
  type ModelCategory,
} from '@/modeler/modelTypes'
import { editorRouteName, ROUTE_NAMES } from '@/routes'

const application = useModelerApplication()
const route = useRoute()
const router = useRouter()

const activeCategory = computed<ModelCategory>(() => {
  if (route.name === ROUTE_NAMES.cases) return 'cases'
  if (route.name === ROUTE_NAMES.decisions) return 'decisions'
  return 'processes'
})
const decisionType = computed<DecisionModelType>(() =>
  route.query.type === 'service'
    ? MODEL_TYPES.decisionService
    : MODEL_TYPES.decisionTable,
)
const activeModelType = computed(() => {
  if (activeCategory.value === 'cases') return MODEL_TYPES.case
  if (activeCategory.value === 'decisions') return decisionType.value
  return MODEL_TYPES.process
})
const listKey = computed(() => `${activeCategory.value}:${activeModelType.value}`)

function navigationQuery(extra: Record<string, string> = {}) {
  const language = typeof route.query.lang === 'string' ? route.query.lang : undefined
  return { ...(language ? { lang: language } : {}), ...extra }
}

function openModel(id: string) {
  const model = application.models.value.find((candidate) => candidate.id === id)
  if (!model) return
  void router.push({
    name: editorRouteName(model.modelType),
    params: { modelId: id },
    query: navigationQuery(),
  })
}

function changeDecisionType(modelType: DecisionModelType) {
  void router.replace({
    name: ROUTE_NAMES.decisions,
    query: navigationQuery({
      type: modelType === MODEL_TYPES.decisionService ? 'service' : 'table',
    }),
  })
}

watch(
  () => [application.authenticated.value, activeModelType.value] as const,
  ([authenticated, modelType]) => {
    if (!authenticated) return
    void application.loadModels({ sort: 'modifiedDesc', modelTypes: [modelType] })
  },
  { immediate: true },
)
</script>

<template>
  <ModelList
    :key="listKey"
    :models="application.models.value"
    :total="application.totalModels.value"
    :username="application.username.value"
    :operation-pending="
      application.authenticationPending.value || application.modelMutationPending.value
    "
    :active-category="activeCategory"
    :decision-type="decisionType"
    @create="application.createModel"
    @import="application.importModel"
    @open="openModel"
    @download="application.downloadModel"
    @delete="application.deleteModel"
    @query-change="application.loadModels"
    @refresh="application.loadModels()"
    @logout="application.logout"
    @decision-type-change="changeDecisionType"
  />
</template>
