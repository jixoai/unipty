<!--
  UniPty overview page.
  jixoai-ui 0.3.0 adaptation (2026-09-06): the hand-rolled hero block is
  replaced by the registry hero-section (composition-first — title/badges/
  copy/terminal snippets); PressButton rides the 0.3.0 variant ladder
  (primary → fill); scroll reveal is the theme's pure CSS [data-reveal]
  hooks (the IO action is retired; attributes are static).
-->
<script lang="ts">
  import CodeBlock from '$lib/components/code-block.svelte'
  import HeroSection from '$lib/ui/hero-section/hero-section.svelte'
  import PressButton from '$lib/ui/press-button/press-button.svelte'
  import SectionCard from '$lib/ui/section-card/section-card.svelte'
  import TerminalCard from '$lib/ui/terminal-card/terminal-card.svelte'
  import { GITHUB_URL } from '$lib/constants'

  const quickStart = String.raw`import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";

// 1. Acquire a ready Backend (one-time, asynchronous).
const backend = await createNodePtyBackend();

// 2. Core accepts only a structurally ready Backend.
const unipty = new UniPty({ backend });

// 3. Spawn: argv is non-empty, argv[0] is the executable.
const pty = unipty.spawn(["/bin/sh", "-i"], {
  terminal: { cols: 80, rows: 24 },
});

// 4. Consume Terminal Text (or Terminal Bytes with "bytes").
for await (const chunk of pty.stream({ encoding: "utf8" })) {
  process.stdout.write(chunk);
}

// 5. Write with boolean readiness; drain when Core says pause.
if (!pty.write("echo hello\r")) {
  await pty.drain();
}

// 6. Observe process exit independently of the stream.
const { exitCode, signal } = await pty.exited;`

  const features = [
    {
      id: 'one-contract',
      title: 'One contract, three runtimes',
      body: 'Core owns streams, bootstrap buffering, UTF-8 conversion, backpressure, common errors, and lifecycle. Your code stays runtime-neutral across Node, Bun, and Deno.',
    },
    {
      id: 'replaceable-backends',
      title: 'Backends are replaceable',
      body: 'The native substrate — node-pty, Bun.Terminal, @sigma/pty-ffi — lives behind a Backend Endpoint seam. Persistent or remote hosts arrive as Backends, not a second plugin lifecycle.',
    },
    {
      id: 'honest-backpressure',
      title: 'Streams with honest backpressure',
      body: 'write() returns boolean readiness, drain() waits for recovery, and queues stay bounded. Saturation rejects one whole value with a typed failure — never a partial accept, silent drop, or unbounded queue.',
    },
    {
      id: 'evidence-not-promises',
      title: 'Evidence, not promises',
      body: 'Metadata declares targets; it never claims support. Only a full-suite conformance pass against an installed package on an exact runtime/platform tuple becomes verified in the release catalog.',
    },
  ]

  const routes = [
    {
      pkg: '@unipty/backend-node-pty',
      runtime: 'Node',
      substrate: 'node-pty (via @lydell/node-pty prebuilds)',
      notes: 'A third-party native addon with prebuilt binaries. Node has no native PTY API; this route wraps the ecosystem standard substrate honestly.',
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
      notes: 'An npm-only package whose build vendors the @sigma/pty-ffi/noinit closure and targeted dynamic libraries. Requires explicit Deno FFI permission.',
    },
  ]
</script>

<svelte:head>
  <title>Runtime-neutral PTY contract · UniPty</title>
  <meta
    name="description"
    content="UniPty is the runtime-neutral PTY contract for Node, Bun, and Deno with developer-selectable Backends."
  />
</svelte:head>

<!-- Hero: registry composition-first hero (title/badges/copy/terminal as
     snippets; the copy snippet replaces the default copy-CTA with the
     docs CTA, secondary carries GitHub). -->
<HeroSection
  eyebrow="UniPty v1 · PTY platform"
  summary="One Core API for pseudo-terminals. Bring your own native substrate — node-pty, Bun.Terminal, or @sigma/pty-ffi — through developer-selectable, replaceable Backends. Support claims come only from the release evidence catalog, never from metadata."
  copyCommand="pnpm add unipty @unipty/backend-node-pty"
  copyLabel="copy"
>
  {#snippet title()}
    The runtime-neutral <em>PTY contract</em> for Node, Bun, and Deno.
  {/snippet}
  {#snippet badges()}
    <span>One Core API</span>
    <span>Replaceable Backends</span>
    <span>Evidence-gated support</span>
    <span>MIT</span>
  {/snippet}
  {#snippet copy()}
    <PressButton variant="fill" href="/docs.html">Read the docs</PressButton>
  {/snippet}
  {#snippet secondary()}
    <PressButton variant="outline" href={GITHUB_URL}>GitHub ↗</PressButton>
  {/snippet}
  {#snippet terminal()}
    <TerminalCard
      barTitle="unipty — /bin/sh -i"
      command="node quick-start.mjs"
      outputs={[
        'backend ready: @unipty/backend-node-pty',
        'spawn: /bin/sh -i · 80x24 cells',
        'stream: utf8 text · bootstrap buffered',
        'exit: code 0 · signal null',
      ]}
    />
  {/snippet}
</HeroSection>

<!-- Quick start card. -->
<div class="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8" data-reveal="">
  <SectionCard
    eyebrow="Quick start"
    title="Acquire a Backend. Spawn a shell."
    summary="Acquire a ready Backend, hand it to Core, spawn a shell with a structured argv — no string commands, no implicit shell. The same Core contract runs on every official Backend route: swapping routes means swapping the Backend you acquire, nothing else changes."
  >
    <CodeBlock code={quickStart} lang="ts" meta="quick-start.mjs" />
    <p class="text-muted-foreground mt-4 text-[13px] leading-5">
      Walk the full contract — streams, backpressure, lifecycle, capabilities — on the
      <a href="/docs.html" class="text-primary underline underline-offset-2">documentation page</a>.
    </p>
  </SectionCard>
</div>

<!-- What's inside: numbered feature rows with rule-draw reveals. -->
<section class="mx-auto w-full max-w-[90rem] px-4 pt-8 sm:px-6 lg:px-8">
  <h2
    class="font-nav flex items-baseline gap-4 text-lg uppercase tracking-[0.3em]"
    data-reveal=""
  >
    What&rsquo;s inside
    <span class="bg-border h-px flex-1" aria-hidden="true"></span>
  </h2>
  <div class="mt-6">
    {#each features as feature, index (feature.id)}
      <article
        id={feature.id}
        class="grid gap-2.5 border-t border-border py-6 min-[760px]:grid-cols-[6.5rem_minmax(0,1fr)_minmax(0,1.15fr)] min-[760px]:items-baseline min-[760px]:gap-10 sm:py-7"
      >
        <div class="bg-border h-px w-full min-[760px]:col-span-full" data-reveal="rule"></div>
        <div
          class="font-nav text-primary text-[clamp(1.3rem,2.2vw,1.8rem)] leading-none"
          data-reveal=""
          style="--reveal-rise: 12px"
        >
          {`0${index + 1}`}
        </div>
        <h3 class="text-[clamp(1.2rem,2vw,1.55rem)] font-bold tracking-[-0.015em]" data-reveal="">
          {feature.title}
        </h3>
        <p
          class="text-muted-foreground max-w-[62ch] text-pretty text-sm leading-6"
          data-reveal=""
        >
          {feature.body}
        </p>
      </article>
    {/each}
  </div>
</section>

<!-- Official routes table. -->
<div class="mx-auto w-full max-w-[90rem] px-4 pb-4 pt-8 sm:px-6 lg:px-8" data-reveal="">
  <SectionCard
    eyebrow="Official routes"
    title="Every package states its substrate honestly"
    summary="Official Backend packages use the uniform @unipty/backend-* namespace; provenance describes the implementation kind and substrate, and none of these declarations is a support claim."
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
    <p class="text-muted-foreground mt-4 text-[13px] leading-5">
      Which tuples are actually verified for the current release? See the
      <a href="/compatibility.html" class="text-primary underline underline-offset-2"
        >compatibility catalog</a
      >.
    </p>
  </SectionCard>
</div>
