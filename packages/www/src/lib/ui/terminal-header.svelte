<!--
  jixoai terminal header (registry/files/ui/terminal-header.svelte).
  The site nav bar: a strict two-wing layout — LEFT carries the brand
  (logo slot + wordmark + domain/subtitle, the page's identity), RIGHT
  carries the navigation as one bordered pill group (the page's routes)
  plus the switcher slot. The wings never mix.

  Theme lock: the bar is a CRT bezel locked DARK by default; components
  inside render with dark tokens because the wrapper carries the scoped
  token class (dark). Declare theme="light" or "system" to unlock.

  Responsive — three deliberate tiers:
    desktop (≥lg)   one row: logo + full brand stack LEFT; complete nav
                    pill group + switcher RIGHT
    tablet (sm–lg)  one row: logo + brand + domain LEFT (no subtitle);
                    compact nav group + switcher RIGHT
    mobile (<sm)    row 1: logo + brand LEFT; switcher + hamburger RIGHT;
                    the nav opens as a stacked disclosure panel below
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  export interface TerminalNavItem {
    label: string;
    href: string;
    active?: boolean;
    external?: boolean;
  }

  interface Props {
    brand: string;
    items: TerminalNavItem[];
    logo?: Snippet;
    domain?: string;
    subtitle?: string;
    switcher?: Snippet;
    theme?: 'dark' | 'light' | 'system';
    homeHref?: string;
  }

  let {
    brand,
    items,
    logo,
    domain,
    subtitle,
    switcher,
    theme = 'dark',
    homeHref = '/',
  }: Props = $props();

  // scoped token class: 'dark' (default lock) or 'jx-light'
  let scope = $state<'dark' | 'light'>(theme === 'light' ? 'light' : 'dark');
  let open = $state(false);

  $effect(() => {
    if (theme !== 'system') {
      scope = theme === 'light' ? 'light' : 'dark';
      return;
    }
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => (scope = media.matches ? 'dark' : 'light');
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  });

  const close = () => (open = false);

  // Sliding indicator (Owner, 2026-08-21): a dedicated element acts as the
  // active background and slides between nav items (measured translateX +
  // width). It carries the vt-nav-active name, so cross-page navigations
  // morph it via the view transition; same-page/no-VT swaps fall back to
  // its own CSS transition.
  let navEl = $state<HTMLElement | null>(null);
  let indicatorEl = $state<HTMLElement | null>(null);

  const positionIndicator = (instant = false) => {
    if (!navEl || !indicatorEl) return;
    const active = navEl.querySelector('[aria-current="page"]');
    if (!(active instanceof HTMLElement)) {
      indicatorEl.style.opacity = '0';
      return;
    }
    if (instant) indicatorEl.classList.add('jx-indicator-instant');
    indicatorEl.style.opacity = '1';
    indicatorEl.style.width = `${active.offsetWidth}px`;
    indicatorEl.style.transform = `translateX(${active.offsetLeft}px)`;
    if (instant) {
      requestAnimationFrame(() => indicatorEl?.classList.remove('jx-indicator-instant'));
    }
  };

  let measured = false;
  $effect(() => {
    // runs on mount and whenever items/active change: the first measure is
    // instant (no slide from 0); every later move animates via the CSS
    // transition — the VT morph covers the visual when a transition runs
    void items;
    positionIndicator(!measured);
    measured = true;
  });

  onMount(() => {
    const reposition = () => positionIndicator(false);
    const ro = new ResizeObserver(reposition);
    if (navEl) ro.observe(navEl);
    document.fonts?.ready.then(reposition).catch(() => {});
    return () => ro.disconnect();
  });
</script>

<header class="jx-nav {scope === 'dark' ? 'dark' : 'jx-light'}">
  <div class="mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-8">
    <div class="flex items-center justify-between gap-4 py-3">
      <!-- LEFT WING · the brand -->
      <a href={homeHref} class="flex min-w-0 flex-1 items-center gap-3">
        {#if logo}
          <span class="flex h-8 w-8 flex-none items-center justify-center">
            {@render logo()}
          </span>
        {/if}
        <span class="flex min-w-0 flex-col gap-0.5">
          <span class="font-nav text-primary text-[11px] uppercase tracking-[0.24em] leading-tight">
            {brand}
          </span>
          {#if domain}
            <span class="font-nav truncate text-sm leading-tight">{domain}</span>
          {/if}
          {#if subtitle}
            <span class="hidden truncate text-[11px] leading-tight opacity-60 lg:block">
              {subtitle}
            </span>
          {/if}
        </span>
      </a>

      <!-- RIGHT WING · the navigation -->
      <div class="flex flex-none items-center gap-3">
        <nav
          class="relative hidden items-center border border-terminal-foreground/25 p-0.5 text-xs sm:flex"
          aria-label="Primary"
          bind:this={navEl}
        >
          <span class="jx-indicator" bind:this={indicatorEl} aria-hidden="true"></span>
          {#each items as item (item.href)}
            <a
              href={item.href}
              aria-current={item.active ? 'page' : undefined}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              class={[
                'px-2.5 py-1 transition-colors lg:px-3',
                item.active
                  ? 'text-terminal-foreground'
                  : 'text-terminal-foreground/70 hover:text-terminal-foreground',
              ].join(' ')}
            >
              {item.label}{item.external ? ' ↗' : ''}
            </a>
          {/each}
        </nav>
        {#if switcher}
          {@render switcher()}
        {/if}
        <button
          type="button"
          class="flex h-8 w-8 flex-col items-center justify-center gap-[3px] border border-terminal-foreground/25 sm:hidden"
          aria-expanded={open}
          aria-label="Toggle navigation"
          onclick={() => (open = !open)}
        >
          <span class="jx-bar block h-[1.5px] w-4 bg-terminal-foreground"></span>
          <span class="block h-[1.5px] w-4 bg-terminal-foreground"></span>
          <span class="jx-bar block h-[1.5px] w-4 bg-terminal-foreground"></span>
        </button>
      </div>
    </div>

    <!-- mobile disclosure: the same nav, stacked below the bar -->
    <div
      class="grid grid-rows-[0fr] transition-[grid-template-rows] duration-200 sm:hidden"
      class:grid-rows-[1fr]={open}
    >
      <div class="overflow-hidden">
        <nav class="flex flex-col border-t border-terminal-foreground/10 py-2 text-xs" aria-label="Primary">
          {#each items as item (item.href)}
            <a
              href={item.href}
              onclick={close}
              aria-current={item.active ? 'page' : undefined}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noreferrer' : undefined}
              class={[
                'px-1 py-2 transition-colors',
                item.active
                  ? 'bg-terminal-hover text-terminal-foreground'
                  : 'text-terminal-foreground/70 hover:text-terminal-foreground',
              ].join(' ')}
            >
              {item.label}{item.external ? ' ↗' : ''}
            </a>
          {/each}
        </nav>
      </div>
    </div>
  </div>
</header>

<style>
  /* the bezel surface: without this the bar is transparent and the
     dark-scoped white text sits on the page background — invisible */
  .jx-nav {
    background: var(--terminal);
    color: var(--terminal-foreground);
    border-bottom: 1px solid var(--border);
  }
  .jx-nav.dark {
    color-scheme: dark;
  }
  .jx-nav.jx-light {
    color-scheme: light;
  }

  /* the hamburger bars fold into an ✕ while the panel is open */
  .jx-nav button[aria-expanded='true'] .jx-bar:first-child {
    transform: translateY(4.5px) rotate(45deg);
  }
  .jx-nav button[aria-expanded='true'] .jx-bar:last-child {
    transform: translateY(-4.5px) rotate(-45deg);
  }
  .jx-nav .jx-bar {
    transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  @media (prefers-reduced-motion: reduce) {
    .jx-nav .jx-bar,
    .jx-nav .grid {
      transition: none;
    }
  }
  /* the sliding active background: its own element, measured into place;
     morphs across pages via the vt-nav-active view-transition-name */
  .jx-nav .jx-indicator {
    position: absolute;
    top: 2px;
    bottom: 2px;
    left: 0;
    width: 0;
    z-index: 0;
    /* No background (Owner, 2026-08-21): a solid fill would cover the pill
       text when the VT group hoists this element above the header; a
       backdrop brightener stays visually identical on the always-dark
       bezel and is stacking-proof. */
    -webkit-backdrop-filter: brightness(2);
    backdrop-filter: brightness(2);
    opacity: 0;
  }
  .jx-nav.jx-light .jx-indicator {
    /* light bezel: the same "subtle shift" reads as a slight darken */
    -webkit-backdrop-filter: brightness(0.85);
    backdrop-filter: brightness(0.85);
    view-transition-name: vt-nav-active;
    transition:
      transform 450ms cubic-bezier(0.22, 1, 0.36, 1),
      width 450ms cubic-bezier(0.22, 1, 0.36, 1),
      opacity 150ms ease-out;
  }
  .jx-nav .jx-indicator.jx-indicator-instant {
    transition: none;
  }
  .jx-nav nav a {
    position: relative;
    z-index: 1;
  }

  /* interaction polish on the bezel: WebKit's default tap-highlight is a
     semi-transparent black flash that reads as a bug on the dark surface;
     idle pills gain a hover affordance; focus gets a contained ring
     instead of the site-wide 2px offset outline */
  .jx-nav a,
  .jx-nav button {
    -webkit-tap-highlight-color: transparent;
  }
  .jx-nav nav a:not([aria-current='page']):hover {
    background: var(--terminal-hover);
  }
  .jx-nav :where(a, button):focus-visible {
    outline: 1px solid color-mix(in oklab, var(--terminal-foreground) 80%, transparent);
    outline-offset: -1px;
  }
</style>
