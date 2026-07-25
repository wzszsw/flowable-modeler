<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  ArrowUpDown,
  FileText,
  FolderOpen,
  Plus,
  Search,
  Trash2,
  Upload,
  Workflow,
} from 'lucide-vue-next'

import { parseBpmnMetadata } from '@/modeler/draftRepository'
import type { BpmnDraft } from '@/modeler/draftRepository'

type SortMode = 'updated-desc' | 'updated-asc' | 'name-asc' | 'name-desc'

interface DraftCreatePayload {
  name: string
  key: string
  description: string
}

interface DraftImportPayload extends DraftCreatePayload {
  xml: string
  fileName: string
}

interface DraftCreateForm {
  name: string
  key: string
  description: string
}

const props = defineProps<{
  drafts: readonly BpmnDraft[]
}>()

const emit = defineEmits<{
  create: [draft: DraftCreatePayload]
  import: [draft: DraftImportPayload]
  open: [id: string]
  delete: [id: string]
}>()

const DEFAULT_NAME = '请假审批流程'
const DEFAULT_KEY = 'Process_leave_request'
const PROCESS_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]*$/

const searchQuery = ref('')
const sortMode = ref<SortMode>('updated-desc')
const createDialogVisible = ref(false)
const createFormRef = ref<FormInstance>()
const importInputRef = ref<HTMLInputElement>()
const createForm = reactive<DraftCreateForm>({
  name: DEFAULT_NAME,
  key: DEFAULT_KEY,
  description: '',
})

const createRules: FormRules<DraftCreateForm> = {
  name: [{ required: true, whitespace: true, message: '请输入流程名称', trigger: 'blur' }],
  key: [
    { required: true, whitespace: true, message: '请输入流程标识', trigger: 'blur' },
    {
      pattern: PROCESS_KEY_PATTERN,
      message: '以字母或下划线开头，仅可包含字母、数字、点、短横线和下划线',
      trigger: 'blur',
    },
  ],
}

const sortOptions: Array<{ value: SortMode; label: string }> = [
  { value: 'updated-desc', label: '最近修改' },
  { value: 'updated-asc', label: '最早修改' },
  { value: 'name-asc', label: '名称 A-Z' },
  { value: 'name-desc', label: '名称 Z-A' },
]

const visibleDrafts = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  const drafts = query
    ? props.drafts.filter((draft) =>
        [draft.name, draft.key, draft.description, draft.fileName].some((value) =>
          value.toLocaleLowerCase().includes(query),
        ),
      )
    : [...props.drafts]

  return drafts.sort((left, right) => {
    if (sortMode.value === 'updated-desc') {
      return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
    }
    if (sortMode.value === 'updated-asc') {
      return Date.parse(left.updatedAt) - Date.parse(right.updatedAt)
    }
    const comparison = left.name.localeCompare(right.name, 'zh-CN', {
      numeric: true,
      sensitivity: 'base',
    })
    return sortMode.value === 'name-asc' ? comparison : -comparison
  })
})

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

function formatDateTime(value: string) {
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? value : dateTimeFormatter.format(timestamp)
}

function resetCreateForm() {
  createForm.name = DEFAULT_NAME
  createForm.key = DEFAULT_KEY
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
    const detail = error instanceof Error ? error.message : '无法读取 BPMN 文件'
    ElMessage.error(`导入失败：${detail}`)
  }
}

async function confirmDelete(draft: BpmnDraft) {
  try {
    await ElMessageBox.confirm(
      `删除后无法恢复，确定删除“${draft.name}”吗？`,
      '删除草稿',
      {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        confirmButtonClass: 'el-button--danger',
      },
    )
  } catch {
    return
  }
  emit('delete', draft.id)
}
</script>

<template>
  <div class="draft-list-page" data-testid="draft-list-page">
    <header class="page-header">
      <div class="header-inner">
        <div class="brand-block">
          <span class="brand-mark" aria-hidden="true"><Workflow :size="20" /></span>
          <span>
            <span class="brand-title">Flowable Modeler</span>
            <span class="brand-subtitle">BPMN 2.0 模型</span>
          </span>
        </div>
        <div class="header-actions">
          <el-button
            data-testid="import-draft"
            :icon="Upload"
            aria-label="导入 BPMN"
            @click="chooseImportFile"
          >
            导入 BPMN
          </el-button>
          <el-button
            type="primary"
            :icon="Plus"
            data-testid="create-draft"
            aria-label="新建 BPMN 流程"
            @click="openCreateDialog"
          >
            新建流程
          </el-button>
        </div>
      </div>
    </header>

    <main class="page-main">
      <div class="list-heading">
        <div>
          <h1>流程草稿</h1>
          <p>{{ drafts.length }} 个 BPMN 模型</p>
        </div>
        <div class="list-controls">
          <el-input
            v-model="searchQuery"
            class="search-input"
            :prefix-icon="Search"
            clearable
            data-testid="draft-search"
            placeholder="搜索名称、标识或描述"
            aria-label="搜索流程草稿"
          />
          <el-select
            v-model="sortMode"
            class="sort-select"
            data-testid="draft-sort"
            aria-label="草稿排序方式"
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
      </div>

      <section class="draft-list" data-testid="draft-list" aria-label="BPMN 草稿列表">
        <div v-if="visibleDrafts.length" class="table-heading" aria-hidden="true">
          <span>名称</span>
          <span>流程标识</span>
          <span>修改时间</span>
          <span>操作</span>
        </div>

        <div
          v-for="draft in visibleDrafts"
          :key="draft.id"
          class="draft-row"
          data-testid="draft-row"
          :data-draft-id="draft.id"
        >
          <button
            type="button"
            class="draft-identity"
            data-testid="draft-primary-open"
            :aria-label="`打开草稿 ${draft.name}`"
            @click="emit('open', draft.id)"
          >
            <span class="draft-icon" aria-hidden="true"><FileText :size="19" /></span>
            <span class="draft-copy">
              <strong data-testid="draft-title">{{ draft.name }}</strong>
              <span>{{ draft.description || draft.fileName }}</span>
            </span>
          </button>
          <code class="draft-key">{{ draft.key }}</code>
          <time :datetime="draft.updatedAt" data-testid="draft-updated-at">
            {{ formatDateTime(draft.updatedAt) }}
          </time>
          <div class="row-actions">
            <el-button
              text
              :icon="FolderOpen"
              data-testid="open-draft"
              :aria-label="`打开草稿 ${draft.name}`"
              @click.stop="emit('open', draft.id)"
            >
              打开
            </el-button>
            <el-tooltip content="删除草稿" placement="top">
              <el-button
                text
                type="danger"
                :icon="Trash2"
                data-testid="delete-draft"
                :aria-label="`删除草稿 ${draft.name}`"
                @click.stop="confirmDelete(draft)"
              />
            </el-tooltip>
          </div>
        </div>

        <div v-if="!visibleDrafts.length" class="empty-state" data-testid="draft-list-empty">
          <el-empty
            :description="drafts.length ? '没有匹配的流程草稿' : '还没有 BPMN 草稿'"
            :image-size="92"
          >
            <el-button v-if="drafts.length" @click="searchQuery = ''">清除搜索</el-button>
            <div v-else class="empty-actions">
              <el-button
                :icon="Upload"
                data-testid="empty-import-draft"
                aria-label="导入 BPMN"
                @click="chooseImportFile"
              >
                导入 BPMN
              </el-button>
              <el-button
                type="primary"
                :icon="Plus"
                aria-label="新建 BPMN 流程"
                @click="openCreateDialog"
              >
                新建流程
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
      data-testid="draft-import-input"
      @change="handleImportFile"
    />

    <el-dialog
      v-model="createDialogVisible"
      class="draft-create-dialog"
      width="min(520px, calc(100vw - 32px))"
      title="新建 BPMN 流程"
      data-testid="draft-create-dialog"
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
        <el-form-item label="流程名称" prop="name">
          <el-input
            v-model="createForm.name"
            data-testid="draft-create-name"
            maxlength="120"
            show-word-limit
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="流程标识" prop="key">
          <el-input
            v-model="createForm.key"
            data-testid="draft-create-key"
            maxlength="120"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item label="描述" prop="description">
          <el-input
            v-model="createForm.description"
            type="textarea"
            :rows="3"
            maxlength="500"
            show-word-limit
            resize="none"
            data-testid="draft-create-description"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button
          type="primary"
          data-testid="confirm-create-draft"
          @click="submitCreate"
        >
          创建并打开
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.draft-list-page {
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
  gap: 8px;
}

.header-actions :deep(.el-button + .el-button),
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
  align-items: end;
  justify-content: space-between;
  margin-bottom: 18px;
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
  width: min(100%, 510px);
  align-items: center;
  gap: 10px;
}

.search-input {
  min-width: 220px;
  flex: 1;
}

.sort-select {
  width: 146px;
  flex: 0 0 146px;
}

.draft-list {
  overflow: hidden;
  border: 1px solid #e4e7ec;
  border-radius: 7px;
  background: #fff;
}

.table-heading,
.draft-row {
  display: grid;
  grid-template-columns: minmax(260px, 1.6fr) minmax(170px, 0.9fr) 180px 132px;
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

.draft-row {
  min-height: 78px;
  padding: 12px 18px;
  border-bottom: 1px solid #eaecf0;
}

.draft-row:last-child {
  border-bottom: 0;
}

.draft-row:hover {
  background: #f7faff;
}

.draft-identity {
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

.draft-identity:focus-visible {
  border-radius: 4px;
  outline: 2px solid #84adff;
  outline-offset: 4px;
}

.draft-icon {
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

.draft-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.draft-copy strong,
.draft-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-copy strong {
  color: #1d2939;
  font-size: 14px;
  font-weight: 600;
}

.draft-copy span {
  color: #98a2b3;
  font-size: 12px;
}

.draft-key {
  overflow: hidden;
  color: #475467;
  font-family: "JetBrains Mono", Consolas, monospace;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.draft-row time {
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

.draft-create-dialog :deep(.el-form-item:last-child) {
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

  .list-controls {
    width: 100%;
  }

  .table-heading {
    display: none;
  }

  .draft-row {
    grid-template-columns: minmax(0, 1fr) auto;
    min-height: 96px;
    row-gap: 10px;
  }

  .draft-identity {
    grid-column: 1 / -1;
  }

  .draft-key {
    grid-column: 1;
    padding-left: 50px;
  }

  .draft-row time {
    display: none;
  }

  .row-actions {
    grid-column: 2;
    grid-row: 2;
  }
}

@media (max-width: 560px) {
  .header-inner {
    min-height: 58px;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
    flex-basis: 34px;
  }

  .brand-subtitle {
    display: none;
  }

  .header-actions :deep(.el-button) {
    padding-inline: 10px;
  }

  .header-actions :deep(.el-button span) {
    display: none;
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

  .draft-row {
    padding-inline: 13px;
    column-gap: 8px;
  }

  .draft-key {
    padding-left: 50px;
  }

  .row-actions :deep(.el-button span) {
    display: none;
  }
}
</style>
