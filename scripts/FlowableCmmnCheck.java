import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.flowable.cmmn.converter.CmmnXmlConverter;
import org.flowable.cmmn.model.CaseTask;
import org.flowable.cmmn.model.CmmnModel;
import org.flowable.cmmn.model.DecisionTask;
import org.flowable.cmmn.model.FieldExtension;
import org.flowable.cmmn.model.IOParameter;
import org.flowable.cmmn.model.PlanItemDefinition;
import org.flowable.cmmn.model.ProcessTask;
import org.flowable.common.engine.api.io.InputStreamProvider;

public final class FlowableCmmnCheck {

    private FlowableCmmnCheck() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            throw new IllegalArgumentException("Usage: FlowableCmmnCheck <call-tasks.cmmn>");
        }

        Path sourcePath = Path.of(args[0]).toAbsolutePath().normalize();
        if (!Files.isRegularFile(sourcePath)) {
            throw new IllegalArgumentException("CMMN XML not found: " + sourcePath);
        }

        CmmnXmlConverter converter = new CmmnXmlConverter();
        CmmnModel firstParse = parse(converter, Files.readAllBytes(sourcePath));
        assertCallTasks(firstParse, "initial parse");

        byte[] exportedXml = converter.convertToXML(firstParse);
        String exportedText = new String(exportedXml, StandardCharsets.UTF_8);
        requireContains(exportedText, "processRefExpression", "process reference export");
        requireContains(exportedText, "caseRefExpression", "case reference export");
        requireContains(exportedText, "decisionRefExpression", "decision reference export");
        requireContains(exportedText, "flowable:in", "input mapping export");
        requireContains(exportedText, "flowable:out", "output mapping export");
        requireContains(exportedText, "decisionTaskThrowErrorOnNoHits", "decision field export");

        CmmnModel secondParse = parse(converter, exportedXml);
        assertCallTasks(secondParse, "Flowable round trip");

        System.out.println(
                "{\"ok\":true,\"cmmnCallTaskRoundTrip\":true,"
                        + "\"processTask\":true,\"caseTask\":true,\"decisionTask\":true}"
        );
    }

    private static CmmnModel parse(CmmnXmlConverter converter, byte[] xml) {
        InputStreamProvider provider = () -> new ByteArrayInputStream(xml);
        return converter.convertToCmmnModel(provider, true, true);
    }

    private static void assertCallTasks(CmmnModel model, String phase) {
        ProcessTask processTask = requireDefinition(
                model,
                "ProcessTask_definition",
                ProcessTask.class,
                phase
        );
        requireEquals(effectiveProcessRef(processTask), "target_process", phase + " process ref");
        requireEquals(processTask.getBlockingExpression(), "${blockProcessTask}", phase + " process blocking expression");
        requireTrue(processTask.isBlocking(), phase + " process blocking");
        requireTrue(Boolean.TRUE.equals(processTask.getFallbackToDefaultTenant()), phase + " process fallback tenant");
        requireTrue(processTask.isSameDeployment(), phase + " process same deployment");
        requireEquals(processTask.getProcessInstanceIdVariableName(), "startedProcessInstanceId", phase + " process ID variable");
        assertParameter(
                processTask.getInParameters(),
                0,
                null,
                "${order}",
                "processOrder",
                null,
                phase + " process input"
        );
        assertParameter(
                processTask.getOutParameters(),
                0,
                "status",
                null,
                null,
                "${processResult}",
                phase + " process output"
        );

        CaseTask caseTask = requireDefinition(model, "CaseTask_definition", CaseTask.class, phase);
        requireEquals(effectiveCaseRef(caseTask), "target_case", phase + " case ref");
        requireEquals(caseTask.getBlockingExpression(), "${blockCaseTask}", phase + " case blocking expression");
        requireTrue(caseTask.isBlocking(), phase + " case blocking");
        requireTrue(Boolean.TRUE.equals(caseTask.getFallbackToDefaultTenant()), phase + " case fallback tenant");
        requireTrue(caseTask.isSameDeployment(), phase + " case same deployment");
        requireEquals(caseTask.getCaseInstanceIdVariableName(), "startedCaseInstanceId", phase + " case ID variable");
        requireEquals(caseTask.getBusinessKey(), "${caseBusinessKey}", phase + " case business key");
        requireTrue(caseTask.isInheritBusinessKey(), phase + " case inherit business key");
        assertParameter(
                caseTask.getInParameters(),
                0,
                "customerId",
                null,
                null,
                "${caseCustomer}",
                phase + " case input"
        );
        assertParameter(
                caseTask.getOutParameters(),
                0,
                null,
                "${caseStatus}",
                "resultStatus",
                null,
                phase + " case output"
        );

        DecisionTask tableTask = requireDefinition(
                model,
                "DecisionTableTask_definition",
                DecisionTask.class,
                phase
        );
        requireEquals(effectiveDecisionRef(tableTask), "risk_table", phase + " table decision ref");
        requireEquals(tableTask.getBlockingExpression(), "${blockDecisionTable}", phase + " decision blocking expression");
        requireEquals(fieldValue(tableTask, "decisionTaskThrowErrorOnNoHits"), "true", phase + " table throw field");
        requireEquals(fieldValue(tableTask, "fallbackToDefaultTenant"), "false", phase + " table fallback field");

        DecisionTask serviceTask = requireDefinition(
                model,
                "DecisionServiceTask_definition",
                DecisionTask.class,
                phase
        );
        requireEquals(effectiveDecisionRef(serviceTask), "risk_service", phase + " service decision ref");
        requireEquals(fieldValue(serviceTask, "decisionTaskThrowErrorOnNoHits"), "false", phase + " service throw field");
        requireEquals(fieldValue(serviceTask, "fallbackToDefaultTenant"), "true", phase + " service fallback field");
    }

    private static <T extends PlanItemDefinition> T requireDefinition(
            CmmnModel model,
            String id,
            Class<T> type,
            String phase
    ) {
        PlanItemDefinition definition = model.findPlanItemDefinition(id);
        if (!type.isInstance(definition)) {
            throw new IllegalStateException(phase + ": " + id + " is not a " + type.getSimpleName());
        }
        return type.cast(definition);
    }

    private static String effectiveProcessRef(ProcessTask task) {
        return task.getProcessRef() != null ? task.getProcessRef() : task.getProcessRefExpression();
    }

    private static String effectiveCaseRef(CaseTask task) {
        return task.getCaseRef() != null ? task.getCaseRef() : task.getCaseRefExpression();
    }

    private static String effectiveDecisionRef(DecisionTask task) {
        return task.getDecisionRef() != null ? task.getDecisionRef() : task.getDecisionRefExpression();
    }

    private static String fieldValue(DecisionTask task, String name) {
        for (FieldExtension field : task.getFieldExtensions()) {
            if (name.equals(field.getFieldName())) {
                return field.getStringValue() != null ? field.getStringValue() : field.getExpression();
            }
        }
        throw new IllegalStateException("Decision field is missing: " + name);
    }

    private static void assertParameter(
            List<IOParameter> parameters,
            int index,
            String source,
            String sourceExpression,
            String target,
            String targetExpression,
            String label
    ) {
        if (parameters.size() <= index) {
            throw new IllegalStateException(label + " is missing");
        }
        IOParameter parameter = parameters.get(index);
        requireEquals(parameter.getSource(), source, label + " source");
        requireEquals(parameter.getSourceExpression(), sourceExpression, label + " source expression");
        requireEquals(parameter.getTarget(), target, label + " target");
        requireEquals(parameter.getTargetExpression(), targetExpression, label + " target expression");
    }

    private static void requireContains(String value, String expected, String label) {
        if (!value.contains(expected)) {
            throw new IllegalStateException(label + " is missing");
        }
    }

    private static void requireTrue(boolean value, String label) {
        if (!value) {
            throw new IllegalStateException(label + " changed");
        }
    }

    private static void requireEquals(Object actual, Object expected, String label) {
        if (expected == null ? actual != null : !expected.equals(actual)) {
            throw new IllegalStateException(
                    label + " changed: expected=" + expected + ", actual=" + actual
            );
        }
    }
}
