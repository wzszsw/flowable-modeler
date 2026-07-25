<script setup lang="ts">
import LoginView from '@/components/auth/LoginView.vue'
import RouteLoading from '@/components/routing/RouteLoading.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'

const application = useModelerApplication()
</script>

<template>
  <RouteLoading v-if="application.sessionRestoring.value || application.authenticated.value" />
  <LoginView
    v-else
    :busy="application.authenticating.value"
    :error="application.loginError.value"
    @login="application.login"
  />
</template>
