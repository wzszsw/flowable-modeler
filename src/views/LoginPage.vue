<script setup lang="ts">
import LoginView from '@/components/auth/LoginView.vue'
import { useModelerApplication } from '@/modeler/modelerApplication'

const application = useModelerApplication()
</script>

<template>
  <LoginView
    :error="application.loginError.value"
    @login="application.login"
  />
</template>
