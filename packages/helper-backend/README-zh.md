# @unipty/helper-backend

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

构建/开发期辅助工具：从有序的候选输入生成**显式 Backend manifest 模块**。不是运行时依赖——应用绝不会为了生产行为安装它，它只写源码文件。

## 为什么需要它

打包器无法可靠收集任意动态导入。UniPty 的打包部署通过 `defineUniPtyBackendManifest()`（见 [`@unipty/backend`](https://www.npmjs.com/package/@unipty/backend)）静态注册 Backend。本辅助工具生成的正是那个模块——可手写、打包器中立
的 ESM/TypeScript——只基于显式候选，绝不导入 Backend 入口、绝不调用工厂、绝不初始化原生资源。

## CLI

```sh
npx unipty-helper-backend manifest \
  --candidate @unipty/backend-node-pty \
  --candidate @unipty/backend-bun \
  --out src/unipty-backends.ts
```

| 规则                        | 行为                                    |
| --------------------------- | --------------------------------------- |
| `--candidate <pkg>`         | 可重复、必填、保持顺序                  |
| `--out <file>` / `--stdout` | 恰好一种输出模式；互斥                  |
| `--force`                   | 覆盖已存在的 `--out` 文件前必须显式给出 |
| `--from <base>`             | 可选解析基址；默认当前目录（仅 CLI）    |
| 诊断信息                    | 只走标准错误；`--stdout` 只承载生成源码 |

CLI 绝不从 `package.json` 推断候选、不扫描 `node_modules`、不安装包、不导入 Backend 入口模块、不触碰原生/FFI 资源。

## 编程接口

```ts
import { generateUniPtyBackendManifestModule } from "@unipty/helper-backend";

const source = await generateUniPtyBackendManifestModule({
  candidates: ["@unipty/backend-node-pty"], // 非空、有序
  from: import.meta.url, // 必填：URL
});
// `source` 是模块文本；是否写盘由调用方决定。
```

## 生成模块契约

```ts
import metadata0 from "@unipty/backend-node-pty/unipty.metadata";
import { defineUniPtyBackendManifest } from "@unipty/backend";

export default defineUniPtyBackendManifest({
  entries: [
    {
      packageName: "@unipty/backend-node-pty",
      metadata: metadata0,
      load: () => import("@unipty/backend-node-pty"), // 仅字面量说明符
    },
  ],
});
```

- 恰好一个默认导出：校验后的 manifest。
- 静态默认导入每个候选的 `./unipty.metadata`（不内嵌快照——身份始终来自已安装的包）。
- 延迟 loader 使用字面量动态导入说明符，打包器可见；模块求值只加载元数据，绝不执行 loader、工厂或原生初始化。
- 没有字符串拼接的说明符、物理路径或 `node_modules` 遍历——没有本辅助工具也能手写出同样结构。

## 测试

```sh
pnpm --filter @unipty/helper-backend test   # 24 个场景，含黄金输出与 CLI 法则
```
