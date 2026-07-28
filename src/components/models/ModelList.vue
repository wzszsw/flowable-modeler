<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules, TabsPaneContext } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowUpDown,
  BriefcaseBusiness,
  ChevronDown,
  Database,
  Download,
  FileText,
  FolderOpen,
  GitBranch,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  TableProperties,
  Trash2,
  Upload,
  UserRound,
  Workflow,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import { FLOWABLE_BACKEND_ENABLED } from '@/config/features'
import { parseBpmnMetadata } from '@/modeler/bpmnMetadata'
import type { ModelerModel, ModelQuery, ModelSort } from '@/modeler/modelerApi'
import {
  MODEL_TYPES,
  modelTypesForCategory,
  type DecisionModelType,
  type ModelCategory,
  type ModelType,
} from '@/modeler/modelTypes'

interface ModelCreatePayload {
  name: string
  key: string
  description: string
  modelType: ModelType
}

interface ModelImportPayload extends ModelCreatePayload {
  xml: string
  fileName: string
}

interface ModelCreateForm {
  name: string
  key: string
  description: string
}

const props = defineProps<{
  models: readonly ModelerModel[]
  total: number
  username: string
  operationPending: boolean
  activeCategory: ModelCategory
  decisionType: DecisionModelType
}>()

const emit = defineEmits<{
  create: [model: ModelCreatePayload]
  import: [model: ModelImportPayload]
  open: [id: string]
  download: [id: string]
  delete: [id: string]
  queryChange: [query: ModelQuery]
  refresh: []
  logout: []
  categoryChange: [category: ModelCategory]
  decisionTypeChange: [modelType: DecisionModelType]
}>()

const { locale, t } = useI18n()
const backendEnabled = FLOWABLE_BACKEND_ENABLED
const SEARCH_DEBOUNCE_MS = 500
const MODEL_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

const searchQuery = ref('')
const sortMode = ref<ModelSort>('modifiedDesc')
const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()
const importInputRef = ref<HTMLInputElement>()
const createSubmitting = ref(false)
const importReading = ref(false)
const interactionPending = computed(
  () => props.operationPending || createSubmitting.value || importReading.value,
)
const createForm = reactive<ModelCreateForm>({ name: '', key: '', description: '' })

const activeModelType = computed<ModelType>(() =>
  props.activeCategory === 'decisions'
    ? props.decisionType
    : modelTypesForCategory(props.activeCategory)[0]!,
)
const supportsImport = computed(() => activeModelType.value === MODEL_TYPES.process)
const typeKey = computed(() => {
  if (activeModelType.value === MODEL_TYPES.case) return 'case'
  if (activeModelType.value === MODEL_TYPES.decisionTable) return 'decisionTable'
  if (activeModelType.value === MODEL_TYPES.decisionService) return 'decisionService'
  return 'process'
})

const createRules = computed<FormRules<ModelCreateForm>>(() => ({
  name: [{ required: true, whitespace: true, message: t('shell.models.nameRequired'), trigger: 'blur' }],
  key: [
    { required: true, whitespace: true, message: t('shell.models.keyRequired'), trigger: 'blur' },
    { pattern: MODEL_KEY_PATTERN, message: t('shell.models.keyPattern'), trigger: 'blur' },
  ],
}))

const sortOptions = computed(() => [
  { value: 'modifiedDesc' as const, label: t('shell.models.sort.modifiedDesc') },
  { value: 'modifiedAsc' as const, label: t('shell.models.sort.modifiedAsc') },
  { value: 'nameAsc' as const, label: t('shell.models.sort.nameAsc') },
  { value: 'nameDesc' as const, label: t('shell.models.sort.nameDesc') },
])
const decisionTypeOptions = computed(() => [
  { label: t('shell.modelTypes.decisionTable.plural'), value: MODEL_TYPES.decisionTable },
  { label: t('shell.modelTypes.decisionService.plural'), value: MODEL_TYPES.decisionService },
])
const title = computed(() => t(`shell.modelTypes.${typeKey.value}.plural`))
const modelCountLabel = computed(() =>
  t('shell.models.count', { count: props.total, type: title.value }),
)

let searchTimer: ReturnType<typeof setTimeout> | undefined
let queryDeferred = false
let importReadGeneration = 0
let disposed = false

function currentQuery(): ModelQuery {
  return {
    filterText: searchQuery.value.trim(),
    sort: sortMode.value,
    modelTypes: [activeModelType.value],
  }
}

function clearSearchTimer() {
  if (searchTimer === undefined) return
  clearTimeout(searchTimer)
  searchTimer = undefined
}

function emitCurrentQuery() {
  if (interactionPending.value) {
    queryDeferred = true
    return
  }
  queryDeferred = false
  emit('queryChange', currentQuery())
}

watch(searchQuery, () => {
  clearSearchTimer()
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    emitCurrentQuery()
  }, SEARCH_DEBOUNCE_MS)
})
watch(sortMode, () => {
  clearSearchTimer()
  emitCurrentQuery()
})
watch(interactionPending, (pending) => {
  if (!pending && queryDeferred) emitCurrentQuery()
})
watch(locale, () => createFormRef.value?.clearValidate())

onBeforeUnmount(() => {
  disposed = true
  importReadGeneration += 1
  clearSearchTimer()
})

const dateTimeFormatter = computed(
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

function formatDateTime(value: number) {
  return dateTimeFormatter.value.format(value)
}

function dateTimeAttribute(value: number) {
  return new Date(value).toISOString()
}

function resetCreateForm() {
  createForm.name = ''
  createForm.key = ''
  createForm.description = ''
  createFormRef.value?.clearValidate()
}

function openCreateDialog() {
  if (interactionPending.value) return
  resetCreateForm()
  createDialogVisible.value = true
  void nextTick(() => createFormRef.value?.clearValidate())
}

async function submitCreate() {
  if (interactionPending.value || !createFormRef.value) return
  createSubmitting.value = true
  try {
    try {
      if (!(await createFormRef.value.validate())) return
    } catch {
      return
    }
    if (disposed || props.operationPending || importReading.value) return
    emit('create', {
      name: createForm.name.trim(),
      key: createForm.key.trim(),
      description: createForm.description.trim(),
      modelType: activeModelType.value,
    })
  } finally {
    createSubmitting.value = false
  }
}

function chooseImportFile() {
  if (!supportsImport.value || interactionPending.value) return
  importInputRef.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !supportsImport.value || interactionPending.value) return

  const generation = ++importReadGeneration
  importReading.value = true
  try {
    const xml = await file.text()
    if (disposed || generation !== importReadGeneration || props.operationPending) return
    const metadata = parseBpmnMetadata(xml)
    emit('import', {
      xml,
      fileName: file.name || `${metadata.key}.bpmn20.xml`,
      ...metadata,
      modelType: MODEL_TYPES.process,
    })
  } catch (error) {
    if (disposed || generation !== importReadGeneration) return
    const detail = error instanceof Error ? error.message : t('shell.models.fileReadFailed')
    ElMessage.error(t('shell.models.importError', { detail }))
  } finally {
    if (generation === importReadGeneration) importReading.value = false
  }
}

function handleTabClick(tab: TabsPaneContext) {
  const category = String(tab.paneName) as ModelCategory
  if (!interactionPending.value && category !== props.activeCategory) {
    emit('categoryChange', category)
  }
}

function handleDecisionType(value: string | number | boolean) {
  const modelType = Number(value) as DecisionModelType
  if (!interactionPending.value && modelType !== props.decisionType) {
    emit('decisionTypeChange', modelType)
  }
}

async function confirmDelete(model: ModelerModel) {
  if (interactionPending.value) return
  try {
    await ElMessageBox.confirm(
      t('shell.models.deleteConfirm', { name: model.name }),
      t('shell.models.deleteTitle'),
      {
        type: 'warning',
        confirmButtonText: t('shell.common.delete'),
        cancelButtonText: t('shell.common.cancel'),
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  if (!interactionPending.value) emit('delete', model.id)
}

function handleUserCommand(command: string | number | object) {
  if (!interactionPending.value && command === 'logout') emit('logout')
}

function modelIcon(modelType: ModelType) {
  if (modelType === MODEL_TYPES.case) return BriefcaseBusiness
  if (modelType === MODEL_TYPES.decisionTable) return TableProperties
  if (modelType === MODEL_TYPES.decisionService) return GitBranch
  return FileText
}

function modelTypeLabel(modelType: ModelType) {
  if (modelType === MODEL_TYPES.case) return t('shell.modelTypes.case.singular')
  if (modelType === MODEL_TYPES.decisionTable) return t('shell.modelTypes.decisionTable.singular')
  if (modelType === MODEL_TYPES.decisionService) return t('shell.modelTypes.decisionService.singular')
  return t('shell.modelTypes.process.singular')
}
</script>

<template>
  <div class="model-list-page" data-testid="model-list-page">
    <header class="page-header">
      <div class="header-inner">
        <div class="brand-block">
          <span class="brand-mark" aria-hidden="true"><Workflow :size="20" /></span>
          <span>
            <span class="brand-title">Flowable Modeler</span>
            <span class="brand-subtitle">{{ t('shell.models.subtitle') }}</span>
          </span>
        </div>
        <div class="header-actions">
          <LanguageSwitcher />
          <span class="header-divider" aria-hidden="true" />
          <el-dropdown
            v-if="backendEnabled"
            :disabled="interactionPending"
            trigger="click"
            @command="handleUserCommand"
          >
            <button
              type="button"
              class="user-menu-trigger"
              :disabled="interactionPending"
              :title="username"
              :aria-label="username"
              data-testid="user-menu"
            >
              <span class="user-avatar" aria-hidden="true"><UserRound :size="16" /></span>
              <span class="signed-in-user">{{ username }}</span>
              <ChevronDown class="user-menu-chevron" :size="14" aria-hidden="true" />
            </button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="logout" data-testid="logout">
                  <span class="logout-menu-label">
                    <LogOut :size="16" aria-hidden="true" />
                    <span>{{ t('shell.models.logout') }}</span>
                  </span>
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <div v-else class="user-menu-trigger local-mode-indicator" data-testid="local-mode">
            <span class="user-avatar" aria-hidden="true"><Database :size="16" /></span>
            <span class="signed-in-user">{{ t('shell.models.localMode') }}</span>
          </div>
        </div>
      </div>
    </header>

    <main class="page-main">
      <el-tabs
        :model-value="activeCategory"
        class="model-category-tabs"
        data-testid="model-category-tabs"
        @tab-click="handleTabClick"
      >
        <el-tab-pane :label="t('shell.navigation.processes')" name="processes" />
        <el-tab-pane :label="t('shell.navigation.cases')" name="cases" />
        <el-tab-pane :label="t('shell.navigation.decisions')" name="decisions" />
      </el-tabs>

      <div class="list-heading">
        <div>
          <h1>{{ title }}</h1>
          <p>{{ modelCountLabel }}</p>
        </div>
        <div class="model-actions">
          <el-tooltip :content="t('shell.models.refresh')" placement="bottom">
            <el-button
              :icon="RefreshCw"
              circle
              :disabled="interactionPending"
              :aria-label="t('shell.models.refresh')"
              data-testid="refresh-models"
              @click="emit('refresh')"
            />
          </el-tooltip>
          <el-button
            v-if="supportsImport"
            data-testid="import-model"
            :icon="Upload"
            :loading="importReading"
            :disabled="interactionPending"
            @click="chooseImportFile"
          >
            {{ t('shell.models.import') }}
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            :loading="operationPending || createSubmitting"
            :disabled="interactionPending"
            data-testid="create-model"
            @click="openCreateDialog"
          >
            {{ t('shell.models.create', { type: modelTypeLabel(activeModelType) }) }}
          </el-button>
        </div>
      </div>

      <div class="list-controls">
        <el-segmented
          v-if="activeCategory === 'decisions'"
          :model-value="decisionType"
          :options="decisionTypeOptions"
          :disabled="interactionPending"
          data-testid="decision-type"
          @change="handleDecisionType"
        />
        <div class="control-spacer" />
        <el-input
          v-model="searchQuery"
          class="search-input"
          :disabled="interactionPending"
          :prefix-icon="Search"
          clearable
          data-testid="model-search"
          :placeholder="t('shell.models.search')"
        />
        <el-select
          v-model="sortMode"
          class="sort-select"
          :disabled="interactionPending"
          data-testid="model-sort"
        >
          <template #prefix><ArrowUpDown :size="15" /></template>
          <el-option
            v-for="option in sortOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>
      </div>

      <section class="model-list" data-testid="model-list" :aria-label="title">
        <div v-if="models.length" class="table-heading" aria-hidden="true">
          <span>{{ t('shell.models.columns.name') }}</span>
          <span>{{ t('shell.models.columns.modified') }}</span>
          <span>{{ t('shell.models.columns.actions') }}</span>
        </div>

        <div
          v-for="model in models"
          :key="model.id"
          class="model-row"
          data-testid="model-row"
          :data-model-id="model.id"
          :data-model-type="model.modelType"
        >
          <button
            type="button"
            class="model-identity"
            :disabled="interactionPending"
            data-testid="model-primary-open"
            @click="emit('open', model.id)"
          >
            <span class="model-icon" aria-hidden="true">
              <component :is="modelIcon(model.modelType)" :size="19" />
            </span>
            <span class="model-copy">
              <span class="model-name-line">
                <strong data-testid="model-title">{{ model.name }}</strong>
                <el-tag v-if="activeCategory === 'decisions'" size="small" effect="plain">
                  {{ modelTypeLabel(model.modelType) }}
                </el-tag>
              </span>
              <span>{{ model.description || t('shell.models.version', { version: model.version }) }}</span>
            </span>
          </button>
          <time :datetime="dateTimeAttribute(model.lastUpdated)" data-testid="model-updated-at">
            {{ formatDateTime(model.lastUpdated) }}
          </time>
          <div class="row-actions">
            <el-button
              text
              :icon="FolderOpen"
              :disabled="interactionPending"
              data-testid="open-model"
              @click.stop="emit('open', model.id)"
            >
              {{ t('shell.models.open') }}
            </el-button>
            <el-tooltip :content="t('shell.models.delete')" placement="top">
              <el-button
                text
                type="danger"
                :icon="Trash2"
                :disabled="interactionPending"
                data-testid="delete-model"
                :aria-label="t('shell.models.deleteAria', { name: model.name })"
                @click.stop="confirmDelete(model)"
              />
            </el-tooltip>
            <el-tooltip :content="t('shell.models.download')" placement="top">
              <el-button
                text
                :icon="Download"
                :disabled="interactionPending"
                data-testid="download-model"
                :aria-label="t('shell.models.downloadAria', { name: model.name })"
                @click.stop="emit('download', model.id)"
              />
            </el-tooltip>
          </div>
        </div>

        <div v-if="!models.length" class="empty-state" data-testid="model-list-empty">
          <el-empty :description="searchQuery ? t('shell.models.noMatches', { type: title }) : t('shell.models.empty', { type: title })" :image-size="92">
            <el-button v-if="searchQuery" @click="searchQuery = ''">
              {{ t('shell.models.clearSearch') }}
            </el-button>
            <el-button v-else type="primary" :icon="Plus" :disabled="interactionPending" @click="openCreateDialog">
              {{ t('shell.models.create', { type: modelTypeLabel(activeModelType) }) }}
            </el-button>
          </el-empty>
        </div>
      </section>
    </main>

    <input
      v-if="supportsImport"
      ref="importInputRef"
      class="visually-hidden"
      type="file"
      :disabled="interactionPending"
      accept=".bpmn,.xml,.bpmn20.xml,application/xml,text/xml"
      data-testid="model-import-input"
      @change="handleImportFile"
    />

    <el-dialog
      v-model="createDialogVisible"
      class="model-create-dialog"
      width="min(520px, calc(100vw - 32px))"
      :title="t('shell.models.createDialogTitle', { type: modelTypeLabel(activeModelType) })"
      :close-on-click-modal="!interactionPending"
      :close-on-press-escape="!interactionPending"
      :show-close="!interactionPending"
      data-testid="model-create-dialog"
      :teleported="false"
      @closed="resetCreateForm"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        :disabled="interactionPending"
        label-position="top"
        @submit.prevent="submitCreate"
      >
        <el-form-item :label="t('shell.models.name')" prop="name">
          <el-input v-model="createForm.name" data-testid="model-create-name" maxlength="120" show-word-limit autocomplete="off" />
        </el-form-item>
        <el-form-item :label="t('shell.models.key')" prop="key">
          <el-input v-model="createForm.key" data-testid="model-create-key" maxlength="120" autocomplete="off" />
        </el-form-item>
        <el-form-item :label="t('shell.models.description')" prop="description">
          <el-input v-model="createForm.description" type="textarea" :rows="3" maxlength="500" show-word-limit resize="none" data-testid="model-create-description" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button :disabled="interactionPending" @click="createDialogVisible = false">
          {{ t('shell.common.cancel') }}
        </el-button>
        <el-button
          type="primary"
          :loading="operationPending || createSubmitting"
          :disabled="interactionPending"
          data-testid="confirm-create-model"
          @click="submitCreate"
        >
          {{ t('shell.models.createAndOpen') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.model-list-page { width: 100%; height: 100%; overflow: auto; color: #172033; background: #f7f8fb; }
.page-header { border-bottom: 1px solid #e4e7ec; background: #fff; box-shadow: 0 2px 8px rgb(16 24 40 / 3%); }
.header-inner { display: flex; width: min(1180px, calc(100% - 40px)); min-height: 64px; align-items: center; justify-content: space-between; margin: 0 auto; gap: 24px; }
.brand-block { display: flex; min-width: 0; align-items: center; gap: 10px; }
.brand-block > span:last-child { display: flex; min-width: 0; flex-direction: column; }
.brand-mark { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border-radius: 8px; color: #fff; background: #2563eb; }
.brand-title { color: #101828; font-size: 15px; font-weight: 700; }
.brand-subtitle { margin-top: 2px; color: #98a2b3; font-size: 11px; }
.header-actions, .model-actions, .row-actions { display: flex; align-items: center; gap: 8px; }
.header-divider { width: 1px; height: 24px; margin: 0 2px; background: #e4e7ec; }
.user-menu-trigger { display: flex; min-width: 0; align-items: center; padding: 3px 7px 3px 3px; border: 1px solid transparent; border-radius: 6px; gap: 8px; color: inherit; background: transparent; cursor: pointer; }
.user-menu-trigger:hover { border-color: #e4e7ec; background: #f9fafb; }
.user-menu-trigger:disabled, .model-identity:disabled { cursor: not-allowed; opacity: 0.6; }
.local-mode-indicator { cursor: default; }
.local-mode-indicator:hover { border-color: transparent; background: transparent; }
.user-avatar { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border: 1px solid #c7d7fe; border-radius: 50%; color: #175cd3; background: #eff4ff; }
.signed-in-user { overflow: hidden; max-width: 140px; color: #344054; font-size: 13px; font-weight: 500; text-overflow: ellipsis; white-space: nowrap; }
.user-menu-chevron { flex: 0 0 auto; color: #98a2b3; }
.logout-menu-label { display: inline-flex; align-items: center; gap: 8px; }
.page-main { width: min(1180px, calc(100% - 40px)); margin: 0 auto; padding: 18px 0 48px; }
.model-category-tabs { margin-bottom: 22px; }
.model-category-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.model-category-tabs :deep(.el-tabs__item) { min-width: 112px; font-size: 14px; font-weight: 600; }
.list-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; gap: 24px; }
.list-heading h1 { margin: 0; color: #101828; font-size: 22px; font-weight: 650; letter-spacing: 0; }
.list-heading p { margin: 5px 0 0; color: #667085; font-size: 13px; }
.model-actions { flex: 0 0 auto; justify-content: flex-end; }
.list-controls { display: flex; align-items: center; margin-bottom: 14px; gap: 10px; }
.control-spacer { min-width: 8px; flex: 1; }
.search-input { width: 280px; }
.sort-select { width: 220px; flex: 0 0 220px; }
.model-list { position: relative; min-height: 360px; overflow: hidden; border: 1px solid #e4e7ec; border-radius: 7px; background: #fff; }
.table-heading, .model-row { display: grid; grid-template-columns: minmax(260px, 1fr) 180px 176px; align-items: center; column-gap: 20px; }
.table-heading { min-height: 42px; padding: 0 18px; border-bottom: 1px solid #eaecf0; color: #667085; background: #f9fafb; font-size: 12px; font-weight: 600; }
.model-row { min-height: 78px; padding: 12px 18px; border-bottom: 1px solid #eaecf0; }
.model-row:last-child { border-bottom: 0; }
.model-row:hover { background: #f7faff; }
.model-identity { display: flex; width: 100%; min-width: 0; align-items: center; padding: 0; border: 0; gap: 12px; color: inherit; text-align: left; background: transparent; cursor: pointer; }
.model-icon { display: grid; width: 38px; height: 38px; flex: 0 0 38px; place-items: center; border: 1px solid #c7d7fe; border-radius: 7px; color: #175cd3; background: #eff4ff; }
.model-copy { display: flex; min-width: 0; flex-direction: column; gap: 4px; }
.model-name-line { display: flex; min-width: 0; align-items: center; gap: 8px; }
.model-copy strong, .model-copy > span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.model-copy strong { color: #1d2939; font-size: 14px; font-weight: 600; }
.model-copy > span:last-child { color: #98a2b3; font-size: 12px; }
.model-row time { color: #667085; font-size: 12px; white-space: nowrap; }
.row-actions { justify-content: flex-end; gap: 2px; }
.empty-state { display: grid; min-height: 360px; place-items: center; }
.visually-hidden { position: fixed; width: 1px; height: 1px; padding: 0; border: 0; margin: -1px; clip: rect(0, 0, 0, 0); overflow: hidden; white-space: nowrap; }
.model-create-dialog :deep(.el-form-item:last-child) { margin-bottom: 0; }
.header-actions :deep(.el-button + .el-button), .model-actions :deep(.el-button + .el-button), .row-actions :deep(.el-button + .el-button) { margin-left: 0; }

@media (max-width: 840px) {
  .header-inner, .page-main { width: calc(100% - 28px); }
  .list-heading { align-items: stretch; flex-direction: column; gap: 14px; }
  .model-actions { justify-content: flex-start; }
  .list-controls { align-items: stretch; flex-wrap: wrap; }
  .control-spacer { display: none; }
  .search-input { min-width: 220px; flex: 1; }
  .table-heading { display: none; }
  .model-row { grid-template-columns: minmax(0, 1fr) auto; }
  .model-row time { display: none; }
  .row-actions { grid-column: 2; grid-row: 1; }
}

@media (max-width: 560px) {
  .header-inner { min-height: 58px; gap: 8px; }
  .brand-mark { width: 32px; height: 32px; flex-basis: 32px; }
  .brand-subtitle { display: none; }
  .signed-in-user { max-width: 72px; }
  .model-category-tabs :deep(.el-tabs__item) { min-width: 0; padding-inline: 12px; }
  .list-controls { flex-direction: column; }
  .list-controls :deep(.el-segmented), .search-input, .sort-select { width: 100%; min-width: 0; flex-basis: auto; }
  .model-actions { width: 100%; flex-wrap: wrap; }
  .model-row { padding-inline: 13px; column-gap: 8px; }
  .row-actions :deep(.el-button span) { display: none; }
}
</style>
