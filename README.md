# Flowable Modeler

基于 Vue 3、TypeScript、Element Plus、bpmn-js、cmmn-js 与 dmn-js 的 Flowable 模型前端。
当前支持 Flowable UI Modeler 中的 `Processes`、`Case models` 和 `Decisions`，其中决策分为
`Decision tables` 和 `Decision services`。

## 架构

应用默认不依赖后端，模型元数据和 Oryx 编辑文档保存在浏览器 IndexedDB 中：

```text
IndexedDB / Flowable 编辑 JSON -> 浏览器适配 -> BPMN/CMMN/DMN XML -> bpmn-js/cmmn-js/dmn-js
bpmn-js/cmmn-js/dmn-js XML         -> 浏览器适配 -> 编辑 JSON -> IndexedDB / Flowable
```

- 本地模式自动进入流程列表，不显示登录和登出入口，也不发起 Flowable REST 请求。
- 模型列表、新建、读取、保存、搜索和排序由 IndexedDB 客户端提供；BPMN、CMMN 和决策服务镜像
  Flowable 的 `lastUpdated` 乐观锁，决策表镜像专用的非锁定保存契约；BPMN 额外支持前端导入。
- 不使用 localStorage 或 sessionStorage；数据库名为 `flowable-modeler`，对象仓库为
  `process-models`。
- 可用 `VITE_FLOWABLE_BACKEND_ENABLED=true` 切换到 Flowable 6.8.1 Modeler 后端。
- 后端模式登录使用官方 `POST /app/authentication`，模型请求使用 `/modeler-app/rest`；请求仍统一
  使用 Axios 管理 Cookie、公共请求头、全局 Loading 和错误转换。
- 用户名和密码只用于后端登录请求，不由应用持久化或保存在 API 客户端中。
- 界面支持简体中文和英语，语言选择保存在 URL 的 `lang` 参数中，不写入浏览器存储。
- 后端登录态由 Flowable 签发的 HttpOnly `FLOWABLE_REMEMBER_ME` Cookie 维护，退出登录调用官方
  `/app/logout`。
- Oryx/决策表 JSON 与 BPMN、CMMN、DMN XML 的转换完全在浏览器中完成，不调用后端导入或导出转换接口。
- 后端模式保存 Flowable 官方编辑 JSON；决策表使用专用 REST 资源，其他三类模型使用 `/editor/json`。
- 页面由 Vue Router 管理，编辑器路由使用 Flowable 模型 UUID，刷新后会重新载入同一模型。
- 不提供发布、部署、应用打包、模型删除或 XML/SVG/PNG 导出，不因这些能力要求后端增加关系接口。

打开官方 Oryx 模型时，转换器会生成对应 XML 语义和 DI；保存时再生成 Flowable
可读取的 shape、properties、bounds、dockers 与 outgoing。建模面板只暴露当前能完整往返保存的
CMMN/DMN 能力；Flowable UI 不支持或无法闭环的能力不在界面中提供。

## 功能

- 无后端模式和可选的 Flowable 登录模式
- 使用 Flowable UI 术语的三类模型首页，默认打开 `Processes`
- 简体中文/英语界面及运行时语言切换
- 四类模型的新建、搜索、排序、打开、保存与刷新重开；BPMN 支持前端导入
- BPMN 原生工具栏、上下文菜单、拖拽、框选与连线
- CMMN 案例建模、DMN 决策表和决策服务建模
- Flowable 属性面板和扩展 namespace `http://flowable.org/bpmn`
- BPMN -> 决策表/决策服务、CMMN -> 流程/案例/决策、决策服务 -> 决策表的模型引用
- BPMN SVG 预览（不提供下载）
- 撤销、重做、对齐、缩放、全屏、小地图和网格吸附
- token simulation 流程模拟
- Flowable/BPMN 校验与问题定位
- BPMN、CMMN 和决策服务使用毫秒时间戳 `lastUpdated` 乐观锁；冲突时由用户明确选择是否覆盖
- 未保存返回/离开提示和保存期间操作互斥

## 前端路由

前端路由沿用 Flowable UI 的流程术语：

```text
#/login                    # 仅后端模式
#/processes
#/processes/{modelId}
#/cases
#/cases/{modelId}
#/decisions?type=table
#/decisions?type=service
#/decisions/{modelId}
```

`modelId` 直接取自模型列表响应的 `data[].id`，不使用模型 `key` 或名称。路由使用 hash
history，因此部署为 Spring Boot 静态资源后，刷新任一编辑器路由仍由 `index.html` 启动，
不需要后端增加 SPA fallback。

## 运行模式

不设置环境变量时使用 IndexedDB。浏览器会按当前站点 origin 隔离数据；清除该站点的浏览器数据会
一并删除本地模型。

需要连接 Flowable 后端时，在 Vite 构建环境中显式开启：

```dotenv
VITE_FLOWABLE_BACKEND_ENABLED=true
```

仓库提供的 backend mode 已包含此配置，可直接运行 `npm run build:backend`。未配置或配置为其他值
时均视为 `false`。

## 后端接口

后端模式使用以下 Flowable 6.8.1 原生接口：

```text
GET    /modeler-app/rest/account
GET    /modeler-app/rest/models?modelType={0|4|5|6}&sort=modifiedDesc
POST   /modeler-app/rest/models
GET    /modeler-app/rest/models/{id}
GET    /modeler-app/rest/models/{id}/editor/json                 # BPMN/CMMN/决策服务
POST   /modeler-app/rest/models/{id}/editor/json                 # BPMN/CMMN/决策服务
GET    /modeler-app/rest/decision-table-models/{id}              # 决策表
PUT    /modeler-app/rest/decision-table-models/{id}              # 决策表
```

BPMN、CMMN 和决策服务的保存请求为 `application/x-www-form-urlencoded`，包含 `name`、`key`、
`description`、`json_xml`、毫秒时间戳 `lastUpdated` 和 `newversion=false`。只有用户确认覆盖冲突时才
发送 `conflictResolveAction=overwrite`。决策表按 Flowable UI 的专用 JSON 契约发送 `newVersion`、
`decisionTableImageBase64` 和包含 `decisionTableDefinition` 的 `decisionTableRepresentation`；该专用
接口本身不接收 `lastUpdated` 或冲突覆盖参数，本地模式遵循相同边界。

## 后端搭建

后端不需要编写业务 Java 代码。创建一个 Spring Boot 2.7.18、Java 17、
Maven 工程，保留生成的 `@SpringBootApplication` 启动类，然后加入以下依赖：

```xml
<properties>
    <java.version>17</java.version>
    <flowable.version>6.8.1</flowable.version>
</properties>

<dependencies>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flowable</groupId>
        <artifactId>flowable-spring-boot-starter-rest</artifactId>
        <version>${flowable.version}</version>
    </dependency>
    <dependency>
        <groupId>org.flowable</groupId>
        <artifactId>flowable-spring-boot-starter-ui-modeler</artifactId>
        <version>${flowable.version}</version>
        <exclusions>
            <exclusion>
                <groupId>org.flowable</groupId>
                <artifactId>flowable-ui-modeler-frontend</artifactId>
            </exclusion>
        </exclusions>
    </dependency>
    <dependency>
        <groupId>org.flowable</groupId>
        <artifactId>flowable-spring-boot-starter-ui-idm</artifactId>
        <version>${flowable.version}</version>
        <exclusions>
            <exclusion>
                <groupId>org.flowable</groupId>
                <artifactId>flowable-ui-idm-frontend</artifactId>
            </exclusion>
        </exclusions>
    </dependency>
    <dependency>
        <groupId>com.h2database</groupId>
        <artifactId>h2</artifactId>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

两个 frontend exclusion 用于排除 Flowable 自带的旧版前端。本项目构建产物会作为唯一的 Modeler
前端。`application.properties` 使用下面的最小配置：

```properties
spring.application.name=flowable-modeler-backend

spring.datasource.url=jdbc:h2:file:./data/flowable;DB_CLOSE_ON_EXIT=FALSE
spring.datasource.username=sa
spring.datasource.password=

spring.security.filter.dispatcher-types=REQUEST,FORWARD,ASYNC

flowable.common.app.role-prefix=
flowable.idm.app.admin.user-id=admin
flowable.idm.app.admin.password=test
flowable.idm.app.admin.first-name=Flowable
flowable.idm.app.admin.last-name=Administrator
flowable.idm.app.admin.email=admin@flowable.local
```

启动 `./mvnw spring-boot:run` 后，Flowable 会自动创建 H2 表结构和管理员账号，不需要添加
Controller、Security 配置或其他 Java 类。本地开发账号为 `admin` / `test`，仅用于开发环境。

## 开发

要求 Node.js `^22.18.0` 或 `>=24.12.0`：

```bash
npm install
npm run dev
```

默认启动后直接使用 IndexedDB，无需启动后端。开发服务器仍会把 `/app/**` 和
`/modeler-app/**` 请求代理到 `http://localhost:8080`；调试后端模式时使用：

```bash
npm run dev -- --mode backend
```

此时需要先启动上面创建的 Spring Boot 后端。

Flowable 7 已移除表单能力，因此表单属性面板默认关闭。只有仍使用 Flowable 6 表单能力的部署才应
在 Vite 构建环境中显式开启：

```dotenv
VITE_FLOWABLE_FORMS_ENABLED=true
```

未配置或配置为其他值时均视为 `false`。该开关只控制表单编辑入口与表单校验；已有 BPMN XML
中的 Flowable 表单扩展仍可在 BPMN 导入、编辑和保存往返中保留。

生产构建：

```bash
npm run build
```

该命令构建默认的 IndexedDB 模式。构建后端模式使用：

```bash
npm run build:backend
```

Vite 使用相对资源路径，生产构建产物输出到默认目录：

```text
dist/
```

部署到 Spring Boot 后端时，将 `dist` 中的产物放入后端工程的：

```text
src/main/resources/static/flowable-modeler
```

部署后访问：

```text
http://127.0.0.1:8080/flowable-modeler/index.html
http://127.0.0.1:8080/flowable-modeler/index.html#/processes?lang=en
http://127.0.0.1:8080/flowable-modeler/index.html#/processes/{modelId}
http://127.0.0.1:8080/flowable-modeler/index.html#/cases
http://127.0.0.1:8080/flowable-modeler/index.html#/decisions?type=table
```

未指定 `lang` 时默认使用简体中文。可通过界面中的语言菜单切换，也可在 hash 路由查询中使用
`?lang=zh-CN` 或 `?lang=en`；语言由 Vue Router 管理，因此页面刷新、流程路由跳转和浏览器前进/后退都会保持同步。

## 验证

```bash
npm run verify
```

`verify` 不启动、不调用 Flowable Java 后台，依次执行以下纯前端验证：

- `check`：TypeScript/Vue 类型检查、国际化目录一致性检查和 BPMN moddle 往返测试。
- `test:browser`：自动启动临时 Vite 服务，在隔离的 Chrome/Edge 中验证四类模型的创建、保存、
  刷新重开、CMMN/DMN 能力边界、跨模型引用和专用决策表报文。套件分别使用 IndexedDB 和浏览器
  拦截的 Flowable API mock，并禁止发布、部署、导出与关系查询端点。
- `build`：生产构建检查。

浏览器不在常见安装位置时，可通过 `FLOWABLE_BROWSER_PATH` 指定 Chrome/Edge 可执行文件。

## 转换边界

- BPMN 转换器只接受 Oryx canvas 和已支持的 Flowable stencil。
- BPMN XML 导入必须包含 BPMN DI，否则无法可靠生成 Oryx 图形坐标并会明确报错。
- 本前端保存的 Oryx JSON 会携带原始 XML 和指纹，用于未经其他编辑器修改时精确恢复 XML。
- 一旦 Oryx 内容被其他客户端修改，指纹不匹配，前端会重新从 Oryx 生成 BPMN XML。
- Flowable 扩展统一使用 `flowable` 前缀和 `http://flowable.org/bpmn` namespace。
- 条件表达式、默认流、监听器、多实例、服务任务和事件配置按 Flowable 6.8.1 语义输出；表单配置仅在显式开启表单开关时提供。
- CMMN 只提供能稳定往返的任务、阶段、里程碑、事件监听器和 sentry；CaseFileItem、
  DiscretionaryItem、TextAnnotation 等未闭环元素不对用户暴露。
- 决策表在 DMN XML 与 Flowable `DecisionTableDefinitionRepresentation` 之间往返；决策服务只暴露
  Flowable UI 的决策、信息要求和决策表引用闭环。
