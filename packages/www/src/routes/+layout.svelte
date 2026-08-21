<!--
  Site shell: the jixoai overlay scaffold (registry app-shell) wrapping every
  page — immersive TerminalHeader in the top layer, TerminalFooter ghost
  wordmark, and the SPA tab-carousel view-transition runner (onNavigate).
  Pages are flat files (/, /docs.html, /compatibility.html); the client
  router resolves the same URLs the flat artifact serves.
-->
<script lang="ts">
  import '../app.css'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import AppShell from '$lib/ui/website-scaffold.svelte'
  import '$lib/website-scaffold.css'
  import TerminalFooter from '$lib/ui/terminal-footer.svelte'
  import TerminalHeader from '$lib/ui/terminal-header.svelte'
  import ThemeToggle from '$lib/ui/theme-toggle.svelte'
  import { GITHUB_URL, SITE_DOMAIN, SITE_SUBTITLE } from '$lib/constants'
  import release from '$lib/generated/release.json'
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  // Prerendered paths lack the .html suffix the browser shows.
  const normalized = $derived(
    page.url.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/',
  )

  // SPA view transitions (showcase law, 2026-08-21): every internal
  // navigation runs through document.startViewTransition with the
  // tab-carousel direction law (page order index comparison, ported from
  // openspecui). Reduced motion / unsupported browsers navigate plainly.
  const PAGE_ORDER = ['/', '/docs.html', '/compatibility.html']
  const pageIndex = (pathname: string) => PAGE_ORDER.indexOf(pathname)

  onNavigate((navigation) => {
    if (
      typeof document.startViewTransition !== 'function' ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    const from = pageIndex(page.url.pathname)
    const to = pageIndex(new URL(navigation.to.url, location.origin).pathname)
    if (from < 0 || to < 0 || from === to) return

    const root = document.documentElement
    root.dataset.vtKind = 'page-carousel'
    root.dataset.vtDirection = to > from ? 'forward' : 'backward'
    root.dataset.vtNav = document.querySelector('.jx-nav')?.classList.contains('jx-light')
      ? 'light'
      : 'dark'

    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => {
        resolve()
        await navigation.complete
      })
      transition.finished.finally(() => {
        delete root.dataset.vtKind
        delete root.dataset.vtDirection
        delete root.dataset.vtNav
      })
    })
  })

  const items = $derived([
    { href: '/', label: 'Overview', active: normalized === '/' },
    { href: '/docs.html', label: 'Docs', active: normalized === '/docs' },
    { href: '/compatibility.html', label: 'Compatibility', active: normalized === '/compatibility' },
    { href: GITHUB_URL, label: 'GitHub', external: true },
  ])
</script>

<AppShell>
  {#snippet header()}
    <TerminalHeader brand="UniPty" domain={SITE_DOMAIN} subtitle={SITE_SUBTITLE} {items}>
      {#snippet logo()}
        <!-- the site favicon's `>_` terminal mark, verbatim (static/icon.svg) -->
        <svg viewBox="0 0 32 32" class="h-7 w-7" aria-hidden="true">
          <rect x="2" y="2" width="28" height="28" fill="#000000" stroke="#007924" stroke-width="3" />
          <text
            x="7"
            y="22"
            font-family="Menlo, Consolas, monospace"
            font-size="13"
            font-weight="bold"
            fill="#007924">&gt;_</text
          >
        </svg>
      {/snippet}
      {#snippet switcher()}
        <ThemeToggle variant="compact" />
      {/snippet}
    </TerminalHeader>
  {/snippet}

  {@render children()}

  {#snippet footer()}
    <TerminalFooter
      ghost="UNIPTY"
      links={[
        { label: 'GitHub', href: GITHUB_URL },
        { label: 'Release catalog (byte-identical copy)', href: '/catalog/catalog.json' },
      ]}
      copyright={`Catalog sha256 ${release.sha256.slice(0, 12)} · Copyright © ${new Date().getFullYear()} UniPty contributors · MIT`}
    />
  {/snippet}
</AppShell>
