# Flowable Modeler

基于 Vue 3、TypeScript、Element Plus 与 bpmn-js 的 Flowable 流程模型前端。项目名称为
`flowable-modeler`，当前版本只提供 BPMN 2.0 建模能力；名称为以后扩展其他 Flowable 模型类型预留，
当前代码和界面不包含其他模型器。

## 架构

独立模式直接连接 Flowable 6.8.1 Modeler 后端：

```text
Flowable Oryx JSON -> 浏览器转换 -> BPMN XML -> bpmn-js
bpmn-js BPMN XML  -> 浏览器转换 -> Oryx JSON -> /modeler-app/rest
```

- 登录使用官方 `POST /app/authentication`，模型请求使用 `/modeler-app/rest`。
- 浏览器端 Flowable API 请求统一使用 Axios；Cookie、公共请求头、全局 Loading 和错误转换由
  Axios 实例及请求/响应拦截器集中处理。
- 用户名和密码只用于登录请求，不由应用持久化或保存在 API 客户端中。
- 不使用 localStorage、sessionStorage 或 IndexedDB。
- 界面支持简体中文和英语，语言选择保存在 URL 的 `lang` 参数中，不写入浏览器存储。
- 登录态由 Flowable 签发的 HttpOnly `FLOWABLE_REMEMBER_ME` Cookie 维护，刷新页面会恢复会话。
- 退出登录调用官方 `/app/logout` 并清除该 Cookie。
- Oryx JSON 与 BPMN XML 的转换完全在浏览器中完成，不调用后端导入转换接口。
- 后端仍保存 Flowable 官方 Oryx JSON，列表、创建、读取、保存和删除均使用原生接口。
- 页面由 Vue Router 管理，流程编辑器路由使用 Flowable 模型 UUID，刷新后会重新载入同一模型。

打开官方 Oryx 模型时，转换器会生成 BPMN 语义和 DI；保存时再生成 Flowable 可读取的 Oryx
shape、properties、bounds、dockers 与 outgoing。未知 Oryx stencil 会明确拒绝，避免静默降级为普通任务。

## 功能

- Flowable UI 风格登录页和流程模型列表
- 简体中文/英语界面及运行时语言切换
- 流程模型的新建、导入、搜索、排序、打开和删除
- BPMN 原生工具栏、上下文菜单、拖拽、框选与连线
- Flowable 属性面板和扩展 namespace `http://flowable.org/bpmn`
- XML/BPMN 导入，XML/SVG/PNG 导出及 SVG 预览
- 撤销、重做、对齐、缩放、全屏、小地图和网格吸附
- token simulation 流程模拟
- Flowable/BPMN 校验与问题定位
- `lastUpdated` 乐观锁；冲突时由用户明确选择是否覆盖
- 未保存返回/离开提示和保存期间操作互斥
- iframe / `?embedded=1` 嵌入模式

## 前端路由

独立模式沿用 Flowable UI 的流程术语：

```text
#/login
#/processes
#/processes/{modelId}
```

`modelId` 直接取自模型列表响应的 `data[].id`，不使用流程 `key` 或名称。当前版本只注册 BPMN
流程路由；不提供 DMN/CMMN 页面或兼容路由。路由使用 hash history，因此部署为 Spring Boot 静态资源后，
刷新 `#/processes/{modelId}` 仍由 `index.html` 启动，不需要后端增加 SPA fallback。

## 后端接口

独立模式使用以下 Flowable 6.8.1 原生接口：

```text
GET    /modeler-app/rest/account
GET    /modeler-app/rest/models?modelType=0&sort=modifiedDesc
POST   /modeler-app/rest/models
GET    /modeler-app/rest/models/{id}
DELETE /modeler-app/rest/models/{id}
GET    /modeler-app/rest/models/{id}/editor/json
POST   /modeler-app/rest/models/{id}/editor/json
```

保存请求为 `application/x-www-form-urlencoded`，包含 `name`、`key`、`description`、
`json_xml`、`lastUpdated` 和 `newversion=false`。只有用户确认覆盖冲突时才发送
`conflictResolveAction=overwrite`。

配套后端位于：

```text
D:\IdeaProjects\flowable-lab
```

本地开发账号为 `admin` / `test`。该账号只适用于本地环境。

## 开发

要求 Node.js `^22.18.0` 或 `>=24.12.0`：

```bash
npm install
npm run dev
```

Flowable 7 已移除表单能力，因此表单属性面板默认关闭。只有仍使用 Flowable 6 表单能力的部署才应
在 Vite 构建环境中显式开启：

```dotenv
VITE_FLOWABLE_FORMS_ENABLED=true
```

未配置或配置为其他值时均视为 `false`。该开关只控制表单编辑入口与表单校验；已有 BPMN XML
中的 Flowable 表单扩展仍可无损导入和导出。

生产构建：

```bash
npm run build
```

Vite 使用相对资源路径，产物可部署到后端：

```text
D:\IdeaProjects\flowable-lab\src\main\resources\static\flowable-modeler
```

部署后访问：

```text
http://127.0.0.1:8080/flowable-modeler/index.html
http://127.0.0.1:8080/flowable-modeler/index.html#/processes?lang=en
http://127.0.0.1:8080/flowable-modeler/index.html#/processes/{modelId}
```

未指定 `lang` 时默认使用简体中文。可通过界面中的语言菜单切换，也可在 hash 路由查询中使用
`?lang=zh-CN` 或 `?lang=en`；语言由 Vue Router 管理，因此页面刷新、流程路由跳转和浏览器前进/后退都会保持同步。

## 验证

```bash
npm run type-check
npm run test:moddle
npm run test:smoke
npm run test:flowable
npm run build
npm run test:real-backend
```

`test:smoke` 会使用本机 Chromium 浏览器验证登录、Vue Router 深链与编辑器刷新恢复、官方 API
契约、模型列表、创建、Oryx 打开与保存、冲突处理、浏览器端导入、失败回滚、删除、嵌入模式以及
中英文切换、语言刷新恢复和零浏览器存储访问。

`test:flowable` 使用本地 Flowable 6.8.1 `BpmnXMLConverter` 对测试产物做引擎级解析和
往返检查。Flowable 源码不在默认位置时可以给 `scripts/check-flowable.ps1` 传入
`-FlowableRoot`。

`test:real-backend` 要求 `flowable-lab` 已在 8080 启动，默认验证
`http://127.0.0.1:8080/flowable-modeler/index.html`。它会在真实浏览器中验证 Flowable UI
Cookie 登录、刷新恢复、注销、模型 CRUD、浏览器端双向转换和零 Web Storage 持久化，并在
结束时删除测试模型。

## 集成桥

设计器初始化完成后触发 `flowable-modeler-ready`，并暴露：

```ts
window.bpmnModeler

window.flowableProcessModeler?.getXML()
const result = await window.flowableProcessModeler?.importXML(xml, fileName)
result?.warnings
window.flowableProcessModeler?.validate()
await window.flowableProcessModeler?.saveModel()
```

嵌入模式直接进入编辑器，不显示登录页和模型列表。宿主通过 `getXML()` 获取 XML 并负责
持久化；未提供 `persistModel` 时调用 `saveModel()` 会明确拒绝。

## 转换边界

- 转换器只接受 BPMN Oryx canvas 和已支持的 Flowable stencil。
- BPMN XML 导入必须包含 BPMN DI，否则无法可靠生成 Oryx 图形坐标并会明确报错。
- 本前端保存的 Oryx JSON 会携带原始 XML 和指纹，用于未经其他编辑器修改时精确恢复 XML。
- 一旦 Oryx 内容被其他客户端修改，指纹不匹配，前端会重新从 Oryx 生成 BPMN XML。
- Flowable 扩展统一使用 `flowable` 前缀和 `http://flowable.org/bpmn` namespace。
- 条件表达式、默认流、监听器、多实例、服务任务和事件配置按 Flowable 6.8.1 语义输出；表单配置仅在显式开启表单开关时提供。
