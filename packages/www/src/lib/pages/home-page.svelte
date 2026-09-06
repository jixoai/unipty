<!--
  UniPty overview page body — content-driven (2026-09-06 site-i18n-zh): the
  markup lives here once and renders from a locale dictionary (en at `/`,
  zh at `/zh/`); the routes only inject the dictionary and the locale head.
  jixoai-ui 0.3.0 adaptation (2026-09-06): the hand-rolled hero block is
  replaced by the registry hero-section (composition-first — title/badges/
  copy/terminal snippets); PressButton rides the 0.3.0 variant ladder
  (primary → fill); scroll reveal is the theme's pure CSS [data-reveal]
  hooks. Code samples and terminal output are locale-invariant data.
-->
<script lang="ts">
  import CodeBlock from '$lib/components/code-block.svelte'
  import HeroSection from '$lib/ui/hero-section/hero-section.svelte'
  import PressButton from '$lib/ui/press-button/press-button.svelte'
  import SectionCard from '$lib/ui/section-card/section-card.svelte'
  import TerminalCard from '$lib/ui/terminal-card/terminal-card.svelte'
  import { GITHUB_URL } from '$lib/constants'
  import { localizedPath } from '$lib/i18n/content'
  import type { HomeContent } from '$lib/i18n/schema'
  import type { SiteLocale } from '$lib/i18n/content'

  let { content, locale }: { content: HomeContent; locale: SiteLocale } = $props()

  // In-content site links stay within the current locale; the catalog
  // artifact link (compatibility page) is site-global and locale-invariant.
  const docsHref = $derived(localizedPath('/docs.html', locale))
  const compatHref = $derived(localizedPath('/compatibility.html', locale))

  // Locale-invariant sample (code is data, not prose).
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
</script>

<!-- Hero: registry composition-first hero (title/badges/copy/terminal as
     snippets; the copy snippet replaces the default copy-CTA with the
     docs CTA, secondary carries GitHub). -->
<HeroSection
  eyebrow={content.hero.eyebrow}
  summary={content.hero.summary}
  copyCommand="pnpm add unipty @unipty/backend-node-pty"
  copyLabel={content.hero.copyLabel}
>
  {#snippet title()}
    {content.hero.titleLead}<em>{content.hero.titleEm}</em>{content.hero.titleTail}
  {/snippet}
  {#snippet badges()}
    {#each content.hero.badges as badge (badge)}
      <span>{badge}</span>
    {/each}
  {/snippet}
  {#snippet copy()}
    <PressButton variant="fill" href={docsHref}>{content.hero.docsLabel}</PressButton>
  {/snippet}
  {#snippet secondary()}
    <PressButton variant="outline" href={GITHUB_URL}>{content.hero.githubLabel}</PressButton>
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
  <SectionCard eyebrow={content.quickStart.eyebrow} title={content.quickStart.title} summary={content.quickStart.summary}>
    <CodeBlock code={quickStart} lang="ts" meta="quick-start.mjs" />
    <p class="text-muted-foreground mt-4 text-[13px] leading-5">
      {content.quickStart.noteLead}
      <a href={docsHref} class="text-primary underline underline-offset-2">{content.quickStart.noteLink}</a>{content.quickStart.noteTail}
    </p>
  </SectionCard>
</div>

<!-- What's inside: numbered feature rows with rule-draw reveals. -->
<section class="mx-auto w-full max-w-[90rem] px-4 pt-8 sm:px-6 lg:px-8">
  <h2
    class="font-nav flex items-baseline gap-4 text-lg uppercase tracking-[0.3em]"
    data-reveal=""
  >
    {content.featuresHeading}
    <span class="bg-border h-px flex-1" aria-hidden="true"></span>
  </h2>
  <div class="mt-6">
    {#each content.features as feature, index (feature.id)}
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
  <SectionCard eyebrow={content.routes.eyebrow} title={content.routes.title} summary={content.routes.summary}>
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
      {content.routes.ctaLead}
      <a href={compatHref} class="text-primary underline underline-offset-2"
        >{content.routes.ctaLink}</a
      >{content.routes.ctaTail}
    </p>
  </SectionCard>
</div>
