export const FLOWABLE_BACKEND_ENABLED =
  import.meta.env.VITE_FLOWABLE_BACKEND_ENABLED?.trim().toLowerCase() === 'true'

export const FLOWABLE_FORMS_ENABLED =
  import.meta.env.VITE_FLOWABLE_FORMS_ENABLED?.trim().toLowerCase() === 'true'
