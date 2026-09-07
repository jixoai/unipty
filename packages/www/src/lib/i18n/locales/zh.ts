// Chinese content dictionary (zh mirror at `/zh/`).
// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): zh prose sourced
// from the repository README-zh.md (the canonical Chinese positioning);
// structural parity with en is enforced by the shared SiteContent schema.
//
// Original request (2026-09-06 Asia/Shanghai): openspec/changes/
// 2026-09-06-site-i18n-zh — 所有站点需要至少提供中英两种语言的支持。
// 数据不是散文：catalog 证据字符串、状态名、代码样例、终端输出、包名与
// 底层实现身份串保持英文原样（与 en 字典和 catalog 推导共用），此处只承载
// prose；锚点 id 与 en 一致（语言切换保持当前锚点的前提）。
import type { SiteContent } from "$lib/i18n/schema";

export const zh: SiteContent = {
  chrome: {
    subtitle: "运行时无关的 PTY 契约",
    languageLabel: "切换语言",
    nav: [
      { href: "/", label: "概览" },
      { href: "/docs.html", label: "文档" },
      { href: "/compatibility.html", label: "兼容性" },
    ],
    tocTitle: "本页目录",
    drawerLabel: "站点导航",
    footer: {
      projectTitle: "项目",
      githubLabel: "GitHub ↗",
      evidenceTitle: "证据",
      catalogLabel: "发布目录（逐字节一致副本）",
    },
  },
  home: {
    meta: {
      title: "运行时无关的 PTY 契约 · UniPty",
      description:
        "UniPty 是面向 Node、Bun、Deno 的运行时无关 PTY 契约，Backend 由开发者显式选择。",
    },
    hero: {
      eyebrow: "UniPty v1 · PTY 平台",
      titleLead: "面向 Node、Bun、Deno 的",
      titleEm: "运行时无关 PTY 契约",
      titleTail: "。",
      badges: ["单一 Core API", "可替换 Backend", "证据门控支持", "MIT"],
      summary:
        "用于伪终端的单一 Core API。自带原生底层——node-pty、zigpty、Bun.Terminal 或 @sigma/pty-ffi——经由开发者显式选择、可替换的 Backend 接入。支持声明只来自发布证据目录，绝不来自元数据。",
      docsLabel: "阅读文档",
      githubLabel: "GitHub ↗",
      copyLabel: "复制",
    },
    quickStart: {
      eyebrow: "快速开始",
      title: "获取一个 Backend。启动一个 shell。",
      summary:
        "先获取就绪的 Backend，交给 Core，再用结构化 argv 启动 shell——没有字符串命令，没有隐式 shell。同一套 Core 契约运行在每条官方 Backend 路由上：更换路由只是更换你获取的 Backend，其余一切不变。",
      noteLead: "完整的契约漫游——流、背压、生命周期、能力——请看",
      noteLink: "文档页面",
      noteTail: "。",
    },
    featuresHeading: "内置什么",
    features: [
      {
        id: "one-contract",
        title: "一套契约，三个运行时",
        body: "Core 拥有流、bootstrap 缓冲、UTF-8 转换、背压、公共错误与生命周期。你的代码在 Node、Bun、Deno 之上保持运行时无关。",
      },
      {
        id: "replaceable-backends",
        title: "Backend 可替换",
        body: "原生底层——node-pty、zigpty、Bun.Terminal、@sigma/pty-ffi——藏在 Backend Endpoint 接缝之后。持久化或远程主机以 Backend 的形式到来，而不是第二套插件生命周期。",
      },
      {
        id: "honest-backpressure",
        title: "带诚实背压的流",
        body: "write() 返回布尔就绪，drain() 等待恢复，队列保持有界。饱和时以类型化失败拒绝整个值——绝不部分接受、绝不静默丢弃、绝无无界队列。",
      },
      {
        id: "evidence-not-promises",
        title: "证据，而非承诺",
        body: "元数据只声明目标，绝不宣称支持。只有对已安装包制品在精确运行时/平台元组上的完整一致性通过，才会成为发布目录中的 verified。",
      },
    ],
    routes: {
      eyebrow: "官方路由",
      title: "每个包都如实声明自己的底层实现",
      summary:
        "官方 Backend 包统一使用 @unipty/backend-* 命名空间；provenance 描述实现种类与底层实现，这些声明都不是支持宣称。",
      headers: ["包", "运行时", "底层实现", "说明"],
      rows: [
        {
          pkg: "@unipty/backend-node-pty",
          runtime: "Node",
          substrate: "node-pty (via @lydell/node-pty prebuilds)",
          notes:
            "第三方原生插件，随包附带预构建二进制。Node 没有原生 PTY API；本路由如实封装生态标准底层——绝不宣称适配的是 Node 运行时原生 API。",
        },
        {
          pkg: "@unipty/backend-zigpty",
          runtime: "Node",
          substrate: "zigpty (Zig-built NAPI prebuilds)",
          notes:
            "第二条 Node 路由，底层为 Zig 实现：八个元组的预编译直接随 tarball 分发、零安装脚本，并有硬性原生门禁——绝不回退到管道伪 PTY。",
        },
        {
          pkg: "@unipty/backend-bun",
          runtime: "Bun",
          substrate: "Bun.Terminal",
          notes:
            "Bun 内建终端 API：Linux/macOS 自 Bun 1.3.13 起，Windows 经 ConPTY 自 1.3.14 起。支持是带版本的证据，不是笼统宣称。",
        },
        {
          pkg: "@unipty/backend-deno-sigma__pty-ffi",
          runtime: "Deno",
          substrate: "@sigma/pty-ffi (Rust portable-pty)",
          notes:
            "仅以 npm 发布的包，构建期内嵌 @sigma/pty-ffi/noinit 闭包与目标动态库。需要显式 Deno FFI 权限。",
        },
      ],
      ctaLead: "当前发布实际验证了哪些元组？查看",
      ctaLink: "兼容性目录",
      ctaTail: "。",
    },
  },
  docs: {
    meta: {
      title: "文档 · UniPty",
      description:
        "UniPty Core 用法、Backend 获取、官方路由、元数据协议，以及浏览器本地 PTY 的限制。",
    },
    overview: {
      eyebrow: "文档",
      title: "使用 UniPty",
      summary:
        "公共契约、如何获取 Backend、每条官方路由到底是什么，以及一个静态文档站在浏览器里能做什么、不能做什么。",
    },
    architecture: [
      {
        title: "Core 拥有公共面",
        body: "流、bootstrap 缓冲、UTF-8 转换、背压、公共错误码与生命周期状态。一个 UniPty 实例持有一个就绪 Backend，可以创建多个相互独立的 PTY。",
      },
      {
        title: "Endpoint 是那条接缝",
        body: "每个 Backend 提供一个 Core 私有 Endpoint：单一有序原生分块源、带 drain 的同步写入、resize、terminate/close，以及独立于传输 EOF、可重复 await 的退出观察。",
      },
      {
        title: "Backend 就绪先于 Core",
        body: "工厂或 .ready() 在 new UniPty(options) 之前完成一次性的运行时加载、连接与能力协商。此后 spawn、write、resize、terminate、close 全部保持同步。",
      },
    ],
    core: {
      eyebrow: "Core 用法",
      title: "公共契约",
      summary:
        "Core 绝不替你加载、命名或解析 Backend。以下每个操作都是运行时无关的，在 Node、Bun、Deno 上完全一致。",
      sections: [
        {
          id: "core-construct",
          title: "以就绪 Backend 构造",
          body: "工厂（或 .ready()）先完成一次性运行时加载；随后 Core 接受就绪实例。具体 Backend 类型被保留，并以只读方式暴露。",
        },
        {
          id: "core-spawn",
          title: "以结构化 argv 启动",
          body: "启动入口是 unipty.spawn(argv, options)：argv 非空、首值是可执行文件、没有字符串命令重载。Core 绝不隐式调用 shell。初始几何位于 terminal: { cols, rows }（字符单元格）；省略的维度按值 → COLUMNS/LINES → 可信宿主 TTY 探测 → 80 × 24 独立解析。",
        },
        {
          id: "core-stream",
          title: "每 PTY 一条流",
          body: "stream() 选择表示：Terminal Text（ReadableStream<string>）或 Terminal Bytes（ReadableStream<Uint8Array>）。每 PTY 只有一条活跃流——第二次调用以 active-stream 失败；扇出请用调用方自有的 tee()。取消流只脱离该视图：既不关闭输入，也不终止子进程。启动输出保存在有界 bootstrap 缓冲中，直到第一个视图挂接。",
        },
        {
          id: "core-write",
          title: "以布尔就绪写入",
          body: "write() 接受 string | Uint8Array 并返回布尔。任一返回值都表示整个值被恰好接受一次；false 只是「暂停并 drain」。背压是建议性的，但饱和会以 backpressure 码拒绝整个值——绝不部分接受、绝不静默丢弃、绝无无界队列。",
        },
        {
          id: "core-resize",
          title: "Resize",
          body: "resize(cols, rows) 只接受正整数（字符单元格）。像素维度保持 Backend 专属；不能 resize 的 Backend 会显式报告 unsupported。",
        },
        {
          id: "core-lifecycle",
          title: "terminate 与 close 非级联",
          body: "terminate() 是幂等的同步终止请求。close() 是幂等的同步逻辑关闭：返回前发布 closed、令所有 I/O 面失效、让活跃流正常完成——但它不终止子进程，terminate 也不关闭传输。",
        },
        {
          id: "core-exit",
          title: "退出是独立观察",
          body: "exited 是 { exitCode, signal } 的可重复 promise。它独立于传输 EOF、流取消与 close：已建立的退出观察在 close 之后依然有效；signal 记录观察到的终止原因，不是通用的 kill(signal) 词汇。",
        },
        {
          id: "core-capability",
          title: "能力与错误码",
          body: "Backend 扩展搭在不透明能力 token 之上，按对象身份查找——没有字符串注册表，没有回退。操作失败携带稳定错误码：unsupported、closed、backpressure、invalid-argument、active-stream。",
        },
        {
          id: "core-dispose",
          title: "释放 Backend 持有者",
          body: "UniPty.dispose() 阻止新 spawn，保留既有 PTY 为调用方所有，等待它们关闭，然后恰好一次释放共享 Backend 资源。重复调用复用同一 promise。",
        },
      ],
    },
    acquisition: {
      eyebrow: "Backend 获取",
      title: "获取就绪 Backend 的三种方式",
      summary:
        "手动导入是一等路径且永远不会消失；AutoResolve 是其上的便利层；纯解析与检查保持无副作用。",
      sections: [
        {
          id: "acquisition-manual",
          title: "手动导入——一等路径",
        },
        {
          id: "acquisition-auto",
          title: "AutoResolve",
          body: "autoResolveUniPtyBackend 分析当前运行时，先处理你的显式候选（不可用候选发出结构化警告），再回退到从 package.json 依赖推断的候选。回退要求恰好一个兼容结果；多个则产生 ambiguous。选定候选的初始化是终止性的——失败以结构化 backend-initialization 码报告，绝不静默换下一个 Backend 重试。",
        },
        {
          id: "acquisition-resolve",
          title: "纯解析与检查",
          body: "resolveUniPtyBackend 一次解析一个包位置，并要求显式的调用方 from: URL；inspectUniPtyBackend 只导入无副作用的 metadata 子路径——绝不触碰 Backend 入口模块或工厂。两个阶段都不初始化任何东西。",
        },
        {
          id: "acquisition-manifest",
          title: "打包部署：显式 manifest",
          body: "打包器无法解析运行时包图。用 helper CLI 生成显式构建期 manifest，再让 AutoResolve 从中选择。生成的模块默认导出一个 manifest，静态导入各包的 ./unipty.metadata，并把 Backend 入口 import 留在延迟加载器里——求值 manifest 不导入任何 Backend 入口，也不初始化任何东西。",
        },
      ],
    },
    routes: {
      eyebrow: "官方路由",
      title: "如实声明的底层实现",
      summary:
        "每个官方包都在元数据 provenance 中声明底层实现。这些声明都不是支持宣称——只有证据目录能说 verified。",
      headers: ["包", "运行时", "底层实现", "说明"],
      rows: [
        {
          pkg: "@unipty/backend-node-pty",
          runtime: "Node",
          substrate: "node-pty via @lydell/node-pty prebuilds",
          notes:
            "第三方原生插件，随包附带预构建二进制。Node 没有原生 PTY API；本路由如实封装生态标准底层，而不是假装不然。",
        },
        {
          pkg: "@unipty/backend-zigpty",
          runtime: "Node",
          substrate: "zigpty (Zig-built NAPI prebuilds)",
          notes:
            "第二条 Node 路由，底层为 Zig 实现。写入是文本原生的（字节需要 writeDecode 选项）；无预编译的元组会让就绪以 unsupported 失败，而不是静默降级为管道。",
        },
        {
          pkg: "@unipty/backend-bun",
          runtime: "Bun",
          substrate: "Bun.Terminal",
          notes:
            "Bun 内建终端 API：Linux/macOS 自 Bun 1.3.13 起，Windows 经 ConPTY 自 1.3.14 起。支持是带版本的证据，不是笼统宣称。",
        },
        {
          pkg: "@unipty/backend-deno-sigma__pty-ffi",
          runtime: "Deno",
          substrate: "@sigma/pty-ffi (Rust portable-pty)",
          notes:
            "仅以 npm 发布的包，构建期内嵌 @sigma/pty-ffi/noinit JavaScript 闭包与目标动态库。需要显式 Deno FFI 权限；没有默认下载或缓存。",
        },
      ],
    },
    metadata: {
      eyebrow: "元数据协议",
      title: "./unipty.metadata，无副作用",
      summary:
        "每个官方 Backend 包都暴露无副作用的 ./unipty.metadata 子路径。最小 schema 携带包身份、Backend 身份、工厂导出名、Core 协议，以及用于无副作用预过滤的目标声明——仅此而已。",
      targets:
        "目标声明使用规范化的 Node/npm token：os 跟随 process.platform/npm os，arch 跟随 process.arch/npm cpu，libc 是原生证据独立的、仅 Linux 的轴。可选 provenance 描述实现种类与底层实现；元数据不含成熟度、能力或 verified 支持宣称。",
    },
    browserLimits: {
      eyebrow: "浏览器限制",
      title: "浏览器标签页里没有 PTY",
      summary: "浏览器不暴露任何伪终端 API，UniPty 也不假装如此。本网站是一个静态文档面。",
      limits: [
        "它绝不在浏览器中导入或初始化原生 Backend。",
        "它绝不执行本地 PTY 操作；这里没有任何可 spawn 的东西。",
        "它的兼容性页面在构建期由一个发布目录制品完全预渲染——浏览器端不做任何证据重算。",
      ],
      closing:
        "为浏览器客户端运行终端，意味着在浏览器之外托管一个 UniPty Backend 并经传输流式转发——v1 刻意把这种安排留给 Backend 拥有者，而不是 Core。",
    },
    toc: [
      {
        id: "overview",
        label: "总览",
        children: [{ id: "architecture", label: "架构" }],
      },
      {
        id: "core",
        label: "Core 用法",
        children: [
          { id: "core-construct", label: "构造" },
          { id: "core-spawn", label: "启动" },
          { id: "core-stream", label: "流" },
          { id: "core-write", label: "写入" },
          { id: "core-resize", label: "Resize" },
          { id: "core-lifecycle", label: "生命周期" },
          { id: "core-exit", label: "退出" },
          { id: "core-capability", label: "能力" },
          { id: "core-dispose", label: "释放" },
        ],
      },
      {
        id: "acquisition",
        label: "Backend 获取",
        children: [
          { id: "acquisition-manual", label: "手动导入" },
          { id: "acquisition-auto", label: "AutoResolve" },
          { id: "acquisition-resolve", label: "纯解析与检查" },
          { id: "acquisition-manifest", label: "打包 manifest" },
        ],
      },
      { id: "routes", label: "官方路由" },
      {
        id: "metadata",
        label: "元数据协议",
        children: [
          { id: "metadata-schema", label: "Schema" },
          { id: "metadata-targets", label: "目标 token" },
        ],
      },
      { id: "browser-limits", label: "浏览器限制" },
    ],
  },
  compatibility: {
    meta: {
      title: "兼容性 · UniPty",
      description:
        "当前 UniPty 发布的 verified、declared-unverified 与 not-targeted 元组，由一个不可变目录制品推导。",
    },
    hero: {
      eyebrow: "兼容性",
      title: "本发布的已验证元组",
      summary: "构建期由恰好一个发布目录制品推导——绝不与历史合并，绝不在你的浏览器中重算。",
      navLabel: "路由矩阵",
    },
    states: {
      eyebrow: "状态",
      title: "如何阅读这些状态",
      legend: {
        verified:
          "目录中存在该包版本、在该精确运行时版本、该精确 os/arch/libc 元组、所列提交上的一次完整公共契约一致性通过。少一点都不算。",
        "declared-unverified":
          "包的元数据将该元组声明为目标，但目录中没有它的精确证据记录。这不是任何强度的支持宣称。",
        "not-targeted": "该元组落在本发布该包的所有目标声明之外。",
      },
    },
    release: {
      eyebrow: "发布制品",
      title: "一个不可变输入",
      labels: {
        release: "发布",
        commit: "测试提交",
        verifiedAt: "最近验证",
        sha256: "目录 sha256",
        artifact: "制品",
      },
      artifactOpen: "（",
      artifactClose: " 字节，逐字节一致复制进本站）",
      fallbackGeneratedAt: "本目录中没有证据",
    },
    table: {
      headers: ["运行时", "OS", "架构", "libc", "状态", "证据（精确记录）"],
      noEvidence: "本目录中无精确证据记录。",
    },
  },
};
