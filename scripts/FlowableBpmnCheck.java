import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.flowable.bpmn.converter.BpmnXMLConverter;
import org.flowable.bpmn.model.BaseElement;
import org.flowable.bpmn.model.BoundaryEvent;
import org.flowable.bpmn.model.BpmnModel;
import org.flowable.bpmn.model.CallActivity;
import org.flowable.bpmn.model.ErrorEventDefinition;
import org.flowable.bpmn.model.EventListener;
import org.flowable.bpmn.model.ExtensionElement;
import org.flowable.bpmn.model.ExternalWorkerServiceTask;
import org.flowable.bpmn.model.FieldExtension;
import org.flowable.bpmn.model.FlowElement;
import org.flowable.bpmn.model.FlowableListener;
import org.flowable.bpmn.model.HttpServiceTask;
import org.flowable.bpmn.model.IOParameter;
import org.flowable.bpmn.model.ImplementationType;
import org.flowable.bpmn.model.IntermediateCatchEvent;
import org.flowable.bpmn.model.MapExceptionEntry;
import org.flowable.bpmn.model.MessageEventDefinition;
import org.flowable.bpmn.model.MultiInstanceLoopCharacteristics;
import org.flowable.bpmn.model.SendEventServiceTask;
import org.flowable.bpmn.model.ServiceTask;
import org.flowable.bpmn.model.Signal;
import org.flowable.bpmn.model.StartEvent;
import org.flowable.bpmn.model.TimerEventDefinition;
import org.flowable.bpmn.model.UserTask;
import org.flowable.bpmn.model.VariableAggregationDefinition;
import org.flowable.bpmn.model.VariableListenerEventDefinition;
import org.flowable.common.engine.api.io.InputStreamProvider;
import org.flowable.validation.ProcessValidator;
import org.flowable.validation.ProcessValidatorFactory;
import org.flowable.validation.ValidationError;
import org.flowable.validation.validator.Problems;

public final class FlowableBpmnCheck {

    private static final String FLOWABLE_NAMESPACE = "http://flowable.org/bpmn";

    private FlowableBpmnCheck() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 5) {
            throw new IllegalArgumentException(
                    "Usage: FlowableBpmnCheck <custom-extensions.bpmn20.xml> <async-config.bpmn20.xml> "
                            + "<p0-extensions.bpmn20.xml> <p2-bpmn.bpmn20.xml> <invalid-service-task.bpmn20.xml>"
            );
        }

        Path xmlPath = Path.of(args[0]).toAbsolutePath().normalize();
        if (!Files.isRegularFile(xmlPath)) {
            throw new IllegalArgumentException("BPMN XML not found: " + xmlPath);
        }

        InputStreamProvider provider = () -> {
            try {
                return Files.newInputStream(xmlPath);
            } catch (IOException exception) {
                throw new UncheckedIOException(exception);
            }
        };

        BpmnModel model = new BpmnXMLConverter().convertToBpmnModel(provider, true, true);
        org.flowable.bpmn.model.Process process = model.getMainProcess();
        if (process == null) {
            throw new IllegalStateException("Flowable did not parse a main process");
        }

        FlowElement flowElement = process.getFlowElement("UserTask_custom", true);
        if (!(flowElement instanceof UserTask userTask)) {
            throw new IllegalStateException("UserTask_custom was not parsed as a UserTask");
        }

        ExtensionElement assigneeType = requireExtension(userTask, "assigneeType");
        ExtensionElement staticVariables = requireExtension(userTask, "staticAssigneeVariables");
        requireText(assigneeType, "static");
        requireText(
                staticVariables,
                "{\"users\":[{\"id\":\"u-001\",\"name\":\"张三\"}],\"expression\":\"approvalUsers\"}"
        );

        if (!model.containsMessageId("Message_custom")) {
            throw new IllegalStateException("Message_custom was not parsed by Flowable");
        }
        Signal signal = model.getSignal("Signal_custom");
        if (signal == null || !Signal.SCOPE_GLOBAL.equals(signal.getScope())) {
            throw new IllegalStateException("Signal_custom scope was not parsed by Flowable");
        }
        if (!"BUSINESS_ERROR".equals(model.getErrors().get("Error_custom"))) {
            throw new IllegalStateException("Error_custom code was not parsed by Flowable");
        }

        FlowElement startElement = process.getFlowElement("StartEvent_custom", true);
        if (!(startElement instanceof StartEvent startEvent)
                || startEvent.getEventDefinitions().isEmpty()
                || !(startEvent.getEventDefinitions().get(0) instanceof MessageEventDefinition messageDefinition)
                || !"Message_custom".equals(messageDefinition.getMessageRef())) {
            throw new IllegalStateException("StartEvent_custom message reference was not parsed by Flowable");
        }

        assertEngineSemanticsRoundTrip();
        assertGeneratedAsyncConfigurationRoundTrip(Path.of(args[1]));
        assertGeneratedP0ExtensionsRoundTrip(Path.of(args[2]));
        assertP2BpmnRoundTrip(Path.of(args[3]), Path.of(args[4]));

        System.out.printf(
                "{\"ok\":true,\"semanticRoundTrip\":true,\"generatedAsyncArtifact\":true,"
                        + "\"generatedP0ExtensionArtifact\":true,\"p2BpmnRoundTrip\":true,"
                        + "\"processValidatorCoverage\":true,\"processId\":\"%s\",\"userTaskId\":\"%s\","
                        + "\"extensionCount\":%d,\"messageCount\":%d,\"signalCount\":%d,\"errorCount\":%d}%n",
                process.getId(),
                userTask.getId(),
                userTask.getExtensionElements().values().stream().mapToInt(List::size).sum(),
                model.getMessages().size(),
                model.getSignals().size(),
                model.getErrors().size()
        );
    }

    private static void assertGeneratedP0ExtensionsRoundTrip(Path sourcePath) throws Exception {
        Path xmlPath = sourcePath.toAbsolutePath().normalize();
        if (!Files.isRegularFile(xmlPath)) {
            throw new IllegalArgumentException("P0 extension BPMN XML not found: " + xmlPath);
        }
        String sourceXml = Files.readString(xmlPath, StandardCharsets.UTF_8);
        if (sourceXml.contains("<flowable:variable ")) {
            throw new IllegalStateException("aggregation variable was exported in the Flowable namespace");
        }
        if (sourceXml.contains("flowable:enableEagerExecutionTreeFetching=")) {
            throw new IllegalStateException("generated P0 XML contains the legacy eager execution attribute");
        }
        if (sourceXml.contains("flowable:resultVariable=\"calculationResult\"")) {
            throw new IllegalStateException("generated P0 XML contains the legacy Service Task result variable attribute");
        }

        BpmnXMLConverter converter = new BpmnXMLConverter();
        BpmnModel firstParse = parseXml(converter, sourceXml.getBytes(StandardCharsets.UTF_8));
        assertGeneratedP0Extensions(firstParse, "generated P0 artifact initial parse");

        byte[] roundTripXml = converter.convertToXML(firstParse);
        BpmnModel secondParse = parseXml(converter, roundTripXml);
        assertGeneratedP0Extensions(secondParse, "generated P0 artifact Flowable round trip");
    }

    private static void assertGeneratedP0Extensions(BpmnModel model, String phase) {
        org.flowable.bpmn.model.Process process = model.getProcessById("Process_p0_extensions");
        if (process == null) {
            throw new IllegalStateException(phase + ": P0 process was not parsed");
        }
        if (!process.isEnableEagerExecutionTreeFetching()) {
            throw new IllegalStateException(phase + ": eager execution fetching changed");
        }
        requireText(requireExtension(process, "historyLevel"), "activity");
        if (process.getEventListeners().size() != 2) {
            throw new IllegalStateException(phase + ": event listener count changed");
        }
        EventListener auditListener = process.getEventListeners().get(0);
        if (!"ENTITY_CREATED".equals(auditListener.getEvents())
                || !"task".equals(auditListener.getEntityType())
                || !ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(auditListener.getImplementationType())
                || !"${auditListener}".equals(auditListener.getImplementation())
                || !"COMMITTED".equals(auditListener.getOnTransaction())) {
            throw new IllegalStateException(phase + ": event listener attributes changed");
        }
        EventListener throwListener = process.getEventListeners().get(1);
        if (!ImplementationType.IMPLEMENTATION_TYPE_THROW_MESSAGE_EVENT.equals(throwListener.getImplementationType())
                || !"taskCompleted".equals(throwListener.getImplementation())) {
            throw new IllegalStateException(phase + ": throw-event listener changed");
        }

        FlowElement startElement = process.getFlowElement("Start_registry", true);
        if (!(startElement instanceof StartEvent startEvent)) {
            throw new IllegalStateException(phase + ": Event Registry start event was not parsed");
        }
        requireText(requireExtension(startEvent, "eventType"), "order-created");
        requireText(requireExtension(startEvent, "eventName"), "Order created");
        requireText(requireExtension(startEvent, "channelKey"), "orders-in");
        requireText(requireExtension(startEvent, "serializerType"), "json");
        requireText(requireExtension(startEvent, "deserializerType"), "json");
        ExtensionElement correlation = requireExtension(startEvent, "eventCorrelationParameter");
        if (!"customerId".equals(correlation.getAttributeValue(null, "name"))
                || !"string".equals(correlation.getAttributeValue(null, "type"))
                || !"${customerId}".equals(correlation.getAttributeValue(null, "value"))) {
            throw new IllegalStateException(phase + ": Event Registry correlation parameter changed");
        }
        ExtensionElement startOutput = requireExtension(startEvent, "eventOutParameter");
        if (!"customerId".equals(startOutput.getAttributeValue(null, "source"))
                || !"customerId".equals(startOutput.getAttributeValue(null, "target"))
                || !"true".equals(startOutput.getAttributeValue(null, "transient"))) {
            throw new IllegalStateException(phase + ": Event Registry output parameter changed");
        }

        FlowElement multiElement = process.getFlowElement("Task_multi_instance", true);
        if (!(multiElement instanceof UserTask multiTask)) {
            throw new IllegalStateException(phase + ": multi-instance User Task was not parsed");
        }
        requireText(requireExtension(multiTask, "includeInHistory"), "true");
        MultiInstanceLoopCharacteristics loop = multiTask.getLoopCharacteristics();
        if (loop == null
                || !loop.isNoWaitStatesAsyncLeave()
                || !"item".equals(loop.getElementVariable())
                || !"itemIndex".equals(loop.getElementIndexVariable())
                || !"${items}".equals(loop.getInputDataItem())
                || loop.getHandler() == null
                || !ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(loop.getHandler().getImplementationType())
                || !"${collectionHandler}".equals(loop.getHandler().getImplementation())) {
            throw new IllegalStateException(phase + ": multi-instance collection handler changed");
        }
        if (loop.getAggregations() == null || loop.getAggregations().getAggregations().size() != 1) {
            throw new IllegalStateException(phase + ": variable aggregation count changed");
        }
        VariableAggregationDefinition aggregation = loop.getAggregations().getAggregations().iterator().next();
        if (!"reviews".equals(aggregation.getTarget())
                || !aggregation.isStoreAsTransientVariable()
                || !aggregation.isCreateOverviewVariable()
                || !ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(aggregation.getImplementationType())
                || !"${variableAggregator}".equals(aggregation.getImplementation())
                || aggregation.getDefinitions() == null
                || aggregation.getDefinitions().size() != 2) {
            throw new IllegalStateException(phase + ": variable aggregation attributes changed");
        }
        VariableAggregationDefinition.Variable firstVariable = aggregation.getDefinitions().get(0);
        VariableAggregationDefinition.Variable secondVariable = aggregation.getDefinitions().get(1);
        if (!"approved".equals(firstVariable.getSource())
                || !"value".equals(firstVariable.getTarget())
                || !"${score * 2}".equals(secondVariable.getSourceExpression())
                || !"${targetKey}".equals(secondVariable.getTargetExpression())) {
            throw new IllegalStateException(phase + ": variable aggregation definitions changed");
        }

        FlowElement boundaryElement = process.getFlowElement("Boundary_variable", true);
        if (!(boundaryElement instanceof BoundaryEvent boundary)
                || boundary.getEventDefinitions().size() != 1
                || !(boundary.getEventDefinitions().get(0) instanceof VariableListenerEventDefinition variableListener)
                || !"approvalState".equals(variableListener.getVariableName())
                || !VariableListenerEventDefinition.CHANGE_TYPE_UPDATE_CREATE.equals(variableListener.getVariableChangeType())
                || !model.getActivityIdsForVariableListenerName("approvalState").contains("Boundary_variable")) {
            throw new IllegalStateException(phase + ": variable listener event definition changed");
        }

        FlowElement timerElement = process.getFlowElement("Timer_cycle", true);
        if (!(timerElement instanceof IntermediateCatchEvent timerEvent)
                || timerEvent.getEventDefinitions().size() != 1
                || !(timerEvent.getEventDefinitions().get(0) instanceof TimerEventDefinition timerDefinition)
                || !"workCalendar".equals(timerDefinition.getCalendarName())
                || !"R5/PT15M".equals(timerDefinition.getTimeCycle())
                || !"${timerEndDate}".equals(timerDefinition.getEndDate())) {
            throw new IllegalStateException(phase + ": timer calendar or end date changed");
        }

        FlowElement expressionElement = process.getFlowElement("Task_expression", true);
        if (!(expressionElement instanceof ServiceTask expressionTask)
                || !ImplementationType.IMPLEMENTATION_TYPE_EXPRESSION.equals(expressionTask.getImplementationType())
                || !"${orderService.calculate(execution)}".equals(expressionTask.getImplementation())
                || !"calculationResult".equals(expressionTask.getResultVariableName())
                || !expressionTask.isUseLocalScopeForResultVariable()
                || !expressionTask.isStoreResultVariableAsTransient()
                || expressionTask.getExecutionListeners().size() != 2) {
            throw new IllegalStateException(phase + ": expression Service Task configuration changed");
        }

        FlowableListener scriptListener = expressionTask.getExecutionListeners().stream()
                .filter(listener -> ImplementationType.IMPLEMENTATION_TYPE_SCRIPT.equals(listener.getImplementationType()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(phase + ": script execution listener was not parsed"));
        if (!"start".equals(scriptListener.getEvent())
                || scriptListener.getImplementation() != null
                || scriptListener.getScriptInfo() == null
                || !"groovy".equals(scriptListener.getScriptInfo().getLanguage())
                || !"listenerResult".equals(scriptListener.getScriptInfo().getResultVariable())
                || !scriptListener.getScriptInfo().getScript().contains("scriptListenerInvoked")
                || scriptListener.getOnTransaction() != null
                || scriptListener.getCustomPropertiesResolverImplementation() != null) {
            throw new IllegalStateException(phase + ": script execution listener changed");
        }

        FlowableListener transactionListener = expressionTask.getExecutionListeners().stream()
                .filter(listener -> "${transactionListener}".equals(listener.getImplementation()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(phase + ": transaction execution listener was not parsed"));
        if (!ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(transactionListener.getImplementationType())
                || !"end".equals(transactionListener.getEvent())
                || !"committed".equals(transactionListener.getOnTransaction())
                || !ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(
                        transactionListener.getCustomPropertiesResolverImplementationType())
                || !"${listenerPropertiesResolver}".equals(
                        transactionListener.getCustomPropertiesResolverImplementation())) {
            throw new IllegalStateException(phase + ": transactional execution listener changed");
        }

        FlowElement sendElement = process.getFlowElement("Task_send_event", true);
        if (!(sendElement instanceof SendEventServiceTask sendTask)
                || !"order-updated".equals(sendTask.getEventType())
                || !"order-acknowledged".equals(sendTask.getTriggerEventType())
                || !sendTask.isSendSynchronously()
                || sendTask.getEventInParameters().size() != 1
                || sendTask.getEventOutParameters().size() != 1) {
            throw new IllegalStateException(phase + ": send-event Service Task changed");
        }
        IOParameter eventInput = sendTask.getEventInParameters().get(0);
        IOParameter eventOutput = sendTask.getEventOutParameters().get(0);
        if (!"${order.id}".equals(eventInput.getSourceExpression())
                || !"orderId".equals(eventInput.getTarget())
                || !"ackId".equals(eventOutput.getSource())
                || !"acknowledgementId".equals(eventOutput.getTarget())
                || !eventOutput.isTransient()) {
            throw new IllegalStateException(phase + ": send-event IO parameters changed");
        }
        requireText(requireExtension(sendTask, "triggerEventName"), "Order acknowledged");
        requireText(requireExtension(sendTask, "channelKey"), "orders-out");
        requireExtension(sendTask, "systemChannel");
        ExtensionElement triggerCorrelation = requireExtension(sendTask, "triggerEventCorrelationParameter");
        if (!"orderId".equals(triggerCorrelation.getAttributeValue(null, "name"))
                || !"${order.id}".equals(triggerCorrelation.getAttributeValue(null, "value"))) {
            throw new IllegalStateException(phase + ": trigger correlation parameter changed");
        }

        FlowElement httpElement = process.getFlowElement("Task_http", true);
        if (!(httpElement instanceof HttpServiceTask httpTask)
                || httpTask.getHttpRequestHandler() == null
                || httpTask.getHttpResponseHandler() == null) {
            throw new IllegalStateException(phase + ": HTTP Service Task handlers were not parsed");
        }
        if (!ImplementationType.IMPLEMENTATION_TYPE_SCRIPT.equals(httpTask.getHttpRequestHandler().getImplementationType())
                || httpTask.getHttpRequestHandler().getScriptInfo() == null
                || !"groovy".equals(httpTask.getHttpRequestHandler().getScriptInfo().getLanguage())
                || !"requestPayload".equals(httpTask.getHttpRequestHandler().getScriptInfo().getResultVariable())
                || !httpTask.getHttpRequestHandler().getScriptInfo().getScript().contains("execution.getVariable('order')")) {
            throw new IllegalStateException(phase + ": HTTP request script handler changed");
        }
        if (!ImplementationType.IMPLEMENTATION_TYPE_DELEGATEEXPRESSION.equals(httpTask.getHttpResponseHandler().getImplementationType())
                || !"${responseHandler}".equals(httpTask.getHttpResponseHandler().getImplementation())) {
            throw new IllegalStateException(phase + ": HTTP response handler changed");
        }
        requireText(requireExtension(httpTask, "includeInHistory"), "true");
    }

    private static void assertP2BpmnRoundTrip(Path sourcePath, Path invalidSourcePath) throws Exception {
        Path xmlPath = sourcePath.toAbsolutePath().normalize();
        if (!Files.isRegularFile(xmlPath)) {
            throw new IllegalArgumentException("P2 BPMN fixture not found: " + xmlPath);
        }

        BpmnXMLConverter converter = new BpmnXMLConverter();
        byte[] sourceXml = Files.readAllBytes(xmlPath);
        BpmnModel firstParse = parseXml(converter, sourceXml);
        assertP2BpmnSemantics(firstParse, "P2 BPMN initial parse");
        assertNoInvalidNativeServiceTaskTypes(firstParse, "P2 BPMN initial parse");

        byte[] roundTripXml = converter.convertToXML(firstParse);
        BpmnModel secondParse = parseXml(converter, roundTripXml);
        assertP2BpmnSemantics(secondParse, "P2 BPMN Flowable round trip");
        assertNoInvalidNativeServiceTaskTypes(secondParse, "P2 BPMN Flowable round trip");

        Path invalidXmlPath = invalidSourcePath.toAbsolutePath().normalize();
        if (!Files.isRegularFile(invalidXmlPath)) {
            throw new IllegalArgumentException("Invalid ServiceTask BPMN fixture not found: " + invalidXmlPath);
        }
        BpmnModel invalidFirstParse = parseXml(converter, Files.readAllBytes(invalidXmlPath));
        assertRestServiceTaskRejected(invalidFirstParse, "invalid REST ServiceTask initial parse");

        byte[] invalidRoundTripXml = converter.convertToXML(invalidFirstParse);
        BpmnModel invalidSecondParse = parseXml(converter, invalidRoundTripXml);
        assertRestServiceTaskRejected(invalidSecondParse, "invalid REST ServiceTask Flowable round trip");
    }

    private static void assertP2BpmnSemantics(BpmnModel model, String phase) {
        org.flowable.bpmn.model.Process process = model.getProcessById("Process_p2_service_tasks");
        if (process == null) {
            throw new IllegalStateException(phase + ": P2 BPMN process was not parsed");
        }
        FlowElement expressionElement = process.getFlowElement("Task_expression", true);
        if (!(expressionElement instanceof ServiceTask expressionTask)
                || !ImplementationType.IMPLEMENTATION_TYPE_EXPRESSION.equals(expressionTask.getImplementationType())
                || !"${orderService.process(execution)}".equals(expressionTask.getImplementation())
                || !"serviceResult".equals(expressionTask.getResultVariableName())
                || !expressionTask.isUseLocalScopeForResultVariable()
                || !expressionTask.isStoreResultVariableAsTransient()
                || !expressionTask.isTriggerable()) {
            throw new IllegalStateException(phase + ": expression ServiceTask attributes changed");
        }

        assertServiceTaskType(process, "Task_mail", ServiceTask.MAIL_TASK, phase);
        assertFieldValue(process, "Task_mail", "to", "ops@example.test", null, phase);
        assertFieldValue(process, "Task_mail", "text", "Order ready", null, phase);
        assertServiceTaskType(process, "Task_shell", ServiceTask.SHELL_TASK, phase);
        assertFieldValue(process, "Task_shell", "command", "echo order-ready", null, phase);
        assertFieldValue(process, "Task_shell", "wait", "true", null, phase);
        assertServiceTaskType(process, "Task_dmn", ServiceTask.DMN_TASK, phase);
        assertFieldValue(process, "Task_dmn", "decisionTableReferenceKey", "order-decision", null, phase);
        assertServiceTaskType(process, "Task_http", ServiceTask.HTTP_TASK, phase);
        assertFieldValue(process, "Task_http", "requestMethod", "GET", null, phase);
        assertFieldValue(process, "Task_http", "requestUrl", null, "${orderEndpoint}", phase);
        assertServiceTaskType(process, "Task_external_worker", ServiceTask.EXTERNAL_WORKER_TASK, phase);
        assertServiceTaskType(process, "Task_external_legacy", ServiceTask.EXTERNAL_WORKER_TASK, phase);
        assertServiceTaskType(process, "Task_mule", ServiceTask.MULE, phase);
        assertServiceTaskType(process, "Task_camel", ServiceTask.CAMEL, phase);

        FlowElement workerElement = process.getFlowElement("Task_external_worker", true);
        FlowElement legacyWorkerElement = process.getFlowElement("Task_external_legacy", true);
        if (!(workerElement instanceof ExternalWorkerServiceTask workerTask)
                || !"orders".equals(workerTask.getTopic())
                || !(legacyWorkerElement instanceof ExternalWorkerServiceTask legacyWorkerTask)
                || !"legacy-orders".equals(legacyWorkerTask.getTopic())) {
            throw new IllegalStateException(phase + ": external worker topics or legacy type normalization changed");
        }

        FlowElement channelElement = process.getFlowElement("Task_send_channel", true);
        if (!(channelElement instanceof SendEventServiceTask channelTask)
                || !ServiceTask.SEND_EVENT_TASK.equals(channelTask.getType())
                || !"order-updated".equals(channelTask.getEventType())
                || !"order-acknowledged".equals(channelTask.getTriggerEventType())
                || !channelTask.isTriggerable()
                || !channelTask.isSendSynchronously()
                || channelTask.getEventInParameters().size() != 1
                || channelTask.getEventOutParameters().size() != 1) {
            throw new IllegalStateException(phase + ": channel send-event ServiceTask attributes changed");
        }
        requireText(requireExtension(channelTask, "channelKey"), "orders-out");
        IOParameter eventInput = channelTask.getEventInParameters().get(0);
        if (!"${order.id}".equals(eventInput.getSourceExpression())
                || !"orderId".equals(eventInput.getTarget())
                || !"string".equals(eventInput.getAttributeValue(null, "sourceType"))
                || !"string".equals(eventInput.getAttributeValue(null, "targetType"))) {
            throw new IllegalStateException(phase + ": send-event input mapping changed");
        }
        IOParameter eventOutput = channelTask.getEventOutParameters().get(0);
        if (!"ackId".equals(eventOutput.getSource())
                || !"acknowledgementId".equals(eventOutput.getTarget())
                || !eventOutput.isTransient()
                || !"string".equals(eventOutput.getAttributeValue(null, "sourceType"))
                || !"string".equals(eventOutput.getAttributeValue(null, "targetType"))) {
            throw new IllegalStateException(phase + ": send-event output mapping changed");
        }

        FlowElement systemElement = process.getFlowElement("Task_send_system", true);
        if (!(systemElement instanceof SendEventServiceTask systemTask)
                || !"audit-recorded".equals(systemTask.getEventType())) {
            throw new IllegalStateException(phase + ": system-channel send-event ServiceTask changed");
        }
        requireExtension(systemTask, "systemChannel");

        FlowElement userElement = process.getFlowElement("Task_custom_resources", true);
        if (!(userElement instanceof UserTask userTask)) {
            throw new IllegalStateException(phase + ": custom-resource UserTask was not parsed");
        }
        Map<String, Set<String>> userLinks = userTask.getCustomUserIdentityLinks();
        Map<String, Set<String>> groupLinks = userTask.getCustomGroupIdentityLinks();
        if (!Set.of("kermit", "${adminUser}").equals(userLinks.get("businessAdministrator"))
                || !Set.of("management", "${adminGroup}").equals(groupLinks.get("businessAdministrator"))
                || !Set.of("gonzo").equals(userLinks.get("observer"))
                || !Set.of("auditors").equals(groupLinks.get("observer"))) {
            throw new IllegalStateException(phase + ": UserTask customResource user/group maps changed");
        }

        FlowElement callElement = process.getFlowElement("Call_review", true);
        if (!(callElement instanceof CallActivity callActivity)
                || !"Process_p2_called".equals(callActivity.getCalledElement())
                || !"key".equals(callActivity.getCalledElementType())
                || !"${reviewProcessName}".equals(callActivity.getProcessInstanceName())
                || !"${businessKey}".equals(callActivity.getBusinessKey())
                || !callActivity.isInheritBusinessKey()
                || !callActivity.isInheritVariables()
                || !callActivity.isSameDeployment()
                || !callActivity.isUseLocalScopeForOutParameters()
                || !callActivity.isCompleteAsync()
                || !Boolean.TRUE.equals(callActivity.getFallbackToDefaultTenant())
                || !"reviewProcessInstanceId".equals(callActivity.getProcessInstanceIdVariableName())
                || callActivity.getInParameters().size() != 1
                || callActivity.getOutParameters().size() != 1) {
            throw new IllegalStateException(phase + ": CallActivity attributes or mapping counts changed");
        }
        IOParameter callInput = callActivity.getInParameters().get(0);
        if (!"${order}".equals(callInput.getSourceExpression())
                || !"reviewOrder".equals(callInput.getTarget())) {
            throw new IllegalStateException(phase + ": CallActivity input mapping changed");
        }
        IOParameter callOutput = callActivity.getOutParameters().get(0);
        if (!"reviewStatus".equals(callOutput.getSource())
                || !"orderReviewStatus".equals(callOutput.getTarget())
                || !callOutput.isTransient()) {
            throw new IllegalStateException(phase + ": CallActivity output mapping changed");
        }
    }

    private static void assertNoInvalidNativeServiceTaskTypes(BpmnModel model, String phase) {
        ProcessValidator validator = new ProcessValidatorFactory().createDefaultProcessValidator();
        List<ValidationError> validationErrors = validator.validate(model);
        List<ValidationError> invalidTypeErrors = validationErrors.stream()
                .filter(error -> Problems.SERVICE_TASK_INVALID_TYPE.equals(error.getProblem()))
                .toList();
        if (!invalidTypeErrors.isEmpty()) {
            throw new IllegalStateException(phase + ": native ServiceTask type was rejected: " + invalidTypeErrors);
        }
        List<ValidationError> blockingErrors = validationErrors.stream()
                .filter(error -> !error.isWarning())
                .toList();
        if (!blockingErrors.isEmpty()) {
            throw new IllegalStateException(phase + ": valid P2 BPMN fixture has validation errors: " + blockingErrors);
        }
    }

    private static void assertRestServiceTaskRejected(BpmnModel model, String phase) {
        org.flowable.bpmn.model.Process process = model.getProcessById("Process_p2_invalid_service_task");
        FlowElement restElement = process == null ? null : process.getFlowElement("Task_rest", true);
        if (!(restElement instanceof ServiceTask restTask) || !"rest".equals(restTask.getType())) {
            throw new IllegalStateException(phase + ": REST ServiceTask type changed before validation");
        }

        ProcessValidator validator = new ProcessValidatorFactory().createDefaultProcessValidator();
        List<ValidationError> validationErrors = validator.validate(model);
        List<ValidationError> invalidTypeErrors = validationErrors.stream()
                .filter(error -> Problems.SERVICE_TASK_INVALID_TYPE.equals(error.getProblem()))
                .toList();
        List<ValidationError> blockingErrors = validationErrors.stream()
                .filter(error -> !error.isWarning())
                .toList();
        if (invalidTypeErrors.size() != 1
                || blockingErrors.size() != 1
                || invalidTypeErrors.get(0).isWarning()
                || !"Task_rest".equals(invalidTypeErrors.get(0).getActivityId())) {
            throw new IllegalStateException(phase + ": ProcessValidator did not reject the unadapted REST type: "
                    + validationErrors);
        }
    }

    private static ServiceTask assertServiceTaskType(
            org.flowable.bpmn.model.Process process,
            String taskId,
            String expectedType,
            String phase
    ) {
        FlowElement element = process.getFlowElement(taskId, true);
        if (!(element instanceof ServiceTask task) || !expectedType.equals(task.getType())) {
            throw new IllegalStateException(phase + ": " + taskId + " did not preserve type " + expectedType);
        }
        return task;
    }

    private static void assertFieldValue(
            org.flowable.bpmn.model.Process process,
            String taskId,
            String fieldName,
            String expectedString,
            String expectedExpression,
            String phase
    ) {
        ServiceTask task = assertServiceTaskType(process, taskId, expectedTaskType(taskId), phase);
        FieldExtension field = task.getFieldExtensions().stream()
                .filter(candidate -> fieldName.equals(candidate.getFieldName()))
                .findFirst()
                .orElseThrow(() -> new IllegalStateException(phase + ": " + taskId + " field " + fieldName + " is missing"));
        if (!java.util.Objects.equals(expectedString, field.getStringValue())
                || !java.util.Objects.equals(expectedExpression, field.getExpression())) {
            throw new IllegalStateException(phase + ": " + taskId + " field " + fieldName + " changed");
        }
    }

    private static String expectedTaskType(String taskId) {
        return switch (taskId) {
            case "Task_mail" -> ServiceTask.MAIL_TASK;
            case "Task_shell" -> ServiceTask.SHELL_TASK;
            case "Task_dmn" -> ServiceTask.DMN_TASK;
            case "Task_http" -> ServiceTask.HTTP_TASK;
            default -> throw new IllegalArgumentException("No expected ServiceTask type registered for " + taskId);
        };
    }

    private static void assertGeneratedAsyncConfigurationRoundTrip(Path sourcePath) throws Exception {
        Path xmlPath = sourcePath.toAbsolutePath().normalize();
        if (!Files.isRegularFile(xmlPath)) {
            throw new IllegalArgumentException("Async BPMN XML not found: " + xmlPath);
        }
        String sourceXml = Files.readString(xmlPath, StandardCharsets.UTF_8);
        if (sourceXml.matches("(?s).*flowable:jobCategory\\s*=.*")) {
            throw new IllegalStateException("generated async XML contains the unsupported jobCategory attribute");
        }

        BpmnXMLConverter converter = new BpmnXMLConverter();
        BpmnModel firstParse = parseXml(converter, sourceXml.getBytes(StandardCharsets.UTF_8));
        assertGeneratedAsyncConfiguration(firstParse, "generated artifact initial parse");

        byte[] roundTripXml = converter.convertToXML(firstParse);
        BpmnModel secondParse = parseXml(converter, roundTripXml);
        assertGeneratedAsyncConfiguration(secondParse, "generated artifact round trip");
    }

    private static void assertGeneratedAsyncConfiguration(BpmnModel model, String phase) {
        org.flowable.bpmn.model.Process process = model.getProcessById("Process_leave_request");
        if (process == null) {
            throw new IllegalStateException(phase + ": generated process was not parsed by Flowable");
        }
        FlowElement flowElement = process.getFlowElement("UserTask_approve", true);
        if (!(flowElement instanceof ServiceTask serviceTask)) {
            throw new IllegalStateException(phase + ": generated Service Task was not parsed by Flowable");
        }
        if (!serviceTask.isAsynchronous()
                || serviceTask.isExclusive()
                || !serviceTask.isAsynchronousLeave()
                || serviceTask.isAsynchronousLeaveExclusive()) {
            throw new IllegalStateException(phase + ": generated asynchronous flags changed");
        }
        requireText(requireExtension(serviceTask, "jobCategory"), "${jobCategory}");
        if (!"${retryCycle}".equals(serviceTask.getFailedJobRetryTimeCycleValue())) {
            throw new IllegalStateException(phase + ": generated retry cycle changed");
        }
    }

    private static void assertEngineSemanticsRoundTrip() throws Exception {
        String semanticXml = """
                <?xml version="1.0" encoding="UTF-8"?>
                <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:flowable="http://flowable.org/bpmn"
                  id="Definitions_engine_semantics"
                  targetNamespace="http://flowable.org/processdef">
                  <bpmn:process id="Process_engine_semantics" isExecutable="true">
                    <bpmn:startEvent id="Start_engine_semantics" />
                    <bpmn:serviceTask
                      id="Service_engine_semantics"
                      flowable:class="java.lang.Object"
                      flowable:async="true"
                      flowable:exclusive="false"
                      flowable:asyncLeave="true"
                      flowable:asyncLeaveExclusive="false">
                      <bpmn:extensionElements>
                        <flowable:jobCategory>${jobCategory}</flowable:jobCategory>
                        <flowable:failedJobRetryTimeCycle>R5/PT5M</flowable:failedJobRetryTimeCycle>
                        <flowable:mapException errorCode="ERR_MAPPED" includeChildExceptions="true" rootCause="java.lang.IllegalArgumentException">java.lang.RuntimeException</flowable:mapException>
                        <flowable:mapException errorCode="ERR_DEFAULT" />
                        <flowable:mapException errorCode="ERR_STATE" includeChildExceptions="false">java.lang.IllegalStateException</flowable:mapException>
                      </bpmn:extensionElements>
                    </bpmn:serviceTask>
                    <bpmn:serviceTask id="ExternalWorker_engine_semantics" flowable:type="external-worker" flowable:topic="orders" />
                    <bpmn:callActivity id="Call_engine_semantics" calledElement="Process_engine_child">
                      <bpmn:extensionElements>
                        <flowable:mapException errorCode="ERR_CALL">java.lang.Exception</flowable:mapException>
                      </bpmn:extensionElements>
                    </bpmn:callActivity>
                    <bpmn:callActivity
                      id="CallInherit_engine_semantics"
                      calledElement="Process_engine_child"
                      flowable:calledElementType="id"
                      flowable:inheritVariables="true"
                      flowable:sameDeployment="true"
                      flowable:useLocalScopeForOutParameters="true"
                      flowable:completeAsync="true"
                      flowable:idVariableName="childInstanceId">
                      <bpmn:extensionElements>
                        <flowable:in source="parentTransient" target="childTransient" transient="true" />
                        <flowable:out source="childTransientResult" target="parentTransientResult" transient="true" />
                      </bpmn:extensionElements>
                    </bpmn:callActivity>
                    <bpmn:boundaryEvent id="ErrorBoundary_engine_semantics" attachedToRef="Service_engine_semantics">
                      <bpmn:errorEventDefinition flowable:errorVariableName="caughtErrorCode" flowable:errorVariableTransient="true" flowable:errorVariableLocalScope="true" />
                    </bpmn:boundaryEvent>
                    <bpmn:intermediateCatchEvent id="MessageCatch_engine_semantics">
                      <bpmn:messageEventDefinition flowable:messageExpression="${dynamicMessage}" />
                    </bpmn:intermediateCatchEvent>
                    <bpmn:endEvent id="End_engine_semantics" />
                    <bpmn:sequenceFlow id="Flow_engine_1" sourceRef="Start_engine_semantics" targetRef="Service_engine_semantics" />
                    <bpmn:sequenceFlow id="Flow_engine_2" sourceRef="Service_engine_semantics" targetRef="Call_engine_semantics" />
                    <bpmn:sequenceFlow id="Flow_engine_3" sourceRef="Call_engine_semantics" targetRef="MessageCatch_engine_semantics" />
                    <bpmn:sequenceFlow id="Flow_engine_4" sourceRef="MessageCatch_engine_semantics" targetRef="End_engine_semantics" />
                  </bpmn:process>
                  <bpmn:process id="Process_engine_child" isExecutable="true" />
                </bpmn:definitions>
                """;

        BpmnXMLConverter converter = new BpmnXMLConverter();
        BpmnModel firstParse = parseXml(converter, semanticXml.getBytes(StandardCharsets.UTF_8));
        assertEngineSemantics(firstParse, "initial parse");

        byte[] roundTripXml = converter.convertToXML(firstParse);
        BpmnModel secondParse = parseXml(converter, roundTripXml);
        assertEngineSemantics(secondParse, "round trip");
    }

    private static BpmnModel parseXml(BpmnXMLConverter converter, byte[] xml) {
        InputStreamProvider provider = () -> new ByteArrayInputStream(xml);
        return converter.convertToBpmnModel(provider, true, true);
    }

    private static void assertEngineSemantics(BpmnModel model, String phase) {
        org.flowable.bpmn.model.Process process = model.getProcessById("Process_engine_semantics");
        if (process == null) {
            throw new IllegalStateException(phase + ": semantic process was not parsed by Flowable");
        }

        FlowElement messageElement = process.getFlowElement("MessageCatch_engine_semantics", true);
        if (!(messageElement instanceof IntermediateCatchEvent messageCatch)
                || messageCatch.getEventDefinitions().isEmpty()
                || !(messageCatch.getEventDefinitions().get(0) instanceof MessageEventDefinition messageDefinition)
                || !"${dynamicMessage}".equals(messageDefinition.getMessageExpression())) {
            throw new IllegalStateException(phase + ": messageExpression was not preserved by Flowable");
        }

        FlowElement errorElement = process.getFlowElement("ErrorBoundary_engine_semantics", true);
        if (!(errorElement instanceof BoundaryEvent errorBoundary)
                || errorBoundary.getEventDefinitions().isEmpty()
                || !(errorBoundary.getEventDefinitions().get(0) instanceof ErrorEventDefinition errorDefinition)
                || !"caughtErrorCode".equals(errorDefinition.getErrorVariableName())
                || !Boolean.TRUE.equals(errorDefinition.getErrorVariableTransient())
                || !Boolean.TRUE.equals(errorDefinition.getErrorVariableLocalScope())) {
            throw new IllegalStateException(phase + ": error variable configuration was not preserved by Flowable");
        }

        FlowElement serviceElement = process.getFlowElement("Service_engine_semantics", true);
        if (!(serviceElement instanceof ServiceTask serviceTask) || serviceTask.getMapExceptions().size() != 3) {
            throw new IllegalStateException(phase + ": mapException was not parsed by Flowable");
        }
        if (!serviceTask.isAsynchronous()
                || serviceTask.isExclusive()
                || !serviceTask.isAsynchronousLeave()
                || serviceTask.isAsynchronousLeaveExclusive()) {
            throw new IllegalStateException(phase + ": asynchronous continuation flags were not preserved by Flowable");
        }
        requireText(requireExtension(serviceTask, "jobCategory"), "${jobCategory}");
        if (!"R5/PT5M".equals(serviceTask.getFailedJobRetryTimeCycleValue())) {
            throw new IllegalStateException(phase + ": failedJobRetryTimeCycle was not preserved by Flowable");
        }
        assertMapException(
                serviceTask.getMapExceptions().get(0),
                "ERR_MAPPED",
                "java.lang.RuntimeException",
                true,
                "java.lang.IllegalArgumentException",
                phase
        );
        assertMapException(serviceTask.getMapExceptions().get(1), "ERR_DEFAULT", "", false, null, phase);
        assertMapException(
                serviceTask.getMapExceptions().get(2),
                "ERR_STATE",
                "java.lang.IllegalStateException",
                false,
                null,
                phase
        );

        FlowElement externalWorkerElement = process.getFlowElement("ExternalWorker_engine_semantics", true);
        if (!(externalWorkerElement instanceof ExternalWorkerServiceTask externalWorkerTask)
                || !ServiceTask.EXTERNAL_WORKER_TASK.equals(externalWorkerTask.getType())
                || !"orders".equals(externalWorkerTask.getTopic())) {
            throw new IllegalStateException(phase + ": external worker type or topic was not preserved by Flowable");
        }

        FlowElement callElement = process.getFlowElement("Call_engine_semantics", true);
        if (!(callElement instanceof CallActivity callActivity) || callActivity.getMapExceptions().size() != 1) {
            throw new IllegalStateException(phase + ": callActivity mapException was not parsed by Flowable");
        }
        if (callActivity.isInheritVariables()) {
            throw new IllegalStateException(phase + ": omitted callActivity inheritVariables did not default to false");
        }
        if (callActivity.isSameDeployment()
                || callActivity.isUseLocalScopeForOutParameters()
                || callActivity.isCompleteAsync()) {
            throw new IllegalStateException(phase + ": omitted callActivity flags did not default to false");
        }
        assertMapException(
                callActivity.getMapExceptions().get(0),
                "ERR_CALL",
                "java.lang.Exception",
                false,
                null,
                phase
        );

        FlowElement inheritedCallElement = process.getFlowElement("CallInherit_engine_semantics", true);
        if (!(inheritedCallElement instanceof CallActivity inheritedCallActivity)
                || !inheritedCallActivity.isInheritVariables()) {
            throw new IllegalStateException(phase + ": explicit callActivity inheritVariables was not preserved by Flowable");
        }
        if (!"id".equals(inheritedCallActivity.getCalledElementType())
                || !inheritedCallActivity.isSameDeployment()
                || !inheritedCallActivity.isUseLocalScopeForOutParameters()
                || !inheritedCallActivity.isCompleteAsync()
                || !"childInstanceId".equals(inheritedCallActivity.getProcessInstanceIdVariableName())) {
            throw new IllegalStateException(phase + ": explicit callActivity configuration was not preserved by Flowable");
        }

        if (inheritedCallActivity.getInParameters().size() != 1
                || inheritedCallActivity.getOutParameters().size() != 1) {
            throw new IllegalStateException(phase + ": callActivity input or output parameters were not preserved by Flowable");
        }
        IOParameter inputParameter = inheritedCallActivity.getInParameters().get(0);
        if (!"parentTransient".equals(inputParameter.getSource())
                || !"childTransient".equals(inputParameter.getTarget())
                || !inputParameter.isTransient()) {
            throw new IllegalStateException(phase + ": transient callActivity input parameter was not preserved by Flowable");
        }
        IOParameter outputParameter = inheritedCallActivity.getOutParameters().get(0);
        if (!"childTransientResult".equals(outputParameter.getSource())
                || !"parentTransientResult".equals(outputParameter.getTarget())
                || !outputParameter.isTransient()) {
            throw new IllegalStateException(phase + ": transient callActivity output parameter was not preserved by Flowable");
        }
    }

    private static void assertMapException(
            MapExceptionEntry actual,
            String errorCode,
            String className,
            boolean includeChildExceptions,
            String rootCause,
            String phase
    ) {
        if (!errorCode.equals(actual.getErrorCode())
                || !className.equals(actual.getClassName())
                || includeChildExceptions != actual.isAndChildren()
                || !java.util.Objects.equals(rootCause, actual.getRootCause())) {
            throw new IllegalStateException(phase + ": mapException order or values changed during Flowable parsing");
        }
    }

    private static ExtensionElement requireExtension(BaseElement element, String expectedName) {
        for (Map.Entry<String, List<ExtensionElement>> entry : element.getExtensionElements().entrySet()) {
            if (!entry.getKey().equalsIgnoreCase(expectedName) || entry.getValue().isEmpty()) {
                continue;
            }

            ExtensionElement extension = entry.getValue().get(0);
            if (!FLOWABLE_NAMESPACE.equals(extension.getNamespace())) {
                throw new IllegalStateException(
                        expectedName + " has unexpected namespace: " + extension.getNamespace()
                );
            }
            return extension;
        }
        throw new IllegalStateException(expectedName + " extension was not parsed by Flowable");
    }

    private static void requireText(ExtensionElement extension, String expectedText) {
        if (!expectedText.equals(extension.getElementText())) {
            throw new IllegalStateException(
                    extension.getName() + " text changed: " + extension.getElementText()
            );
        }
    }
}
