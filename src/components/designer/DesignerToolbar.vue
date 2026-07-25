<script setup lang="ts">
import {
  Aim,
  Back,
  CircleCheck,
  Document,
  Download,
  FullScreen,
  RefreshLeft,
  RefreshRight,
  Upload,
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
} from 'lucide-vue-next'

type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom'

defineProps<{
  ready: boolean
  canUndo: boolean
  canRedo: boolean
  zoom: number
  simulationActive: boolean
  problemCount: number
  embedded: boolean
  saving: boolean
}>()

const emit = defineEmits<{
  back: []
  save: []
  import: []
  exportXml: []
  exportSvg: []
  preview: []
  showXml: []
  validate: []
  exportPng: []
  simulate: []
  undo: []
  redo: []
  zoomIn: []
  zoomOut: []
  fit: []
  fullscreen: []
  align: [alignment: Alignment]
}>()

const alignments: Array<{
  type: Alignment
  label: string
  icon: typeof AlignHorizontalJustifyStart
}> = [
  { type: 'left', label: '左对齐', icon: AlignHorizontalJustifyStart },
  { type: 'center', label: '水平居中', icon: AlignHorizontalJustifyCenter },
  { type: 'right', label: '右对齐', icon: AlignHorizontalJustifyEnd },
  { type: 'top', label: '顶部对齐', icon: AlignVerticalJustifyStart },
  { type: 'middle', label: '垂直居中', icon: AlignVerticalJustifyCenter },
  { type: 'bottom', label: '底部对齐', icon: AlignVerticalJustifyEnd },
]
</script>

<template>
  <div class="designer-toolbar bpmn-toolbar flex items-center gap-1" :class="{ 'is-embedded': embedded }">
    <template v-if="!embedded">
      <el-button
        text
        :icon="Back"
        :disabled="!ready"
        data-testid="back-to-models"
        @click="emit('back')"
      >
        返回模型
      </el-button>
      <el-button
        type="primary"
        :disabled="!ready || saving"
        :loading="saving"
        data-testid="save-model"
        @click="emit('save')"
      >
        保存模型
      </el-button>

      <span class="toolbar-divider" />
    </template>

    <el-button text :icon="Upload" :disabled="!ready" @click="emit('import')">导入</el-button>
    <el-dropdown :disabled="!ready" trigger="click">
      <el-button text :icon="Download">导出</el-button>
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item :icon="Download" @click="emit('exportXml')">
            BPMN 2.0 XML
          </el-dropdown-item>
          <el-dropdown-item :icon="View" @click="emit('exportSvg')">SVG 图片</el-dropdown-item>
          <el-dropdown-item :icon="View" @click="emit('exportPng')">PNG 图片</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>
    <el-button text :icon="View" :disabled="!ready" @click="emit('preview')">预览</el-button>
    <el-button text :icon="Document" :disabled="!ready" @click="emit('showXml')">XML</el-button>

    <span class="toolbar-divider" />

    <el-button
      text
      :type="simulationActive ? 'success' : ''"
      :icon="simulationActive ? VideoPause : VideoPlay"
      :disabled="!ready"
      @click="emit('simulate')"
    >
      {{ simulationActive ? '退出模拟' : '流程模拟' }}
    </el-button>
    <el-badge :value="problemCount" :hidden="problemCount === 0" type="danger">
      <el-button text :icon="CircleCheck" :disabled="!ready" @click="emit('validate')">
        校验
      </el-button>
    </el-badge>

    <el-dropdown :disabled="!ready || simulationActive" trigger="click">
      <el-button
        :icon="AlignHorizontalJustifyCenter"
        aria-label="对齐所选元素"
        title="对齐所选元素"
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
      <el-tooltip content="撤销 Ctrl+Z" placement="bottom">
        <el-button :icon="RefreshLeft" :disabled="!canUndo || simulationActive" @click="emit('undo')" />
      </el-tooltip>
      <el-tooltip content="重做 Ctrl+Y" placement="bottom">
        <el-button :icon="RefreshRight" :disabled="!canRedo || simulationActive" @click="emit('redo')" />
      </el-tooltip>
    </el-button-group>

    <el-button-group>
      <el-button :icon="ZoomOut" :disabled="!ready" @click="emit('zoomOut')" />
      <el-button class="zoom-value" :disabled="!ready">{{ Math.round(zoom * 100) }}%</el-button>
      <el-button :icon="ZoomIn" :disabled="!ready" @click="emit('zoomIn')" />
      <el-tooltip content="适应画布" placement="bottom">
        <el-button :icon="Aim" :disabled="!ready" @click="emit('fit')" />
      </el-tooltip>
      <el-tooltip content="全屏" placement="bottom">
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

.designer-toolbar.is-embedded {
  min-height: 42px;
  padding-block: 3px;
  box-shadow: none;
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
