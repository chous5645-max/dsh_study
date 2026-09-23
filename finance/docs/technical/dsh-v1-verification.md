# DSH 集成验证记录（V1，部分完成）

日期：2026-09-23。验证对象是 DeepSeek Harness 官方标签 dsh-v0.1.6-alpha.2，对应提交 ddefc45fbc7f8e46dd73185e68295696d1297887；本机 Windows、Node.js 24.19.0。官方接口和源码依据见[一手资料核验](dsh-source-research.md)。本记录涵盖初轮集成烟测与后续可丢弃的 UI 原型验证；均未使用真实账单或模型凭据。

## 目标与方法

依据[验证计划 V1](../planning/validation-plan.md)，先确定双插件、Agent 工具和 Web 客户端扩展能否接入固定版本。可复现实验位于[隔离烟测](../../../experiments/finance-dsh-smoke/README.md)：用合成金额 35.00 元启动 Host 核心插件和带 dsh.client 声明的 UI 插件包。UI 包的 Host 侧调用同一核心服务，核心注册 finance_probe_summary 工具及运行期 Remote 方法；脚本检查工具 schema 与执行管线、Host Gateway 分发、浏览器经 Connection RPC 获取同一结果、Web 启动页、Client Module 执行及 main Slot 诊断面板渲染。核心还在独立 DSH_HOME 下读写固定合成数据，连续启动两次检查恢复。运行时数据和原始日志留在被忽略的 .runtime，不纳入仓库。

复现命令（在本仓库根目录执行，并将路径换成固定官方源码检出）：

    .\experiments\finance-dsh-smoke\run-smoke.ps1 -DshSource 'D:\work\study\dsh_study\source\deepseek-harness'

## 实际结果

| 检查 | 预期 | 实际 | 结论 |
| --- | --- | --- | --- |
| Host 核心插件 | DSH 加载并注册共享服务 | 控制台出现 core ready；进程保持运行 | 通过 |
| UI 包 Host 侧依赖注入 | 读取核心相同的合成结果 | expenseMinor=3500、bankDeltaMinor=-3500 | 通过 |
| Agent 工具注册与执行管线 | finance_probe_summary 可见且可执行 | ctx.tools.schemas() 包含工具；ctx.tools.execute() 返回相同的合成结果 | 通过；尚未让模型在真实会话中调用 |
| Host Gateway Remote 分发 | 同一财务核心结果通过 Remote 方法可查询 | ctx.typertGateway.invoke() 返回与工具相同的合成结果 | 通过；使用 SRC 运行期标记 |
| 浏览器到 Host RPC | 浏览器插件经 DSH Connection 请求财务 Remote | ctx.connection.rpc.call() 收到相同合成结果，无界面 Chrome 检测到成功标记 | 通过；未生成生产用 ctx.remote 类型契约 |
| 进程重启后数据恢复 | 插件自有合成数据在重启后仍可读 | 首次 store reused=False；第二次 store reused=True；两次金额一致 | 通过；尚未测试删除聊天 |
| 禁用财务 UI 后核心查询 | 不加载 finance-ui 时核心仍可供工具和 Gateway 查询 | 独立启动仅加载核心及无界面测试查询器；工具执行和 Remote 分发通过，启动图不含 finance-ui | 通过 |
| Web 服务 | 固定版本启动，认证入口返回启动页 | 3080 监听；带临时 token 的请求返回 200，页面包含 __DSH_BOOT__ | 通过 |
| Client Module 与 main Slot | dsh.client 包进入启动图、浏览器执行并可注册主面板 | 无界面 Chrome 检测到 client apply；调用 layout.selectPanel 后诊断面板实际渲染 | 通过；仅为无业务内容的诊断面板 |
| 运行清理 | 停止本次启动的进程 | 脚本结束后 3080 无监听 | 通过 |

第二次启动的输出（第一次的 Plugin store reused 为 False，其余通过项相同）：

    DSH commit: ddefc45fbc
    Core loaded and tool registered: True
    Plugin store reused: True
    Adapter read same core result and saw tool: True
    Web listener on 3080: True
    Authenticated Web boot page: True
    Browser executed client module: True
    Browser Remote returned core summary: True
    Main Slot probe rendered: True
    Client package in boot graph: True
    Process exited before checks: False

另运行[无 UI 验证脚本](../../../experiments/finance-dsh-smoke/run-core-only.ps1)，得到 Core-only query passed=True、Web boot works without finance UI=True、Finance UI absent from boot graph=True。

第一次脚本运行因空日志处理错误提前结束；修正后 Host 烟测通过。加入 Client Module 时曾在 Web 启动瞬间遇到一次页面未就绪；脚本增加有界重试后重复运行通过。Chrome 的 dump-dom 模式无法在常驻应用中稳定结束，改用 DevTools 协议读取无界面测试标记后通过。Node.js 对测试模块的语法检查和 PowerShell 解析检查通过；官方源码工作树保持干净。

## 尚未通过运行验证的 V1 要求

- 正式财务 UI 的业务组件、侧栏入口与明细跳转。main Slot 诊断面板及后续合成数据的导入核对交互原型已运行，但正式组件和业务数据接入尚未验证。
- 生产形态的外部插件包构建、Typert Loader 自动注册、Web Client 装配及浏览器 `ctx.remote.financeSummary.summary(...)` 调用。[官方 API Gateway 文档](https://github.com/deepseek-ai/deepseek-harness/blob/ddefc45fbc7f8e46dd73185e68295696d1297887/docs/api-gateway.md) 要求显式选择并挂载严格贡献；下述隔离实验已在 Node Client Remote 中跑通生成贡献，但浏览器执行和正式包流程尚未完成。
- Agent 在真实模型会话里选择并调用财务工具、结果引用跳转；本轮已执行工具管线，但没有模型会话调用。
- 财务文件上传和导入任务、删除聊天后的账本保留、进度通知与断线恢复。合成插件存储仅证明进程重启恢复，未实现财务账本。

这些能力有[官方接口依据](dsh-source-research.md)，但尚无本项目的运行证据。特别是 DSH 会话附件与会话日志不能代替财务导入文件库或账本存储。

## 补充：严格 Remote 契约生成实验

运行[独立生成脚本](../../../experiments/finance-dsh-smoke/run-strict-remote.ps1)时，使用固定官方标签的 `WorkspaceTypertGenerator` 和该标签自带的测试声明夹具，在被忽略的 `.runtime` 中创建独立 TypeScript 工作区。合成财务服务暴露 `financeSummary/summary`，请求含账本标识，结果含消费与银行卡变动的分单位金额；脚本断言生成 Host 与 Client Remote 产物、Client 命名空间类型以及请求/结果校验器。合法对象通过，错误字段类型被拒绝。2026-09-23 本机运行三项检查均通过。

这证明一个外部财务接口的形状可由固定版本的生成器严格描述；测试声明夹具只服务于独立编译实验。该生成脚本本身不启动 DSH；运行期结果见下节。

## 补充：严格 Remote 的运行期链路

运行[隔离启动脚本](../../../experiments/finance-dsh-smoke/run-strict-runtime.ps1)后，固定官方提交 `ddefc45fbc` 下的合成财务服务和生成的 Host 严格描述符在 DSH 中注册，Host `ctx.typertGateway.invoke()` 返回 `{expenseMinor: 3500, bankDeltaMinor: -3500}`。Web 启动页及 strict Client 包进入启动图。Node 中使用 DSH 的 Client Remote 服务挂载生成的 Client 贡献，经认证的 DSH Connection RPC 调用 `ctx.remote.financeSummary.summary({bookId: 'personal-probe'})` 返回相同结果；把 `bookId` 传成数字时，Host 严格校验返回错误。脚本在结束时停止它启动的 DSH 进程。本机默认运行通过。

Host 描述符在实验插件中手动注册，Client 贡献由隔离生成脚本产生；尚未验证正式外部包的构建、Typert Loader 自动注册或 Web Client 浏览器执行。尝试 `-RequireBrowser` 时，本机无界面 Chrome 的 GPU 进程在页面指令前崩溃，DevTools 连接关闭；这次浏览器检查未通过环境门槛，不能据此判断财务 Client 代码在浏览器中的结果。早先 SRC 浏览器烟测的通过记录仍单独成立。

## 后续补充：财务核对项进入原生对话

在同一固定版本和隔离 DSH_HOME 下，导入核对原型选中聚餐 100 元/银行扣款 60 元后，调用 Client sessions.create、uiWorkspace.openSession，再通过 conversation.input.for(scope).setDraft 写入原生会话草稿。浏览器检查确认 data-composer-input 真正显示核对项 ID、原账目、来源位置、当前原型选择和只读工具提示，且没有自动发送模型请求。返回财务工作台选择午饭后再进入同一会话，已有聚餐草稿保持原样。无工作区的 blank Session 会让 composer 处于 inert 状态；原型先在隔离环境注册项目工作区，再创建归属该工作区的 Session，才使预填可见。

只读 finance-core 原型包与 UI 使用同一 mock-cases.json。finance_review_case 出现在模型可见工具 schema，并经 DSH tools.execute 返回聚餐业务金额 10000 分、银行变动 -6000 分及来源依据。此结果验证了工具执行管线和共享合成事实；尚未让真实模型在会话中自主调用该工具。两个 Loader 插件必须属于不同包：把核心与声明 dsh.client 的 UI 放在同一包会触发 Client Modules 多来源冲突，拆分后启动通过。

这些补充的浏览器观察与复现入口见[UI 设计记录](../ui/design-direction.md)和[原型说明](../../../experiments/finance-import-review/README.md)。真实聊天回复、会话中的账本权限、生产级 Remote 契约和实际财务数据仍不在本次通过范围。
## 结论

双插件 Host 装配、共享核心服务、工具执行、Host Gateway 分发、早先的浏览器 SRC Connection RPC、客户端插件与 main Slot 诊断面板、插件自有合成数据重启恢复、UI 禁用后核心查询，以及本轮的生成严格描述符与 Node Client Remote 认证调用，在固定版本上成立。V1 整体验收仍为“部分完成”，不能据此冻结 finance-ui 的模块粒度、上传方式、正式 Remote 包装或页面布局。下一轮重点验证外部插件包的正式生成与 Web Client 装配、真实模型工具调用、文件进入导入任务及删除聊天后的账本保留。
