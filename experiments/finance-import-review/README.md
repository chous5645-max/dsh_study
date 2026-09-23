# DSH Finance 导入核对 UI 原型

这是可丢弃的交互原型，源文件为 client-source.js、style.css、mock-cases.json 和 core-plugin/index.mjs。它挂载在 DSH Web Client 的 main Slot，所有金额与来源都来自 mock-cases.json 合成样例；页面操作仅修改浏览器内存，不调用正式账务写入接口。独立 finance-core 原型包提供 finance_review_case 只读工具，供 DSH Agent 会话查询同一份样例。对应设计方向见 ../../finance/docs/ui/design-direction.md。

在本机工作区，从项目根目录运行一条命令即可启动并打开浏览器：

    .\experiments\finance-import-review\run-prototype.ps1

默认使用本仓库的 source/deepseek-harness；若另有检出，可用 -DshSource 指定绝对路径。停止服务：

    .\experiments\finance-import-review\stop-prototype.ps1

首次进入隔离的 DSH 环境若出现 API Key 配置提示，点击“稍后配置”；原型不会自动发送模型请求；进入原生聊天后，由用户决定是否发送。右侧财务助理可围绕当前核对项模拟提问和解释；回复明确标记为合成示意，不调用真实模型。点击“带入 DSH 对话”会在隔离环境中创建或复用归属项目工作区的会话，把当前核对项、来源位置、所选操作与金额预览自动放入 DSH 原生输入框，不自动发送；已有未发送草稿不会被覆盖。也可以手动复制摘要；从 DSH 侧栏“财务工作台”返回当前核对项。页面底部切换 A 并排工作台、B 逐题核对、C 账目优先；URL 的 variant 参数保存布局选择。点击各问题的处理选项、查看金额影响再确认。账务操作状态仅在当前页面内存中；重启会恢复初始合成场景。.runtime 含本地临时凭据与日志，已被忽略，不应分享。

原型问题：哪一种信息结构最容易让用户在多来源导入后看懂“原始证据、已有账目、处理决定与金额影响”的关系？选择布局后应重写为正式 UI，不能直接把原型代码当产品实现。
