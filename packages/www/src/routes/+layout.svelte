<!--
  Site shell: the jixoai website scaffold (registry app-shell) wrapping every
  page — immersive TerminalHeader in the top layer, TerminalFooter ghost
  wordmark, and the SPA tab-carousel view-transition runner (onNavigate).
  Pages are flat files (/, /docs.html, /compatibility.html); the client
  router resolves the same URLs the flat artifact serves.

  jixoai-ui 0.3.0 adaptation (2026-09-06, original request: 更新官网站点到
  jixoai-ui 0.3.0): the header's closed items[] data tree died — nav is
  composed from NavigationMenuLink parts (desktop pill group + mobile
  drawer snippet); the footer's links[] data prop died — meta rows are
  TerminalFooterColumn children; the docs ToC renders in the scaffold's
  SSR-stable `chrome` snippet from page-provided data (page.data.toc, the
  ui-site pattern) instead of the per-page float portal.
-->
<script lang="ts">
  import '../app.css'
  import '$lib/scrollbar-measure'
  import { onNavigate } from '$app/navigation'
  import { page } from '$app/state'
  import AppShell from '$lib/ui/website-scaffold/website-scaffold.svelte'
  import TerminalFooter from '$lib/ui/terminal-footer/terminal-footer.svelte'
  import TerminalFooterColumn from '$lib/ui/terminal-footer/terminal-footer-column.svelte'
  import TerminalHeader from '$lib/ui/terminal-header/terminal-header.svelte'
  import ThemeToggle from '$lib/ui/theme-toggle/theme-toggle.svelte'
  import NavigationMenu from '$lib/ui/navigation-menu/navigation-menu.svelte'
  import NavigationMenuLink from '$lib/ui/navigation-menu/navigation-menu-link.svelte'
  import Toc from '$lib/ui/toc/toc.svelte'
  import TocList from '$lib/ui/toc/toc-list.svelte'
  import TocItem from '$lib/ui/toc/toc-item.svelte'
  import TocLink from '$lib/ui/toc/toc-link.svelte'
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

  // The mobile disclosure drawer's open state (bind:open is the header's
  // consumer reset signal): a navigation collapses it.
  let drawerOpen = $state(false)

  onNavigate((navigation) => {
    drawerOpen = false
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

  // Composed nav entries (composition-first header): links-only pages ride
  // NavigationMenuLink directly — no panels, so there is nothing for the
  // header's closeAll() router hook to clean.
  const entries = $derived([
    { href: '/', label: 'Overview', current: normalized === '/' },
    { href: '/docs.html', label: 'Docs', current: normalized === '/docs' },
    {
      href: '/compatibility.html',
      label: 'Compatibility',
      current: normalized === '/compatibility',
    },
    { href: GITHUB_URL, label: 'GitHub ↗', current: false },
  ])

  // Page-provided ToC data (the docs page's load() returns `toc`): the
  // layout maps it onto the composed TocList/TocItem/TocLink tree in its
  // own markup — structure lives here, data stays serializable.
  interface TocNode {
    id: string
    label: string
    children?: TocNode[]
  }
  const pageToc = $derived(page.data.toc as TocNode[] | undefined)
</script>

<AppShell>
  {#snippet header()}
    <TerminalHeader
      brand="UniPty"
      domain={SITE_DOMAIN}
      subtitle={SITE_SUBTITLE}
      bind:open={drawerOpen}
    >
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
      {#snippet drawer()}
        <div class="flex flex-col items-stretch gap-1 py-2">
          {#each entries as entry (entry.href)}
            <NavigationMenuLink href={entry.href} current={entry.current}>
              {entry.label}
            </NavigationMenuLink>
          {/each}
        </div>
      {/snippet}
      <NavigationMenu label="site">
        {#each entries as entry (entry.href)}
          <NavigationMenuLink href={entry.href} current={entry.current}>
            {entry.label}
          </NavigationMenuLink>
        {/each}
      </NavigationMenu>
    </TerminalHeader>
  {/snippet}

  {#snippet chrome()}
    <!-- SSR-stable reading rail (0.3.0 firstpaint law): the toc is authored
         here in its final grid cell, never moved by hydration. Pages opt in
         by returning `toc` from load(); the engine reads the shell's
         .jx-shell-body scroll container. -->
    {#if pageToc}
      <Toc title="on this page" scrollRoot=".jx-shell-body">
        <TocList>
          {#each pageToc as section (section.id)}
            <TocItem>
              <TocLink href={'#' + section.id}>{section.label}</TocLink>
              {#if section.children?.length}
                <TocList>
                  {#each section.children as child (child.id)}
                    <TocItem><TocLink href={'#' + child.id}>{child.label}</TocLink></TocItem>
                  {/each}
                </TocList>
              {/if}
            </TocItem>
          {/each}
        </TocList>
      </Toc>
    {/if}
  {/snippet}

  {@render children()}

  {#snippet footer()}
    <TerminalFooter
      ghost="UNIPTY"
      copyright={`Catalog sha256 ${release.sha256.slice(0, 12)} · Copyright © ${new Date().getFullYear()} UniPty contributors · MIT`}
    >
      <TerminalFooterColumn title="project">
        <a href={GITHUB_URL}>GitHub ↗</a>
      </TerminalFooterColumn>
      <TerminalFooterColumn title="evidence">
        <a href="/catalog/catalog.json">Release catalog (byte-identical copy)</a>
      </TerminalFooterColumn>
    </TerminalFooter>
  {/snippet}
</AppShell>
