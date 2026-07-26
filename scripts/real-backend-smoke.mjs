import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'

import { BpmnModdle } from 'bpmn-moddle'
import { chromium } from 'playwright-core'

const env = process.env
const baseUrl =
  env.FLOWABLE_MODELER_BASE_URL ||
  env.FLOWABLE_BASE_URL ||
  'http://127.0.0.1:8080/flowable-modeler/index.html'
const username = env.FLOWABLE_MODELER_USERNAME || env.FLOWABLE_USERNAME || 'admin'
const password = env.FLOWABLE_MODELER_PASSWORD || env.FLOWABLE_PASSWORD || 'test'
const origin = new URL(baseUrl).origin
const editorApiBase = stripTrailingSlash(
  env.FLOWABLE_EDITOR_API_URL || new URL('/api/editor', origin).href,
)
const modelerRestBase = stripTrailingSlash(
  env.FLOWABLE_MODELER_REST_URL || new URL('/modeler-app/rest', origin).href,
)
const artifactDirectory = env.FLOWABLE_SMOKE_ARTIFACT_DIR || 'artifacts'
const timeout = Number(env.FLOWABLE_SMOKE_TIMEOUT_MS || 30_000)
const headless = env.FLOWABLE_SMOKE_HEADLESS !== 'false'
const runToken = `r${Date.now().toString(36)}${randomBytes(3).toString('hex')}`
const runMarker = `flowable-modeler-real-${runToken}`
const createdName = `${runMarker}-created`
const savedName = `${runMarker}-saved`
const createdKey = `Process_real_${runToken}`
const importedName = `${runMarker}-imported`
const importedKey = `Process_import_${runToken}`
const trackedModelIds = new Set()
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`

const browserCandidates = [
  env.FLOWABLE_CHROMIUM_EXECUTABLE,
  env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  ...(process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']),
].filter(Boolean)

const executablePath = browserCandidates.find(existsSync)
if (!executablePath) {
  throw new Error(
    'Chrome/Edge/Chromium was not found. Set FLOWABLE_CHROMIUM_EXECUTABLE to its executable path.',
  )
}

function stripTrailingSlash(value) {
  return value.replace(/\/$/, '')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function hashRoutePath(page) {
  const hash = new URL(page.url()).hash.slice(1)
  return hash.split('?')[0] || '/'
}

async function assertHashRoute(page, expectedPath, label) {
  await page.waitForFunction(
    (expected) => (window.location.hash.slice(1).split('?')[0] || '/') === expected,
    expectedPath,
  )
  const actualPath = hashRoutePath(page)
  assert(actualPath === expectedPath, `${label} route mismatch: ${actualPath}`)
}

async function assertModelRoute(page, modelId, label) {
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      modelId,
    ),
    `${label} model id is not a UUID: ${modelId}`,
  )
  await assertHashRoute(page, `/processes/${modelId}`, label)
}

function modelerRestPath(pathname) {
  return `${new URL(modelerRestBase).pathname.replace(/\/$/, '')}${pathname}`
}

function isResponse(response, method, pathname) {
  return (
    response.request().method() === method &&
    new URL(response.url()).pathname === modelerRestPath(pathname)
  )
}

async function responseDetail(response) {
  const body = (await response.text().catch(() => '')).trim()
  return `HTTP ${response.status()}${body ? `: ${body.slice(0, 800)}` : ''}`
}

async function assertResponseOk(response, label) {
  if (!response.ok()) throw new Error(`${label} failed (${await responseDetail(response)})`)
}

async function editorApiFetch(pathname, init = {}) {
  const headers = new Headers(init.headers)
  headers.set('Authorization', authorization)
  headers.set('Accept', 'application/json')
  const response = await fetch(`${editorApiBase}${pathname}`, {
    ...init,
    headers,
    cache: 'no-store',
  })
  if (!response.ok) {
    const body = (await response.text().catch(() => '')).trim()
    throw new Error(
      `Editor API ${init.method || 'GET'} ${pathname} failed (HTTP ${response.status}${
        body ? `: ${body.slice(0, 800)}` : ''
      })`,
    )
  }
  return response
}

async function readEditorDocument(modelId) {
  const response = await editorApiFetch(`/models/${encodeURIComponent(modelId)}/editor/json`)
  const document = await response.json()
  assert(document?.model && typeof document.model === 'object', 'Editor API did not return Oryx JSON')
  return document
}

async function listTemporaryModels() {
  const query = new URLSearchParams({
    filter: 'processes',
    sort: 'modifiedDesc',
    modelType: '0',
    filterText: runToken,
  })
  const response = await editorApiFetch(`/models?${query}`)
  const result = await response.json()
  const data = Array.isArray(result?.data) ? result.data : []
  return data.filter(
    (model) =>
      typeof model?.id === 'string' &&
      (String(model.name || '').includes(runMarker) || String(model.key || '').includes(runToken)),
  )
}

async function cleanupTemporaryModels() {
  const cleanupErrors = []
  try {
    for (const model of await listTemporaryModels()) trackedModelIds.add(model.id)
  } catch (error) {
    cleanupErrors.push(error)
  }

  for (const modelId of trackedModelIds) {
    try {
      const response = await fetch(`${editorApiBase}/models/${encodeURIComponent(modelId)}`, {
        method: 'DELETE',
        headers: { Authorization: authorization, Accept: 'application/json' },
        cache: 'no-store',
      })
      if (!response.ok && response.status !== 404) {
        const body = (await response.text().catch(() => '')).trim()
        throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`)
      }
    } catch (error) {
      cleanupErrors.push(new Error(`Could not delete temporary model ${modelId}: ${error.message}`))
    }
  }

  try {
    const remaining = await listTemporaryModels()
    if (remaining.length) {
      cleanupErrors.push(
        new Error(`Temporary models remain: ${remaining.map((model) => model.id).join(', ')}`),
      )
    }
  } catch (error) {
    cleanupErrors.push(error)
  }

  if (cleanupErrors.length) {
    throw new Error(cleanupErrors.map((error) => error.message).join('\n'))
  }
}

function importedBpmnXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_${runToken}" targetNamespace="http://flowable.org/processdef">
  <bpmn:process id="${importedKey}" name="${importedName}" isExecutable="true">
    <bpmn:startEvent id="Start_${runToken}"><bpmn:outgoing>Flow_1_${runToken}</bpmn:outgoing></bpmn:startEvent>
    <bpmn:userTask id="Task_${runToken}" name="Review">
      <bpmn:incoming>Flow_1_${runToken}</bpmn:incoming><bpmn:outgoing>Flow_2_${runToken}</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:endEvent id="End_${runToken}"><bpmn:incoming>Flow_2_${runToken}</bpmn:incoming></bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1_${runToken}" sourceRef="Start_${runToken}" targetRef="Task_${runToken}" />
    <bpmn:sequenceFlow id="Flow_2_${runToken}" sourceRef="Task_${runToken}" targetRef="End_${runToken}" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_${runToken}">
    <bpmndi:BPMNPlane id="Plane_${runToken}" bpmnElement="${importedKey}">
      <bpmndi:BPMNShape id="Start_${runToken}_di" bpmnElement="Start_${runToken}"><dc:Bounds x="120" y="182" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_${runToken}_di" bpmnElement="Task_${runToken}"><dc:Bounds x="230" y="160" width="110" height="80" /></bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_${runToken}_di" bpmnElement="End_${runToken}"><dc:Bounds x="420" y="182" width="36" height="36" /></bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_${runToken}_di" bpmnElement="Flow_1_${runToken}"><di:waypoint x="156" y="200" /><di:waypoint x="230" y="200" /></bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_${runToken}_di" bpmnElement="Flow_2_${runToken}"><di:waypoint x="340" y="200" /><di:waypoint x="420" y="200" /></bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`
}

async function blockBrowserPersistence(context) {
  await context.addInitScript(() => {
    const rejectPersistence = () => {
      throw new Error('Browser persistence is forbidden in the real backend smoke test')
    }
    for (const operation of ['getItem', 'setItem', 'removeItem', 'clear']) {
      Object.defineProperty(Storage.prototype, operation, {
        configurable: true,
        writable: true,
        value: rejectPersistence,
      })
    }
    if (globalThis.IDBFactory) {
      Object.defineProperty(IDBFactory.prototype, 'open', {
        configurable: true,
        writable: true,
        value: rejectPersistence,
      })
    }
  })
}

function usernameInput(page) {
  return page.locator(
    'input[data-testid="login-username"], [data-testid="login-username"] input',
  )
}

function passwordInput(page) {
  return page.locator(
    'input[data-testid="login-password"], [data-testid="login-password"] input',
  )
}

async function submitLogin(page, loginUsername, loginPassword) {
  await page.locator('[data-testid="login-page"]').waitFor()
  await usernameInput(page).fill(loginUsername)
  await passwordInput(page).fill(loginPassword)
  await page.locator('[data-testid="login-submit"]').click()
}

async function waitForEditor(page) {
  await page.locator('.djs-container').waitFor()
  await page.waitForFunction(() => {
    const saveButton = document.querySelector('[data-testid="save-model"]')
    return Boolean(window.bpmnModeler && saveButton && !saveButton.disabled)
  })
}

function findModelRow(page, name) {
  return page.locator('[data-testid="model-row"]').filter({
    has: page.locator('[data-testid="model-title"]', { hasText: name }),
  })
}

async function fillCreateDialog(page) {
  await page.locator('[data-testid="create-model"]').click()
  await page
    .locator('input[data-testid="model-create-name"], [data-testid="model-create-name"] input')
    .fill(createdName)
  await page
    .locator('input[data-testid="model-create-key"], [data-testid="model-create-key"] input')
    .fill(createdKey)
  await page
    .locator(
      'textarea[data-testid="model-create-description"], [data-testid="model-create-description"] textarea',
    )
    .fill(`Real backend smoke ${runToken}`)
}

async function deleteModelFromList(page, modelId, name) {
  const row = findModelRow(page, name)
  await row.waitFor()
  const deleteResponse = page.waitForResponse((response) =>
    isResponse(response, 'DELETE', `/models/${modelId}`),
  )
  await row.locator('[data-testid="delete-model"]').click()
  await page
    .locator('.el-message-box')
    .getByRole('button', { name: 'Delete', exact: true })
    .or(page.locator('.el-message-box').getByRole('button', { name: '删除', exact: true }))
    .click()
  const response = await deleteResponse
  await assertResponseOk(response, `Delete model ${modelId}`)
  await row.waitFor({ state: 'detached' })
}

mkdirSync(artifactDirectory, { recursive: true })

let browser
let browserContext
let primaryError
let result
try {
  browser = await chromium.launch({ executablePath, headless })
  browserContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
  })
  const context = browserContext
  context.setDefaultTimeout(timeout)
  await blockBrowserPersistence(context)
  const page = await context.newPage()
  const pageErrors = []
  const forbiddenBackendConversionRequests = []
  const browserModelerRequests = []
  const authenticationRequests = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('request', (request) => {
    const pathname = new URL(request.url()).pathname
    if (pathname === '/app/authentication') authenticationRequests.push(request.method())
    if (pathname.startsWith(`${new URL(modelerRestBase).pathname.replace(/\/$/, '')}/`)) {
      browserModelerRequests.push({
        method: request.method(),
        pathname,
        authorization: request.headers().authorization || '',
      })
    }
    if (pathname.endsWith('/import-process-model') || pathname.endsWith('/bpmn20')) {
      forbiddenBackendConversionRequests.push(`${request.method()} ${request.url()}`)
    }
  })

  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.locator('[data-testid="login-page"]').waitFor()
  await assertHashRoute(page, '/login', 'Unauthenticated entry')
  await page.screenshot({ path: `${artifactDirectory}/real-login.png`, fullPage: true })

  await submitLogin(page, username, `${password}-intentionally-wrong-${runToken}`)
  await page.locator('.login-error').waitFor()
  assert(
    (await page.locator('[data-testid="process-model-list-page"]').count()) === 0,
    'Wrong credentials opened the model list',
  )
  await assertHashRoute(page, '/login', 'Rejected login')

  await submitLogin(page, username, password)
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await assertHashRoute(page, '/processes', 'Successful login')
  const authenticationCookie = (await context.cookies(origin)).find(
    (cookie) => cookie.name === 'FLOWABLE_REMEMBER_ME',
  )
  assert(
    authenticationCookie?.httpOnly,
    'Flowable UI login did not issue an HttpOnly FLOWABLE_REMEMBER_ME cookie',
  )
  await page.screenshot({ path: `${artifactDirectory}/real-list.png`, fullPage: true })
  await page.locator('[data-testid="language-switcher"]').click()
  await page.locator('[data-testid="language-en"]').click()
  await page.getByRole('heading', { name: 'Process models', exact: true }).waitFor()
  const englishSearch = page.locator(
    'input[data-testid="model-search"], [data-testid="model-search"] input',
  )
  assert(
    (await page.locator('html').getAttribute('lang')) === 'en' &&
      (await englishSearch.getAttribute('placeholder')) === 'Search' &&
      new URLSearchParams(new URL(page.url()).hash.split('?', 2)[1] || '').get('lang') === 'en',
    `Real backend English locale did not apply: ${page.url()}`,
  )
  await page.screenshot({ path: `${artifactDirectory}/real-list-en.png`, fullPage: true })
  await page.locator('[data-testid="language-switcher"]').click()
  await page.locator('[data-testid="language-zh-CN"]').click()
  await page.getByRole('heading', { name: '流程模型', exact: true }).waitFor()

  await fillCreateDialog(page)
  const createResponsePromise = page.waitForResponse((response) =>
    isResponse(response, 'POST', '/models'),
  )
  await page.locator('[data-testid="confirm-create-model"]').click()
  const createResponse = await createResponsePromise
  await assertResponseOk(createResponse, 'Create model')
  const createdModel = await createResponse.json()
  assert(typeof createdModel?.id === 'string', 'Create model response did not contain an id')
  trackedModelIds.add(createdModel.id)
  await waitForEditor(page)
  await assertModelRoute(page, createdModel.id, 'Created model editor')

  await page.evaluate((name) => {
    const modeler = window.bpmnModeler
    const root = modeler.get('canvas').getRootElement()
    modeler.get('modeling').updateProperties(root, { name })
  }, savedName)
  const saveResponsePromise = page.waitForResponse((response) =>
    isResponse(response, 'POST', `/models/${createdModel.id}/editor/json`),
  )
  await page.locator('[data-testid="save-model"]').click()
  const saveResponse = await saveResponsePromise
  await assertResponseOk(saveResponse, 'Save model')
  const saveForm = new URLSearchParams(saveResponse.request().postData() || '')
  const savedOryx = JSON.parse(saveForm.get('json_xml') || 'null')
  assert(
    savedOryx?.resourceId === 'canvas' && Array.isArray(savedOryx.childShapes),
    'Browser save did not send Oryx JSON to editor/json',
  )
  await page.getByText('已保存', { exact: true }).waitFor()
  await page.locator('.el-loading-mask.is-fullscreen').waitFor({ state: 'hidden' })
  await page.locator('.el-message').waitFor({ state: 'hidden' })
  await page.screenshot({ path: `${artifactDirectory}/real-editor.png`, fullPage: true })

  const createdEditorDocument = await readEditorDocument(createdModel.id)
  assert(
    createdEditorDocument.model.resourceId === 'canvas',
    'Editor API could not read back the saved Oryx model',
  )

  await page.locator('[data-testid="back-to-models"]').click()
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await assertHashRoute(page, '/processes', 'Return from created model')
  await findModelRow(page, savedName).waitFor()
  await findModelRow(page, savedName).locator('[data-testid="model-primary-open"]').click()
  await waitForEditor(page)
  await assertModelRoute(page, createdModel.id, 'Reopened created model')
  const reopened = await page.evaluate(() => {
    const root = window.bpmnModeler.get('canvas').getRootElement().businessObject
    return { id: root.id, name: root.name }
  })
  assert(
    reopened.id === createdKey && reopened.name === savedName,
    `Reopened model mismatch: ${JSON.stringify(reopened)}`,
  )
  await page.locator('[data-testid="back-to-models"]').click()
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await assertHashRoute(page, '/processes', 'Return from reopened model')

  const importCreatePromise = page.waitForResponse((response) =>
    isResponse(response, 'POST', '/models'),
  )
  const importSavePromise = page.waitForResponse((response) => {
    const pathname = new URL(response.url()).pathname
    return (
      response.request().method() === 'POST' &&
      pathname.startsWith(`${modelerRestPath('/models/')}`) &&
      pathname.endsWith('/editor/json')
    )
  })
  await page.locator('[data-testid="model-import-input"]').setInputFiles({
    name: `${importedKey}.bpmn20.xml`,
    mimeType: 'application/xml',
    buffer: Buffer.from(importedBpmnXml()),
  })
  const importCreateResponse = await importCreatePromise
  await assertResponseOk(importCreateResponse, 'Create imported model')
  const importedModel = await importCreateResponse.json()
  assert(typeof importedModel?.id === 'string', 'Imported model response did not contain an id')
  trackedModelIds.add(importedModel.id)
  const importSaveResponse = await importSavePromise
  await assertResponseOk(importSaveResponse, 'Save imported model')
  assert(
    new URL(importSaveResponse.url()).pathname ===
      modelerRestPath(`/models/${importedModel.id}/editor/json`),
    'Import saved Oryx JSON to the wrong model',
  )
  const importForm = new URLSearchParams(importSaveResponse.request().postData() || '')
  const importedRequestOryx = JSON.parse(importForm.get('json_xml') || 'null')
  assert(
    importedRequestOryx?.resourceId === 'canvas' &&
      importedRequestOryx.properties?.process_id === importedKey &&
      Array.isArray(importedRequestOryx.childShapes) &&
      !String(importForm.get('json_xml') || '').trimStart().startsWith('<'),
    'Browser import did not convert BPMN XML to Oryx JSON',
  )
  assert(
    forbiddenBackendConversionRequests.length === 0,
    `Browser import called forbidden backend conversion endpoint: ${forbiddenBackendConversionRequests.join(', ')}`,
  )
  await waitForEditor(page)
  await assertModelRoute(page, importedModel.id, 'Imported model editor')
  const importedEditorDocument = await readEditorDocument(importedModel.id)
  assert(
    importedEditorDocument.model.resourceId === 'canvas' &&
      importedEditorDocument.model.properties?.process_id === importedKey,
    'Editor API Oryx readback does not match the browser-imported process',
  )

  await page.locator('[data-testid="back-to-models"]').click()
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await assertHashRoute(page, '/processes', 'Return from imported model')
  await findModelRow(page, importedName).waitFor()
  await findModelRow(page, importedName).locator('[data-testid="model-primary-open"]').click()
  await waitForEditor(page)
  await assertModelRoute(page, importedModel.id, 'Reopened imported model')
  const frontendRoundTrip = await page.evaluate(async (ids) => {
    const modeler = window.bpmnModeler
    const bridge = window.flowableProcessModeler
    const registry = modeler.get('elementRegistry')
    const root = modeler.get('canvas').getRootElement().businessObject
    const flow1 = registry.get(ids.flow1)?.businessObject
    const flow2 = registry.get(ids.flow2)?.businessObject
    return {
      rootId: root.id,
      rootName: root.name,
      rootType: root.$type,
      elementIds: ids.elements.filter((id) => Boolean(registry.get(id))),
      flow1: { source: flow1?.sourceRef?.id, target: flow1?.targetRef?.id },
      flow2: { source: flow2?.sourceRef?.id, target: flow2?.targetRef?.id },
      xml: await bridge.getXML(),
    }
  }, {
    elements: [
      `Start_${runToken}`,
      `Task_${runToken}`,
      `End_${runToken}`,
      `Flow_1_${runToken}`,
      `Flow_2_${runToken}`,
    ],
    flow1: `Flow_1_${runToken}`,
    flow2: `Flow_2_${runToken}`,
  })
  assert(
    frontendRoundTrip.rootId === importedKey && frontendRoundTrip.rootType === 'bpmn:Process',
    `Frontend Oryx conversion opened the wrong root: ${JSON.stringify(frontendRoundTrip)}`,
  )
  assert(
    frontendRoundTrip.elementIds.length === 5 &&
      frontendRoundTrip.flow1.source === `Start_${runToken}` &&
      frontendRoundTrip.flow1.target === `Task_${runToken}` &&
      frontendRoundTrip.flow2.source === `Task_${runToken}` &&
      frontendRoundTrip.flow2.target === `End_${runToken}`,
    `Frontend Oryx conversion lost BPMN elements or connections: ${JSON.stringify(frontendRoundTrip)}`,
  )
  const { rootElement: roundTripDefinitions } = await new BpmnModdle().fromXML(
    frontendRoundTrip.xml,
  )
  const roundTripProcess = roundTripDefinitions.rootElements?.find(
    (element) => element.$type === 'bpmn:Process' && element.id === importedKey,
  )
  assert(roundTripProcess, `Frontend BPMN XML does not contain process ${importedKey}`)
  assert(
    forbiddenBackendConversionRequests.length === 0,
    `Browser called a forbidden backend conversion endpoint: ${forbiddenBackendConversionRequests.join(', ')}`,
  )

  const authenticationRequestCount = authenticationRequests.length
  const restoredEditorResponse = page.waitForResponse((response) =>
    isResponse(response, 'GET', `/models/${importedModel.id}/editor/json`),
  )
  await page.reload({ waitUntil: 'networkidle' })
  await assertResponseOk(await restoredEditorResponse, 'Restore editor after refresh')
  await waitForEditor(page)
  await assertModelRoute(page, importedModel.id, 'Refreshed imported model')
  const refreshedRoot = await page.evaluate(() => {
    const root = window.bpmnModeler.get('canvas').getRootElement().businessObject
    return { id: root.id, name: root.name, type: root.$type }
  })
  assert(
    refreshedRoot.id === frontendRoundTrip.rootId &&
      refreshedRoot.name === frontendRoundTrip.rootName &&
      refreshedRoot.type === frontendRoundTrip.rootType,
    `Editor refresh restored the wrong BPMN root: ${JSON.stringify(refreshedRoot)}`,
  )
  assert(
    authenticationRequests.length === authenticationRequestCount,
    'Editor refresh made an additional authentication POST',
  )

  const dirtyRouteProbeName = `${importedName}-dirty-route-probe`
  await page.evaluate((name) => {
    const modeler = window.bpmnModeler
    const root = modeler.get('canvas').getRootElement()
    modeler.get('modeling').updateProperties(root, { name })
  }, dirtyRouteProbeName)
  await page.getByText('未保存', { exact: true }).waitFor()
  await page.evaluate(() => window.history.back())
  await page.getByText('当前流程有未保存更改。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await assertModelRoute(page, importedModel.id, 'Cancelled dirty editor Back')
  assert(
    (await page.locator('.djs-container').count()) === 1 &&
      (await page.getByText('未保存', { exact: true }).isVisible()) &&
      (await page.evaluate(
        () => window.bpmnModeler.get('canvas').getRootElement().businessObject.name,
      )) === dirtyRouteProbeName,
    'Cancelling dirty editor Back did not preserve the route and unsaved model',
  )

  await page.locator('[data-testid="back-to-models"]').click()
  await page.getByText('当前流程有未保存更改。', { exact: true }).waitFor()
  await page.getByRole('button', { name: '放弃更改', exact: true }).click()
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  await assertHashRoute(page, '/processes', 'Return after editor refresh')
  await page.waitForFunction(() => !document.querySelector('.el-message'))
  await page.screenshot({ path: `${artifactDirectory}/real-list.png`, fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  const mobileLayout = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert(
    mobileLayout.scrollWidth <= mobileLayout.clientWidth,
    `Mobile layout overflows: ${mobileLayout.scrollWidth} > ${mobileLayout.clientWidth}`,
  )
  await page.screenshot({ path: `${artifactDirectory}/real-mobile.png`, fullPage: true })
  await page.setViewportSize({ width: 1440, height: 900 })

  const search = page.locator(
    'input[data-testid="model-search"], [data-testid="model-search"] input',
  )
  await search.fill(runToken)
  await findModelRow(page, importedName).waitFor()
  await deleteModelFromList(page, importedModel.id, importedName)
  await deleteModelFromList(page, createdModel.id, savedName)

  assert(
    browserModelerRequests.length > 0 &&
      browserModelerRequests.every((request) => !request.authorization),
    `Browser Modeler requests unexpectedly used Authorization: ${JSON.stringify(browserModelerRequests)}`,
  )

  await page.locator('[data-testid="logout"]').click()
  await page.locator('[data-testid="login-page"]').waitFor()
  await assertHashRoute(page, '/login', 'Logout')
  assert(
    !(await context.cookies(origin)).some((cookie) => cookie.name === 'FLOWABLE_REMEMBER_ME'),
    'Logout did not clear FLOWABLE_REMEMBER_ME',
  )
  await page.reload({ waitUntil: 'networkidle' })
  await page.locator('[data-testid="login-page"]').waitFor()
  await assertHashRoute(page, '/login', 'Logged-out refresh')
  assert(
    (await page.locator('[data-testid="process-model-list-page"]').count()) === 0,
    'Logout was not preserved after refresh',
  )
  assert(pageErrors.length === 0, `Browser page errors:\n${pageErrors.join('\n')}`)

  result = {
    ok: true,
    baseUrl,
    runToken,
    createdModelId: createdModel.id,
    importedModelId: importedModel.id,
    importedOryxShapes: importedEditorDocument.model.childShapes?.length || 0,
    refreshSessionRestored: true,
    refreshedEditorRoute: `/processes/${importedModel.id}`,
    refreshedBpmnRoot: refreshedRoot.id,
    authenticationCookieHttpOnly: authenticationCookie.httpOnly,
    frontendRoundTrip: {
      rootId: frontendRoundTrip.rootId,
      elementCount: frontendRoundTrip.elementIds.length,
      xmlLength: frontendRoundTrip.xml.length,
    },
    screenshots: [
      'real-login.png',
      'real-list-en.png',
      'real-list.png',
      'real-editor.png',
      'real-mobile.png',
    ],
  }
} catch (error) {
  primaryError = error
} finally {
  let cleanupError
  try {
    await cleanupTemporaryModels()
  } catch (error) {
    cleanupError = error
  }
  await browserContext?.request
    .post(new URL('/app/logout', origin).href, { failOnStatusCode: false, maxRedirects: 0 })
    .catch(() => {})
  await browser?.close().catch(() => {})
  if (cleanupError) {
    primaryError = new Error(
      `${primaryError ? `${primaryError.stack || primaryError.message}\n` : ''}Cleanup failed:\n${cleanupError.message}`,
    )
  }
}

if (primaryError) throw primaryError
console.log(JSON.stringify(result, null, 2))
