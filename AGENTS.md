# AGENTS.md

## 项目目标

这是一个 DeepSeek Harness（DSH）学习与本地插件工作区。主要工作是阅读和理解官方 DSH、记录学习笔记、开展短期实验，以及在 `plugins/` 中实现自定义插件。

## 目录边界

- `source/deepseek-harness/` 是官方 DSH Git submodule，只读使用；不要修改其源码、配置或提交历史。
- `plugins/` 存放可长期维护的本地插件。新增插件必须在 `config/plugins.json` 中显式配置。
- `learning/` 存放学习笔记；每篇涉及 API 的笔记应标明参考的 DSH Tag 和 commit。
- `experiments/` 存放可丢弃的探索。稳定实现移入 `plugins/`，稳定结论移入 `learning/`。
- `.runtime/` 是本地运行状态，绝不提交。

- finance/ 存放 DSH Finance 产品需求、技术决策和 UI 设计；Finance 的短期集成烟测与交互原型仍放在 experiments/，达到长期维护标准后才迁入 plugins/ 并配置启用。

## DSH 版本策略

- DSH remote 必须是 `https://github.com/deepseek-ai/deepseek-harness.git`，只使用官方源码，不使用 Fork。
- 项目默认按官方 Tag 固定版本，而非自动追踪 `master`。
- 只有用户明确指定 Tag 时，才允许切换 DSH 版本。先停止正在运行的 DSH，再运行：

  ```powershell
  .\scripts\update-dsh.ps1 -Ref <tag> -InstallDependencies -Build
  .\scripts\verify-environment.ps1 -RequireDependencies -RequireBuild
  ```

- 版本切换会暂存 submodule 指针；确认后将该指针与相关工作区改动一起提交。
- 不要自行执行 DSH 的 `git pull`、`git switch master`、源码编辑或 Fork 操作。

## 插件与验证

- 修改插件后，先检查 `config/plugins.json` 中的路径和启用状态。
- 用 `scripts/start-dsh.ps1` 或 `scripts/start-dsh.cmd` 启动本地服务；用 `scripts/stop-dsh.ps1` 或 `scripts/stop-dsh.cmd` 停止。
- 涉及 DSH 版本、依赖或构建的修改，必须运行 `verify-environment.ps1 -RequireDependencies -RequireBuild`。
- 不在插件、文档、日志或提交中放置凭据、token、个人数据或运行时 URL。

## 文档与提交

- 保持根 README 面向当前学习与插件工作流；不要加入机器复刻、Fork 协作或未计划产品的长篇方案。
- 文档引用 DSH 行为时，优先引用 `source/deepseek-harness` 内当前 Tag 的文档。
- 变更应聚焦于本仓库；避免把 DSH submodule 的未验证更新混入插件或文档改动。
