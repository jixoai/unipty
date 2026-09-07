<!--
  UniPty documentation page body — content-driven (2026-09-06 site-i18n-zh):
  markup lives here once and renders from a locale dictionary; the routes
  inject the dictionary, the locale head, and the toc data (via +page.ts
  load → layout chrome snippet). Code samples are locale-invariant data.
  jixoai-ui 0.3.0 adaptation (2026-09-06): the Combo-ToC float portal and
  the page-owned aside grid are gone — the reading rail renders in the
  scaffold's SSR-stable chrome snippet, and the shell grid reserves the
  rail column (desktop) / toc bar row (mobile). CardGrid owns its
  children's entrance (cards carry no data-reveal).
-->
<script lang="ts">
  import CodeBlock from '$lib/components/code-block.svelte'
  import CardGrid from '$lib/ui/card-grid/card-grid.svelte'
  import SectionCard from '$lib/ui/section-card/section-card.svelte'
  import type { DocsContent } from '$lib/i18n/schema'

  let { content }: { content: DocsContent } = $props()

  // Locale-invariant samples (code is data, not prose).
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

  const capabilityCode = String.raw`import { defineCapabilityToken } from "unipty";

// Capability tokens are Backend-owned singletons; Core matches object
// identity only (no string registry, no name fallback). No official
// Backend ships a token yet — this is the intended shape when one does:
interface SignalsCapability { kill(signal: string): void }
const signalsCapability = defineCapabilityToken<SignalsCapability>();

const signals = pty.capability(signalsCapability);
if (signals) signals.kill("SIGHUP"); // Backend vocabulary; explicit, never silent`

  const manualImportCode = String.raw`const { createBunBackend } = await import("@unipty/backend-bun");
const backend = await createBunBackend();
const unipty = new UniPty({ backend });`

  const autoResolveCode = String.raw`import { autoResolveUniPtyBackend } from "@unipty/backend";

const backend = await autoResolveUniPtyBackend({
  candidates: ["@unipty/backend-node-pty", "@unipty/backend-bun"],
  from: import.meta.url, // caller-rooted base
  onWarning: (warning) => console.warn(warning.code, warning.packageName),
});`

  const resolveInspectCode = String.raw`import { resolveUniPtyBackend, inspectUniPtyBackend } from "@unipty/backend";

const report = await resolveUniPtyBackend("@unipty/backend-deno-sigma__pty-ffi", {
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
  "package": { "name": "@unipty/backend-node-pty", "version": "0.2.0" },
  "backend": { "id": "node-pty", "factoryExport": "createNodePtyBackend" },
  "protocol": { "core": [1] },
  "targets": [{ "runtime": "node" }],
  "provenance": {
    "kind": "third-party",
    "substrate": "node-pty (@lydell/node-pty prebuilt distribution)"
  }
}`

  // Locale-invariant engine-swap sample (code is data, not prose).
  const swapCode = String.raw`import { UniPty } from "unipty";
import { createNodePtyBackend } from "@unipty/backend-node-pty";
import { createZigptyBackend } from "@unipty/backend-zigpty";
import { createBunBackend } from "@unipty/backend-bun";
import { createDenoSigmaPtyFfiBackend } from "@unipty/backend-deno-sigma__pty-ffi";

// Pick the engine by acquiring a different Backend — every line below the
// constructor is identical on all four routes:
const unipty = new UniPty({ backend: await createZigptyBackend() });`

  // Section id → sample (ids are locale-invariant, so one map serves both).
  const codeById: Record<string, { code: string; lang: string; meta: string }[]> = {
    'install-swap': [{ code: swapCode, lang: 'ts', meta: 'engine swap' }],
    'core-construct': [{ code: coreReadyCode, lang: 'ts', meta: 'construct' }],
    'core-spawn': [{ code: spawnCode, lang: 'ts', meta: 'spawn' }],
    'core-stream': [{ code: streamCode, lang: 'ts', meta: 'stream' }],
    'core-write': [{ code: writeCode, lang: 'ts', meta: 'write' }],
    'core-resize': [{ code: 'pty.resize(120, 40);', lang: 'ts', meta: 'resize' }],
    'core-lifecycle': [{ code: lifecycleCode, lang: 'ts', meta: 'lifecycle' }],
    'core-exit': [{ code: exitCodeSample, lang: 'ts', meta: 'exit' }],
    'core-capability': [{ code: capabilityCode, lang: 'ts', meta: 'capability' }],
    'core-dispose': [{ code: 'await unipty.dispose();', lang: 'ts', meta: 'dispose' }],
    'acquisition-manual': [{ code: manualImportCode, lang: 'ts', meta: 'manual' }],
    'acquisition-auto': [{ code: autoResolveCode, lang: 'ts', meta: 'autoresolve' }],
    'acquisition-resolve': [{ code: resolveInspectCode, lang: 'ts', meta: 'resolve' }],
    'acquisition-manifest': [
      { code: manifestCliCode, lang: 'sh', meta: 'helper CLI' },
      { code: manifestUseCode, lang: 'ts', meta: 'manifest' },
    ],
    'metadata-schema': [{ code: metadataCode, lang: 'json', meta: 'unipty.metadata' }],
  }
</script>

<!-- Reading rail: authored in the layout's chrome snippet (SSR-stable) from
     the route's `toc` data; the shell grid reserves the rail column. -->
<div class="docs-overview mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 pb-4 pt-10 sm:px-6 lg:px-8">
  <!-- Overview family: page head + architecture cards. -->
  <div class="flex flex-col gap-6" data-family="overview">
    <div data-reveal="">
      <SectionCard
        id="overview"
        headingLevel={1}
        tone="hero"
        eyebrow={content.overview.eyebrow}
        title={content.overview.title}
        summary={content.overview.summary}
        headerRegion="overview"
      >
        <!-- header-only card: 0.3.0 SectionCard requires children — an empty
             snippet keeps the card body-less in spirit (the body renders as
             an empty band). -->
        {#snippet children()}{/snippet}
      </SectionCard>
    </div>

    <div id="architecture" data-region="architecture">
      <CardGrid class="mt-0">
        {#each content.architecture as card, index (card.title)}
          <SectionCard
            eyebrow={`Layer ${index + 1}`}
            title={card.title}
            class="grid grid-rows-subgrid row-span-2"
          >
            <p class="text-muted-foreground text-pretty text-[13px] leading-6">{card.body}</p>
          </SectionCard>
        {/each}
      </CardGrid>
    </div>
  </div>

  <div data-reveal="">
    <SectionCard
      id="install"
      family="install"
      headerRegion="install"
      eyebrow={content.install.eyebrow}
      title={content.install.title}
      summary={content.install.summary}
    >
      <div class="flex flex-col gap-6">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                {#each content.install.headers as header (header)}
                  <th>{header}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each content.install.rows as row (row.command)}
                <tr>
                  <td class="dim">{row.runtime}</td>
                  <td><code>{row.command}</code></td>
                  <td>{row.engine}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div data-region="install-swap" id="install-swap" class="flex flex-col gap-3">
          <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
            {content.install.swapLead}
          </p>
          {#each codeById['install-swap'] as sample (sample.meta)}
            <CodeBlock code={sample.code} lang={sample.lang} meta={sample.meta} />
          {/each}
          <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
            {content.install.swapTail}
          </p>
        </div>
      </div>
    </SectionCard>
  </div>

  <div data-reveal="">
    <SectionCard
      id="core"
      family="core"
      headerRegion="core"
      eyebrow={content.core.eyebrow}
      title={content.core.title}
      summary={content.core.summary}
    >
      <div class="flex flex-col gap-7">
        {#each content.core.sections as section (section.id)}
          <div class="flex flex-col gap-3" data-region={section.id}>
            <h3 id={section.id} class="text-[15px] font-bold tracking-tight">{section.title}</h3>
            {#if section.body}
              <p class="text-muted-foreground text-pretty text-[13px] leading-6">{section.body}</p>
            {/if}
            {#each codeById[section.id] ?? [] as sample (sample.meta)}
              <CodeBlock code={sample.code} lang={sample.lang} meta={sample.meta} />
            {/each}
          </div>
        {/each}
      </div>
    </SectionCard>
  </div>

  <div data-reveal="">
    <SectionCard
      id="acquisition"
      family="acquisition"
      headerRegion="acquisition"
      eyebrow={content.acquisition.eyebrow}
      title={content.acquisition.title}
      summary={content.acquisition.summary}
    >
      <div class="flex flex-col gap-7">
        {#each content.acquisition.sections as section (section.id)}
          <div class="flex flex-col gap-3" data-region={section.id}>
            <h3 id={section.id} class="text-[15px] font-bold tracking-tight">{section.title}</h3>
            {#if section.body}
              <p class="text-muted-foreground text-pretty text-[13px] leading-6">{section.body}</p>
            {/if}
            {#each codeById[section.id] ?? [] as sample (sample.meta)}
              <CodeBlock code={sample.code} lang={sample.lang} meta={sample.meta} />
            {/each}
          </div>
        {/each}
      </div>
    </SectionCard>
  </div>

  <div data-reveal="">
    <SectionCard
      id="routes"
      family="routes"
      region="routes"
      eyebrow={content.routes.eyebrow}
      title={content.routes.title}
      summary={content.routes.summary}
    >
      <div class="table-scroll">
        <table class="data-table">
          <thead>
            <tr>
              {#each content.routes.headers as header (header)}
                <th>{header}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each content.routes.rows as route (route.pkg)}
              <tr>
                <td>
                  <!-- pkg is verbatim data; the directory name is derived the
                       same way the workspace lays packages out. -->
                  <a
                    href="https://github.com/jixoai/unipty/tree/main/packages/{route.pkg.replace('@unipty/', '')}"
                    rel="noreferrer"
                    target="_blank"
                  ><code>{route.pkg}</code></a>
                </td>
                <td class="dim">{route.runtime}</td>
                <td>{route.substrate}</td>
                <td>{route.notes}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <div class="mt-8 flex flex-col gap-4" data-region="routes-capabilities" id="routes-capabilities">
        <h3 class="text-[15px] font-bold tracking-tight">{content.routes.capabilities.title}</h3>
        <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
          {content.routes.capabilities.summary}
        </p>
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                {#each content.routes.capabilities.headers as header (header)}
                  <th>{header}</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each content.routes.capabilities.rows as row (row.capability)}
                <tr>
                  <td>{row.capability}</td>
                  <td class="dim">{row.nodePty}</td>
                  <td class="dim">{row.zigpty}</td>
                  <td class="dim">{row.bun}</td>
                  <td class="dim">{row.deno}</td>
                  <td>{row.notes}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
          {content.routes.capabilities.closing}
        </p>
      </div>
    </SectionCard>
  </div>

  <div data-reveal="">
    <SectionCard
      id="metadata"
      family="metadata"
      headerRegion="metadata"
      eyebrow={content.metadata.eyebrow}
      title={content.metadata.title}
      summary={content.metadata.summary}
    >
      <div class="flex flex-col gap-6">
        <div data-region="metadata-schema" id="metadata-schema">
          {#each codeById['metadata-schema'] as sample (sample.meta)}
            <CodeBlock code={sample.code} lang={sample.lang} meta={sample.meta} />
          {/each}
        </div>
        <div data-region="metadata-targets" id="metadata-targets">
          <p class="text-muted-foreground max-w-[78ch] text-pretty text-[13px] leading-6">
            {content.metadata.targets}
          </p>
        </div>
      </div>
    </SectionCard>
  </div>

  <div data-reveal="">
    <SectionCard
      id="browser-limits"
      family="browser-limits"
      region="browser-limits"
      eyebrow={content.browserLimits.eyebrow}
      title={content.browserLimits.title}
      summary={content.browserLimits.summary}
    >
      <ul class="flex flex-col gap-2">
        {#each content.browserLimits.limits as limit (limit)}
          <li class="flex gap-2.5 text-[13px] leading-6">
            <span class="text-primary select-none" aria-hidden="true">&gt;</span>
            <span class="text-muted-foreground">{limit}</span>
          </li>
        {/each}
      </ul>
      <p class="text-muted-foreground mt-4 max-w-[78ch] text-pretty text-[13px] leading-6">
        {content.browserLimits.closing}
      </p>
    </SectionCard>
  </div>
</div>
