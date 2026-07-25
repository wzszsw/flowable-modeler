<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'

import BpmnDesigner from '@/components/designer/BpmnDesigner.vue'
import DraftList from '@/components/drafts/DraftList.vue'
import {
  DRAFTS_STORAGE_KEY,
  draftRepository,
  type BpmnDraft,
  type CreateBpmnDraftInput,
  type ImportBpmnDraftInput,
} from '@/modeler/draftRepository'
import { isEmbeddedMode } from '@/modeler/integration'

interface DraftSnapshot {
  xml: string
  fileName: string
  name: string
  key: string
}

const embeddedMode = isEmbeddedMode()
const drafts = ref<BpmnDraft[]>(embeddedMode ? [] : draftRepository.list())
const activeDraft = ref<BpmnDraft | null>(null)

function refreshDrafts() {
  drafts.value = draftRepository.list()
}

function reportError(error: unknown, fallback: string) {
  ElMessage.error(error instanceof Error ? error.message : fallback)
}

function createDraft(input: CreateBpmnDraftInput) {
  try {
    const draft = draftRepository.create(input)
    refreshDrafts()
    activeDraft.value = draft
  } catch (error) {
    reportError(error, '创建草稿失败')
  }
}

function importDraft(input: ImportBpmnDraftInput) {
  try {
    const draft = draftRepository.import(input)
    refreshDrafts()
    activeDraft.value = draft
    ElMessage.success(`已导入 ${draft.fileName}`)
  } catch (error) {
    reportError(error, '导入草稿失败')
  }
}

function openDraft(id: string) {
  const draft = draftRepository.get(id)
  if (!draft) {
    refreshDrafts()
    ElMessage.warning('草稿不存在或已在其他页面中删除')
    return
  }
  activeDraft.value = draft
}

function deleteDraft(id: string) {
  try {
    if (!draftRepository.delete(id)) {
      ElMessage.warning('草稿不存在或已删除')
      return
    }
    refreshDrafts()
    ElMessage.success('草稿已删除')
  } catch (error) {
    reportError(error, '删除草稿失败')
  }
}

async function persistActiveDraft(snapshot: DraftSnapshot) {
  const id = activeDraft.value?.id
  if (!id) throw new Error('当前草稿不存在，无法保存')

  const updated = draftRepository.update(id, snapshot)
  if (!updated) throw new Error('当前草稿已被删除，无法保存')
  activeDraft.value = updated
  refreshDrafts()
  return { savedAt: updated.updatedAt }
}

function closeEditor() {
  activeDraft.value = null
  refreshDrafts()
}

function handleStorage(event: StorageEvent) {
  if (!activeDraft.value && event.key === DRAFTS_STORAGE_KEY) refreshDrafts()
}

onMounted(() => {
  if (!embeddedMode) window.addEventListener('storage', handleStorage)
})

onBeforeUnmount(() => window.removeEventListener('storage', handleStorage))
</script>

<template>
  <BpmnDesigner v-if="embeddedMode" />
  <BpmnDesigner
    v-else-if="activeDraft"
    :key="activeDraft.id"
    :initial-xml="activeDraft.xml"
    :initial-file-name="activeDraft.fileName"
    :initial-saved-at="activeDraft.updatedAt"
    :persist-draft="persistActiveDraft"
    @close="closeEditor"
    @saved="refreshDrafts"
  />
  <DraftList
    v-else
    :drafts="drafts"
    @create="createDraft"
    @import="importDraft"
    @open="openDraft"
    @delete="deleteDraft"
  />
</template>
