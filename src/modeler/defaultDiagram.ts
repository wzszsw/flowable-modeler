import { translate } from '@/i18n'

function escapeXmlAttribute(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function escapeXmlText(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

export const createNewProcessDiagram = (
  processId: string,
  processName: string,
  processDescription = '',
) => {
  const escapedProcessId = escapeXmlAttribute(processId)
  const escapedProcessName = escapeXmlAttribute(processName)
  const documentation = processDescription
    ? `\n    <bpmn2:documentation>${escapeXmlText(processDescription)}</bpmn2:documentation>`
    : ''
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  id="Definitions_flowable_modeler"
  targetNamespace="http://flowable.org/processdef">
  <bpmn2:process id="${escapedProcessId}" name="${escapedProcessName}" isExecutable="true">${documentation}
    <bpmn2:startEvent id="startEvent1" />
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_flowable_modeler">
    <bpmndi:BPMNPlane id="BPMNPlane_flowable_modeler" bpmnElement="${escapedProcessId}">
      <bpmndi:BPMNShape id="BPMNShape_startEvent1" bpmnElement="startEvent1">
        <dc:Bounds x="100" y="163" width="30" height="30" />
      </bpmndi:BPMNShape>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`
}

export const createDefaultDiagram = (
  processId = 'Process_leave_request',
  processName = translate('modeler.defaultDiagram.processName'),
) => {
  const escapedProcessId = escapeXmlAttribute(processId)
  const escapedProcessName = escapeXmlAttribute(processName)
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn2:definitions xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:bpmn2="http://www.omg.org/spec/BPMN/20100524/MODEL"
  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
  xmlns:dc="http://www.omg.org/spec/DD/20100524/DC"
  xmlns:di="http://www.omg.org/spec/DD/20100524/DI"
  xmlns:flowable="http://flowable.org/bpmn"
  id="Definitions_flowable_modeler"
  targetNamespace="http://flowable.org/processdef">
  <bpmn2:process id="${escapedProcessId}" name="${escapedProcessName}" isExecutable="true">
    <bpmn2:startEvent id="StartEvent_apply" name="${translate('modeler.defaultDiagram.startName')}" flowable:initiator="initiator">
      <bpmn2:outgoing>Flow_apply_to_approve</bpmn2:outgoing>
    </bpmn2:startEvent>
    <bpmn2:userTask id="UserTask_approve" name="${translate('modeler.defaultDiagram.approvalName')}" flowable:assignee="\${approver}">
      <bpmn2:incoming>Flow_apply_to_approve</bpmn2:incoming>
      <bpmn2:outgoing>Flow_approve_to_end</bpmn2:outgoing>
    </bpmn2:userTask>
    <bpmn2:endEvent id="EndEvent_done" name="${translate('modeler.defaultDiagram.endName')}">
      <bpmn2:incoming>Flow_approve_to_end</bpmn2:incoming>
    </bpmn2:endEvent>
    <bpmn2:sequenceFlow id="Flow_apply_to_approve" sourceRef="StartEvent_apply" targetRef="UserTask_approve" />
    <bpmn2:sequenceFlow id="Flow_approve_to_end" sourceRef="UserTask_approve" targetRef="EndEvent_done" />
  </bpmn2:process>
  <bpmndi:BPMNDiagram id="BPMNDiagram_flowable_modeler">
    <bpmndi:BPMNPlane id="BPMNPlane_flowable_modeler" bpmnElement="${escapedProcessId}">
      <bpmndi:BPMNShape id="StartEvent_apply_di" bpmnElement="StartEvent_apply">
        <dc:Bounds x="180" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="UserTask_approve_di" bpmnElement="UserTask_approve">
        <dc:Bounds x="320" y="218" width="110" height="80" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNShape id="EndEvent_done_di" bpmnElement="EndEvent_done">
        <dc:Bounds x="540" y="240" width="36" height="36" />
      </bpmndi:BPMNShape>
      <bpmndi:BPMNEdge id="Flow_apply_to_approve_di" bpmnElement="Flow_apply_to_approve">
        <di:waypoint x="216" y="258" />
        <di:waypoint x="320" y="258" />
      </bpmndi:BPMNEdge>
      <bpmndi:BPMNEdge id="Flow_approve_to_end_di" bpmnElement="Flow_approve_to_end">
        <di:waypoint x="430" y="258" />
        <di:waypoint x="540" y="258" />
      </bpmndi:BPMNEdge>
    </bpmndi:BPMNPlane>
  </bpmndi:BPMNDiagram>
</bpmn2:definitions>`
}
