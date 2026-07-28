import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const viteCli = join(projectRoot, 'node_modules', 'vite', 'bin', 'vite.js')

const MODEL_TYPES = {
  process: 0,
  decisionTable: 4,
  case: 5,
  decisionService: 6,
}

const FILTER_BY_MODEL_TYPE = new Map([
  [MODEL_TYPES.process, 'processes'],
  [MODEL_TYPES.case, 'cases'],
  [MODEL_TYPES.decisionTable, 'decisionTables'],
  [MODEL_TYPES.decisionService, 'decisionServices'],
])

const crossModelProcessXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flowable="http://flowable.org/bpmn"
  id="Definitions_cross_process"
  targetNamespace="http://flowable.org/test">
  <bpmn:process id="cross_process" name="Cross-model process" isExecutable="true">
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:outgoing>Flow_1</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:serviceTask id="Task_table" name="Use decision table" flowable:type="dmn">
      <bpmn:incoming>Flow_1</bpmn:incoming>
      <bpmn:outgoing>Flow_2</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:serviceTask id="Task_service" name="Use decision service" flowable:type="dmn">
      <bpmn:incoming>Flow_2</bpmn:incoming>
      <bpmn:outgoing>Flow_3</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="EndEvent_1">
      <bpmn:incoming>Flow_3</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Task_table" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Task_table" targetRef="Task_service" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Task_service" targetRef="EndEvent_1" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_1">
    <bpmndi:BPMNPlane id="BPMNPlane_1" bpmnElement="cross_process">
      <bpmndi:BPMNShape id="StartEvent_1_di" bpmnElement="StartEvent_1">
        <dc:Bounds x="120" y="142" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_table_di" bpmnElement="Task_table">
        <dc:Bounds x="215" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_service_di" bpmnElement="Task_service">
        <dc:Bounds x="375" y="120" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_1_di" bpmnElement="EndEvent_1">
        <dc:Bounds x="535" y="142" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_1_di" bpmnElement="Flow_1">
        <di:waypoint x="156" y="160" />
        <di:waypoint x="215" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_2_di" bpmnElement="Flow_2">
        <di:waypoint x="315" y="160" />
        <di:waypoint x="375" y="160" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_3_di" bpmnElement="Flow_3">
        <di:waypoint x="475" y="160" />
        <di:waypoint x="535" y="160" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

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

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return
  child.kill()
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    delay(2_000).then(() => false),
  ])
  if (!exited && child.exitCode === null) child.kill('SIGKILL')
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

function bounds(x, y, width, height) {
  return {
    upperLeft: { x, y },
    lowerRight: { x: x + width, y: y + height },
  }
}

function shape(resourceId, stencil, shapeBounds, properties = {}) {
  return {
    resourceId,
    properties,
    stencil: { id: stencil },
    childShapes: [],
    outgoing: [],
    bounds: shapeBounds,
    dockers: [],
  }
}

function findShape(model, resourceId) {
  const stack = [...(model.childShapes || [])]
  while (stack.length) {
    const current = stack.shift()
    if (current.resourceId === resourceId) return current
    stack.push(...(current.childShapes || []))
  }
  return null
}

function referenceFor(record) {
  return { id: record.id, name: record.name, key: record.key }
}

function assertReference(value, record, message) {
  assert.deepEqual(value, referenceFor(record), message)
  assert.deepEqual(Object.keys(value).sort(), ['id', 'key', 'name'], `${message}: unexpected fields`)
}

function assertFlowableEdge(record, resourceId, sourceId, targetId, message) {
  const edge = findShape(record.editorModel, resourceId)
  const source = findShape(record.editorModel, sourceId)
  assert.ok(edge, `${message}: edge is missing`)
  assert.ok(source, `${message}: source is missing`)
  assert.equal(
    source.outgoing.some((outgoing) => outgoing.resourceId === resourceId),
    true,
    `${message}: source outgoing reference is missing`,
  )
  assert.equal(edge.target?.resourceId, targetId, `${message}: target is incorrect`)
  assert.equal(edge.outgoing?.[0]?.resourceId, targetId, `${message}: outgoing target is incorrect`)
  assert.ok(edge.dockers.length >= 2, `${message}: Flowable requires two endpoint dockers`)
  for (const point of edge.dockers) {
    assert.equal(Number.isFinite(point.x), true, `${message}: docker x is invalid`)
    assert.equal(Number.isFinite(point.y), true, `${message}: docker y is invalid`)
  }
}

function decisionTableEditor(record) {
  return {
    modelVersion: '3',
    key: record.key,
    name: record.name,
    description: record.description,
    forceDMN11: false,
    hitIndicator: 'UNIQUE',
    inputExpressions: [
      {
        id: 'input_age',
        label: 'Age',
        type: 'number',
        variableId: 'age',
        variableType: 'variable',
        entries: null,
        newVariable: false,
        complexExpression: false,
      },
      {
        id: 'input_country',
        label: 'Country',
        type: 'string',
        variableId: 'country',
        variableType: 'variable',
        entries: ['TH', 'US'],
        newVariable: false,
        complexExpression: false,
      },
      {
        id: 'input_date',
        label: 'Effective date',
        type: 'date',
        variableId: 'effectiveDate',
        variableType: 'variable',
        entries: null,
        newVariable: false,
        complexExpression: false,
      },
    ],
    outputExpressions: [
      {
        id: 'output_result',
        label: 'Result',
        type: 'string',
        variableId: 'result',
        variableType: 'variable',
        entries: ['approved', 'rejected'],
        newVariable: true,
        complexExpression: false,
      },
    ],
    rules: [
      {
        input_age_operator: '>=',
        input_age_expression: '18',
        input_country_operator: null,
        input_country_expression: 'TH',
        input_date_operator: '>=',
        input_date_expression: '2026-01-01',
        output_result: 'approved',
      },
      {
        input_age_operator: '<',
        input_age_expression: '18',
        input_country_operator: null,
        input_country_expression: '-',
        input_date_operator: null,
        input_date_expression: '-',
        output_result: 'rejected',
      },
    ],
  }
}

function caseEditorWithReferences(record) {
  const editor = structuredClone(record.editorModel)
  const planModel = (editor.childShapes || []).find(
    (candidate) => candidate.stencil?.id === 'CasePlanModel',
  )
  assert.ok(planModel, 'the default case plan model is missing')
  const processTask = shape('case-process-task', 'ProcessTask', bounds(90, 100, 120, 80), {
      overrideid: 'ProcessTask_definition',
      name: 'Start process',
      isblocking: true,
    })
  const caseTask =
    shape('case-case-task', 'CaseTask', bounds(270, 100, 120, 80), {
      overrideid: 'CaseTask_definition',
      name: 'Start case',
      isblocking: true,
    })
  const tableTask = shape('case-table-task', 'DecisionTask', bounds(90, 260, 120, 80), {
      overrideid: 'DecisionTableTask_definition',
      name: 'Evaluate table',
      isblocking: true,
    })
  const serviceTask = shape('case-service-task', 'DecisionTask', bounds(270, 260, 120, 80), {
      overrideid: 'DecisionServiceTask_definition',
      name: 'Evaluate service',
      isblocking: true,
    })
  const criterion = shape('case-entry-criterion', 'EntryCriterion', bounds(82, 286, 16, 22), {
    overrideid: 'CaseEntryCriterion',
    name: 'Process completed',
    ifpartcondition: '${approved}',
  })
  const association = shape(
    'case-sentry-association',
    'Association',
    bounds(130, 180, 60, 157),
    { overrideid: 'CaseSentryAssociation', transitionevent: 'complete' },
  )
  association.dockers = [
    { x: 60, y: 40 },
    { x: 8, y: 11 },
  ]
  association.outgoing = [{ resourceId: criterion.resourceId }]
  association.target = { resourceId: criterion.resourceId }
  processTask.outgoing = [{ resourceId: association.resourceId }]
  tableTask.outgoing = [{ resourceId: criterion.resourceId }]
  planModel.childShapes = [processTask, caseTask, tableTask, serviceTask, criterion]
  editor.childShapes.push(association)
  return editor
}

function decisionServiceEditorWithReference(record) {
  const editor = structuredClone(record.editorModel)
  const service = (editor.childShapes || []).find(
    (candidate) => candidate.stencil?.id === 'ExpandedDecisionService',
  )
  assert.ok(service, 'the default expanded decision service is missing')
  const outputSection = (service.childShapes || []).find(
    (candidate) => candidate.stencil?.id === 'OutputDecisionsDecisionServiceSection',
  )
  assert.ok(outputSection, 'the default output-decision section is missing')
  const encapsulatedSection = (service.childShapes || []).find(
    (candidate) => candidate.stencil?.id === 'EncapsulatedDecisionsDecisionServiceSection',
  )
  assert.ok(encapsulatedSection, 'the default encapsulated-decision section is missing')
  const outputDecision = shape('service-decision', 'Decision', bounds(90, 75, 150, 80), {
      overrideid: 'serviceDecision',
      name: 'Service decision',
    })
  const encapsulatedDecision = shape(
    'service-required-decision',
    'Decision',
    bounds(330, 75, 150, 80),
    { overrideid: 'requiredDecision', name: 'Required decision' },
  )
  const requirement = shape(
    'service-information-requirement',
    'InformationRequirement',
    bounds(315, 189, 240, 240),
    { overrideid: 'serviceInformationRequirement' },
  )
  requirement.dockers = [
    { x: 75, y: 40 },
    { x: 75, y: 40 },
  ]
  requirement.outgoing = [{ resourceId: outputDecision.resourceId }]
  requirement.target = { resourceId: outputDecision.resourceId }
  encapsulatedDecision.outgoing = [{ resourceId: requirement.resourceId }]
  outputSection.childShapes = [outputDecision]
  encapsulatedSection.childShapes = [encapsulatedDecision]
  editor.childShapes.push(requirement)
  return editor
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
            records = structuredClone(read.result)
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

async function replaceStoredEditorModel(page, id, editorModel) {
  await page.evaluate(
    ({ modelId, nextEditorModel }) =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open('flowable-modeler', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const transaction = database.transaction('process-models', 'readwrite')
          const store = transaction.objectStore('process-models')
          const read = store.get(modelId)
          read.onsuccess = () => {
            if (!read.result) {
              transaction.abort()
              reject(new Error(`Stored model not found: ${modelId}`))
              return
            }
            store.put({ ...read.result, editorModel: structuredClone(nextEditorModel) })
          }
          transaction.onerror = () => reject(transaction.error || read.error)
          transaction.onabort = () => reject(transaction.error || read.error)
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
        }
      }),
    { modelId: id, nextEditorModel: editorModel },
  )
}

function editorPath(modelType, id) {
  if (modelType === MODEL_TYPES.case) return `/cases/${id}`
  if (modelType === MODEL_TYPES.process) return `/processes/${id}`
  return `/decisions/${id}`
}

function listPath(modelType) {
  if (modelType === MODEL_TYPES.case) return '/cases'
  if (modelType === MODEL_TYPES.decisionService) return '/decisions?type=service'
  if (modelType === MODEL_TYPES.decisionTable) return '/decisions?type=table'
  return '/processes'
}

function currentEditorId(page) {
  const hashPath = new URL(page.url()).hash.replace(/^#/, '').split('?')[0]
  return decodeURIComponent(hashPath.split('/').filter(Boolean).at(-1) || '')
}

async function openList(page, baseUrl, path = '/processes') {
  const separator = path.includes('?') ? '&' : '?'
  await page.goto(`${baseUrl}#${path}${separator}lang=en`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="model-list-page"]').waitFor({ state: 'visible' })
}

async function waitForEditor(page, modelType) {
  if (modelType === MODEL_TYPES.process) {
    await page.locator('.designer-shell').waitFor({ state: 'visible' })
    await page.locator('.bpmn-canvas .djs-element').first().waitFor({ state: 'visible' })
    assert.ok(
      (await page.locator('.bpmn-canvas .djs-element').count()) >= 1,
      'the BPMN canvas is blank',
    )
  } else {
    await page.locator('[data-testid="structured-designer"]').waitFor({ state: 'visible' })
    await page.locator('[data-testid="structured-loading"]').waitFor({ state: 'hidden' })
    if (modelType === MODEL_TYPES.decisionTable) {
      await page.locator('.dmn-decision-table-container').waitFor({ state: 'visible' })
    } else {
      await page
        .locator('.structured-canvas .djs-container > svg[data-element-id]')
        .waitFor({ state: 'visible' })
      assert.ok(
        (await page.locator('.structured-canvas .djs-element').count()) >= 1,
        'the structured diagram canvas is blank',
      )
    }
  }
  const enabledSave = page
    .locator('[data-testid="save-model"]:not([disabled])')
    .waitFor({ state: 'visible' })
  const initializationError = page
    .locator('.el-message--error')
    .last()
    .waitFor({ state: 'visible' })
    .then(async () => {
      const message = await page.locator('.el-message--error').last().textContent()
      throw new Error(message || 'Model editor initialization failed')
    })
  await Promise.race([enabledSave, initializationError])
}

async function saveModel(page) {
  const successMessages = page.locator('.el-message--success')
  const errorMessages = page.locator('.el-message--error')
  const previousCount = await successMessages.count()
  const previousErrorCount = await errorMessages.count()
  await page.locator('[data-testid="save-model"]').click()
  await Promise.race([
    page.waitForFunction(
      (count) => document.querySelectorAll('.el-message--success').length > count,
      previousCount,
    ),
    page
      .waitForFunction(
        (count) => document.querySelectorAll('.el-message--error').length > count,
        previousErrorCount,
      )
      .then(async () => {
        const message = await errorMessages.last().textContent()
        throw new Error(message || 'Model save failed')
      }),
  ])
}

async function assertNoUnsupportedActions(page) {
  const testIds = await page.locator('[data-testid]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-testid') || ''),
  )
  assert.equal(
    testIds.some((value) => /(export|deploy|publish)/i.test(value)),
    false,
    `unsupported action test id is visible: ${testIds.join(', ')}`,
  )
  const buttonText = (await page.getByRole('button').allTextContents()).join(' | ')
  assert.equal(
    /\b(export|deploy|publish)\b/i.test(buttonText),
    false,
    `unsupported action button is visible: ${buttonText}`,
  )
}

async function paletteActions(page) {
  const palette = page.locator('.structured-canvas .djs-palette')
  await palette.waitFor({ state: 'visible' })
  return new Set(
    await palette.locator('[data-action]').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-action') || ''),
    ),
  )
}

function assertActions(actions, expected, unsupported, label) {
  for (const action of expected) {
    assert.equal(actions.has(action), true, `${label} is missing ${action}`)
  }
  for (const action of unsupported) {
    assert.equal(actions.has(action), false, `${label} exposes unsupported ${action}`)
  }
}

async function assertStructuredPalette(page, modelType) {
  if (modelType === MODEL_TYPES.case) {
    assertActions(
      await paletteActions(page),
      ['create.task', 'create.stage', 'create.milestone', 'create.eventListener', 'create.criterion'],
      ['create.casePlanModel', 'create.caseFileItem'],
      'CMMN palette',
    )
    console.log('[pass] CMMN palette matches the supported Flowable model surface')
  } else if (modelType === MODEL_TYPES.decisionService) {
    assertActions(
      await paletteActions(page),
      ['create.decision'],
      ['create.input-data', 'create.knowledge-source', 'create.business-knowledge-model'],
      'decision-service palette',
    )
    console.log('[pass] decision-service palette matches Flowable UI terminology and elements')
  }
}

async function contextPadActions(page) {
  const contextPad = page.locator('.structured-canvas .djs-context-pad')
  await contextPad.waitFor({ state: 'visible' })
  return new Set(
    await contextPad.locator('[data-action]').evaluateAll((elements) =>
      elements.map((element) => element.getAttribute('data-action') || ''),
    ),
  )
}

async function assertCmmnCapabilityBoundary(page) {
  assertActions(
    await contextPadActions(page),
    ['append.entryCriterion', 'replace', 'connect', 'delete'],
    ['append.discretionaryItem', 'append.text-annotation'],
    'CMMN context pad',
  )
  await page.locator('.structured-canvas .djs-context-pad [data-action="replace"]').click()
  const popup = page.locator('.djs-popup.cmmn-replace')
  await popup.waitFor({ state: 'visible' })
  const entryIds = await popup.locator('[data-id]').evaluateAll((elements) =>
    elements.map((element) => element.getAttribute('data-id') || ''),
  )
  assert.equal(
    entryIds.some((id) => /discretionary|collapsed-stage|toggle-/i.test(id)),
    false,
    `CMMN replace menu exposes unsupported entries: ${entryIds.join(', ')}`,
  )
  await page.keyboard.press('Escape')
  console.log('[pass] unsupported CMMN context and replace actions are removed')
}

async function assertDecisionServiceCapabilityBoundary(page) {
  assertActions(
    await contextPadActions(page),
    ['append.decision', 'connect', 'delete'],
    [
      'append.input-data',
      'append.knowledge-source',
      'append.business-knowledge-model',
      'append.text-annotation',
      'replace',
    ],
    'decision-service context pad',
  )
  console.log('[pass] unsupported decision-service context actions are removed')
}

async function createAndReopenModel(page, baseUrl, modelType, name, key) {
  const description = `${name} description`
  await openList(page, baseUrl, listPath(modelType))
  if (modelType !== MODEL_TYPES.process) {
    assert.equal(
      await page.locator('[data-testid="import-model"]').count(),
      0,
      'CMMN and DMN lists must not expose an import action',
    )
  }
  await page.locator('[data-testid="create-model"]').click()
  await page.locator('[data-testid="model-create-name"]').fill(name)
  await page.locator('[data-testid="model-create-key"]').fill(key)
  await page.locator('[data-testid="model-create-description"]').fill(description)
  await page.locator('[data-testid="confirm-create-model"]').click()
  try {
    await waitForEditor(page, modelType)
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '')
    const storedModels = await readStoredModels(page).catch(() => [])
    console.error(`[create failure] ${key} url=${page.url()}`)
    console.error(bodyText.slice(0, 2_000))
    console.error(JSON.stringify(storedModels.map(({ id, key: storedKey }) => ({ id, key: storedKey }))))
    throw error
  }
  const id = currentEditorId(page)
  assert.ok(id, `created model id is missing for ${key}`)
  const createdRecord = (await readStoredModels(page)).find((record) => record.id === id)
  assert.ok(createdRecord, `new local model was not stored: ${key}`)
  assert.deepEqual(
    createdRecord.editorModel,
    flowableEditorModelForCreate({ name, key, description, modelType }),
    `local create JSON does not mirror Flowable for ${key}`,
  )
  await assertNoUnsupportedActions(page)
  await assertStructuredPalette(page, modelType)
  await saveModel(page)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForEditor(page, modelType)
  assert.equal(currentEditorId(page), id, `refresh changed the editor id for ${key}`)
  await page.locator('[data-testid="back-to-models"]').click()
  await page.locator('[data-testid="model-list-page"]').waitFor({ state: 'visible' })
  const modelRow = page.locator(`[data-testid="model-row"][data-model-id="${id}"]`)
  assert.equal(
    await modelRow.locator('[data-testid="delete-model"]').count(),
    1,
    'saved models must expose the Flowable delete action',
  )
  assert.equal(
    await modelRow.locator('[data-testid="download-model"]').count(),
    1,
    'saved models must expose the Flowable download action',
  )
  const record = (await readStoredModels(page)).find((candidate) => candidate.id === id)
  assert.ok(record, `created model was not stored: ${key}`)
  assert.equal(record.modelType, modelType)
  const downloadPromise = page.waitForEvent('download')
  await modelRow.locator('[data-testid="download-model"]').click()
  const download = await downloadPromise
  const expectedFileName = modelType === MODEL_TYPES.process
    ? `${name.replaceAll(' ', '_')}.bpmn20.xml`
    : modelType === MODEL_TYPES.case
      ? `${name.replaceAll(' ', '_')}.cmmn.xml`
      : `${name}.dmn`
  assert.equal(download.suggestedFilename(), expectedFileName)
  const downloadStream = await download.createReadStream()
  const chunks = []
  for await (const chunk of downloadStream) chunks.push(Buffer.from(chunk))
  const downloadedXml = Buffer.concat(chunks).toString('utf8')
  assert.match(downloadedXml, /<[^>]*definitions\b/i, `downloaded XML is invalid: ${key}`)
  console.log(`[pass] Flowable XML download: ${expectedFileName}`)
  console.log(`[pass] create, save, refresh and reopen: ${key}`)
  return record
}

async function createAndDeleteLocalModel(page, baseUrl) {
  await openList(page, baseUrl, '/processes')
  await page.locator('[data-testid="create-model"]').click()
  await page.locator('[data-testid="model-create-name"]').fill('Disposable process')
  await page.locator('[data-testid="model-create-key"]').fill('disposable_process')
  await page.locator('[data-testid="confirm-create-model"]').click()
  await waitForEditor(page, MODEL_TYPES.process)
  const id = currentEditorId(page)
  await page.locator('[data-testid="back-to-models"]').click()
  const modelRow = page.locator(`[data-testid="model-row"][data-model-id="${id}"]`)
  await modelRow.waitFor({ state: 'visible' })
  await modelRow.locator('[data-testid="delete-model"]').click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await modelRow.waitFor({ state: 'detached' })
  assert.equal(
    (await readStoredModels(page)).some((record) => record.id === id),
    false,
    'deleted local model remains in IndexedDB',
  )
  console.log('[pass] Flowable delete action removes the saved local model')
}

async function openStoredEditor(page, baseUrl, record) {
  await page.goto(`${baseUrl}#${editorPath(record.modelType, record.id)}?lang=en`, {
    waitUntil: 'domcontentloaded',
  })
  await waitForEditor(page, record.modelType)
}

async function selectReference(page, selector, label) {
  const select = page.locator(selector)
  await select.waitFor({ state: 'visible' })
  await select.click()
  const option = page.locator('.el-select-dropdown__item:visible').filter({ hasText: label }).first()
  await option.waitFor({ state: 'visible' })
  await option.click()
}

async function assertSelectedReference(page, selector, label) {
  const text = await page.locator(selector).textContent()
  assert.match(text || '', new RegExp(label), `reference was not restored: ${label}`)
}

async function openLocalReferenceAndAssertSaved(page, source, target, buttonSelector) {
  const before = (await readStoredModels(page)).find((record) => record.id === source.id)
  assert.ok(before, `reference source is missing before navigation: ${source.key}`)
  await page.locator(buttonSelector).click()
  await waitForEditor(page, target.modelType)
  assert.equal(
    currentEditorId(page),
    target.id,
    `reference navigation did not open ${target.key}`,
  )
  const after = (await readStoredModels(page)).find((record) => record.id === source.id)
  assert.ok(after, `reference source is missing after navigation: ${source.key}`)
  assert.ok(
    after.lastUpdated > before.lastUpdated,
    `reference navigation did not save ${source.key} first`,
  )
  return after
}

async function selectStructuredElement(page, semanticId) {
  const element = page.locator(`.structured-canvas [data-element-id="${semanticId}"]`)
  await element.waitFor({ state: 'visible' })
  const hitTarget = element.locator('.djs-hit').first()
  if (await hitTarget.count()) await hitTarget.click({ position: { x: 12, y: 12 } })
  else await element.click()
  await page.locator('[data-testid="structured-element-name"]').waitFor({ state: 'visible' })
}

async function verifyModelTabs(page, baseUrl) {
  await page.goto(`${baseUrl}#/processes?lang=zh-CN`, { waitUntil: 'domcontentloaded' })
  await page.locator('[data-testid="model-list-page"]').waitFor({ state: 'visible' })
  const chineseTabs = page.locator('[data-testid="model-category-tabs"] .el-tabs__item')
  assert.deepEqual(
    (await chineseTabs.allTextContents()).map((value) => value.trim()),
    ['流程', '案例模型', '决策表'],
  )

  await openList(page, baseUrl)
  const tabs = page.locator('[data-testid="model-category-tabs"] .el-tabs__item')
  assert.deepEqual(
    (await tabs.allTextContents()).map((value) => value.trim()),
    ['Processes', 'Case models', 'Decisions'],
  )
  assert.match(page.url(), /#\/processes/)

  await tabs.filter({ hasText: 'Case models' }).click()
  await page.waitForURL(/#\/cases/)
  await page.locator('[data-testid="model-list-page"]').waitFor()

  await page
    .locator('[data-testid="model-category-tabs"] .el-tabs__item')
    .filter({ hasText: 'Decisions' })
    .click()
  await page.waitForURL(/#\/decisions/)
  const decisionType = page.locator('[data-testid="decision-type"]')
  await decisionType.waitFor({ state: 'visible' })
  assert.match((await decisionType.textContent()) || '', /Decision tables/)
  assert.match((await decisionType.textContent()) || '', /Decision services/)
  console.log('[pass] Flowable model terminology and default process tab')
}

function assertDecisionTableRoundTrip(editorModel) {
  assert.equal(editorModel.inputExpressions.length, 3)
  assert.equal(editorModel.outputExpressions.length, 1)
  assert.equal(editorModel.rules.length, 2)
  assert.equal(editorModel.rules[0].input_age_operator, '>=')
  assert.equal(editorModel.rules[0].input_age_expression, '18')
  assert.equal(editorModel.rules[0].input_country_expression, 'TH')
  assert.equal(editorModel.rules[0].input_date_expression, '2026-01-01')
  assert.equal(editorModel.rules[0].output_result, 'approved')
  assert.deepEqual(editorModel.inputExpressions[1].entries, ['TH', 'US'])
  assert.deepEqual(editorModel.outputExpressions[0].entries, ['approved', 'rejected'])
  assert.equal(editorModel.outputExpressions[0].newVariable, true)
}

function assertCrossModelReferences(records) {
  const processModel = records.find((record) => record.key === 'cross_process')
  const caseModel = records.find((record) => record.key === 'cross_case')
  const processTarget = records.find((record) => record.key === 'target_process')
  const caseTarget = records.find((record) => record.key === 'target_case')
  const table = records.find((record) => record.key === 'risk_table')
  const service = records.find((record) => record.key === 'risk_service')
  for (const value of [processModel, caseModel, processTarget, caseTarget, table, service]) {
    assert.ok(value, 'a cross-model fixture is missing')
  }

  assertReference(
    findShape(processModel.editorModel, 'Task_table').properties.decisiontaskdecisiontablereference,
    table,
    'BPMN decision-table reference',
  )
  assertReference(
    findShape(processModel.editorModel, 'Task_service').properties.decisiontaskdecisionservicereference,
    service,
    'BPMN decision-service reference',
  )
  assertReference(
    findShape(caseModel.editorModel, 'case-process-task').properties.processtaskprocessreference,
    processTarget,
    'CMMN process reference',
  )
  assertReference(
    findShape(caseModel.editorModel, 'case-case-task').properties.casetaskcasereference,
    caseTarget,
    'CMMN case reference',
  )
  assertReference(
    findShape(caseModel.editorModel, 'case-table-task').properties.decisiontaskdecisiontablereference,
    table,
    'CMMN decision-table reference',
  )
  assertReference(
    findShape(caseModel.editorModel, 'case-service-task').properties.decisiontaskdecisionservicereference,
    service,
    'CMMN decision-service reference',
  )
  assertReference(
    findShape(service.editorModel, 'service-decision').properties.decisiondecisiontablereference,
    table,
    'decision-service decision-table reference',
  )
  assertFlowableEdge(
    caseModel,
    'case-sentry-association',
    'case-process-task',
    'case-entry-criterion',
    'CMMN sentry association',
  )
  assertFlowableEdge(
    service,
    'service-information-requirement',
    'service-required-decision',
    'service-decision',
    'decision-service information requirement',
  )
  assertDecisionTableRoundTrip(table.editorModel)
}

async function runLocalModeSuite(browser) {
  const server = await startViteServer(false)
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => {
      const details = error.stack || error.message
      pageErrors.push(details)
      console.error(`[browser page error] ${details}`)
    })
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`[browser console] ${message.text()}`)
    })

    await verifyModelTabs(page, server.baseUrl)
    const processTarget = await createAndReopenModel(
      page,
      server.baseUrl,
      MODEL_TYPES.process,
      'Target process',
      'target_process',
    )
    const caseTarget = await createAndReopenModel(
      page,
      server.baseUrl,
      MODEL_TYPES.case,
      'Target case',
      'target_case',
    )
    let table = await createAndReopenModel(
      page,
      server.baseUrl,
      MODEL_TYPES.decisionTable,
      'Risk table',
      'risk_table',
    )
    let service = await createAndReopenModel(
      page,
      server.baseUrl,
      MODEL_TYPES.decisionService,
      'Risk service',
      'risk_service',
    )
    let caseModel = await createAndReopenModel(
      page,
      server.baseUrl,
      MODEL_TYPES.case,
      'Cross-model case',
      'cross_case',
    )
    console.log('[pass] IndexedDB create JSON mirrors Flowable createModelJson')

    await replaceStoredEditorModel(page, table.id, decisionTableEditor(table))
    await openStoredEditor(page, server.baseUrl, table)
    assert.equal(await page.locator('.dmn-decision-table-container tbody tr').count(), 2)
    await saveModel(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForEditor(page, MODEL_TYPES.decisionTable)
    assert.equal(await page.locator('.dmn-decision-table-container tbody tr').count(), 2)
    table = (await readStoredModels(page)).find((record) => record.id === table.id)
    assertDecisionTableRoundTrip(table.editorModel)
    console.log('[pass] Flowable decision-table JSON round-trip')

    await replaceStoredEditorModel(page, service.id, decisionServiceEditorWithReference(service))
    await openStoredEditor(page, server.baseUrl, service)
    await selectStructuredElement(page, 'serviceDecision')
    await assertDecisionServiceCapabilityBoundary(page)
    await selectReference(page, '[data-testid="structured-model-reference"]', table.name)
    await saveModel(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForEditor(page, MODEL_TYPES.decisionService)
    await selectStructuredElement(page, 'serviceDecision')
    await assertSelectedReference(page, '[data-testid="structured-model-reference"]', table.name)
    service = (await readStoredModels(page)).find((record) => record.id === service.id)
    service = await openLocalReferenceAndAssertSaved(
      page,
      service,
      table,
      '[data-testid="open-structured-model-reference"]',
    )
    console.log('[pass] decision-service reference saves and opens the decision table')
    console.log('[pass] decision service -> decision table reference')

    await replaceStoredEditorModel(page, caseModel.id, caseEditorWithReferences(caseModel))
    await openStoredEditor(page, server.baseUrl, caseModel)
    await selectStructuredElement(page, 'case-process-task_planItem')
    await assertCmmnCapabilityBoundary(page)
    await selectReference(page, '[data-testid="structured-model-reference"]', processTarget.name)
    await selectStructuredElement(page, 'case-case-task_planItem')
    await selectReference(page, '[data-testid="structured-model-reference"]', caseTarget.name)
    await selectStructuredElement(page, 'case-table-task_planItem')
    await selectReference(page, '[data-testid="structured-model-reference"]', table.name)
    await selectStructuredElement(page, 'case-service-task_planItem')
    await selectReference(page, '[data-testid="structured-model-reference"]', service.name)
    await saveModel(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForEditor(page, MODEL_TYPES.case)
    await selectStructuredElement(page, 'case-process-task_planItem')
    await assertSelectedReference(page, '[data-testid="structured-model-reference"]', processTarget.name)
    await selectStructuredElement(page, 'case-case-task_planItem')
    await assertSelectedReference(page, '[data-testid="structured-model-reference"]', caseTarget.name)
    await selectStructuredElement(page, 'case-table-task_planItem')
    await assertSelectedReference(page, '[data-testid="structured-model-reference"]', table.name)
    await selectStructuredElement(page, 'case-service-task_planItem')
    await assertSelectedReference(page, '[data-testid="structured-model-reference"]', service.name)
    caseModel = (await readStoredModels(page)).find((record) => record.id === caseModel.id)
    caseModel = await openLocalReferenceAndAssertSaved(
      page,
      caseModel,
      service,
      '[data-testid="open-structured-model-reference"]',
    )
    console.log('[pass] CMMN reference saves and opens the decision service')
    console.log('[pass] CMMN forward references survive save and reopen')

    await openList(page, server.baseUrl, '/processes')
    await page.locator('[data-testid="model-import-input"]').setInputFiles({
      name: 'cross-model-process.bpmn20.xml',
      mimeType: 'application/xml',
      buffer: Buffer.from(crossModelProcessXml),
    })
    await waitForEditor(page, MODEL_TYPES.process)
    await page.locator('[data-element-id="Task_table"]').click()
    await selectReference(page, '[data-testid="decision-model-reference"]', table.name)
    await page.locator('[data-element-id="Task_service"]').click()
    await selectReference(page, '[data-testid="decision-model-reference"]', service.name)
    await saveModel(page)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await waitForEditor(page, MODEL_TYPES.process)
    await page.locator('[data-element-id="Task_table"]').click()
    await assertSelectedReference(page, '[data-testid="decision-model-reference"]', table.name)
    await page.locator('[data-element-id="Task_service"]').click()
    await assertSelectedReference(page, '[data-testid="decision-model-reference"]', service.name)
    let processModel = (await readStoredModels(page)).find(
      (record) => record.key === 'cross_process',
    )
    assert.ok(processModel, 'the cross-model BPMN process is missing')
    processModel = await openLocalReferenceAndAssertSaved(
      page,
      processModel,
      service,
      '[data-testid="open-decision-model-reference"]',
    )
    console.log('[pass] BPMN reference saves and opens the decision service')
    await assertNoUnsupportedActions(page)
    console.log('[pass] BPMN -> decision table and decision service references')

    await createAndDeleteLocalModel(page, server.baseUrl)
    const records = await readStoredModels(page)
    assertCrossModelReferences(records)
    assert.deepEqual(pageErrors, [], `local browser page errors: ${pageErrors.join('; ')}`)
    console.log('Local IndexedDB model suite passed.')
    return records
  } finally {
    await context.close()
    await stopProcess(server.child)
  }
}

function publicModel(record) {
  const { editorModel: _editorModel, ...model } = record
  return structuredClone(model)
}

function flowableEditorModelForCreate(input) {
  if (input.modelType === MODEL_TYPES.decisionTable) {
    return {
      modelVersion: '3',
      key: input.name.replaceAll(' ', ''),
      forceDMN11: false,
    }
  }

  const properties = { name: input.name }
  if (input.description) properties.documentation = input.description

  if (input.modelType === MODEL_TYPES.case) {
    properties.case_id = input.key
    return {
      id: 'canvas',
      resourceId: 'canvas',
      stencilset: { namespace: 'http://b3mn.org/stencilset/cmmn1.1#' },
      properties,
      childShapes: [
        {
          bounds: bounds(40, 40, 718, 714),
          childShapes: [],
          dockers: [],
          outgoing: [],
          resourceId: 'casePlanModel',
          stencil: { id: 'CasePlanModel' },
        },
      ],
    }
  }

  if (input.modelType === MODEL_TYPES.decisionService) {
    properties.drd_id = input.key
    return {
      id: 'canvas',
      resourceId: 'canvas',
      stencilset: { namespace: 'http://b3mn.org/stencilset/dmn1.2#' },
      bounds: bounds(0, 0, 1200, 1050),
      properties,
      childShapes: [
        {
          bounds: bounds(150, 74, 600, 480),
          childShapes: [
            {
              bounds: bounds(0, 0, 600, 240),
              childShapes: [],
              dockers: [],
              outgoing: [],
              resourceId: 'outputDecisions',
              stencil: { id: 'OutputDecisionsDecisionServiceSection' },
            },
            {
              bounds: bounds(0, 240, 600, 240),
              childShapes: [],
              dockers: [],
              outgoing: [],
              resourceId: 'encapsulatedDecisions',
              stencil: { id: 'EncapsulatedDecisionsDecisionServiceSection' },
            },
          ],
          dockers: [],
          outgoing: [],
          resourceId: 'expandedDecisionService',
          stencil: { id: 'ExpandedDecisionService' },
        },
      ],
    }
  }

  properties.process_id = input.key
  return {
    id: 'canvas',
    resourceId: 'canvas',
    stencilset: { namespace: 'http://b3mn.org/stencilset/bpmn2.0#' },
    properties,
    childShapes: [
      {
        bounds: bounds(100, 163, 30, 30),
        childShapes: [],
        dockers: [],
        outgoing: [],
        resourceId: 'startEvent1',
        stencil: { id: 'StartNoneEvent' },
      },
    ],
  }
}

function decisionTableRepresentation(record) {
  return {
    id: record.id,
    name: record.name,
    key: record.key,
    description: record.description,
    version: record.version,
    lastUpdatedBy: record.lastUpdatedBy,
    lastUpdated: record.lastUpdated,
    decisionTableDefinition: structuredClone(record.editorModel),
  }
}

async function createBackendModel(page, baseUrl, modelType, createRequests, saveRequests) {
  const suffix = String(modelType)
  const input = {
    name: `Backend model ${suffix}`,
    key: `backend_model_${suffix}`,
    description: `Backend model ${suffix} description`,
    modelType,
  }
  await openList(page, baseUrl, listPath(modelType))
  await page.locator('[data-testid="create-model"]').click()
  await page.locator('[data-testid="model-create-name"]').fill(input.name)
  await page.locator('[data-testid="model-create-key"]').fill(input.key)
  await page.locator('[data-testid="model-create-description"]').fill(input.description)
  await page.locator('[data-testid="confirm-create-model"]').click()
  await waitForEditor(page, modelType)
  const id = currentEditorId(page)
  const createRequest = createRequests.find((request) => request.id === id)
  assert.ok(createRequest, `backend create request is missing for model type ${modelType}`)
  assert.deepEqual(createRequest.body, input)
  await assertStructuredPalette(page, modelType)
  await saveModel(page)
  const saveRequest = saveRequests.findLast((request) => request.id === id)
  assert.ok(saveRequest, `initial backend save request is missing for model type ${modelType}`)
  if (modelType === MODEL_TYPES.decisionTable) {
    assert.equal(saveRequest.kind, 'decision-table')
    assert.equal(saveRequest.body.newVersion, false)
    assert.equal('lastUpdated' in saveRequest.body, false)
    assert.equal('conflictResolveAction' in saveRequest.body, false)
    assert.match(saveRequest.body.decisionTableImageBase64, /^data:image\/png;base64,./)
    assert.equal(saveRequest.body.decisionTableRepresentation.name, input.name)
    assert.equal(saveRequest.body.decisionTableRepresentation.key, input.key)
    assert.equal(saveRequest.body.decisionTableRepresentation.description, input.description)
    assert.deepEqual(
      saveRequest.body.decisionTableRepresentation.decisionTableDefinition,
      saveRequest.editorModel,
    )
  } else {
    assert.equal(saveRequest.kind, 'editor-json')
    assert.equal(saveRequest.body.name, input.name)
    assert.equal(saveRequest.body.key, input.key)
    assert.equal(saveRequest.body.description, input.description)
    assert.ok(saveRequest.body.json_xml, `initial json_xml is missing for model type ${modelType}`)
  }
}

async function runBackendMockSuite(browser, localRecords) {
  const server = await startViteServer(true)
  const context = await browser.newContext({ viewport: { width: 1366, height: 930 } })
  const records = new Map(localRecords.map((record) => [record.id, structuredClone(record)]))
  const listRequests = []
  const createRequests = []
  const saveRequests = []
  const forbiddenRequests = []
  const unhandledRequests = []

  try {
    const page = await context.newPage()
    const pageErrors = []
    page.on('pageerror', (error) => pageErrors.push(error.message))
    await page.route('**/modeler-app/rest/**', async (route) => {
      const request = route.request()
      const url = new URL(request.url())
      const path = url.pathname
      const method = request.method()

      if (
        method === 'DELETE' ||
        /\/bpmn20(?:\/|$)|import-process-model|parent-relations|\/deploy|\/publish|\/export/i.test(path)
      ) {
        forbiddenRequests.push(`${method} ${path}`)
        await route.fulfill({ status: 410, json: { message: 'Forbidden modeler endpoint' } })
        return
      }
      if (path.endsWith('/account') && method === 'GET') {
        await route.fulfill({ json: { id: 'browser-user', fullName: 'Browser User' } })
        return
      }
      if (path.endsWith('/models') && method === 'GET') {
        const modelType = Number(url.searchParams.get('modelType'))
        const filter = url.searchParams.get('filter')
        listRequests.push({ filter, modelType })
        const data = [...records.values()]
          .filter((record) => record.modelType === modelType)
          .map(publicModel)
        await route.fulfill({ json: { size: data.length, total: data.length, start: 0, data } })
        return
      }
      if (path.endsWith('/models') && method === 'POST') {
        const body = request.postDataJSON()
        const id = `backend-created-${body.modelType}-${createRequests.length + 1}`
        const lastUpdated = Date.now() + createRequests.length
        const record = {
          id,
          name: body.name,
          key: body.key,
          description: body.description || '',
          createdBy: 'browser-user',
          lastUpdatedBy: 'browser-user',
          lastUpdated,
          latestVersion: true,
          version: 1,
          comment: '',
          modelType: body.modelType,
          tenantId: '',
          editorModel: flowableEditorModelForCreate(body),
        }
        records.set(id, record)
        createRequests.push({ id, body })
        await route.fulfill({ json: publicModel(record) })
        return
      }

      const decisionTableMatch = path.match(/\/decision-table-models\/([^/]+)$/)
      if (decisionTableMatch) {
        const id = decodeURIComponent(decisionTableMatch[1])
        const record = records.get(id)
        if (!record || record.modelType !== MODEL_TYPES.decisionTable) {
          await route.fulfill({ status: 404, json: { message: `Unknown decision table: ${id}` } })
          return
        }
        if (method === 'GET') {
          await route.fulfill({ json: decisionTableRepresentation(record) })
          return
        }
        if (method === 'PUT') {
          const body = request.postDataJSON()
          const representation = body.decisionTableRepresentation || {}
          record.name = representation.name || record.name
          record.key = representation.key || record.key
          record.description = representation.description || ''
          record.editorModel = structuredClone(representation.decisionTableDefinition || {})
          record.lastUpdated = Math.max(Date.now(), record.lastUpdated + 1)
          if (body.newVersion === true) record.version += 1
          saveRequests.push({
            id,
            kind: 'decision-table',
            body,
            editorModel: structuredClone(record.editorModel),
          })
          await route.fulfill({ json: decisionTableRepresentation(record) })
          return
        }
      }

      const editorMatch = path.match(/\/models\/([^/]+)\/editor\/json$/)
      if (editorMatch) {
        const id = decodeURIComponent(editorMatch[1])
        const record = records.get(id)
        if (!record) {
          await route.fulfill({ status: 404, json: { message: `Unknown model: ${id}` } })
          return
        }
        if (record.modelType === MODEL_TYPES.decisionTable) {
          unhandledRequests.push(`${method} ${path}`)
          await route.fulfill({
            status: 500,
            json: { message: 'Decision tables must use the dedicated Flowable resource' },
          })
          return
        }
        if (method === 'GET') {
          await route.fulfill({
            json: {
              modelId: record.id,
              name: record.name,
              key: record.key,
              description: record.description,
              lastUpdated: record.lastUpdated,
              lastUpdatedBy: record.lastUpdatedBy,
              model: structuredClone(record.editorModel),
            },
          })
          return
        }
        if (method === 'POST') {
          const body = new URLSearchParams(request.postData() || '')
          const editorModel = JSON.parse(body.get('json_xml') || '{}')
          saveRequests.push({
            id,
            kind: 'editor-json',
            body: Object.fromEntries(body),
            editorModel,
          })
          record.name = body.get('name') || record.name
          record.key = body.get('key') || record.key
          record.description = body.get('description') || ''
          record.editorModel = editorModel
          record.lastUpdated = Math.max(Date.now(), record.lastUpdated + 1)
          await route.fulfill({ json: publicModel(record) })
          return
        }
      }

      const modelMatch = path.match(/\/models\/([^/]+)$/)
      if (modelMatch && method === 'GET') {
        const record = records.get(decodeURIComponent(modelMatch[1]))
        if (record) {
          await route.fulfill({ json: publicModel(record) })
          return
        }
      }

      unhandledRequests.push(`${method} ${path}`)
      await route.fulfill({ status: 500, json: { message: `Unhandled browser mock: ${path}` } })
    })

    await verifyModelTabs(page, server.baseUrl)
    for (const modelType of Object.values(MODEL_TYPES)) {
      await createBackendModel(
        page,
        server.baseUrl,
        modelType,
        createRequests,
        saveRequests,
      )
    }
    console.log('[pass] Flowable create and model-specific initial save payloads')
    await openList(page, server.baseUrl, '/decisions?type=service')
    await page.locator('[data-testid="decision-type"]').waitFor({ state: 'visible' })

    const byKey = (key) => [...records.values()].find((record) => record.key === key)
    const modelsToSave = [
      byKey('cross_process'),
      byKey('cross_case'),
      byKey('risk_table'),
      byKey('risk_service'),
    ]
    for (const record of modelsToSave) {
      assert.ok(record, 'backend mock model is missing')
      const previousTimestamp = record.lastUpdated
      await openStoredEditor(page, server.baseUrl, record)
      await assertNoUnsupportedActions(page)
      await saveModel(page)
      const request = saveRequests.findLast((candidate) => candidate.id === record.id)
      assert.ok(request, `backend save request is missing: ${record.key}`)
      if (record.modelType === MODEL_TYPES.decisionTable) {
        assert.equal(request.kind, 'decision-table')
        assert.equal(request.body.newVersion, false)
        assert.equal('lastUpdated' in request.body, false)
        assert.equal('conflictResolveAction' in request.body, false)
        assert.match(request.body.decisionTableImageBase64, /^data:image\/png;base64,./)
        assert.equal(request.body.decisionTableRepresentation.name, record.name)
        assert.equal(request.body.decisionTableRepresentation.key, record.key)
        assert.deepEqual(
          request.body.decisionTableRepresentation.decisionTableDefinition,
          request.editorModel,
        )
      } else {
        assert.equal(request.kind, 'editor-json')
        assert.equal(request.body.name, record.name)
        assert.equal(request.body.key, record.key)
        assert.equal(request.body.lastUpdated, String(previousTimestamp))
        assert.equal(request.body.newversion, 'false')
        assert.ok(request.body.json_xml, `json_xml is missing: ${record.key}`)
      }
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForEditor(page, record.modelType)
    }

    const sourceCase = byKey('cross_case')
    const targetService = byKey('risk_service')
    assert.ok(sourceCase && targetService, 'backend reference-navigation fixtures are missing')
    await openStoredEditor(page, server.baseUrl, sourceCase)
    await selectStructuredElement(page, 'case-service-task_planItem')
    await assertSelectedReference(
      page,
      '[data-testid="structured-model-reference"]',
      targetService.name,
    )
    const saveCountBeforeReferenceOpen = saveRequests.length
    await page.locator('[data-testid="open-structured-model-reference"]').click()
    await waitForEditor(page, targetService.modelType)
    assert.equal(currentEditorId(page), targetService.id)
    assert.equal(saveRequests.length, saveCountBeforeReferenceOpen + 1)
    assert.equal(saveRequests.at(-1)?.id, sourceCase.id)
    assert.equal(saveRequests.at(-1)?.kind, 'editor-json')
    console.log('[pass] Flowable reference navigation saves before opening its target')

    for (const request of listRequests) {
      assert.equal(
        request.filter,
        FILTER_BY_MODEL_TYPE.get(request.modelType),
        `wrong Flowable list filter for model type ${request.modelType}`,
      )
    }
    for (const [modelType, filter] of FILTER_BY_MODEL_TYPE) {
      assert.ok(
        listRequests.some((request) => request.modelType === modelType && request.filter === filter),
        `Flowable list request was not made: ${filter}`,
      )
    }

    const savedRecords = [...records.values()]
    assertCrossModelReferences(savedRecords)
    assert.deepEqual(forbiddenRequests, [], `forbidden backend calls: ${forbiddenRequests.join('; ')}`)
    assert.deepEqual(unhandledRequests, [], `unhandled backend calls: ${unhandledRequests.join('; ')}`)
    assert.deepEqual(pageErrors, [], `backend-mock page errors: ${pageErrors.join('; ')}`)
    console.log('[pass] Flowable API filters and model-specific save request bodies')
    console.log('Frontend-only Flowable backend mock suite passed.')
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
  const localRecords = await runLocalModeSuite(browser)
  await runBackendMockSuite(browser, localRecords)
  console.log('Browser model closure passed.')
} finally {
  await browser.close()
}
