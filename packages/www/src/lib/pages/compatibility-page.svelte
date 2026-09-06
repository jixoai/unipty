<!--
  UniPty compatibility page body — derived at build time from exactly one
  immutable release catalog artifact (src/lib/generated/catalog.json, written
  by scripts/build.mjs before vite build; never recomputed in the browser).
  Content-driven (2026-09-06 site-i18n-zh): prose renders from a locale
  dictionary; every catalog-derived string (state names, evidence lines,
  identities) is data and stays byte-identical across locales.
  jixoai-ui 0.3.0 adaptation (2026-09-06): registry SectionCard; CardGrid
  owns its children's entrance; pure CSS [data-reveal] hooks.
-->
<script lang="ts">
  import CardGrid from '$lib/ui/card-grid/card-grid.svelte'
  import SectionCard from '$lib/ui/section-card/section-card.svelte'
  import presentation from '$lib/generated/catalog.json'
  import release from '$lib/generated/release.json'
  import type { CompatibilityContent } from '$lib/i18n/schema'

  let { content }: { content: CompatibilityContent } = $props()

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

  const generatedAt = catalog.release.generatedAt ?? content.release.fallbackGeneratedAt
</script>

<div class="mx-auto w-full max-w-[90rem] px-4 pt-10 sm:px-6 lg:px-8" data-reveal="">
  <SectionCard
    headingLevel={1}
    tone="hero"
    eyebrow={content.hero.eyebrow}
    title={content.hero.title}
    summary={content.hero.summary}
  >
    <nav class="flex flex-wrap gap-2 text-xs" aria-label={content.hero.navLabel}>
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

<div class="mx-auto w-full max-w-[90rem] px-4 pt-6 sm:px-6 lg:px-8">
  <CardGrid>
    <SectionCard eyebrow={content.states.eyebrow} title={content.states.title} class="grid grid-rows-subgrid row-span-2">
      <dl class="flex flex-col gap-4">
        {#each states as state (state)}
          <div class="flex flex-col gap-1.5">
            <dt><span class="badge badge-{state}">{state}</span></dt>
            <dd class="text-muted-foreground text-pretty text-[13px] leading-6">
              {content.states.legend[state]}
            </dd>
          </div>
        {/each}
      </dl>
    </SectionCard>
    <SectionCard eyebrow={content.release.eyebrow} title={content.release.title} class="grid grid-rows-subgrid row-span-2">
      <dl class="flex flex-col gap-3 text-[13px]">
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">{content.release.labels.release}</dt>
          <dd><code>{catalog.release.tag}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">{content.release.labels.commit}</dt>
          <dd><code class="break-all">{catalog.release.commit}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">{content.release.labels.verifiedAt}</dt>
          <dd><time datetime={catalog.release.generatedAt ?? undefined}>{generatedAt}</time></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">{content.release.labels.sha256}</dt>
          <dd><code class="break-all">{release.sha256}</code></dd>
        </div>
        <div class="flex flex-wrap gap-x-3 gap-y-1">
          <dt class="text-muted-foreground w-[9.5rem] shrink-0">{content.release.labels.artifact}</dt>
          <dd>
            <a href="/catalog/catalog.json" class="text-primary underline underline-offset-2"
              >catalog.json</a
            >
            {content.release.artifactOpen}{release.catalogBytes}{content.release.artifactClose}
          </dd>
        </div>
      </dl>
    </SectionCard>
  </CardGrid>
</div>

<div class="mx-auto flex w-full max-w-[90rem] flex-col gap-6 px-4 pb-4 pt-6 sm:px-6 lg:px-8">
  {#each catalog.routes as route (route.packageName)}
    <article
      id="route-{slug(route.packageName)}"
      class="border-border bg-card border shadow-sm"
      data-reveal=""
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
                {#each content.table.headers as header (header)}
                  <th>{header}</th>
                {/each}
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
                            >{content.table.noEvidence}</span
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
