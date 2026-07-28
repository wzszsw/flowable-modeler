<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import ModelList from '@/components/models/ModelList.vue'
import ModelHistoryDialog from '@/components/models/ModelHistoryDialog.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import {
  MODEL_TYPES,
  type DecisionModelType,
  type ModelCategory,
} from '@/modeler/modelTypes'
import { editorRouteName, ROUTE_NAMES } from '@/routes'
import type { ModelerModel } from '@/modeler/modelerApi'

const application = useModelerApplication()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const historyVisible = ref(false)
const historyLoading = ref(false)
const historyModel = ref<ModelerModel | null>(null)
const historyVersions = ref<ModelerModel[]>([])
let historyGeneration = 0

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

async function openHistory(model: ModelerModel) {
  const generation = ++historyGeneration
  historyModel.value = model
  historyVersions.value = []
  historyVisible.value = true
  historyLoading.value = true
  const versions = await application.loadModelHistory(model.id)
  if (generation !== historyGeneration || historyModel.value?.id !== model.id) return
  historyVersions.value = versions
  historyLoading.value = false
}

function closeHistory(visible: boolean) {
  historyVisible.value = visible
  if (visible) return
  historyGeneration += 1
  historyLoading.value = false
}

async function restoreHistory(version: ModelerModel) {
  const model = historyModel.value
  if (!model || application.modelMutationPending.value) return
  const generation = historyGeneration
  let comment = ''
  try {
    const result = await ElMessageBox.prompt(
      t('shell.history.restoreMessage', { version: version.version }),
      t('shell.history.restoreTitle'),
      {
        inputType: 'textarea',
        inputPlaceholder: t('shell.history.commentPlaceholder'),
        confirmButtonText: t('shell.history.restore'),
        cancelButtonText: t('shell.common.cancel'),
        type: 'warning',
      },
    )
    comment = result.value.trim()
  } catch {
    return
  }
  const restored = await application.restoreModelHistory(model.id, version.id, comment)
  if (
    !restored ||
    generation !== historyGeneration ||
    historyModel.value?.id !== model.id
  ) {
    return
  }
  historyModel.value = restored
  historyLoading.value = true
  const versions = await application.loadModelHistory(model.id)
  if (generation !== historyGeneration || historyModel.value?.id !== model.id) return
  historyVersions.value = versions
  historyLoading.value = false
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
    @duplicate="application.duplicateModel"
    @history="openHistory"
    @open="openModel"
    @download="application.downloadModel"
    @delete="application.deleteModel"
    @query-change="application.loadModels"
    @refresh="application.loadModels()"
    @logout="application.logout"
    @decision-type-change="changeDecisionType"
  />
  <ModelHistoryDialog
    :visible="historyVisible"
    :model="historyModel"
    :versions="historyVersions"
    :loading="historyLoading"
    :operation-pending="application.modelMutationPending.value"
    @update:visible="closeHistory"
    @restore="restoreHistory"
  />
</template>
