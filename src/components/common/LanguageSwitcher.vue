<script setup lang="ts">
import { Languages } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { currentLocale, type AppLocale } from '@/i18n'

withDefaults(
  defineProps<{
    inverted?: boolean
  }>(),
  {
    inverted: false,
  },
)

const { t } = useI18n()
const route = useRoute()
const router = useRouter()

async function changeLanguage(command: string | number | object) {
  if (command !== 'zh-CN' && command !== 'en') return
  const locale = command as AppLocale
  await router.replace({
    path: route.path,
    query: { ...route.query, lang: locale },
    hash: route.hash,
  })
}
</script>

<template>
  <el-dropdown trigger="click" @command="changeLanguage">
    <el-button
      circle
      class="language-trigger"
      :class="{ 'is-inverted': inverted }"
      :aria-label="t('shell.language.label')"
      :title="t('shell.language.label')"
      data-testid="language-switcher"
    >
      <Languages :size="17" aria-hidden="true" />
    </el-button>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item
          command="zh-CN"
          :disabled="currentLocale === 'zh-CN'"
          data-testid="language-zh-CN"
        >
          {{ t('shell.language.zhCN') }}
        </el-dropdown-item>
        <el-dropdown-item
          command="en"
          :disabled="currentLocale === 'en'"
          data-testid="language-en"
        >
          {{ t('shell.language.en') }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style scoped>
.language-trigger.is-inverted {
  color: #fff;
  border-color: rgb(255 255 255 / 34%);
  background: rgb(255 255 255 / 8%);
}

.language-trigger.is-inverted:hover,
.language-trigger.is-inverted:focus-visible {
  color: #fff;
  border-color: rgb(255 255 255 / 62%);
  background: rgb(255 255 255 / 16%);
}
</style>
