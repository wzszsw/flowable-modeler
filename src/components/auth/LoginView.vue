<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'
import { LockKeyhole, UserRound, Workflow } from 'lucide-vue-next'

interface LoginForm {
  username: string
  password: string
}

defineProps<{
  error: string
}>()

const emit = defineEmits<{
  login: [credentials: LoginForm]
}>()

const formRef = ref<FormInstance>()
const form = reactive<LoginForm>({ username: '', password: '' })
const rules: FormRules<LoginForm> = {
  username: [{ required: true, whitespace: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function submit() {
  if (!formRef.value) return
  try {
    if (!(await formRef.value.validate())) return
  } catch {
    return
  }
  const credentials = { username: form.username.trim(), password: form.password }
  form.password = ''
  emit('login', credentials)
}
</script>

<template>
  <main class="login-page" data-testid="login-page">
    <header class="login-header">
      <div class="brand">
        <span class="brand-mark" aria-hidden="true"><Workflow :size="22" /></span>
        <span>
          <strong>Flowable</strong>
          <small>MODELER</small>
        </span>
      </div>
    </header>

    <section class="login-panel" aria-labelledby="login-title">
      <div class="panel-heading">
        <h1 id="login-title">登录 Flowable Modeler</h1>
        <p>流程模型工作台</p>
      </div>

      <el-alert
        v-if="error"
        class="login-error"
        type="error"
        :title="error"
        :closable="false"
        show-icon
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        size="large"
        @submit.prevent="submit"
      >
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="form.username"
            :prefix-icon="UserRound"
            autocomplete="username"
            autofocus
            data-testid="login-username"
          />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            :prefix-icon="LockKeyhole"
            type="password"
            autocomplete="current-password"
            show-password
            data-testid="login-password"
          />
        </el-form-item>
        <el-button
          class="login-submit"
          type="primary"
          native-type="submit"
          data-testid="login-submit"
        >
          登录
        </el-button>
      </el-form>
    </section>

    <footer>Flowable Modeler</footer>
  </main>
</template>

<style scoped>
.login-page {
  display: grid;
  width: 100%;
  height: 100%;
  grid-template-rows: 66px 1fr 52px;
  overflow-y: auto;
  color: #263238;
  background: #f4f6f8;
}

.login-header {
  display: flex;
  align-items: center;
  padding: 0 32px;
  color: #fff;
  background: #1f4b74;
  box-shadow: 0 2px 7px rgb(16 24 40 / 16%);
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
}

.brand-mark {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 36%);
  border-radius: 5px;
  background: #2d79ad;
}

.brand > span:last-child {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.brand strong {
  font-size: 21px;
  font-weight: 600;
}

.brand small {
  color: #b9d5e8;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0;
}

.login-panel {
  align-self: center;
  justify-self: center;
  width: min(400px, calc(100% - 32px));
  padding: 34px 38px 38px;
  border: 1px solid #dce3e8;
  border-radius: 6px;
  background: #fff;
  box-shadow: 0 12px 32px rgb(38 50 56 / 10%);
}

.panel-heading {
  margin-bottom: 26px;
  text-align: center;
}

.panel-heading h1 {
  margin: 0;
  color: #263238;
  font-size: 21px;
  font-weight: 600;
  letter-spacing: 0;
}

.panel-heading p {
  margin: 7px 0 0;
  color: #78909c;
  font-size: 13px;
}

.login-error {
  margin-bottom: 18px;
}

.login-submit {
  width: 100%;
  margin-top: 5px;
}

.login-page footer {
  align-self: center;
  color: #90a4ae;
  font-size: 11px;
  text-align: center;
}

@media (max-width: 560px) {
  .login-page {
    grid-template-rows: 58px minmax(360px, 1fr) 42px;
  }

  .login-header {
    padding: 0 18px;
  }

  .brand-mark {
    width: 34px;
    height: 34px;
  }

  .login-panel {
    padding: 28px 24px 30px;
  }
}
</style>
