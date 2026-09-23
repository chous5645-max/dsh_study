# DeepSeek Harness 官方源码核验

核验日期：2026-09-23。基线为官方仓库 deepseek-ai/deepseek-harness 的本地干净检出 ddefc45fbc7f8e46dd73185e68295696d1297887，标签 dsh-v0.1.6-alpha.2（提交日期 2026-09-17）。以下链接固定到这一提交。本文件只记录文档和源码静态核验；随后进行的隔离运行烟测见[V1 验证记录](dsh-v1-verification.md)。

## 与现有双插件方案相关的结论

- **插件加载：已证实。** [官方第一插件教程](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/cordis-tutorial/01-first-plugin.md) 展示 cordis.yml 可列包名或相对路径，模块导出 apply(ctx)，Loader 装载插件；服务依赖由 inject 控制。finance-core 作为 Host 插件的方向成立，实际装配尚未验证。
- **Agent 工具：已证实接口。** [dsh-tools README](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/tools/README.md) 展示 ctx.tools.register(defineTool(...))，工具名、说明、参数 schema 对模型可见，参数经过验证；ctx.tools.restrict(filter) 可限制某 Agent 所见工具。[ToolRuntime 源码](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/core/tools/src/index.ts) 定义 register 和 schemas(scope)。账务权限、幂等、计算仍由 finance-core 自己保证。
- **Web 插件装载：已证实接口。** [Client Modules 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/client-modules.md) 要求包声明 dsh.client、platform: web 并导出 ./client 构建产物；Host 扫描后加入浏览器启动图。[官方插件管理器 manifest](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-plugin-manager/package.json) 提供实际样例。项目外安装包尚未实测。
- **独立 UI 面板与侧栏入口：已证实接口。** [Slots 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/slots.md) 定义 ctx.slots.inject() 和 ctx.slots.register()，当前树包含 main 与 sidebar.panellist。[官方插件管理器代码](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-plugin-manager/src/client/index.ts) 同时注册主面板及侧栏入口。子 slot 受声明所有权和生命周期限制，不能假设任意位置可直接插入。
- **UI 直接调用核心服务：已证实机制，财务契约待设计。** [Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/web-client.md) 的路径是 Host 服务、Remote、Client model、UI；[API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/api-gateway.md) 规定 Host 方法用 @Remote/@RemoteScope 公开，构建生成 Client 类型与 codec，Client 调用 ctx.remote.<namespace>。Remote 处理单次请求/结果，增量数据和进度需要独立流协议。
- **复用 Agent 会话：已证实平台能力。** [Session 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/session.md) 定义 Agent 交互的事件日志；[持久化文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/persistence.md) 说明会话 JSONL 后端和恢复。此存储保存会话事件，不能当作财务账本数据库；跨会话账务数据仍须 finance-core 持久化。

## 容易误用的边界

- **文件上传：会话附件通道已证实；账单导入复用方式存疑。** [Client file-upload README](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/file-upload/README.md) 的 ctx.fileUpload.upload(sessionId, body, name, signal, onProgress) 将文件绑定某 Session，返回供随后 prompt 使用的回执；[附件文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/attachment.md) 区分文件字节存储和会话事件。尚不能据此认定该 API 已提供导入任务的文件仓库、任务状态或幂等语义。
- **页面跳转：主面板切换已证实；财务页内深链未找到。** [LayoutController 源码](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/packages/client/ui-layout/src/client/service.ts) 提供 ctx.layout.selectPanel(panelId)，要求 panelId 是已注册的 main key，传 null 返回会话界面；beginNavigation() 提供取消信号。直达某笔交易、刷新后恢复财务子页的统一契约，此轮未找到。
- **Host 事件到浏览器：仅选定事件会被转发。** [Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/web-client.md) 明示 API Gateway 转发选定 Host 事件；[API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/api-gateway.md) 明示增量数据不属于 unary Remote。导入进度与账目变化需设计专门流或轮询，不能因注册了 Host 事件就假设 UI 自动收到。
- **“两个插件”的粒度：存疑。** [第一插件教程](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/cordis-tutorial/01-first-plugin.md) 证实服务装配，[Web Client 架构](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/subsystems/web-client.md) 区分 Host、Client model、UI。finance-core 与 finance-ui 可保留为产品边界；finance-ui 的 Host/Client 两面和 Remote 生成物是否能放进单一 npm 包，尚需原型确认。

## 与 architecture.md 的对应

现有双插件和复用 Agent 的架构方向有官方接口依据。文中“具体接口、对象和存储均未实现或验证”的标注仍准确；目前只完成静态接口核验，没有证明两个财务插件能被这版 DSH 成功装载并协同。尤其不能把 DSH 会话附件、会话日志直接等同于财务导入文件和财务数据库。

后续最小运行验证应依次确认：Host 财务工具进入 Agent 可见 schema；一个 @Remote 查询可在自定义 main 面板显示；侧栏切换成功；样例上传字节可由导入服务取得；重启后财务账本和会话分别恢复。
