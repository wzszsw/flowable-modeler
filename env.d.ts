/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FLOWABLE_BACKEND_ENABLED?: string
  readonly VITE_FLOWABLE_FORMS_ENABLED?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
