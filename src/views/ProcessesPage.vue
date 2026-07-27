<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'

import ProcessModelList from '@/components/models/ProcessModelList.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import { ROUTE_NAMES } from '@/routes'

const application = useModelerApplication()
const route = useRoute()
const router = useRouter()

function openModel(id: string) {
  void router.push({
    name: ROUTE_NAMES.processEditor,
    params: { modelId: id },
    query: route.query,
  })
}
</script>

<template>
  <ProcessModelList
    :models="application.models.value"
    :total="application.totalModels.value"
    :username="application.username.value"
    :operation-pending="
      application.authenticationPending.value || application.modelMutationPending.value
    "
    @create="application.createModel"
    @import="application.importModel"
    @open="openModel"
    @delete="application.deleteModel"
    @query-change="application.loadModels"
    @refresh="application.loadModels()"
    @logout="application.logout"
  />
</template>
