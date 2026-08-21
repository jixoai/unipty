<script lang="ts">
  import { reveal } from '$lib/actions/reveal'
  import CodeBlock from '$lib/components/code-block.svelte'
  import PressButton from '$lib/components/press-button.svelte'
  import SectionCard from '$lib/components/section-card.svelte'
  import TerminalCard from '$lib/ui/terminal-card.svelte'
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

<!-- Hero: open lead type + one-shot terminal typing story. -->
<section class="mx-auto w-full max-w-[90rem] px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:px-8">
  <div
    class="grid gap-10 min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(25rem,31rem)] min-[1100px]:items-end min-[1100px]:gap-14"
  >
    <div class="min-w-0">
      <p
        class="font-nav text-primary text-[11px] uppercase tracking-[0.24em]"
        data-reveal=""
        use:reveal
      >
        UniPty v1 · PTY platform
      </p>
      <h1
        class="mt-4 text-[clamp(2.4rem,5vw,4.4rem)] leading-[1.2] font-bold tracking-[-0.02em] text-balance"
        data-reveal=""
        use:reveal={{ delay: 60, rise: 14 }}
      >
        The runtime-neutral <em class="text-primary not-italic">PTY contract</em> for Node, Bun, and
        Deno.
      </h1>
      <p
        class="text-muted-foreground mt-5 max-w-[62ch] text-pretty text-[15px] leading-6 sm:text-base sm:leading-7"
        data-reveal=""
        use:reveal={{ delay: 120 }}
      >
        One Core API for pseudo-terminals. Bring your own native substrate — node-pty,
        Bun.Terminal, or @sigma/pty-ffi — through developer-selectable, replaceable Backends.
        Support claims come only from the release evidence catalog, never from metadata.
      </p>
      <div
        class="text-muted-foreground font-nav mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.14em]"
        data-reveal=""
        use:reveal={{ delay: 160 }}
      >
        <span>One Core API</span>
        <span>Replaceable Backends</span>
        <span>Evidence-gated support</span>
        <span>MIT</span>
      </div>
      <div class="mt-8 flex flex-wrap gap-3" data-reveal="" use:reveal={{ delay: 200 }}>
        <PressButton variant="primary" href="/docs.html">Read the docs</PressButton>
        <PressButton variant="outline" href={GITHUB_URL}>GitHub ↗</PressButton>
      </div>
    </div>
    <div class="min-w-0" data-reveal="" use:reveal={{ delay: 260, rise: 12 }}>
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
    </div>
  </div>
</section>

<!-- Quick start card. -->
<div class="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8" data-reveal="" use:reveal>
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
    use:reveal
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
        <div
          class="bg-border h-px w-full min-[760px]:col-span-full"
          data-reveal="rule"
          use:reveal
        ></div>
        <div
          class="font-nav text-primary text-[clamp(1.3rem,2.2vw,1.8rem)] leading-none"
          data-reveal=""
          use:reveal={{ delay: 40, rise: 12 }}
        >
          {`0${index + 1}`}
        </div>
        <h3
          class="text-[clamp(1.2rem,2vw,1.55rem)] font-bold tracking-[-0.015em]"
          data-reveal=""
          use:reveal={{ delay: 70, rise: 12 }}
        >
          {feature.title}
        </h3>
        <p
          class="text-muted-foreground max-w-[62ch] text-pretty text-sm leading-6"
          data-reveal=""
          use:reveal={{ delay: 100, rise: 12 }}
        >
          {feature.body}
        </p>
      </article>
    {/each}
  </div>
</section>

<!-- Official routes table. -->
<div
  class="mx-auto w-full max-w-[90rem] px-4 pb-4 pt-8 sm:px-6 lg:px-8"
  data-reveal=""
  use:reveal
>
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
