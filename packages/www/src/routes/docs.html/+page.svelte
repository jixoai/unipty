<script lang="ts">
  import { reveal } from '$lib/actions/reveal'
  import CodeBlock from '$lib/components/code-block.svelte'
  import SectionCard from '$lib/components/section-card.svelte'
  import ScaffoldFloat from '$lib/ui/scaffold-float.svelte'
  import Toc, { type TocSection } from '$lib/ui/toc.svelte'

  const coreReadyCode = String.raw`import { UniPty } from "unipty";
import { createNodePtyBackend, NodePtyBackend } from "@unipty/backend-node-pty";

const backend: NodePtyBackend = await createNodePtyBackend();
const unipty = new UniPty({ backend });

unipty.backend === backend; // readonly, concrete type preserved`

  const spawnCode = String.raw`const pty = unipty.spawn(["/bin/sh", "-i", "-l"], {
  terminal: { cols: 120, rows: 40 },
  env: { TERM: "xterm-256color" }, // launch context; never overrides geometry
});`

  const streamCode = String.raw`const text = pty.stream({ encoding: "utf8" }); // ReadableStream<string>
const bytes = pty.stream({ encoding: "bytes" }); // only after the first detaches

const reader = text.getReader();
for (;;) {
  const { done, value } = await reader.read();
  if (done) break;
  render(value);
}`

  const writeCode = String.raw`if (!pty.write("ls -la\r")) {
  await pty.drain(); // readiness recovery, not a physical flush
}`

  const lifecycleCode = String.raw`pty.terminate(); // request only; exit is observed independently
pty.close();     // publishes closed; further write/resize/stream() reject with "closed"
console.log(pty.closed);`

  const exitCodeSample = String.raw`const result = await pty.exited;
console.log(result.exitCode, result.signal); // number | null, string | null`

  const capabilityCode = String.raw`import { signalsCapability } from "@unipty/backend-node-pty";

const signals = pty.capability(signalsCapability.token);
if (signals) signals.kill("SIGHUP"); // Backend vocabulary; explicit, never silent`

  const manualImportCode = String.raw`const { createBunBackend } = await import("@unipty/backend-bun");
const backend = await createBunBackend();
const unipty = new UniPty({ backend });`

  const autoResolveCode = String.raw`import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty", "@unipty/backend-bun"],
  onWarning: (warning) => console.warn(warning.code, warning.message),
});`

  const resolveInspectCode = String.raw`import { resolveUniPtyBackend, inspectUniPtyBackend } from "@unipty/backend";

const report = resolveUniPtyBackend("@unipty/backend-deno-sigma__pty-ffi", {
  from: import.meta.url,
});
if (report.status === "resolved") {
  const inspection = await inspectUniPtyBackend(report);
  if (inspection.status === "compatible") {
    /* metadata-compatible with this Core; still no native initialization */
  }
}`

  const manifestCliCode = String.raw`pnpm unipty-helper-backend manifest \
  --candidate @unipty/backend-node-pty \
  --candidate @unipty/backend-bun \
  --candidate @unipty/backend-deno-sigma__pty-ffi \
  --out src/unipty-backends.manifest.ts`

  const manifestUseCode = String.raw`import backendManifest from "./unipty-backends.manifest";

const backend = await autoResolveUniPtyBackend({
  manifest: backendManifest,
  candidates: ["@unipty/backend-node-pty"],
});`

  const metadataCode = String.raw`{
  "schema": 1,
  "package": { "name": "@unipty/backend-node-pty", "version": "0.1.0" },
  "backend": { "id": "node-pty", "factoryExport": "createNodePtyBackend" },
  "protocol": { "core": [1] },
  "targets": [
    {
      "runtime": "node",
      "os": ["darwin", "linux"],
      "arch": ["arm64", "x64"],
      "libc": ["glibc"]
    }
  ],
  "provenance": { "kind": "adapter", "substrate": "node-pty" }
}`

  // Combo ToC outline (registry component). Ids match the data-region /
  // data-family extents marked in the content below.
  const sections: TocSection[] = [
    {
      id: 'overview',
      label: 'Overview',
      children: [{ id: 'architecture', label: 'Architecture' }],
    },
    {
      id: 'core',
      label: 'Core usage',
      children: [
        { id: 'core-construct', label: 'Construct' },
        { id: 'core-spawn', label: 'Spawn' },
        { id: 'core-stream', label: 'Stream' },
        { id: 'core-write', label: 'Write' },
        { id: 'core-resize', label: 'Resize' },
        { id: 'core-lifecycle', label: 'Lifecycle' },
        { id: 'core-exit', label: 'Exit' },
        { id: 'core-capability', label: 'Capabilities' },
        { id: 'core-dispose', label: 'Dispose' },
      ],
    },
    {
      id: 'acquisition',
      label: 'Backend acquisition',
      children: [
        { id: 'acquisition-manual', label: 'Manual import' },
        { id: 'acquisition-auto', label: 'AutoResolve' },
        { id: 'acquisition-resolve', label: 'Resolve and inspect' },
        { id: 'acquisition-manifest', label: 'Bundled manifest' },
      ],
    },
    { id: 'routes', label: 'Official routes' },
    {
      id: 'metadata',
      label: 'Metadata protocol',
      children: [
        { id: 'metadata-schema', label: 'Schema' },
        { id: 'metadata-targets', label: 'Target tokens' },
      ],
    },
    { id: 'browser-limits', label: 'Browser limits' },
  ]

  const architecture = [
    {
      title: 'Core owns the public surface',
      body: 'Streams, bootstrap buffering, UTF-8 conversion, backpressure, common error codes, and lifecycle state. One UniPty instance owns one ready Backend and may create multiple independent PTYs.',
    },
    {
      title: 'The Endpoint is the seam',
      body: 'Each Backend supplies a Core-private Endpoint: one ordered native chunk source, synchronous write with drain, resize, terminate/close, and a repeatable exited promise — independent of transport EOF.',
    },
    {
      title: 'Backend readiness precedes Core',
      body: 'Factories or .ready() perform one-time runtime loading, connection, and capability negotiation before new UniPty(options). After that, spawn, write, resize, terminate, and close stay synchronous.',
    },
  ]

  const routes = [
    {
      pkg: '@unipty/backend-node-pty',
      runtime: 'Node',
      substrate: 'node-pty via @lydell/node-pty prebuilds',
      notes: 'A third-party native addon with prebuilt binaries. Node has no native PTY API; this route wraps the ecosystem\u2019s standard substrate rather than pretending otherwise.',
    },
    {
      pkg: '@unipty/backend-bun',
      runtime: 'Bun',
      substrate: 'Bun.Terminal',
      notes: 'Bun\u2019s built-in terminal API: Linux/macOS since Bun 1.3.13, Windows via ConPTY since 1.3.14. Support is versioned evidence, not a blanket claim.',
    },
    {
      pkg: '@unipty/backend-deno-sigma__pty-ffi',
      runtime: 'Deno',
      substrate: '@sigma/pty-ffi (Rust portable-pty)',
      notes: 'An npm-only package whose build vendors the @sigma/pty-ffi/noinit JavaScript closure and targeted dynamic libraries. Requires explicit Deno FFI permission; no default download or cache.',
    },
  ]

  const limits = [
    'It never imports or initializes a native Backend in the browser.',
    'It never executes local PTY operations; there is nothing to spawn here.',
    'Its compatibility page is fully pre-rendered at build time from one release catalog artifact — no browser-side evidence recomputation.',
  ]
</script>

<svelte:head>
  <title>Documentation · UniPty</title>
  <meta
    name="description"
    content="UniPty Core usage, Backend acquisition, official routes, the metadata protocol, and browser-local PTY limits."
  />
</svelte:head>

<!-- Combo ToC layout law (registry component): the aside precedes main
     content in the DOM. It rides the scaffold's TOP LAYER: authored here,
     adopted into .jx-top-layer by the float portal — on mobile the glass
     single-row rail pins under the header band (immersive sync by
     construction); on desktop it floats over the right column. The engine
     reads the shell's internal scroll container. -->
<ScaffoldFloat>
  <aside class="docs-aside" aria-label="On this page">
    <Toc {sections} title="on this page" scrollRoot=".jx-shell-body" />
  </aside>
</ScaffoldFloat>

<div class="docs-frame">
  <div class="docs-main">
    <!-- Overview family: page head + architecture cards. -->
    <div class="docs-overview" data-family="overview">
      <div data-reveal="" use:reveal>
        <SectionCard
          id="overview"
          headingLevel={1}
          tone="hero"
          eyebrow="Documentation"
          title="Using UniPty"
          summary="The public contract, how to acquire a Backend, what each official route really is, and what a static documentation site can and cannot do in a browser."
          headerRegion="overview"
        />
      </div>

      <div
        class="grid gap-6 min-[940px]:grid-cols-3"
        id="architecture"
        data-region="architecture"
      >
        {#each architecture as card, index (card.title)}
          <div data-reveal="" use:reveal={{ delay: index * 70, rise: 12 }}>
            <SectionCard eyebrow={`Layer ${index + 1}`} title={card.title}>
              <p class="text-muted-foreground text-pretty text-[13px] leading-6">{card.body}</p>
            </SectionCard>
          </div>
        {/each}
      </div>
    </div>

    <div data-reveal="" use:reveal>
      <SectionCard
        id="core"
        family="core"
        headerRegion="core"
        eyebrow="Core usage"
        title="The public contract"
        summary="Core never loads, names, or resolves a Backend for you. Every operation below is runtime-neutral and identical across Node, Bun, and Deno."
      >
        <div class="flex flex-col gap-7">
          <div class="flex flex-col gap-3" data-region="core-construct">
            <h3 id="core-construct" class="text-[15px] font-bold tracking-tight">Construct with a ready Backend</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              A factory (or .ready()) performs one-time runtime loading first; then Core accepts the
              ready instance. The concrete Backend type is preserved and exposed read-only.
            </p>
            <CodeBlock code={coreReadyCode} lang="ts" meta="construct" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-spawn">
            <h3 id="core-spawn" class="text-[15px] font-bold tracking-tight">Spawn with structured argv</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              The launch entry is unipty.spawn(argv, options): argv is non-empty, its first value is
              the executable, and there is no string-command overload. Core never implicitly invokes a
              shell. Initial geometry lives under terminal: {'{ cols, rows }'} in character cells;
              omitted dimensions resolve independently from the value, COLUMNS/LINES, a trusted host
              TTY probe, then 80 × 24.
            </p>
            <CodeBlock code={spawnCode} lang="ts" meta="spawn" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-stream">
            <h3 id="core-stream" class="text-[15px] font-bold tracking-tight">One stream per PTY</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              stream() selects the representation: Terminal Text (ReadableStream&lt;string&gt;) or
              Terminal Bytes (ReadableStream&lt;Uint8Array&gt;). One active stream per PTY — a second
              call fails with the active-stream code; use caller-owned tee() for fan-out. Cancelling
              the stream detaches that view only: it never closes input and never terminates the child.
              Startup output is preserved in a bounded bootstrap buffer until the first view attaches.
            </p>
            <CodeBlock code={streamCode} lang="ts" meta="stream" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-write">
            <h3 id="core-write" class="text-[15px] font-bold tracking-tight">Write with boolean readiness</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              write() accepts string | Uint8Array and returns a boolean. Either return value means the
              whole value was accepted exactly once; false only means &ldquo;pause and drain&rdquo;.
              Backpressure is advisory, but saturation rejects one whole value with the backpressure
              code — never a partial accept, silent drop, or unbounded queue.
            </p>
            <CodeBlock code={writeCode} lang="ts" meta="write" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-resize">
            <h3 id="core-resize" class="text-[15px] font-bold tracking-tight">Resize</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              resize(cols, rows) takes positive integer character cells only. Pixel dimensions stay
              Backend-specific; a Backend that cannot resize reports unsupported explicitly.
            </p>
            <CodeBlock code="pty.resize(120, 40);" lang="ts" meta="resize" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-lifecycle">
            <h3 id="core-lifecycle" class="text-[15px] font-bold tracking-tight">Terminate and close are non-cascading</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              terminate() is an idempotent synchronous termination request. close() is an idempotent
              synchronous logical close: it publishes closed before returning, invalidates all I/O
              surfaces, and lets an active stream complete normally — but it does not terminate the
              child, and terminate does not close the transport.
            </p>
            <CodeBlock code={lifecycleCode} lang="ts" meta="lifecycle" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-exit">
            <h3 id="core-exit" class="text-[15px] font-bold tracking-tight">Exit is an independent observation</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              exited is a repeatable promise for {'{ exitCode, signal }'}. It is independent of
              transport EOF, stream cancellation, and close: an already-established exit observation
              survives close, and signal records the observed termination cause, not a general
              kill(signal) vocabulary.
            </p>
            <CodeBlock code={exitCodeSample} lang="ts" meta="exit" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-capability">
            <h3 id="core-capability" class="text-[15px] font-bold tracking-tight">Capabilities and error codes</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              Backend extensions ride on opaque capability tokens looked up by object identity — no
              string registry, no fallback. Operational failures carry stable codes: unsupported,
              closed, backpressure, invalid-argument, active-stream.
            </p>
            <CodeBlock code={capabilityCode} lang="ts" meta="capability" />
          </div>

          <div class="flex flex-col gap-3" data-region="core-dispose">
            <h3 id="core-dispose" class="text-[15px] font-bold tracking-tight">Dispose the Backend owner</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              UniPty.dispose() blocks new spawns, keeps existing PTYs caller-owned, waits for them to
              close, then releases shared Backend resources exactly once. Repeated calls reuse one
              promise.
            </p>
            <CodeBlock code="await unipty.dispose();" lang="ts" meta="dispose" />
          </div>
        </div>
      </SectionCard>
    </div>

    <div data-reveal="" use:reveal>
      <SectionCard
        id="acquisition"
        family="acquisition"
        headerRegion="acquisition"
        eyebrow="Backend acquisition"
        title="Three ways to get a ready Backend"
        summary="Manual import is the first-class path and never goes away; AutoResolve conveniences over it; pure resolution and inspection stay effect-free."
      >
        <div class="flex flex-col gap-7">
          <div class="flex flex-col gap-3" data-region="acquisition-manual">
            <h3 id="acquisition-manual" class="text-[15px] font-bold tracking-tight">Manual import — the first-class path</h3>
            <CodeBlock code={manualImportCode} lang="ts" meta="manual" />
          </div>

          <div class="flex flex-col gap-3" data-region="acquisition-auto">
            <h3 id="acquisition-auto" class="text-[15px] font-bold tracking-tight">AutoResolve</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              autoResolveUniPtyBackend analyzes the current runtime, processes your explicit candidates
              first (unavailable candidates emit a structured warning), then falls back to candidates
              inferred from your package.json dependencies. Fallback requires exactly one compatible
              result; several produce ambiguous. The selected candidate&rsquo;s initialization is
              terminal — a failure is reported with the structured backend-initialization code, never
              silently retried with the next Backend.
            </p>
            <CodeBlock code={autoResolveCode} lang="ts" meta="autoresolve" />
          </div>

          <div class="flex flex-col gap-3" data-region="acquisition-resolve">
            <h3 id="acquisition-resolve" class="text-[15px] font-bold tracking-tight">Pure resolution and inspection</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              resolveUniPtyBackend resolves one package location at a time and requires an explicit
              caller from: URL; inspectUniPtyBackend imports only the side-effect-free metadata subpath
              — never the Backend entry module or factory. Neither stage initializes anything.
            </p>
            <CodeBlock code={resolveInspectCode} lang="ts" meta="resolve" />
          </div>

          <div class="flex flex-col gap-3" data-region="acquisition-manifest">
            <h3 id="acquisition-manifest" class="text-[15px] font-bold tracking-tight">Bundled deployments: explicit manifest</h3>
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">
              Bundlers cannot resolve runtime package graphs. Generate an explicit build-time manifest
              with the helper CLI, then let AutoResolve select from it. Generated modules default-export
              one manifest, statically import each package&rsquo;s ./unipty.metadata, and keep Backend
              entry imports inside deferred loaders — evaluating the manifest imports no Backend entry
              and initializes nothing.
            </p>
            <CodeBlock code={manifestCliCode} lang="sh" meta="helper CLI" />
            <CodeBlock code={manifestUseCode} lang="ts" meta="manifest" />
          </div>
        </div>
      </SectionCard>
    </div>

    <div data-reveal="" use:reveal>
      <SectionCard
        id="routes"
        family="routes"
        region="routes"
        eyebrow="Official routes"
        title="Substrates, stated honestly"
        summary="Every official package states its substrate in metadata provenance. None of these declarations is a support claim — only the evidence catalog can say verified."
      >
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Package</th>
                <th>Runtime</th>
                <th>Substrate</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {#each routes as route (route.pkg)}
                <tr>
                  <td><code>{route.pkg}</code></td>
                  <td class="dim">{route.runtime}</td>
                  <td>{route.substrate}</td>
                  <td>{route.notes}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>

    <div data-reveal="" use:reveal>
      <SectionCard
        id="metadata"
        family="metadata"
        headerRegion="metadata"
        eyebrow="Metadata protocol"
        title="./unipty.metadata, side-effect free"
        summary="Every official Backend package exposes a side-effect-free ./unipty.metadata subpath. The minimum schema carries package identity, Backend identity, the factory export name, the Core protocol, and target declarations for side-effect-free prefiltering — and that is all it does."
      >
        <div class="flex flex-col gap-6">
          <div data-region="metadata-schema" id="metadata-schema">
            <CodeBlock code={metadataCode} lang="json" meta="unipty.metadata" />
          </div>
          <div data-region="metadata-targets" id="metadata-targets">
            <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
              Target declarations use normalized Node/npm tokens: os follows process.platform/npm os, arch
              follows process.arch/npm cpu, and libc is an independent, Linux-only axis for native
              evidence. Optional provenance describes the implementation kind and substrate; metadata
              contains no maturity, capability, or verified-support claim.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>

    <div data-reveal="" use:reveal>
      <SectionCard
        id="browser-limits"
        family="browser-limits"
        region="browser-limits"
        eyebrow="Browser limits"
        title="No PTY in a browser tab"
        summary="Browsers expose no pseudo-terminal API, and UniPty does not pretend otherwise. This website is a static documentation surface."
      >
        <ul class="flex flex-col gap-2">
          {#each limits as limit (limit)}
            <li class="flex gap-2.5 text-[13px] leading-6">
              <span class="text-primary select-none" aria-hidden="true">&gt;</span>
              <span class="text-muted-foreground">{limit}</span>
            </li>
          {/each}
        </ul>
        <p class="text-muted-foreground mt-4 max-w-[78ch] text-pretty text-[13px] leading-6">
          Running a terminal for browser clients means hosting a UniPty Backend outside the browser and
          streaming over a transport — an arrangement v1 deliberately leaves to Backend owners rather
          than Core.
        </p>
      </SectionCard>
    </div>
  </div>
</div>

<style>
  /* Combo ToC page grid (registry toc.css law) adapted to the float portal:
   * the aside is adopted into .jx-top-layer, so on mobile it pins below the
   * header band (glass rail over the scrolling body, riding the immersive
   * slide) and on desktop it floats over the frame's right column. */
  .docs-frame {
    display: block;
    padding-block: 0 1rem;
  }
  .docs-aside {
    position: fixed;
    left: 0;
    right: 0;
    bottom: auto;
    z-index: 30;
  }
  .docs-main {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding-top: 68px;
    padding-inline: 1rem;
  }
  .docs-overview {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* Desktop (>=900px, the toc.css breakpoint): Rule Tracker floating over
   * the right column, aligned to the frame's outer padding edge; DOM order
   * stays aside-first. */
  @media (min-width: 900px) {
    .docs-frame {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 14.5rem;
      column-gap: 2.5rem;
      max-width: 90rem;
      margin-inline: auto;
      padding-block: 2.5rem 1rem;
      padding-inline: 1.5rem;
    }
    .docs-main {
      grid-column: 1;
      grid-row: 1;
      padding-top: 0;
      padding-inline: 0;
    }
    .docs-aside {
      position: absolute;
      top: 96px;
      right: max(1.5rem, calc((100vw - 90rem) / 2 + 1.5rem));
      left: auto;
      width: 14.5rem;
      max-height: calc(100vh - 120px);
      height: auto;
      z-index: auto;
    }
  }
  @media (min-width: 1024px) {
    .docs-frame {
      padding-inline: 2rem;
    }
    .docs-aside {
      right: max(2rem, calc((100vw - 90rem) / 2 + 2rem));
    }
  }
</style>
