Type: grilling
Status: resolved

Part of: [UniPty v1 Wayfinder Map](../map.md)

Blocked by: 02, 04

## Question

基于已核实的运行时事实和核心 I/O 决策，确定 PtyBackend 的最小入口、Backend 选择方式、生命周期模型、能力发现/协商和错误边界，并验证本地 native backend、runtime-native backend 与 backend-wrapper 是否能共用同一契约。

## Confirmed Decisions

### Public semantic ownership

- PtyBackend 不直接构造或返回 public `Pty`。
- PtyBackend 只向 UniPty Core 提供 Core-private Backend Endpoint。
- public Terminal Stream、Bootstrap Output Buffer、表示转换、背压、公共错误与 lifecycle 状态机只由 Core 兑现一次。
- Backend conformance 必须通过 Core 产生的 public `Pty` 验收，不能把私有 endpoint 变成第二条 acceptance seam。

### Endpoint output source

- 每个 Backend Endpoint 只暴露一个有序的 Core-private 输出源：
  `ReadableStream<NativeChunk>`。
- `NativeChunk` 显式标记为 native `bytes`、native `text`，或携带同一
  ordered fragment 的两种表示。Core 不从 JavaScript value 的 runtime type
  推断 native fidelity，也不把 Core 重新编码的 text 提升为 native bytes。
- Core 是该输出源的唯一 reader，拥有 Bootstrap Output Buffer、表示选择与
  转换、public Terminal Stream 和 public backpressure。public stream cancel
  只脱离 public view；Core 继续 drain 或 discard 私有源，直到显式 PTY teardown。
- Endpoint 输出源只是私有实现输入，不形成第二个 conformance seam 或
  consumer-facing stream API。

### Endpoint process observation

- Endpoint 提供一次性但可重复 await 的进程观察：
  `readonly exited: Promise<BackendExitResult>`。
- `BackendExitResult` 的最小公共形态为：
  `{ exitCode: number | null; signal: string | null }`。
- `signal` 只描述已经发生的退出原因；它不是 `kill(signal)` 的公共词汇，
  也不要求所有 Backend 接受同一组 signal control。
- Core 可以把同一个 settled result 暴露给多个 public observers；Backend
  不需要为每个 observer 管理 callback/listener。
- `exited` 只观察 child process completion，不代表 Terminal transport EOF，
  不被 public stream cancellation 取消，也不会因为 `close()` 而失效。

### Endpoint input control

- Endpoint 输入只提供同步方法，不建立第二套 WritableStream 协议：

  ```ts
  write(input: NativeInput): boolean;
  drain(): Promise<void>;
  ```

- `NativeInput` 显式选择 native `bytes` 或 native `text`。Core 根据 public
  `string | Uint8Array`、Backend 的实际接受能力和 `writeDecode` policy 选择
  表示；Core 不把 byte input 静默解码成 text。
- `write()` 的 `boolean` 与 typed saturation failure 沿用 public Write
  Readiness、Advisory Backpressure 和 whole-value acceptance 语义。
- Endpoint `drain()` 只等待 Backend Write Readiness 恢复，不承诺 PTY
  transport flush 或 child process consumption。

### Endpoint resize control

- Endpoint resize 与 public API 同构：

  ```ts
  resize(cols: number, rows: number): void;
  ```

- Core 在调用 Endpoint 前统一验证有限正整数的 Character-Cell Size；Backend
  不重复定义 geometry object、pixel dimensions 或另一套参数顺序。
- Backend 执行 resize 请求；能力不足时必须显式报告可映射为
  `unsupported` 的失败，不能静默忽略或伪造成功。

### Endpoint lifecycle control

- Endpoint 生命周期控制与 public API 同构：

  ```ts
  close(): void;
  terminate(): void;
  ```

- 两个操作都必须幂等、同步且非级联：Endpoint `close()` 只释放 PTY
  transport，不请求 child termination；Endpoint `terminate()` 只请求 child
  termination，不关闭 PTY transport。
- Core 在调用 Endpoint `close()` 前先发布 public `closed` 状态；已经建立的
  `exited` Promise 观察继续有效，active stream 按既定 explicit-close 语义
  正常完成。
- Backend 可以自行安排物理 teardown 顺序，但不能改变上述可观察结果。

### Signal capability boundary

- `kill(signal)` 或等价控制不进入 Endpoint 最小接口，也不进入 public
  `Pty` common API。
- Backend 如需提供 signal control，只能通过显式 Backend capability object
  暴露，并自行拥有 signal vocabulary、参数类型和平台语义。
- 未声明或不支持的 signal 必须显式失败并可映射为 `unsupported`，不能静默
  改写成另一种 signal 或 `terminate()`。
- capability object 的发现机制、精确类型参数和 public extension surface
  留到 capability extension 形态决策，不在 common contract 中预设。

### Capability token lookup

- public `Pty` 提供不透明、类型安全的 capability token 查找：

  ```ts
  capability<T>(token: CapabilityToken<T>): T | undefined;
  ```

- 具体 Backend package 负责导出 branded `CapabilityToken<T>` 与对应 capability
  type；Core 不理解 capability payload，也不把 signal-specific method 提升为
  common API。
- 每个 Backend package 为每种 capability 导出一个稳定 singleton token；Core
  按 token object identity 匹配，不使用全局字符串 registry，也不接受可伪造的
  capability name。
- token 返回值只表示该 capability object 可被访问；真正调用仍可能以
  `unsupported` 或 Backend-specific failure 失败，不能把 token 存在性当成
  操作保证或 implicit fallback 条件。
- capability token 只与创建 Backend 的同一个 loaded package instance 兼容；
  重复安装产生的另一份 package copy 拥有不同 singleton token，lookup 返回
  `undefined`。
- Core 不通过 capability name、package name 或其他字符串做兼容 fallback；
  package manager dedupe 与版本布局由应用负责。

### UniPty-level disposal

- configured `UniPty` 提供独立的 Backend 级资源释放入口：

  ```ts
  dispose(): Promise<void>;
  ```

- `dispose()` 调用后立即进入 no-new-spawn 状态；后续 `spawn()` 使用公共
  `closed` resource failure 被拒绝。
- `dispose()` 不隐式调用任何现有 PTY 的 `close()` 或 `terminate()`；已有 PTY
  的 public lifecycle 与 `exited` observation 仍由各自实例负责。
- 首次调用返回一个稳定的 disposal Promise；后续调用复用同一个 Promise。
- live PTY 保持可用，直到调用方通过各自 lifecycle 显式关闭。disposal Promise
  等待全部已有 PTY close，再释放 Backend shared resources 并 resolve。
- `dispose()` 不因存在 live PTY 而 reject；只有 Backend shared resource release
  本身失败时才 reject。
- Backend `dispose()` 在全部既有 PTY close 前不得调用；重复 public disposal
  只复用同一个 Promise，不能重复调用 Backend hook。

### Backend readiness and synchronous spawn

- `UniPty` 是由 ready Backend 与 Core options 构成的配置实例。
- Backend package 的 factory、constructor 或 `.ready()` 可以在注入 Core 前完成 runtime loading、connection、authentication 与 capability negotiation 等一次性异步准备。
- ready Backend 注入后，`unipty.spawn(structuredLaunch)` 必须同步返回 public `Pty`；Core 在内部同步创建 Core-private Backend Endpoint。
- spawn 失败使用同步 typed failure；transport 与 Process Exit Result 仍按既定独立观察语义发生在 spawn 之后。

### Ready Backend core contract

- Core 只识别结构上 ready 的 Backend：

  ```ts
  type ReadyPtyBackend = {
    spawn(launch: StructuredLaunch): BackendEndpoint;
    dispose(): Promise<void>;
  };
  ```

- `createBackend()`、`new Backend(...).ready()` 或其他异步 acquisition API
  属于 Backend package 自己的入口，不进入 UniPty Core interface；Core 不调用
  或等待它们。
- `spawn()` 必须同步返回 Endpoint，或同步抛出 typed launch failure。Endpoint
  返回后，transport、stream 与 Process Exit Result 才进入各自独立观察阶段。
- `dispose()` 是 Backend shared-resource release hook；`UniPty.dispose()` 等待
  所有既有 PTY 自行 close 后调用它一次，并把结果作为 public disposal Promise
  的最终结果。
- Ready Backend 的额外方法、属性和 capability 由 Backend package 自己扩展；
  Core 不要求所有 Backend 实现共同的 class hierarchy。

### Backend selection and factory convention

- Core constructor 直接接收 ready Backend object，不接受 package name、string
  id、registry entry 或 Backend factory：

  ```ts
  const backend = await createXxxBackend(options);
  const unipty = new UniPty({ backend });
  ```

- 官方 Backend package 的主入口统一为
  `createXxxBackend(options): Promise<XxxBackend>`；第三方可以采用其他
  acquisition API，但传给 Core 的必须是 ready object。
- `UniPty` 保留构造参数的具体 Backend 类型并暴露同一个只读引用：

  ```ts
  class UniPty<TBackend extends ReadyPtyBackend> {
    readonly backend: TBackend;
  }
  ```

- `unipty.backend` 用于 Backend-level 的类型安全访问；`pty.capability(token)`
  用于 per-PTY capability，两者不能互相替代。

### Backend instance ownership

- 一个 `UniPty` 实例持有一个 ready Backend，并可通过它同步创建多个相互独立的 PTY。
- 同一 Backend 跨多个 `UniPty` 实例共享不属于 v1 保证；Backend lifecycle 与 Core options 的所有权保持在配置实例内。

### Options ownership

- `UniPty` constructor 只持有 required ready Backend 与 Core-wide options。
- `spawn()` 持有 structured launch 与 initial Character-Cell Size。
- `pty.stream()` 持有 output representation selection。
- Backend factory/`.ready()` 持有 native loading、connection、authentication、queue tuning、persistence 与 remote-host options。
- 这些 scope 不合并成一个 universal options bag。

### Public spawn shape

- public API 采用 `unipty.spawn(argv, options)`。
- `argv` 必须非空；第一项是 executable，其余项是 args。
- 不提供 string command overload，也不通过 shell 解释 argv。
- 初始 PTY 几何位于嵌套的 `terminal: { cols, rows }`，不把 `cols`、`rows` 放在 options 顶层。

### Default terminal geometry

- 未显式提供的每个尺寸按 `terminal` 值、Core 宿主进程环境中的有效 `COLUMNS`/`LINES`、当前 host TTY（运行时能提供可信探针时）、`80 × 24` 的顺序解析。
- `spawn(..., { env })` 是 child process 的启动环境，不会隐式改变 Core 的默认尺寸解析；每次启动需要固定尺寸时使用显式 `terminal`。
- `COLUMNS` 与 `LINES` 独立解析；一维的缺失或非法值不覆盖另一维的有效来源。
- 显式 `terminal` 值非法时返回 `invalid-argument`，不会静默回退。

选择环境优先而不是 TTY 优先：POSIX 把 `COLUMNS`/`LINES` 定义为用户偏好的终端尺寸；Python 3.14 的标准库也按环境变量、终端查询、`80 × 24` 的顺序实现。Node 只提供 `isTTY`、`columns`、`rows` 等事实，不规定另一套公共优先级。UniPty 采用环境优先，同时保持显式 `terminal` 的最高优先级。
