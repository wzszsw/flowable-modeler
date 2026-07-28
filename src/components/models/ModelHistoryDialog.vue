<script setup lang="ts">
import { computed } from 'vue'
import { RotateCcw } from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import type { ModelerModel } from '@/modeler/modelerApi'

const props = defineProps<{
  visible: boolean
  model: ModelerModel | null
  versions: readonly ModelerModel[]
  loading: boolean
  operationPending: boolean
}>()

const emit = defineEmits<{
  'update:visible': [visible: boolean]
  restore: [version: ModelerModel]
}>()

const { locale, t } = useI18n()
const formatter = computed(
  () =>
    new Intl.DateTimeFormat(locale.value, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }),
)

function formatDate(value: number) {
  return formatter.value.format(value)
}
</script>

<template>
  <el-dialog
    :model-value="visible"
    class="model-history-dialog"
    width="min(760px, calc(100vw - 32px))"
    :title="t('shell.history.title', { name: model?.name || '' })"
    :close-on-click-modal="!operationPending"
    :close-on-press-escape="!operationPending"
    :show-close="!operationPending"
    data-testid="model-history-dialog"
    :teleported="false"
    @update:model-value="emit('update:visible', $event)"
  >
    <div v-if="model" class="current-version">
      <span>{{ t('shell.history.currentVersion') }}</span>
      <strong>v{{ model.version }}</strong>
      <time :datetime="new Date(model.lastUpdated).toISOString()">
        {{ formatDate(model.lastUpdated) }}
      </time>
    </div>

    <el-table
      v-loading="loading"
      :data="versions"
      class="history-table"
      data-testid="model-history-table"
      empty-text=" "
    >
      <el-table-column :label="t('shell.history.version')" width="90">
        <template #default="scope"><strong>v{{ scope.row.version }}</strong></template>
      </el-table-column>
      <el-table-column :label="t('shell.history.modified')" width="170">
        <template #default="scope">{{ formatDate(scope.row.lastUpdated) }}</template>
      </el-table-column>
      <el-table-column prop="lastUpdatedBy" :label="t('shell.history.modifiedBy')" width="140" />
      <el-table-column :label="t('shell.history.comment')" min-width="180">
        <template #default="scope">
          <span class="history-comment">{{ scope.row.comment || t('shell.history.noComment') }}</span>
        </template>
      </el-table-column>
      <el-table-column width="58" align="right">
        <template #default="scope">
          <el-tooltip :content="t('shell.history.restore')" placement="top">
            <el-button
              text
              :icon="RotateCcw"
              :disabled="operationPending"
              data-testid="restore-model-history"
              :aria-label="t('shell.history.restoreAria', { version: scope.row.version })"
              @click="emit('restore', scope.row)"
            />
          </el-tooltip>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('shell.history.empty')" :image-size="72" />
      </template>
    </el-table>

    <template #footer>
      <el-button :disabled="operationPending" @click="emit('update:visible', false)">
        {{ t('shell.common.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.current-version { display: flex; min-height: 42px; align-items: center; padding: 0 12px; border: 1px solid #e4e7ec; border-radius: 6px; margin-bottom: 14px; gap: 10px; color: #475467; background: #f9fafb; font-size: 13px; }
.current-version strong { color: #175cd3; }
.current-version time { margin-left: auto; color: #667085; }
.history-table { width: 100%; min-height: 180px; }
.history-comment { color: #475467; }
</style>
