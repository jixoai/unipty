# @unipty/backend

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

Backend 获取便利层：以调用方为根的纯解析、无副作用的元数据检查、确定性 AutoResolve，以及显式打包 manifest 构造器。它是便利层——绝不是 Core 的回退机制，也不是第二套插件注册表。

## 分阶段契约

```text
resolveUniPtyBackend(pkg, { from })   → 仅定位；不导入、不输出
inspectUniPtyBackend(resolution)      → 仅元数据导入 + 校验
autoResolveUniPtyBackend(options)     → 选定候选：导入 + 工厂 + 就绪
```

### 纯解析

```ts
import { resolveUniPtyBackend } from "@unipty/backend";

const report = await resolveUniPtyBackend("@unipty/backend-bun", {
  from: import.meta.url, // 调用方持有的基址；必填
});
if (report.status === "resolved") {
  report.packageUrl; // 包入口位置
  report.metadataUrl; // ./unipty.metadata 位置（缺失则后续报 metadata-missing）
}
```

从不导入模块、从不扫描 `node_modules`、从不产生输出。解析走宿主运行时原生解析器（以 `from` 为根的 `node:module` `createRequire`——已在 Node、Bun、Deno 上验证）。

### 仅元数据检查

```ts
import { inspectUniPtyBackend } from "@unipty/backend";

const inspection = await inspectUniPtyBackend(report); // 只接受已解析报告
// → "compatible" | "incompatible" | "metadata-missing" | "metadata-invalid"
```

只导入元数据子路径——绝不导入 Backend 入口、绝不调用工厂。兼容性检查将声明的 `protocol.core` 主版本与 `UNIPTY_CORE_PROTOCOL_MAJOR` 对照，并按运行时/OS/架构预筛目标。

### AutoResolve

```ts
import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty", "@unipty/backend-bun"], // 有序
  from: import.meta.url,
  onWarning: (w) => console.warn(w.code, w.packageName, w.stage),
});
```

- 显式候选按调用方顺序处理（首个兼容者胜出）。不可用的已配置候选发出结构化 `candidate-unavailable` 警告（默认汇：`console.warn`）。
- 无选定结果时，回退候选从消费方 `package.json` 依赖推导——要求恰好一个兼容结果，多个则以 `ambiguous` 拒绝。优先级绝不从依赖或文件系统顺序推断。
- 候选一旦选定，其导入 / 工厂导出 / 工厂调用 / 就绪的失败都会以结构化 `backend-initialization` 错误拒绝，保留包名、阶段、检查报告与 cause——AutoResolve 绝不静默改试下一个 Backend。

### 显式打包 manifest

打包器无法可靠收集任意动态导入，因此打包部署改为静态注册候选：

```ts
import { defineUniPtyBackendManifest, autoResolveUniPtyBackend } from "@unipty/backend";
import metadata0 from "@unipty/backend-node-pty/unipty.metadata";

const manifest = defineUniPtyBackendManifest({
  entries: [
    {
      packageName: "@unipty/backend-node-pty",
      metadata: metadata0,
      load: () => import("@unipty/backend-node-pty"), // 字面量说明符
    },
  ],
});

const backend = await autoResolveUniPtyBackend({
  manifest,
  candidates: ["@unipty/backend-node-pty"],
});
```

校验会拒绝空集、重复、元数据/包不匹配、缺失工厂导出与非可调用 loader——且不触发任何 loader。提供 manifest 时 AutoResolve 完全不做文件系统解析。模块生成请使用 [`@unipty/helper-backend`](https://www.npmjs.com/package/@unipty/helper-backend)。

## 元数据协议（写给 Backend 作者）

官方 Backend 暴露无副作用的 `./unipty.metadata` 子路径，默认导出：

```ts
type UniPtyBackendMetadata = {
  readonly schema: 1;
  readonly package: { readonly name: string; readonly version: string };
  readonly backend: { readonly id: string; readonly factoryExport: string };
  readonly protocol: { readonly core: readonly number[] }; // 如 [1]
  readonly targets: readonly {
    readonly runtime: "node" | "bun" | "deno";
    readonly os?: readonly string[];
    readonly arch?: readonly string[];
    readonly libc?: readonly string[];
  }[];
  readonly provenance?: {
    readonly kind: "runtime-native" | "third-party" | "external-system";
    readonly substrate: string;
  };
};
```

元数据绝不声明成熟度、验证状态、能力、资产或官方身份——那些是发布目录的事实，本校验器会拒绝此类字段。`./unipty.metadata` 是 UniPty 协议，不是通用 npm 发现标准；第三方包可以省略（仍可手动获取，manifest 条目也仍能选择它们）。

## 测试

```sh
pnpm --filter @unipty/backend test   # 覆盖 19 个 fixture 包的 66 个场景
```
