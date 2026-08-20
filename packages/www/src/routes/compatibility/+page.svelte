<script lang="ts">
  import { reveal } from '$lib/actions/reveal'
  import SectionCard from '$lib/components/section-card.svelte'
  import presentation from '$lib/generated/catalog.json'
  import release from '$lib/generated/release.json'

  interface EvidenceView {
    runtimeName: string
    runtimeVersion: string
    tuple: { os: string; arch: string; libc?: string }
    suiteId: string
    suiteVersion: string
    commit: string
    verifiedAt: string
    reportRef: string | null
  }

  interface RowView {
    tuple: { os: string; arch: string; libc?: string }
    runtime: string | null
    state: 'verified' | 'declared-unverified' | 'not-targeted'
    evidence: EvidenceView[]
  }

  interface RouteView {
    packageName: string
    packageVersion: string
    backendId: string
    factoryExport: string
    protocolCore: number[]
    provenance: { kind: string; substrate: string } | null
    rows: RowView[]
  }

  type Presentation = {
    release: { commit: string; tag: string; generatedAt: string | null }
    routes: RouteView[]
  }

  const catalog = presentation as Presentation

  const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const states = ['verified', 'declared-unverified', 'not-targeted'] as const

  const legend: Record<(typeof states)[number], string> = {
    verified:
      'The catalog contains a full public-contract conformance pass for this package version on this exact runtime version and exact os/arch/libc tuple at the listed commit. Nothing less qualifies.',
    'declared-unverified':
      'The package\u2019s metadata declares this tuple as a target, but this catalog holds no exact evidence record for it. It is not a support claim of any strength.',
    'not-targeted': 'The tuple falls outside every target declaration of the package for this release.',
  }

  const rules = [
    'Runtime versions stay exact — they are never widened into ranges.',
    'One catalog per release — history is never merged across releases.',
    'Absent evidence is always shown conservatively as declared-unverified.',
    'CI failures are diagnostics, never permanent \u201cunsupported\u201d claims.',
  ]

  const generatedAt = catalog.release.generatedAt ?? 'no evidence in this catalog'
</script>

<svelte:head>
  <title>Compatibility · UniPty</title>
  <meta
    name="description"
    content="Verified, declared-unverified, and not-targeted tuples for the current UniPty release, derived from one immutable catalog artifact."
  />
</svelte:head>

<div
  class="mx-auto w-full max-w-[90rem] px-4 pt-10 sm:px-6 lg:px-8"
  data-reveal=""
  use:reveal
>
  <SectionCard
    headingLevel={1}
    tone="hero"
    eyebrow="Compatibility"
    title="Verified tuples for this release"
    summary="Derived at build time from exactly one release catalog artifact — never merged with history, never recomputed in your browser."
    contentClass="pt-3 sm:pt-4"
  >
    <nav class="flex flex-wrap gap-2 text-xs" aria-label="Route matrices">
      {#each catalog.routes as route (route.packageName)}
        <a
          href="#route-{slug(route.packageName)}"
          class="border-border bg-background text-muted-foreground hover:text-primary border px-2.5 py-1 transition-colors motion-reduce:transition-none"
        >
          {route.packageName}
        </a>
      {/each}
    </nav>
  </SectionCard>
</div>

<div class="mx-auto grid w-full max-w-[90rem] gap-6 px-4 pt-6 sm:px-6 min-[940px]:grid-cols-2 lg:px-8">
  <div data-reveal="" use:reveal>
    <SectionCard eyebrow="States" title="How to read these states">
      <dl class="flex flex-col gap-4">
        {#each states as state (state)}
          <div class="flex flex-col gap-1.5">
            <dt><span class="badge badge-{state}">{state}</span></dt>
            <dd class="text-muted-foreground text-pretty text-[13px] leading-6">
              {legend[state]}
            </dd>
          </div>
        {/each}
      </dl>
    </SectionCard>
  </div>
  <div data-reveal="" use:reveal={{ delay: 70 }}>
    <SectionCard eyebrow="Release artifact" title="One immutable input">
      <dl class="flex flex-col gap-3 text-[13px]">
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">Release</dt>
          <dd><code>{catalog.release.tag}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">Tested commit</dt>
          <dd><code class="break-all">{catalog.release.commit}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">Latest verification</dt>
          <dd><time datetime={catalog.release.generatedAt ?? undefined}>{generatedAt}</time></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">Catalog sha256</dt>
          <dd><code class="break-all">{release.sha256}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">Artifact</dt>
          <dd>
            <a href="/catalog/catalog.json" class="text-primary underline underline-offset-2"
              >catalog.json</a
            >
            ({release.catalogBytes} bytes, copied byte-identical into this site)
          </dd>
        </div>
      </dl>
    </SectionCard>
  </div>
</div>

<div class="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 pb-4 pt-6 sm:px-6 lg:px-8">
  {#each catalog.routes as route (route.packageName)}
    <article
      id="route-{slug(route.packageName)}"
      class="border-border bg-card border shadow-sm"
      data-reveal=""
      use:reveal
    >
      <div class="border-border flex flex-col gap-2.5 border-b px-4 py-3 sm:px-5 sm:py-4">
        <h3 class="font-nav text-balance text-[1.05rem] tracking-tight sm:text-[1.22rem]">
          <code>{route.packageName}</code><span class="version">v{route.packageVersion}</span>
        </h3>
        <p class="route-sub">
          backend <code>{route.backendId}</code>
          · factory <code>{route.factoryExport}</code>
          · Core protocol {route.protocolCore.join(', ')}
          {#if route.provenance}
            · substrate <code>{route.provenance.substrate}</code> ({route.provenance.kind})
          {/if}
        </p>
      </div>
      <div class="p-4 sm:p-5">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>Runtime</th>
                <th>OS</th>
                <th>Arch</th>
                <th>libc</th>
                <th>State</th>
                <th>Evidence (exact records)</th>
              </tr>
            </thead>
            <tbody>
              {#each route.rows as row (row)}
                <tr data-state={row.state}>
                  <td class="dim">{row.runtime ?? '—'}</td>
                  <td class="dim">{row.tuple.os}</td>
                  <td class="dim">{row.tuple.arch}</td>
                  <td class="dim">{row.tuple.libc ?? '—'}</td>
                  <td><span class="badge badge-{row.state}">{row.state}</span></td>
                  {#if row.state === 'verified' && row.evidence.length > 0}
                    <td>
                      <ul class="evidence-list">
                        {#each row.evidence as ev (ev)}
                          <li>
                            <span class="evidence-line">
                              <strong>{`${ev.runtimeName} ${ev.runtimeVersion}`}</strong>
                              · suite {ev.suiteId}@{ev.suiteVersion}
                              · commit {ev.commit}
                              · verified {ev.verifiedAt}{#if ev.reportRef}
                                · report <code>{ev.reportRef}</code>{/if}
                            </span>
                          </li>
                        {/each}
                      </ul>
                    </td>
                  {:else}
                    <td>
                      <ul class="evidence-list">
                        <li>
                          <span class="evidence-line"
                            >No exact evidence record in this catalog.</span
                          >
                        </li>
                      </ul>
                    </td>
                  {/if}
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </div>
    </article>
  {/each}
</div>
