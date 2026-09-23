# 总体需求设计

当前阶段：需求讨论与整理，尚未开发。本文回答做什么、为何做、满足什么业务规则；技术方案单独维护，不把候选实现当成已确认需求。

## 产品目标

减少个人记账的录入与核对负担，通过批量账单整理、多账户管理和可追溯分析，让用户理解消费、资产负债、未结往来及未来付款压力。

## 已确认方向

批量导入覆盖微信/支付宝 CSV 和 Excel、银行截图；同时提供独立自然语言与表单单笔记账入口；支持消费分析、账户、负债、借贷、报销和退款。默认账目列表和统计，事项可选。日常统一个人账本，分类标签及视图组织，独立账本能力保留。多币种和家庭共享后续迭代。

此前确认的双 DSH 插件与复用 Agent 是技术方向约束，详见技术设计 [architecture.md](../technical/architecture.md)。具体业务细节的确认状态以 [decisions.md](../decisions.md) 为准。

## 基础用户流程

导入资料 → 查看结果与待核对项 → 确认可靠账目 → 查询和分析 → 回溯明细与来源 → 更正或补充关系。

没有充分依据时保留未知，不让 AI 为每笔账强行猜测事项。候选关联不悄悄改变正式统计；不同视图重复展示不重复记账。

## 需求专题

- 业务范围：[business-scope.md](business-scope.md)。
- 导入、核对与自动化：[import-and-reconciliation.md](import-and-reconciliation.md)。
- 账户、负债和往来：[accounts-and-settlements.md](accounts-and-settlements.md)。
- 分类、标签和事项：[categories-tags-and-events.md](categories-tags-and-events.md)。
- 报表与分析：[reports-and-analysis.md](reports-and-analysis.md)。
- 预算和未来计划：[budgets-and-planning.md](budgets-and-planning.md)。
- 押金、预付和资产：[assets-and-prepayments.md](assets-and-prepayments.md)。
- 账本和后续共享范围：[books-and-sharing.md](books-and-sharing.md)。

## 文档边界

需求保留业务术语、场景、用户操作、统计口径、可见状态和验收例子。技术设计负责解析方法、插件职责、工具接口、对象字段、存储、计算和部署。

例如“重复导入不重复记账”是需求；文件摘要、交易标识、幂等和数据库事务是实现方案。业务概念不自动对应某张数据库表。

先收敛需求与未决业务规则，再推进技术验证；优先级和迭代计划后续单独确定。
