<!--
  Terminal-bar header: always dark in both themes (CRT bezel, not a themed
  surface). Brand in the project hue, nav pills, external links with ↗.
-->
<script lang="ts">
  import { GITHUB_URL, SITE_DOMAIN, SITE_SUBTITLE } from '$lib/constants'
  import ThemeSwitcher from './theme-switcher.svelte'

  interface Props {
    pathname: string
  }

  let { pathname }: Props = $props()

  // Pages are flat files (/, /docs.html, /compatibility.html); prerendered
  // paths lack the .html suffix the browser shows.
  const normalized = $derived(pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/')

  const links = [
    { href: '/', label: 'Overview', match: '/' },
    { href: '/docs.html', label: 'Docs', match: '/docs' },
    { href: '/compatibility.html', label: 'Compatibility', match: '/compatibility' },
  ]
</script>

<header class="border-border bg-terminal text-terminal-foreground border-b">
  <div
    class="mx-auto flex max-w-[90rem] flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8"
  >
    <div class="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <a href="/" class="min-w-0">
        <p class="font-nav text-primary text-[11px] uppercase tracking-[0.24em]">UniPty</p>
        <div class="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
          <span class="font-nav truncate text-sm tracking-tight sm:text-base">
            {SITE_DOMAIN}
          </span>
          <span class="text-terminal-foreground/70 truncate text-xs">
            {SITE_SUBTITLE}
          </span>
        </div>
      </a>

      <nav class="flex flex-wrap items-center gap-2 text-xs" aria-label="Primary">
        {#each links as link (link.href)}
          <a
            href={link.href}
            aria-current={normalized === link.match ? 'page' : undefined}
            class={[
              'px-2.5 py-1 transition-colors motion-reduce:transition-none',
              normalized === link.match
                ? 'bg-terminal-hover text-terminal-foreground'
                : 'text-terminal-foreground/70 hover:text-terminal-foreground',
            ].join(' ')}
          >
            {link.label}
          </a>
        {/each}
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          class="text-terminal-foreground/70 px-2.5 py-1 transition-colors motion-reduce:transition-none hover:text-terminal-foreground"
        >
          GitHub ↗
        </a>
      </nav>
    </div>

    <ThemeSwitcher />
  </div>
</header>
