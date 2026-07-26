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
