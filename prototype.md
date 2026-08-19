USER:

我现在要实现一个叫做 unipty 的项目，我想把 deno/node/bun 对于 PTY 的接口统一，node 这方面社区已经相对固定了，bun 则是有官方的方案，我想问 deno 这边怎么处理？目前我只找到@sigma/pty-ffi，deno 是不是也支持 node 的 @lydell/node-pty 这个包？

-----

ChatGPT:

如果你是要做一个 **`unipty`（统一 PTY 抽象层）**，我的建议是：

> **不要把 Deno 当成“第三个拥有独立 PTY 实现的运行时”。**
>
> 把它当成“一个能够运行 Node PTY 生态的运行时”会更合理。

先说结论：

| 运行时  | 官方 PTY | 社区事实标准                  | 建议     |
| ---- | ------ | ----------------------- | ------ |
| Node | ❌      | `node-pty`              | ✅ 直接适配 |
| Bun  | ✅      | `Bun.spawn({pty:true})` | ✅ 直接适配 |
| Deno | ❌      | `@sigma/pty-ffi`        | ⚠️ 不建议 |

---

### 第一个问题：Deno 能运行 `@lydell/node-pty` 吗？

**理论上可以，但需要满足几个条件。**

`node-pty` 不是纯 JavaScript 包。

它依赖：

* Node-API（N-API）
* 原生二进制扩展
* `node_modules`
* 预编译的 `.node` 文件

而 Deno 2 已经支持 Node-API。官方明确说明：

> 使用 Node-API 的 npm 包是受支持的，但需要本地 `node_modules` 和 `--allow-ffi`。([Deno][1])

因此，至少在架构层面，它不是被禁止的。

---

### 需要这样配置：

`deno.json`

```json
{
  "nodeModulesDir": "auto"
}
```

官方文档：

* `nodeModulesDir: "auto"`
* `nodeModulesDir: "manual"`

都是支持原生扩展的推荐方案。([Deno][2])

---

然后：

```bash
deno add npm:@lydell/node-pty
```

或者：

```bash
npm install @lydell/node-pty
```

运行：

```bash
deno run -A --allow-ffi main.ts
```

---

但是，我并不建议你把它作为 `unipty` 的默认实现。

原因有两个。

---

### 1. `node-pty` 并不是一个标准

它本质上是：

```text
chjj/pty.js
        ↓
microsoft/node-pty
        ↓
@lydell/node-pty
```

`@lydell/node-pty` 只是对 `microsoft/node-pty` 的重新打包。([Npm][3])

---

### 2. Deno 对 Node 原生扩展的兼容并不是 100%

官方自己也承认：

> 大多数 Node-API 扩展可以工作，但并不能保证所有 npm 包都能正常运行。([Deno][1])

PTY 又属于最复杂的原生模块之一。

涉及：

* `forkpty()`
* `openpty()`
* `ioctl()`
* `SIGWINCH`
* `termios`
* ConPTY（Windows）

所以：

```text
Node
 ↓
node-pty
 ↓
forkpty()
```

能跑，并不代表：

```text
Deno
 ↓
Node compatibility layer
 ↓
node-pty
 ↓
forkpty()
```

就一定稳定。

---

### 我反而更推荐这种架构：

定义一个统一接口：

```ts
interface UniPty {
  write(data: string): void;

  resize(cols: number, rows: number): void;

  kill(signal?: number): void;

  onData(cb: (data: string) => void): void;

  onExit(cb: (code: number) => void): void;
}
```

---

然后做运行时适配：

```text
NodeAdapter
    ↓
node-pty

BunAdapter
    ↓
Bun.spawn({ pty: true })

DenoAdapter
    ↓
node-pty（优先）
    ↓
@sigma/pty-ffi（降级）
```

---

甚至，我会再增加一层：

```text
Node
    ↓
node-pty

Bun
    ↓
Bun.spawn()

Deno
    ↓
ExternalPtyServer
    ↓
Rust（portable-pty）
```

因为 `portable-pty` 几乎已经成了 Rust 生态里的事实标准。

这样：

* Linux → `forkpty`
* macOS → `forkpty`
* Windows → ConPTY

全部交给 Rust。

Deno、Node、Bun 只负责调用。

---

还有一个问题值得研究：

**Bun 的 PTY API 和 `node-pty` 的语义并不完全一致。**

例如：

* 生命周期
* resize
* pause/resume
* UTF-8 编码
* backpressure
* detach/attach

如果 `unipty` 的目标是像 `fetch()` 一样统一三个运行时，那么我建议直接以 **`node-pty` 的 API 作为规范**。

因为：

* VS Code
* xterm.js
* OpenCode
* Claude Code
* Aider

这一整条生态链，几乎都是建立在 `node-pty` 之上的。

这会让你的适配成本低很多。

如果你准备把 `unipty` 发布到 JSR，我甚至可以帮你设计一套 **Node / Bun / Deno 三运行时完全一致的 PTY API 规范**。

[1]: https://docs.deno.com/runtime/fundamentals/node/?utm_source=chatgpt.com "Node and npm Compatibility | Deno Docs"
[2]: https://docs.deno.com/runtime/fundamentals/configuration/?utm_source=chatgpt.com "Config files | Deno Docs"
[3]: https://www.npmjs.com/package/%40lydell/node-pty?activeTab=readme&utm_source=chatgpt.com "@lydell/node-pty - npm"

---

USER:

我打算搞一个 Backend 机制，把底层使用什么 backend 就让开发者自己来选择，后续它们也可以自己开发自己的 backend，所以目前重要的是把目前市面上的技术都调研好

---

ChatGPT:

我觉得你的思路是对的。

**先定义 `Backend` 机制，再去统一 API，而不是先强行统一底层实现。**

因为 PTY 这个领域根本就不存在一个真正意义上的跨运行时标准。

如果是我来做 `unipty`，我会先把目前市面上的方案全部分层，然后再决定抽象边界。

我会把整个生态分成 **5 个层级**：

```text
JS API
 ↓
Runtime Backend
 ↓
Native Binding
 ↓
OS PTY API
 ↓
Terminal Driver
```

---

# 第一层：运行时原生 PTY

## Node

事实标准只有一个：

```text
node-pty
```

核心实现：

```text
forkpty()
openpty()
ConPTY
```

它已经成了整个 AI Agent 生态的基础设施：

* VS Code
* xterm.js
* Hyper
* Theia
* OpenSumi
* Upterm

几乎都建立在 `node-pty` 之上。([GitHub][1])

---

## Bun

Bun 已经内置了 PTY。

```ts
const proc = Bun.spawn(["bash"], {
  terminal: {
    cols: 80,
    rows: 24,
    data(term, data) {
      console.log(data.toString());
    },
  },
});

proc.terminal.write("ls\n");
```

特点：

* 官方支持
* 不依赖第三方库
* 可以复用 `Terminal` 对象
* 支持 `isTTY=true`
* 支持 ANSI
* 支持交互式程序

但目前**仅支持 POSIX（Linux/macOS）**，Windows 还不支持。([Bun][2])

---

## Deno

这是最麻烦的。

官方：

```text
没有 PTY API
```

社区：

```text
@sigma/pty-ffi
```

实现：

```text
Deno
 ↓
FFI
 ↓
Rust
 ↓
portable-pty
 ↓
forkpty()/ConPTY
```

`@sigma/pty-ffi` 实际上是对 Rust `portable-pty` 的封装。([JSR][3])

---

# 第二层：Native Binding

这是你必须调研的一层。

---

## node-pty

```text
JS
 ↓
N-API
 ↓
C++
 ↓
forkpty
```

特点：

* 最成熟
* API 最稳定
* Windows 支持最好

缺点：

* 需要编译
* 依赖 Node-API

([GitHub][1])

---

## portable-pty（Rust）

```text
JS
 ↓
FFI
 ↓
Rust
 ↓
portable-pty
 ↓
forkpty/ConPTY
```

特点：

* Linux/macOS/Windows 统一
* 纯 Rust
* 非常适合做守护进程

缺点：

* JS 生态整合较弱

---

## ConPTY（Windows）

Windows 10 以后的官方 PTY。

```text
CreatePseudoConsole()
```

Node、Rust 基本都依赖它。`winpty` 已经逐渐退出历史舞台。([GitHub][1])

---

# 第三层：OS 差异

这个比运行时差异更重要。

| 功能       | Linux | macOS | Windows |
| -------- | ----- | ----- | ------- |
| forkpty  | ✅     | ✅     | ❌       |
| openpty  | ✅     | ✅     | ❌       |
| ConPTY   | ❌     | ❌     | ✅       |
| SIGWINCH | ✅     | ✅     | ❌       |
| termios  | ✅     | ✅     | ❌       |

很多 API 根本没法统一。

例如：

```ts
pty.resize(cols, rows);
```

Linux：

```c
ioctl(fd, TIOCSWINSZ, ...);
```

Windows：

```c
ResizePseudoConsole(...);
```

底层完全不一样。

---

# 第四层：API 差异

这是我觉得最值得调研的地方。

不要直接把 `spawn()` 作为统一接口。

而是先列出能力矩阵。

| 能力                  | Node | Bun | Deno |
| ------------------- | ---- | --- | ---- |
| spawn               | ✅    | ✅   | ✅    |
| write               | ✅    | ✅   | ✅    |
| read                | ✅    | ✅   | ✅    |
| resize              | ✅    | ✅   | ⚠️   |
| kill                | ✅    | ✅   | ✅    |
| exit event          | ✅    | ✅   | ✅    |
| pause               | ✅    | ❓   | ❓    |
| resume              | ✅    | ❓   | ❓    |
| flow control        | ✅    | ❓   | ❓    |
| terminal reuse      | ❌    | ✅   | ❌    |
| attach existing PTY | ❌    | ❌   | ❌    |

---

# 第五层：真正缺失的能力

我觉得 `unipty` 最有价值的地方，不是 `spawn()`。

而是下面这些高级能力：

```text
create()
attach()
detach()
serialize()
restore()
snapshot()
```

因为现在几乎所有 PTY 库都只解决了：

```text
创建一个 PTY
```

却没有解决：

```text
重新连接一个 PTY
```

而 AI Agent 恰恰最需要：

```text
Claude Code
 ↓
detach
 ↓
退出浏览器
 ↓
重新打开
 ↓
attach
 ↓
恢复终端状态
```

这实际上已经进入了 `tmux` 的领域。

---

如果我是你，我会把 `Backend` 定义成这样：

```ts
interface PtyBackend {
  readonly name: string;

  spawn(options): Promise<Pty>;

  supports(feature: PtyFeature): boolean;
}

enum PtyFeature {
  Resize,
  Detach,
  Attach,
  Pause,
  Resume,
  FlowControl,
  TerminalReuse,
  RawBytes,
}
```

然后：

```text
unipty
 ├── @unipty/node-pty
 ├── @unipty/bun
 ├── @unipty/deno-ffi
 ├── @unipty/rust
 └── @unipty/tmux
```

甚至允许第三方自己实现：

```text
@unipty/herdr
@unipty/wezterm
@unipty/ssh
@unipty/docker
```

这样就不仅是在统一 **Node / Bun / Deno**，而是在统一整个 **PTY Provider 生态**。

这是一个很有意思的方向。

[1]: https://github.com/microsoft/node-pty?utm_source=chatgpt.com "GitHub - microsoft/node-pty: Fork pseudoterminals in Node.JS · GitHub"
[2]: https://bun.com/docs/runtime/child-process?utm_source=chatgpt.com "Spawn - Bun"
[3]: https://jsr.io/%40sigma/pty-ffi?utm_source=chatgpt.com "@sigma/pty-ffi - JSR"
