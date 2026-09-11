# 上游源码

`deepseek-harness/` 是父仓库锁定精确提交的官方 Git submodule：

- 官方仓库：<https://github.com/deepseek-ai/deepseek-harness>（`origin`）
- 用途：阅读、构建、调试和追踪上游变化

日常插件代码不要放进这里。使用根目录的 `scripts/update-dsh.ps1 -Ref <tag>` 选择官方 Tag；验证后将 submodule 指针提交到父仓库，即可固定在该版本。
