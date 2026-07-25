# Flowable Modeler

基于 Vue 3、Vite、TypeScript、UnoCSS、Element Plus 与 bpmn-js 的 Flowable BPMN 2.0 流程设计器。

项目以本地 `flowable-engine 6.8.1.36` 的 XML 转换器为兼容目标，Flowable 扩展统一使用：

```text
prefix:    flowable
namespace: http://flowable.org/bpmn
```

## 已实现

- BPMN 原生建模工具栏、上下文菜单、拖拽、框选和连线
- 新建、XML/BPMN 导入、XML/SVG/PNG 导出、SVG 预览
- 本地草稿保存与恢复、未保存离开提示
- 撤销、重做、六向元素对齐、缩放、适应画布、全屏、小地图和网格吸附
- token simulation 流程模拟
- Flowable/BPMN 校验与问题定位
- 右侧 Element Plus 属性面板：
  - 流程、元素通用属性与文档
  - 流程级 `ProcessNameExp` 表达式
  - 用户任务办理人、所有者、候选用户/组、到期时间和优先级
  - 用户任务 `flowable:customResource` 自定义身份链接及分配表达式
  - static / IDM 业务分配元数据，并可显式同步到 Flowable 基础分配字段
  - 自由审批 `NextUser` / `NextSequenceFlow` 结构化表格与高级 JSON
  - 服务任务 class / expression / delegateExpression / 内置类型、表达式结果变量作用域与失败作业重试周期
  - Flowable 原生 Mail、Shell、DMN、HTTP、Send Event、External Worker、Mule、Camel 服务任务
  - REST、SC、MQ、Copy 等宿主类型仅在 `customServiceTaskTypes` 明确声明运行时适配后开放
  - External Worker 标准/旧类型导入、topic 编辑与部署前校验
  - 脚本任务；调用活动 Key/ID、同部署、变量继承、异步完成、实例 ID 变量和 in/out 映射
  - 顺序流条件与默认流
  - 串行/并行多实例、集合处理器/基数、变量聚合和完成条件的原位编辑
  - Flowable 表单字段与枚举选项
  - 外部表单 `NodeFormExp` 结构化单选、宿主表单库选择与高级 JSON
  - 执行/任务监听器、脚本监听器、事务阶段、自定义属性解析器及字段注入
  - 定时器正文、循环结束时间、业务日历，以及条件、消息、信号和错误事件配置
  - Flowable 6.8 动态消息/信号表达式及错误变量作用域
  - 流程级 Message / Signal / Error 定义及事件引用
  - 通用 `flowable:properties` 扩展属性编辑
  - `ModelBpmnExtension` / `MultiInstanceVariables` 原始 JSON 编辑
  - 未保存业务 JSON 草稿跨建模命令和元素切换保留
  - 异步进入 / 异步离开、两组独占作业、作业分类及 skipExpression 等高级属性
- `window.bpmnModeler` 和 `window.flowableProcessModeler` 集成桥，可嵌入现有 Flowable 管理页面
- iframe / `?embedded=1` 嵌入模式：隐藏本地草稿入口并跳过本地草稿恢复
- 导入兼容提示明细，明确标出可能在再次导出时丢失的未知 XML

## 开发

环境要求：Node.js `^22.18.0` 或 `>=24.12.0`。

```bash
npm install
npm run dev
```

默认地址由 Vite 输出。生产构建：

```bash
npm run build
npm run preview
```

## 验证

```bash
npm run type-check
npm run test:moddle
npm run test:smoke
npm run test:flowable
```

`test:moddle` 会直接执行 Flowable descriptor 的两次 bpmn-moddle 解析。`test:smoke`
已包含该检查，并会构建应用、通过本机 Chrome/Edge 执行浏览器往返测试，同时生成
`artifacts/custom-extensions-roundtrip.bpmn20.xml`、
`artifacts/async-job-config-roundtrip.bpmn20.xml` 与
`artifacts/flowable-p0-extensions-roundtrip.bpmn20.xml`。`test:flowable` 随后使用本地
Flowable `BpmnXMLConverter` 开启 XSD 校验，并检查用户任务业务扩展、服务任务异步进入/
离开及独占语义、作业分类、失败作业重试周期、调用活动 transient 映射、全局消息/
信号/错误及事件引用，以及 eager execution、Event Registry、脚本/事务监听器、多实例集合/
变量聚合、定时器结束时间/业务日历、表达式服务任务结果变量和 HTTP handler。检查还会直接
解析 P2 ServiceTask/UserTask fixture，覆盖原生类型、Send Event、CustomResource、Call Activity
以及未适配 REST 类型的反例；引擎模型再次导出、解析后仍需保持相同语义。

Flowable 源码不在默认位置时可直接运行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-flowable.ps1 `
  -FlowableRoot D:\path\to\flowable-engine `
  -XmlPath artifacts\custom-extensions-roundtrip.bpmn20.xml `
  -AsyncXmlPath artifacts\async-job-config-roundtrip.bpmn20.xml `
  -P0XmlPath artifacts\flowable-p0-extensions-roundtrip.bpmn20.xml `
  -P2XmlPath scripts\fixtures\flowable-p2-service-tasks.bpmn20.xml `
  -InvalidServiceTaskXmlPath scripts\fixtures\flowable-p2-service-task-invalid.bpmn20.xml
```

该检查要求对应模块已编译出 `target/classes`，并需要 JDK 与本地 Maven 缓存。

## 集成 API

设计器初始化完成后会触发 `flowable-modeler-ready` 事件，并暴露：

```ts
window.bpmnModeler

window.flowableProcessModeler?.getXML()
const importResult = await window.flowableProcessModeler?.importXML(xml, fileName)
importResult?.warnings
window.flowableProcessModeler?.validate()
window.flowableProcessModeler?.saveDraft()

window.flowableProcessModeler?.configureHost({
  customServiceTaskTypes: [{ type: 'rest', label: 'REST 服务' }],
  selectNodeForms: async ({ modelKey, activityId, selectedForms }) => [],
})
```

这允许宿主页面加载和保存 BPMN XML，而无需通过按钮文本操作 iframe DOM。

设计器在 iframe 内会自动启用嵌入模式，也可以在独立窗口使用 `?embedded=1` 强制启用。嵌入模式保留建模、导入导出、校验和视口工具，但隐藏产品页头以及“新建 / 打开 / 保存草稿”，并且不会读取本地草稿。宿主应通过 `getXML()` 获取 XML 后交给自己的持久化接口。

`configureHost()` 接收同源宿主配置。`customServiceTaskTypes` 是非原生 ServiceTask 的运行时适配白名单；未声明的类型不能新建并会触发部署前错误。`selectNodeForms` 返回 `null/undefined` 表示取消，返回空数组表示清空，返回单项对象数组表示选择表单；至少需要 `code/name`，其他字段会原样保留。

## 兼容说明

- 项目维护自己的 Flowable moddle descriptor；没有使用 npm 上命名空间不匹配的 Flowable moddle 包。
- 参考系统业务扩展已显式注册。未注册的同命名空间扩展元素可能在 bpmn-moddle 往返时丢失，新增扩展必须同步补 descriptor 和测试 fixture。
- descriptor 使用 `tagAlias: lowerCase`，因此 `<flowable:AssigneeType>` 导入后会规范化导出为 `<flowable:assigneeType>`；moddle 类型和 body 保持不变。
- 导入 `http://activiti.org/bpmn` 旧命名空间时，会结构化迁移元素、属性、命名空间声明及 `xsi:schemaLocation` 中的命名空间配对，返回明确兼容提示，并统一导出为 `http://flowable.org/bpmn`；不会全局替换正文或 `targetNamespace`。
- 条件表达式使用 BPMN 标准 `conditionExpression`，默认流配置在网关或活动的 `default` 属性上。
- 脚本监听器输出 `type="script"` 和 nested `flowable:script`；事务监听器仅允许 class/delegateExpression，并使用小写 `before-commit`、`committed`、`rolled-back`。自定义属性解析器只随事务监听器保存。
- 表达式服务任务使用 canonical `resultVariableName`、`useLocalScopeForResultVariable` 和 `storeResultVariableAsTransient`；旧 `resultVariable` 导入后可回显，编辑时会规范化。class、delegateExpression 和内置类型不会保存这些结果属性。
- `flowable:type="case"` 依赖 CMMN，不在当前 BPMN-only 范围内：内置类型下拉不会提供，部署前校验会明确报错，宿主白名单也不能重新开放。
- UserTask `flowable:customResource` 使用标准 `resourceAssignmentExpression/formalExpression` 嵌套结构；名称与表达式在一条可撤销命令中更新，三层节点上的未知属性会原样保留。
- 多实例现有 loop、Collection handler、VariableAggregation 和表达式均原位更新，避免普通属性编辑删除 `noWaitStatesAsyncLeave`、未知属性或扩展对象。
- `businessCalendarName` 保存在 `timerEventDefinition`，循环 `endDate` 保存在 `timeCycle`；修改正文或任一属性不会重建现有 timer expression。
- 异步进入使用 `flowable:async` / `flowable:exclusive`，异步离开使用独立的 `flowable:asyncLeave` / `flowable:asyncLeaveExclusive`。导入时兼容 Flowable 6.8.1 接受的旧别名 `asyncBefore/asyncAfter`，用户修改后规范化为 canonical 属性。
- 作业分类按引擎实际读取的 `<bpmn:extensionElements><flowable:jobCategory>...</flowable:jobCategory></bpmn:extensionElements>` 输出。旧版设计器错误生成的 `flowable:jobCategory` / `flowable:leaveJobCategory` 属性会无损导入并给出校验警告；在属性面板保存后以单条可撤销命令迁移为扩展正文。
- `flowable:failedJobRetryTimeCycle` 支持 `R5/PT5M` 等字面量和表达式；Flowable 6.8.1 运行时仅从服务任务读取该配置，导入到其他活动的现有扩展仅作兼容编辑并给出校验提示。
- Flowable 6.8.1 会解析并重新导出调用活动普通 `flowable:in/out` 的 `transient="true"`，但持久与瞬态映射变量使用同一个目标消费者，因此运行时目标语义没有差异。新建映射不提供 `transient`、`local` 或 `variables="all"`；导入的现有属性仍可见、可编辑并保留。
- `messageExpression`、`signalExpression`、`errorVariableName` 和错误变量作用域按本地 Flowable 6.8 解析器语义输出；参考设计器的旧 `messageName/errorCodeVariable` 字段仅做无损保留，不再作为有效配置。
- descriptor 覆盖 `Properties/Property`、`FormData/FormField/Validation/Constraint` 与 `MapException`，防止这些引擎或参考设计器扩展在导入导出时丢失。
- descriptor 覆盖 Event Registry 参数、Process Event Listener、变量监听事件、流程历史级别、`includeInHistory`、多实例自定义集合/变量聚合及 HTTP request/response handler。聚合子项保持引擎要求的 BPMN `<variable>` 命名空间。
- static / IDM JSON 是业务元数据，`flowable:assignee`、`candidateUsers`、`candidateGroups` 仍是引擎运行时字段；模式切换不会静默覆盖它们。
- 顺序流 `skipExpression` 在本地 Flowable 分支中存在转换器兼容歧义，因此 UI 不开放该字段；用户任务和服务任务的 `flowable:skipExpression` 可正常使用。
