<script setup lang="ts">
import { useRouter } from 'vue-router'

import ProcessModelList from '@/components/models/ProcessModelList.vue'
import RouteLoading from '@/components/routing/RouteLoading.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'
import { ROUTE_NAMES } from '@/routes'

const application = useModelerApplication()
const router = useRouter()

function openModel(id: string) {
  void router.push({ name: ROUTE_NAMES.processEditor, params: { modelId: id } })
}
</script>

<template>
  <RouteLoading v-if="application.sessionRestoring.value || !application.authenticated.value" />
  <ProcessModelList
    v-else
    :models="application.models.value"
    :total="application.totalModels.value"
    :loading="application.listLoading.value"
    :username="application.username.value"
    @create="application.createModel"
    @import="application.importModel"
    @open="openModel"
    @delete="application.deleteModel"
    @query-change="application.loadModels"
    @refresh="application.loadModels()"
    @logout="application.logout"
  />
</template>
