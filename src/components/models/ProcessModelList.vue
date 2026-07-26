<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowUpDown,
  ChevronDown,
  Database,
  FileText,
  FolderOpen,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRound,
  Workflow,
} from 'lucide-vue-next'
import { useI18n } from 'vue-i18n'

import LanguageSwitcher from '@/components/common/LanguageSwitcher.vue'
import { FLOWABLE_BACKEND_ENABLED } from '@/config/features'
import { parseBpmnMetadata } from '@/modeler/bpmnMetadata'
import type { ModelSort, ProcessModel, ProcessModelQuery } from '@/modeler/modelerApi'

interface ModelCreatePayload {
  name: string
  key: string
  description: string
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
  models: readonly ProcessModel[]
  total: number
  username: string
}>()

const emit = defineEmits<{
  create: [model: ModelCreatePayload]
  import: [model: ModelImportPayload]
  open: [id: string]
  delete: [id: string]
  queryChange: [query: ProcessModelQuery]
  refresh: []
  logout: []
}>()

const { locale, t } = useI18n()
const backendEnabled = FLOWABLE_BACKEND_ENABLED
const SEARCH_DEBOUNCE_MS = 500
const PROCESS_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

const searchQuery = ref('')
const sortMode = ref<ModelSort>('modifiedDesc')
const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()
const importInputRef = ref<HTMLInputElement>()
const createForm = reactive<ModelCreateForm>({
  name: '',
  key: '',
  description: '',
})

const createRules = computed<FormRules<ModelCreateForm>>(() => ({
  name: [
    {
      required: true,
      whitespace: true,
      message: t('shell.models.nameRequired'),
      trigger: 'blur',
    },
  ],
  key: [
    {
      required: true,
      whitespace: true,
      message: t('shell.models.keyRequired'),
      trigger: 'blur',
    },
    {
      pattern: PROCESS_KEY_PATTERN,
      message: t('shell.models.keyPattern'),
      trigger: 'blur',
    },
  ],
}))

const sortOptions = computed<Array<{ value: ModelSort; label: string }>>(() => [
  { value: 'modifiedDesc', label: t('shell.models.sort.modifiedDesc') },
  { value: 'modifiedAsc', label: t('shell.models.sort.modifiedAsc') },
  { value: 'nameAsc', label: t('shell.models.sort.nameAsc') },
  { value: 'nameDesc', label: t('shell.models.sort.nameDesc') },
])

const modelCountLabel = computed(() => t('shell.models.count', props.total))

let searchTimer: ReturnType<typeof setTimeout> | undefined

function currentQuery(): ProcessModelQuery {
  return { filterText: searchQuery.value.trim(), sort: sortMode.value }
}

function clearSearchTimer() {
  if (searchTimer === undefined) return
  clearTimeout(searchTimer)
  searchTimer = undefined
}

watch(searchQuery, () => {
  clearSearchTimer()
  searchTimer = setTimeout(() => {
    searchTimer = undefined
    emit('queryChange', currentQuery())
  }, SEARCH_DEBOUNCE_MS)
})

watch(sortMode, () => {
  clearSearchTimer()
  emit('queryChange', currentQuery())
})
watch(locale, () => createFormRef.value?.clearValidate())
onBeforeUnmount(clearSearchTimer)

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

function formatDateTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : dateTimeFormatter.value.format(timestamp)
}

function resetCreateForm() {
  createForm.name = ''
  createForm.key = ''
  createForm.description = ''
  createFormRef.value?.clearValidate()
}

function openCreateDialog() {
  resetCreateForm()
  createDialogVisible.value = true
  void nextTick(() => createFormRef.value?.clearValidate())
}

async function submitCreate() {
  if (!createFormRef.value) return
  try {
    const valid = await createFormRef.value.validate()
    if (!valid) return
  } catch {
    return
  }

  emit('create', {
    name: createForm.name.trim(),
    key: createForm.key.trim(),
    description: createForm.description.trim(),
  })
  createDialogVisible.value = false
}

function chooseImportFile() {
  importInputRef.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  try {
    const xml = await file.text()
    const metadata = parseBpmnMetadata(xml)
    emit('import', {
      xml,
      fileName: file.name || `${metadata.key}.bpmn20.xml`,
      ...metadata,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : t('shell.models.fileReadFailed')
    ElMessage.error(t('shell.models.importError', { detail }))
  }
}

async function confirmDelete(model: ProcessModel) {
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
  emit('delete', model.id)
}

function handleUserCommand(command: string | number | object) {
  if (command === 'logout') emit('logout')
}
</script>

<template>
  <div class="model-list-page" data-testid="process-model-list-page">
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
          <el-dropdown v-if="backendEnabled" trigger="click" @command="handleUserCommand">
            <button
              type="button"
              class="user-menu-trigger"
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
      <div class="list-heading">
        <div>
          <h1>{{ t('shell.models.title') }}</h1>
          <p>{{ modelCountLabel }}</p>
        </div>
        <div class="model-actions">
          <el-tooltip :content="t('shell.models.refresh')" placement="bottom">
            <el-button
              :icon="RefreshCw"
              circle
              :aria-label="t('shell.models.refresh')"
              data-testid="refresh-models"
              @click="emit('refresh')"
            />
          </el-tooltip>
          <el-button
            data-testid="import-model"
            :icon="Upload"
            :aria-label="t('shell.models.import')"
            @click="chooseImportFile"
          >
            {{ t('shell.models.import') }}
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            data-testid="create-model"
            :aria-label="t('shell.models.createAria')"
            @click="openCreateDialog"
          >
            {{ t('shell.models.create') }}
          </el-button>
        </div>
      </div>

      <div class="list-controls">
        <el-input
          v-model="searchQuery"
          class="search-input"
          :prefix-icon="Search"
          clearable
          data-testid="model-search"
          :placeholder="t('shell.models.search')"
          :aria-label="t('shell.models.searchAria')"
        />
        <el-select
          v-model="sortMode"
          class="sort-select"
          data-testid="model-sort"
          :aria-label="t('shell.models.sortAria')"
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

      <section
        class="model-list"
        data-testid="model-list"
        :aria-label="t('shell.models.listAria')"
      >
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
        >
          <button
            type="button"
            class="model-identity"
            data-testid="model-primary-open"
            :aria-label="t('shell.models.openAria', { name: model.name })"
            @click="emit('open', model.id)"
          >
            <span class="model-icon" aria-hidden="true"><FileText :size="19" /></span>
            <span class="model-copy">
              <strong data-testid="model-title">{{ model.name }}</strong>
              <span>
                {{ model.description || t('shell.models.version', { version: model.version }) }}
              </span>
            </span>
          </button>
          <time :datetime="model.lastUpdated" data-testid="model-updated-at">
            {{ formatDateTime(model.lastUpdated) }}
          </time>
          <div class="row-actions">
            <el-button
              text
              :icon="FolderOpen"
              data-testid="open-model"
              :aria-label="t('shell.models.openAria', { name: model.name })"
              @click.stop="emit('open', model.id)"
            >
              {{ t('shell.models.open') }}
            </el-button>
            <el-tooltip :content="t('shell.models.delete')" placement="top">
              <el-button
                text
                type="danger"
                :icon="Trash2"
                data-testid="delete-model"
                :aria-label="t('shell.models.deleteAria', { name: model.name })"
                @click.stop="confirmDelete(model)"
              />
            </el-tooltip>
          </div>
        </div>

        <div v-if="!models.length" class="empty-state" data-testid="model-list-empty">
          <el-empty
            :description="searchQuery ? t('shell.models.noMatches') : t('shell.models.empty')"
            :image-size="92"
          >
            <el-button v-if="searchQuery" @click="searchQuery = ''">
              {{ t('shell.models.clearSearch') }}
            </el-button>
            <div v-else class="empty-actions">
              <el-button
                :icon="Upload"
                data-testid="empty-import-model"
                :aria-label="t('shell.models.import')"
                @click="chooseImportFile"
              >
                {{ t('shell.models.import') }}
              </el-button>
              <el-button
                type="primary"
                :icon="Plus"
                :aria-label="t('shell.models.createAria')"
                @click="openCreateDialog"
              >
                {{ t('shell.models.create') }}
              </el-button>
            </div>
          </el-empty>
        </div>
      </section>
    </main>

    <input
      ref="importInputRef"
      class="visually-hidden"
      type="file"
      accept=".bpmn,.xml,.bpmn20.xml,application/xml,text/xml"
      data-testid="model-import-input"
      @change="handleImportFile"
    />

    <el-dialog
      v-model="createDialogVisible"
      class="model-create-dialog"
      width="min(520px, calc(100vw - 32px))"
      :title="t('shell.models.createDialogTitle')"
      data-testid="model-create-dialog"
      :teleported="false"
      @closed="resetCreateForm"
    >
      <el-form
        ref="createFormRef"
        :model="createForm"
        :rules="createRules"
        label-position="top"
        @submit.prevent="submitCreate"
      >
        <el-form-item :label="t('shell.models.name')" prop="name">
          <el-input
            v-model="createForm.name"
            data-testid="model-create-name"
            maxlength="120"
            show-word-limit
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item :label="t('shell.models.key')" prop="key">
          <el-input
            v-model="createForm.key"
            data-testid="model-create-key"
            maxlength="120"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item :label="t('shell.models.description')" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            resize="none"
            data-testid="model-create-description"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">{{ t('shell.common.cancel') }}</el-button>
        <el-button
          type="primary"
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
.model-list-page {
  width: 100%;
  height: 100%;
  overflow: auto;
  color: #172033;
  background: #f7f8fb;
}

.page-header {
  border-bottom: 1px solid #e4e7ec;
  background: #fff;
  box-shadow: 0 2px 8px rgb(16 24 40 / 3%);
}

.header-inner {
  display: flex;
  width: min(1180px, calc(100% - 40px));
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  margin: 0 auto;
  gap: 24px;
}

.brand-block {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.brand-block > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border-radius: 8px;
  color: #fff;
  background: #2563eb;
}

.brand-title {
  color: #101828;
  font-size: 15px;
  font-weight: 700;
}

.brand-subtitle {
  margin-top: 2px;
  color: #98a2b3;
  font-size: 11px;
}

.header-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.header-divider {
  width: 1px;
  height: 24px;
  margin: 0 2px;
  background: #e4e7ec;
}

.user-menu-trigger {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 3px 7px 3px 3px;
  border: 1px solid transparent;
  border-radius: 6px;
  gap: 8px;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.user-menu-trigger:hover {
  border-color: #e4e7ec;
  background: #f9fafb;
}

.user-menu-trigger:focus-visible {
  border-color: #84adff;
  outline: 2px solid #d1e0ff;
  outline-offset: 1px;
}

.local-mode-indicator {
  cursor: default;
}

.local-mode-indicator:hover {
  border-color: transparent;
  background: transparent;
}

.user-avatar {
  display: grid;
  width: 30px;
  height: 30px;
  flex: 0 0 30px;
  place-items: center;
  border: 1px solid #c7d7fe;
  border-radius: 50%;
  color: #175cd3;
  background: #eff4ff;
}

.signed-in-user {
  overflow: hidden;
  max-width: 140px;
  color: #344054;
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-menu-chevron {
  flex: 0 0 auto;
  color: #98a2b3;
}

.logout-menu-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.header-actions :deep(.el-button + .el-button),
.model-actions :deep(.el-button + .el-button),
.row-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.page-main {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: 34px 0 48px;
}

.list-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 24px;
}

.list-heading h1 {
  margin: 0;
  color: #101828;
  font-size: 22px;
  font-weight: 650;
  letter-spacing: 0;
}

.list-heading p {
  margin: 5px 0 0;
  color: #667085;
  font-size: 13px;
}

.list-controls {
  display: flex;
  width: min(100%, 580px);
  align-items: center;
  justify-content: flex-end;
  margin: 0 0 14px auto;
  gap: 10px;
}

.model-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.search-input {
  min-width: 220px;
  flex: 1;
}

.sort-select {
  width: 220px;
  flex: 0 0 220px;
}

.model-list {
  position: relative;
  min-height: 360px;
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fff;
}

.table-heading,
.model-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) 180px 132px;
  align-items: center;
  column-gap: 20px;
}

.table-heading {
  min-height: 42px;
  padding: 0 18px;
  border-bottom: 1px solid #eaecf0;
  color: #667085;
  background: #f9fafb;
  font-size: 12px;
  font-weight: 600;
}

.model-row {
  min-height: 78px;
  padding: 12px 18px;
  border-bottom: 1px solid #eaecf0;
}

.model-row:last-child {
  border-bottom: 0;
}

.model-row:hover {
  background: #f7faff;
}

.model-identity {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  padding: 0;
  border: 0;
  gap: 12px;
  color: inherit;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.model-identity:focus-visible {
  border-radius: 4px;
  outline: 2px solid #84adff;
  outline-offset: 4px;
}

.model-icon {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 38px;
  place-items: center;
  border: 1px solid #c7d7fe;
  border-radius: 7px;
  color: #175cd3;
  background: #eff4ff;
}

.model-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.model-copy strong,
.model-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-copy strong {
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
}

.model-copy span {
  color: #98a2b3;
  font-size: 12px;
}

.model-row time {
  color: #667085;
  font-size: 12px;
  white-space: nowrap;
}

.row-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 2px;
}

.empty-state {
  display: grid;
  min-height: 360px;
  place-items: center;
}

.empty-actions {
  display: flex;
  justify-content: center;
  gap: 8px;
}

.empty-actions :deep(.el-button + .el-button) {
  margin-left: 0;
}

.visually-hidden {
  position: fixed;
  width: 1px;
  height: 1px;
  padding: 0;
  border: 0;
  margin: -1px;
  clip: rect(0, 0, 0, 0);
  overflow: hidden;
  white-space: nowrap;
}

.model-create-dialog :deep(.el-form-item:last-child) {
  margin-bottom: 0;
}

@media (max-width: 840px) {
  .header-inner,
  .page-main {
    width: calc(100% - 28px);
  }

  .page-main {
    padding-top: 24px;
  }

  .list-heading {
    align-items: stretch;
    flex-direction: column;
    gap: 14px;
  }

  .model-actions {
    justify-content: flex-start;
  }

  .list-controls {
    width: 100%;
  }

  .table-heading {
    display: none;
  }

  .model-row {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 78px;
  }

  .model-identity {
    grid-column: 1;
  }

  .model-row time {
    display: none;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 1;
  }
}

@media (max-width: 560px) {
  .header-inner {
    min-height: 58px;
    gap: 8px;
  }

  .brand-mark {
    width: 32px;
    height: 32px;
    flex-basis: 32px;
  }

  .brand-block {
    gap: 7px;
  }

  .brand-title {
    font-size: 13px;
  }

  .brand-subtitle {
    display: none;
  }

  .header-actions {
    gap: 4px;
  }

  .header-divider {
    margin-inline: 1px;
  }

  .signed-in-user {
    max-width: 72px;
  }

  .list-controls {
    align-items: stretch;
    flex-direction: column;
  }

  .search-input,
  .sort-select {
    width: 100%;
    min-width: 0;
    flex-basis: auto;
  }

  .model-actions {
    width: 100%;
  }

  .model-row {
    padding-inline: 13px;
    column-gap: 8px;
  }

  .row-actions :deep(.el-button span) {
    display: none;
  }
}
</style>
