# DeepSeek Harness 学习与插件工作区

这个仓库用于学习 DeepSeek Harness（DSH）并开发本地插件。DSH 源码位于 `source/deepseek-harness` Git submodule，直接使用官方仓库；父仓库记录一个经过验证的官方 Tag 对应 commit。

边界很明确：学习笔记、实验和插件在本仓库维护；不在 `source/deepseek-harness` 修改 DSH 源码，也不维护 DSH Fork。

## 工作区结构

```text
dsh_study/
├── source/deepseek-harness/  # 官方 DSH submodule；固定到一个 Tag 对应的 commit
├── plugins/                  # 本地插件与最小示例
├── learning/                 # DSH 学习笔记与阅读索引
├── experiments/              # 可丢弃的探索与原型
├── config/plugins.json       # 启用的本地插件
└── scripts/                  # 所有项目脚本与命令入口
    ├── bootstrap-dsh.cmd/.ps1
    ├── start-dsh.cmd/.ps1
    ├── stop-dsh.cmd/.ps1
    ├── update-dsh.ps1
    ├── upstream-status.ps1
    └── verify-environment.ps1
```

## 日常使用

启动和关闭：

```powershell
.\scripts\start-dsh.cmd
.\scripts\stop-dsh.cmd
```

启动脚本会读取 `config/plugins.json`，将启用的插件写入本地运行时 patch 后加载。运行记录、日志和隔离的 `DSH_HOME` 都位于不纳入 Git 的 `.runtime/`。

## 学习与插件

- 从 [learning/README.md](learning/README.md) 的官方文档阅读顺序开始；笔记应注明参考的 DSH Tag 或 commit。
- 在 `plugins/<插件名>/` 创建插件，并在 `config/plugins.json` 中显式启用它。
- `plugins/hello-plugin` 是最小 bundle 示例；先复制和改名，再发展为自己的插件。
- `experiments/` 只放短期验证；稳定结论进入 `learning/`，稳定实现进入 `plugins/`。

## DSH 版本：官方 Tag

初始化和启动不会联网更新 DSH，只使用父仓库提交的 submodule commit。需要切换版本时，先停止 DSH，并明确指定官方 Tag：

```powershell
.\scripts\upstream-status.ps1 -Ref dsh-v0.1.5-rc.2
.\scripts\update-dsh.ps1 -Ref dsh-v0.1.5-rc.2 -InstallDependencies -Build
.\scripts\verify-environment.ps1 -RequireDependencies -RequireBuild
```

`update-dsh.ps1` 会确认 Tag 存在、以 detached HEAD 检出其精确 commit、安装依赖、构建，并暂存 submodule 指针。验证后提交该指针及相关工作区改动，即可把 DSH 固定在这个版本：

```powershell
git commit -m "chore: pin DeepSeek Harness dsh-v0.1.5-rc.2"
```

不需要更新时，不运行版本切换脚本。旧的 `update-upstream.ps1` 仅为兼容保留；请使用 `update-dsh.ps1 -Ref <tag>`。

## 本地状态

- 不提交 `.runtime/`、`.env`、凭据、带 token 的 URL、会话或用户资料。
- 官方 DSH remote 为 `origin`，其 push URL 被禁用。
- submodule 处于 detached HEAD 是预期状态：它代表当前固定的官方 Tag commit。
