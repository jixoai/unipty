// English content dictionary (en, the default locale at `/`).
// Orthogonal intents (maintained 2026-09-06 Asia/Shanghai): extracted
// verbatim from the former route components during the site-i18n-zh change
// so both locales render through the same content-driven page components.
//
// Original request (2026-09-06 Asia/Shanghai): openspec/changes/
// 2026-09-06-site-i18n-zh — prose lives here; artifact data (catalog
// evidence, code samples, package identities) stays in the shared page
// components.
import type { SiteContent } from "$lib/i18n/schema";

export const en: SiteContent = {
  chrome: {
    subtitle: "runtime-neutral PTY contract",
    languageLabel: "Language",
    nav: [
      { href: "/", label: "Overview" },
      { href: "/docs.html", label: "Docs" },
      { href: "/compatibility.html", label: "Compatibility" },
    ],
    tocTitle: "on this page",
    drawerLabel: "site",
    footer: {
      projectTitle: "project",
      githubLabel: "GitHub ↗",
      evidenceTitle: "evidence",
      catalogLabel: "Release catalog (byte-identical copy)",
    },
  },
  home: {
    meta: {
      title: "Runtime-neutral PTY contract · UniPty",
      description:
        "UniPty is the runtime-neutral PTY contract for Node, Bun, and Deno with developer-selectable Backends.",
    },
    hero: {
      eyebrow: "UniPty v1 · PTY platform",
      titleLead: "The runtime-neutral ",
      titleEm: "PTY contract",
      titleTail: " for Node, Bun, and Deno.",
      badges: ["One Core API", "Replaceable Backends", "Evidence-gated support", "MIT"],
      summary:
        "One Core API for pseudo-terminals. Bring your own native substrate — node-pty, zigpty, Bun.Terminal, or @sigma/pty-ffi — through developer-selectable, replaceable Backends. Support claims come only from the release evidence catalog, never from metadata.",
      docsLabel: "Read the docs",
      githubLabel: "GitHub ↗",
      copyLabel: "copy",
    },
    quickStart: {
      eyebrow: "Quick start",
      title: "Acquire a Backend. Spawn a shell.",
      summary:
        "Acquire a ready Backend, hand it to Core, spawn a shell with a structured argv — no string commands, no implicit shell. The same Core contract runs on every official Backend route: swapping routes means swapping the Backend you acquire, nothing else changes.",
      noteLead: "Walk the full contract — streams, backpressure, lifecycle, capabilities — on the",
      noteLink: "documentation page",
      noteTail: ".",
    },
    featuresHeading: "What’s inside",
    features: [
      {
        id: "one-contract",
        title: "One contract, three runtimes",
        body: "Core owns streams, bootstrap buffering, UTF-8 conversion, backpressure, common errors, and lifecycle. Your code stays runtime-neutral across Node, Bun, and Deno.",
      },
      {
        id: "replaceable-backends",
        title: "Backends are replaceable",
        body: "The native substrate — node-pty, zigpty, Bun.Terminal, @sigma/pty-ffi — lives behind a Backend Endpoint seam. Persistent or remote hosts arrive as Backends, not a second plugin lifecycle.",
      },
      {
        id: "honest-backpressure",
        title: "Streams with honest backpressure",
        body: "write() returns boolean readiness, drain() waits for recovery, and queues stay bounded. Saturation rejects one whole value with a typed failure — never a partial accept, silent drop, or unbounded queue.",
      },
      {
        id: "evidence-not-promises",
        title: "Evidence, not promises",
        body: "Metadata declares targets; it never claims support. Only a full-suite conformance pass against an installed package on an exact runtime/platform tuple becomes verified in the release catalog.",
      },
    ],
    routes: {
      eyebrow: "Official routes",
      title: "Every package states its substrate honestly",
      summary:
        "Official Backend packages use the uniform @unipty/backend-* namespace; provenance describes the implementation kind and substrate, and none of these declarations is a support claim.",
      headers: ["Package", "Runtime", "Substrate", "Notes"],
      rows: [
        {
          pkg: "@unipty/backend-node-pty",
          runtime: "Node",
          substrate: "node-pty (via @lydell/node-pty prebuilds)",
          notes:
            "A third-party native addon with prebuilt binaries. Node has no native PTY API; this route wraps the ecosystem standard substrate honestly.",
        },
        {
          pkg: "@unipty/backend-zigpty",
          runtime: "Node",
          substrate: "zigpty (Zig-built NAPI prebuilds)",
          notes:
            "A second Node route over the Zig-implemented substrate: prebuilds for eight tuples bundled in the tarball, zero install scripts, and a hard native gate that never falls back to a pipe pseudo-PTY.",
        },
        {
          pkg: "@unipty/backend-bun",
          runtime: "Bun",
          substrate: "Bun.Terminal",
          notes:
            "Bun’s built-in terminal API: Linux/macOS since Bun 1.3.13, Windows via ConPTY since 1.3.14. Support is versioned evidence, not a blanket claim.",
        },
        {
          pkg: "@unipty/backend-deno-sigma__pty-ffi",
          runtime: "Deno",
          substrate: "@sigma/pty-ffi (Rust portable-pty)",
          notes:
            "An npm-only package whose build vendors the @sigma/pty-ffi/noinit closure and targeted dynamic libraries. Requires explicit Deno FFI permission.",
        },
      ],
      ctaLead: "Which tuples are actually verified for the current release? See the",
      ctaLink: "compatibility catalog",
      ctaTail: ".",
    },
  },
  docs: {
    meta: {
      title: "Documentation · UniPty",
      description:
        "UniPty Core usage, Backend acquisition, official routes, the metadata protocol, and browser-local PTY limits.",
    },
    overview: {
      eyebrow: "Documentation",
      title: "Using UniPty",
      summary:
        "The public contract, how to acquire a Backend, what each official route really is, and what a static documentation site can and cannot do in a browser.",
    },
    architecture: [
      {
        title: "Core owns the public surface",
        body: "Streams, bootstrap buffering, UTF-8 conversion, backpressure, common error codes, and lifecycle state. One UniPty instance owns one ready Backend and may create multiple independent PTYs.",
      },
      {
        title: "The Endpoint is the seam",
        body: "Each Backend supplies a Core-private Endpoint: one ordered native chunk source, synchronous write with drain, resize, terminate/close, and a repeatable exited promise — independent of transport EOF.",
      },
      {
        title: "Backend readiness precedes Core",
        body: "Factories or .ready() perform one-time runtime loading, connection, and capability negotiation before new UniPty(options). After that, spawn, write, resize, terminate, and close stay synchronous.",
      },
    ],
    install: {
      eyebrow: "Install",
      title: "Core plus the engine you choose",
      summary:
        "The Backend package you install is the engine you get. Not sure which one? The capability matrix under the route table tells you exactly what each engine provides.",
      headers: ["Runtime", "Install", "Engine"],
      rows: [
        {
          runtime: "Node",
          command: "npm install unipty @unipty/backend-node-pty",
          engine: "third-party node-pty prebuilds",
        },
        {
          runtime: "Node",
          command: "npm install unipty @unipty/backend-zigpty",
          engine: "third-party zigpty (Zig-built, zero-dependency)",
        },
        {
          runtime: "Bun",
          command: "bun add unipty @unipty/backend-bun",
          engine: "runtime-native Bun.Terminal",
        },
        {
          runtime: "Deno",
          command: 'import via "npm:@unipty/backend-deno-sigma__pty-ffi"',
          engine: "vendored @sigma/pty-ffi dynamic libraries",
        },
      ],
      swapLead:
        "Swapping engines is a one-line change — acquire a different Backend and everything else stays identical:",
      swapTail:
        "Engine-specific options (encoding, writeDecode, queue tuning, FFI permissions) and behavioral limits live in each package's README, linked from the route table below.",
    },
    core: {
      eyebrow: "Core usage",
      title: "The public contract",
      summary:
        "Core never loads, names, or resolves a Backend for you. Every operation below is runtime-neutral and identical across Node, Bun, and Deno.",
      sections: [
        {
          id: "core-construct",
          title: "Construct with a ready Backend",
          body: "A factory (or .ready()) performs one-time runtime loading first; then Core accepts the ready instance. The concrete Backend type is preserved and exposed read-only.",
        },
        {
          id: "core-spawn",
          title: "Spawn with structured argv",
          body: "The launch entry is unipty.spawn(argv, options): argv is non-empty, its first value is the executable, and there is no string-command overload. Core never implicitly invokes a shell. Initial geometry lives under terminal: { cols, rows } in character cells; omitted dimensions resolve independently from the value, COLUMNS/LINES, a trusted host TTY probe, then 80 × 24.",
        },
        {
          id: "core-stream",
          title: "One stream per PTY",
          body: "stream() selects the representation: Terminal Text (ReadableStream<string>) or Terminal Bytes (ReadableStream<Uint8Array>). One active stream per PTY — a second call fails with the active-stream code; use caller-owned tee() for fan-out. Cancelling the stream detaches that view only: it never closes input and never terminates the child. Startup output is preserved in a bounded bootstrap buffer until the first view attaches.",
        },
        {
          id: "core-write",
          title: "Write with boolean readiness",
          body: "write() accepts string | Uint8Array and returns a boolean. Either return value means the whole value was accepted exactly once; false only means “pause and drain”. Backpressure is advisory, but saturation rejects one whole value with the backpressure code — never a partial accept, silent drop, or unbounded queue.",
        },
        {
          id: "core-resize",
          title: "Resize",
          body: "resize(cols, rows) takes positive integer character cells only. Pixel dimensions stay Backend-specific; a Backend that cannot resize reports unsupported explicitly.",
        },
        {
          id: "core-lifecycle",
          title: "Terminate and close are non-cascading",
          body: "terminate() is an idempotent synchronous termination request. close() is an idempotent synchronous logical close: it publishes closed before returning, invalidates all I/O surfaces, and lets an active stream complete normally — but it does not terminate the child, and terminate does not close the transport.",
        },
        {
          id: "core-exit",
          title: "Exit is an independent observation",
          body: "exited is a repeatable promise for { exitCode, signal }. It is independent of transport EOF, stream cancellation, and close: an already-established exit observation survives close, and signal records the observed termination cause, not a general kill(signal) vocabulary. Exec failures surface as an exit observation (never a spawn exception) on every route; signalled deaths keep the engine's own shape — see the capability matrix for what each route reports.",
        },
        {
          id: "core-capability",
          title: "Capabilities and error codes",
          body: "Backend extensions ride on opaque capability tokens looked up by object identity — no string registry, no fallback. Operational failures carry stable codes: unsupported, closed, backpressure, invalid-argument, active-stream.",
        },
        {
          id: "core-dispose",
          title: "Dispose the Backend owner",
          body: "UniPty.dispose() blocks new spawns, keeps existing PTYs caller-owned, waits for them to close, then releases shared Backend resources exactly once. Repeated calls reuse one promise.",
        },
      ],
    },
    acquisition: {
      eyebrow: "Backend acquisition",
      title: "Acquiring a ready Backend",
      summary:
        "Manual import is the first-class path and never goes away; AutoResolve conveniences over it; pure resolution and inspection stay effect-free.",
      sections: [
        {
          id: "acquisition-manual",
          title: "Manual import — the first-class path",
        },
        {
          id: "acquisition-auto",
          title: "AutoResolve",
          body: "autoResolveUniPtyBackend analyzes the current runtime, processes your explicit candidates first (unavailable candidates emit a structured warning), then falls back to candidates inferred from your package.json dependencies. Fallback requires exactly one compatible result; several produce ambiguous. The selected candidate’s initialization is terminal — a failure is reported with the structured backend-initialization code, never silently retried with the next Backend.",
        },
        {
          id: "acquisition-resolve",
          title: "Pure resolution and inspection",
          body: "resolveUniPtyBackend resolves one package location at a time and requires an explicit caller from: URL; inspectUniPtyBackend imports only the side-effect-free metadata subpath — never the Backend entry module or factory. Neither stage initializes anything.",
        },
        {
          id: "acquisition-manifest",
          title: "Bundled deployments: explicit manifest",
          body: "Bundlers cannot resolve runtime package graphs. Generate an explicit build-time manifest with the helper CLI, then let AutoResolve select from it. Generated modules default-export one manifest, statically import each package’s ./unipty.metadata, and keep Backend entry imports inside deferred loaders — evaluating the manifest imports no Backend entry and initializes nothing.",
        },
      ],
    },
    routes: {
      eyebrow: "Official routes",
      title: "Substrates, stated honestly",
      summary:
        "Every official package states its substrate in metadata provenance. None of these declarations is a support claim — only the evidence catalog can say verified.",
      headers: ["Package", "Runtime", "Substrate", "Notes"],
      rows: [
        {
          pkg: "@unipty/backend-node-pty",
          runtime: "Node",
          substrate: "node-pty via @lydell/node-pty prebuilds",
          notes:
            "A third-party native addon with prebuilt binaries. Node has no native PTY API; this route wraps the ecosystem’s standard substrate rather than pretending otherwise.",
        },
        {
          pkg: "@unipty/backend-zigpty",
          runtime: "Node",
          substrate: "zigpty (Zig-built NAPI prebuilds)",
          notes:
            "A second Node route over the Zig-implemented substrate. Writes are text-native (bytes need the writeDecode option) and readiness fails closed with the typed unsupported error on tuples without a prebuild, instead of silently degrading to a pipe.",
        },
        {
          pkg: "@unipty/backend-bun",
          runtime: "Bun",
          substrate: "Bun.Terminal",
          notes:
            "Bun’s built-in terminal API: Linux/macOS since Bun 1.3.13, Windows via ConPTY since 1.3.14. Support is versioned evidence, not a blanket claim.",
        },
        {
          pkg: "@unipty/backend-deno-sigma__pty-ffi",
          runtime: "Deno",
          substrate: "@sigma/pty-ffi (Rust portable-pty)",
          notes:
            "An npm-only package whose build vendors the @sigma/pty-ffi/noinit JavaScript closure and targeted dynamic libraries. Run Deno with -A or --allow-ffi --allow-read --allow-run (terminate() discovers the child pid via pgrep); no default download or cache.",
        },
      ],
      capabilities: {
        title: "Capability differences (what the engines actually give you)",
        summary:
          "The public contract is identical on every route; the engines underneath are not. ✓ works out of the box, ⚠ needs an option or carries a documented limitation, ✗ not provided.",
        headers: ["Capability", "node-pty", "zigpty", "bun", "deno-ffi", "Notes"],
        rows: [
          {
            capability: "Byte writes pty.write(Uint8Array)",
            nodePty: "✓",
            zigpty: "⚠ writeDecode option",
            bun: "✓",
            deno: "✓",
            notes:
              "zigpty's substrate write is string-only; writeDecode: true installs a stateful, split-safe decoder (fatal policies reject the whole value).",
          },
          {
            capability: 'Native text output (encoding "utf8")',
            nodePty: "✓",
            zigpty: "✓",
            bun: "✗",
            deno: "✗",
            notes:
              "bun and deno are byte-native both ways; their utf8 views are decoded incrementally by Core (lossless).",
          },
          {
            capability: "Windows target",
            nodePty: "✓ ConPTY*",
            zigpty: "⚠ runs, buffered†",
            bun: "✓ ≥ 1.3.14*",
            deno: "✗",
            notes:
              "*evidence-gated (see the catalog); †the zigpty engine ships Windows prebuilds and the route runs there, but the substrate's pause()/resume() are no-ops on win32, so output backpressure does not reach the kernel — the route's outputSpool option bounds memory by spilling to disk.",
          },
          {
            capability: "Kernel-level output backpressure",
            nodePty: "✓ socket pause",
            zigpty: "✓ public pause/resume (unix)",
            bun: "✗ none at transport",
            deno: "✗ internal channel",
            notes:
              "node-pty pauses the master socket; zigpty pauses via its public API (inert on Windows, where the adapter's outputSpool is the bound instead); bun documents no transport-level flow control; deno's FFI reader drains into an internal buffer.",
          },
          {
            capability: "Independent transport-EOF signal",
            nodePty: "✓ close event",
            zigpty: "⚠ real + fallback",
            bun: "⚠ callback + fallback",
            deno: "✓ read-loop done",
            notes:
              "zigpty repossesses the master stream at exit (real end/close) with a 50 ms late-chunk-extending fallback; bun's Terminal exit callback is primary, exited-synthesis is the fallback.",
          },
          {
            capability: "Transport read errors surfaced",
            nodePty: "✓ unsupported",
            zigpty: "✗ indistinguishable",
            bun: "✓",
            deno: "✓ unsupported",
            notes:
              "the zigpty substrate swallows stream errors entirely; the other three error the stream so a read failure is never silently presented as clean EOF.",
          },
          {
            capability: "Signalled-death observation",
            nodePty: "signal name",
            zigpty: "signal name, exitCode 0",
            bun: "signal name, exitCode null",
            deno: "exitCode 1, signal null",
            notes:
              "each engine reports a different shape; adapters pass it through verbatim and never fabricate a value the engine did not report.",
          },
          {
            capability: "Substrate distribution",
            nodePty: "platform sub-packages",
            zigpty: "zero-dep in-tarball (8 tuples)",
            bun: "built into the runtime",
            deno: "vendored dynamic libraries",
            notes:
              "deno additionally needs FFI permissions; zigpty ships no install scripts at all; node-pty installs only the current platform's binary.",
          },
        ],
        closing:
          "Exec failures are an exit observation (never a spawn exception) on every route. Per-adapter details and options live in each package's README.",
      },
    },
    metadata: {
      eyebrow: "Metadata protocol",
      title: "./unipty.metadata, side-effect free",
      summary:
        "Every official Backend package exposes a side-effect-free ./unipty.metadata subpath. The minimum schema carries package identity, Backend identity, the factory export name, the Core protocol, and target declarations for side-effect-free prefiltering — and that is all it does.",
      targets:
        "Target declarations use normalized Node/npm tokens: os follows process.platform/npm os, arch follows process.arch/npm cpu, and libc is an independent, Linux-only axis for native evidence. Optional provenance describes the implementation kind and substrate; metadata contains no maturity, capability, or verified-support claim.",
    },
    browserLimits: {
      eyebrow: "Browser limits",
      title: "No PTY in a browser tab",
      summary:
        "Browsers expose no pseudo-terminal API, and UniPty does not pretend otherwise. This website is a static documentation surface.",
      limits: [
        "It never imports or initializes a native Backend in the browser.",
        "It never executes local PTY operations; there is nothing to spawn here.",
        "Its compatibility page is fully pre-rendered at build time from one release catalog artifact — no browser-side evidence recomputation.",
      ],
      closing:
        "Running a terminal for browser clients means hosting a UniPty Backend outside the browser and streaming over a transport — an arrangement v1 deliberately leaves to Backend owners rather than Core.",
    },
    toc: [
      {
        id: "overview",
        label: "Overview",
        children: [{ id: "architecture", label: "Architecture" }],
      },
      {
        id: "install",
        label: "Install",
        children: [{ id: "install-swap", label: "Engine swap" }],
      },
      {
        id: "core",
        label: "Core usage",
        children: [
          { id: "core-construct", label: "Construct" },
          { id: "core-spawn", label: "Spawn" },
          { id: "core-stream", label: "Stream" },
          { id: "core-write", label: "Write" },
          { id: "core-resize", label: "Resize" },
          { id: "core-lifecycle", label: "Lifecycle" },
          { id: "core-exit", label: "Exit" },
          { id: "core-capability", label: "Capabilities" },
          { id: "core-dispose", label: "Dispose" },
        ],
      },
      {
        id: "acquisition",
        label: "Backend acquisition",
        children: [
          { id: "acquisition-manual", label: "Manual import" },
          { id: "acquisition-auto", label: "AutoResolve" },
          { id: "acquisition-resolve", label: "Resolve and inspect" },
          { id: "acquisition-manifest", label: "Bundled manifest" },
        ],
      },
      {
        id: "routes",
        label: "Official routes",
        children: [{ id: "routes-capabilities", label: "Capability differences" }],
      },
      {
        id: "metadata",
        label: "Metadata protocol",
        children: [
          { id: "metadata-schema", label: "Schema" },
          { id: "metadata-targets", label: "Target tokens" },
        ],
      },
      { id: "browser-limits", label: "Browser limits" },
    ],
  },
  compatibility: {
    meta: {
      title: "Compatibility · UniPty",
      description:
        "Verified, declared-unverified, and not-targeted tuples for the current UniPty release, derived from one immutable catalog artifact.",
    },
    hero: {
      eyebrow: "Compatibility",
      title: "Verified tuples for this release",
      summary:
        "Derived at build time from exactly one release catalog artifact — never merged with history, never recomputed in your browser.",
      navLabel: "Route matrices",
    },
    states: {
      eyebrow: "States",
      title: "How to read these states",
      legend: {
        verified:
          "The catalog contains a full public-contract conformance pass for this package version on this exact runtime version and exact os/arch/libc tuple at the listed commit. Nothing less qualifies.",
        "declared-unverified":
          "The package’s metadata declares this tuple as a target, but this catalog holds no exact evidence record for it. It is not a support claim of any strength.",
        "not-targeted":
          "The tuple falls outside every target declaration of the package for this release.",
      },
    },
    release: {
      eyebrow: "Release artifact",
      title: "One immutable input",
      labels: {
        release: "Release",
        commit: "Tested commit",
        verifiedAt: "Latest verification",
        sha256: "Catalog sha256",
        artifact: "Artifact",
      },
      artifactOpen: "(",
      artifactClose: " bytes, copied byte-identical into this site)",
      fallbackGeneratedAt: "no evidence in this catalog",
    },
    table: {
      headers: ["Runtime", "OS", "Arch", "libc", "State", "Evidence (exact records)"],
      noEvidence: "No exact evidence record in this catalog.",
    },
  },
};
