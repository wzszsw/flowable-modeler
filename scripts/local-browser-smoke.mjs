import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const viteCli = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

const serviceTaskXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flowable="http://flowable.org/bpmn"
  id="Definitions_browser_service"
  targetNamespace="http://flowable.org/test">
  <bpmn:process id="Process_browser_service" name="Browser service regression" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_service" name="Legacy delegate" flowable:class="com.example.LegacyDelegate">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_2</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_service" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_service" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="Process_browser_service">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="160" y="122" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_service_di" bpmnElement="Task_service">
        <dc:Bounds x="250" y="100" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="405" y="122" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="196" y="140" />
        <di:waypoint x="250" y="140" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="350" y="140" />
        <di:waypoint x="405" y="140" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const delayedImportXml = serviceTaskXml
  .replaceAll('browser_service', 'delayed_import')
  .replace('Browser service regression', 'Delayed import regression')

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function findBrowserExecutable() {
  const configured = process.env.FLOWABLE_BROWSER_PATH
  const candidates = [
    configured,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] &&
      join(process.env['PROGRAMFILES(X86)'], 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/microsoft-edge',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean)
  const executable = candidates.find((candidate) => existsSync(candidate))
  if (executable) return executable
  throw new Error(
    'Chrome or Edge was not found. Set FLOWABLE_BROWSER_PATH to the browser executable.',
  )
}

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.unref()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        reject(new Error('Unable to reserve a local browser-test port.'))
        return
      }
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function captureServerOutput(stream, serverOutput) {
  stream?.on('data', (chunk) => {
    serverOutput.push(chunk.toString())
    if (serverOutput.length > 100) serverOutput.shift()
  })
}

async function waitForServer(url, serverProcess, serverOutput) {
  const deadline = Date.now() + 20_000
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) {
      throw new Error(`Vite exited before the smoke test started.\n${serverOutput.join('')}`)
    }
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      // Vite is still starting.
    }
    await delay(100)
  }
  throw new Error(`Timed out waiting for Vite at ${url}.\n${serverOutput.join('')}`)
}

async function startViteServer(backendEnabled) {
  const port = await reservePort()
  const baseUrl = `http://127.0.0.1:${port}/`
  const serverOutput = []
  const child = spawn(
    process.execPath,
    [viteCli, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        VITE_FLOWABLE_BACKEND_ENABLED: String(backendEnabled),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  )
  captureServerOutput(child.stdout, serverOutput)
  captureServerOutput(child.stderr, serverOutput)
  try {
    await waitForServer(baseUrl, child, serverOutput)
    return { baseUrl, child }
  } catch (error) {
    await stopProcess(child)
    throw error
  }
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(2_000).then(() => false),
  ])
  if (!exited && child.exitCode === null) child.kill('SIGKILL')
}

async function readStoredModels(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('flowable-modeler', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('process-models', 'readonly')
          const read = transaction.objectStore('process-models').getAll()
          let records = []
          read.onsuccess = () => {
            records = read.result.map(({ id, key, name, lastUpdated, editorModel }) => ({
              id,
              key,
              name,
              lastUpdated,
              editorModel,
            }))
          }
          transaction.onerror = () => reject(transaction.error || read.error)
          transaction.onabort = () => reject(transaction.error || read.error)
          transaction.oncomplete = () => {
            database.close()
            resolve(records)
          }
        }
      }),
  )
}

async function openProcessList(page, baseUrl) {
  await page.goto(`${baseUrl}#/processes`, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
}

async function importServiceModel(page) {
  await page.locator('[data-testid="model-import-input"]').setInputFiles({
    name: 'browser-service.bpmn20.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(serviceTaskXml),
  })
  await page.locator('[data-element-id="Task_service"]').waitFor({ state: 'visible' })
}

async function verifyServiceImplementationSwitch(page) {
  await page.locator('[data-element-id="Task_service"]').click()
  const implementationType = page.locator('[data-testid="service-implementation-type"]')
  await implementationType.waitFor({ state: 'visible' })
  await implementationType.click()
  await page.locator('.el-select-dropdown__item:visible').last().click()

  await page.getByRole('button', { name: 'XML', exact: true }).click()
  const exportedXml = await page.locator('.xml-editor textarea').inputValue()
  assert.equal(
    exportedXml.includes('flowable:class='),
    false,
    'flowable:class remained after switching to a built-in type',
  )
  assert.equal(
    /flowable:type\s*=\s*["']\s*["']/.test(exportedXml),
    false,
    'an empty flowable:type remained after switching to a built-in type',
  )
  await page.keyboard.press('Escape')
  await page.locator('.xml-editor').waitFor({ state: 'hidden' })
  await page.locator('[data-testid="save-model"]').click()
  await page
    .locator('.el-message--success')
    .filter({ hasText: /保存|saved/i })
    .waitFor({ state: 'visible' })
  console.log('[pass] service implementation attributes are cleared')
}

async function verifyDisposedFileReadIsIgnored(page, modelId) {
  await page.evaluate(() => {
    window.__flowableOriginalFileText = File.prototype.text
    File.prototype.text = () =>
      new Promise((resolve) => {
        window.__flowableResolveFileText = resolve
      })
  })
  await page.locator('[data-testid="model-import-input"]').setInputFiles({
    name: 'delayed-import.bpmn20.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(delayedImportXml),
  })
  await page.locator('[data-testid="import-model"]').waitFor({ state: 'visible' })
  assert.equal(await page.locator('[data-testid="import-model"]').isDisabled(), true)

  await page.evaluate((id) => {
    window.location.hash = `#/processes/${id}`
  }, modelId)
  await page.locator('[data-element-id="Task_service"]').waitFor({ state: 'visible' })
  await page.evaluate((xml) => window.__flowableResolveFileText(xml), delayedImportXml)
  await delay(100)
  await page.evaluate(() => {
    File.prototype.text = window.__flowableOriginalFileText
    delete window.__flowableOriginalFileText
    delete window.__flowableResolveFileText
  })

  const records = await readStoredModels(page)
  assert.equal(records.some(({ key }) => key === 'Process_delayed_import'), false)
  console.log('[pass] a disposed file-read callback cannot import a model')
}

async function verifyCreateFailureKeepsForm(page) {
  await page.evaluate(() => {
    window.__flowableOriginalIdbAdd = IDBObjectStore.prototype.add
    IDBObjectStore.prototype.add = () => {
      throw new DOMException('Forced create failure', 'UnknownError')
    }
  })
  await page.locator('[data-testid="create-model"]').click()
  await page.locator('[data-testid="model-create-name"]').fill('Failed create')
  await page.locator('[data-testid="model-create-key"]').fill('failed_create')
  await page.locator('[data-testid="confirm-create-model"]').click()
  await page.locator('.el-message--error').waitFor({ state: 'visible' })

  assert.equal(await page.locator('[data-testid="model-create-dialog"]').isVisible(), true)
  assert.equal(await page.locator('[data-testid="model-create-name"]').inputValue(), 'Failed create')
  assert.equal(await page.locator('[data-testid="model-create-key"]').inputValue(), 'failed_create')
  await page.evaluate(() => {
    IDBObjectStore.prototype.add = window.__flowableOriginalIdbAdd
    delete window.__flowableOriginalIdbAdd
  })
  await page.keyboard.press('Escape')
  await page.locator('[data-testid="model-create-dialog"]').waitFor({ state: 'hidden' })
  console.log('[pass] a failed create keeps the dialog and form values')
}

async function verifyDuplicateCreateIsIgnored(page) {
  await page.locator('[data-testid="create-model"]').click()
  await page.locator('[data-testid="model-create-name"]').fill('Single create')
  await page.locator('[data-testid="model-create-key"]').fill('single_create')
  await page.locator('[data-testid="confirm-create-model"]').evaluate((button) => {
    button.click()
    button.click()
  })
  await page.locator('.designer-shell').waitFor({ state: 'visible' })

  const records = await readStoredModels(page)
  assert.equal(records.filter(({ key }) => key === 'single_create').length, 1)
  console.log('[pass] duplicate create submission is ignored')
}

async function runLocalModeSuite(browser) {
  const server = await startViteServer(false)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))

    await openProcessList(page, server.baseUrl)
    assert.equal(await page.locator('[data-testid="local-mode"]').isVisible(), true)
    await importServiceModel(page)
    await verifyServiceImplementationSwitch(page)

    await openProcessList(page, server.baseUrl)
    const importedRow = page.locator('[data-testid="model-row"]').filter({
      has: page.getByText('Browser service regression', { exact: true }),
    })
    const modelId = await importedRow.getAttribute('data-model-id')
    assert.ok(modelId, 'the imported model was not persisted in IndexedDB')
    const importedRecord = (await readStoredModels(page)).find(({ id }) => id === modelId)
    assert.ok(importedRecord, 'the imported IndexedDB record is missing')
    assert.equal(typeof importedRecord.lastUpdated, 'number')
    console.log('[pass] imported model survives a page reload')

    await verifyDisposedFileReadIsIgnored(page, modelId)
    await openProcessList(page, server.baseUrl)
    await verifyCreateFailureKeepsForm(page)
    await verifyDuplicateCreateIsIgnored(page)

    assert.deepEqual(pageErrors, [], `browser page errors: ${pageErrors.join('; ')}`)
    console.log('Local IndexedDB browser smoke passed.')
    return importedRecord.editorModel
  } finally {
    await context.close()
    await stopProcess(server.child)
  }
}

async function runTimestampSaveSuite(browser, editorModel) {
  const server = await startViteServer(true)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const initialLastUpdated = 1_785_094_403_700
  const savedLastUpdated = initialLastUpdated + 1_000
  const model = {
    id: 'timestamp-model',
    name: 'Browser service regression',
    key: 'Process_browser_service',
    description: '',
    createdBy: 'browser-user',
    lastUpdatedBy: 'browser-user',
    lastUpdated: initialLastUpdated,
    latestVersion: true,
    version: 1,
    comment: '',
    modelType: 0,
    tenantId: '',
  }
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/modeler-app/rest/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/account')) {
        await route.fulfill({ json: { id: 'browser-user', fullName: 'Browser User' } })
        return
      }
      if (path.endsWith('/models') && request.method() === 'GET') {
        await route.fulfill({ json: { size: 1, total: 1, start: 0, data: [model] } })
        return
      }
      if (path.endsWith('/models/timestamp-model') && request.method() === 'GET') {
        await route.fulfill({ json: model })
        return
      }
      if (path.endsWith('/models/timestamp-model/editor/json')) {
        if (request.method() === 'GET') {
          await route.fulfill({
            json: {
              modelId: model.id,
              name: model.name,
              key: model.key,
              description: model.description,
              lastUpdated: initialLastUpdated,
              lastUpdatedBy: model.lastUpdatedBy,
              model: editorModel,
            },
          })
          return
        }
        if (request.method() === 'POST') {
          await route.fulfill({ json: { ...model, lastUpdated: savedLastUpdated } })
          return
        }
      }
      await route.fulfill({ status: 404, json: { message: `Unhandled browser mock: ${path}` } })
    })

    await page.goto(`${server.baseUrl}#/processes/timestamp-model`, { waitUntil: 'networkidle' })
    const saveRequest = page.waitForRequest((request) => {
      const path = new URL(request.url()).pathname
      return (
        request.method() === 'POST' && path.endsWith('/models/timestamp-model/editor/json')
      )
    })
    await page.locator('[data-testid="save-model"]').click()
    const submittedBody = new URLSearchParams((await saveRequest).postData() || '')
    assert.equal(submittedBody.get('lastUpdated'), String(initialLastUpdated))
    await page
      .locator('.el-message--success')
      .filter({ hasText: /保存|saved/i })
      .waitFor({ state: 'visible' })
    assert.deepEqual(pageErrors, [], `timestamp-save page errors: ${pageErrors.join('; ')}`)
    console.log('[pass] backend saves submit lastUpdated as a millisecond timestamp')
  } finally {
    await context.close()
    await stopProcess(server.child)
  }
}

async function runSessionExpirySuite(browser) {
  const server = await startViteServer(true)
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  try {
    const page = await context.newPage()
    const pageErrors = []
    let resolveDeleteStarted
    const deleteStarted = new Promise((resolve) => {
      resolveDeleteStarted = resolve
    })
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/modeler-app/rest/**', async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      if (path.endsWith('/account')) {
        await route.fulfill({ json: { id: 'browser-user', fullName: 'Browser User' } })
        return
      }
      if (path.endsWith('/models') && request.method() === 'GET') {
        await route.fulfill({
          json: {
            size: 1,
            total: 1,
            start: 0,
            data: [
              {
                id: 'session-race-model',
                name: 'Session race model',
                key: 'session_race_model',
                description: '',
                createdBy: 'browser-user',
                lastUpdatedBy: 'browser-user',
                lastUpdated: 1_785_094_403_700,
                latestVersion: true,
                version: 1,
                comment: '',
                modelType: 0,
                tenantId: '',
              },
            ],
          },
        })
        return
      }
      if (path.endsWith('/models/session-race-model') && request.method() === 'DELETE') {
        resolveDeleteStarted()
        await delay(800)
        await route.fulfill({ status: 401, json: { message: 'Session expired' } })
        return
      }
      await route.fulfill({ status: 404, json: { message: `Unhandled browser mock: ${path}` } })
    })

    await page.goto(`${server.baseUrl}#/processes`, { waitUntil: 'networkidle' })
    await page.locator('[data-testid="process-model-list-page"]').waitFor()
    await page.locator('[data-testid="model-search"]').fill('Session race')
    await page.locator('[data-testid="delete-model"]').click()
    await page.locator('.el-message-box__btns .el-button--primary').click()
    await deleteStarted
    await page.locator('[data-testid="login-page"]').waitFor({ state: 'visible' })
    await delay(100)

    assert.deepEqual(pageErrors, [], `session-expiry page errors: ${pageErrors.join('; ')}`)
    console.log('[pass] deferred queries are ignored after session expiry')
  } finally {
    await context.close()
    await stopProcess(server.child)
  }
}

const browser = await chromium.launch({
  executablePath: findBrowserExecutable(),
  headless: true,
})
try {
  const editorModel = await runLocalModeSuite(browser)
  await runTimestampSaveSuite(browser, editorModel)
  await runSessionExpirySuite(browser)
  console.log('Local browser smoke passed.')
} finally {
  await browser.close()
}
