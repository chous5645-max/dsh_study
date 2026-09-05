# DSH 资源与证据工作台：产品、架构与分批交付计划

- 状态：设计基线
- 建立日期：2026-09-05
- 目标仓库：`dsh_study` 及 `source/deepseek-harness` submodule
- 首个产品组合：本地资料问答、可验证引用与原文定位

## 1. 任务定义

在 DSH 中提供以下完整体验：

1. 用户上传 PDF、图片、Markdown、TXT 等资料。
2. 系统持久保存原始资料，异步解析、OCR、切片并建立索引。
3. 用户为会话选择一个或多个资料集，然后自然提问。
4. 模型通过受控工具检索资料，而不是把全部文档直接放入上下文。
5. 回答携带可验证引用；无效或伪造引用不能伪装成有效来源。
6. 用户点击引用后，DSH 右侧详情栏打开原始资料、跳到对应位置并高亮原文。
7. 历史引用在重新索引、文件同名覆盖或解析器升级后仍指向当时的原始版本。

这项能力不命名为“知识库内核”。系统的通用抽象是 **Resource（资源）**、**Document（派生文档）** 和 **Evidence（证据）**；知识库问答只是第一个 bundle。相同能力以后应可承载网页快照、代码、邮件、工单、日志、数据集说明和研究资料。

## 2. 产品范围

### 2.1 第一版必须具备

- 本地单用户运行。
- 上传、查看、删除和重新处理资料。
- 资料集及会话检索范围选择。
- Markdown、TXT、文本型 PDF 的解析。
- 本地全文检索；没有向量模型时仍可用。
- 模型工具检索与展开证据。
- 回答中的受控引用。
- 右侧打开 PDF 或文本原文并高亮。
- 完整的来源版本、内容哈希和证据账本。
- 全新克隆后能够安装、构建和运行；资料数据通过单独导入导出迁移，不进入 Git。

### 2.2 后续范围

- 扫描 PDF 与独立图片 OCR。
- PDF 版面坐标和 OCR polygon 精确高亮。
- 向量检索、混合召回和 rerank。
- DOCX、HTML、网页快照及更多解析 Adapter。
- 多用户权限、远程对象存储、远程索引。
- 结构化表格抽取、实体关系或 GraphRAG。

### 2.3 明确不做

- 第一版不做通用文档编辑器。
- 不把原始资料、索引或模型凭据提交到 Git。
- 不把向量数据库当成来源真相。
- 不允许只凭文件名、页码或模糊文本恢复历史引用。
- 不让一个“大知识库插件”同时拥有上传、解析、检索、模型工具和全部 UI 细节。

## 3. 设计原则

### 3.1 深 Module

每个 Module 通过小 Interface 隐藏复杂 Implementation。调用方不需要了解 PDF 库、OCR 引擎、切片策略、BM25、向量索引、重排或存储目录布局。

Interface 同时是测试表面。验收测试只通过公开 Interface 观察结果，不穿透到 SQLite 表或内部文件名。

### 3.2 只在真实变化点建立 Seam

- 文档解析存在 PDF、Markdown、文本、图片等多个 Adapter，因此解析器注册表是真实 seam。
- 原文 Viewer 存在 PDF、图片、文本等多个 Adapter，因此 Viewer 路由是真实 seam。
- 第一版本地索引只有一个 Implementation，暂不公开“向量数据库 Provider seam”。等本地与远程索引同时存在时再提取。
- 测试所需的内存实现可以作为内部 seam，不因此扩大生产 Interface。

### 3.3 来源优先

原始字节是最终证据。解析文本、Markdown 转换、OCR 文本、chunk 和 embedding 都是可重建的派生产物，不能替代原文。

### 3.4 检索与引用分离

- Chunk 是检索优化单元，可以随策略变化而重建。
- Evidence 是本轮确实交给模型的不可变证据记录。
- SourceAnchor 是回到原始资料的定位坐标。

永久引用不能直接指向可变的向量库 chunk。

## 4. 总体架构

```text
浏览器上传 / 外部导入
          │
          ▼
┌──────────────────────────┐
│ Resource Module          │ 保存原始字节、版本、哈希和元数据
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ Document Module          │ 解析、OCR、规范化、版面坐标和任务状态
│  ├─ PDF Adapter          │
│  ├─ Markdown Adapter     │
│  ├─ Text Adapter         │
│  └─ Image/OCR Adapter    │
└─────────────┬────────────┘
              ▼
┌──────────────────────────┐
│ Evidence Module          │ 切片、索引、检索、重排、账本和引用解析
└───────┬───────────┬──────┘
        │           │
        ▼           ▼
 Model Tool       Browser UI
 search/open      citation/viewer
        │           │
        └─────┬─────┘
              ▼
      回答引用 → 右侧原文高亮
```

运行链路：

```text
原始文件
 → ResourceRevision
 → ParsedDocument
 → IndexChunk
 → evidence_search 结果
 → Turn Evidence Ledger
 → Assistant citation
 → EvidenceRecord
 → SourceAnchor
 → 原始 ResourceRevision
```

## 5. 领域模型

### 5.1 Resource 与版本

```ts
interface Resource {
  resourceId: string
  name: string
  mediaType: string
  currentRevisionId: string
  createdAt: string
  updatedAt: string
}

interface ResourceRevision {
  resourceId: string
  revisionId: string
  contentHash: `sha256:${string}`
  byteSize: number
  mediaType: string
  originalName: string
  createdAt: string
}
```

同一内容重复上传可以复用 blob，但每次业务导入仍可形成独立 Resource。替换同名文件必须产生新 revision；旧 Evidence 继续指向旧 revision。

### 5.2 Document

```ts
interface ParsedDocument {
  resourceId: string
  revisionId: string
  parser: { name: string; version: string }
  status: 'queued' | 'processing' | 'ready' | 'failed'
  blocks: readonly DocumentBlock[]
}
```

`DocumentBlock` 保存规范化文本、结构角色、页码、字符区间及可用的版面坐标。解析器升级只生成新的派生版本，不修改原始 revision。

### 5.3 SourceAnchor

```ts
type SourceAnchor =
  | {
      kind: 'pdf'
      page: number
      textStart: number
      textEnd: number
      boxes: readonly Rect[]
    }
  | {
      kind: 'image'
      polygons: readonly Polygon[]
    }
  | {
      kind: 'text'
      start: number
      end: number
      startLine?: number
      endLine?: number
    }
```

坐标使用原始页面或图像的归一化坐标，避免受 Viewer 缩放影响。Anchor 必须包含足以检测漂移的选中文本哈希。

### 5.4 Evidence

```ts
interface EvidenceRecord {
  evidenceId: string
  resourceId: string
  revisionId: string
  text: string
  textHash: `sha256:${string}`
  anchor: SourceAnchor
  surroundingText?: string
  createdAt: string
}
```

Evidence 在交给模型前生成并持久化。它不是模型可以自行创建的任意字符串。

### 5.5 Turn Evidence Ledger

```ts
interface TurnEvidenceLedger {
  sessionId: string
  turnId: string
  evidenceIds: readonly string[]
}
```

只有出现在相应 Turn 账本中的 Evidence 才能在该回答里解析为可点击引用。`evidence_open` 展开的证据也加入同一账本。

## 6. Module 与插件布局

第一阶段在 `dsh_study/plugins` 中使用较少、较深的 Module：

```text
plugins/
├── resource-local/
│   ├── Resource Interface
│   └── 本地内容寻址存储 Implementation
├── document-ingest/
│   ├── Document Interface 与任务状态
│   ├── parser registry seam
│   └── Markdown、TXT、PDF Adapter
├── evidence-local/
│   ├── Evidence Interface
│   ├── SQLite FTS、切片和检索 Implementation
│   ├── Turn Evidence Ledger
│   └── evidence_search / evidence_open 工具
├── ui-evidence/
│   ├── 上传、资料列表、资料集和处理进度
│   ├── citation resolver
│   └── PDF/Text Viewer Adapter
└── evidence-workbench/
    └── 面向用户的一键组合 bundle
```

当出现真实的第二种部署后，可以演进成独立发布包：

| Module | Interface | 当前 Adapter/Implementation | 未来 Adapter |
|---|---|---|---|
| Resource | `ctx.resources` | 本地文件系统 + SQLite | S3、远程资料平台 |
| Document | `ctx.documents` | 本地任务与解析器注册表 | 独立解析服务 |
| Parser | `parse(resourceRevision)` | PDF、Markdown、TXT | OCR、DOCX、HTML |
| Evidence | `ctx.evidence` | 本地 FTS | 混合检索、远程索引 |
| Viewer | `open(resource, anchor)` | PDF、Text | Image、HTML、表格 |

不要在只有一个生产 Adapter 时提前创建 Provider 包。

## 7. 核心 Interface 草案

### 7.1 Resource Module

```ts
interface Resources {
  import(input: ResourceImport): Promise<Resource>
  get(resourceId: string, revisionId?: string): Promise<ResourceRevision>
  open(resourceId: string, revisionId: string): Promise<ReadableStream<Uint8Array>>
  remove(resourceId: string): Promise<void>
}
```

Implementation 内部负责流式写入、大小限制、SHA-256、原子落盘、去重、事务和错误清理。

### 7.2 Document Module

```ts
interface Documents {
  process(resourceId: string, revisionId?: string): Promise<ProcessingJob>
  status(jobId: string): Promise<ProcessingStatus>
  read(resourceId: string, revisionId: string): Promise<ParsedDocument>
}
```

解析器 Adapter 的内部 Interface：

```ts
interface DocumentParser {
  supports(mediaType: string): boolean
  parse(input: ParseInput): AsyncIterable<DocumentBlock>
}
```

### 7.3 Evidence Module

模型及其他调用方只学习两个主要操作：

```ts
interface Evidence {
  search(request: EvidenceSearchRequest): Promise<EvidenceSearchResult>
  open(request: EvidenceOpenRequest): Promise<EvidenceOpenResult>
}
```

`search()` 内部隐藏查询规范化、范围过滤、FTS、未来的向量召回、融合、重排、相邻段落合并、去重和 token 预算。

## 8. 模型工具

### 8.1 `evidence_search`

```ts
evidence_search({
  query: string,
  scope?: {
    collectionIds?: string[]
    resourceIds?: string[]
  },
  limit?: number
})
```

返回少量证据文本、位置标签和不可伪造的 `evidenceId`。工具结果写入当前 Turn 的 Evidence Ledger。

### 8.2 `evidence_open`

```ts
evidence_open({
  evidenceId: string,
  before?: number,
  after?: number
})
```

只能展开当前 Session 有权访问且已被检索发现的 Evidence。它用于补充上下文，不接受任意本地路径。

### 8.3 回答协议

第一版使用受控 Markdown 链接：

```markdown
该项目在第二季度进入试生产阶段【1】。

【1】[项目进展报告，第 12 页](dsh-evidence:ev_01H...)
```

浏览器只把能通过 Ledger、权限、revision、内容哈希和 Anchor 校验的链接渲染成可点击引用。未知或伪造 ID 保持普通文本，并显示“引用不可验证”状态。

长期方向是 DSH 第一方结构化 citation block；在协议稳定前不把它设为第一批前置条件。

## 9. DSH 通用改动

现有 DSH 已提供流式上传、附件栏、UI slots、右侧详情栏、工具视图和会话投影，但有两个 seam 仍偏向特定功能。

### 9.1 通用详情目标

当前右侧详情主要绑定工具调用。需要将 selection 泛化为：

```ts
type DetailsTarget =
  | { kind: 'tool-call'; callId: string }
  | { kind: string; payload: unknown }
```

提供小 Interface：

```ts
interface Details {
  open(target: DetailsTarget): void
  close(): void
}
```

并提供 keyed slot：

```text
conversation.details.view
  key = target.kind
```

现有工具详情成为 `tool-call` Adapter；`ui-evidence` 注册 `evidence` Adapter。该改动也能支持网页、Git diff、表格和任务详情，适合在 DSH fork 独立分支开发并向官方贡献。

### 9.2 受控 Markdown 引用

当前 Markdown renderer 只接收特定的文件提及解析。需要增加通用引用 Provider：

```ts
interface MarkdownReferenceProvider {
  resolve(request: {
    href: string
    label: string
    sessionId: string
    messageId: string
  }): ResolvedReference | undefined
}
```

Provider 只返回安全的浏览器动作，不允许 renderer 直接执行未知 URI。现有文件引用和新的 Evidence 引用都通过该 Interface 工作，插件无需替换整个 Assistant 消息 renderer。

### 9.3 上传复用范围

复用现有 `client-file-upload` 的流式传输、进度与取消能力，但不把 Session 暂存回执当作永久资料身份。上传完成后，由 Resource Module 接管字节并签发持久 `resourceId/revisionId`。

## 10. 本地数据布局

```text
DSH_HOME/evidence/
├── blobs/                       # 按 SHA-256 内容寻址的原始字节
├── derived/                     # 可重建的解析文本、页图、缩略图
├── evidence.sqlite              # 元数据、任务、资料集、Ledger、FTS
├── indexes/                     # 后续向量索引
└── exports/                     # 用户显式生成的迁移包
```

安全要求：

- 路径不能由用户文件名直接拼接。
- 导入先写临时文件，哈希与校验完成后原子移动。
- 文件大小、页数、解压比、解析时间和并发数必须有限制。
- Parser 在受限执行环境中运行；失败不能破坏已有 revision。
- 删除 Resource 默认删除业务可见性，物理 blob 由可审计 GC 清理。
- 日志不记录原文全文、API Key 或带 token 的 URL。

## 11. 检索策略演进

### 第一版

- Unicode 规范化。
- 标题、段落和页边界感知切片。
- SQLite FTS5/BM25。
- 资料集、资源和媒体类型过滤。
- 相邻片段合并和重复结果抑制。
- 固定 token 预算。

### 第二版

- Embedding Adapter。
- 稀疏 + 稠密召回融合。
- Rerank Adapter。
- 查询改写与多查询召回。
- 表格、标题路径和图注增强。

检索升级只能改变新 Turn 的召回结果，不能改变历史 EvidenceRecord。

## 12. 分批实施与验收

每批遵循同一流程：设计确认 → 测试先行 → 实现 → 定向测试 → 全量相关测试 → 构建 → 人工场景验收 → 独立提交。当前批次验收通过前不进入下一批。

### Batch 0：DSH 通用扩展 seam

交付：

- 通用 `DetailsTarget`、详情控制 Interface 和 keyed details slot。
- 现有 Tool Details 迁移为 `tool-call` Adapter，行为保持不变。
- 受控 Markdown reference Provider Interface。
- 现有文件提及通过兼容 Adapter 保持原行为。
- DSH fork 独立功能分支和上游可提交的原子 commit。

验收：

- 现有工具详情、文件链接和所有相关 snapshots 不回归。
- 测试插件可以注册一种非工具详情并从 Assistant 链接打开。
- 未注册 URI、相对 URL和危险协议仍被拒绝。
- 插件卸载后 slot、Provider 和选择状态正确清理。

### Batch 1：Resource 最小纵切

交付：

- 内容寻址 blob 存储。
- Resource/Revision 元数据。
- 流式导入、去重、读取、软删除。
- 最小 Host Remote 与内存测试 Adapter。

验收：

- 相同字节不会重复保存。
- 同名不同内容形成不同 revision。
- 中断上传不留下可见半成品。
- 重启后资源仍可读取。
- 路径穿越、超限和哈希不匹配失败关闭。

### Batch 2：Document 解析纵切

交付：

- 解析任务状态机和 parser registry。
- Markdown、TXT、文本型 PDF Adapter。
- 标准化 block 与 Text/PDF SourceAnchor。
- 失败诊断和重新处理。

验收：

- 固定 fixture 得到稳定文本、页码和 Anchor。
- Parser 升级不修改原始 revision。
- 失败可重试且不污染最近一次成功派生结果。
- Anchor 能在原始 PDF/文本中恢复对应内容。

### Batch 3：Evidence 检索与模型工具

交付：

- 切片、SQLite FTS、范围过滤和 token 预算。
- `evidence_search`、`evidence_open`。
- Turn Evidence Ledger 和持久 EvidenceRecord。
- 模型静态指引及工具专用 UI 卡片。

验收：

- 基准问题能够召回预期片段。
- 无 embedding 配置仍完整工作。
- 模型不能打开未发现或无权限 Evidence。
- 搜索和展开均正确写入当前 Turn Ledger。
- 重建索引不改变已有 EvidenceRecord。

### Batch 4：上传与资料管理 UI

交付：

- 复用 DSH 上传传输层。
- 资料列表、资料集、处理进度、失败重试和删除。
- 当前会话检索范围选择。
- 本地化、键盘操作、空态和错误态。

验收：

- 拖放和选择文件均显示进度，可取消和重试。
- 刷新页面后资料与状态一致。
- 会话范围不串到其他会话。
- 删除与处理中状态没有竞争导致的幽灵资料。

### Batch 5：回答引用与右侧原文 Viewer

交付：

- Evidence citation resolver。
- Evidence details Adapter。
- PDF.js 和文本 Viewer。
- 自动跳转、高亮、上下文显示及降级提示。

验收：

- 合法引用点击后打开正确 resource/revision/anchor。
- PDF 跳转到正确页并高亮；Markdown/TXT 跳到正确字符范围。
- 伪造 ID、跨 Turn ID、无权限 ID 不可点击。
- 切换会话关闭或更新旧详情，不泄露其他会话内容。
- 历史引用在同名文件上传新版本后仍打开旧 revision。

### Batch 6：OCR、混合检索与迁移

交付：

- 图片与扫描 PDF OCR Adapter。
- polygon 高亮。
- 可选 embedding、混合召回和 rerank。
- 资料集导出/导入和完整性校验。

验收：

- OCR 引用定位到正确图像区域。
- 关闭向量能力后自动降级到 FTS。
- 导出包在另一台电脑导入后保留资源哈希、版本和历史 Anchor。
- 质量基准相对 Batch 3 不退化，并记录召回与引用指标。

## 13. 全局质量门槛

每批都必须满足：

- TypeScript 类型检查通过。
- 新增 Interface 有直接行为测试。
- Host 与 Client 生命周期释放有测试。
- DSH 相关构建和既有测试通过。
- `dsh_study` 全新克隆 bootstrap 不被破坏。
- 无凭据、原始用户资料或运行时数据库进入 Git。
- 变更记录明确属于 `dsh_study` 插件还是 DSH fork。
- DSH fork 改动保持通用，不引用“知识库”业务概念。

## 14. 评测指标

建立一组小型、可提交且无敏感信息的 fixture corpus，持续计算：

- 解析成功率。
- Anchor 精确恢复率。
- Recall@K 与 MRR。
- 引用有效率。
- 引用与断言的一致率。
- 引用点击定位成功率。
- 首次索引耗时与增量索引耗时。
- 搜索 P50/P95 延迟。

第一阶段最看重 Anchor 精确恢复率和引用有效率，而不是回答语言是否流畅。

## 15. Git 与上游协作

- 通用 DSH seam 在 `source/deepseek-harness` 的 `feature/generic-details-references` 分支开发。
- DSH 改动按“通用详情”和“通用引用”拆成可审查 commit，不夹带 Evidence 业务代码。
- 插件实现留在 `dsh_study/plugins`。
- 每批完成后先推送 DSH fork 分支，再提交父仓库 submodule 指针和插件变更。
- 同步官方仓库时，优先 rebase 私有功能分支；公共协作分支使用 merge。
- 如果通用 seam 被上游接受，后续移除 fork patch，并更新 submodule 到包含该能力的官方提交。

## 16. 决策记录

当前确认的决策：

1. 产品名暂用“资源与证据工作台”，不把核心命名成知识库。
2. 原始字节及不可变 revision 是来源真相。
3. Chunk、Evidence、SourceAnchor 是三个不同概念。
4. 第一版优先全文检索，向量检索不是运行前提。
5. 引用必须受 Turn Evidence Ledger 校验。
6. 右侧详情和 Markdown 引用的 DSH 改动必须保持通用。
7. 第一阶段使用少量深 Module；只在真实出现多个 Adapter 时新增 seam。
8. 功能按 Batch 0–6 独立实现、验收和提交。

待以后按批次决定、当前不阻塞的问题：

- PDF Parser 的具体库。
- OCR 默认 Adapter 及模型大小。
- Embedding 与 rerank 的默认 Provider。
- 大型资料集是否引入独立后台进程。
- 多用户部署的权限模型。

## 17. 下一步

下一次开发从 **Batch 0：DSH 通用扩展 seam** 开始。开始前先在 DSH fork 创建功能分支，记录现有 details selection、Markdown renderer 和相关 snapshots 的基线，然后采用测试先行方式实现，不提前创建 Resource 或 Evidence 业务代码。
