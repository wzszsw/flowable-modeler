<template>
  <div
    class="route-loading"
    data-testid="route-resolving"
    role="status"
    aria-label="正在载入页面"
  >
    <span aria-hidden="true" />
  </div>
</template>

<style scoped>
.route-loading {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  background: #f4f6f8;
}

.route-loading span {
  width: 34px;
  height: 34px;
  border: 3px solid #d0d5dd;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: route-spin 0.8s linear infinite;
}

@keyframes route-spin {
  to { transform: rotate(360deg); }
}
</style>
