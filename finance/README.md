# DSH Finance

基于 DeepSeek Harness 的个人记账与财务分析项目。

当前阶段：总体业务地图已覆盖主要领域，具体业务口径仍待验收，技术设计与隔离验证正在进行；技术方案中未标为已确认的内容仍是待验证提案，尚未开始正式产品开发。完成业务验收、对象模型与关键技术验证后再划分开发优先级。

已确认的业务用语见[领域术语](CONTEXT.md)。

## 需求设计：做什么

入口：[总体需求设计](docs/requirements/overview.md)。

- [业务范围与场景](docs/requirements/business-scope.md)
- [导入、核对与自动化](docs/requirements/import-and-reconciliation.md)
- [账户、负债与往来](docs/requirements/accounts-and-settlements.md)
- [分类、标签与事项](docs/requirements/categories-tags-and-events.md)
- [报表与分析](docs/requirements/reports-and-analysis.md)
- [预算与未来计划](docs/requirements/budgets-and-planning.md)
- [押金、预付与其他资产](docs/requirements/assets-and-prepayments.md)
- [账本、视图与共享范围](docs/requirements/books-and-sharing.md)

## UI 设计

- [设计方向与首轮原型](docs/ui/design-direction.md)：工作流程、信息层级与三种待评估布局。
- [可交互导入核对原型](../experiments/finance-import-review/README.md)：在本地 DSH main Slot 比较 A/B/C 三种布局，仅使用合成数据。

## 技术设计：怎么做

入口：[技术设计目录](docs/technical/README.md)。

- [双插件架构与职责](docs/technical/architecture.md)
- [解析、导入与核对方案](docs/technical/parsing-and-import.md)
- [统一草稿与提交校验](docs/technical/drafts-and-posting.md)
- [核心插件业务接口](docs/technical/core-interface.md)
- [对象模型与账本隔离](docs/technical/domain-model.md)
- [存储与部署](docs/technical/storage-and-deployment.md)
- [业务模块技术补充](docs/technical/feature-integration.md)

## 决策与验证

- [决策与待讨论问题](docs/decisions.md)：区分需求决策、技术方向及待定提案。
- [验证计划](docs/planning/validation-plan.md)、[V0 合成账务样例](docs/planning/v0-acceptance-cases.md)与[业务验收评审单](docs/planning/v0-review.md)：跨期回看、未批准报销的待定展示、明确重复跳过及独立记录的批次部分入账已确认，V0 整体仍待验收；V1 已做部分集成验证，[V2 单来源隔离实验](../experiments/finance-single-source/README.md)与[V3 跨来源逻辑实验](../experiments/finance-cross-source/README.md)各覆盖部分合成场景，V3 整体及 V4—V5 尚未验收，不代表开发排期。

## 维护约定

需求文件记录业务概念、场景、流程、规则和验收结果；实现方法写入技术文件。需求中的账户、事项等概念不等同于已确定的数据库实体。

讨论结论持续写回，候选实现不视为已确认事实。本项目设计文档归属 dsh_study/finance；可丢弃原型放在 dsh_study/experiments，稳定插件待确认后进入 plugins/。官方 DSH 子模块保持只读。
