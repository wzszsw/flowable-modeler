import { existsSync, readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { chromium } from 'playwright-core'

const port = 4175
const origin = `http://127.0.0.1:${port}`
const buildOutputDirectory = resolve(
  '..',
  '..',
  'IdeaProjects',
  'flowable-lab',
  'src',
  'main',
  'resources',
  'static',
  'flowable-modeler',
)

const browserCandidates =
  process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

const executablePath = browserCandidates.find(existsSync)
if (!executablePath) throw new Error('未找到 Chrome/Edge/Chromium，无法运行 IndexedDB 冒烟测试')

const builtIndexHtml = readFileSync(resolve(buildOutputDirectory, 'index.html'), 'utf8')
if (!builtIndexHtml.includes('id="app-bootstrap-loading"')) {
  throw new Error('生产 index.html 不完整')
}

const server =
  process.platform === 'win32'
    ? spawn(
        process.env.ComSpec || 'cmd.exe',
        ['/d', '/s', '/c', `npm run preview -- --host 127.0.0.1 --port ${port}`],
        { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] },
      )
    : spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })

let serverOutput = ''
server.stdout.on('data', (chunk) => (serverOutput += chunk.toString()))
server.stderr.on('data', (chunk) => (serverOutput += chunk.toString()))

async function waitForServer() {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 150))
  }
  throw new Error(`预览服务启动超时\n${serverOutput}`)
}

function stopServer() {
  if (server.killed) return
  if (process.platform === 'win32' && server.pid) {
    spawnSync('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' })
  } else {
    server.kill('SIGTERM')
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function storedModels(page) {
  return page.evaluate(
    () =>
      new Promise((resolvePromise, reject) => {
        const request = indexedDB.open('flowable-modeler', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('process-models', 'readonly')
          const modelsRequest = transaction.objectStore('process-models').getAll()
          modelsRequest.onerror = () => reject(modelsRequest.error)
          modelsRequest.onsuccess = () => resolvePromise(modelsRequest.result)
        }
      }),
  )
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true, executablePath })
  const context = await browser.newContext()
  const page = await context.newPage()
  const backendRequests = []
  const runtimeErrors = []

  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname.startsWith('/app/') || pathname.startsWith('/modeler-app/')) {
      backendRequests.push(`${request.method()} ${pathname}`)
    }
  })
  page.on('pageerror', (error) => runtimeErrors.push(error.stack || error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text())
  })

  await page.goto(origin, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  assert((await page.locator('[data-testid="login-page"]').count()) === 0, '本地模式仍显示登录页')
  assert((await page.locator('[data-testid="local-mode"]').count()) === 1, '缺少本地模式标识')

  await page.locator('[data-testid="create-model"]').click()
  await page
    .locator('input[data-testid="model-create-name"], [data-testid="model-create-name"] input')
    .fill('Local & Smoke')
  await page
    .locator('input[data-testid="model-create-key"], [data-testid="model-create-key"] input')
    .fill('Process_local_smoke')
  await page
    .locator(
      'textarea[data-testid="model-create-description"], [data-testid="model-create-description"] textarea',
    )
    .fill('IndexedDB model')
  await page.locator('[data-testid="confirm-create-model"]').click()
  await page.locator('.designer-shell').waitFor()
  await page.waitForFunction(() => window.bpmnModeler?.get('canvas').getRootElement())

  const createdModels = await storedModels(page)
  assert(
    createdModels.length === 1 &&
      createdModels[0].name === 'Local & Smoke' &&
      createdModels[0].editorModel?.properties?.process_id === 'Process_local_smoke',
    `新建模型未正确写入 IndexedDB：${JSON.stringify(createdModels)}`,
  )

  await page.evaluate(() => {
    const canvas = window.bpmnModeler.get('canvas')
    const modeling = window.bpmnModeler.get('modeling')
    modeling.updateProperties(canvas.getRootElement(), { name: 'Local & Saved' })
  })
  await page.locator('[data-testid="save-model"]').click()
  await page.waitForFunction(
    () =>
      new Promise((resolvePromise) => {
        const request = indexedDB.open('flowable-modeler', 1)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('process-models', 'readonly')
          const modelsRequest = transaction.objectStore('process-models').getAll()
          modelsRequest.onsuccess = () =>
            resolvePromise(modelsRequest.result[0]?.name === 'Local & Saved')
        }
      }),
  )

  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('.designer-shell').waitFor()
  await page.getByText('Local & Saved', { exact: true }).first().waitFor()
  await page.locator('[data-testid="back-to-models"]').click()
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await page.getByText('Local & Saved', { exact: true }).waitFor()
  assert(
    !(await page.locator('[data-testid="model-list"]').innerText()).includes('Process_local_smoke'),
    '本地模型列表仍显示流程标识',
  )

  const searchInput = page.locator(
    'input[data-testid="model-search"], [data-testid="model-search"] input',
  )
  await searchInput.fill('Process_local_smoke')
  await page.getByText('没有匹配的流程模型', { exact: true }).waitFor()
  await searchInput.clear()
  await page.getByText('Local & Saved', { exact: true }).waitFor()

  await page.locator('[data-testid="delete-model"]').click()
  await page.getByRole('button', { name: '删除', exact: true }).click()
  await page.getByText('还没有 BPMN 流程模型', { exact: true }).waitFor()
  assert((await storedModels(page)).length === 0, '删除后 IndexedDB 仍残留模型')
  assert(backendRequests.length === 0, `本地模式发起了后端请求：${backendRequests.join(', ')}`)
  assert(runtimeErrors.length === 0, `浏览器运行时错误：\n${runtimeErrors.join('\n')}`)

  console.log(JSON.stringify({ ok: true, storage: 'IndexedDB', backendRequests: 0 }, null, 2))
} finally {
  await browser?.close()
  stopServer()
}
