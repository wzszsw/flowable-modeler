# Flowable 6.8.1 Modeler 对齐矩阵

本矩阵以 Flowable 源码提交 `e659baac203478497d9f36f0e3ee57ce1ec52d8a` 为基线，只覆盖
Modeler App 中的 Processes、Case Models、Decision Tables 和 Decision Services。Forms、App
Definitions、Task、IDM、Admin 以及运行时管理不在范围内。

本项目以 Flowable Oryx/Decision Table JSON 为持久化真值，BPMN/CMMN/DMN XML 转换始终在浏览器
完成。后端模式只使用 Flowable 6.8.1 已有的 `/modeler-app/rest` 接口，不增加后端代码。

## 模型生命周期

| 能力 | Processes | Case Models | Decision Tables | Decision Services | 结论 |
| --- | --- | --- | --- | --- | --- |
| 列表、搜索、四种排序 | 支持 | 支持 | 支持 | 支持 | 已对齐 |
| 新建、打开、编辑、保存、刷新重开 | 支持 | 支持 | 支持 | 支持 | 已对齐 |
| XML 导入 | BPMN | CMMN | DMN 1.1/1.2/1.3 | DMN 1.2/1.3 | 已对齐；全部为浏览器转换 |
| 无 DI 导入 | 自动生成 BPMN DI | 官方也要求 CMMN DI | 不需要 DRD DI | 官方也要求 DMN DI | 与 Flowable 6.8.1 行为一致 |
| XML 下载 | `.bpmn20.xml` | `.cmmn.xml` | `.dmn` | `.dmn` | 浏览器从持久化 JSON 生成 |
| 复制模型 | 支持 | 支持 | 支持 | 支持 | 新模型会重定向内部 key/name 并清除旧 XML 快照 |
| 删除模型 | 支持 | 支持 | 支持 | 支持 | 直接删除；不做关系表依赖保护 |
| 另存为新版本 | 支持 | 支持 | 支持 | 支持 | 通用模型与 Decision Table 分别使用官方保存契约 |
| 历史列表、恢复为新版本 | 支持 | 支持 | 支持 | 支持 | 使用官方 history GET/POST；本地模式行为一致 |
| 查看或下载历史版本 | 不支持 | 不支持 | 不支持 | 不支持 | 见“后端限制” |

Decision Table 导入读取标准 DMN decision；Decision Service 导入会先把文档内嵌的 Decision Table
创建为独立模型，再重建服务引用。DMN 1.1/1.2 输入先在浏览器转换为持久化 JSON，并统一生成 DMN
1.3 XML 交给 `dmn-js`。任一步骤失败时，本次导入创建的所有模型都会回滚。

## 跨模型联动

| 来源 | 目标 | 建模、保存、重开 | 保存后打开目标 | 后端关系表 |
| --- | --- | --- | --- | --- |
| BPMN Decision Task | Decision Table | 支持 | 支持 | Flowable 持久化 |
| BPMN Decision Task | Decision Service | 支持 | 支持 | Flowable 持久化 |
| BPMN Case Service Task | Case Model | 支持 | 支持 | Flowable 6.8.1 不持久化 |
| CMMN Process Task | Process | 支持 | 支持 | Flowable 持久化 |
| CMMN Case Task | Case Model | 支持 | 支持 | Flowable 持久化 |
| CMMN Decision Task | Decision Table | 支持 | 支持 | Flowable 持久化 |
| CMMN Decision Task | Decision Service | 支持 | 支持 | Flowable 6.8.1 不持久化 |
| Decision Service Decision | Decision Table | 支持 | 支持 | Flowable 持久化 |

BPMN Call Activity 的 `calledElement` / `calledElementType` 也按 Flowable 语义保存，但官方模型器将其
作为流程 key/id 文本，而不是 ACT_DE_MODEL_RELATION 模型引用，因此不属于上表的直接模型记录联动。

## 编辑器范围

- BPMN 编辑器覆盖项目已支持的 Flowable 6.8.1 stencil、属性、校验、Case/DMN 引用、撤销重做、
  对齐、缩放、小地图、网格、模拟和 SVG 预览。
- CMMN 编辑器覆盖可稳定往返的 Task、Human Task、Decision Task、Process Task、Case Task、Stage、
  Milestone、Event/Timer/User Event Listener、Entry/Exit Criterion 和 Association，以及跨模型调用参数。
- Decision Table 覆盖命中策略、输入输出列、规则和标准 DMN 往返；Decision Service 覆盖 Flowable
  stencil 集中的 Decision、Expanded Decision Service 和 Information Requirement。
- Flowable 专用 CMMN Service/HTTP/Mail/Script/Send Event/External Worker Task、Variable Event
  Listener 及其高级属性包没有暴露。当前 `cmmn-js` 不原生建模这些 Flowable 扩展，本项目不会用会
  丢失语义的通用 Task 近似它们。

## 后端限制

- 不调用 `/bpmn20`、`/cmmn`、`/dmn`、Decision Table export 或任何 import endpoint；这些接口会在
  后端执行 JSON/XML 转换，违反浏览器转换边界。
- Flowable 历史接口只公开历史元数据和展示 JSON，没有公开历史 Oryx `modelEditorJson`。在“不改
  后端、浏览器负责转换”的约束下，无法可靠实现历史版本编辑预览或 XML 下载，因此只提供历史列表
  和恢复为新版本。
- Flowable 6.8.1 不为 BPMN Case Service Task 和 CMMN Decision Service 引用写完整关系记录。因此
  不提供反向引用、关系依赖提示、关系保护删除、App 打包遍历或级联处理。
- 发布、部署和 App Definition 打包属于 App/运行时闭环，不在本项目范围内。

## 验证要求

`npm run verify` 必须覆盖类型检查、i18n、moddle 往返、IndexedDB 与后端 mock 浏览器闭环和生产构建；
`npm run test:flowable` 另外使用 Flowable 6.8.1 Java 解析器验证 BPMN/CMMN 输出。后端 mock 会把所有
后端 XML 导入/导出转换端点作为禁用调用，并校验四类导入、复制、删除、版本和历史请求契约。
