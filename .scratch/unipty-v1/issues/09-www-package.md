Type: architecture
Status: resolved

> Orthogonal intents (maintained 2026-08-19 Asia/Shanghai): site ownership;
> static deployment; visual reference; evidence consumption; runtime isolation.
>
> Original request (2026-08-18 Asia/Shanghai): add `packages/www` for
> `unipty.jixoai.com`. Supplemental Owner decision (2026-08-19 Asia/Shanghai):
> deploy to GitHub Pages, Owner manages CNAME, follow the sibling OpenSpecUI
> website's style, and leave concrete website investigation to its implementer.

Part of: [UniPty v1 Wayfinder Map](../map.md)

## Request

新增 `packages/www`，作为 UniPty 官方网站，后续部署到
`unipty.jixoai.com`。本事项记录 v1 的最小站点边界，不把网站反向变成 Core 的产品设计入口。

## Initial boundary

- `packages/www` 是 workspace 内的独立站点应用，默认不作为运行时 Backend 包发布；
- Core、Backend 与 metadata 包不能反向依赖 `packages/www`；
- 网站可以消费公共 API 类型、生成的 API 文档、兼容矩阵和示例，但不能直接把
  Node/Bun/Deno native Backend 打进浏览器主 bundle；
- 浏览器 playground、PTY demo 或诊断能力必须在后续决策中明确是远程服务、浏览器内
  emulator，还是仅提供代码示例；不能暗示浏览器拥有本地 PTY；
- 域名、部署、版本文档、示例代码与发布流水线需要独立于核心包版本语义讨论。

## Confirmed v1 Shape

- `packages/www` 输出静态站点并部署到 GitHub Pages；不引入 SSR、长连接或
  server-side PTY。Core/Backend 发布和站点发布保持互不阻塞。
- 自定义域名仍是 `unipty.jixoai.com`，CNAME 映射由 Owner 配置和维护；仓库只负责产生
  GitHub Pages 可部署的静态产物，不把 DNS ownership 纳入应用运行时。
- 视觉风格直接参考实现开始时 sibling `../openspecui` 项目的官网。该路径只是
  implementation-time reference，不成为 package dependency、git submodule 或构建输入。
  本轮不调查其代码，也不锁定复刻方式；官网开发者在实现时自行读取该项目并确定框架、
  样式系统和 GitHub Pages workflow。
- 公开文档源是仓库内的 Markdown 与手写 API 示例；`.scratch/unipty-v1/` 是规划资料，
  不直接作为站点内容源。API reference 从 public TypeScript declarations 生成。
- 站点构建消费显式 release/tag 对应的 repository-owned compatibility catalog。
  catalog 由 conformance CI 汇总 exact package/runtime/platform/suite/commit evidence
  并随 release 发布；网站验证后原样复制，不合并历史记录、重新判定证据或在浏览器探测
  本机 PTY。
- v1 不提供浏览器内本地 PTY playground，也不提供 resolver 的动态 package import。
  首期只提供代码示例、Backend matrix 和静态 metadata/manifest 示例；后续若增加
  交互式演示，必须明确它是远程 sandbox、浏览器 emulator 或本机 CLI companion。
- 语言固定为英文 canonical API 文档 + 中文翻译层；搜索使用静态索引，不把 analytics
  或第三方 tracking 设为 Core/Backend 前置依赖。
- workspace package 名为 `@unipty/www`，保持 private；部署由独立网站 workflow
  负责，Core/Backend release workflow 不等待站点部署。

## Resolution

站点 ownership、GitHub Pages 部署、CNAME responsibility、OpenSpecUI 视觉参考、内容责任、
兼容矩阵和 playground 边界已收敛。具体框架、样式实现与 Pages workflow 有意留给官网
开发者在实现时调查；这些实现选择不得反向打开 Core 或 Backend 契约。
