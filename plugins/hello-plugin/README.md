# Local Hello Plugin

这是一个最小的 DeepSeek Harness bundle 示例。它通过 `cordis.patch.yml` 注册 `index.js` 中的插件。

从 `source/deepseek-harness` 执行：

```powershell
pnpm dsh plugin --profile dev add ..\..\plugins\hello-plugin
pnpm dsh --profile dev --dump-config
pnpm dsh --profile dev
```

看到 `[local-hello-plugin] plugin loaded` 表示加载成功。
