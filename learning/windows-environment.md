# Windows 源码开发环境

记录日期：2026-09-05
对应上游版本：`d347e703908d0406b7a7ef80e3a0e594d86b2215`

## 已确认

- Node.js：`v24.18.0`，满足仓库要求的 `^22.19 || >=24`。
- pnpm：仓库通过 Corepack 固定为 `11.7.0`。
- Git：`2.54.0.windows.1`。
- Visual Studio Build Tools：`18.9.2`，已安装 x64/x86 C++ 编译工具。
- `pnpm-lock.yaml` 供应链策略校验通过。
- `fs-ext@2.1.1` 已通过 `node-gyp` 和 MSBuild 成功编译。
- `pnpm install --frozen-lockfile` 已完成。
- `pnpm run build` 已完成，包括 Host、Client 与 Web UI 产物。
- 本地 Web 服务使用项目内 `.runtime/dsh-home` 作为隔离的 `DSH_HOME`。

## 后续重建

同步上游源码后，如需重新安装依赖并全量构建：

```powershell
Set-Location ..\source\deepseek-harness
corepack pnpm install --frozen-lockfile
corepack pnpm run build
```
