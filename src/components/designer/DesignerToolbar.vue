<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Aim,
  ArrowDown,
  Back,
  CircleCheck,
  FullScreen,
  RefreshLeft,
  RefreshRight,
  VideoPause,
  VideoPlay,
  View,
  ZoomIn,
  ZoomOut,
} from '@element-plus/icons-vue'
import {
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignHorizontalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  GitBranch,
} from 'lucide-vue-next'

type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

const { t } = useI18n()

defineProps<{
  ready: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  simulationActive: boolean
  problemCount: number
  saving: boolean
}>()

const emit = defineEmits<{
  back: []
  save: []
  saveNewVersion: []
  preview: []
  validate: []
  simulate: []
  undo: []
  redo: []
  zoomIn: []
  zoomOut: []
  fit: []
  fullscreen: []
  align: [alignment: Alignment]
}>()

const alignments = computed<Array<{
  type: Alignment
  label: string
  icon: typeof AlignHorizontalJustifyStart
}>>(() => [
  { type: 'left', label: t('designer.toolbar.align.left'), icon: AlignHorizontalJustifyStart },
  { type: 'center', label: t('designer.toolbar.align.center'), icon: AlignHorizontalJustifyCenter },
  { type: 'right', label: t('designer.toolbar.align.right'), icon: AlignHorizontalJustifyEnd },
  { type: 'top', label: t('designer.toolbar.align.top'), icon: AlignVerticalJustifyStart },
  { type: 'middle', label: t('designer.toolbar.align.middle'), icon: AlignVerticalJustifyCenter },
  { type: 'bottom', label: t('designer.toolbar.align.bottom'), icon: AlignVerticalJustifyEnd },
])
</script>

<template>
  <div class="designer-toolbar bpmn-toolbar flex items-center gap-1">
    <el-button
      text
      :disabled="!ready"
      :icon="Back"
      :aria-label="t('designer.toolbar.back')"
      data-testid="back-to-models"
      @click="emit('back')"
    />
    <el-button-group>
      <el-button
        type="primary"
        :disabled="!ready || saving"
        :loading="saving"
        data-testid="save-model"
        @click="emit('save')"
      >
        {{ t('designer.toolbar.save') }}
      </el-button>
      <el-dropdown :disabled="!ready || saving" trigger="click">
        <el-button
          type="primary"
          :disabled="!ready || saving"
          data-testid="save-model-menu"
          :aria-label="t('designer.toolbar.saveOptions')"
          :title="t('designer.toolbar.saveOptions')"
          :icon="ArrowDown"
        />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item data-testid="save-new-version" :icon="GitBranch" @click="emit('saveNewVersion')">
              {{ t('designer.toolbar.saveNewVersion') }}
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </el-button-group>

    <span class="toolbar-divider" />

    <el-button text :icon="View" :disabled="!ready" @click="emit('preview')">
      {{ t('designer.toolbar.preview') }}
    </el-button>

    <span class="toolbar-divider" />

    <el-button
      text
      :type="simulationActive ? 'success' : ''"
      :icon="simulationActive ? VideoPause : VideoPlay"
      :disabled="!ready"
      @click="emit('simulate')"
    >
      {{ simulationActive ? t('designer.toolbar.exitSimulation') : t('designer.toolbar.simulation') }}
    </el-button>
    <el-badge :value="problemCount" :hidden="problemCount === 0" type="danger">
      <el-button text :icon="CircleCheck" :disabled="!ready" @click="emit('validate')">
        {{ t('designer.toolbar.validate') }}
      </el-button>
    </el-badge>

    <el-dropdown :disabled="!ready || simulationActive" trigger="click">
      <el-button
        :icon="AlignHorizontalJustifyCenter"
        :aria-label="t('designer.toolbar.alignSelection')"
        :title="t('designer.toolbar.alignSelection')"
      />
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item
            v-for="item in alignments"
            :key="item.type"
            :icon="item.icon"
            @click="emit('align', item.type)"
          >
            {{ item.label }}
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <div class="toolbar-spacer flex-1" />

    <el-button-group>
      <el-tooltip :content="t('designer.toolbar.undo')" placement="bottom">
        <el-button :icon="RefreshLeft" :disabled="!canUndo || simulationActive" @click="emit('undo')" />
      </el-tooltip>
      <el-tooltip :content="t('designer.toolbar.redo')" placement="bottom">
        <el-button :icon="RefreshRight" :disabled="!canRedo || simulationActive" @click="emit('redo')" />
      </el-tooltip>
    </el-button-group>

    <el-button-group>
      <el-button :icon="ZoomOut" :disabled="!ready" @click="emit('zoomOut')" />
      <el-button class="zoom-value" :disabled="!ready">{{ Math.round(zoom * 100) }}%</el-button>
      <el-button :icon="ZoomIn" :disabled="!ready" @click="emit('zoomIn')" />
      <el-tooltip :content="t('designer.toolbar.fit')" placement="bottom">
        <el-button :icon="Aim" :disabled="!ready" @click="emit('fit')" />
      </el-tooltip>
      <el-tooltip :content="t('designer.toolbar.fullscreen')" placement="bottom">
        <el-button :icon="FullScreen" :disabled="!ready" @click="emit('fullscreen')" />
      </el-tooltip>
    </el-button-group>
  </div>
</template>

<style scoped>
.designer-toolbar {
  min-height: 48px;
  padding: 6px 14px;
  border-bottom: 1px solid var(--app-border);
  background: #fff;
  box-shadow: 0 2px 8px rgb(16 24 40 / 3%);
  z-index: 5;
}

.designer-toolbar :deep(.el-button + .el-button) {
  margin-left: 0;
}

.zoom-value {
  min-width: 62px;
  color: #475467;
  cursor: default;
}

@media (max-width: 767px) {
  .designer-toolbar {
    flex: 0 0 auto;
    height: 48px;
    max-height: 48px;
    overflow-x: auto;
    padding-inline: 8px;
    scrollbar-width: none;
  }

  .designer-toolbar::-webkit-scrollbar { display: none; }
  .toolbar-spacer { display: none; }
}
</style>
