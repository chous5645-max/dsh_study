# 技术设计目录

状态：方案整理；DSH 固定版本集成已做第一轮部分验证，尚未开始产品开发。本文档集承接已讨论的技术提案，不因迁入此目录就视为已确认实现。

## 设计专题

- [双插件架构](architecture.md)：finance-core、finance-ui 与 DSH Agent 职责，候选工具和调用关系。
- [DSH 官方源码核验](dsh-source-research.md)与[第一轮运行验证](dsh-v1-verification.md)：固定版本的一手接口依据和可复现烟测结果。
- [解析与导入](parsing-and-import.md)：格式识别、解析、标准化、去重、任务与核对流程。
- [来源身份与跨来源同笔匹配](source-identity-and-matching.md)：操作重试、同源重复、共同订单号自动关联及防重复计数的技术方案。
- [个人账单与银行字段证据](input-field-evidence.md)：区分当前可证事实与真实格式缺口，列出脱敏样例到位后的核对方法。
- [SQLite 持久化隔离验证](sqlite-persistence-verification.md)：合成订单在单元事务、两进程竞争、进程退出及批次重试中的运行结果。
- [统一草稿与提交校验](drafts-and-posting.md)：字段依据、待补信息、阻断规则和跨入口一致性。
- [核心业务 Interface](core-interface.md)：共同操作契约、查询、核对、任务和更正。
- [对象模型](domain-model.md)：实体候选、金额表示、关系、账本隔离与币种扩展。
- [具体对象模型与跨入口合并](concrete-object-model.md)：六类对象职责、金额约束及自然语言与银行流水合并。
- [存储与部署](storage-and-deployment.md)：持久化、原始文件、迁移、备份及运行方式。
- [业务模块接入](feature-integration.md)：从需求草案迁入的预算、资产、查询等技术补充，待进一步收敛。

## 需求依据与计划

需求入口：[总体需求设计](../requirements/overview.md)。确认状态见 [决策记录](../decisions.md)。验证候选见 [验证计划](../planning/validation-plan.md)。

设计顺序建议：解析数据来源与样例 → 模块职责和调用约束 → 对象与不变量 → 存储和一致性 → DSH 集成验证。具体库、模型、表结构和接口未冻结，不在本次文档整理中提前选定。
