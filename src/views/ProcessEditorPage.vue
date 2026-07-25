<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { ElMessage } from 'element-plus'
import {
  onBeforeRouteLeave,
  useRoute,
  useRouter,
  type RouteLocationNormalized,
} from 'vue-router'

import BpmnDesigner from '@/components/designer/BpmnDesigner.vue'
import RouteLoading from '@/components/routing/RouteLoading.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import { ROUTE_NAMES } from '@/routes'

interface DesignerInstance {
  confirmClose: () => Promise<boolean>
}

const application = useModelerApplication()
const route = useRoute()
const router = useRouter()
const designerRef = shallowRef<DesignerInstance | null>(null)
const modelId = computed(() => {
  const value = route.params.modelId
  return typeof value === 'string' ? value : ''
})

let loadGeneration = 0
let bypassLeaveConfirmation = false

async function loadRouteModel() {
  const generation = ++loadGeneration
  const id = modelId.value
  if (application.sessionRestoring.value || !application.authenticated.value) return
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
    modelId.value === id
  ) {
    await router.replace({ name: ROUTE_NAMES.processes })
  }
}

async function closeEditor() {
  bypassLeaveConfirmation = true
  try {
    await router.push({ name: ROUTE_NAMES.processes })
  } finally {
    bypassLeaveConfirmation = false
  }
}

function restoreRejectedRoute(from: RouteLocationNormalized) {
  const restoreIfNeeded = () => {
    if (router.currentRoute.value.fullPath !== from.fullPath) return
    if ((window.location.hash.slice(1) || '/') === from.fullPath) return
    void router
      .replace({
        path: from.path,
        query: from.query,
        hash: from.hash,
        force: true,
      })
      .catch((error: unknown) => {
        ElMessage.error(error instanceof Error ? error.message : '无法恢复编辑器地址')
      })
  }

  for (const delay of [0, 50, 200]) {
    window.setTimeout(restoreIfNeeded, delay)
  }
}

onBeforeRouteLeave(async (_to, from) => {
  if (bypassLeaveConfirmation || !application.authenticated.value) return true
  if (!designerRef.value) return true

  let canLeave = false
  try {
    canLeave = await designerRef.value.confirmClose()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '无法确认是否离开编辑器')
  }
  if (!canLeave) restoreRejectedRoute(from)
  return canLeave
})

watch(
  () => [
    application.sessionRestoring.value,
    application.authenticated.value,
    modelId.value,
  ] as const,
  () => void loadRouteModel(),
  { immediate: true },
)

onBeforeUnmount(() => {
  loadGeneration += 1
  application.clearActiveModel()
})
</script>

<template>
  <RouteLoading
    v-if="
      application.sessionRestoring.value ||
      !application.authenticated.value ||
      application.activeModel.value?.id !== modelId
    "
  />
  <BpmnDesigner
    v-else
    :key="application.activeModel.value.id"
    ref="designerRef"
    :initial-xml="application.activeXml.value"
    :initial-file-name="`${application.activeModel.value.key}.bpmn20.xml`"
    :initial-saved-at="application.activeModel.value.lastUpdated"
    :persist-model="application.saveActiveModel"
    @close="closeEditor"
  />
</template>
