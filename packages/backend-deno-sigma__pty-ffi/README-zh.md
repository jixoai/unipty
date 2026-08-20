# @unipty/backend-deno-sigma__pty-ffi

[English](./README.md) | 简体中文 · [GitHub](https://github.com/jixoai/unipty) · [文档站点](https://unipty.jixoai.com)

面向 Deno 运行时的官方 UniPty Backend，适配第三方 **`@sigma/pty-ffi`**（Rust
`portable-pty` FFI 封装）。这是一个**自包含的 npm 包**：完整的 JavaScript 闭包与目标动态库内嵌在 `vendor/` 中发布——运行时没有未解析的 `jsr:` 说明符，工厂显式初始化打包的库，不下载、不缓存。

## 必需的 Deno 权限

FFI 库加载需要 `--allow-ffi`，导入 vendored 模块需要 `--allow-read`，`terminate()` 通过一个 `pgrep` 子进程发现子进程 pid（`--allow-run`）再用 `Deno.kill` 发信号。实用授权是 `-A`：

```sh
deno run -A app.ts        # 推荐
# 或最小集：
deno run --allow-ffi --allow-read --allow-run app.ts
```

缺失 FFI 权限时以 `UniPtyError`（code `unsupported`）浮出，消息指明所需旗标（cause 为 `Deno.errors.NotCapable`）。若 terminate 时 pid 发现无法进行（宿主没有 pgrep，或列举歧义），`terminate()` 同样以 `unsupported` 显式失败，绝不折叠进底层的 kill-and-close 原语——本路由上 close 与 terminate 永不级联。

## 使用

```ts
import { UniPty } from "unipty";
import { createDenoSigmaPtyFfiBackend } from "@unipty/backend-deno-sigma__pty-ffi";

const backend = await createDenoSigmaPtyFfiBackend();
const unipty = new UniPty({ backend });
const pty = unipty.spawn(["/bin/sh", "-c", "stty size"], {
  terminal: { cols: 101, rows: 37 },
});
// ... 按 UniPty 契约使用 stream()、write()、resize()、terminate()、close()
```

工厂选项（均可选）：

- `libraryPath?: string | URL` — 显式动态库覆盖（逃生门；`URL` 必须是 `file:`）。默认：当前 Deno 元组对应的 `vendor/lib/<os>-<arch>` 库。
- `queue?: { softBytes?: number; hardBytes?: number }` — 有界写队列策略（默认软 256 KiB / 硬 1 MiB）。
- `pollIntervalMs?: number` — 内部读泵的输出轮询节奏（默认 25 ms；底层读取是非阻塞的）。

## Vendoring 与构建

`vendor/` 由 [`scripts/vendor.sh.ts`](https://github.com/jixoai/unipty/blob/main/packages/backend-deno-sigma__pty-ffi/scripts/vendor.sh.ts) 确定性生成（用 Deno ≥ 2.0 运行）：

- `vendor/js/` — 完整的 `jsr:@sigma/pty-ffi@0.42.0/noinit` 模块图（含 `@denosaurs/plug`、`@std/*`），从本地 Deno 缓存镜像并改写，所有 `jsr:` 说明符变为相对路径。构建门扫描 `vendor/js/` 与 `dist/`，发现残留 `jsr:` 即失败。
- `vendor/lib/<os>-<arch>/` — 来自 `sigmaSd/deno-pty-ffi` GitHub 0.42.0 release 的原生库，按 sha256 锁定：`darwin-arm64`、`darwin-x64`、`linux-arm64`、`linux-x64`、`windows-x64`。
- `vendor/vendor-manifest.json` — 每个 vendored 文件的清单（来源 URL、大小、sha256），以及锁定版本所依据的根 `deno.lock` 哈希。

版本从仓库根 `deno.lock`（只读）锁定：解析出的 JSR 图或 lock 漂移时，vendoring 直接失败而不是猜测。

```sh
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi build:vendor  # 完整 vendoring
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi build        # ensure vendor -> tsdown -> jsr-free 检查
corepack pnpm --filter @unipty/backend-deno-sigma__pty-ffi test         # deno test -A --no-check test/
```

CI 先跑一次默认 vendoring（可能下载五个 release 库）；包的 `build` 脚本使用 `--ensure`，完好的 `vendor/` 不会被重新拉取，然后重建并重跑 jsr-free 扫描。要新增元组：把 release 资产（含 sha256）加进 `scripts/vendor.sh.ts` 的 `NATIVE_ASSETS`，并加进工厂的 `VENDORED_LIBRARIES` 映射。

## 底层真相（依赖生命周期行为前必读）

本适配器如实映射底层，而非掩盖：

- **`pty_close` 是“杀掉并丢弃”的一体原语——适配器因此在安全前绝不使用它。** 底层唯一的拆除原语会先杀子进程（portable-pty `ChildKiller`；Unix 上 SIGKILL）再丢弃传输。因此 Endpoint 的 `close()` 是逻辑关闭：物理 `pty_close` 被推迟到子进程退出（或传输出错）之后——那时它已不可能杀掉存活子进程；一个丢弃模式的退出观察器持续排空，使独立的退出观察保持可结算。Endpoint 的 `terminate()` 绝不对存活子进程调用 `pty_close`：子进程 pid（因底层不暴露，通过对同步 spawn 前后本进程直接子进程列表做差集发现）以 `SIGTERM` 发信号，存活的传输观测真实退出。pid 发现无法进行——或除“子进程已不在”之外的任何信号投递失败——时，`terminate()` 以 `unsupported` 显式失败；它绝不折叠进 `pty_close`。
- **退出观察基于读取。** 退出码只能通过报告完成的读取观测。pid 终止的退出被正常观测；读取失败则结果不可观测，记为 `{ exitCode: null, signal: null }`。已建立的观察在 close 之后存活且可重复返回。
- **信号不可区分。** 底层对信号致死的子进程统一报告退出码 `1`（SIGKILL 与 SIGTERM 相同），因此本路由的 `signal` 恒为 `null`；本 Backend 绝不伪造信号名。
- **输入保真。** 底层写路径基于 String/CString：含 NUL 字节的输入以 `invalid-argument` 拒绝（底层会静默截断）；字节输入必须是严格 UTF-8 才能忠实往返。公共 `string` 输入会被 UTF-8 编码。
- **写入就绪是代理式的。** 底层写通道没有完成信号，因此有界队列是一个窗口：越过 `softBytes` 报告 `false`（暂停并 `drain()`），超过 `hardBytes` 以 `backpressure` 拒绝整个值，`drain()` 在一个事件循环回合后释放窗口（底层写线程排空得很快）。`drain()` 不是物理冲刷。
- **输出没有背压。** 底层读线程总是把 PTY 主侧排空到自身无界的内部通道，停滞的消费者无法向子进程传导压力；Endpoint 的泵因此始终排空以保持该通道简短，并独立于消费节奏保留退出观测。
- **库生命周期。** dlopen 的 FFI 库在 Deno 进程退出前保持加载；`dispose()` 是逻辑性的——阻止新 spawn，除此之外没有共享资源可释放。

## 部署说明

在宿主打包时保持本包**外部且可解析**，使 `vendor/` 资产树保持相邻。打包或迁移产物模块会分离库与闭包；没有通用的 UniPty 资产协议，也没有 `./unipty.build` 子路径——部署物化归本包与宿主部署所有。

## 测试

```sh
cd packages/backend-deno-sigma__pty-ffi && deno test -A --no-check test/   # 27 个真实 FFI PTY 场景（离线，针对 vendored 资产）
```
