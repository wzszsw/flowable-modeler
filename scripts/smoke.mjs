import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

import { chromium } from 'playwright-core'

const port = 4174
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
const p0ExtensionXml = readFileSync(
  'scripts/fixtures/flowable-p0-extensions.bpmn20.xml',
  'utf8',
)

const collaborationXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  id="Definitions_pool"
  targetNamespace="http://flowable.org/processdef">
  <bpmn:process id="Process_pool" name="池内流程" isExecutable="true">
    <bpmn:startEvent id="Start_pool">
      <bpmn:outgoing>Flow_start_subprocess</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:subProcess id="SubProcess_collapsed" name="折叠处理">
      <bpmn:incoming>Flow_start_subprocess</bpmn:incoming>
      <bpmn:outgoing>Flow_subprocess_end</bpmn:outgoing>
      <bpmn:task id="Task_nested" name="内部任务" />
    </bpmn:subProcess>
    <bpmn:endEvent id="End_pool">
      <bpmn:incoming>Flow_subprocess_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_subprocess" sourceRef="Start_pool" targetRef="SubProcess_collapsed" />
    <bpmn:sequenceFlow id="Flow_subprocess_end" sourceRef="SubProcess_collapsed" targetRef="End_pool" />
    <bpmn:textAnnotation id="Annotation_pool">
      <bpmn:text>流程备注</bpmn:text>
    </bpmn:textAnnotation>
    <bpmn:association id="Association_pool_note" sourceRef="Start_pool" targetRef="Annotation_pool" />
  </bpmn:process>
  <bpmn:collaboration id="Collaboration_pool" name="协作池">
    <bpmn:participant id="Participant_pool" name="业务池" processRef="Process_pool" />
    <bpmn:participant id="Participant_black_box" name="外部参与方" />
    <bpmn:messageFlow id="MessageFlow_black_box" sourceRef="Participant_black_box" targetRef="Participant_pool" />
  </bpmn:collaboration>
  <bpmndi:BPMNDiagram id="BPMNDiagram_pool">
    <bpmndi:BPMNPlane id="BPMNPlane_pool" bpmnElement="Collaboration_pool">
      <bpmndi:BPMNShape id="Participant_pool_di" bpmnElement="Participant_pool" isHorizontal="true">
        <dc:Bounds x="100" y="100" width="700" height="260" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Participant_black_box_di" bpmnElement="Participant_black_box" isHorizontal="true">
        <dc:Bounds x="100" y="430" width="700" height="130" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Start_pool_di" bpmnElement="Start_pool">
        <dc:Bounds x="190" y="210" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SubProcess_collapsed_di" bpmnElement="SubProcess_collapsed" isExpanded="false">
        <dc:Bounds x="300" y="160" width="220" height="140" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_nested_di" bpmnElement="Task_nested">
        <dc:Bounds x="335" y="195" width="100" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_pool_di" bpmnElement="End_pool">
        <dc:Bounds x="650" y="210" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Annotation_pool_di" bpmnElement="Annotation_pool">
        <dc:Bounds x="180" y="300" width="120" height="45" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_subprocess_di" bpmnElement="Flow_start_subprocess">
        <di:waypoint x="226" y="228" />
        <di:waypoint x="300" y="228" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_subprocess_end_di" bpmnElement="Flow_subprocess_end">
        <di:waypoint x="520" y="228" />
        <di:waypoint x="650" y="228" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Association_pool_note_di" bpmnElement="Association_pool_note">
        <di:waypoint x="208" y="246" />
        <di:waypoint x="208" y="300" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="MessageFlow_black_box_di" bpmnElement="MessageFlow_black_box">
        <di:waypoint x="450" y="430" />
        <di:waypoint x="450" y="360" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const customExtensionXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flowable="http://flowable.org/bpmn"
  id="Definitions_custom_extensions"
  targetNamespace="http://flowable.org/processdef">
  <bpmn:message id="Message_custom" name="业务消息" />
  <bpmn:message id="Message_hidden" name="无图消息" />
  <bpmn:signal id="Signal_custom" name="业务信号" flowable:scope="global" />
  <bpmn:error id="Error_custom" name="业务错误" errorCode="BUSINESS_ERROR" flowable:errorMessage="业务处理失败" />
  <bpmn:process id="Process_custom_extensions" name="自定义扩展往返" isExecutable="true">
    <bpmn:startEvent id="StartEvent_custom">
      <bpmn:outgoing>Flow_start_task</bpmn:outgoing>
      <bpmn:messageEventDefinition id="MessageEventDefinition_custom" messageRef="Message_custom" />
    </bpmn:startEvent>
    <bpmn:userTask id="UserTask_custom" name="业务审批">
      <bpmn:extensionElements>
        <flowable:properties>
          <flowable:property id="Property_fixture" name="fixtureProperty" value="fixture-value" />
        </flowable:properties>
        <flowable:formData businessKey="\${businessKey}">
          <flowable:formField id="amount" label="金额" type="long" defaultValue="0">
            <flowable:properties>
              <flowable:property id="prop_min" name="min" value="1" />
            </flowable:properties>
            <flowable:validation>
              <flowable:constraint name="min" config="1" />
            </flowable:validation>
          </flowable:formField>
        </flowable:formData>
        <flowable:mapException
          errorCode="ORDER_ERROR"
          includeChildExceptions="true"
          rootCause="java.lang.RuntimeException">java.lang.IllegalStateException</flowable:mapException>
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_start_task</bpmn:incoming>
      <bpmn:outgoing>Flow_task_message</bpmn:outgoing>
    </bpmn:userTask>
    <bpmn:boundaryEvent id="ErrorBoundary_custom" attachedToRef="UserTask_custom">
      <bpmn:errorEventDefinition
        id="ErrorEventDefinition_custom"
        flowable:errorVariableName="caughtErrorCode" />
    </bpmn:boundaryEvent>
    <bpmn:intermediateCatchEvent id="MessageCatch_custom" name="动态消息">
      <bpmn:incoming>Flow_task_message</bpmn:incoming>
      <bpmn:outgoing>Flow_message_signal</bpmn:outgoing>
      <bpmn:messageEventDefinition
        id="MessageEventDefinition_expression"
        flowable:messageExpression="\${dynamicMessage}" />
    </bpmn:intermediateCatchEvent>
    <bpmn:intermediateCatchEvent id="SignalCatch_custom" name="动态信号">
      <bpmn:incoming>Flow_message_signal</bpmn:incoming>
      <bpmn:outgoing>Flow_signal_end</bpmn:outgoing>
      <bpmn:signalEventDefinition
        id="SignalEventDefinition_expression"
        flowable:signalExpression="\${dynamicSignal}" />
    </bpmn:intermediateCatchEvent>
    <bpmn:endEvent id="EndEvent_custom">
      <bpmn:incoming>Flow_signal_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_start_task" sourceRef="StartEvent_custom" targetRef="UserTask_custom" />
    <bpmn:sequenceFlow id="Flow_task_message" sourceRef="UserTask_custom" targetRef="MessageCatch_custom" />
    <bpmn:sequenceFlow id="Flow_message_signal" sourceRef="MessageCatch_custom" targetRef="SignalCatch_custom" />
    <bpmn:sequenceFlow id="Flow_signal_end" sourceRef="SignalCatch_custom" targetRef="EndEvent_custom" />
  </bpmn:process>
  <bpmn:process id="Process_without_di" name="无图流程" isExecutable="true">
    <bpmn:receiveTask id="ReceiveTask_hidden" messageRef="Message_hidden" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_custom">
    <bpmndi:BPMNPlane id="BPMNPlane_custom" bpmnElement="Process_custom_extensions">
      <bpmndi:BPMNShape id="StartEvent_custom_di" bpmnElement="StartEvent_custom">
        <dc:Bounds x="160" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_custom_di" bpmnElement="UserTask_custom">
        <dc:Bounds x="250" y="160" width="110" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="ErrorBoundary_custom_di" bpmnElement="ErrorBoundary_custom">
        <dc:Bounds x="317" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="MessageCatch_custom_di" bpmnElement="MessageCatch_custom">
        <dc:Bounds x="420" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="SignalCatch_custom_di" bpmnElement="SignalCatch_custom">
        <dc:Bounds x="510" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_custom_di" bpmnElement="EndEvent_custom">
        <dc:Bounds x="600" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_start_task_di" bpmnElement="Flow_start_task">
        <di:waypoint x="196" y="200" />
        <di:waypoint x="250" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_task_message_di" bpmnElement="Flow_task_message">
        <di:waypoint x="360" y="200" />
        <di:waypoint x="420" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_message_signal_di" bpmnElement="Flow_message_signal">
        <di:waypoint x="456" y="200" />
        <di:waypoint x="510" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_signal_end_di" bpmnElement="Flow_signal_end">
        <di:waypoint x="546" y="200" />
        <di:waypoint x="600" y="200" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const multiInstanceTimerPreservationXml = `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flowable="http://flowable.org/bpmn"
  id="Definitions_edit_preservation"
  targetNamespace="http://flowable.org/test">
  <bpmn:process id="Process_edit_preservation" name="原位编辑回归" isExecutable="true"
    flowable:isEagerExecutionFetching="false">
    <bpmn:startEvent id="Start_edit_preservation">
      <bpmn:outgoing>Flow_edit_start_handler</bpmn:outgoing>
    </bpmn:startEvent>
    <bpmn:userTask id="Task_multi_handler" name="处理器多实例">
      <bpmn:incoming>Flow_edit_start_handler</bpmn:incoming>
      <bpmn:outgoing>Flow_edit_handler_cardinality</bpmn:outgoing>
      <bpmn:multiInstanceLoopCharacteristics isSequential="false"
        flowable:elementVariable="item"
        flowable:elementIndexVariable="itemIndex"
        flowable:noWaitStatesAsyncLeave="true">
        <bpmn:extensionElements>
          <flowable:collection flowable:delegateExpression="\${collectionHandler}">
            <flowable:expression>\${items}</flowable:expression>
          </flowable:collection>
          <flowable:variableAggregation target="reviews"
            delegateExpression="\${variableAggregator}"
            storeAsTransientVariable="true"
            createOverviewVariable="true">
            <bpmn:variable source="approved" target="value" />
          </flowable:variableAggregation>
        </bpmn:extensionElements>
        <bpmn:completionCondition>\${nrOfCompletedInstances &gt; 0}</bpmn:completionCondition>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:userTask>
    <bpmn:boundaryEvent id="Boundary_timer_cycle" name="周期超时"
      attachedToRef="Task_multi_handler" cancelActivity="false">
      <bpmn:timerEventDefinition id="TimerDefinition_cycle"
        flowable:businessCalendarName="workCalendar">
        <bpmn:timeCycle flowable:endDate="\${cycleEnd}">R3/PT10M</bpmn:timeCycle>
      </bpmn:timerEventDefinition>
    </bpmn:boundaryEvent>
    <bpmn:userTask id="Task_multi_cardinality" name="基数多实例">
      <bpmn:incoming>Flow_edit_handler_cardinality</bpmn:incoming>
      <bpmn:outgoing>Flow_edit_cardinality_service</bpmn:outgoing>
      <bpmn:multiInstanceLoopCharacteristics isSequential="true"
        flowable:noWaitStatesAsyncLeave="true">
        <bpmn:extensionElements>
          <flowable:variableAggregation target="cardinalityReviews">
            <bpmn:variable source="approved" target="value" />
          </flowable:variableAggregation>
        </bpmn:extensionElements>
        <bpmn:loopCardinality>\${itemCount}</bpmn:loopCardinality>
        <bpmn:completionCondition>\${nrOfCompletedInstances &gt;= 2}</bpmn:completionCondition>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:userTask>
    <bpmn:userTask id="Task_multi_string_handler" name="字符串处理器多实例">
      <bpmn:multiInstanceLoopCharacteristics isSequential="false"
        flowable:elementVariable="stringItem"
        flowable:noWaitStatesAsyncLeave="true">
        <bpmn:extensionElements>
          <flowable:collection flowable:class="com.example.StringCollectionHandler">
            <flowable:string>seed-handler-input</flowable:string>
          </flowable:collection>
        </bpmn:extensionElements>
      </bpmn:multiInstanceLoopCharacteristics>
    </bpmn:userTask>
    <bpmn:serviceTask id="Task_expression_preservation" name="表达式服务"
      flowable:expression="\${calculationService.calculate(execution)}"
      flowable:resultVariable="legacyCalculationResult"
      flowable:useLocalScopeForResultVariable="true"
      flowable:storeResultVariableAsTransient="true">
      <bpmn:extensionElements>
        <flowable:executionListener event="start" type="script">
          <flowable:script language="groovy" resultVariable="listenerResult">return 'original'</flowable:script>
        </flowable:executionListener>
        <flowable:executionListener event="end"
          delegateExpression="\${transactionListener}"
          onTransaction="committed"
          customPropertiesResolverDelegateExpression="\${listenerPropertiesResolver}" />
      </bpmn:extensionElements>
      <bpmn:incoming>Flow_edit_cardinality_service</bpmn:incoming>
      <bpmn:outgoing>Flow_edit_service_end</bpmn:outgoing>
    </bpmn:serviceTask>
    <bpmn:endEvent id="End_edit_preservation">
      <bpmn:incoming>Flow_edit_service_end</bpmn:incoming>
    </bpmn:endEvent>
    <bpmn:sequenceFlow id="Flow_edit_start_handler"
      sourceRef="Start_edit_preservation" targetRef="Task_multi_handler" />
    <bpmn:sequenceFlow id="Flow_edit_handler_cardinality"
      sourceRef="Task_multi_handler" targetRef="Task_multi_cardinality" />
    <bpmn:sequenceFlow id="Flow_edit_cardinality_service"
      sourceRef="Task_multi_cardinality" targetRef="Task_expression_preservation" />
    <bpmn:sequenceFlow id="Flow_edit_service_end"
      sourceRef="Task_expression_preservation" targetRef="End_edit_preservation" />
  </bpmn:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_edit_preservation">
    <bpmndi:BPMNPlane id="BPMNPlane_edit_preservation"
      bpmnElement="Process_edit_preservation">
      <bpmndi:BPMNShape id="Start_edit_preservation_di"
        bpmnElement="Start_edit_preservation">
        <dc:Bounds x="120" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_multi_handler_di" bpmnElement="Task_multi_handler">
        <dc:Bounds x="220" y="160" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Boundary_timer_cycle_di" bpmnElement="Boundary_timer_cycle">
        <dc:Bounds x="292" y="222" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_multi_cardinality_di"
        bpmnElement="Task_multi_cardinality">
        <dc:Bounds x="420" y="160" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_multi_string_handler_di"
        bpmnElement="Task_multi_string_handler">
        <dc:Bounds x="420" y="300" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="Task_expression_preservation_di"
        bpmnElement="Task_expression_preservation">
        <dc:Bounds x="620" y="160" width="120" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="End_edit_preservation_di"
        bpmnElement="End_edit_preservation">
        <dc:Bounds x="820" y="182" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_edit_start_handler_di"
        bpmnElement="Flow_edit_start_handler">
        <di:waypoint x="156" y="200" />
        <di:waypoint x="220" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_edit_handler_cardinality_di"
        bpmnElement="Flow_edit_handler_cardinality">
        <di:waypoint x="340" y="200" />
        <di:waypoint x="420" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_edit_cardinality_service_di"
        bpmnElement="Flow_edit_cardinality_service">
        <di:waypoint x="540" y="200" />
        <di:waypoint x="620" y="200" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_edit_service_end_di"
        bpmnElement="Flow_edit_service_end">
        <di:waypoint x="740" y="200" />
        <di:waypoint x="820" y="200" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn:definitions>`

const browserCandidates =
  process.platform === 'win32'
    ? [
        'C:/Program Files/Google/Chrome/Application/chrome.exe',
        'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
        'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']

const executablePath = browserCandidates.find(existsSync)
if (!executablePath) {
  throw new Error('未找到 Chrome/Edge/Chromium，无法运行浏览器冒烟测试')
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
    await new Promise((resolve) => setTimeout(resolve, 150))
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

const builtIndexHtml = readFileSync(resolve(buildOutputDirectory, 'index.html'), 'utf8')
const builtEntryMatch = builtIndexHtml.match(
  /<script[^>]+type="module"[^>]+src="([^"]*\/assets\/index-[^"]+\.js)"/,
)
assert(
  builtIndexHtml.includes('id="app-bootstrap-loading"') &&
    builtIndexHtml.includes('正在加载 Flowable Modeler...'),
  '生产 index.html 缺少 app 挂载前 Loading',
)
assert(builtEntryMatch, '无法从生产 index.html 定位入口脚本')
const builtEntrySource = builtEntryMatch[1]

function parseHashRoute(url) {
  const pageUrl = url instanceof URL ? url : new URL(url)
  const routeUrl = new URL(pageUrl.hash.slice(1) || '/', pageUrl.origin)
  return {
    pathname: routeUrl.pathname
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/'),
    query: Object.fromEntries(routeUrl.searchParams),
  }
}

async function waitForHashRoute(page, pathname, query = {}) {
  const expectedQuery = Object.entries(query)
  await page.waitForURL((url) => {
    const actual = parseHashRoute(url)
    return (
      actual.pathname === pathname &&
      Object.keys(actual.query).length === expectedQuery.length &&
      expectedQuery.every(([key, value]) => actual.query[key] === value)
    )
  })
  const actual = parseHashRoute(page.url())
  assert(
    actual.pathname === pathname &&
      Object.keys(actual.query).length === expectedQuery.length &&
      expectedQuery.every(([key, value]) => actual.query[key] === value),
    `路由错误，期望 ${JSON.stringify({ pathname, query })}，实际 ${JSON.stringify(actual)}`,
  )
  return actual
}

const MOCK_SESSION_COOKIE_NAME = 'FLOWABLE_REMEMBER_ME'
const MOCK_SESSION_COOKIE_VALUE = 'mock-admin-session'
const MOCK_SESSION_COOKIE = `${MOCK_SESSION_COOKIE_NAME}=${MOCK_SESSION_COOKIE_VALUE}`

function createDefaultOryxModel(name, key, description = '') {
  return {
    id: 'canvas',
    resourceId: 'canvas',
    stencilset: { namespace: 'http://b3mn.org/stencilset/bpmn2.0#' },
    properties: {
      process_id: key,
      name,
      ...(description ? { documentation: description } : {}),
    },
    childShapes: [
      {
        bounds: {
          lowerRight: { x: 130, y: 193 },
          upperLeft: { x: 100, y: 163 },
        },
        childShapes: [],
        dockers: [],
        outgoing: [],
        resourceId: 'startEvent1',
        stencil: { id: 'StartNoneEvent' },
      },
    ],
  }
}

function createMockModelerApi() {
  let sequence = 0
  let timestamp = Date.parse('2026-07-26T00:00:00.000Z')
  const models = new Map()
  const requests = []

  function nextTimestamp() {
    timestamp += 1000
    return new Date(timestamp).toISOString()
  }

  function toRepresentation(record) {
    return {
      id: record.id,
      name: record.name,
      key: record.key,
      description: record.description,
      createdBy: 'admin',
      lastUpdatedBy: 'admin',
      lastUpdated: record.lastUpdated,
      latestVersion: true,
      version: record.version,
      comment: '',
      modelType: 0,
      tenantId: '',
    }
  }

  function createRecord(input) {
    sequence += 1
    const id = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`
    const record = {
      id,
      name: input.name,
      key: input.key,
      description: input.description || '',
      lastUpdated: nextTimestamp(),
      version: 1,
      editorJson: createDefaultOryxModel(input.name, input.key, input.description),
    }
    models.set(id, record)
    return record
  }

  const state = {
    models,
    requests,
    conflictNextSaveForId: new Set(),
    failNextSaveStatus: 0,
    failEditorJsonForId: new Set(),
    delayedResponses: new Map(),
  }

  function delayNextResponse(method, path) {
    let notifyStarted
    let release
    const started = new Promise((resolve) => {
      notifyStarted = resolve
    })
    const wait = new Promise((resolve) => {
      release = resolve
    })
    state.delayedResponses.set(`${method} ${path}`, { notifyStarted, wait })
    return { started, release }
  }

  async function routeHandler(route) {
    const request = route.request()
    const url = new URL(request.url())
    const headers = request.headers()
    const path = url.pathname.startsWith('/modeler-app/rest')
      ? url.pathname.slice('/modeler-app/rest'.length) || '/'
      : url.pathname
    const authorized = (headers.cookie || '')
      .split(';')
      .some((cookie) => cookie.trim() === MOCK_SESSION_COOKIE)
    const event = {
      method: request.method(),
      path,
      query: Object.fromEntries(url.searchParams),
      authorized,
      authorization: headers.authorization || '',
      cookie: headers.cookie || '',
      accept: headers.accept || '',
      cacheControl: headers['cache-control'] || '',
      pragma: headers.pragma || '',
      contentType: headers['content-type'] || '',
      body: request.postData() || '',
    }
    requests.push(event)

    const delayedResponse = state.delayedResponses.get(`${event.method} ${path}`)
    if (delayedResponse) {
      state.delayedResponses.delete(`${event.method} ${path}`)
      delayedResponse.notifyStarted()
      await delayedResponse.wait
    }

    const json = (status, body, headers = {}) =>
      route.fulfill({
        status,
        contentType: 'application/json; charset=utf-8',
        headers,
        body: JSON.stringify(body),
      })

    if (path === '/app/authentication') {
      if (request.method() !== 'POST') {
        return json(405, { message: 'Authentication requires POST' })
      }
      const form = new URLSearchParams(request.postData() || '')
      event.form = Object.fromEntries(form)
      if (form.get('j_username') !== 'admin' || form.get('j_password') !== 'test') {
        return json(401, { message: 'Bad credentials', messageKey: 'GENERAL.ERROR.UNAUTHORIZED' })
      }
      return json(
        200,
        {},
        { 'Set-Cookie': `${MOCK_SESSION_COOKIE}; Path=/; HttpOnly; SameSite=Lax` },
      )
    }

    if (path === '/app/logout') {
      if (request.method() !== 'POST') return json(405, { message: 'Logout requires POST' })
      return json(
        200,
        {},
        {
          'Set-Cookie': `${MOCK_SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`,
        },
      )
    }

    if (!authorized) {
      return json(401, { message: 'Bad credentials', messageKey: 'GENERAL.ERROR.UNAUTHORIZED' })
    }

    if (path === '/account' && request.method() === 'GET') {
      return json(200, {
        id: 'admin',
        firstName: 'Flowable',
        lastName: 'Administrator',
        fullName: 'Flowable Administrator',
      })
    }

    if (path === '/import-process-model') {
      return json(501, { message: 'The browser must perform BPMN/Oryx conversion' })
    }

    if (path === '/models' && request.method() === 'GET') {
      const filterText = (url.searchParams.get('filterText') || '').trim().toLocaleLowerCase()
      const sort = url.searchParams.get('sort') || 'modifiedDesc'
      let data = [...models.values()].filter((record) =>
        filterText
          ? [record.name, record.description].some((value) =>
              value.toLocaleLowerCase().includes(filterText),
            )
          : true,
      )
      data.sort((left, right) => {
        if (sort === 'modifiedAsc') return Date.parse(left.lastUpdated) - Date.parse(right.lastUpdated)
        if (sort === 'nameAsc') return left.name.localeCompare(right.name, 'zh-CN')
        if (sort === 'nameDesc') return right.name.localeCompare(left.name, 'zh-CN')
        return Date.parse(right.lastUpdated) - Date.parse(left.lastUpdated)
      })
      const representations = data.map(toRepresentation)
      return json(200, {
        size: representations.length,
        total: representations.length,
        start: 0,
        data: representations,
      })
    }

    if (path === '/models' && request.method() === 'POST') {
      let input
      try {
        input = request.postDataJSON()
      } catch {
        return json(400, { message: 'Expected a JSON model representation' })
      }
      if (!input?.name || !input?.key || input.modelType !== 0) {
        return json(400, { message: 'name, key and modelType 0 are required' })
      }
      const record = createRecord(input)
      event.json = input
      event.modelId = record.id
      return json(200, toRepresentation(record))
    }

    const editorMatch = path.match(/^\/models\/([^/]+)\/editor\/json$/)
    if (editorMatch) {
      const id = decodeURIComponent(editorMatch[1])
      const record = models.get(id)
      if (!record) return json(404, { message: `Model not found: ${id}` })

      if (request.method() === 'GET') {
        if (state.failEditorJsonForId.delete(id)) {
          return json(500, { message: 'Could not read editor JSON' })
        }
        return json(200, {
          modelId: id,
          name: record.name,
          key: record.key,
          description: record.description,
          lastUpdated: record.lastUpdated,
          lastUpdatedBy: 'admin',
          model: structuredClone(record.editorJson),
        })
      }

      if (request.method() === 'POST') {
        const form = new URLSearchParams(request.postData() || '')
        event.form = Object.fromEntries(form)
        if (!event.contentType.startsWith('application/x-www-form-urlencoded')) {
          return json(415, { message: 'Expected form-urlencoded editor payload' })
        }
        if (!form.get('lastUpdated') || !form.get('json_xml')) {
          return json(400, { message: 'lastUpdated and json_xml are required' })
        }
        if (state.failNextSaveStatus) {
          const status = state.failNextSaveStatus
          state.failNextSaveStatus = 0
          return json(status, { message: 'Forced editor save failure' })
        }
        if (
          state.conflictNextSaveForId.delete(id) &&
          !['overwrite', 'newVersion'].includes(form.get('conflictResolveAction'))
        ) {
          return json(409, {
            message: 'Process model was updated in the meantime',
            messageKey: 'GENERAL.ERROR.BAD-REQUEST',
            customData: { userFullName: 'other-user', newVersionAllowed: true },
          })
        }
        try {
          record.editorJson = JSON.parse(form.get('json_xml'))
        } catch {
          return json(400, { message: 'json_xml is not valid JSON' })
        }
        record.name = form.get('name') || record.name
        record.key = form.get('key') || record.key
        record.description = form.get('description') || ''
        if (form.get('conflictResolveAction') === 'newVersion' || form.get('newversion') === 'true') {
          record.version += 1
        }
        record.lastUpdated = nextTimestamp()
        return json(200, toRepresentation(record))
      }
    }

    const modelMatch = path.match(/^\/models\/([^/]+)$/)
    if (modelMatch) {
      const id = decodeURIComponent(modelMatch[1])
      const record = models.get(id)
      if (!record) return json(404, { message: `Model not found: ${id}` })
      if (request.method() === 'GET') return json(200, toRepresentation(record))
      if (request.method() === 'DELETE') {
        models.delete(id)
        return route.fulfill({ status: 200, body: '' })
      }
    }

    return json(404, { message: `Unhandled mock endpoint: ${request.method()} ${path}` })
  }

  return { state, createRecord, delayNextResponse, routeHandler }
}

async function installMockModelerApiRoutes(target, api) {
  await target.route('**/app/authentication', api.routeHandler)
  await target.route('**/app/logout', api.routeHandler)
  await target.route('**/modeler-app/rest/**', api.routeHandler)
}

function assertModelRequestsUseCookie(api, phase) {
  const modelRequests = api.state.requests.filter(
    (request) => request.path === '/models' || request.path.startsWith('/models/'),
  )
  assert(modelRequests.length > 0, `${phase}没有发起模型请求`)
  assert(
    modelRequests.every((request) => request.authorized && !request.authorization),
    `${phase}没有仅使用 Flowable 会话 Cookie：${JSON.stringify(modelRequests)}`,
  )
  assert(
    modelRequests.every(
      (request) =>
        request.accept === 'application/json' &&
        request.cacheControl === 'no-cache' &&
        request.pragma === 'no-cache',
    ),
    `${phase}没有应用 Axios 公共请求拦截器：${JSON.stringify(modelRequests)}`,
  )
}

async function installBrowserStorageProbe(page) {
  await page.addInitScript(() => {
    window.__browserStorageAccesses = []
    for (const operation of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[operation]
      Storage.prototype[operation] = function monitoredStorageOperation(...args) {
        window.__browserStorageAccesses.push({
          operation,
          storage: this === window.localStorage ? 'localStorage' : 'sessionStorage',
          key: args.length ? String(args[0]) : '',
        })
        return original.apply(this, args)
      }
    }
    const originalOpen = IDBFactory.prototype.open
    IDBFactory.prototype.open = function monitoredOpen(name, ...args) {
      window.__browserStorageAccesses.push({
        operation: 'open',
        storage: 'indexedDB',
        key: String(name),
      })
      return originalOpen.call(this, name, ...args)
    }
  })
}

async function assertNoBrowserPersistence(page, phase) {
  const snapshot = await page.evaluate(() => ({
    accesses: window.__browserStorageAccesses || [],
    localKeys: Object.keys(window.localStorage),
    sessionKeys: Object.keys(window.sessionStorage),
  }))
  assert(
    snapshot.accesses.length === 0 &&
      snapshot.localKeys.length === 0 &&
      snapshot.sessionKeys.length === 0,
    `${phase}写入了浏览器持久化存储：${JSON.stringify(snapshot)}`,
  )
}

async function loginToModeler(page, username = 'admin', password = 'test') {
  await page.locator('[data-testid="login-page"]').waitFor()
  await page
    .locator('input[data-testid="login-username"], [data-testid="login-username"] input')
    .fill(username)
  await page
    .locator('input[data-testid="login-password"], [data-testid="login-password"] input')
    .fill(password)
  await page.locator('[data-testid="login-submit"]').click()
}

async function createModelFromList(page, name, key, description = '') {
  await page.locator('[data-testid="create-model"]').click()
  const nameInput = page.locator(
    'input[data-testid="model-create-name"], [data-testid="model-create-name"] input',
  )
  const keyInput = page.locator(
    'input[data-testid="model-create-key"], [data-testid="model-create-key"] input',
  )
  const descriptionInput = page.locator(
    'textarea[data-testid="model-create-description"], [data-testid="model-create-description"] textarea',
  )
  assert(
    (await nameInput.inputValue()) === '' &&
      (await keyInput.inputValue()) === '' &&
      (await descriptionInput.inputValue()) === '',
    '新建 BPMN 流程表单仍带有默认值',
  )
  await nameInput.fill(name)
  await keyInput.fill(key)
  await descriptionInput.fill(description)
  await page.locator('[data-testid="confirm-create-model"]').click()
  const canvas = page.locator('.djs-container')
  const createError = page.locator('.el-message--error')
  await Promise.race([
    canvas.waitFor(),
    createError.waitFor().then(async () => {
      throw new Error(`创建流程模型后未进入编辑器：${await createError.innerText()}`)
    }),
  ])
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

function trackRuntimeErrors(page, runtimeErrors, expectedApiErrorStatuses = new Set()) {
  page.on('pageerror', (error) => runtimeErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    const statusMatch = text.match(/status of (\d+)/)
    const sourceUrl = message.location().url
    if (
      statusMatch &&
      expectedApiErrorStatuses.has(Number(statusMatch[1])) &&
      (sourceUrl.includes('/modeler-app/rest/') || sourceUrl.includes('/app/authentication'))
    ) {
      return
    }
    runtimeErrors.push(text)
  })
}

async function waitForExtensionProperty(page, elementId, expected) {
  await page.waitForFunction(
    ({ targetId, target }) => {
      const element = window.bpmnModeler.get('elementRegistry').get(targetId)
      const containers = (element?.businessObject.extensionElements?.values || []).filter(
        (value) => value.$type === 'flowable:Properties',
      )
      const property = containers
        .flatMap((container) => container.values || [])
        .find((value) => value.id === target?.id)
      if (!target) return containers.every((container) => !(container.values || []).length)
      return property?.name === target.name && property?.value === target.value
    },
    { targetId: elementId, target: expected },
  )
}

async function waitForHeaderStatus(page, expected) {
  await page.waitForFunction((text) => {
    const matches = [...document.querySelectorAll('.designer-header .el-tag__content')].filter(
      (element) => element.textContent?.trim() === text,
    )
    return matches.length === 1
  }, expected)
}

async function waitForHandlerMultiInstanceState(page, expected) {
  await page.waitForFunction((target) => {
    const probe = window.__handlerMultiInstanceProbe
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_multi_handler')?.businessObject
    const loop = task?.loopCharacteristics
    const values = loop?.extensionElements?.values || []
    const collection = values.find((value) => value.$type === 'flowable:Collection')
    const aggregation = values.find(
      (value) => value.$type === 'flowable:VariableAggregation',
    )
    return Boolean(
      probe &&
        loop === probe.loop &&
        loop.extensionElements === probe.extensionElements &&
        collection === probe.collection &&
        aggregation === probe.aggregation &&
        aggregation.get('bpmn:variable')[0] === probe.aggregationVariable &&
        loop.completionCondition === probe.completionCondition &&
        loop.isSequential === target.isSequential &&
        loop.get('flowable:noWaitStatesAsyncLeave') === true &&
        loop.get('flowable:collection') === undefined &&
        loop.get('flowable:elementVariable') === 'item' &&
        loop.get('flowable:elementIndexVariable') === 'itemIndex' &&
        collection.delegateExpression === '${collectionHandler}' &&
        collection.expression === target.collection &&
        aggregation.target === 'reviews' &&
        aggregation.delegateExpression === '${variableAggregator}' &&
        aggregation.get('bpmn:variable')[0].source === 'approved' &&
        loop.completionCondition.body === target.completionCondition,
    )
  }, expected)
}

async function waitForCardinalityMultiInstanceState(page, expectedCardinality) {
  await page.waitForFunction((target) => {
    const probe = window.__cardinalityMultiInstanceProbe
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_multi_cardinality')?.businessObject
    const loop = task?.loopCharacteristics
    const aggregation = loop?.extensionElements?.values?.find(
      (value) => value.$type === 'flowable:VariableAggregation',
    )
    return Boolean(
      probe &&
        loop === probe.loop &&
        loop.extensionElements === probe.extensionElements &&
        aggregation === probe.aggregation &&
        loop.loopCardinality === probe.loopCardinality &&
        loop.completionCondition === probe.completionCondition &&
        loop.get('flowable:noWaitStatesAsyncLeave') === true &&
        loop.loopCardinality.body === target &&
        loop.completionCondition.body === '${nrOfCompletedInstances >= 2}',
    )
  }, expectedCardinality)
}

async function waitForStringHandlerMultiInstanceState(page, expectedString) {
  await page.waitForFunction((target) => {
    const probe = window.__stringHandlerMultiInstanceProbe
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_multi_string_handler')?.businessObject
    const loop = task?.loopCharacteristics
    const collection = loop?.extensionElements?.values?.find(
      (value) => value.$type === 'flowable:Collection',
    )
    return Boolean(
      probe &&
        loop === probe.loop &&
        loop.extensionElements === probe.extensionElements &&
        collection === probe.collection &&
        loop.get('flowable:noWaitStatesAsyncLeave') === true &&
        loop.get('flowable:collection') === undefined &&
        collection.class === 'com.example.StringCollectionHandler' &&
        collection.expression === undefined &&
        collection.string === target,
    )
  }, expectedString)
}

async function waitForTimerPreservationState(page, expected) {
  await page.waitForFunction((target) => {
    const probe = window.__timerPreservationProbe
    const boundary = window.bpmnModeler
      .get('elementRegistry')
      .get('Boundary_timer_cycle')?.businessObject
    const definition = boundary?.eventDefinitions?.[0]
    const timeCycle = definition?.timeCycle
    return Boolean(
      probe &&
        definition === probe.definition &&
        timeCycle === probe.timeCycle &&
        timeCycle.body === target.body &&
        timeCycle.get('flowable:endDate') === target.endDate &&
        definition.get('flowable:businessCalendarName') === target.businessCalendar,
    )
  }, expected)
}

async function readCustomStructuredSemantics(page) {
  return page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    const task = registry.get('UserTask_custom').businessObject
    const extensions = task.extensionElements?.values || []
    const propertyContainer = extensions.find((value) => value.$type === 'flowable:Properties')
    const formData = extensions.find((value) => value.$type === 'flowable:FormData')
    const formField = formData?.fields?.[0]
    const mapException = extensions.find((value) => value.$type === 'flowable:MapException')
    const messageDefinition = registry.get('MessageCatch_custom').businessObject.eventDefinitions?.[0]
    const signalDefinition = registry.get('SignalCatch_custom').businessObject.eventDefinitions?.[0]
    const errorDefinition = registry.get('ErrorBoundary_custom').businessObject.eventDefinitions?.[0]
    return {
      propertyContainer: {
        type: propertyContainer?.$type,
        values: (propertyContainer?.values || []).map((value) => ({
          type: value.$type,
          id: value.id,
          name: value.name,
          value: value.value,
        })),
      },
      formData: {
        type: formData?.$type,
        businessKey: formData?.businessKey,
        fields: (formData?.fields || []).map((field) => ({
          type: field.$type,
          id: field.id,
          label: field.label,
          fieldType: field.type,
          defaultValue: field.defaultValue,
          properties: {
            type: field.properties?.$type,
            values: (field.properties?.values || []).map((value) => ({
              type: value.$type,
              id: value.id,
              name: value.name,
              value: value.value,
            })),
          },
          validation: {
            type: field.validation?.$type,
            constraints: (field.validation?.constraints || []).map((constraint) => ({
              type: constraint.$type,
              name: constraint.name,
              config: constraint.config,
            })),
          },
        })),
      },
      mapException: {
        type: mapException?.$type,
        errorCode: mapException?.errorCode,
        includeChildExceptions: mapException?.includeChildExceptions,
        rootCause: mapException?.rootCause,
        className: mapException?.class,
      },
      eventDefinitions: {
        message: {
          type: messageDefinition?.$type,
          expression: messageDefinition?.get?.('flowable:messageExpression'),
          referenceId: messageDefinition?.messageRef?.id,
        },
        signal: {
          type: signalDefinition?.$type,
          expression: signalDefinition?.get?.('flowable:signalExpression'),
          referenceId: signalDefinition?.signalRef?.id,
        },
        error: {
          type: errorDefinition?.$type,
          variableName: errorDefinition?.get?.('flowable:errorVariableName'),
          referenceId: errorDefinition?.errorRef?.id,
        },
      },
    }
  })
}

function assertStructuredCustomSemantics(actual, phase) {
  const expected = {
    propertyContainer: {
      type: 'flowable:Properties',
      values: [
        {
          type: 'flowable:Property',
          id: 'Property_fixture',
          name: 'fixtureProperty',
          value: 'fixture-value',
        },
      ],
    },
    formData: {
      type: 'flowable:FormData',
      businessKey: '${businessKey}',
      fields: [
        {
          type: 'flowable:FormField',
          id: 'amount',
          label: '金额',
          fieldType: 'long',
          defaultValue: '0',
          properties: {
            type: 'flowable:Properties',
            values: [{ type: 'flowable:Property', id: 'prop_min', name: 'min', value: '1' }],
          },
          validation: {
            type: 'flowable:Validation',
            constraints: [{ type: 'flowable:Constraint', name: 'min', config: '1' }],
          },
        },
      ],
    },
    mapException: {
      type: 'flowable:MapException',
      errorCode: 'ORDER_ERROR',
      includeChildExceptions: true,
      rootCause: 'java.lang.RuntimeException',
      className: 'java.lang.IllegalStateException',
    },
    eventDefinitions: {
      message: {
        type: 'bpmn:MessageEventDefinition',
        expression: '${dynamicMessage}',
      },
      signal: {
        type: 'bpmn:SignalEventDefinition',
        expression: '${dynamicSignal}',
      },
      error: {
        type: 'bpmn:ErrorEventDefinition',
        variableName: 'caughtErrorCode',
      },
    },
  }
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${phase}结构化扩展语义发生变化：${JSON.stringify(actual)}`,
  )
}

function assertStructuredCustomXml(xml, phase) {
  const expectedSnippets = [
    '<flowable:properties>',
    '<flowable:property id="Property_fixture" name="fixtureProperty" value="fixture-value" />',
    '<flowable:formData businessKey="${businessKey}">',
    '<flowable:formField id="amount" label="金额" type="long" defaultValue="0">',
    '<flowable:property id="prop_min" name="min" value="1" />',
    '<flowable:validation>',
    '<flowable:constraint name="min" config="1" />',
    'flowable:errorVariableName="caughtErrorCode"',
    'flowable:messageExpression="${dynamicMessage}"',
    'flowable:signalExpression="${dynamicSignal}"',
  ]
  for (const snippet of expectedSnippets) {
    assert(xml.includes(snippet), `${phase}丢失 XML 片段：${snippet}`)
  }
  assert(
    /<flowable:mapException\b[^>]*\berrorCode="ORDER_ERROR"[^>]*\bincludeChildExceptions="true"[^>]*\brootCause="java\.lang\.RuntimeException"[^>]*>java\.lang\.IllegalStateException<\/flowable:mapException>/.test(
      xml,
    ),
    `${phase}未完整保留 flowable:mapException`,
  )
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch({ headless: true, executablePath })
  const runtimeErrors = []

  const bootstrapPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const bootstrapApi = createMockModelerApi()
  trackRuntimeErrors(bootstrapPage, runtimeErrors, new Set([401]))
  await installMockModelerApiRoutes(bootstrapPage, bootstrapApi)
  let notifyEntryRequested
  let releaseEntry
  const entryRequested = new Promise((resolve) => {
    notifyEntryRequested = resolve
  })
  const entryRelease = new Promise((resolve) => {
    releaseEntry = resolve
  })
  await bootstrapPage.route(new URL(builtEntrySource, `${origin}/`).href, async (route) => {
    notifyEntryRequested()
    await entryRelease
    await route.continue()
  })
  const bootstrapNavigation = bootstrapPage.goto(origin, { waitUntil: 'networkidle' })
  void bootstrapNavigation.catch(() => undefined)
  await entryRequested
  await bootstrapPage.waitForFunction(() => {
    const loading = document.querySelector('#app-bootstrap-loading')
    const spinner = loading?.querySelector('.app-bootstrap-spinner')
    return (
      loading &&
      spinner &&
      getComputedStyle(loading).display === 'flex' &&
      getComputedStyle(loading).opacity === '1' &&
      getComputedStyle(spinner).animationName === 'app-bootstrap-spin'
    )
  })
  const bootstrapSnapshot = await bootstrapPage.locator('#app-bootstrap-loading').evaluate(
    (element) => ({
      display: getComputedStyle(element).display,
      label: element.textContent?.trim(),
      spinnerAnimation: getComputedStyle(
        element.querySelector('.app-bootstrap-spinner'),
      ).animationName,
    }),
  )
  assert(
    bootstrapSnapshot.display === 'flex' &&
      bootstrapSnapshot.label === '正在加载 Flowable Modeler...' &&
      bootstrapSnapshot.spinnerAnimation === 'app-bootstrap-spin',
    `app 挂载前 Loading 样式或语义错误：${JSON.stringify(bootstrapSnapshot)}`,
  )
  releaseEntry()
  await bootstrapNavigation
  await bootstrapPage.locator('[data-testid="login-page"]').waitFor()
  assert(
    (await bootstrapPage.locator('#app-bootstrap-loading').count()) === 0,
    'Vue app 挂载后仍残留首屏 Loading',
  )
  await bootstrapPage.close()

  // Keep English coverage isolated from the default Chinese regression below. It exercises the
  // locale selected before Vue mounts, runtime switching, router preservation, and persistence.
  const englishModelApi = createMockModelerApi()
  const englishModel = englishModelApi.createRecord({
    name: '业务模型名称',
    key: 'Process_i18n',
    description: 'Business data must not be translated',
  })
  const englishContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await installMockModelerApiRoutes(englishContext, englishModelApi)
  const englishPage = await englishContext.newPage()
  trackRuntimeErrors(englishPage, runtimeErrors, new Set([401, 503]))
  await installBrowserStorageProbe(englishPage)
  let notifyEnglishEntryRequested
  let releaseEnglishEntry
  const englishEntryRequested = new Promise((resolve) => {
    notifyEnglishEntryRequested = resolve
  })
  const englishEntryRelease = new Promise((resolve) => {
    releaseEnglishEntry = resolve
  })
  await englishPage.route(new URL(builtEntrySource, `${origin}/`).href, async (route) => {
    notifyEnglishEntryRequested()
    await englishEntryRelease
    await route.continue()
  })
  const englishNavigation = englishPage.goto(`${origin}/?lang=en#/?lang=unsupported`, {
    waitUntil: 'networkidle',
  })
  void englishNavigation.catch(() => undefined)
  await englishEntryRequested
  await englishPage.waitForFunction(
    () =>
      document.documentElement.lang === 'en' &&
      document.querySelector('#app-bootstrap-loading-text')?.textContent?.trim() ===
        'Loading Flowable Modeler...',
  )
  const englishBootstrapSnapshot = await englishPage.evaluate(() => ({
    lang: document.documentElement.lang,
    text: document.querySelector('#app-bootstrap-loading')?.textContent?.trim(),
  }))
  assert(
    englishBootstrapSnapshot.lang === 'en' &&
      englishBootstrapSnapshot.text === 'Loading Flowable Modeler...',
    `?lang=en 没有在 Vue 挂载前应用英语 bootstrap：${JSON.stringify(englishBootstrapSnapshot)}`,
  )
  releaseEnglishEntry()
  await englishNavigation
  await englishPage.locator('[data-testid="login-page"]').waitFor()
  assert(
    (await englishPage.locator('html').getAttribute('lang')) === 'en' &&
      (await englishPage.getByRole('heading', { name: 'Sign in to Flowable Modeler', exact: true }).count()) === 1 &&
      (await englishPage.getByRole('button', { name: 'Sign in', exact: true }).count()) === 1,
    '英语登录页未正确渲染',
  )
  await loginToModeler(englishPage, 'admin', 'wrong-password')
  await englishPage.getByText('Incorrect username or password.', { exact: true }).waitFor()
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.getByText('用户名或密码错误', { exact: true }).waitFor()
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByText('Incorrect username or password.', { exact: true }).waitFor()
  await englishPage.route(
    '**/app/authentication',
    (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '' }),
    { times: 1 },
  )
  await loginToModeler(englishPage)
  await englishPage.getByText('Flowable request failed (HTTP 503).', { exact: true }).waitFor()
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.getByText('Flowable 请求失败（HTTP 503）', { exact: true }).waitFor()
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByText('Flowable request failed (HTTP 503).', { exact: true }).waitFor()
  await loginToModeler(englishPage)
  await englishPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(englishPage, '/processes', { lang: 'en' })
  const englishSearch = englishPage.locator(
    'input[data-testid="model-search"], [data-testid="model-search"] input',
  )
  const englishUpdatedAt = (await englishPage.locator('[data-testid="model-updated-at"]').innerText()).trim()
  assert(
    (await englishPage.getByRole('heading', { name: 'Process models', exact: true }).count()) === 1 &&
      (await englishSearch.getAttribute('placeholder')) === 'Search' &&
      /^\d{2}\/\d{2}\/\d{4}/.test(englishUpdatedAt) &&
      !/[\u4e00-\u9fff]/.test(englishUpdatedAt) &&
      (await findModelRow(englishPage, englishModel.name).count()) === 1,
    `英语模型列表、日期格式或业务模型名称错误：${JSON.stringify({ englishUpdatedAt })}`,
  )

  await englishPage.locator('[data-testid="create-model"]').click()
  const createDialog = englishPage.locator('[data-testid="model-create-dialog"]')
  await createDialog.waitFor()
  assert(
    (await createDialog.getByText('Create BPMN process', { exact: true }).count()) === 1 &&
      (await createDialog.getByRole('button', { name: 'Cancel', exact: true }).count()) === 1 &&
      (await createDialog.getByRole('button', { name: 'Create and open', exact: true }).count()) === 1 &&
      (await createDialog.locator('.el-dialog__headerbtn').getAttribute('aria-label')) ===
        'Close this dialog',
    '英语自有创建对话框或 Element Plus 按钮未正确本地化',
  )
  await createDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await createDialog.waitFor({ state: 'hidden' })

  const englishModelRow = findModelRow(englishPage, englishModel.name)
  await englishModelRow.locator('[data-testid="delete-model"]').click()
  const englishDeleteDialog = englishPage.locator('.el-message-box:visible')
  await englishDeleteDialog.waitFor()
  assert(
    (await englishDeleteDialog.getByText('Delete process model', { exact: true }).count()) === 1 &&
      (await englishDeleteDialog.getByText(englishModel.name, { exact: false }).count()) === 1 &&
      (await englishDeleteDialog.getByRole('button', { name: 'Cancel', exact: true }).count()) === 1 &&
      (await englishDeleteDialog.getByRole('button', { name: 'Delete', exact: true }).count()) === 1 &&
      (await englishDeleteDialog.locator('.el-message-box__headerbtn').getAttribute('aria-label')) ===
        'Close this dialog',
    '英语 Element Plus 删除确认对话框未正确本地化，或业务名称被翻译',
  )
  await englishDeleteDialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await englishDeleteDialog.waitFor({ state: 'hidden' })

  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.getByRole('heading', { name: '流程模型', exact: true }).waitFor()
  assert(
    parseHashRoute(englishPage.url()).query.lang === 'zh-CN' &&
      (await findModelRow(englishPage, englishModel.name).count()) === 1,
    `列表切回中文后路由语言或业务名称错误：${englishPage.url()}`,
  )
  await englishPage.locator('[data-testid="create-model"]').click()
  await createDialog.waitFor()
  assert(
    (await createDialog.locator('.el-dialog__headerbtn').getAttribute('aria-label')) ===
      '关闭此对话框',
    '运行时切回中文后 Element Plus locale 未同步',
  )
  await createDialog.locator('.el-dialog__headerbtn').click()
  await createDialog.waitFor({ state: 'hidden' })
  await englishModelRow.locator('[data-testid="delete-model"]').click()
  await englishDeleteDialog.waitFor()
  assert(
    (await englishDeleteDialog.locator('.el-message-box__headerbtn').getAttribute('aria-label')) ===
      '关闭此对话框',
    '运行时切回中文后程序化 Element Plus locale 未同步',
  )
  await englishDeleteDialog.getByRole('button', { name: '取消', exact: true }).click()
  await englishDeleteDialog.waitFor({ state: 'hidden' })
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByRole('heading', { name: 'Process models', exact: true }).waitFor()

  await englishModelRow.locator('[data-testid="open-model"]').click()
  await englishPage.waitForSelector('.djs-container')
  await englishPage.waitForFunction(() => {
    const backButton = document.querySelector('[data-testid="back-to-models"]')
    return Boolean(window.bpmnModeler && backButton && !backButton.disabled)
  })
  await englishPage.evaluate(() => {
    const canvas = window.bpmnModeler.get('canvas')
    window.bpmnModeler.get('selection').select(canvas.getRootElement())
  })
  const englishProperties = englishPage.locator('.properties-panel')
  await englishProperties.getByText('General', { exact: true }).waitFor()
  assert(
    (await englishPage.getByRole('button', { name: 'Back to models', exact: true }).count()) === 1 &&
      (await englishPage.getByRole('button', { name: 'Save model', exact: true }).count()) === 1 &&
      (await englishProperties.getByText('Identifier (ID)', { exact: true }).count()) === 1 &&
      (await englishProperties.getByText('Process configuration', { exact: true }).count()) === 1,
    '英语编辑器工具栏或属性面板未正确本地化',
  )
  assert(
    parseHashRoute(englishPage.url()).pathname === `/processes/${englishModel.id}` &&
      parseHashRoute(englishPage.url()).query.lang === 'en',
    `运行时切换英语后打开 UUID 路由丢失语言：${englishPage.url()}`,
  )

  const englishPalette = englishPage.locator('.djs-palette')
  assert(
    (await englishPalette.locator('.entry[title="Create task"]').count()) === 1 &&
      (await englishPalette.locator('.entry[title="Create start event"]').count()) === 1,
    '英语 BPMN palette 未正确本地化',
  )
  await englishPage.evaluate(() => {
    const modeler = window.bpmnModeler
    modeler.get('selection').select(modeler.get('elementRegistry').get('startEvent1'))
  })
  const englishContextPad = englishPage.locator('.djs-context-pad')
  await englishContextPad.locator('.entry[title="Append task"]').waitFor()
  assert(
    (await englishContextPad.locator('.entry[title="Change element"]').count()) === 1,
    '英语 BPMN context pad 未正确本地化',
  )
  await englishContextPad.locator('.entry[title="Change element"]').click()
  const englishReplacePopup = englishPage.locator('.djs-popup:visible')
  await englishReplacePopup.locator('.djs-popup-title').getByText('Change element', { exact: true }).waitFor()
  assert(
    (await englishReplacePopup.getByText('Message start event', { exact: true }).count()) === 1 &&
      (await englishReplacePopup.locator('.djs-popup-search input').getAttribute('placeholder')) ===
        'Search',
    '英语 BPMN replace popup 未正确本地化',
  )
  await englishPage.keyboard.press('Escape')
  await englishReplacePopup.waitFor({ state: 'hidden' })

  await englishPage.evaluate(() => window.bpmnModeler.get('toggleMode').toggleMode(true))
  await englishPage.waitForFunction(
    () => document.querySelector('.bts-toggle-mode')?.textContent?.trim() === 'Token Simulation',
  )
  await englishPage.evaluate(() => {
    const modeler = window.bpmnModeler
    const notifications = modeler.get('notifications')
    const showNotification = notifications.showNotification
    notifications.showNotification = function persistentNotification(options) {
      return showNotification.call(this, { ...options, ttl: 10_000 })
    }
    try {
      modeler.get('simulator').createScope({
        element: modeler.get('canvas').getRootElement(),
      })
      const elementFactory = modeler.get('elementFactory')
      const eventBus = modeler.get('eventBus')
      const unnamedUserTask = elementFactory.createShape({ type: 'bpmn:UserTask' })
      eventBus.fire('tokenSimulation.simulator.trace', {
        action: 'exit',
        element: unnamedUserTask,
        scope: { parent: { id: 'unnamed-user-task-scope' } },
      })
      const namedUserTask = elementFactory.createShape({ type: 'bpmn:UserTask' })
      namedUserTask.businessObject.name = 'User Task'
      eventBus.fire('tokenSimulation.simulator.trace', {
        action: 'exit',
        element: namedUserTask,
        scope: { parent: { id: 'named-user-task-scope' } },
      })
    } finally {
      notifications.showNotification = showNotification
    }
  })
  assert(
      (await englishPage.locator('.bts-entry[title="Toggle Simulation Log"]').count()) === 1 &&
      (await englishPage.locator('.bts-animation-speed-button[title="Set animation speed: Normal"]').count()) === 1 &&
      (await englishPage.locator('.bts-log .bts-text').getByText('Process started', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-notification .bts-text').getByText('Process started', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-log .bts-text').getByText('User Task', { exact: true }).count()) === 2 &&
      (await englishPage.locator('.bts-notification .bts-text').getByText('User Task', { exact: true }).count()) === 2,
    '英语 token simulation 控件未正确本地化',
  )
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.waitForFunction(
    () => document.querySelector('.bts-toggle-mode')?.textContent?.trim() === '令牌模拟',
  )
  assert(
      (await englishPage.locator('.bts-entry[title="显示/隐藏模拟日志"]').count()) === 1 &&
      (await englishPage.locator('.bts-animation-speed-button[title="设置动画速度：正常"]').count()) === 1 &&
      (await englishPage.locator('.bts-log .bts-text').getByText('流程 已启动', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-notification .bts-text').getByText('流程 已启动', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-log .bts-text').getByText('用户任务', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-notification .bts-text').getByText('用户任务', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-log .bts-text').getByText('User Task', { exact: true }).count()) === 1 &&
      (await englishPage.locator('.bts-notification .bts-text').getByText('User Task', { exact: true }).count()) === 1,
    '中文 token simulation 控件、兜底节点名或业务节点名未正确处理',
  )
  await englishPage.evaluate(() => window.bpmnModeler.get('toggleMode').toggleMode(false))

  assert(
    (await englishPalette.locator('.entry[title="创建任务"]').count()) === 1 &&
      (await englishPalette.locator('.entry[title="创建开始事件"]').count()) === 1,
    '切换中文后 BPMN palette 未重译',
  )
  await englishPage.evaluate(() => {
    const modeler = window.bpmnModeler
    modeler.get('selection').select(modeler.get('elementRegistry').get('startEvent1'))
  })
  await englishContextPad.locator('.entry[title="追加任务"]').waitFor()
  assert(
    (await englishContextPad.locator('.entry[title="更改元素"]').count()) === 1,
    '切换中文后 BPMN context pad 未重译',
  )
  await englishContextPad.locator('.entry[title="更改元素"]').click()
  const chineseReplacePopup = englishPage.locator('.djs-popup:visible')
  await chineseReplacePopup.locator('.djs-popup-title').getByText('更改元素', { exact: true }).waitFor()
  assert(
    (await chineseReplacePopup.getByText('消息开始事件', { exact: true }).count()) === 1 &&
      (await chineseReplacePopup.locator('.djs-popup-search input').getAttribute('placeholder')) ===
        '搜索',
    '切换中文后 BPMN replace popup 未重译',
  )
  await englishPage.keyboard.press('Escape')
  await chineseReplacePopup.waitFor({ state: 'hidden' })
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByRole('button', { name: 'Back to models', exact: true }).waitFor()

  const englishLegacyWarnings = await englishPage.evaluate(async () => {
    const bridge = window.flowableProcessModeler
    const currentXml = await bridge.getXML()
    const legacyXml = currentXml.includes('http://flowable.org/bpmn')
      ? currentXml.replace('http://flowable.org/bpmn', 'http://activiti.org/bpmn')
      : currentXml.replace(
          /<([A-Za-z_][\w.-]*:)?definitions\b/,
          (match) => `${match} xmlns:activiti="http://activiti.org/bpmn"`,
        )
    const result = await bridge.importXML(legacyXml, 'english-legacy-namespace.bpmn20.xml')
    return result.warnings.map((warning) => warning.message || String(warning))
  })
  assert(
    JSON.stringify(englishLegacyWarnings) ===
      JSON.stringify([
        'The legacy Activiti extension namespace was normalized to http://flowable.org/bpmn',
      ]),
    `英语导入兼容提示不正确：${JSON.stringify(englishLegacyWarnings)}`,
  )
  await englishPage.getByRole('button', { name: '1 import notice', exact: true }).click()
  const englishImportWarningsDialog = englishPage.locator('.el-dialog:visible')
  await englishImportWarningsDialog.getByText('BPMN import notices', { exact: true }).waitFor()
  await englishImportWarningsDialog
    .getByText(
      'The legacy Activiti extension namespace was normalized to http://flowable.org/bpmn',
      { exact: true },
    )
    .waitFor()
  await englishImportWarningsDialog.getByRole('button', { name: 'Got it', exact: true }).click()
  await englishImportWarningsDialog.waitFor({ state: 'hidden' })
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.getByRole('button', { name: '1 条导入提示', exact: true }).click()
  const chineseImportWarningsDialog = englishPage.locator('.el-dialog:visible')
  await chineseImportWarningsDialog.getByText('BPMN 导入提示', { exact: true }).waitFor()
  await chineseImportWarningsDialog
    .getByText('已将旧 Activiti 扩展命名空间规范化为 http://flowable.org/bpmn', { exact: true })
    .waitFor()
  await chineseImportWarningsDialog.getByRole('button', { name: '知道了', exact: true }).click()
  await chineseImportWarningsDialog.waitFor({ state: 'hidden' })
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByRole('button', { name: 'Back to models', exact: true }).waitFor()

  await englishPage.goBack({ waitUntil: 'networkidle' })
  await englishPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(englishPage, '/processes', { lang: 'en' })
  await findModelRow(englishPage, englishModel.name).locator('[data-testid="open-model"]').click()
  await englishPage.waitForSelector('.djs-container')
  await englishProperties.getByText('General', { exact: true }).waitFor()
  await assertNoBrowserPersistence(englishPage, '英语切换前')

  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await englishPage.waitForFunction(() => document.documentElement.lang === 'zh-CN')
  assert(
    parseHashRoute(englishPage.url()).query.lang === 'zh-CN' &&
      parseHashRoute(englishPage.url()).pathname === `/processes/${englishModel.id}` &&
      (await englishPage.getByRole('button', { name: '返回模型', exact: true }).count()) === 1 &&
      (await englishProperties.getByText('常规', { exact: true }).count()) === 1,
    `切回中文后语言参数、编辑器地址或界面文本错误：${englishPage.url()}`,
  )
  await assertNoBrowserPersistence(englishPage, '切回中文后')
  await englishPage.reload({ waitUntil: 'networkidle' })
  await englishPage.waitForSelector('.djs-container')
  await englishPage.waitForFunction(() => Boolean(window.bpmnModeler))
  assert(
    (await englishPage.locator('html').getAttribute('lang')) === 'zh-CN' &&
      parseHashRoute(englishPage.url()).query.lang === 'zh-CN' &&
      parseHashRoute(englishPage.url()).pathname === `/processes/${englishModel.id}` &&
      (await englishPage.getByRole('button', { name: '返回模型', exact: true }).count()) === 1,
    `刷新后未按 URL lang 参数恢复中文编辑器：${englishPage.url()}`,
  )

  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-en"]').click()
  await englishPage.getByRole('button', { name: 'Back to models', exact: true }).waitFor()
  await englishContext.clearCookies()
  await englishPage.reload({ waitUntil: 'networkidle' })
  await englishPage.locator('[data-testid="login-page"]').waitFor()
  const expiredEnglishRoute = parseHashRoute(englishPage.url())
  assert(
    expiredEnglishRoute.pathname === '/login' &&
      expiredEnglishRoute.query.lang === 'en' &&
      expiredEnglishRoute.query.redirect === `/processes/${englishModel.id}`,
    `英语深链会话失效后的 redirect 携带了错误语言：${JSON.stringify(expiredEnglishRoute)}`,
  )
  await englishPage.locator('[data-testid="language-switcher"]').click()
  await englishPage.locator('[data-testid="language-zh-CN"]').click()
  await loginToModeler(englishPage)
  await englishPage.waitForSelector('.djs-container')
  const reloginRoute = parseHashRoute(englishPage.url())
  assert(
    reloginRoute.pathname === `/processes/${englishModel.id}` &&
      reloginRoute.query.lang === 'zh-CN' &&
      (await englishPage.getByRole('button', { name: '返回模型', exact: true }).count()) === 1,
    `登录页切换语言后深链恢复使用了旧语言：${JSON.stringify(reloginRoute)}`,
  )
  await assertNoBrowserPersistence(englishPage, '英语独立流程完成后')
  await englishContext.close()

  // A language selected in the editor must not turn a Back pop into a push when the
  // destination is an older default-locale entry without an explicit lang query.
  const localeHistoryApi = createMockModelerApi()
  const localeHistoryModel = localeHistoryApi.createRecord({
    name: '语言历史回归流程',
    key: 'Process_locale_history',
    description: 'Business data must survive locale history navigation',
  })
  const localeHistoryContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await installMockModelerApiRoutes(localeHistoryContext, localeHistoryApi)
  const localeHistoryPage = await localeHistoryContext.newPage()
  trackRuntimeErrors(localeHistoryPage, runtimeErrors, new Set([401]))
  await installBrowserStorageProbe(localeHistoryPage)
  await localeHistoryPage.goto(origin, { waitUntil: 'networkidle' })
  await loginToModeler(localeHistoryPage)
  await localeHistoryPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(localeHistoryPage, '/processes')
  await findModelRow(localeHistoryPage, localeHistoryModel.name)
    .locator('[data-testid="open-model"]')
    .click()
  await localeHistoryPage.waitForSelector('.djs-container')
  await localeHistoryPage.waitForFunction(() => {
    const backButton = document.querySelector('[data-testid="back-to-models"]')
    return Boolean(window.bpmnModeler && backButton && !backButton.disabled)
  })
  await waitForHashRoute(localeHistoryPage, `/processes/${localeHistoryModel.id}`)
  await localeHistoryPage.evaluate(() => {
    const modeler = window.bpmnModeler
    const root = modeler.get('canvas').getRootElement()
    modeler.get('modeling').updateProperties(root, { name: 'Locale history dirty probe' })
  })
  await localeHistoryPage.getByText('未保存', { exact: true }).waitFor()
  await localeHistoryPage.locator('[data-testid="language-switcher"]').click()
  await localeHistoryPage.locator('[data-testid="language-en"]').click()
  await localeHistoryPage.getByRole('button', { name: 'Back to models', exact: true }).waitFor()
  await waitForHashRoute(localeHistoryPage, `/processes/${localeHistoryModel.id}`, { lang: 'en' })
  const localeHistoryLength = await localeHistoryPage.evaluate(() => window.history.length)
  await localeHistoryPage.evaluate(() => window.history.back())
  await localeHistoryPage
    .getByText('The current process has unsaved changes.', { exact: true })
    .waitFor()
  await localeHistoryPage.getByRole('button', { name: 'Discard changes', exact: true }).click()
  await localeHistoryPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(localeHistoryPage, '/processes', { lang: 'en' })
  assert(
    (await localeHistoryPage.locator('.el-message-box:visible').count()) === 0 &&
      (await localeHistoryPage.evaluate(() => window.history.length)) === localeHistoryLength,
    '补全 Back 目标语言时重复触发离开确认或污染了浏览器历史',
  )
  await localeHistoryPage.evaluate(() => window.history.forward())
  await localeHistoryPage.waitForSelector('.djs-container')
  await waitForHashRoute(localeHistoryPage, `/processes/${localeHistoryModel.id}`, { lang: 'en' })
  await assertNoBrowserPersistence(localeHistoryPage, '无 lang 历史条目语言补全后')
  await localeHistoryContext.close()

  const englishEmbeddedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  trackRuntimeErrors(englishEmbeddedPage, runtimeErrors)
  await englishEmbeddedPage.goto(`${origin}/?embedded=1#/embedded?lang=en`, {
    waitUntil: 'networkidle',
  })
  await englishEmbeddedPage.waitForSelector('.djs-container')
  await englishEmbeddedPage.waitForFunction(() => Boolean(window.flowableProcessModeler))
  const englishDefaultDiagramXml = await englishEmbeddedPage.evaluate(() =>
    window.flowableProcessModeler.getXML(),
  )
  assert(
    englishDefaultDiagramXml.includes('name="Leave approval process"') &&
      englishDefaultDiagramXml.includes('name="Submit request"') &&
      englishDefaultDiagramXml.includes('name="Department approval"') &&
      englishDefaultDiagramXml.includes('name="Process complete"') &&
      !englishDefaultDiagramXml.includes('请假审批流程'),
    '直接以英语初始化时未生成英语默认 BPMN 名称',
  )
  await englishEmbeddedPage.close()

  const page = await browser.newPage({ viewport: { width: 1600, height: 960 } })
  trackRuntimeErrors(page, runtimeErrors, new Set([401]))
  const mainModelApi = createMockModelerApi()
  await installMockModelerApiRoutes(page, mainModelApi)
  await installBrowserStorageProbe(page)

  const embeddedPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  trackRuntimeErrors(embeddedPage, runtimeErrors)
  await embeddedPage.addInitScript(() => {
    window.__flowableReadySnapshots = []
    window.addEventListener('flowable-modeler-ready', () => {
      window.__flowableReadySnapshots.push({
        rootId: window.bpmnModeler?.get('canvas').getRootElement().businessObject.id,
        loading: Boolean(document.querySelector('.canvas-loading')),
      })
    })
  })
  await embeddedPage.goto(`${origin}/?embedded=1`, { waitUntil: 'networkidle' })
  assert(await embeddedPage.title() === 'Flowable Modeler', '浏览器标题未更新为项目名称')
  await embeddedPage.waitForSelector('.djs-container')
  await embeddedPage.waitForFunction(() => window.__flowableReadySnapshots.length === 1)
  const embeddedReadySnapshot = await embeddedPage.evaluate(
    () => window.__flowableReadySnapshots[0],
  )
  assert(
    embeddedReadySnapshot.rootId === 'Process_leave_request',
    'flowable-modeler-ready 在初始流程导入完成前触发',
  )
  assert(!embeddedReadySnapshot.loading, 'flowable-modeler-ready 触发时仍显示加载状态')
  assert(await embeddedPage.locator('.designer-shell.is-embedded').isVisible(), '嵌入模式标记未生效')
  assert(
    (await embeddedPage.locator('[data-testid="process-model-list-page"]').count()) === 0,
    '嵌入模式错误显示了流程模型列表',
  )
  assert(await embeddedPage.locator('.bpmn-toolbar').isVisible(), '嵌入模式未保留 BPMN 工具栏')
  assert((await embeddedPage.locator('.designer-header').count()) === 0, '嵌入模式仍显示设计器页头')
  assert(
    (await embeddedPage.getByRole('button', { name: '保存模型', exact: true }).count()) === 0,
    '嵌入模式仍显示保存模型按钮',
  )
  const defaultDiagramXml = await embeddedPage.evaluate(() => window.flowableProcessModeler.getXML())
  await embeddedPage.goto(`${origin}/?embedded=1#/embedded?lang=en`, { waitUntil: 'networkidle' })
  await embeddedPage.waitForSelector('.djs-container')
  await embeddedPage.waitForFunction(() => Boolean(window.bpmnModeler))
  assert(
    (await embeddedPage.locator('html').getAttribute('lang')) === 'en' &&
      parseHashRoute(embeddedPage.url()).pathname === '/embedded' &&
      parseHashRoute(embeddedPage.url()).query.lang === 'en' &&
      (await embeddedPage.locator('.designer-shell.is-embedded').count()) === 1,
    `嵌入模式未应用 hash 语言参数：${embeddedPage.url()}`,
  )
  await embeddedPage.close()

  const iframeHostPage = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  trackRuntimeErrors(iframeHostPage, runtimeErrors)
  await iframeHostPage.route(`${origin}/host-shell`, (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><body style="margin:0"><iframe title="Flowable host" src="${origin}/?embedded=1" style="width:100vw;height:100vh;border:0"></iframe></body></html>`,
    }),
  )
  await iframeHostPage.goto(`${origin}/host-shell`, { waitUntil: 'networkidle' })
  const hostedDesignerFrame = iframeHostPage.frames().find((frame) => frame !== iframeHostPage.mainFrame())
  assert(hostedDesignerFrame, '宿主页中的设计器 iframe 未加载')
  await hostedDesignerFrame.waitForSelector('.djs-container')
  await hostedDesignerFrame.waitForFunction(() => Boolean(window.flowableProcessModeler))
  await hostedDesignerFrame.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    window.bpmnModeler.get('selection').select(registry.get('UserTask_approve'))
  })
  assert(
    (await hostedDesignerFrame.locator('.designer-shell.is-embedded').count()) === 1,
    'iframe 嵌入模式未生效',
  )
  assert(
    (await hostedDesignerFrame.evaluate(
      () => typeof window.flowableProcessModeler.configureHost,
    )) === 'undefined',
    '设计器仍暴露自定义宿主能力入口 configureHost',
  )
  assert(
    (await hostedDesignerFrame.locator('.el-collapse-item').filter({
      has: hostedDesignerFrame.locator('.el-collapse-item__header', { hasText: '表单配置' }),
    }).count()) === 0,
    '默认构建仍显示表单配置入口',
  )
  await iframeHostPage.close()

  const modelApi = createMockModelerApi()
  const modelContext = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await installMockModelerApiRoutes(modelContext, modelApi)
  const modelPage = await modelContext.newPage()
  trackRuntimeErrors(modelPage, runtimeErrors, new Set([401, 409, 500]))
  await installBrowserStorageProbe(modelPage)
  await modelPage.goto(origin, { waitUntil: 'networkidle' })
  await modelPage.locator('[data-testid="login-page"]').waitFor()
  await waitForHashRoute(modelPage, '/login')
  assert((await modelPage.locator('.djs-container').count()) === 0, '登录前挂载了流程设计器')
  assert(
    (await modelPage.getByRole('heading', { name: '登录 Flowable Modeler', exact: true }).count()) === 1 &&
      (await modelPage
        .locator('input[data-testid="login-username"], [data-testid="login-username"] input')
        .getAttribute('autocomplete')) ===
        'username' &&
      (await modelPage
        .locator('input[data-testid="login-password"], [data-testid="login-password"] input')
        .getAttribute('autocomplete')) ===
        'current-password',
    '登录页没有提供 Flowable Modeler 标识或标准凭据输入语义',
  )

  await loginToModeler(modelPage, 'admin', 'wrong-password')
  await modelPage.locator('[data-testid="login-page"]').waitFor()
  await waitForHashRoute(modelPage, '/login')
  await modelPage.locator('.login-error').waitFor()
  await modelPage.locator('.el-loading-mask.is-fullscreen').waitFor({ state: 'hidden' })
  assert(
    !(await modelPage.locator('#app').getAttribute('inert')) &&
      !(await modelPage.locator('#app').getAttribute('aria-busy')),
    '认证失败后 Axios 全局 Loading 没有恢复应用交互',
  )
  const invalidLoginMessage = (await modelPage.locator('.login-error').innerText()).trim()
  assert(
    invalidLoginMessage.length > 0,
    '无效凭据没有显示登录错误',
  )
  assert(
    modelApi.state.requests.some(
      (request) =>
        request.method === 'POST' &&
        request.path === '/app/authentication' &&
        request.form?.j_username === 'admin' &&
        request.form?.j_password === 'wrong-password' &&
        request.form?._spring_security_remember_me === 'true',
    ),
    `无效凭据没有触发 Flowable 表单认证 401（${invalidLoginMessage}）：${JSON.stringify(modelApi.state.requests)}`,
  )

  await loginToModeler(modelPage)
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  assert(await modelPage.locator('[data-testid="model-list-empty"]').isVisible(), '空流程模型状态未显示')
  assert((await modelPage.locator('.djs-container').count()) === 0, '流程模型列表后台挂载了编辑器')
  const initialListRequest = modelApi.state.requests.find(
    (request) => request.method === 'GET' && request.path === '/models' && request.authorized,
  )
  assert(
    initialListRequest?.query.modelType === '0' && initialListRequest?.query.sort === 'modifiedDesc',
    `初始流程模型查询参数错误：${JSON.stringify(initialListRequest?.query)}`,
  )
  assertModelRequestsUseCookie(modelApi, '登录后的初始流程模型查询')

  await createModelFromList(modelPage, '流程模型 A', 'Process_model_a', '用于多模型隔离回归')
  const createModelARequest = modelApi.state.requests.find(
    (request) => request.method === 'POST' && request.path === '/models',
  )
  assert(
    createModelARequest?.json?.name === '流程模型 A' &&
      createModelARequest?.json?.key === 'Process_model_a' &&
      createModelARequest?.json?.description === '用于多模型隔离回归' &&
      createModelARequest?.json?.modelType === 0,
    `创建流程模型没有使用官方 ModelRepresentation：${JSON.stringify(createModelARequest?.json)}`,
  )
  const modelAId = createModelARequest.modelId
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i.test(modelAId),
    `模拟 Flowable 模型 ID 不是 UUID：${modelAId}`,
  )
  await waitForHashRoute(modelPage, `/processes/${modelAId}`)
  const modelAFirstToken = modelApi.state.models.get(modelAId).lastUpdated
  await modelPage.evaluate(() => {
    const modeler = window.bpmnModeler
    const root = modeler.get('canvas').getRootElement()
    modeler.get('modeling').updateProperties(root, { name: '流程模型 A 已保存' })
  })
  const modelAFirstSaveResponse = modelPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/modeler-app/rest/models/${modelAId}/editor/json`,
  )
  await modelPage.locator('[data-testid="save-model"]').click()
  await modelAFirstSaveResponse
  const modelASaveRequests = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === `/models/${modelAId}/editor/json`,
  )
  assert(modelASaveRequests.length === 1, '保存流程模型没有调用官方 editor/json API')
  const modelAFirstSave = modelASaveRequests[0]
  const modelAFirstSavedJson = JSON.parse(modelAFirstSave.form.json_xml)
  assert(
    modelAFirstSave.form.lastUpdated === modelAFirstToken &&
      modelAFirstSave.form.newversion === 'false' &&
      modelAFirstSave.contentType.startsWith('application/x-www-form-urlencoded') &&
      modelAFirstSavedJson.resourceId === 'canvas' &&
      Array.isArray(modelAFirstSavedJson.childShapes),
    `editor/json 保存契约错误：${JSON.stringify(modelAFirstSave.form)}`,
  )
  assert(!modelAFirstSave.form.json_xml.trimStart().startsWith('<'), '保存请求向后端发送了 BPMN XML')

  await modelPage.locator('[data-testid="back-to-models"]').click()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  assert((await findModelRow(modelPage, '流程模型 A 已保存').count()) === 1, '保存后列表元数据未刷新')

  await createModelFromList(modelPage, '流程模型 B', 'Process_model_b')
  const createRequests = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === '/models',
  )
  const modelBId = createRequests.at(-1).modelId
  await waitForHashRoute(modelPage, `/processes/${modelBId}`)
  const modelBJsonBefore = JSON.stringify(modelApi.state.models.get(modelBId).editorJson)
  await modelPage.locator('[data-testid="back-to-models"]').click()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  assert((await modelPage.locator('[data-testid="model-row"]').count()) === 2, '多个流程模型未同时显示')

  const modelSearchInput = modelPage.locator(
    'input[data-testid="model-search"], [data-testid="model-search"] input',
  )
  assert(
    (await modelSearchInput.getAttribute('placeholder')) === '搜索',
    '中文搜索框 placeholder 错误',
  )
  assert(
    !(await modelPage.locator('[data-testid="model-list"]').innerText()).includes('Process_model_'),
    '流程模型列表仍显示流程标识',
  )
  const modelQueriesBeforeSearch = modelApi.state.requests.filter(
    (request) => request.method === 'GET' && request.path === '/models',
  ).length
  const searchStartedAt = Date.now()
  await modelSearchInput.fill('流程模型 B')
  await modelPage.waitForTimeout(400)
  assert(
    modelApi.state.requests.filter(
      (request) => request.method === 'GET' && request.path === '/models',
    ).length === modelQueriesBeforeSearch,
    '搜索输入停顿不足 500ms 时提前发起了模型查询',
  )
  await modelPage.waitForFunction(() => document.querySelectorAll('[data-testid="model-row"]').length === 1)
  const modelQueriesAfterSearch = modelApi.state.requests.filter(
    (request) => request.method === 'GET' && request.path === '/models',
  ).length
  assert(
    Date.now() - searchStartedAt >= 500 &&
      modelQueriesAfterSearch === modelQueriesBeforeSearch + 1,
    `搜索防抖没有在停顿 500ms 后仅查询一次：${JSON.stringify({
      elapsed: Date.now() - searchStartedAt,
      before: modelQueriesBeforeSearch,
      after: modelQueriesAfterSearch,
    })}`,
  )
  await modelPage.waitForTimeout(250)
  assert(
    modelApi.state.requests.filter(
      (request) => request.method === 'GET' && request.path === '/models',
    ).length === modelQueriesAfterSearch,
    '单次搜索停顿触发了重复模型查询',
  )
  assert(
    await modelSearchInput.evaluate((element) => document.activeElement === element),
    '搜索请求完成后搜索框失去了焦点',
  )
  assert((await findModelRow(modelPage, '流程模型 B').count()) === 1, '流程模型搜索返回了错误记录')
  const searchRequest = [...modelApi.state.requests]
    .reverse()
    .find((request) => request.method === 'GET' && request.path === '/models' && request.query.filterText)
  assert(
    searchRequest?.query.filterText === '流程模型 B' && searchRequest?.query.modelType === '0',
    `流程模型搜索没有使用 filterText/modelType：${JSON.stringify(searchRequest?.query)}`,
  )
  await modelSearchInput.fill('Process_model_b')
  await modelPage.waitForFunction(
    () => document.querySelectorAll('[data-testid="model-row"]').length === 0,
  )
  assert(
    (await modelPage.getByText('没有匹配的流程模型', { exact: true }).count()) === 1,
    '流程标识仍能搜索到模型',
  )
  await modelSearchInput.clear()
  await modelPage.locator('[data-testid="model-sort"]').click()
  await modelPage.getByRole('option', { name: '名称 A-Z', exact: true }).click()
  await modelPage.waitForFunction(() => document.querySelectorAll('[data-testid="model-row"]').length === 2)
  const sortedModelTitles = await modelPage.locator('[data-testid="model-title"]').allTextContents()
  assert(
    JSON.stringify(sortedModelTitles) === JSON.stringify(['流程模型 A 已保存', '流程模型 B']),
    `流程模型名称排序错误：${JSON.stringify(sortedModelTitles)}`,
  )
  const sortRequest = [...modelApi.state.requests]
    .reverse()
    .find((request) => request.method === 'GET' && request.path === '/models')
  assert(sortRequest?.query.sort === 'nameAsc', `流程模型排序参数错误：${JSON.stringify(sortRequest?.query)}`)

  await assertNoBrowserPersistence(modelPage, '流程模型创建和查询后')
  const loginRequestCountBeforeRefresh = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === '/app/authentication',
  ).length
  const accountRequestCountBeforeRefresh = modelApi.state.requests.filter(
    (request) => request.method === 'GET' && request.path === '/account',
  ).length
  await modelPage.reload({ waitUntil: 'networkidle' })
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  assert(
    modelApi.state.requests.filter(
      (request) => request.method === 'POST' && request.path === '/app/authentication',
    ).length === loginRequestCountBeforeRefresh,
    '刷新恢复会话时错误地重新提交了登录表单',
  )
  const accountRequestsAfterRefresh = modelApi.state.requests.filter(
    (request) => request.method === 'GET' && request.path === '/account',
  )
  assert(
    accountRequestsAfterRefresh.length === accountRequestCountBeforeRefresh + 1 &&
      accountRequestsAfterRefresh.at(-1).authorized,
    `刷新后没有通过 Flowable 会话 Cookie 恢复账户：${JSON.stringify(accountRequestsAfterRefresh)}`,
  )
  assert((await modelPage.locator('[data-testid="model-row"]').count()) === 2, '刷新后未从后端重新加载流程模型')
  await assertNoBrowserPersistence(modelPage, '刷新恢复登录后')

  const savedModelARow = findModelRow(modelPage, '流程模型 A 已保存')
  const modelReadDelay = modelApi.delayNextResponse('GET', `/models/${modelAId}`)
  const editorReadDelay = modelApi.delayNextResponse(
    'GET',
    `/models/${modelAId}/editor/json`,
  )
  const modelReadResponse = modelPage.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname === `/modeler-app/rest/models/${modelAId}`,
  )
  const editorReadResponse = modelPage.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      new URL(response.url()).pathname ===
        `/modeler-app/rest/models/${modelAId}/editor/json`,
  )
  await savedModelARow.locator('[data-testid="model-primary-open"]').focus()
  await modelPage.keyboard.press('Enter')
  await Promise.all([modelReadDelay.started, editorReadDelay.started])
  const requestLoadingMask = modelPage.locator('.el-loading-mask.is-fullscreen')
  await requestLoadingMask.waitFor()
  assert(
    (await modelPage.locator('#app').getAttribute('inert')) === '' &&
      (await modelPage.locator('#app').getAttribute('aria-busy')) === 'true',
    'Axios 全局 Loading 没有锁定底层应用交互',
  )
  modelReadDelay.release()
  await modelReadResponse
  assert(
    await requestLoadingMask.isVisible(),
    '首个并行请求完成后 Axios 全局 Loading 被提前关闭',
  )
  editorReadDelay.release()
  await editorReadResponse
  await requestLoadingMask.waitFor({ state: 'hidden' })
  assert(
    !(await modelPage.locator('#app').getAttribute('inert')) &&
      !(await modelPage.locator('#app').getAttribute('aria-busy')),
    '并行请求完成后 Axios 全局 Loading 没有恢复应用交互',
  )
  await modelPage.waitForSelector('.djs-container')
  const modelARouteBeforeRefresh = await waitForHashRoute(
    modelPage,
    `/processes/${modelAId}`,
  )
  assert(
    await modelPage.evaluate(
      () => window.bpmnModeler.get('canvas').getRootElement().businessObject.id === 'Process_model_a',
    ),
    '按流程模型 ID 打开了错误流程',
  )

  const loginRequestCountBeforeEditorRefresh = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === '/app/authentication',
  ).length
  const modelAEditorReadsBeforeRefresh = modelApi.state.requests.filter(
    (request) =>
      request.method === 'GET' && request.path === `/models/${modelAId}/editor/json`,
  ).length
  await modelPage.reload({ waitUntil: 'networkidle' })
  await modelPage.waitForSelector('.djs-container')
  await modelPage.waitForFunction(
    () => window.bpmnModeler.get('canvas').getRootElement().businessObject.id === 'Process_model_a',
  )
  const modelARouteAfterRefresh = await waitForHashRoute(
    modelPage,
    `/processes/${modelAId}`,
  )
  assert(
    modelARouteAfterRefresh.pathname === modelARouteBeforeRefresh.pathname &&
      modelApi.state.requests.filter(
        (request) => request.method === 'POST' && request.path === '/app/authentication',
      ).length === loginRequestCountBeforeEditorRefresh &&
      modelApi.state.requests.filter(
        (request) =>
          request.method === 'GET' && request.path === `/models/${modelAId}/editor/json`,
      ).length === modelAEditorReadsBeforeRefresh + 1,
    `刷新编辑器后路由 UUID 变化或重新提交了登录：${JSON.stringify({
      before: modelARouteBeforeRefresh,
      after: modelARouteAfterRefresh,
    })}`,
  )

  const loginRequestCountBeforeExpiredDeepLink = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === '/app/authentication',
  ).length
  await modelContext.clearCookies()
  await modelPage.reload({ waitUntil: 'networkidle' })
  await modelPage.locator('[data-testid="login-page"]').waitFor()
  const expiredDeepLinkRoute = parseHashRoute(modelPage.url())
  assert(
    expiredDeepLinkRoute.pathname === '/login' &&
      expiredDeepLinkRoute.query.redirect === modelARouteBeforeRefresh.pathname,
    `深链 Cookie 失效后的登录路由错误：${JSON.stringify(expiredDeepLinkRoute)}`,
  )
  assert(
    modelApi.state.requests.filter(
      (request) => request.method === 'POST' && request.path === '/app/authentication',
    ).length === loginRequestCountBeforeExpiredDeepLink,
    '深链 Cookie 失效后错误地自动重交登录表单',
  )
  await loginToModeler(modelPage)
  await modelPage.waitForSelector('.djs-container')
  await modelPage.waitForFunction(
    () => window.bpmnModeler.get('canvas').getRootElement().businessObject.id === 'Process_model_a',
  )
  await waitForHashRoute(modelPage, `/processes/${modelAId}`)
  assert(
    modelApi.state.requests.filter(
      (request) => request.method === 'POST' && request.path === '/app/authentication',
    ).length === loginRequestCountBeforeExpiredDeepLink + 1,
    '深链重新登录没有只提交一次认证表单',
  )

  await modelPage.evaluate(() => window.history.back())
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  await findModelRow(modelPage, '流程模型 A 已保存')
    .locator('[data-testid="open-model"]')
    .click()
  await modelPage.waitForSelector('.djs-container')
  await waitForHashRoute(modelPage, `/processes/${modelAId}`)

  const modelASecondToken = modelApi.state.models.get(modelAId).lastUpdated
  await modelPage.evaluate(() => {
    const modeler = window.bpmnModeler
    const root = modeler.get('canvas').getRootElement()
    modeler.get('modeling').updateProperties(root, { name: '流程模型 A 冲突保存' })
  })
  await modelPage.evaluate(() => window.history.back())
  await modelPage.getByText('当前流程有未保存更改。', { exact: true }).waitFor()
  await modelPage.getByRole('button', { name: '继续编辑', exact: true }).click()
  await waitForHashRoute(modelPage, `/processes/${modelAId}`)
  assert(
    (await modelPage.locator('.djs-container').count()) === 1 &&
      (await modelPage.getByText('未保存', { exact: true }).isVisible()),
    '取消浏览器 Back 后没有恢复同一编辑器及其未保存状态',
  )
  modelApi.state.conflictNextSaveForId.add(modelAId)
  await modelPage.locator('[data-testid="save-model"]').click()
  await modelPage.getByText('其他用户', { exact: false }).waitFor()
  assert(
    modelApi.state.models.get(modelAId).name === '流程模型 A 已保存' &&
      (await modelPage.getByText('未保存', { exact: true }).isVisible()),
    'HTTP 409 后覆盖了后端模型或错误清除了脏状态',
  )
  const overwriteResponse = modelPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/modeler-app/rest/models/${modelAId}/editor/json`,
  )
  await modelPage.getByRole('button', { name: '覆盖保存', exact: true }).click()
  await overwriteResponse
  const modelAConflictSaves = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === `/models/${modelAId}/editor/json`,
  )
  assert(
    modelAConflictSaves.length === 3 &&
      modelAConflictSaves[1].form.lastUpdated === modelASecondToken &&
      !modelAConflictSaves[1].form.conflictResolveAction &&
      modelAConflictSaves[2].form.conflictResolveAction === 'overwrite' &&
      modelAConflictSaves[2].form.lastUpdated === modelASecondToken,
    `并发覆盖请求契约错误：${JSON.stringify(modelAConflictSaves.map((request) => request.form))}`,
  )
  assert(
    modelApi.state.models.get(modelAId).name === '流程模型 A 冲突保存' &&
      JSON.stringify(modelApi.state.models.get(modelBId).editorJson) === modelBJsonBefore,
    '保存活动流程模型时覆盖了其他模型',
  )

  await modelPage.locator('[data-testid="back-to-models"]').click()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  modelApi.state.failEditorJsonForId.add(modelAId)
  await findModelRow(modelPage, '流程模型 A 冲突保存')
    .locator('[data-testid="open-model"]')
    .click()
  await modelPage.locator('.el-message--error').waitFor()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await waitForHashRoute(modelPage, '/processes')
  assert((await modelPage.locator('.djs-container').count()) === 0, '载入失败后仍挂载了编辑器')
  await modelPage.locator('.el-message--error').waitFor({ state: 'hidden' })

  const modelBRow = findModelRow(modelPage, '流程模型 B')
  await modelBRow.locator('[data-testid="delete-model"]').click()
  await modelPage.getByRole('button', { name: '取消', exact: true }).click()
  assert(modelApi.state.models.has(modelBId), '取消删除仍移除了流程模型')
  await modelBRow.locator('[data-testid="delete-model"]').click()
  await modelPage.getByRole('button', { name: '删除', exact: true }).click()
  await modelPage.waitForFunction(() => document.querySelectorAll('[data-testid="model-row"]').length === 1)
  assert(
    !modelApi.state.models.has(modelBId) &&
      modelApi.state.requests.some(
        (request) => request.method === 'DELETE' && request.path === `/models/${modelBId}`,
      ),
    '删除流程模型没有调用官方 DELETE API',
  )

  const countBeforeInvalidImport = modelApi.state.models.size
  await modelPage.locator('[data-testid="model-import-input"]').setInputFiles({
    name: 'missing-di.bpmn20.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(p0ExtensionXml),
  })
  await modelPage.locator('.el-message--error').waitFor()
  assert(
    modelApi.state.models.size === countBeforeInvalidImport &&
      (await modelPage.locator('.djs-container').count()) === 0,
    '缺少 DI 的 BPMN 仍创建了流程模型或打开了编辑器',
  )
  await modelPage.locator('.el-message--error').waitFor({ state: 'hidden' })

  const importRequestStart = modelApi.state.requests.length
  await modelPage.locator('[data-testid="model-import-input"]').setInputFiles({
    name: 'collaboration.bpmn20.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(collaborationXml),
  })
  await modelPage.waitForSelector('.djs-container')
  await modelPage.waitForFunction(() => {
    const backButton = document.querySelector('[data-testid="back-to-models"]')
    return Boolean(window.bpmnModeler && backButton && !backButton.disabled)
  })
  assert(
    await modelPage.evaluate(
      () => window.bpmnModeler.get('canvas').getRootElement().businessObject.$type === 'bpmn:Collaboration',
    ),
    '协作池导入后未以 Collaboration 作为画布根元素',
  )
  const importRequests = modelApi.state.requests.slice(importRequestStart)
  const importedCreate = importRequests.find(
    (request) => request.method === 'POST' && request.path === '/models',
  )
  const importedSave = importRequests.find(
    (request) =>
      request.method === 'POST' && request.path === `/models/${importedCreate?.modelId}/editor/json`,
  )
  assert(
    importedCreate?.json?.key === 'Process_pool' &&
      importedCreate?.json?.modelType === 0 &&
      importedSave?.form?.lastUpdated &&
      importedSave?.form?.newversion === 'false',
    `浏览器导入没有使用 create + editor/json 契约：${JSON.stringify(importRequests)}`,
  )
  const importedOryx = JSON.parse(importedSave.form.json_xml)
  assert(
    importedOryx.resourceId === 'canvas' &&
      importedOryx.properties?.process_id === 'Process_pool' &&
      Array.isArray(importedOryx.childShapes) &&
      importedOryx.childShapes.length > 0 &&
      !importedSave.form.json_xml.trimStart().startsWith('<'),
    '导入没有在浏览器中把 BPMN 转换为 Flowable Oryx JSON',
  )
  const importedShapes = []
  const collectImportedShapes = (shapes) => {
    for (const shape of shapes || []) {
      importedShapes.push(shape)
      collectImportedShapes(shape.childShapes)
    }
  }
  collectImportedShapes(importedOryx.childShapes)
  const whiteBoxPool = importedShapes.find(
    (shape) => shape.resourceId === 'Participant_pool',
  )
  const blackBoxPool = importedShapes.find(
    (shape) => shape.resourceId === 'Participant_black_box',
  )
  const fallbackLane = importedShapes.find(
    (shape) => shape.resourceId === 'Lane_flowable_unassigned_Process_pool',
  )
  const collapsedSubProcess = importedShapes.find(
    (shape) => shape.resourceId === 'SubProcess_collapsed',
  )
  const nestedTask = importedShapes.find((shape) => shape.resourceId === 'Task_nested')
  const startShape = importedShapes.find((shape) => shape.resourceId === 'Start_pool')
  const associationShape = importedShapes.find(
    (shape) => shape.resourceId === 'Association_pool_note',
  )
  const messageFlowShape = importedShapes.find(
    (shape) => shape.resourceId === 'MessageFlow_black_box',
  )
  const startOutgoing = new Set(startShape?.outgoing?.map((outgoing) => outgoing.resourceId))
  assert(
    whiteBoxPool?.properties?.process_id === 'Process_pool' &&
      whiteBoxPool.childShapes?.length === 1 &&
      fallbackLane?.stencil?.id === 'Lane' &&
      fallbackLane.childShapes?.some((shape) => shape.resourceId === 'Start_pool'),
    '无 Lane 的 Pool 没有生成 Flowable 6.8.1 可读取的兜底 Lane',
  )
  assert(
    blackBoxPool?.stencil?.id === 'Pool' &&
      !blackBoxPool.properties?.process_id &&
      blackBoxPool.childShapes?.length === 0 &&
      blackBoxPool.outgoing?.some(
        (outgoing) => outgoing.resourceId === 'MessageFlow_black_box',
      ),
    '黑盒 Participant 或其 MessageFlow outgoing 在前端转换中丢失',
  )
  assert(
    collapsedSubProcess?.stencil?.id === 'CollapsedSubProcess' &&
      nestedTask?.bounds?.upperLeft?.x === 335 &&
      nestedTask?.bounds?.upperLeft?.y === 195,
    '折叠子流程未按 DI isExpanded=false 输出，或其子元素坐标被错误相对化',
  )
  assert(
    startOutgoing.has('Flow_start_subprocess') &&
      startOutgoing.has('Association_pool_note') &&
      associationShape?.target?.resourceId === 'Annotation_pool' &&
      messageFlowShape?.target?.resourceId === 'Participant_pool',
    'SequenceFlow、Association 或 MessageFlow 的 source/target/outgoing 不完整',
  )
  assert(
    !modelApi.state.requests.some((request) => request.path === '/import-process-model'),
    '导入错误调用了后端 import-process-model 转换接口',
  )

  const importedRecord = modelApi.state.models.get(importedCreate.modelId)
  delete importedRecord.editorJson.flowableModelerBpmn20Xml
  delete importedRecord.editorJson.flowableModelerOryxFingerprint
  delete importedRecord.editorJson.flowableModelerConverterVersion
  await modelPage.locator('[data-testid="back-to-models"]').click()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await findModelRow(modelPage, '池内流程').locator('[data-testid="open-model"]').click()
  await modelPage.waitForSelector('.djs-container')
  await modelPage.waitForFunction(() => {
    const backButton = document.querySelector('[data-testid="back-to-models"]')
    return Boolean(window.bpmnModeler && backButton && !backButton.disabled)
  })
  const reconstructedCollaboration = await modelPage.evaluate(() => {
    const definitions = window.bpmnModeler.getDefinitions()
    const process = definitions.rootElements.find((element) => element.id === 'Process_pool')
    const collaboration = definitions.rootElements.find(
      (element) => element.$type === 'bpmn:Collaboration',
    )
    const blackBox = collaboration?.participants?.find(
      (participant) => participant.id === 'Participant_black_box',
    )
    const lane = process?.laneSets?.flatMap((laneSet) => laneSet.lanes || []).find(
      (candidate) => candidate.id === 'Lane_flowable_unassigned_Process_pool',
    )
    const collapsed = process?.flowElements?.find(
      (element) => element.id === 'SubProcess_collapsed',
    )
    const planeElements = definitions.diagrams?.[0]?.plane?.planeElement || []
    const collapsedDi = planeElements.find(
      (element) => element.bpmnElement?.id === 'SubProcess_collapsed',
    )
    return {
      rootType: window.bpmnModeler.get('canvas').getRootElement().businessObject.$type,
      blackBoxHasProcess: Boolean(blackBox?.processRef),
      laneFlowNodeIds: lane?.flowNodeRef?.map((element) => element.id) || [],
      nestedTaskId: collapsed?.flowElements?.[0]?.id,
      collapsedExpanded: collapsedDi?.isExpanded,
    }
  })
  assert(
    reconstructedCollaboration.rootType === 'bpmn:Collaboration' &&
      !reconstructedCollaboration.blackBoxHasProcess &&
      reconstructedCollaboration.laneFlowNodeIds.includes('Start_pool') &&
      !reconstructedCollaboration.laneFlowNodeIds.includes('Task_nested') &&
      reconstructedCollaboration.nestedTaskId === 'Task_nested' &&
      reconstructedCollaboration.collapsedExpanded === false,
    `浏览器未能从纯 Oryx JSON 重建协作 BPMN：${JSON.stringify(reconstructedCollaboration)}`,
  )
  await modelPage.locator('[data-testid="back-to-models"]').click()
  await modelPage.locator('[data-testid="process-model-list-page"]').waitFor()
  const modelCountBeforeFailedImport = modelApi.state.models.size
  const failedImportRequestStart = modelApi.state.requests.length
  modelApi.state.failNextSaveStatus = 500
  await modelPage.locator('[data-testid="model-import-input"]').setInputFiles({
    name: 'collaboration-save-failure.bpmn20.xml',
    mimeType: 'application/xml',
    buffer: Buffer.from(
      collaborationXml
        .replaceAll('Process_pool', 'Process_failed_import')
        .replaceAll('Collaboration_pool', 'Collaboration_failed_import'),
    ),
  })
  await modelPage.getByText('Forced editor save failure', { exact: false }).waitFor()
  await modelPage.waitForFunction(
    (expected) => document.querySelectorAll('[data-testid="model-row"]').length === expected,
    modelCountBeforeFailedImport,
  )
  const failedImportRequests = modelApi.state.requests.slice(failedImportRequestStart)
  const failedImportCreate = failedImportRequests.find(
    (request) => request.method === 'POST' && request.path === '/models',
  )
  assert(
    failedImportCreate &&
      failedImportRequests.some(
        (request) =>
          request.method === 'POST' &&
          request.path === `/models/${failedImportCreate.modelId}/editor/json`,
      ) &&
      failedImportRequests.some(
        (request) =>
          request.method === 'DELETE' && request.path === `/models/${failedImportCreate.modelId}`,
      ) &&
      modelApi.state.models.size === modelCountBeforeFailedImport,
    `导入保存失败后没有尽力清理新模型：${JSON.stringify(failedImportRequests)}`,
  )

  await modelPage.waitForFunction(() => !document.querySelector('.el-message, .el-notification'))
  await modelPage.screenshot({ path: 'artifacts/ui-models-desktop.png', fullPage: true })
  await modelPage.setViewportSize({ width: 390, height: 844 })
  const populatedMobileViewport = await modelPage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert(
    populatedMobileViewport.scrollWidth <= populatedMobileViewport.clientWidth,
    `有数据的移动流程模型列表存在横向溢出：${populatedMobileViewport.scrollWidth} > ${populatedMobileViewport.clientWidth}`,
  )
  assert(
    (await modelPage.getByRole('button', { name: '导入 BPMN', exact: true }).count()) === 1 &&
      (await modelPage.getByRole('button', { name: '新建 BPMN 流程', exact: true }).count()) === 1,
    '移动端头部图标按钮缺少可访问名称',
  )
  const mobileModelARow = findModelRow(modelPage, '流程模型 A 冲突保存')
  assert(
    (await mobileModelARow.getByRole('button', { name: '打开模型 流程模型 A 冲突保存' }).count()) >= 1 &&
      (await mobileModelARow.getByRole('button', { name: '删除模型 流程模型 A 冲突保存' }).count()) === 1,
    '移动端流程模型行操作缺少可访问名称',
  )
  await modelPage.screenshot({ path: 'artifacts/ui-models-mobile.png', fullPage: true })
  assertModelRequestsUseCookie(modelApi, '流程模型完整 API 回归')
  await assertNoBrowserPersistence(modelPage, '流程模型完整 API 回归后')
  const loginRequestCountBeforeLogout = modelApi.state.requests.filter(
    (request) => request.method === 'POST' && request.path === '/app/authentication',
  ).length
  const logoutResponse = modelPage.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname === '/app/logout',
  )
  await modelPage.locator('[data-testid="user-menu"]').click()
  await modelPage.locator('[data-testid="logout"]').click()
  await logoutResponse
  await modelPage.locator('[data-testid="login-page"]').waitFor()
  await waitForHashRoute(modelPage, '/login')
  assert(
    modelApi.state.requests.some(
      (request) =>
        request.method === 'POST' && request.path === '/app/logout' && request.authorized,
    ),
    '退出登录没有携带 Flowable 会话 Cookie 调用 /app/logout',
  )
  const cookiesAfterLogout = await modelContext.cookies(origin)
  assert(
    !cookiesAfterLogout.some((cookie) => cookie.name === MOCK_SESSION_COOKIE_NAME),
    `退出登录后仍保留 Flowable 会话 Cookie：${JSON.stringify(cookiesAfterLogout)}`,
  )
  await modelPage.reload({ waitUntil: 'networkidle' })
  await modelPage.locator('[data-testid="login-page"]').waitFor()
  await waitForHashRoute(modelPage, '/login')
  assert(
    (await modelPage.locator('[data-testid="process-model-list-page"]').count()) === 0 &&
      modelApi.state.requests.filter(
        (request) => request.method === 'POST' && request.path === '/app/authentication',
      ).length === loginRequestCountBeforeLogout,
    '退出后刷新错误地恢复了登录态或重新提交了登录表单',
  )
  await assertNoBrowserPersistence(modelPage, '退出后刷新登录页')
  await modelContext.close()

  await page.goto(origin, { waitUntil: 'networkidle' })
  await loginToModeler(page)
  await page.locator('[data-testid="process-model-list-page"]').waitFor()
  assert((await page.locator('.djs-container').count()) === 0, '独立模式初始页面提前挂载了编辑器')
  assert(
    await page.evaluate(() => !window.bpmnModeler && !window.flowableProcessModeler),
    '流程模型列表阶段提前暴露了编辑器桥',
  )
  await createModelFromList(page, '请假审批流程', 'Process_leave_request')
  const mainModelId = mainModelApi.state.requests.find(
    (request) => request.method === 'POST' && request.path === '/models',
  ).modelId
  await page.evaluate(
    (xml) => window.flowableProcessModeler.importXML(xml, 'default-smoke.bpmn20.xml'),
    defaultDiagramXml,
  )
  await page.waitForFunction(
    () => Boolean(window.bpmnModeler.get('elementRegistry').get('UserTask_approve')),
  )

  const initial = await page.evaluate(() => ({
    bridge: Boolean(window.bpmnModeler && window.flowableProcessModeler),
    elements: document.querySelectorAll('.djs-element').length,
    palette: document.querySelectorAll('.djs-palette .entry').length,
    loading: Boolean(document.querySelector('.canvas-loading')),
  }))
  assert(initial.bridge, '集成桥未暴露')
  assert(initial.elements >= 5, '默认 BPMN 流程未渲染')
  assert(initial.palette >= 10, 'BPMN palette 未加载')
  assert(!initial.loading, '设计器一直停留在加载状态')

  const alignmentBefore = await page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    const elements = [registry.get('StartEvent_apply'), registry.get('UserTask_approve')]
    window.bpmnModeler.get('selection').select(elements)
    return elements.map(({ id, x, y }) => ({ id, x, y }))
  })
  await page.waitForFunction(() => window.bpmnModeler.get('selection').get().length === 2)
  await page.getByRole('button', { name: '对齐所选元素' }).click()
  await page.getByRole('menuitem', { name: '顶部对齐', exact: true }).click()
  await page.waitForFunction(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    return registry.get('StartEvent_apply').y === registry.get('UserTask_approve').y
  })
  const alignmentAfter = await page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    return ['StartEvent_apply', 'UserTask_approve'].map((id) => {
      const { x, y } = registry.get(id)
      return { id, x, y }
    })
  })
  assert(
    alignmentAfter.some((element, index) => element.y !== alignmentBefore[index].y),
    '顶部对齐没有改变所选元素坐标',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(
    (expected) => {
      const registry = window.bpmnModeler.get('elementRegistry')
      return expected.every(({ id, x, y }) => {
        const element = registry.get(id)
        return element.x === x && element.y === y
      })
    },
    alignmentBefore,
  )

  await page.evaluate(() => window.bpmnModeler.get('selection').select(null))
  await page.locator('[data-testid="add-global-message"]').click()
  await page.locator('[data-testid="global-definition-id"]').fill('Message_order_created')
  await page.locator('[data-testid="global-definition-name"]').fill('订单已创建')
  await page.locator('[data-testid="save-global-definition"]').click()
  await page.waitForFunction(() =>
    window.bpmnModeler
      .getDefinitions()
      .rootElements.some((value) => value.$type === 'bpmn:Message' && value.id === 'Message_order_created'),
  )
  const messageClaimedAfterAdd = await page.evaluate(() => {
    const message = window.bpmnModeler
      .getDefinitions()
      .rootElements.find((value) => value.id === 'Message_order_created')
    return window.bpmnModeler.get('moddle').ids.assigned('Message_order_created') === message
  })
  assert(messageClaimedAfterAdd, '新增全局消息后没有注册 moddle ID')

  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  const messageAfterUndo = await page.evaluate(() => ({
    exists: window.bpmnModeler
      .getDefinitions()
      .rootElements.some((value) => value.$type === 'bpmn:Message' && value.id === 'Message_order_created'),
    claimed: Boolean(window.bpmnModeler.get('moddle').ids.assigned('Message_order_created')),
  }))
  assert(!messageAfterUndo.exists, '全局消息定义撤销失败')
  assert(!messageAfterUndo.claimed, '撤销新增全局消息后仍占用 moddle ID')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const message = window.bpmnModeler
      .getDefinitions()
      .rootElements.find((value) => value.id === 'Message_order_created')
    return window.bpmnModeler.get('moddle').ids.assigned('Message_order_created') === message
  })

  const createdMessageRow = page.locator('.list-item').filter({ hasText: 'Message_order_created' })
  await createdMessageRow.locator('button').first().click()
  await page.locator('[data-testid="global-definition-id"]').fill('Message_order_renamed')
  await page.locator('[data-testid="save-global-definition"]').click()
  await page.waitForFunction(() => {
    const message = window.bpmnModeler
      .getDefinitions()
      .rootElements.find((value) => value.id === 'Message_order_renamed')
    const ids = window.bpmnModeler.get('moddle').ids
    return message && ids.assigned('Message_order_renamed') === message && !ids.assigned('Message_order_created')
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const message = window.bpmnModeler
      .getDefinitions()
      .rootElements.find((value) => value.id === 'Message_order_created')
    const ids = window.bpmnModeler.get('moddle').ids
    return message && ids.assigned('Message_order_created') === message && !ids.assigned('Message_order_renamed')
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())

  const renamedMessageRow = page.locator('.list-item').filter({ hasText: 'Message_order_renamed' })
  await renamedMessageRow.locator('button').last().click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '取消' }).click()
  await page.locator('.el-message-box').waitFor({ state: 'hidden' })
  assert(await renamedMessageRow.isVisible(), '取消删除后全局消息被移除')

  await renamedMessageRow.locator('button').last().click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => {
    const definitions = window.bpmnModeler.getDefinitions()
    return (
      !definitions.rootElements.some((value) => value.id === 'Message_order_renamed') &&
      !window.bpmnModeler.get('moddle').ids.assigned('Message_order_renamed')
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const message = window.bpmnModeler
      .getDefinitions()
      .rootElements.find((value) => value.id === 'Message_order_renamed')
    return window.bpmnModeler.get('moddle').ids.assigned('Message_order_renamed') === message
  })

  await page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    window.bpmnModeler.get('selection').select(registry.get('UserTask_approve'))
  })

  const idInput = page
    .locator('.el-form-item')
    .filter({ has: page.locator('.el-form-item__label', { hasText: '标识（ID）' }) })
    .first()
    .locator('input')
  await idInput.fill('Message_order_renamed')
  await idInput.press('Tab')
  assert((await idInput.inputValue()) === 'UserTask_approve', '普通元素接受了全局定义占用的 ID')

  const assigneeInput = page
    .locator('.el-form-item')
    .filter({ has: page.locator('.el-form-item__label', { hasText: '办理人' }) })
    .first()
    .locator('input')
  await assigneeInput.fill('${manager}')
  await assigneeInput.press('Tab')

  const xml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(xml.includes('xmlns:flowable="http://flowable.org/bpmn"'), 'Flowable namespace 不正确')
  assert(xml.includes('flowable:assignee="${manager}"'), '用户任务办理人未写回 XML')

  assert(
    (await page.locator('.el-collapse-item').filter({
      has: page.locator('.el-collapse-item__header', { hasText: '表单配置' }),
    }).count()) === 0,
    '默认构建仍显示表单配置入口',
  )
  assert(
    (await page.evaluate(() => typeof window.flowableProcessModeler.configureHost)) ===
      'undefined',
    '设计器仍暴露 configureHost',
  )

  const problems = await page.evaluate(() => window.flowableProcessModeler.validate())
  assert(Array.isArray(problems), '流程校验没有返回结果数组')

  const extensionPropertySection = page.locator('.el-collapse-item').filter({
    has: page.locator('.collapse-title', { hasText: '扩展属性' }),
  })
  await extensionPropertySection.locator('.el-collapse-item__header').click()

  const originalExtensionProperty = {
    id: 'Property_smoke',
    name: 'approvalLevel',
    value: 'department',
  }
  const editedExtensionProperty = {
    ...originalExtensionProperty,
    name: 'approvalScope',
    value: 'company',
  }

  await extensionPropertySection.locator('[data-testid="add-extension-property"]').click()
  await page.locator('[data-testid="extension-property-id"]').fill(originalExtensionProperty.id)
  await page.locator('[data-testid="extension-property-name"]').fill(originalExtensionProperty.name)
  await page.locator('[data-testid="extension-property-value"]').fill(originalExtensionProperty.value)
  await page.locator('[data-testid="save-extension-property"]').click()
  await waitForExtensionProperty(page, 'UserTask_approve', originalExtensionProperty)

  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForExtensionProperty(page, 'UserTask_approve', null)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForExtensionProperty(page, 'UserTask_approve', originalExtensionProperty)

  let extensionPropertyRow = page
    .locator('[data-testid="extension-property-row"]')
    .filter({ hasText: originalExtensionProperty.name })
  await extensionPropertyRow.getByRole('button', { name: '编辑扩展属性' }).click()
  await page.locator('[data-testid="extension-property-name"]').fill(editedExtensionProperty.name)
  await page.locator('[data-testid="extension-property-value"]').fill(editedExtensionProperty.value)
  await page.locator('[data-testid="save-extension-property"]').click()
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForExtensionProperty(page, 'UserTask_approve', originalExtensionProperty)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  extensionPropertyRow = page.locator('[data-testid="extension-property-row"]')
  assert((await extensionPropertyRow.count()) === 1, '编辑扩展属性后列表行数量异常')
  await extensionPropertyRow.getByRole('button', { name: '删除扩展属性' }).click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await waitForExtensionProperty(page, 'UserTask_approve', null)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForExtensionProperty(page, 'UserTask_approve', null)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  let extensionPropertyXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const serializedExtensionProperty =
    '<flowable:property id="Property_smoke" name="approvalScope" value="company" />'
  assert(extensionPropertyXml.includes(serializedExtensionProperty), '扩展属性未写回 XML')
  for (let cycle = 1; cycle <= 2; cycle += 1) {
    const warningCount = await page.evaluate(
      async ({ fixture, fileName }) =>
        (await window.flowableProcessModeler.importXML(fixture, fileName)).warnings.length,
      {
        fixture: extensionPropertyXml,
        fileName: `extension-property-cycle-${cycle}.bpmn20.xml`,
      },
    )
    assert(warningCount === 0, `扩展属性第 ${cycle} 次导入产生兼容警告`)
    await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)
    extensionPropertyXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
    assert(
      extensionPropertyXml.includes(serializedExtensionProperty),
      `扩展属性第 ${cycle} 次往返后丢失`,
    )
  }

  const concurrentImport = await page.evaluate(async (latestFixture) => {
    const modeler = window.bpmnModeler
    const bridge = window.flowableProcessModeler
    const moddle = modeler.get('moddle')
    const staleFixture = latestFixture
      .replaceAll('Process_leave_request', 'Process_concurrent_stale')
      .replace('name="请假审批流程"', 'name="并发导入旧请求"')
    const originalFromXML = moddle.fromXML
    let parseCalls = 0

    moddle.fromXML = async function delayedFirstParse(xml, ...args) {
      parseCalls += 1
      if (parseCalls === 1) {
        await new Promise((resolve) => setTimeout(resolve, 80))
      }
      return originalFromXML.call(moddle, xml, ...args)
    }

    try {
      const staleImport = bridge.importXML(staleFixture, 'concurrent-stale.bpmn20.xml')
      const latestImport = bridge.importXML(latestFixture, 'concurrent-latest.bpmn20.xml')
      await new Promise((resolve) => setTimeout(resolve, 20))
      const loadingDuringImport = Boolean(document.querySelector('.canvas-loading'))
      const designerMain = document.querySelector('.designer-main')
      const saveModelButton = [...document.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === '保存模型',
      )
      const mainInertDuringImport = Boolean(designerMain?.inert)
      const mainHasInertAttributeDuringImport = Boolean(designerMain?.hasAttribute('inert'))
      const mainBusyDuringImport = designerMain?.getAttribute('aria-busy')
      const toolbarLockedDuringImport = Boolean(saveModelButton?.disabled)
      const results = await Promise.all([staleImport, latestImport])
      return {
        loadingDuringImport,
        mainInertDuringImport,
        mainHasInertAttributeDuringImport,
        mainBusyDuringImport,
        toolbarLockedDuringImport,
        parseCalls,
        warningCounts: results.map((result) => result.warnings.length),
        finalProcessId: modeler.get('canvas').getRootElement().businessObject.id,
      }
    } finally {
      moddle.fromXML = originalFromXML
    }
  }, extensionPropertyXml)
  assert(concurrentImport.loadingDuringImport, '并发导入期间未保持加载状态')
  assert(
    concurrentImport.mainInertDuringImport && concurrentImport.mainHasInertAttributeDuringImport,
    `导入期间未冻结画布和属性面板交互：${JSON.stringify(concurrentImport)}`,
  )
  assert(concurrentImport.toolbarLockedDuringImport, '导入期间工具栏仍允许执行模型操作')
  assert(concurrentImport.parseCalls === 2, '并发导入未执行全部宿主请求')
  assert(
    concurrentImport.warningCounts.every((count) => count === 0),
    '并发导入产生兼容警告',
  )
  assert(
    concurrentImport.finalProcessId === 'Process_leave_request',
    '并发导入结束后不是最后一次宿主调用的流程',
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const rollbackBaseline = await page.evaluate(async () => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('modeling').updateProperties(task, { name: '回滚基线审批' })
    modeler.get('selection').select(task)
    const viewbox = modeler.get('canvas').viewbox()
    return {
      xml: await window.flowableProcessModeler.getXML(),
      viewbox: {
        x: viewbox.x,
        y: viewbox.y,
        width: viewbox.width,
        height: viewbox.height,
      },
    }
  })
  await waitForHeaderStatus(page, '未保存')
  await page.locator('.element-summary').getByText('回滚基线审批', { exact: true }).waitFor()

  const parseFailureRollback = await page.evaluate(async () => {
    let rejected = false
    try {
      await window.bpmnModeler.importXML('<bpmn:definitions')
    } catch {
      rejected = true
    }
    return {
      rejected,
      canUndo: window.bpmnModeler.get('commandStack').canUndo(),
      rootId: window.bpmnModeler.get('canvas').getRootElement().businessObject.id,
      xml: await window.flowableProcessModeler.getXML(),
    }
  })
  assert(parseFailureRollback.rejected, '非法 XML 导入没有拒绝 Promise')
  assert(parseFailureRollback.canUndo, '解析失败后丢失了原流程 undo 历史')
  assert(parseFailureRollback.rootId === 'Process_leave_request', '解析失败后画布根流程发生变化')
  assert(parseFailureRollback.xml === rollbackBaseline.xml, '解析失败后导出 XML 发生变化')

  const missingTargetFixture = rollbackBaseline.xml
    .replaceAll('Process_leave_request', 'Process_failed_target_probe')
    .replace('name="请假审批流程"', 'name="失败目标候选流程"')
  const missingTargetRollback = await page.evaluate(async (fixture) => {
    let rejected = false
    let message = ''
    try {
      await window.bpmnModeler.importXML(fixture, 'BPMNDiagram_missing_probe')
    } catch (error) {
      rejected = true
      message = error?.message || String(error)
    }
    const modeler = window.bpmnModeler
    const viewbox = modeler.get('canvas').viewbox()
    return {
      rejected,
      message,
      rootId: modeler.get('canvas').getRootElement().businessObject.id,
      taskName: modeler.get('elementRegistry').get('UserTask_approve').businessObject.name,
      selectionIds: modeler.get('selection').get().map((element) => element.id),
      viewbox: {
        x: viewbox.x,
        y: viewbox.y,
        width: viewbox.width,
        height: viewbox.height,
      },
      xml: await window.flowableProcessModeler.getXML(),
    }
  }, missingTargetFixture)
  assert(missingTargetRollback.rejected, '不存在的 BPMNDiagram 目标没有拒绝导入')
  assert(missingTargetRollback.message.includes('not found'), '目标 Diagram 失败原因不正确')
  assert(
    missingTargetRollback.rootId === 'Process_leave_request' &&
      missingTargetRollback.taskName === '回滚基线审批',
    '目标 Diagram 失败后画布未恢复原流程',
  )
  assert(
    JSON.stringify(missingTargetRollback.selectionIds) === JSON.stringify(['UserTask_approve']),
    '目标 Diagram 失败后未恢复原选择',
  )
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(
      Math.abs(missingTargetRollback.viewbox[key] - rollbackBaseline.viewbox[key]) < 0.01,
      `目标 Diagram 失败后未恢复视口 ${key}`,
    )
  }
  assert(
    missingTargetRollback.xml === rollbackBaseline.xml &&
      !missingTargetRollback.xml.includes('Process_failed_target_probe'),
    '目标 Diagram 失败后画布与导出 definitions 不一致',
  )
  await waitForHeaderStatus(page, '未保存')
  await page.locator('.element-summary').getByText('回滚基线审批', { exact: true }).waitFor()

  const dualDiagramBaseline = await page.evaluate(async (sourceXml) => {
    const BPMN_DI_NAMESPACE = 'http://www.omg.org/spec/BPMN/20100524/DI'
    const DC_NAMESPACE = 'http://www.omg.org/spec/DD/20100524/DC'
    const DI_NAMESPACE = 'http://www.omg.org/spec/DD/20100524/DI'
    const secondaryDiagramId = 'BPMNDiagram_rollback_secondary'
    const documentNode = new DOMParser().parseFromString(sourceXml, 'application/xml')
    const parserError = documentNode.querySelector('parsererror')
    if (parserError) throw new Error(`双 DI 测试 XML 解析失败：${parserError.textContent}`)

    const diagrams = [...documentNode.getElementsByTagNameNS(BPMN_DI_NAMESPACE, 'BPMNDiagram')]
    if (diagrams.length !== 1) {
      throw new Error(`双 DI 测试需要一个基准 BPMNDiagram，实际为 ${diagrams.length}`)
    }
    const primaryDiagram = diagrams[0]
    const primaryTaskShape = [...primaryDiagram.getElementsByTagNameNS(BPMN_DI_NAMESPACE, 'BPMNShape')]
      .find((shape) => shape.getAttribute('bpmnElement') === 'UserTask_approve')
    const primaryTaskBounds = primaryTaskShape?.getElementsByTagNameNS(DC_NAMESPACE, 'Bounds')[0]
    if (!primaryTaskBounds) throw new Error('双 DI 测试找不到基准 UserTask_approve 坐标')

    const secondaryDiagram = primaryDiagram.cloneNode(true)
    for (const element of [secondaryDiagram, ...secondaryDiagram.getElementsByTagName('*')]) {
      const id = element.getAttribute('id')
      if (id) element.setAttribute('id', `${id}_rollback_secondary`)
    }
    secondaryDiagram.setAttribute('id', secondaryDiagramId)
    const secondaryPlane = secondaryDiagram.getElementsByTagNameNS(BPMN_DI_NAMESPACE, 'BPMNPlane')[0]
    if (!secondaryPlane) throw new Error('双 DI 测试的第二张图缺少 BPMNPlane')
    secondaryPlane.setAttribute('id', 'BPMNPlane_rollback_secondary')

    for (const bounds of secondaryDiagram.getElementsByTagNameNS(DC_NAMESPACE, 'Bounds')) {
      bounds.setAttribute('x', String(Number(bounds.getAttribute('x')) + 640))
      bounds.setAttribute('y', String(Number(bounds.getAttribute('y')) + 120))
    }
    for (const waypoint of secondaryDiagram.getElementsByTagNameNS(DI_NAMESPACE, 'waypoint')) {
      waypoint.setAttribute('x', String(Number(waypoint.getAttribute('x')) + 640))
      waypoint.setAttribute('y', String(Number(waypoint.getAttribute('y')) + 120))
    }
    documentNode.documentElement.append(secondaryDiagram)

    const fixture = new XMLSerializer().serializeToString(documentNode)
    const result = await window.bpmnModeler.importXML(fixture, secondaryDiagramId)
    const modeler = window.bpmnModeler
    const canvas = modeler.get('canvas')
    const root = canvas.getRootElement()
    const definitions = modeler.getDefinitions()
    const activeDiagram = definitions.diagrams.find(
      (diagram) => diagram.plane === root.di || diagram.id === root.di?.$parent?.id,
    )
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('selection').select(task)
    return {
      warningCount: result.warnings.length,
      xml: await window.flowableProcessModeler.getXML(),
      diagramCount: definitions.diagrams.length,
      diagramOwners: definitions.diagrams.map((diagram) => diagram.plane?.bpmnElement?.id),
      activeDiagramId: activeDiagram?.id,
      primaryTask: {
        x: Number(primaryTaskBounds.getAttribute('x')),
        y: Number(primaryTaskBounds.getAttribute('y')),
      },
      task: { x: task.x, y: task.y },
    }
  }, rollbackBaseline.xml)
  assert(dualDiagramBaseline.warningCount === 0, '双 DI 基准导入产生兼容警告')
  assert(
    dualDiagramBaseline.diagramCount === 2 &&
      dualDiagramBaseline.diagramOwners.every((ownerId) => ownerId === 'Process_leave_request'),
    `双 DI 基准未指向同一流程：${JSON.stringify(dualDiagramBaseline)}`,
  )
  assert(
    dualDiagramBaseline.activeDiagramId === 'BPMNDiagram_rollback_secondary',
    '强制导入后未激活第二张 BPMNDiagram',
  )
  assert(
    Math.abs(dualDiagramBaseline.task.x - (dualDiagramBaseline.primaryTask.x + 640)) < 0.01 &&
      Math.abs(dualDiagramBaseline.task.y - (dualDiagramBaseline.primaryTask.y + 120)) < 0.01,
    '第二张 BPMNDiagram 未使用其独立坐标',
  )

  const dualDiagramRollback = await page.evaluate(async (fixture) => {
    let rejected = false
    let message = ''
    try {
      await window.bpmnModeler.importXML(fixture, 'BPMNDiagram_rollback_missing')
    } catch (error) {
      rejected = true
      message = error?.message || String(error)
    }
    const modeler = window.bpmnModeler
    const canvas = modeler.get('canvas')
    const root = canvas.getRootElement()
    const definitions = modeler.getDefinitions()
    const activeDiagram = definitions.diagrams.find(
      (diagram) => diagram.plane === root.di || diagram.id === root.di?.$parent?.id,
    )
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    return {
      rejected,
      message,
      activeDiagramId: activeDiagram?.id,
      task: { x: task.x, y: task.y },
      selectionIds: modeler.get('selection').get().map((element) => element.id),
      xml: await window.flowableProcessModeler.getXML(),
    }
  }, dualDiagramBaseline.xml)
  assert(dualDiagramRollback.rejected, '双 DI 的不存在目标没有拒绝导入')
  assert(dualDiagramRollback.message.includes('not found'), '双 DI 目标失败原因不正确')
  assert(
    dualDiagramRollback.activeDiagramId === dualDiagramBaseline.activeDiagramId,
    '双 DI 失败回滚后没有恢复原先激活的第二张图',
  )
  assert(
    Math.abs(dualDiagramRollback.task.x - dualDiagramBaseline.task.x) < 0.01 &&
      Math.abs(dualDiagramRollback.task.y - dualDiagramBaseline.task.y) < 0.01,
    '双 DI 失败回滚后没有恢复第二张图的元素坐标',
  )
  assert(
    JSON.stringify(dualDiagramRollback.selectionIds) === JSON.stringify(['UserTask_approve']),
    '双 DI 失败回滚后没有恢复元素选择',
  )
  assert(dualDiagramRollback.xml === dualDiagramBaseline.xml, '双 DI 失败回滚后导出 XML 发生变化')

  const dualDiagramRecovery = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'dual-di-test-recovery.bpmn20.xml',
    )
    return {
      warningCount: result.warnings.length,
      rootId: window.bpmnModeler.get('canvas').getRootElement().businessObject.id,
      xml: await window.flowableProcessModeler.getXML(),
    }
  }, rollbackBaseline.xml)
  assert(dualDiagramRecovery.warningCount === 0, '双 DI 用例后的合法恢复产生警告')
  assert(
    dualDiagramRecovery.rootId === 'Process_leave_request' &&
      dualDiagramRecovery.xml === rollbackBaseline.xml,
    '双 DI 用例末尾未恢复合法基准流程',
  )
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const incoherentImportState = await page.evaluate(
    async ({ failedFixture, recoveryFixture }) => {
      const modeler = window.bpmnModeler
      const bridge = window.flowableProcessModeler
      const moddle = modeler.get('moddle')
      const originalFromXML = moddle.fromXML
      let parseCalls = 0
      let targetRejected = false
      let targetError = ''

      moddle.fromXML = function failRollbackParse(xml, ...args) {
        parseCalls += 1
        if (parseCalls === 2) {
          return Promise.reject(new Error('forced rollback parse failure'))
        }
        return originalFromXML.call(moddle, xml, ...args)
      }
      try {
        await modeler.importXML(failedFixture, 'BPMNDiagram_forced_rollback_failure')
      } catch (error) {
        targetRejected = true
        targetError = error?.message || String(error)
      } finally {
        moddle.fromXML = originalFromXML
      }

      const readLockSnapshot = () => {
        const shell = document.querySelector('.designer-shell')
        const main = document.querySelector('.designer-main')
        const saveButton = [...document.querySelectorAll('button')].find(
          (button) => button.textContent?.trim() === '保存模型',
        )
        return {
          shellLocked: Boolean(shell?.classList.contains('is-interaction-locked')),
          mainInert: Boolean(main?.inert),
          mainHasInertAttribute: Boolean(main?.hasAttribute('inert')),
          saveDisabled: Boolean(saveButton?.disabled),
        }
      }
      const readModelSnapshot = () => ({
        rootId: modeler.get('canvas').getRootElement().businessObject.id,
        processIds: (modeler.getDefinitions().rootElements || [])
          .filter((element) => element.$type === 'bpmn:Process')
          .map((element) => element.id),
      })

      const lockBeforeMalformed = readLockSnapshot()
      const modelBeforeMalformed = readModelSnapshot()
      let malformedRejected = false
      let malformedError = ''
      try {
        await modeler.importXML('<bpmn:definitions')
      } catch (error) {
        malformedRejected = true
        malformedError = error?.message || String(error)
      }

      const operationErrors = {}
      try {
        await bridge.getXML()
      } catch (error) {
        operationErrors.getXML = error?.message || String(error)
      }
      try {
        bridge.validate()
      } catch (error) {
        operationErrors.validate = error?.message || String(error)
      }
      try {
        await bridge.saveModel()
      } catch (error) {
        operationErrors.saveModel = error?.message || String(error)
      }

      const lockedAfterMalformed = readLockSnapshot()
      const modelAfterMalformed = readModelSnapshot()
      const recoveryResult = await bridge.importXML(
        recoveryFixture,
        'incoherent-state-recovery.bpmn20.xml',
      )
      const recoveredXml = await bridge.getXML()
      return {
        parseCalls,
        targetRejected,
        targetError,
        malformedRejected,
        malformedError,
        lockBeforeMalformed,
        lockedAfterMalformed,
        modelBeforeMalformed,
        modelAfterMalformed,
        operationErrors,
        recoveryWarningCount: recoveryResult.warnings.length,
        recoveredRootId: modeler.get('canvas').getRootElement().businessObject.id,
        recoveredXml,
        lockAfterRecovery: readLockSnapshot(),
      }
    },
    { failedFixture: missingTargetFixture, recoveryFixture: rollbackBaseline.xml },
  )
  assert(incoherentImportState.parseCalls === 2, '双失败注入没有命中候选解析和回滚解析')
  assert(
    incoherentImportState.targetRejected && incoherentImportState.targetError.includes('not found'),
    '强制目标导入没有以原始 missing-target 错误拒绝',
  )
  assert(incoherentImportState.malformedRejected, '不一致状态下 malformed XML 导入没有拒绝')
  assert(
    incoherentImportState.modelBeforeMalformed.rootId === 'Process_leave_request' &&
      incoherentImportState.modelBeforeMalformed.processIds.includes('Process_failed_target_probe'),
    '双失败没有制造可观察的画布/definitions 不一致状态',
  )
  assert(
    JSON.stringify(incoherentImportState.modelAfterMalformed) ===
      JSON.stringify(incoherentImportState.modelBeforeMalformed),
    'malformed 解析改变了既有不一致状态',
  )
  for (const phase of ['lockBeforeMalformed', 'lockedAfterMalformed']) {
    const lock = incoherentImportState[phase]
    assert(
      lock.shellLocked && lock.mainInert && lock.mainHasInertAttribute && lock.saveDisabled,
      `${phase} 未保持不可操作锁：${JSON.stringify(lock)}`,
    )
  }
  for (const operation of ['getXML', 'validate', 'saveModel']) {
    assert(
      incoherentImportState.operationErrors[operation]?.includes('导入恢复失败'),
      `不一致状态下 ${operation} 没有拒绝：${JSON.stringify(incoherentImportState.operationErrors)}`,
    )
  }
  assert(
    incoherentImportState.recoveryWarningCount === 0 &&
      incoherentImportState.recoveredRootId === 'Process_leave_request' &&
      incoherentImportState.recoveredXml === rollbackBaseline.xml,
    '不一致状态用例末尾未通过合法导入恢复',
  )
  assert(
    !incoherentImportState.lockAfterRecovery.shellLocked &&
      !incoherentImportState.lockAfterRecovery.mainInert &&
      !incoherentImportState.lockAfterRecovery.mainHasInertAttribute &&
      !incoherentImportState.lockAfterRecovery.saveDisabled,
    `合法恢复后仍保持交互锁：${JSON.stringify(incoherentImportState.lockAfterRecovery)}`,
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const noPlaneFixture = rollbackBaseline.xml
    .replaceAll('Process_leave_request', 'Process_no_plane_probe')
    .replace(
      /<bpmndi:BPMNDiagram\b[\s\S]*?<\/bpmndi:BPMNDiagram>/,
      '<bpmndi:BPMNDiagram id="BPMNDiagram_no_plane_probe" />',
    )
  const failedThenSuccessfulImport = await page.evaluate(
    async ({ failedFixture, recoveryFixture }) => {
      const failedImport = window.bpmnModeler.importXML(
        failedFixture,
        'BPMNDiagram_no_plane_probe',
      )
      const recoveryImport = window.flowableProcessModeler.importXML(
        recoveryFixture,
        'rollback-queue-recovery.bpmn20.xml',
      )
      const settled = await Promise.allSettled([failedImport, recoveryImport])
      const modeler = window.bpmnModeler
      return {
        statuses: settled.map((result) => result.status),
        recoveryWarnings:
          settled[1].status === 'fulfilled' ? settled[1].value.warnings.length : -1,
        rootId: modeler.get('canvas').getRootElement().businessObject.id,
        selectionCount: modeler.get('selection').get().length,
        xml: await window.flowableProcessModeler.getXML(),
      }
    },
    { failedFixture: noPlaneFixture, recoveryFixture: rollbackBaseline.xml },
  )
  assert(
    JSON.stringify(failedThenSuccessfulImport.statuses) ===
      JSON.stringify(['rejected', 'fulfilled']),
    '失败导入污染了后续合法导入队列',
  )
  assert(failedThenSuccessfulImport.recoveryWarnings === 0, '回滚后的合法导入产生警告')
  assert(
    failedThenSuccessfulImport.rootId === 'Process_leave_request' &&
      failedThenSuccessfulImport.selectionCount === 0,
    '失败后续跑的合法导入未成为最终画布状态',
  )
  assert(
    failedThenSuccessfulImport.xml === rollbackBaseline.xml,
    '失败后续跑的合法导入未成为最终导出 definitions',
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const unsupportedRetryCycleState = await page.evaluate(async () => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    const extensionElements = task.businessObject.extensionElements
    if (!extensionElements) throw new Error('User Task 缺少 extensionElements')
    const retryCycle = modeler.get('moddle').create('flowable:FailedJobRetryTimeCycle', {
      body: 'R2/PT1M',
    })
    retryCycle.$parent = extensionElements
    modeler.get('modeling').updateModdleProperties(task, extensionElements, {
      values: [...(extensionElements.values || []), retryCycle],
    })
    return {
      problems: window.flowableProcessModeler.validate(),
      xml: await window.flowableProcessModeler.getXML(),
    }
  })
  assert(
    unsupportedRetryCycleState.problems.some(
      (problem) =>
        problem.elementId === 'UserTask_approve' &&
        problem.level === 'warning' &&
        problem.message === 'Flowable 6.8.1 仅从服务任务读取失败作业重试周期',
    ),
    'User Task 上的失败作业重试周期没有给出精确执行语义 warning',
  )
  assert(
    unsupportedRetryCycleState.xml.includes(
      '<flowable:failedJobRetryTimeCycle>R2/PT1M</flowable:failedJobRetryTimeCycle>',
    ),
    'User Task 上注入的失败作业重试周期未保留在 XML 中',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:FailedJobRetryTimeCycle',
    )
  })

  const mapExceptionServiceTask = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const current = modeler.get('elementRegistry').get('UserTask_approve')
    const replacement = modeler.get('bpmnReplace').replaceElement(current, {
      type: 'bpmn:ServiceTask',
    })
    modeler.get('selection').select(replacement)
    return { id: replacement.id, type: replacement.type }
  })
  assert(
    mapExceptionServiceTask.id === 'UserTask_approve' &&
      mapExceptionServiceTask.type === 'bpmn:ServiceTask',
    '异常映射测试未能创建 Service Task',
  )

  const serviceTaskAdvancedSection = page.locator('.el-collapse-item').filter({
    has: page.locator('.el-collapse-item__header', { hasText: '高级配置' }),
  })
  const serviceTaskAdvancedHeader = serviceTaskAdvancedSection.locator(
    '.el-collapse-item__header',
  )
  if ((await serviceTaskAdvancedHeader.getAttribute('aria-expanded')) !== 'true') {
    await serviceTaskAdvancedHeader.click()
  }

  const jobCategoryInput = page.locator('[data-testid="job-category"]')
  await jobCategoryInput.waitFor({ state: 'visible' })
  const jobCategoryExpression = '${jobCategory}'
  await jobCategoryInput.fill(jobCategoryExpression)
  await jobCategoryInput.press('Tab')
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:JobCategory' && value.body === expected,
    )
  }, jobCategoryExpression)
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:JobCategory',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:JobCategory' && value.body === expected,
    )
  }, jobCategoryExpression)

  const unblurredHostCategory = 'host-get-xml-category'
  await jobCategoryInput.fill(unblurredHostCategory)
  const unblurredHostXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    unblurredHostXml.includes(
      '<flowable:jobCategory>host-get-xml-category</flowable:jobCategory>',
    ),
    '宿主 getXML 没有提交仍聚焦的作业分类输入',
  )

  const unblurredModelCategory = 'ctrl-save-category'
  await jobCategoryInput.fill(unblurredModelCategory)
  const keyboardSaveResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      new URL(response.url()).pathname ===
        `/modeler-app/rest/models/${mainModelId}/editor/json`,
  )
  await jobCategoryInput.press('Control+s')
  await keyboardSaveResponse
  const keyboardSaveRequest = [...mainModelApi.state.requests]
    .reverse()
    .find(
      (request) =>
        request.method === 'POST' && request.path === `/models/${mainModelId}/editor/json`,
    )
  assert(
    keyboardSaveRequest?.form?.json_xml?.includes(unblurredModelCategory),
    'Ctrl+S 没有把仍聚焦的作业分类输入转换到 Oryx JSON 保存请求',
  )

  await jobCategoryInput.fill(jobCategoryExpression)
  const restoredJobCategoryXml = await page.evaluate(() =>
    window.flowableProcessModeler.getXML(),
  )
  assert(
    restoredJobCategoryXml.includes(
      '<flowable:jobCategory>${jobCategory}</flowable:jobCategory>',
    ),
    '作业分类表达式未通过聚焦编辑提交路径恢复',
  )

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('modeling').updateProperties(task, {
      'flowable:async': true,
      'flowable:asyncAfter': true,
    })
  })
  const asyncBeforeSwitch = page.locator('[data-testid="async-before"]')
  const asyncAfterSwitch = page.locator('[data-testid="async-after"]')
  assert(
    (await asyncBeforeSwitch.locator('input[type="checkbox"]').isChecked()) &&
      (await asyncAfterSwitch.locator('input[type="checkbox"]').isChecked()),
    'async/asyncAfter 没有回显到异步开关',
  )
  await asyncBeforeSwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      task.get('flowable:async') === false &&
      task.get('flowable:asyncLeave') === true &&
      task.get('flowable:asyncAfter') === false
    )
  })
  await asyncBeforeSwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:async') === true
  })
  const asyncBeforeExclusiveSwitch = page.locator(
    '[data-testid="async-before-exclusive"]',
  )
  await asyncBeforeExclusiveSwitch.waitFor({ state: 'visible' })
  await asyncBeforeExclusiveSwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:exclusive') === false
  })

  const asyncAfterExclusiveSwitch = page.locator(
    '[data-testid="async-after-exclusive"]',
  )
  await asyncAfterExclusiveSwitch.waitFor({ state: 'visible' })
  await asyncAfterExclusiveSwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:asyncLeaveExclusive') === false
  })

  const asyncConfigurationState = await page.evaluate(async () => ({
    problems: window.flowableProcessModeler.validate(),
    xml: await window.flowableProcessModeler.getXML(),
  }))
  assert(
    /<bpmn2?:serviceTask\b(?=[^>]*\bflowable:async="true")(?=[^>]*\bflowable:exclusive="false")(?=[^>]*\bflowable:asyncLeave="true")(?=[^>]*\bflowable:asyncLeaveExclusive="false")[^>]*>/.test(
      asyncConfigurationState.xml,
    ),
    '进入/离开异步及各自独占标志没有独立写入 Service Task',
  )
  assert(
    asyncConfigurationState.xml.includes(
      '<flowable:jobCategory>${jobCategory}</flowable:jobCategory>',
    ) && !/flowable:jobCategory\s*=/.test(asyncConfigurationState.xml),
    '作业分类表达式没有按 Flowable 扩展正文输出',
  )
  assert(
    !asyncConfigurationState.problems.some((problem) =>
      [
        'exclusive="false" 仅在 flowable:async="true" 时生效',
        'asyncLeaveExclusive="false" 仅在 flowable:asyncLeave="true" 时生效',
      ].includes(problem.message),
    ),
    '有效异步配置被错误标记为兼容性 warning',
  )

  await jobCategoryInput.fill('')
  await jobCategoryInput.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:JobCategory',
    )
  })
  const clearedJobCategoryXml = await page.evaluate(() =>
    window.flowableProcessModeler.getXML(),
  )
  assert(
    !clearedJobCategoryXml.includes('flowable:jobCategory'),
    '清空作业分类后扩展元素仍残留在 XML 中',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:JobCategory' && value.body === expected,
    )
  }, jobCategoryExpression)

  const retryCycleInput = page.locator('[data-testid="failed-job-retry-cycle"]')
  await retryCycleInput.waitFor({ state: 'visible' })
  await retryCycleInput.fill('R5/PT5M')
  await retryCycleInput.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const retryCycle = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:FailedJobRetryTimeCycle',
    )
    return retryCycle?.body === 'R5/PT5M'
  })
  const fixedRetryCycleXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    fixedRetryCycleXml.includes(
      '<flowable:failedJobRetryTimeCycle>R5/PT5M</flowable:failedJobRetryTimeCycle>',
    ),
    'Service Task 失败作业重试周期未写入扩展正文和 XML',
  )

  const retryCycleExpression = '${retryCycle}'
  await retryCycleInput.fill(retryCycleExpression)
  await retryCycleInput.press('Tab')
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:FailedJobRetryTimeCycle' && value.body === expected,
    )
  }, retryCycleExpression)
  const expressionRetryCycleXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    expressionRetryCycleXml.includes(
      '<flowable:failedJobRetryTimeCycle>${retryCycle}</flowable:failedJobRetryTimeCycle>',
    ),
    'Service Task 表达式重试周期未原样写入 XML',
  )

  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:FailedJobRetryTimeCycle' && value.body === 'R5/PT5M',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:FailedJobRetryTimeCycle' && value.body === expected,
    )
  }, retryCycleExpression)

  await retryCycleInput.fill('')
  await retryCycleInput.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:FailedJobRetryTimeCycle',
    )
  })
  const clearedRetryCycleXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    !clearedRetryCycleXml.includes('flowable:failedJobRetryTimeCycle'),
    '清空 Service Task 重试周期后扩展元素仍残留在 XML 中',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction((expected) => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:FailedJobRetryTimeCycle' && value.body === expected,
    )
  }, retryCycleExpression)

  const retryCycleRoundTripXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  mkdirSync('artifacts', { recursive: true })
  writeFileSync(
    'artifacts/async-job-config-roundtrip.bpmn20.xml',
    retryCycleRoundTripXml,
    'utf8',
  )
  const retryCycleRoundTripState = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'failed-job-retry-cycle-roundtrip.bpmn20.xml',
    )
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('selection').select(task)
    const retryCycle = (task.businessObject.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:FailedJobRetryTimeCycle',
    )
    const jobCategory = (task.businessObject.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:JobCategory',
    )
    return {
      warnings: result.warnings.length,
      body: retryCycle?.body,
      jobCategory: jobCategory?.body,
      async: task.businessObject.get('flowable:async'),
      exclusive: task.businessObject.get('flowable:exclusive'),
      asyncLeave: task.businessObject.get('flowable:asyncLeave'),
      asyncLeaveExclusive: task.businessObject.get('flowable:asyncLeaveExclusive'),
    }
  }, retryCycleRoundTripXml)
  assert(
    retryCycleRoundTripState.warnings === 0 &&
      retryCycleRoundTripState.body === retryCycleExpression &&
      retryCycleRoundTripState.jobCategory === jobCategoryExpression &&
      retryCycleRoundTripState.async === true &&
      retryCycleRoundTripState.exclusive === false &&
      retryCycleRoundTripState.asyncLeave === true &&
      retryCycleRoundTripState.asyncLeaveExclusive === false,
    `Service Task 异步作业配置 XML 往返异常：${JSON.stringify(retryCycleRoundTripState)}`,
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  if ((await serviceTaskAdvancedHeader.getAttribute('aria-expanded')) !== 'true') {
    await serviceTaskAdvancedHeader.click()
  }
  await retryCycleInput.waitFor({ state: 'visible' })
  assert(
    (await retryCycleInput.inputValue()) === retryCycleExpression,
    'Service Task 重试周期 XML 往返后未回显表达式',
  )
  assert(
    (await jobCategoryInput.inputValue()) === jobCategoryExpression &&
      (await asyncBeforeSwitch.locator('input[type="checkbox"]').isChecked()) &&
      !(await asyncBeforeExclusiveSwitch.locator('input[type="checkbox"]').isChecked()) &&
      (await asyncAfterSwitch.locator('input[type="checkbox"]').isChecked()) &&
      !(await asyncAfterExclusiveSwitch.locator('input[type="checkbox"]').isChecked()),
    'Service Task 异步作业配置 XML 往返后未完整回显到属性面板',
  )

  const mapExceptionSection = page.locator('.el-collapse-item').filter({
    has: page.locator('.el-collapse-item__header', { hasText: '异常映射' }),
  })
  await mapExceptionSection.locator('.el-collapse-item__header').click()
  await mapExceptionSection.locator('[data-testid="add-map-exception"]').click()
  await page.locator('[data-testid="map-exception-error-code"]').fill('ORDER_ERROR')
  await page.locator('[data-testid="map-exception-class"]').fill('java.lang.RuntimeException')
  await page
    .locator('[data-testid="map-exception-root-cause"]')
    .fill('java.lang.IllegalArgumentException')
  await page.locator('[data-testid="map-exception-include-children"]').click()
  await page.locator('[data-testid="save-map-exception"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mappings = (task.extensionElements?.values || []).filter(
      (value) => value.$type === 'flowable:MapException',
    )
    return (
      mappings.length === 1 &&
      mappings[0].errorCode === 'ORDER_ERROR' &&
      mappings[0].class === 'java.lang.RuntimeException' &&
      mappings[0].includeChildExceptions === true &&
      mappings[0].rootCause === 'java.lang.IllegalArgumentException'
    )
  })
  let mapExceptionRow = mapExceptionSection.locator('[data-testid="map-exception-row"]')
  assert((await mapExceptionRow.count()) === 1, '新增异常映射后列表数量异常')
  const createdMapExceptionXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    /<flowable:mapException\b(?=[^>]*\berrorCode="ORDER_ERROR")(?=[^>]*\bincludeChildExceptions="true")(?=[^>]*\brootCause="java\.lang\.IllegalArgumentException")[^>]*>java\.lang\.RuntimeException<\/flowable:mapException>/.test(
      createdMapExceptionXml,
    ),
    '新增异常映射未完整写入 XML',
  )

  await mapExceptionRow.getByRole('button', { name: '编辑异常映射' }).click()
  assert(
    (await page.locator('[data-testid="map-exception-error-code"]').inputValue()) ===
      'ORDER_ERROR',
    '导入的异常映射错误码未回显',
  )
  await page.locator('[data-testid="map-exception-error-code"]').fill('ORDER_UPDATED')
  await page.locator('[data-testid="map-exception-class"]').fill('java.lang.IllegalStateException')
  await page.locator('[data-testid="map-exception-root-cause"]').fill('java.io.IOException')
  await page.locator('[data-testid="map-exception-include-children"]').click()
  await page.locator('[data-testid="save-map-exception"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mapping = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:MapException',
    )
    return (
      mapping?.errorCode === 'ORDER_UPDATED' &&
      mapping.class === 'java.lang.IllegalStateException' &&
      mapping.includeChildExceptions === false &&
      mapping.rootCause === 'java.io.IOException'
    )
  })
  const editedMapExceptionXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    /<flowable:mapException\b(?=[^>]*\berrorCode="ORDER_UPDATED")(?=[^>]*\brootCause="java\.io\.IOException")[^>]*>java\.lang\.IllegalStateException<\/flowable:mapException>/.test(
      editedMapExceptionXml,
    ) && !editedMapExceptionXml.includes('includeChildExceptions="true"'),
    '编辑异常映射未完整写入 XML',
  )

  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mapping = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:MapException',
    )
    return mapping?.errorCode === 'ORDER_ERROR' && mapping.includeChildExceptions === true
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mapping = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:MapException',
    )
    return mapping?.errorCode === 'ORDER_UPDATED' && mapping.includeChildExceptions === false
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mapping = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:MapException',
    )
    return mapping?.errorCode === 'ORDER_ERROR' && mapping.includeChildExceptions === true
  })

  await mapExceptionSection.locator('[data-testid="add-map-exception"]').click()
  await page.locator('[data-testid="map-exception-error-code"]').fill('DEFAULT_ERROR')
  await page.locator('[data-testid="save-map-exception"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const mappings = (task.extensionElements?.values || []).filter(
      (value) => value.$type === 'flowable:MapException',
    )
    return (
      mappings.length === 2 &&
      mappings.some(
        (mapping) =>
          mapping.errorCode === 'DEFAULT_ERROR' &&
          !mapping.class &&
          mapping.includeChildExceptions === false &&
          !mapping.rootCause,
      )
    )
  })
  const defaultMapExceptionXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    /<flowable:mapException\b[^>]*\berrorCode="DEFAULT_ERROR"[^>]*(?:\/>|><\/flowable:mapException>)/.test(
      defaultMapExceptionXml,
    ),
    '默认异常映射未写入 XML',
  )

  mapExceptionRow = mapExceptionSection
    .locator('[data-testid="map-exception-row"]')
    .filter({ hasText: 'DEFAULT_ERROR' })
  await mapExceptionRow.getByRole('button', { name: '上移异常映射' }).click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || [])
      .filter((value) => value.$type === 'flowable:MapException')
      .map((value) => value.errorCode)
      .join(',') === 'DEFAULT_ERROR,ORDER_ERROR'
  })
  const orderedMapExceptionXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assert(
    orderedMapExceptionXml.indexOf('errorCode="DEFAULT_ERROR"') <
      orderedMapExceptionXml.indexOf('errorCode="ORDER_ERROR"'),
    '异常映射上移后 XML 顺序未更新',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || [])
      .filter((value) => value.$type === 'flowable:MapException')
      .map((value) => value.errorCode)
      .join(',') === 'ORDER_ERROR,DEFAULT_ERROR'
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || [])
      .filter((value) => value.$type === 'flowable:MapException')
      .map((value) => value.errorCode)
      .join(',') === 'DEFAULT_ERROR,ORDER_ERROR'
  })
  await mapExceptionRow.getByRole('button', { name: '删除异常映射' }).click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      (task.extensionElements?.values || []).filter(
        (value) => value.$type === 'flowable:MapException',
      ).length === 1
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      (task.extensionElements?.values || []).filter(
        (value) => value.$type === 'flowable:MapException',
      ).length === 2
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      (task.extensionElements?.values || []).filter(
        (value) => value.$type === 'flowable:MapException',
      ).length === 1
    )
  })

  const mapExceptionRoundTripXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const mapExceptionRoundTripWarnings = await page.evaluate(
    async (fixture) => (await window.bpmnModeler.importXML(fixture)).warnings.length,
    mapExceptionRoundTripXml,
  )
  assert(mapExceptionRoundTripWarnings === 0, '异常映射 XML 重新导入产生兼容警告')
  await page.evaluate(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
  })
  await mapExceptionSection.locator('.el-collapse-item__header').click()
  mapExceptionRow = mapExceptionSection.locator('[data-testid="map-exception-row"]')
  assert((await mapExceptionRow.count()) === 1, '异常映射 XML 往返后列表未恢复')
  assert((await mapExceptionRow.innerText()).includes('ORDER_ERROR'), '异常映射 XML 往返后错误码丢失')

  const mapExceptionRecoveryWarnings = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'map-exception-recovery.bpmn20.xml'))
        .warnings.length,
    rollbackBaseline.xml,
  )
  assert(mapExceptionRecoveryWarnings === 0, '异常映射用例后的基准恢复产生警告')
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const externalWorkerServiceTask = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const current = modeler.get('elementRegistry').get('UserTask_approve')
    const replacement = modeler.get('bpmnReplace').replaceElement(current, {
      type: 'bpmn:ServiceTask',
    })
    modeler.get('selection').select(replacement)
    return { id: replacement.id, type: replacement.type }
  })
  assert(
    externalWorkerServiceTask.id === 'UserTask_approve' &&
      externalWorkerServiceTask.type === 'bpmn:ServiceTask',
    '外部工作器测试未能创建 Service Task',
  )

  await page
    .locator('[data-testid="service-implementation-type"] .el-select__wrapper')
    .waitFor({ state: 'visible' })
  await page.locator('[data-testid="service-implementation-type"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: 'Flowable 内置类型' })
    .click()
  await page.locator('[data-testid="service-built-in-type"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^外部工作器$/ })
    .click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:type') === 'external-worker' && !task.get('flowable:topic')
  })

  const missingExternalWorkerTopicProblems = await page.evaluate(() =>
    window.flowableProcessModeler.validate(),
  )
  assert(
    missingExternalWorkerTopicProblems.some(
      (problem) =>
        problem.elementId === 'UserTask_approve' &&
        problem.level === 'error' &&
        problem.message === '外部工作任务未配置主题',
    ),
    '外部工作器缺少主题时未返回精确校验错误',
  )

  const externalWorkerTopic = page.locator('[data-testid="external-worker-topic"]')
  await externalWorkerTopic.fill('order-jobs')
  await externalWorkerTopic.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:topic') === 'order-jobs'
  })
  const configuredExternalWorkerProblems = await page.evaluate(() =>
    window.flowableProcessModeler.validate(),
  )
  assert(
    !configuredExternalWorkerProblems.some(
      (problem) =>
        problem.elementId === 'UserTask_approve' &&
        problem.message === '外部工作任务未配置主题',
    ),
    '外部工作器配置主题后仍被校验器报错',
  )
  const externalWorkerXmlState = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const serviceTask = [...xmlDocument.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/MODEL',
      'serviceTask',
    )].find((element) => element.getAttribute('id') === 'UserTask_approve')
    return {
      found: Boolean(serviceTask),
      type: serviceTask?.getAttributeNS('http://flowable.org/bpmn', 'type'),
      topic: serviceTask?.getAttributeNS('http://flowable.org/bpmn', 'topic'),
    }
  })
  assert(
    externalWorkerXmlState.found &&
      externalWorkerXmlState.type === 'external-worker' &&
      externalWorkerXmlState.topic === 'order-jobs',
    '外部工作器未同时序列化 flowable:type 和 flowable:topic',
  )

  const legacyExternalImport = await page.evaluate(async () => {
    const canonicalXml = await window.flowableProcessModeler.getXML()
    const legacyXml = canonicalXml.replace(
      'flowable:type="external-worker"',
      'flowable:type="external"',
    )
    const result = await window.flowableProcessModeler.importXML(
      legacyXml,
      'legacy-external-worker.bpmn20.xml',
    )
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('selection').select(task)
    return {
      warnings: result.warnings.length,
      type: task.businessObject.get('flowable:type'),
      topic: task.businessObject.get('flowable:topic'),
    }
  })
  assert(
    legacyExternalImport.warnings === 0 &&
      legacyExternalImport.type === 'external' &&
      legacyExternalImport.topic === 'order-jobs',
    '旧 external 类型导入后未保留类型和主题',
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  await externalWorkerTopic.waitFor({ state: 'visible' })
  assert(
    (await externalWorkerTopic.inputValue()) === 'order-jobs',
    '旧 external 类型导入后未回显主题',
  )

  const importedUnknownServiceType = await page.evaluate(async () => {
    const bridge = window.flowableProcessModeler
    const currentXml = await bridge.getXML()
    const unknownTypeXml = currentXml
      .replace('flowable:type="external"', 'flowable:type="invented-runtime-type"')
      .replace(/\sflowable:topic="[^"]*"/, '')
    const result = await bridge.importXML(
      unknownTypeXml,
      'unsupported-service-task-type.bpmn20.xml',
    )
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      type: task.businessObject.get('flowable:type'),
      problems: bridge.validate(),
    }
  })
  assert(
    importedUnknownServiceType.warnings.length === 0 &&
      importedUnknownServiceType.type === 'invented-runtime-type' &&
      importedUnknownServiceType.problems.some(
        (problem) =>
          problem.elementId === 'UserTask_approve' &&
          problem.level === 'error' &&
          problem.message ===
            '服务任务类型 invented-runtime-type 不是 Flowable 6.8.1 支持的 BPMN 类型',
      ),
    `导入未知服务类型后未返回精确本地错误：${JSON.stringify(importedUnknownServiceType)}`,
  )
  await page.locator('.canvas-loading').waitFor({ state: 'hidden' })
  const importedServiceTypeSelect = page.locator('[data-testid="service-built-in-type"]')
  await importedServiceTypeSelect.waitFor({ state: 'visible' })
  await page.waitForFunction(() =>
    document
      .querySelector('[data-testid="service-built-in-type"]')
      ?.textContent?.includes('导入了 Flowable 不支持的类型：invented-runtime-type'),
  )
  await importedServiceTypeSelect.locator('.el-select__wrapper').click()
  const unsupportedServiceTaskDropdown = page.locator('.el-select-dropdown:visible')
  await unsupportedServiceTaskDropdown.waitFor({ state: 'visible' })
  const unsupportedServiceTaskOptions = await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .allInnerTexts()
  assert(
    unsupportedServiceTaskOptions.includes(
      '导入了 Flowable 不支持的类型：invented-runtime-type',
    ),
    `未知导入类型没有以只保留状态显示：${JSON.stringify(unsupportedServiceTaskOptions)}`,
  )
  await page.keyboard.press('Escape')

  const externalWorkerRecoveryWarnings = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'external-worker-recovery.bpmn20.xml'))
        .warnings.length,
    rollbackBaseline.xml,
  )
  assert(externalWorkerRecoveryWarnings === 0, '外部工作器用例后的基准恢复产生警告')
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const sendEventServiceTask = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const current = modeler.get('elementRegistry').get('UserTask_approve')
    const replacement = modeler.get('bpmnReplace').replaceElement(current, {
      type: 'bpmn:ServiceTask',
    })
    modeler.get('selection').select(replacement)
    return { id: replacement.id, type: replacement.type }
  })
  assert(
    sendEventServiceTask.id === 'UserTask_approve' &&
      sendEventServiceTask.type === 'bpmn:ServiceTask',
    '发送事件测试未能创建 Service Task',
  )
  await page
    .locator('[data-testid="service-implementation-type"] .el-select__wrapper')
    .waitFor({ state: 'visible' })
  await page.locator('[data-testid="service-implementation-type"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: 'Flowable 内置类型' })
    .click()
  await page.locator('[data-testid="service-built-in-type"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^Event Registry 发送事件$/ })
    .click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return task.get('flowable:type') === 'send-event'
  })

  const missingSendEventProblems = await page.evaluate(() =>
    window.flowableProcessModeler.validate(),
  )
  for (const message of [
    '发送事件任务未配置事件类型',
    '发送事件任务未配置出站通道或系统通道',
  ]) {
    assert(
      missingSendEventProblems.some(
        (problem) =>
          problem.elementId === 'UserTask_approve' &&
          problem.level === 'error' &&
          problem.message === message,
      ),
      `发送事件缺失字段未返回精确校验错误：${message}`,
    )
  }

  const sendEventTypeInput = page.locator('[data-testid="send-event-type"]')
  const sendEventTriggerTypeInput = page.locator('[data-testid="send-event-trigger-type"]')
  const sendEventChannelInput = page.locator('[data-testid="send-event-channel-key"]')
  const sendEventSystemChannelSwitch = page.locator(
    '[data-testid="send-event-system-channel"]',
  )
  const sendEventSynchronouslySwitch = page.locator(
    '[data-testid="send-event-synchronously"]',
  )
  await sendEventTypeInput.fill('order-updated')
  await sendEventTypeInput.press('Tab')
  await sendEventTriggerTypeInput.fill('order-acknowledged')
  await sendEventTriggerTypeInput.press('Tab')
  await sendEventChannelInput.fill('orders-out')
  await sendEventChannelInput.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const extensions = task.extensionElements?.values || []
    const body = (type) => extensions.find((value) => value.$type === type)?.body
    return (
      body('flowable:EventType') === 'order-updated' &&
      body('flowable:TriggerEventType') === 'order-acknowledged' &&
      body('flowable:ChannelKey') === 'orders-out'
    )
  })
  const configuredSendEventProblems = await page.evaluate(() =>
    window.flowableProcessModeler.validate(),
  )
  assert(
    !configuredSendEventProblems.some(
      (problem) =>
        problem.elementId === 'UserTask_approve' &&
        [
          '发送事件任务未配置事件类型',
          '发送事件任务未配置出站通道或系统通道',
        ].includes(problem.message),
    ),
    '发送事件配置事件类型和通道后仍被校验器报缺失字段',
  )
  const channelKeyXmlBeforeSystemChannel = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    return [...xmlDocument.getElementsByTagNameNS('http://flowable.org/bpmn', 'channelKey')]
      .find((element) => element.parentElement?.parentElement?.getAttribute('id') === 'UserTask_approve')
      ?.textContent
  })
  assert(
    channelKeyXmlBeforeSystemChannel === 'orders-out',
    '发送事件出站通道未写回 flowable:channelKey',
  )

  await sendEventSystemChannelSwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SystemChannel',
    )
  })
  assert(await sendEventChannelInput.isDisabled(), '启用系统通道后出站通道输入框仍可编辑')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SystemChannel',
    )
  })
  assert(!(await sendEventChannelInput.isDisabled()), '撤销系统通道后出站通道输入框仍被禁用')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SystemChannel',
    )
  })

  await sendEventSynchronouslySwitch.click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SendSynchronously' && value.body === 'true',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SendSynchronously',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:SendSynchronously' && value.body === 'true',
    )
  })

  const sendEventAddInputButton = page.locator('[data-testid="add-input-mapping"]')
  const sendEventAddOutputButton = page.locator('[data-testid="add-output-mapping"]')
  await sendEventAddInputButton.click()
  let sendEventMappingDialog = page.locator('.el-dialog:visible')
  await sendEventMappingDialog.getByText('输入参数映射', { exact: true }).waitFor()
  await sendEventMappingDialog
    .locator('[data-testid="mapping-source-type"]')
    .getByText('表达式', { exact: true })
    .click()
  await sendEventMappingDialog.locator('[data-testid="mapping-source"]').fill('${order.id}')
  await sendEventMappingDialog.locator('[data-testid="mapping-target"]').fill('orderId')
  await sendEventMappingDialog.locator('[data-testid="mapping-transient"]').click()
  await sendEventMappingDialog.locator('[data-testid="save-mapping"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:EventInParameter' &&
        value.sourceExpression === '${order.id}' &&
        value.target === 'orderId' &&
        value.transient === true,
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:EventInParameter',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:EventInParameter' &&
        value.sourceExpression === '${order.id}' &&
        value.transient === true,
    )
  })

  await sendEventAddOutputButton.click()
  sendEventMappingDialog = page.locator('.el-dialog:visible')
  await sendEventMappingDialog.getByText('输出参数映射', { exact: true }).waitFor()
  await sendEventMappingDialog
    .locator('[data-testid="mapping-source-type"]')
    .getByText('变量', { exact: true })
    .click()
  await sendEventMappingDialog.locator('[data-testid="mapping-source"]').fill('ackId')
  await sendEventMappingDialog
    .locator('[data-testid="mapping-target"]')
    .fill('acknowledgementId')
  await sendEventMappingDialog.locator('[data-testid="mapping-transient"]').click()
  await sendEventMappingDialog.locator('[data-testid="save-mapping"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:EventOutParameter' &&
        value.source === 'ackId' &&
        value.target === 'acknowledgementId' &&
        value.transient === true,
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:EventOutParameter',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:EventOutParameter' &&
        value.source === 'ackId' &&
        value.transient === true,
    )
  })

  const sendEventXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const sendEventXmlState = await page.evaluate((xml) => {
    const flowableNamespace = 'http://flowable.org/bpmn'
    const bpmnNamespace = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const serviceTask = [...xmlDocument.getElementsByTagNameNS(bpmnNamespace, 'serviceTask')].find(
      (element) => element.getAttribute('id') === 'UserTask_approve',
    )
    const extension = (name) =>
      [...serviceTask.getElementsByTagNameNS(flowableNamespace, name)][0]
    const parameter = (name) => {
      const element = extension(name)
      return element
        ? {
            source: element.getAttribute('source') || null,
            sourceExpression: element.getAttribute('sourceExpression') || null,
            target: element.getAttribute('target') || null,
            transient: element.getAttribute('transient') || null,
          }
        : null
    }
    return {
      type: serviceTask?.getAttributeNS(flowableNamespace, 'type') || null,
      eventType: extension('eventType')?.textContent || null,
      triggerEventType: extension('triggerEventType')?.textContent || null,
      channelKey: extension('channelKey')?.textContent || null,
      systemChannel: Boolean(extension('systemChannel')),
      sendSynchronously: extension('sendSynchronously')?.textContent || null,
      eventIn: parameter('eventInParameter'),
      eventOut: parameter('eventOutParameter'),
    }
  }, sendEventXml)
  assert(
    JSON.stringify(sendEventXmlState) ===
      JSON.stringify({
        type: 'send-event',
        eventType: 'order-updated',
        triggerEventType: 'order-acknowledged',
        channelKey: 'orders-out',
        systemChannel: true,
        sendSynchronously: 'true',
        eventIn: {
          source: null,
          sourceExpression: '${order.id}',
          target: 'orderId',
          transient: 'true',
        },
        eventOut: {
          source: 'ackId',
          sourceExpression: null,
          target: 'acknowledgementId',
          transient: 'true',
        },
      }),
    `发送事件 XML 语义不完整：${JSON.stringify(sendEventXmlState)}`,
  )
  const sendEventRoundTrip = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'send-event-ui-roundtrip.bpmn20.xml',
    )
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
    const extensions = task.businessObject.extensionElements?.values || []
    const body = (type) => extensions.find((value) => value.$type === type)?.body || null
    const eventIn = extensions.find((value) => value.$type === 'flowable:EventInParameter')
    const eventOut = extensions.find((value) => value.$type === 'flowable:EventOutParameter')
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      type: task.businessObject.get('flowable:type'),
      eventType: body('flowable:EventType'),
      channelKey: body('flowable:ChannelKey'),
      systemChannel: extensions.some((value) => value.$type === 'flowable:SystemChannel'),
      sendSynchronously: body('flowable:SendSynchronously'),
      eventIn: {
        sourceExpression: eventIn?.sourceExpression,
        target: eventIn?.target,
        transient: eventIn?.transient,
      },
      eventOut: {
        source: eventOut?.source,
        target: eventOut?.target,
        transient: eventOut?.transient,
      },
    }
  }, sendEventXml)
  assert(
    sendEventRoundTrip.warnings.length === 0 &&
      sendEventRoundTrip.type === 'send-event' &&
      sendEventRoundTrip.eventType === 'order-updated' &&
      sendEventRoundTrip.channelKey === 'orders-out' &&
      sendEventRoundTrip.systemChannel &&
      sendEventRoundTrip.sendSynchronously === 'true' &&
      JSON.stringify(sendEventRoundTrip.eventIn) ===
        JSON.stringify({
          sourceExpression: '${order.id}',
          target: 'orderId',
          transient: true,
        }) &&
      JSON.stringify(sendEventRoundTrip.eventOut) ===
        JSON.stringify({
          source: 'ackId',
          target: 'acknowledgementId',
          transient: true,
        }),
    `发送事件 XML 往返后发生变化：${JSON.stringify(sendEventRoundTrip)}`,
  )

  const sendEventRecoveryWarnings = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'send-event-recovery.bpmn20.xml'))
        .warnings.length,
    rollbackBaseline.xml,
  )
  assert(sendEventRecoveryWarnings === 0, '发送事件用例后的基准恢复产生警告')
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const inheritVariablesCallActivity = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const current = modeler.get('elementRegistry').get('UserTask_approve')
    const replacement = modeler.get('bpmnReplace').replaceElement(current, {
      type: 'bpmn:CallActivity',
    })
    modeler.get('selection').select(replacement)
    return { id: replacement.id, type: replacement.type }
  })
  assert(
    inheritVariablesCallActivity.id === 'UserTask_approve' &&
      inheritVariablesCallActivity.type === 'bpmn:CallActivity',
    '继承变量测试未能创建 Call Activity',
  )

  const inheritVariablesSwitch = page.locator(
    '[data-testid="call-activity-inherit-variables"]',
  )
  await inheritVariablesSwitch.waitFor({ state: 'visible' })
  const inheritVariablesInput = inheritVariablesSwitch.locator('input[role="switch"]')
  assert(!(await inheritVariablesInput.isChecked()), 'Call Activity 的继承流程变量未默认关闭')

  const calledElementTypeControl = page.locator(
    '[data-testid="call-activity-called-element-type"]',
  )
  await calledElementTypeControl.waitFor({ state: 'visible' })
  const calledElementKeyOption = calledElementTypeControl.locator('label').filter({
    hasText: /^流程定义 Key$/,
  })
  const calledElementIdOption = calledElementTypeControl.locator('label').filter({
    hasText: /^流程定义 ID$/,
  })
  const calledElementKeyInput = calledElementKeyOption.locator('input[type="radio"]')
  const calledElementIdInput = calledElementIdOption.locator('input[type="radio"]')
  assert(await calledElementKeyInput.isChecked(), '新建 Call Activity 未默认使用流程定义 Key')
  assert(!(await calledElementIdInput.isChecked()), '新建 Call Activity 错误选中了流程定义 ID')

  const calledElementInput = page.locator('[data-testid="call-activity-called-element"]')
  const sameDeploymentSwitch = page.locator('[data-testid="call-activity-same-deployment"]')
  const localOutSwitch = page.locator('[data-testid="call-activity-local-out"]')
  const completeAsyncSwitch = page.locator('[data-testid="call-activity-complete-async"]')
  const idVariableNameInput = page.locator('[data-testid="call-activity-id-variable-name"]')
  const sameDeploymentInput = sameDeploymentSwitch.locator('input[role="switch"]')
  const localOutInput = localOutSwitch.locator('input[role="switch"]')
  const completeAsyncInput = completeAsyncSwitch.locator('input[role="switch"]')
  assert(!(await sameDeploymentInput.isChecked()), 'Call Activity 的同部署查找未默认关闭')
  assert(!(await localOutInput.isChecked()), 'Call Activity 的局部输出未默认关闭')
  assert(!(await completeAsyncInput.isChecked()), 'Call Activity 的异步完成未默认关闭')
  assert((await idVariableNameInput.inputValue()) === '', 'Call Activity 的实例 ID 变量未默认为空')

  const defaultCallActivityXmlState = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const callActivity = [...xmlDocument.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/MODEL',
      'callActivity',
    )].find((element) => element.getAttribute('id') === 'UserTask_approve')
    const hasFlowableAttribute = (name) =>
      Boolean(callActivity?.hasAttributeNS('http://flowable.org/bpmn', name))
    return {
      found: Boolean(callActivity),
      hasCalledElementType: hasFlowableAttribute('calledElementType'),
      hasSameDeployment: hasFlowableAttribute('sameDeployment'),
      hasLocalOut: hasFlowableAttribute('useLocalScopeForOutParameters'),
      hasCompleteAsync: hasFlowableAttribute('completeAsync'),
      hasIdVariableName: hasFlowableAttribute('idVariableName'),
      hasInheritVariables: hasFlowableAttribute('inheritVariables'),
    }
  })
  assert(
    defaultCallActivityXmlState.found &&
      !defaultCallActivityXmlState.hasCalledElementType &&
      !defaultCallActivityXmlState.hasSameDeployment &&
      !defaultCallActivityXmlState.hasLocalOut &&
      !defaultCallActivityXmlState.hasCompleteAsync &&
      !defaultCallActivityXmlState.hasIdVariableName &&
      !defaultCallActivityXmlState.hasInheritVariables,
    `新建 Call Activity 序列化了默认属性：${JSON.stringify(defaultCallActivityXmlState)}`,
  )

  await calledElementInput.fill('Process_called_by_smoke')
  await calledElementInput.press('Tab')
  await calledElementIdOption.click()
  await sameDeploymentSwitch.click()
  await localOutSwitch.click()
  await completeAsyncSwitch.click()
  await idVariableNameInput.fill('calledProcessInstanceId')
  await idVariableNameInput.press('Tab')
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      activity.calledElement === 'Process_called_by_smoke' &&
      activity.get('flowable:calledElementType') === 'id' &&
      activity.get('flowable:sameDeployment') === true &&
      activity.get('flowable:useLocalScopeForOutParameters') === true &&
      activity.get('flowable:completeAsync') === true &&
      activity.get('flowable:idVariableName') === 'calledProcessInstanceId'
    )
  })
  assert(await calledElementIdInput.isChecked(), 'Call Activity 未保持流程定义 ID 选择')
  assert(await sameDeploymentInput.isChecked(), 'Call Activity 未保持同部署查找开启')
  assert(await localOutInput.isChecked(), 'Call Activity 未保持局部输出开启')
  assert(await completeAsyncInput.isChecked(), 'Call Activity 未保持异步完成开启')

  const enabledCallActivityState = await page.evaluate(async () => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const callActivity = [...xmlDocument.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/MODEL',
      'callActivity',
    )].find((element) => element.getAttribute('id') === 'UserTask_approve')
    const flowableAttribute = (name) =>
      callActivity?.getAttributeNS('http://flowable.org/bpmn', name) ?? null
    return {
      model: {
        calledElement: activity.calledElement,
        calledElementType: activity.get('flowable:calledElementType'),
        sameDeployment: activity.get('flowable:sameDeployment'),
        useLocalScopeForOutParameters: activity.get('flowable:useLocalScopeForOutParameters'),
        completeAsync: activity.get('flowable:completeAsync'),
        idVariableName: activity.get('flowable:idVariableName'),
      },
      xml: {
        calledElement: callActivity?.getAttribute('calledElement') ?? null,
        calledElementType: flowableAttribute('calledElementType'),
        sameDeployment: flowableAttribute('sameDeployment'),
        useLocalScopeForOutParameters: flowableAttribute('useLocalScopeForOutParameters'),
        completeAsync: flowableAttribute('completeAsync'),
        idVariableName: flowableAttribute('idVariableName'),
      },
    }
  })
  const expectedCallActivityModel = {
    calledElement: 'Process_called_by_smoke',
    calledElementType: 'id',
    sameDeployment: true,
    useLocalScopeForOutParameters: true,
    completeAsync: true,
    idVariableName: 'calledProcessInstanceId',
  }
  const expectedCallActivityXml = {
    calledElement: 'Process_called_by_smoke',
    calledElementType: 'id',
    sameDeployment: 'true',
    useLocalScopeForOutParameters: 'true',
    completeAsync: 'true',
    idVariableName: 'calledProcessInstanceId',
  }
  assert(
    JSON.stringify(enabledCallActivityState.model) === JSON.stringify(expectedCallActivityModel),
    `Call Activity 开启后的模型属性不正确：${JSON.stringify(enabledCallActivityState.model)}`,
  )
  assert(
    JSON.stringify(enabledCallActivityState.xml) === JSON.stringify(expectedCallActivityXml),
    `Call Activity 开启后的 XML 属性不正确：${JSON.stringify(enabledCallActivityState.xml)}`,
  )

  await calledElementKeyOption.click()
  await sameDeploymentSwitch.click()
  await localOutSwitch.click()
  await completeAsyncSwitch.click()
  await idVariableNameInput.fill('')
  await idVariableNameInput.press('Tab')
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (
      !activity.get('flowable:calledElementType') &&
      activity.get('flowable:sameDeployment') !== true &&
      activity.get('flowable:useLocalScopeForOutParameters') !== true &&
      activity.get('flowable:completeAsync') !== true &&
      !activity.get('flowable:idVariableName')
    )
  })
  assert(await calledElementKeyInput.isChecked(), 'Call Activity 清理后未恢复流程定义 Key')
  const clearedCallActivityState = await page.evaluate(async () => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const callActivity = [...xmlDocument.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/MODEL',
      'callActivity',
    )].find((element) => element.getAttribute('id') === 'UserTask_approve')
    const hasFlowableAttribute = (name) =>
      Boolean(callActivity?.hasAttributeNS('http://flowable.org/bpmn', name))
    return {
      model: {
        calledElementType: activity.get('flowable:calledElementType') ?? null,
        sameDeployment: Boolean(activity.get('flowable:sameDeployment')),
        useLocalScopeForOutParameters: Boolean(
          activity.get('flowable:useLocalScopeForOutParameters'),
        ),
        completeAsync: Boolean(activity.get('flowable:completeAsync')),
        idVariableName: activity.get('flowable:idVariableName') ?? null,
      },
      xml: {
        calledElementType: hasFlowableAttribute('calledElementType'),
        sameDeployment: hasFlowableAttribute('sameDeployment'),
        useLocalScopeForOutParameters: hasFlowableAttribute('useLocalScopeForOutParameters'),
        completeAsync: hasFlowableAttribute('completeAsync'),
        idVariableName: hasFlowableAttribute('idVariableName'),
      },
    }
  })
  assert(
    JSON.stringify(clearedCallActivityState.model) ===
      JSON.stringify({
        calledElementType: null,
        sameDeployment: false,
        useLocalScopeForOutParameters: false,
        completeAsync: false,
        idVariableName: null,
      }),
    `Call Activity 关闭后的模型属性未清理：${JSON.stringify(clearedCallActivityState.model)}`,
  )
  assert(
    !Object.values(clearedCallActivityState.xml).some(Boolean),
    `Call Activity 关闭后的 XML 属性未删除：${JSON.stringify(clearedCallActivityState.xml)}`,
  )

  const invalidCalledElementTypeProblems = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const activity = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('modeling').updateProperties(activity, {
      'flowable:calledElementType': 'version',
    })
    return window.flowableProcessModeler.validate()
  })
  assert(
    invalidCalledElementTypeProblems.some(
      (problem) =>
        problem.elementId === 'UserTask_approve' &&
        problem.level === 'error' &&
        problem.message === '调用活动的被调用流程类型必须为 key 或 id',
    ),
    '非法 Call Activity 被调用流程类型未返回精确校验错误',
  )
  const restoredCalledElementTypeState = await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const activity = modeler.get('elementRegistry').get('UserTask_approve')
    modeler.get('modeling').updateProperties(activity, {
      'flowable:calledElementType': undefined,
    })
    return {
      calledElementType: activity.businessObject.get('flowable:calledElementType') ?? null,
      problems: window.flowableProcessModeler.validate(),
    }
  })
  assert(
    restoredCalledElementTypeState.calledElementType === null &&
      !restoredCalledElementTypeState.problems.some(
        (problem) => problem.message === '调用活动的被调用流程类型必须为 key 或 id',
      ),
    'Call Activity 被调用流程类型恢复默认 key 后仍被判定为非法',
  )

  const addInputMappingButton = page.locator('[data-testid="add-input-mapping"]')
  const addOutputMappingButton = page.locator('[data-testid="add-output-mapping"]')
  await addInputMappingButton.click()
  let mappingDialog = page.locator('.el-dialog:visible')
  await mappingDialog.getByText('输入参数映射', { exact: true }).waitFor()
  let mappingSourceType = mappingDialog.locator('[data-testid="mapping-source-type"]')
  assert(
    (await mappingSourceType.getByText('变量集合', { exact: true }).count()) === 0 &&
      (await mappingDialog.getByText('使用局部变量', { exact: true }).count()) === 0 &&
      (await mappingDialog.locator('[data-testid="mapping-transient"]').count()) === 0,
    '新建 Call Activity 映射弹窗仍暴露变量集合、局部变量或 transient 入口',
  )
  await mappingSourceType.getByText('变量', { exact: true }).click()
  await mappingDialog.locator('[data-testid="mapping-source"]').fill('requestPayload')
  await mappingDialog.locator('[data-testid="mapping-target"]').fill('calledRequest')
  await mappingDialog.locator('[data-testid="save-mapping"]').click()
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (activity.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:In' &&
        value.source === 'requestPayload' &&
        value.target === 'calledRequest' &&
        value.transient !== true,
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(activity.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (activity.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:In' &&
        value.source === 'requestPayload' &&
        value.transient !== true,
    )
  })

  await addOutputMappingButton.click()
  mappingDialog = page.locator('.el-dialog:visible')
  await mappingDialog.getByText('输出参数映射', { exact: true }).waitFor()
  mappingSourceType = mappingDialog.locator('[data-testid="mapping-source-type"]')
  await mappingSourceType.getByText('变量', { exact: true }).click()
  await mappingDialog.locator('[data-testid="mapping-source"]').fill('calledResult')
  await mappingDialog.locator('[data-testid="mapping-target"]').fill('responsePayload')
  assert(
    (await mappingDialog.locator('[data-testid="mapping-transient"]').count()) === 0,
    '新建 Call Activity 输出映射仍暴露 transient 开关',
  )
  await mappingDialog.locator('[data-testid="save-mapping"]').click()
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (activity.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:Out' &&
        value.source === 'calledResult' &&
        value.target === 'responsePayload' &&
        value.transient !== true,
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(activity.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:Out' && value.source === 'calledResult',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (activity.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:Out' &&
        value.source === 'calledResult' &&
        value.transient !== true,
    )
  })

  let inputMappingRow = page.locator('[data-testid="input-mapping-row"]').filter({
    hasText: 'requestPayload',
  })
  let outputMappingRow = page.locator('[data-testid="output-mapping-row"]').filter({
    hasText: 'calledResult',
  })
  assert(!(await inputMappingRow.innerText()).includes('transient'), '新建输入映射错误显示 transient 状态')
  assert(!(await outputMappingRow.innerText()).includes('transient'), '新建输出映射错误显示 transient 状态')

  const transientMappingsState = await page.evaluate(async () => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const extensions = activity.extensionElements?.values || []
    const input = extensions.find(
      (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
    )
    const output = extensions.find(
      (value) => value.$type === 'flowable:Out' && value.source === 'calledResult',
    )
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const inputXml = [...xmlDocument.getElementsByTagNameNS('http://flowable.org/bpmn', 'in')].find(
      (element) => element.getAttribute('source') === 'requestPayload',
    )
    const outputXml = [
      ...xmlDocument.getElementsByTagNameNS('http://flowable.org/bpmn', 'out'),
    ].find((element) => element.getAttribute('source') === 'calledResult')
    const mappingState = (mapping) =>
      mapping
        ? {
            source: mapping.source,
            target: mapping.target,
            transient: mapping.transient === true,
            local: mapping.local === true,
          }
        : null
    const xmlState = (element) =>
      element
        ? {
            source: element.getAttribute('source'),
            target: element.getAttribute('target'),
            transient: element.getAttribute('transient'),
            hasLocal: element.hasAttribute('local'),
          }
        : null
    return {
      input: mappingState(input),
      output: mappingState(output),
      inputXml: xmlState(inputXml),
      outputXml: xmlState(outputXml),
    }
  })
  assert(
    JSON.stringify(transientMappingsState) ===
      JSON.stringify({
        input: {
          source: 'requestPayload',
          target: 'calledRequest',
          transient: false,
          local: false,
        },
        output: {
          source: 'calledResult',
          target: 'responsePayload',
          transient: false,
          local: false,
        },
        inputXml: {
          source: 'requestPayload',
          target: 'calledRequest',
          transient: null,
          hasLocal: false,
        },
        outputXml: {
          source: 'calledResult',
          target: 'responsePayload',
          transient: null,
          hasLocal: false,
        },
      }),
    `新建 Call Activity 映射错误序列化了 transient：${JSON.stringify(transientMappingsState)}`,
  )

  const importedTransientCallActivity = await page.evaluate(async () => {
    const bridge = window.flowableProcessModeler
    const xml = await bridge.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const flowableNamespace = 'http://flowable.org/bpmn'
    const input = [...xmlDocument.getElementsByTagNameNS(flowableNamespace, 'in')].find(
      (element) => element.getAttribute('source') === 'requestPayload',
    )
    const output = [...xmlDocument.getElementsByTagNameNS(flowableNamespace, 'out')].find(
      (element) => element.getAttribute('source') === 'calledResult',
    )
    input.setAttribute('transient', 'true')
    output.setAttribute('transient', 'true')
    const result = await bridge.importXML(
      new XMLSerializer().serializeToString(xmlDocument),
      'call-activity-imported-transient.bpmn20.xml',
    )
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(activity)
    const extensions = activity.businessObject.extensionElements?.values || []
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      inputTransient: extensions.find(
        (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
      )?.transient,
      outputTransient: extensions.find(
        (value) => value.$type === 'flowable:Out' && value.source === 'calledResult',
      )?.transient,
    }
  })
  assert(
    importedTransientCallActivity.warnings.length === 0 &&
      importedTransientCallActivity.inputTransient === true &&
      importedTransientCallActivity.outputTransient === true,
    `Call Activity 导入 transient 映射失败：${JSON.stringify(importedTransientCallActivity)}`,
  )
  inputMappingRow = page.locator('[data-testid="input-mapping-row"]').filter({
    hasText: 'requestPayload',
  })
  outputMappingRow = page.locator('[data-testid="output-mapping-row"]').filter({
    hasText: 'calledResult',
  })
  assert(
    (await inputMappingRow.innerText()).includes('已导入 transient（按普通变量处理）') &&
      (await outputMappingRow.innerText()).includes('已导入 transient（按普通变量处理）'),
    'Call Activity 导入 transient 后列表未显示执行语义提示',
  )

  await inputMappingRow.getByRole('button', { name: '编辑输入参数' }).click()
  mappingDialog = page.locator('.el-dialog:visible')
  await mappingDialog.getByText('输入参数映射', { exact: true }).waitFor()
  assert(
    (await mappingDialog.locator('[data-testid="mapping-transient"]').count()) === 0,
    '编辑 Call Activity 导入映射时仍暴露 transient 开关',
  )
  const importedTransientWarning = mappingDialog.locator('.el-alert').filter({
    hasText: '按普通变量处理 transient',
  })
  await importedTransientWarning.waitFor()
  assert(
    (await importedTransientWarning.innerText()).includes('本次编辑会原样保留该属性'),
    'Call Activity 导入 transient 提示未说明编辑保留语义',
  )
  await mappingDialog.locator('[data-testid="mapping-target"]').fill('calledRequestImported')
  await mappingDialog.locator('[data-testid="save-mapping"]').click()
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const input = (activity.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
    )
    return input?.target === 'calledRequestImported' && input.transient === true
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const input = (activity.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
    )
    return input?.target === 'calledRequest' && input.transient === true
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const input = (activity.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:In' && value.source === 'requestPayload',
    )
    return input?.target === 'calledRequestImported' && input.transient === true
  })
  const preservedImportedTransientXml = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const input = [...xmlDocument.getElementsByTagNameNS('http://flowable.org/bpmn', 'in')].find(
      (element) => element.getAttribute('source') === 'requestPayload',
    )
    const output = [...xmlDocument.getElementsByTagNameNS('http://flowable.org/bpmn', 'out')].find(
      (element) => element.getAttribute('source') === 'calledResult',
    )
    return {
      inputTarget: input?.getAttribute('target') || null,
      inputTransient: input?.getAttribute('transient') || null,
      outputTransient: output?.getAttribute('transient') || null,
    }
  })
  assert(
    JSON.stringify(preservedImportedTransientXml) ===
      JSON.stringify({
        inputTarget: 'calledRequestImported',
        inputTransient: 'true',
        outputTransient: 'true',
      }),
    `编辑 Call Activity 映射时未原样保留导入 transient：${JSON.stringify(preservedImportedTransientXml)}`,
  )

  await outputMappingRow.getByRole('button', { name: '删除输出参数' }).click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(activity.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:Out' && value.source === 'calledResult',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (activity.extensionElements?.values || []).some(
      (value) =>
        value.$type === 'flowable:Out' &&
        value.source === 'calledResult' &&
        value.transient === true,
    )
  })
  outputMappingRow = page.locator('[data-testid="output-mapping-row"]').filter({
    hasText: 'calledResult',
  })
  assert(
    (await outputMappingRow.innerText()).includes('已导入 transient（按普通变量处理）'),
    '撤销删除后导入 transient 输出映射未恢复',
  )

  await inheritVariablesSwitch.click()
  await page.waitForFunction(() => {
    const activity = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return activity.get('flowable:inheritVariables') === true
  })
  assert(await inheritVariablesInput.isChecked(), 'Call Activity 的继承流程变量开关未保持开启')
  const enabledInheritVariablesXmlState = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const callActivity = [...xmlDocument.getElementsByTagNameNS(
      'http://www.omg.org/spec/BPMN/20100524/MODEL',
      'callActivity',
    )].find((element) => element.getAttribute('id') === 'UserTask_approve')
    return {
      found: Boolean(callActivity),
      inheritVariables: callActivity?.getAttributeNS(
        'http://flowable.org/bpmn',
        'inheritVariables',
      ),
    }
  })
  assert(
    enabledInheritVariablesXmlState.found &&
      enabledInheritVariablesXmlState.inheritVariables === 'true',
    'Call Activity 开启继承变量后未序列化 flowable:inheritVariables="true"',
  )

  const callActivityRecoveryWarnings = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'call-activity-recovery.bpmn20.xml'))
        .warnings.length,
    rollbackBaseline.xml,
  )
  assert(callActivityRecoveryWarnings === 0, 'Call Activity 用例后的基准恢复产生警告')
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  await page.evaluate(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
  })
  const addCustomResourceButton = page.locator('[data-testid="add-custom-resource"]')
  await addCustomResourceButton.waitFor({ state: 'visible' })
  await addCustomResourceButton.click()
  let customResourceDialog = page.locator('.el-dialog:visible')
  await customResourceDialog.getByText('新增自定义身份链接', { exact: true }).waitFor()
  await customResourceDialog
    .locator('[data-testid="custom-resource-name"]')
    .fill('businessAdministrator')
  await customResourceDialog
    .locator('[data-testid="custom-resource-expression"]')
    .fill('user(${manager}), group(management)')
  await customResourceDialog.locator('[data-testid="save-custom-resource"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    const expression = resource?.resourceAssignmentExpression?.get('bpmn:formalExpression')
    return (
      resource?.name === 'businessAdministrator' &&
      expression?.body === 'user(${manager}), group(management)'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:CustomResource',
    )
  })
  assert(
    (await page.locator('[data-testid="custom-resource-row"]').count()) === 0,
    '撤销新增自定义身份链接后列表仍有数据',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return (task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:CustomResource' && value.name === 'businessAdministrator',
    )
  })

  const customResourceWithUnknownAttributesXml = await page.evaluate(async () => {
    const xml = await window.flowableProcessModeler.getXML()
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const bpmnNamespace = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
    const flowableNamespace = 'http://flowable.org/bpmn'
    const vendorNamespace = 'urn:smoke:identity'
    xmlDocument.documentElement.setAttributeNS(
      'http://www.w3.org/2000/xmlns/',
      'xmlns:vendor',
      vendorNamespace,
    )
    const resource = [...xmlDocument.getElementsByTagNameNS(flowableNamespace, 'customResource')]
      .find((element) => element.getAttribute('name') === 'businessAdministrator')
    const assignment = resource.getElementsByTagNameNS(
      bpmnNamespace,
      'resourceAssignmentExpression',
    )[0]
    const expression = assignment.getElementsByTagNameNS(bpmnNamespace, 'formalExpression')[0]
    resource.setAttributeNS(vendorNamespace, 'vendor:resourceHint', 'keep-resource')
    assignment.setAttributeNS(vendorNamespace, 'vendor:assignmentHint', 'keep-assignment')
    expression.setAttributeNS(vendorNamespace, 'vendor:expressionHint', 'keep-expression')
    return new XMLSerializer().serializeToString(xmlDocument)
  })
  const customResourceUnknownImport = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'custom-resource-unknown-attributes.bpmn20.xml',
    )
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
    const resource = (task.businessObject.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    const assignment = resource?.resourceAssignmentExpression
    const expression = assignment?.get('bpmn:formalExpression')
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      name: resource?.name,
      expression: expression?.body,
      resourceHint: resource?.get('vendor:resourceHint'),
      assignmentHint: assignment?.get('vendor:assignmentHint'),
      expressionHint: expression?.get('vendor:expressionHint'),
    }
  }, customResourceWithUnknownAttributesXml)
  assert(
    customResourceUnknownImport.warnings.length === 0 &&
      JSON.stringify(customResourceUnknownImport) ===
        JSON.stringify({
          warnings: [],
          name: 'businessAdministrator',
          expression: 'user(${manager}), group(management)',
          resourceHint: 'keep-resource',
          assignmentHint: 'keep-assignment',
          expressionHint: 'keep-expression',
        }),
    `自定义身份链接三层未知属性导入失败：${JSON.stringify(customResourceUnknownImport)}`,
  )

  let customResourceRow = page.locator('[data-testid="custom-resource-row"]').filter({
    hasText: 'businessAdministrator',
  })
  await customResourceRow.waitFor({ state: 'visible' })
  assert(
    (await customResourceRow.innerText()).includes('user(${manager}), group(management)'),
    '导入自定义身份链接后列表未回显表达式',
  )
  await customResourceRow.getByRole('button', { name: '编辑自定义身份链接' }).click()
  customResourceDialog = page.locator('.el-dialog:visible')
  await customResourceDialog.getByText('编辑自定义身份链接', { exact: true }).waitFor()
  assert(
    (await customResourceDialog.locator('[data-testid="custom-resource-name"]').inputValue()) ===
      'businessAdministrator' &&
      (await customResourceDialog
        .locator('[data-testid="custom-resource-expression"]')
        .inputValue()) === 'user(${manager}), group(management)',
    '编辑自定义身份链接时未回显 name 或 expression',
  )
  await customResourceDialog
    .locator('[data-testid="custom-resource-name"]')
    .fill('processOwner')
  await customResourceDialog
    .locator('[data-testid="custom-resource-expression"]')
    .fill('user(${processOwner})')
  await customResourceDialog.locator('[data-testid="save-custom-resource"]').click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    const assignment = resource?.resourceAssignmentExpression
    const expression = assignment?.get('bpmn:formalExpression')
    return (
      resource?.name === 'processOwner' &&
      expression?.body === 'user(${processOwner})' &&
      resource.get('vendor:resourceHint') === 'keep-resource' &&
      assignment.get('vendor:assignmentHint') === 'keep-assignment' &&
      expression.get('vendor:expressionHint') === 'keep-expression'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    return (
      resource?.name === 'businessAdministrator' &&
      resource.resourceAssignmentExpression?.get('bpmn:formalExpression')?.body ===
        'user(${manager}), group(management)' &&
      resource.get('vendor:resourceHint') === 'keep-resource'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    const assignment = resource?.resourceAssignmentExpression
    const expression = assignment?.get('bpmn:formalExpression')
    return (
      resource?.name === 'processOwner' &&
      expression?.body === 'user(${processOwner})' &&
      resource.get('vendor:resourceHint') === 'keep-resource' &&
      assignment.get('vendor:assignmentHint') === 'keep-assignment' &&
      expression.get('vendor:expressionHint') === 'keep-expression'
    )
  })

  customResourceRow = page.locator('[data-testid="custom-resource-row"]').filter({
    hasText: 'processOwner',
  })
  await customResourceRow.waitFor({ state: 'visible' })
  assert(
    (await customResourceRow.innerText()).includes('user(${processOwner})'),
    '编辑自定义身份链接后列表未同步 name 和 expression',
  )
  await customResourceRow.getByRole('button', { name: '删除自定义身份链接' }).click()
  await page.locator('.el-message-box:visible').getByRole('button', { name: '确定' }).click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:CustomResource',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    return resource?.name === 'processOwner' && resource.get('vendor:resourceHint') === 'keep-resource'
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    return !(task.extensionElements?.values || []).some(
      (value) => value.$type === 'flowable:CustomResource',
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve').businessObject
    const resource = (task.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    return resource?.name === 'processOwner' && resource.get('vendor:resourceHint') === 'keep-resource'
  })

  const customResourceXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const customResourceXmlState = await page.evaluate((xml) => {
    const xmlDocument = new DOMParser().parseFromString(xml, 'application/xml')
    const bpmnNamespace = 'http://www.omg.org/spec/BPMN/20100524/MODEL'
    const flowableNamespace = 'http://flowable.org/bpmn'
    const vendorNamespace = 'urn:smoke:identity'
    const resource = [...xmlDocument.getElementsByTagNameNS(flowableNamespace, 'customResource')]
      .find((element) =>
        ['processOwner', null].includes(
          element.getAttribute('name') || element.getAttributeNS(flowableNamespace, 'name'),
        ),
      )
    const assignment = resource?.getElementsByTagNameNS(
      bpmnNamespace,
      'resourceAssignmentExpression',
    )[0]
    const expression = assignment?.getElementsByTagNameNS(bpmnNamespace, 'formalExpression')[0]
    return {
      name: resource?.getAttribute('name') || resource?.getAttributeNS(flowableNamespace, 'name'),
      expression: expression?.textContent || null,
      resourceHint: resource?.getAttributeNS(vendorNamespace, 'resourceHint') || null,
      assignmentHint: assignment?.getAttributeNS(vendorNamespace, 'assignmentHint') || null,
      expressionHint: expression?.getAttributeNS(vendorNamespace, 'expressionHint') || null,
    }
  }, customResourceXml)
  assert(
    JSON.stringify(customResourceXmlState) ===
      JSON.stringify({
        name: 'processOwner',
        expression: 'user(${processOwner})',
        resourceHint: 'keep-resource',
        assignmentHint: 'keep-assignment',
        expressionHint: 'keep-expression',
      }),
    `自定义身份链接 XML 未保留编辑结果或三层未知属性：${JSON.stringify(customResourceXmlState)}`,
  )
  const customResourceRoundTrip = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'custom-resource-ui-roundtrip.bpmn20.xml',
    )
    const task = window.bpmnModeler.get('elementRegistry').get('UserTask_approve')
    window.bpmnModeler.get('selection').select(task)
    const resource = (task.businessObject.extensionElements?.values || []).find(
      (value) => value.$type === 'flowable:CustomResource',
    )
    const assignment = resource?.resourceAssignmentExpression
    const expression = assignment?.get('bpmn:formalExpression')
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      name: resource?.name,
      expression: expression?.body,
      resourceHint: resource?.get('vendor:resourceHint'),
      assignmentHint: assignment?.get('vendor:assignmentHint'),
      expressionHint: expression?.get('vendor:expressionHint'),
    }
  }, customResourceXml)
  assert(
    customResourceRoundTrip.warnings.length === 0 &&
      JSON.stringify(customResourceRoundTrip) ===
        JSON.stringify({
          warnings: [],
          name: 'processOwner',
          expression: 'user(${processOwner})',
          resourceHint: 'keep-resource',
          assignmentHint: 'keep-assignment',
          expressionHint: 'keep-expression',
        }),
    `自定义身份链接 XML 往返后发生变化：${JSON.stringify(customResourceRoundTrip)}`,
  )
  customResourceRow = page.locator('[data-testid="custom-resource-row"]').filter({
    hasText: 'processOwner',
  })
  assert(
    (await customResourceRow.innerText()).includes('user(${processOwner})'),
    '自定义身份链接 XML 往返后 UI 未恢复',
  )

  const customResourceRecoveryWarnings = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'custom-resource-recovery.bpmn20.xml'))
        .warnings.length,
    rollbackBaseline.xml,
  )
  assert(customResourceRecoveryWarnings === 0, '自定义身份链接用例后的基准恢复产生警告')
  await waitForExtensionProperty(page, 'UserTask_approve', editedExtensionProperty)

  const legacyNamespaceFixtures = [
    {
      name: 'flowable-prefix',
      xml: customExtensionXml.replace(
        'http://flowable.org/bpmn',
        'http://activiti.org/bpmn',
      ).replace(
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"',
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://activiti.org/bpmn https://example.test/activiti-bpmn.xsd http://www.omg.org/spec/BPMN/20100524/MODEL https://example.test/BPMN20.xsd"',
      ),
    },
    {
      name: 'activiti-prefix',
      xml: customExtensionXml
        .replace(
          'xmlns:flowable="http://flowable.org/bpmn"',
          'xmlns:activiti="http://activiti.org/bpmn"',
        )
        .replaceAll('flowable:', 'activiti:'),
    },
  ]
  for (const fixture of legacyNamespaceFixtures) {
    const state = await page.evaluate(async ({ xml, name }) => {
      const result = await window.flowableProcessModeler.importXML(
        xml,
        `legacy-${name}.bpmn20.xml`,
      )
      const task = window.bpmnModeler
        .get('elementRegistry')
        .get('UserTask_custom').businessObject
      return {
        warnings: result.warnings.map((warning) => warning.message || String(warning)),
        extensionTypes: (task.extensionElements?.values || []).map(
          (value) => value.$type,
        ),
        xml: await window.flowableProcessModeler.getXML(),
      }
    }, fixture)
    assert(
      JSON.stringify(state.warnings) ===
        JSON.stringify([
          '已将旧 Activiti 扩展命名空间规范化为 http://flowable.org/bpmn',
        ]),
      `${fixture.name} 旧命名空间没有返回精确兼容提示：${JSON.stringify(state.warnings)}`,
    )
    assert(
      state.extensionTypes.includes('flowable:Properties') &&
        state.extensionTypes.includes('flowable:FormData'),
      `${fixture.name} 旧命名空间扩展没有恢复为 typed Flowable 元素`,
    )
    assert(
      !state.xml.includes('http://activiti.org/bpmn') &&
        state.xml.includes('xmlns:flowable="http://flowable.org/bpmn"') &&
        state.xml.includes('<flowable:properties>'),
      `${fixture.name} 旧命名空间导出后没有规范化为 Flowable URI`,
    )
    if (fixture.name === 'flowable-prefix') {
      assert(
        state.xml.includes(
          'xsi:schemaLocation="http://flowable.org/bpmn https://example.test/activiti-bpmn.xsd http://www.omg.org/spec/BPMN/20100524/MODEL https://example.test/BPMN20.xsd"',
        ),
        '旧 Activiti schemaLocation 命名空间配对没有规范化',
      )
    }
  }

  const concurrentNamespaceImports = await page.evaluate(
    async ({ legacyXml, canonicalXml }) => {
      const bridge = window.flowableProcessModeler
      const legacyImport = bridge.importXML(
        legacyXml,
        'concurrent-legacy.bpmn20.xml',
      )
      const canonicalImport = bridge.importXML(
        canonicalXml,
        'concurrent-canonical.bpmn20.xml',
      )
      const [legacyResult, canonicalResult] = await Promise.all([
        legacyImport,
        canonicalImport,
      ])
      return {
        legacyWarnings: legacyResult.warnings.map(
          (warning) => warning.message || String(warning),
        ),
        canonicalWarnings: canonicalResult.warnings.map(
          (warning) => warning.message || String(warning),
        ),
        finalProcessExists: Boolean(
          window.bpmnModeler.get('elementRegistry').get('Process_concurrent_final'),
        ),
        xml: await bridge.getXML(),
      }
    },
    {
      legacyXml: legacyNamespaceFixtures[1].xml,
      canonicalXml: customExtensionXml.replaceAll(
        'Process_custom_extensions',
        'Process_concurrent_final',
      ),
    },
  )
  assert(
    JSON.stringify(concurrentNamespaceImports.legacyWarnings) ===
      JSON.stringify([
        '已将旧 Activiti 扩展命名空间规范化为 http://flowable.org/bpmn',
      ]) &&
      concurrentNamespaceImports.canonicalWarnings.length === 0 &&
      concurrentNamespaceImports.finalProcessExists &&
      concurrentNamespaceImports.xml.includes('id="Process_concurrent_final"') &&
      !concurrentNamespaceImports.xml.includes('http://activiti.org/bpmn'),
    '并发导入没有隔离兼容提示或保持最后一次请求结果',
  )

  const literalLegacyUriFixture = customExtensionXml
    .replace(
      'targetNamespace="http://flowable.org/processdef"',
      'targetNamespace="http://activiti.org/bpmn"',
    )
    .replace(
      /(<bpmn:process id="Process_custom_extensions"[^>]*>)/,
      '$1\n    <bpmn:documentation>http://activiti.org/bpmn</bpmn:documentation>',
    )
  const literalLegacyUriState = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'literal-legacy-uri.bpmn20.xml',
    )
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      xml: await window.flowableProcessModeler.getXML(),
    }
  }, literalLegacyUriFixture)
  assert(
    literalLegacyUriState.warnings.length === 0 &&
      literalLegacyUriState.xml.includes(
        'targetNamespace="http://activiti.org/bpmn"',
      ) &&
      literalLegacyUriState.xml.includes(
        '<bpmn:documentation>http://activiti.org/bpmn</bpmn:documentation>',
      ),
    'targetNamespace 或正文中的旧 URI 被错误迁移',
  )

  const malformedLegacyRollback = await page.evaluate(async () => {
    const bridge = window.flowableProcessModeler
    const before = await bridge.getXML()
    const malformed = before
      .replace(
        'xmlns:flowable="http://flowable.org/bpmn"',
        'xmlns:activiti="http://activiti.org/bpmn"',
      )
      .replaceAll('flowable:', 'activiti:')
      .replace('</bpmn:definitions>', '<bpmn:broken></bpmn:definitions>')
    let rejected = false
    try {
      await bridge.importXML(malformed, 'malformed-legacy.bpmn20.xml')
    } catch {
      rejected = true
    }
    const after = await bridge.getXML()
    return {
      rejected,
      unchanged: before === after,
      processExists: Boolean(
        window.bpmnModeler.get('elementRegistry').get('Process_custom_extensions'),
      ),
    }
  })
  assert(
    malformedLegacyRollback.rejected &&
      malformedLegacyRollback.unchanged &&
      malformedLegacyRollback.processExists,
    '旧命名空间 malformed XML 没有拒绝并完整回滚当前流程',
  )

  const p0ModdleRoundTrip = await page.evaluate(async (fixture) => {
    const moddle = window.bpmnModeler.get('moddle')

    const readState = (definitions) => {
      const process = definitions.rootElements.find(
        (element) => element.id === 'Process_p0_extensions',
      )
      const byId = (id) => process.flowElements.find((element) => element.id === id)
      const start = byId('Start_registry')
      const multiTask = byId('Task_multi_instance')
      const boundary = byId('Boundary_variable')
      const sendTask = byId('Task_send_event')
      const httpTask = byId('Task_http')
      const loop = multiTask.loopCharacteristics
      const aggregation = loop.extensionElements.values.find(
        (value) => value.$type === 'flowable:VariableAggregation',
      )
      const requestHandler = httpTask.extensionElements.values.find(
        (value) => value.$type === 'flowable:HttpRequestHandler',
      )
      const listener = process.extensionElements.values.find(
        (value) => value.$type === 'flowable:EventListener',
      )
      return {
        types: [
          ...process.extensionElements.values,
          ...start.extensionElements.values,
          ...loop.extensionElements.values,
          ...boundary.extensionElements.values,
          ...sendTask.extensionElements.values,
          ...httpTask.extensionElements.values,
        ].map((value) => value.$type),
        aggregationVariableTypes: aggregation
          .get('bpmn:variable')
          .map((variable) => variable.$type),
        aggregationSourceExpression: aggregation.get('bpmn:variable')[1].sourceExpression,
        noWaitStatesAsyncLeave: loop.get('flowable:noWaitStatesAsyncLeave'),
        listenerDelegateExpression: listener.delegateExpression,
        scriptLanguage: requestHandler.script.language,
        scriptResultVariable: requestHandler.script.resultVariable,
      }
    }

    const first = await moddle.fromXML(fixture)
    const firstState = readState(first.rootElement)
    const xml = (await moddle.toXML(first.rootElement, { format: true })).xml
    const second = await moddle.fromXML(xml)
    return {
      firstWarnings: first.warnings.map((warning) => warning.message),
      secondWarnings: second.warnings.map((warning) => warning.message),
      firstState,
      secondState: readState(second.rootElement),
      xml,
    }
  }, p0ExtensionXml)
  const requiredP0Types = [
    'flowable:EventListener',
    'flowable:HistoryLevel',
    'flowable:EventType',
    'flowable:EventCorrelationParameter',
    'flowable:EventInParameter',
    'flowable:EventOutParameter',
    'flowable:VariableListenerEventDefinition',
    'flowable:Collection',
    'flowable:VariableAggregation',
    'flowable:HttpRequestHandler',
    'flowable:HttpResponseHandler',
  ]
  assert(
    p0ModdleRoundTrip.firstWarnings.length === 0 &&
      p0ModdleRoundTrip.secondWarnings.length === 0,
    `P0 扩展 moddle 往返产生警告：${JSON.stringify({
      first: p0ModdleRoundTrip.firstWarnings,
      second: p0ModdleRoundTrip.secondWarnings,
    })}`,
  )
  for (const type of requiredP0Types) {
    assert(
      p0ModdleRoundTrip.firstState.types.includes(type) &&
        p0ModdleRoundTrip.secondState.types.includes(type),
      `${type} 没有在浏览器 moddle 往返中保持 typed`,
    )
  }
  assert(
    JSON.stringify(p0ModdleRoundTrip.firstState) ===
      JSON.stringify(p0ModdleRoundTrip.secondState) &&
      p0ModdleRoundTrip.firstState.aggregationVariableTypes.every(
        (type) => type === 'flowable:Variable',
      ) &&
      p0ModdleRoundTrip.firstState.aggregationSourceExpression === '${score * 2}' &&
      p0ModdleRoundTrip.firstState.noWaitStatesAsyncLeave === true &&
      p0ModdleRoundTrip.firstState.listenerDelegateExpression === '${auditListener}' &&
      p0ModdleRoundTrip.firstState.scriptLanguage === 'groovy' &&
      p0ModdleRoundTrip.firstState.scriptResultVariable === 'requestPayload',
    'P0 扩展的嵌套属性在浏览器 moddle 往返后发生变化',
  )
  assert(
    p0ModdleRoundTrip.xml.includes('<bpmn:variable source="approved" target="value" />') &&
      !p0ModdleRoundTrip.xml.includes('<flowable:variable '),
    '多实例聚合 variable 子元素的 BPMN 命名空间不正确',
  )
  mkdirSync('artifacts', { recursive: true })
  writeFileSync(
    'artifacts/flowable-p0-extensions-roundtrip.bpmn20.xml',
    p0ModdleRoundTrip.xml,
    'utf8',
  )

  const preservationImportWarnings = await page.evaluate(
    async (fixture) =>
      (
        await window.flowableProcessModeler.importXML(
          fixture,
          'multi-instance-timer-preservation.bpmn20.xml',
        )
      ).warnings.map((warning) => warning.message || String(warning)),
    multiInstanceTimerPreservationXml,
  )
  assert(
    preservationImportWarnings.length === 0,
    `原位编辑 fixture 导入产生警告：${JSON.stringify(preservationImportWarnings)}`,
  )
  await page.waitForFunction(
    () =>
      window.bpmnModeler.get('canvas').getRootElement().businessObject.id ===
        'Process_edit_preservation' &&
      Boolean(window.bpmnModeler.get('elementRegistry').get('Boundary_timer_cycle')),
  )

  await page.evaluate(() => window.bpmnModeler.get('selection').select(null))
  const eagerExecutionSwitch = page.locator('[data-testid="process-eager-execution"]')
  const eagerExecutionInput = eagerExecutionSwitch.locator('input[role="switch"]')
  await eagerExecutionSwitch.waitFor({ state: 'visible' })
  assert(
    !(await eagerExecutionInput.isChecked()),
    'isEagerExecutionFetching=false 未正确回显',
  )
  await eagerExecutionSwitch.click()
  await page.waitForFunction(() => {
    const process = window.bpmnModeler.get('canvas').getRootElement().businessObject
    return process.get('flowable:isEagerExecutionFetching') === true
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const process = window.bpmnModeler.get('canvas').getRootElement().businessObject
    return process.get('flowable:isEagerExecutionFetching') === false
  })
  assert(!(await eagerExecutionInput.isChecked()), 'eager 撤销后未恢复原值')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const process = window.bpmnModeler.get('canvas').getRootElement().businessObject
    return process.get('flowable:isEagerExecutionFetching') === true
  })

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('Task_multi_handler')
    modeler.get('selection').select(task)
    const loop = task.businessObject.loopCharacteristics
    const collection = loop.extensionElements.values.find(
      (value) => value.$type === 'flowable:Collection',
    )
    const aggregation = loop.extensionElements.values.find(
      (value) => value.$type === 'flowable:VariableAggregation',
    )
    window.__handlerMultiInstanceProbe = {
      loop,
      extensionElements: loop.extensionElements,
      collection,
      aggregation,
      aggregationVariable: aggregation.get('bpmn:variable')[0],
      completionCondition: loop.completionCondition,
    }
  })
  const multiInstanceSection = page.locator('.el-collapse-item').filter({
    has: page.locator('.el-collapse-item__header', { hasText: '多实例' }),
  })
  if (!(await multiInstanceSection.evaluate((element) => element.classList.contains('is-active')))) {
    await multiInstanceSection.locator('.el-collapse-item__header').click()
  }
  const multiInstanceType = page.locator('[data-testid="multi-instance-type"]')
  const multiInstanceCollection = page.locator('[data-testid="multi-instance-collection"]')
  const completionConditionInput = multiInstanceSection
    .locator('.el-form-item')
    .filter({ hasText: '完成条件' })
    .locator('textarea')
  await multiInstanceCollection.waitFor({ state: 'visible' })
  assert(
    (await multiInstanceCollection.inputValue()) === '${items}',
    'nested Collection expression 未回显到多实例集合输入框',
  )
  assert(
    (await completionConditionInput.inputValue()) === '${nrOfCompletedInstances > 0}',
    '多实例完成条件未回显',
  )

  await multiInstanceType.locator('.el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^串行多实例$/ })
    .click()
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${items}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: false,
    collection: '${items}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${items}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })

  await multiInstanceCollection.fill('${updatedItems}')
  await multiInstanceCollection.press('Tab')
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${updatedItems}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${items}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${updatedItems}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })

  await completionConditionInput.fill('${nrOfCompletedInstances >= 3}')
  await completionConditionInput.press('Tab')
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${updatedItems}',
    completionCondition: '${nrOfCompletedInstances >= 3}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${updatedItems}',
    completionCondition: '${nrOfCompletedInstances > 0}',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForHandlerMultiInstanceState(page, {
    isSequential: true,
    collection: '${updatedItems}',
    completionCondition: '${nrOfCompletedInstances >= 3}',
  })

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('Task_multi_cardinality')
    modeler.get('selection').select(task)
    const loop = task.businessObject.loopCharacteristics
    window.__cardinalityMultiInstanceProbe = {
      loop,
      extensionElements: loop.extensionElements,
      aggregation: loop.extensionElements.values.find(
        (value) => value.$type === 'flowable:VariableAggregation',
      ),
      loopCardinality: loop.loopCardinality,
      completionCondition: loop.completionCondition,
    }
  })
  if (!(await multiInstanceSection.evaluate((element) => element.classList.contains('is-active')))) {
    await multiInstanceSection.locator('.el-collapse-item__header').click()
  }
  const loopCardinalityInput = multiInstanceSection
    .locator('.el-form-item')
    .filter({ hasText: '循环基数' })
    .locator('input')
  await loopCardinalityInput.waitFor({ state: 'visible' })
  assert(
    (await loopCardinalityInput.inputValue()) === '${itemCount}',
    '多实例循环基数未回显',
  )
  await loopCardinalityInput.fill('${updatedItemCount}')
  await loopCardinalityInput.press('Tab')
  await waitForCardinalityMultiInstanceState(page, '${updatedItemCount}')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForCardinalityMultiInstanceState(page, '${itemCount}')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForCardinalityMultiInstanceState(page, '${updatedItemCount}')

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('Task_multi_string_handler')
    modeler.get('selection').select(task)
    const loop = task.businessObject.loopCharacteristics
    window.__stringHandlerMultiInstanceProbe = {
      loop,
      extensionElements: loop.extensionElements,
      collection: loop.extensionElements.values.find(
        (value) => value.$type === 'flowable:Collection',
      ),
    }
  })
  if (!(await multiInstanceSection.evaluate((element) => element.classList.contains('is-active')))) {
    await multiInstanceSection.locator('.el-collapse-item__header').click()
  }
  await multiInstanceCollection.waitFor({ state: 'visible' })
  assert(
    (await multiInstanceCollection.inputValue()) === 'seed-handler-input',
    'nested Collection string 未回显到多实例集合输入框',
  )
  await multiInstanceCollection.fill('updated-handler-input')
  await multiInstanceCollection.press('Tab')
  await waitForStringHandlerMultiInstanceState(page, 'updated-handler-input')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForStringHandlerMultiInstanceState(page, 'seed-handler-input')
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForStringHandlerMultiInstanceState(page, 'updated-handler-input')

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const boundary = modeler.get('elementRegistry').get('Boundary_timer_cycle')
    modeler.get('selection').select(boundary)
    const definition = boundary.businessObject.eventDefinitions[0]
    window.__timerPreservationProbe = {
      definition,
      timeCycle: definition.timeCycle,
    }
  })
  const timerExpressionInput = page.locator('[data-testid="timer-expression"]')
  const timerEndDateInput = page.locator('[data-testid="timer-end-date"]')
  const timerBusinessCalendarInput = page.locator(
    '[data-testid="timer-business-calendar"]',
  )
  await timerExpressionInput.waitFor({ state: 'visible' })
  assert(
    (await timerExpressionInput.inputValue()) === 'R3/PT10M' &&
      (await timerEndDateInput.inputValue()) === '${cycleEnd}' &&
      (await timerBusinessCalendarInput.inputValue()) === 'workCalendar',
    'timeCycle 正文、结束时间或业务日历未回显',
  )

  await timerExpressionInput.fill('R5/PT15M')
  await timerExpressionInput.press('Tab')
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${cycleEnd}',
    businessCalendar: 'workCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForTimerPreservationState(page, {
    body: 'R3/PT10M',
    endDate: '${cycleEnd}',
    businessCalendar: 'workCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${cycleEnd}',
    businessCalendar: 'workCalendar',
  })

  await timerEndDateInput.fill('${updatedCycleEnd}')
  await timerEndDateInput.press('Tab')
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${updatedCycleEnd}',
    businessCalendar: 'workCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${cycleEnd}',
    businessCalendar: 'workCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${updatedCycleEnd}',
    businessCalendar: 'workCalendar',
  })

  await timerBusinessCalendarInput.fill('holidayCalendar')
  await timerBusinessCalendarInput.press('Tab')
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${updatedCycleEnd}',
    businessCalendar: 'holidayCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${updatedCycleEnd}',
    businessCalendar: 'workCalendar',
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await waitForTimerPreservationState(page, {
    body: 'R5/PT15M',
    endDate: '${updatedCycleEnd}',
    businessCalendar: 'holidayCalendar',
  })

  await page.evaluate(() => {
    const modeler = window.bpmnModeler
    const task = modeler.get('elementRegistry').get('Task_expression_preservation')
    const listeners = task.businessObject.extensionElements.values.filter(
      (value) => value.$type === 'flowable:ExecutionListener',
    )
    window.__serviceListenerProbe = {
      task: task.businessObject,
      scriptListener: listeners.find((listener) => listener.type === 'script'),
      transactionListener: listeners.find(
        (listener) => listener.delegateExpression === '${transactionListener}',
      ),
    }
    window.__serviceListenerProbe.originalScript =
      window.__serviceListenerProbe.scriptListener.script
    modeler.get('selection').select(task)
  })

  const serviceImplementationType = page.locator(
    '[data-testid="service-implementation-type"]',
  )
  const serviceResultVariable = page.locator('[data-testid="service-result-variable"]')
  const serviceResultLocalScope = page.locator('[data-testid="service-result-local-scope"]')
  const serviceResultTransient = page.locator('[data-testid="service-result-transient"]')
  await serviceResultVariable.waitFor({ state: 'visible' })
  assert(
    (await serviceResultVariable.inputValue()) === 'legacyCalculationResult' &&
      (await serviceResultLocalScope.locator('input[role="switch"]').isChecked()) &&
      (await serviceResultTransient.locator('input[role="switch"]').isChecked()),
    'legacy ServiceTask 结果变量配置未回显',
  )

  await serviceResultVariable.fill('calculationResult')
  await serviceResultVariable.press('Tab')
  await page.waitForFunction(() => {
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation').businessObject
    return (
      task.get('flowable:resultVariableName') === 'calculationResult' &&
      task.get('flowable:resultVariable') === undefined &&
      task.get('flowable:useLocalScopeForResultVariable') === true &&
      task.get('flowable:storeResultVariableAsTransient') === true
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation').businessObject
    return (
      task.get('flowable:resultVariableName') === undefined &&
      task.get('flowable:resultVariable') === 'legacyCalculationResult'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:resultVariableName') === 'calculationResult',
  )

  await serviceResultLocalScope.click()
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:useLocalScopeForResultVariable') !== true,
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:useLocalScopeForResultVariable') === true,
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:useLocalScopeForResultVariable') !== true,
  )
  await serviceResultLocalScope.click()
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:useLocalScopeForResultVariable') === true,
  )

  await serviceResultTransient.click()
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:storeResultVariableAsTransient') !== true,
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:storeResultVariableAsTransient') === true,
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:storeResultVariableAsTransient') !== true,
  )
  await serviceResultTransient.click()
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:storeResultVariableAsTransient') === true,
  )

  await serviceImplementationType.locator('.el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^Java 类$/ })
    .click()
  await page.waitForFunction(() => {
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation').businessObject
    return (
      task.get('flowable:class') === '${calculationService.calculate(execution)}' &&
      task.get('flowable:expression') === undefined &&
      task.get('flowable:resultVariableName') === undefined &&
      task.get('flowable:useLocalScopeForResultVariable') !== true &&
      task.get('flowable:storeResultVariableAsTransient') !== true
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const task = window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation').businessObject
    return (
      task.get('flowable:class') === undefined &&
      task.get('flowable:expression') === '${calculationService.calculate(execution)}' &&
      task.get('flowable:resultVariableName') === 'calculationResult' &&
      task.get('flowable:useLocalScopeForResultVariable') === true &&
      task.get('flowable:storeResultVariableAsTransient') === true
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:class') !== undefined,
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() =>
    window.bpmnModeler
      .get('elementRegistry')
      .get('Task_expression_preservation')
      .businessObject.get('flowable:expression') ===
      '${calculationService.calculate(execution)}',
  )

  const listenersSection = page.locator('.el-collapse-item').filter({
    has: page.locator('.el-collapse-item__header', { hasText: '监听器' }),
  })
  const listenersHeader = listenersSection.locator('.el-collapse-item__header')
  if ((await listenersHeader.getAttribute('aria-expanded')) !== 'true') {
    await listenersHeader.click()
  }
  let scriptListenerRow = listenersSection
    .locator('[data-testid="execution-listener-row"]')
    .filter({ hasText: '脚本：groovy' })
  await scriptListenerRow.getByRole('button', { name: '编辑执行监听器' }).click()
  assert(
    (await page.locator('[data-testid="listener-script-language"]').inputValue()) ===
      'groovy' &&
      (await page
        .locator('[data-testid="listener-script-result-variable"]')
        .inputValue()) === 'listenerResult' &&
      (await page.locator('[data-testid="listener-script-body"]').inputValue()) ===
        "return 'original'",
    '脚本监听器未完整回显',
  )
  await page.locator('[data-testid="listener-script-language"]').fill('javascript')
  await page
    .locator('[data-testid="listener-script-result-variable"]')
    .fill('updatedListenerResult')
  await page.locator('[data-testid="listener-script-body"]').fill("return 'updated'")
  await page.locator('[data-testid="save-listener"]').click()
  await page.waitForFunction(() => {
    const probe = window.__serviceListenerProbe
    const listener = probe.task.extensionElements.values.find(
      (value) => value.type === 'script',
    )
    return (
      listener === probe.scriptListener &&
      listener.script !== probe.originalScript &&
      listener.script.language === 'javascript' &&
      listener.script.resultVariable === 'updatedListenerResult' &&
      listener.script.value === "return 'updated'" &&
      listener.class === undefined &&
      listener.expression === undefined &&
      listener.delegateExpression === undefined &&
      listener.onTransaction === undefined &&
      (listener.fields || []).length === 0
    )
  })
  await page.evaluate(() => {
    const probe = window.__serviceListenerProbe
    probe.updatedScript = probe.scriptListener.script
    window.bpmnModeler.get('commandStack').undo()
  })
  await page.waitForFunction(() => {
    const probe = window.__serviceListenerProbe
    return (
      probe.scriptListener.script === probe.originalScript &&
      probe.scriptListener.script.language === 'groovy'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const probe = window.__serviceListenerProbe
    return (
      probe.scriptListener.script === probe.updatedScript &&
      probe.scriptListener.script.language === 'javascript'
    )
  })

  const transactionListenerRow = listenersSection
    .locator('[data-testid="execution-listener-row"]')
    .filter({ hasText: '代理表达式' })
  await transactionListenerRow
    .getByRole('button', { name: '编辑执行监听器' })
    .click()
  await page.locator('[data-testid="listener-on-transaction"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^回滚后 rolled-back$/ })
    .click()
  await page.locator('[data-testid="listener-resolver-type"] .el-select__wrapper').click()
  await page
    .locator('.el-select-dropdown:visible .el-select-dropdown__item')
    .filter({ hasText: /^Java 类$/ })
    .click()
  await page
    .locator('[data-testid="listener-resolver-implementation"]')
    .fill('com.example.ListenerPropertiesResolver')
  await page.locator('[data-testid="save-listener"]').click()
  await page.waitForFunction(() => {
    const probe = window.__serviceListenerProbe
    const listener = probe.transactionListener
    return (
      listener.onTransaction === 'rolled-back' &&
      listener.customPropertiesResolverClass ===
        'com.example.ListenerPropertiesResolver' &&
      listener.customPropertiesResolverExpression === undefined &&
      listener.customPropertiesResolverDelegateExpression === undefined &&
      (listener.fields || []).length === 0
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const listener = window.__serviceListenerProbe.transactionListener
    return (
      listener.onTransaction === 'committed' &&
      listener.customPropertiesResolverClass === undefined &&
      listener.customPropertiesResolverDelegateExpression ===
        '${listenerPropertiesResolver}'
    )
  })
  await page.evaluate(() => window.bpmnModeler.get('commandStack').redo())
  await page.waitForFunction(() => {
    const listener = window.__serviceListenerProbe.transactionListener
    return (
      listener.onTransaction === 'rolled-back' &&
      listener.customPropertiesResolverClass ===
        'com.example.ListenerPropertiesResolver'
    )
  })

  const preservationXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const handlerLoopAttributes = preservationXml.match(
    /<bpmn:userTask id="Task_multi_handler"[\s\S]*?<bpmn:multiInstanceLoopCharacteristics\b([^>]*)>/,
  )?.[1]
  assert(handlerLoopAttributes, '处理器多实例未写回 XML')
  assert(
    !/\bflowable:collection\s*=/.test(handlerLoopAttributes),
    'nested Collection 编辑后错误地产生了简单 flowable:collection 属性',
  )
  const stringHandlerTaskXml = preservationXml.match(
    /<bpmn:userTask id="Task_multi_string_handler"[\s\S]*?<\/bpmn:userTask>/,
  )?.[0]
  const stringHandlerLoopAttributes = stringHandlerTaskXml?.match(
    /<bpmn:multiInstanceLoopCharacteristics\b([^>]*)>/,
  )?.[1]
  assert(
    stringHandlerTaskXml &&
      stringHandlerLoopAttributes &&
      !/\bflowable:collection\s*=/.test(stringHandlerLoopAttributes) &&
      stringHandlerTaskXml.includes(
        '<flowable:collection class="com.example.StringCollectionHandler">',
      ) &&
      stringHandlerTaskXml.includes(
        '<flowable:string>updated-handler-input</flowable:string>',
      ) &&
      !stringHandlerTaskXml.includes('<flowable:expression>'),
    'nested Collection string 编辑后发生表示转换或属性丢失',
  )
  assert(
    handlerLoopAttributes.includes('flowable:noWaitStatesAsyncLeave="true"') &&
      preservationXml.includes('<flowable:collection delegateExpression="${collectionHandler}">') &&
      preservationXml.includes('<flowable:expression>${updatedItems}</flowable:expression>') &&
      preservationXml.includes('<flowable:variableAggregation target="reviews"') &&
      preservationXml.includes('flowable:businessCalendarName="holidayCalendar"') &&
      preservationXml.includes(
        '<bpmn:timeCycle flowable:endDate="${updatedCycleEnd}">R5/PT15M</bpmn:timeCycle>',
      ),
    '多实例或定时器原位编辑后的 XML 语义不完整',
  )
  assert(
    preservationXml.includes('flowable:isEagerExecutionFetching="true"') &&
      preservationXml.includes('flowable:resultVariableName="calculationResult"') &&
      !preservationXml.includes('flowable:resultVariable="legacyCalculationResult"') &&
      preservationXml.includes('flowable:useLocalScopeForResultVariable="true"') &&
      preservationXml.includes('flowable:storeResultVariableAsTransient="true"') &&
      preservationXml.includes(
        '<flowable:script language="javascript" resultVariable="updatedListenerResult">return \'updated\'</flowable:script>',
      ) &&
      preservationXml.includes('onTransaction="rolled-back"') &&
      preservationXml.includes(
        'customPropertiesResolverClass="com.example.ListenerPropertiesResolver"',
      ) &&
      !preservationXml.includes('customPropertiesResolverDelegateExpression='),
    '流程、ServiceTask 或监听器 P1 编辑后的 XML 语义不完整',
  )

  const preservationRoundTrip = await page.evaluate(async (fixture) => {
    const result = await window.flowableProcessModeler.importXML(
      fixture,
      'multi-instance-timer-preservation-roundtrip.bpmn20.xml',
    )
    const registry = window.bpmnModeler.get('elementRegistry')
    const handlerLoop = registry.get('Task_multi_handler').businessObject.loopCharacteristics
    const collection = handlerLoop.extensionElements.values.find(
      (value) => value.$type === 'flowable:Collection',
    )
    const aggregation = handlerLoop.extensionElements.values.find(
      (value) => value.$type === 'flowable:VariableAggregation',
    )
    const cardinalityLoop = registry.get('Task_multi_cardinality').businessObject.loopCharacteristics
    const stringHandlerLoop = registry.get(
      'Task_multi_string_handler',
    ).businessObject.loopCharacteristics
    const stringCollection = stringHandlerLoop.extensionElements.values.find(
      (value) => value.$type === 'flowable:Collection',
    )
    const timer = registry.get('Boundary_timer_cycle').businessObject.eventDefinitions[0]
    const process = window.bpmnModeler.get('canvas').getRootElement().businessObject
    const serviceTask = registry.get('Task_expression_preservation').businessObject
    const serviceListeners = serviceTask.extensionElements.values.filter(
      (value) => value.$type === 'flowable:ExecutionListener',
    )
    const scriptListener = serviceListeners.find((listener) => listener.type === 'script')
    const transactionListener = serviceListeners.find(
      (listener) => listener.delegateExpression === '${transactionListener}',
    )
    return {
      warnings: result.warnings.map((warning) => warning.message || String(warning)),
      eagerExecution: process.get('flowable:isEagerExecutionFetching'),
      handler: {
        sequential: handlerLoop.isSequential,
        noWait: handlerLoop.get('flowable:noWaitStatesAsyncLeave'),
        simpleCollection: handlerLoop.get('flowable:collection'),
        collectionExpression: collection.expression,
        collectionDelegateExpression: collection.delegateExpression,
        aggregationTarget: aggregation.target,
        completionCondition: handlerLoop.completionCondition.body,
      },
      cardinality: cardinalityLoop.loopCardinality.body,
      stringHandler: {
        noWait: stringHandlerLoop.get('flowable:noWaitStatesAsyncLeave'),
        simpleCollection: stringHandlerLoop.get('flowable:collection'),
        className: stringCollection.class,
        expression: stringCollection.expression,
        string: stringCollection.string,
      },
      timer: {
        body: timer.timeCycle.body,
        endDate: timer.timeCycle.get('flowable:endDate'),
        businessCalendar: timer.get('flowable:businessCalendarName'),
      },
      service: {
        expression: serviceTask.get('flowable:expression'),
        resultVariableName: serviceTask.get('flowable:resultVariableName'),
        hasLegacyResultVariable:
          serviceTask.get('flowable:resultVariable') !== undefined,
        local: serviceTask.get('flowable:useLocalScopeForResultVariable'),
        transient: serviceTask.get('flowable:storeResultVariableAsTransient'),
      },
      scriptListener: {
        event: scriptListener.event,
        type: scriptListener.type,
        language: scriptListener.script.language,
        resultVariable: scriptListener.script.resultVariable,
        body: scriptListener.script.value,
        fieldCount: (scriptListener.fields || []).length,
      },
      transactionListener: {
        event: transactionListener.event,
        implementation: transactionListener.delegateExpression,
        onTransaction: transactionListener.onTransaction,
        resolverClass: transactionListener.customPropertiesResolverClass,
        hasResolverExpression:
          transactionListener.customPropertiesResolverExpression !== undefined,
        hasResolverDelegate:
          transactionListener.customPropertiesResolverDelegateExpression !== undefined,
      },
    }
  }, preservationXml)
  assert(
    preservationRoundTrip.warnings.length === 0 &&
      preservationRoundTrip.eagerExecution === true &&
      JSON.stringify(preservationRoundTrip.handler) ===
        JSON.stringify({
          sequential: true,
          noWait: true,
          collectionExpression: '${updatedItems}',
          collectionDelegateExpression: '${collectionHandler}',
          aggregationTarget: 'reviews',
          completionCondition: '${nrOfCompletedInstances >= 3}',
      }) &&
      preservationRoundTrip.cardinality === '${updatedItemCount}' &&
      JSON.stringify(preservationRoundTrip.stringHandler) ===
        JSON.stringify({
          noWait: true,
          className: 'com.example.StringCollectionHandler',
          string: 'updated-handler-input',
        }) &&
      JSON.stringify(preservationRoundTrip.timer) ===
        JSON.stringify({
          body: 'R5/PT15M',
          endDate: '${updatedCycleEnd}',
          businessCalendar: 'holidayCalendar',
        }) &&
      JSON.stringify(preservationRoundTrip.service) ===
        JSON.stringify({
          expression: '${calculationService.calculate(execution)}',
          resultVariableName: 'calculationResult',
          hasLegacyResultVariable: false,
          local: true,
          transient: true,
        }) &&
      JSON.stringify(preservationRoundTrip.scriptListener) ===
        JSON.stringify({
          event: 'start',
          type: 'script',
          language: 'javascript',
          resultVariable: 'updatedListenerResult',
          body: "return 'updated'",
          fieldCount: 0,
        }) &&
      JSON.stringify(preservationRoundTrip.transactionListener) ===
        JSON.stringify({
          event: 'end',
          implementation: '${transactionListener}',
          onTransaction: 'rolled-back',
          resolverClass: 'com.example.ListenerPropertiesResolver',
          hasResolverExpression: false,
          hasResolverDelegate: false,
        }),
    `P1 原位编辑往返后发生变化：${JSON.stringify(preservationRoundTrip)}`,
  )

  const customImportWarningCount = await page.evaluate(
    async (fixture) =>
      (await window.flowableProcessModeler.importXML(fixture, 'custom-extensions.bpmn20.xml')).warnings.length,
    customExtensionXml,
  )
  assert(customImportWarningCount === 0, '自定义 Flowable 扩展导入产生兼容警告')

  const firstStructuredSemantics = await readCustomStructuredSemantics(page)
  assertStructuredCustomSemantics(firstStructuredSemantics, '第一次导入后')
  const customValidationProblems = await page.evaluate(() => window.flowableProcessModeler.validate())
  for (const elementId of ['MessageCatch_custom', 'SignalCatch_custom', 'ErrorBoundary_custom']) {
    assert(
      !customValidationProblems.some(
        (problem) => problem.elementId === elementId && problem.level === 'error',
      ),
      `${elementId} 的合法 Flowable 事件配置被校验器误报`,
    )
  }
  assert(
    customValidationProblems.some(
      (problem) =>
        problem.elementId === 'UserTask_custom' &&
        problem.level === 'warning' &&
        problem.message === 'Flowable 仅在服务任务和调用活动中执行异常映射',
    ),
    '非 Service Task/Call Activity 上的异常映射没有给出执行语义提示',
  )

  const customExtensions = await page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    const start = registry.get('StartEvent_custom').businessObject
    return {
      rootDefinitions: window.bpmnModeler
        .getDefinitions()
        .rootElements.filter((value) => ['bpmn:Message', 'bpmn:Signal', 'bpmn:Error'].includes(value.$type))
        .map((value) => ({
          type: value.$type,
          id: value.id,
          name: value.name,
          errorCode: value.errorCode,
          scope: value.get?.('flowable:scope'),
          errorMessage: value.get?.('flowable:errorMessage'),
        })),
      messageRef: start.eventDefinitions?.[0]?.messageRef?.id,
    }
  })

  assert(customExtensions.messageRef === 'Message_custom', '消息事件未保留全局消息引用')
  assert(
    customExtensions.rootDefinitions.some(
      (item) => item.type === 'bpmn:Signal' && item.id === 'Signal_custom' && item.scope === 'global',
    ),
    '全局 Signal 或 flowable:scope 往返失败',
  )
  assert(
    customExtensions.rootDefinitions.some(
      (item) =>
        item.type === 'bpmn:Error' &&
        item.id === 'Error_custom' &&
        item.errorCode === 'BUSINESS_ERROR' &&
        item.errorMessage === '业务处理失败',
    ),
    '全局 Error 扩展属性往返失败',
  )

  const hiddenTaskRendered = await page.evaluate(() =>
    Boolean(window.bpmnModeler.get('elementRegistry').get('ReceiveTask_hidden')),
  )
  assert(!hiddenTaskRendered, '无 DI 的 ReceiveTask 不应出现在 elementRegistry')
  const hiddenMessageRow = page.locator('.list-item').filter({ hasText: 'Message_hidden' })
  await hiddenMessageRow.locator('button').last().click()
  assert(await hiddenMessageRow.isVisible(), '删除检查漏掉了无 DI 流程中的消息引用')
  assert((await page.locator('.el-message-box:visible').count()) === 0, '被引用的全局消息仍打开了删除确认')

  await page.evaluate(() => {
    const registry = window.bpmnModeler.get('elementRegistry')
    window.bpmnModeler.get('selection').select(registry.get('StartEvent_custom'))
  })
  assert(
    (await page.locator('[data-testid="event-message-ref"]').innerText()).includes('业务消息'),
    '消息事件属性面板未回显全局消息引用',
  )

  await page.evaluate(() => {
    const start = window.bpmnModeler.get('elementRegistry').get('StartEvent_custom')
    const signalDefinition = window.bpmnModeler
      .get('bpmnFactory')
      .create('bpmn:SignalEventDefinition')
    signalDefinition.$parent = start.businessObject
    window.bpmnModeler.get('modeling').updateProperties(start, {
      eventDefinitions: [signalDefinition],
    })
  })
  const missingSignalProblems = await page.evaluate(() => window.flowableProcessModeler.validate())
  assert(
    missingSignalProblems.some(
      (problem) =>
        problem.elementId === 'StartEvent_custom' &&
        problem.level === 'error' &&
        problem.message === '信号事件必须配置信号引用或信号表达式',
    ),
    '未引用全局信号定义的 SignalEventDefinition 没有被校验拦截',
  )
  await page.evaluate(() => window.bpmnModeler.get('commandStack').undo())
  await page.waitForFunction(() => {
    const start = window.bpmnModeler.get('elementRegistry').get('StartEvent_custom').businessObject
    return start.eventDefinitions?.[0]?.messageRef?.id === 'Message_custom'
  })

  const customXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  assertStructuredCustomXml(customXml, '第一次导出时')

  const secondImportWarningCount = await page.evaluate(
    async (fixture) => (await window.bpmnModeler.importXML(fixture)).warnings.length,
    customXml,
  )
  assert(secondImportWarningCount === 0, '自定义扩展第二次导入产生兼容警告')
  await page.waitForFunction(() => {
    const root = window.bpmnModeler.get('canvas').getRootElement()
    const selection = window.bpmnModeler.get('selection').get()
    return root.businessObject.id === 'Process_custom_extensions' && selection.length === 0
  })
  await page.locator('.designer-header').getByText('自定义扩展往返', { exact: true }).waitFor()
  const secondCustomXml = await page.evaluate(() => window.flowableProcessModeler.getXML())
  const secondStructuredSemantics = await readCustomStructuredSemantics(page)
  assertStructuredCustomSemantics(secondStructuredSemantics, '第二次导入后')
  assertStructuredCustomXml(secondCustomXml, '第二次导出时')
  mkdirSync('artifacts', { recursive: true })
  writeFileSync('artifacts/custom-extensions-roundtrip.bpmn20.xml', secondCustomXml, 'utf8')

  const screenshotApi = createMockModelerApi()
  screenshotApi.createRecord({
    name: '请假审批流程',
    key: 'Process_leave_request',
    description: '浏览器验证模型',
  })
  const desktopPage = await browser.newPage({ viewport: { width: 1600, height: 960 } })
  trackRuntimeErrors(desktopPage, runtimeErrors, new Set([401]))
  await installMockModelerApiRoutes(desktopPage, screenshotApi)
  await installBrowserStorageProbe(desktopPage)
  await desktopPage.goto(origin, { waitUntil: 'networkidle' })
  await loginToModeler(desktopPage)
  await desktopPage.locator('[data-testid="process-model-list-page"]').waitFor()
  await desktopPage.screenshot({ path: 'artifacts/ui-desktop.png', fullPage: true })
  await assertNoBrowserPersistence(desktopPage, '桌面流程模型列表截图前')
  await desktopPage.close()

  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } })
  trackRuntimeErrors(mobilePage, runtimeErrors, new Set([401]))
  await installMockModelerApiRoutes(mobilePage, screenshotApi)
  await installBrowserStorageProbe(mobilePage)
  await mobilePage.goto(origin, { waitUntil: 'networkidle' })
  await loginToModeler(mobilePage)
  await mobilePage.locator('[data-testid="process-model-list-page"]').waitFor()
  const mobileViewport = await mobilePage.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  assert(
    mobileViewport.scrollWidth <= mobileViewport.clientWidth,
    `移动端存在横向溢出：${mobileViewport.scrollWidth} > ${mobileViewport.clientWidth}`,
  )
  await mobilePage.screenshot({ path: 'artifacts/ui-mobile.png', fullPage: true })
  await assertNoBrowserPersistence(mobilePage, '移动流程模型列表截图前')
  await mobilePage.close()

  await assertNoBrowserPersistence(page, '设计器完整回归后')
  assert(runtimeErrors.length === 0, `浏览器运行时错误：\n${runtimeErrors.join('\n')}`)

  console.log(
    JSON.stringify(
      {
        ok: true,
        elements: initial.elements,
        paletteEntries: initial.palette,
        xmlLength: xml.length,
        customExtensionXmlLength: secondCustomXml.length,
        validationProblems: problems.length,
        mobileViewport,
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  stopServer()
}
