# DeepSeek Harness 学习与插件开发工作区

这个仓库用于学习 DeepSeek Harness（DSH）并开发独立插件。官方源码以 Git submodule 固定在 `source/deepseek-harness`：submodule 的 `origin` 指向个人 Fork，`upstream` 指向官方仓库。插件、实验和学习资料由本仓库管理，DSH 源码修改留在 Fork 的独立分支中。

## 在一台新 Windows 电脑上复刻

准备以下工具：

- Git for Windows。
- Node.js `^22.19.0` 或 `>=24.0.0`；仓库的 `.node-version` 记录当前验证版本。
- Node.js 随附的 Corepack。
- Visual Studio Build Tools，安装 `Desktop development with C++` 工作负载和 Windows SDK。
- PowerShell 7，供 DSH 的 PowerShell 能力使用；初始化脚本本身也可由 Windows PowerShell 运行。

从零开始只需要：

```powershell
git clone --recurse-submodules https://github.com/chous5645-max/dsh_study.git
Set-Location .\dsh_study
.\bootstrap-dsh.cmd
.\start-dsh.cmd
```

如果克隆时漏掉了 `--recurse-submodules`，`bootstrap-dsh.cmd` 会自动初始化 submodule。

初始化脚本会：

1. 将 DSH 检出到本仓库钉住的确切提交。
2. 校验根仓库和 DSH Fork 的 `origin`。
3. 配置官方 `upstream`，并禁用向官方仓库推送。
4. 在 `.runtime/corepack` 中准备 DSH `package.json` 指定的 pnpm 版本。
5. 使用 frozen lockfile 安装依赖并构建。
6. 运行环境验收。

只检查、不安装或构建：

```powershell
.\scripts\verify-environment.ps1
```

初始化时跳过某个阶段：

```powershell
.\scripts\bootstrap.ps1 -SkipInstall -SkipBuild
```

模型凭据、会话、日志和本地 DSH profile 不会进入 Git；它们保存在 `.runtime/`。因此复刻的是代码、依赖和插件组合，模型凭据需要在每台电脑上单独配置。

## 仓库结构

```text
dsh_study/
├── source/
│   └── deepseek-harness/       # 指向个人 Fork 的 submodule，父仓库锁定精确提交
├── plugins/
│   └── hello-plugin/           # 可复制的本地插件 bundle 示例
├── experiments/                # 临时验证和一次性原型
├── learning/                   # 学习资料
├── config/
│   └── plugins.json            # 本地插件启用清单
├── scripts/
│   ├── bootstrap.ps1           # 新电脑初始化
│   ├── verify-environment.ps1  # 只读环境验收
│   ├── update-upstream.ps1     # 显式更新官方 DSH 版本
│   └── upstream-status.ps1     # 比较当前 DSH 与官方版本
├── start-dsh.cmd/.ps1
└── stop-dsh.cmd/.ps1
```

## 启动与关闭

```powershell
.\start-dsh.ps1
.\stop-dsh.ps1
```

也可以双击 `start-dsh.cmd` 和 `stop-dsh.cmd`。Web UI 默认地址为 `http://127.0.0.1:3080`。

启动脚本会读取 `config/plugins.json`，把所有 `enabled: true` 的本地插件生成到 `.runtime/local-plugins.patch.yml` 后加载。进程记录、日志和隔离的 `DSH_HOME` 都位于 `.runtime/`。

## 开发插件

`plugins/hello-plugin` 是无需编译的最小 bundle。新增插件时在 `plugins/<插件名>/` 下创建目录，并把入口加入 `config/plugins.json`。普通插件优先由本仓库直接跟踪，以保证一次克隆即可取得完整源码；只有确实需要独立发布周期时才把插件拆成另一个 submodule。

DSH 插件通过 `apply(ctx)` 注册能力。相关资料：

- `source/deepseek-harness/docs/user/develop/basic/index.zh.md`
- `source/deepseek-harness/docs/user/develop/basic/publish.zh.md`
- `source/deepseek-harness/docs/architecture.zh.md`
- `source/deepseek-harness/docs/cordis-primer.zh.md`

## 修改 DSH 源码

不要在 detached HEAD 或 `master` 上直接开发。从父仓库钉住的提交创建功能分支：

```powershell
git -C source\deepseek-harness switch -c feature/<功能名>
git -C source\deepseek-harness push -u origin feature/<功能名>
```

远程约定：

```text
dsh_study origin   = https://github.com/chous5645-max/dsh_study.git
DSH origin         = https://github.com/chous5645-max/deepseek-harness.git
DSH upstream       = https://github.com/deepseek-ai/deepseek-harness.git
DSH upstream push  = DISABLED
```

DSH 通用扩展点与插件业务代码应分开提交。可以提交给官方的通用改动放在 DSH Fork；知识库等具体业务继续放在 `plugins/`。

## 同步官方 DSH

更新是显式维护操作，不属于 bootstrap。先保证 DSH 工作树干净，再让 submodule 的本地 `master` 快进到官方版本：

```powershell
git -C source\deepseek-harness switch master
.\scripts\upstream-status.ps1
.\scripts\update-upstream.ps1 -InstallDependencies -Build
.\scripts\verify-environment.ps1 -RequireDependencies -RequireBuild
```

更新后，父仓库会看到 submodule 指针变化。验证通过后提交这个指针：

```powershell
git add source/deepseek-harness
git commit -m "chore: update DeepSeek Harness"
git push origin main
```

如果 DSH 功能分支包含自己的改动，再在该分支执行：

```powershell
git -C source\deepseek-harness rebase upstream/master
git -C source\deepseek-harness push --force-with-lease origin feature/<功能名>
```

共享给多人使用的分支不要改写历史，应改用 `merge upstream/master`。

## 安全与本地状态

- 不提交 `.runtime/`、`.env`、API Key、token 化启动 URL或会话数据。
- `config/*.local.json` 和 `config/secrets*.json` 默认忽略。
- GitHub和Git凭据由每台电脑自己的 Git Credential Manager 保存。
- submodule 在新克隆后处于 detached HEAD 是正常状态，它保证构建使用父仓库锁定的版本。
