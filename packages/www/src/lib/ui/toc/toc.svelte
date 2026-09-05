<!--
  jixoai ToC rail — the ROOT of the composition-first toc family
  (registry/files/ui/toc/toc.svelte, 2026-08-25).

  Desktop: Rule Tracker (spine + weight-driven level-1 nodes, flat
  weight-driven level-2 text, pick + parent markers). Mobile: Terminal
  Rail (glass single-row viewport — expand changes ONLY height; page
  scroll drives the row via the line pick). Powered by toc-engine
  (IoM weights + line algorithm + margin-downward law).

  TWO modes (composition-first-apis):

    AUTO (outline)    <Toc outline={{ root: 'main' }} />
                      derives the link tree from the content's headings
                      at runtime (toc-outline lib) and renders THROUGH
                      the same List/Item/Link parts. DECLARED SSR
                      EXCEPTION (design.md r4): the outline is a runtime
                      DOM scan, so SSR paints the rail shell only and
                      the links arrive on hydrate.

    MANUAL            <Toc><TocList><TocItem>
                        <TocLink href="#a">Setup</TocLink>
                        <TocList><TocItem>…</TocItem></TocList>
                      </TocItem></TocList></Toc>
                      a legal composed list tree — SSR-complete. The
                      link is ALWAYS TocLink (a nested TocList inside a
                      TocItem is the nesting mechanism; anchors never
                      nest). sections[] is dead.

  Scrollspy is ROOT behavior, DOM-DELEGATED (the family context
  contract): the rail reads its own subtree (`a[data-jx-toc-link]`,
  re-queried per engine update — keyed reorders and conditional
  inserts need no registration), derives each link's target from its
  href fragment, and synthesizes heading-to-heading extents for the
  engine. Weights paint as --w on items/links; the pick toggles the
  active marker + aria-current; the parent of the pick (a nested
  TocList's enclosing TocItem link) inherits the active marker.

  Placement (firstpaint ruling, 2026-08-24): inside a website-scaffold
  the toc is authored in the scaffold's `chrome` snippet — SSR-rendered
  in its final grid cell (data-area='toc'), never moved by hydration.
  Standalone consumers keep the classic in-flow behavior.
  (props-discipline sweep, 2026-08-25)
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { createTocEngine, type TocExtent } from '$lib/toc-engine';
  import {
    deriveTocOutline,
    tocOutlineToSections,
    type TocOutlineEntry,
    type TocOutlineSection,
  } from '$lib/toc-outline';
  import { icons } from '$lib/icons';
  import { cn } from '$lib/utils';
  import TocList from './toc-list.svelte';
  import TocItem from './toc-item.svelte';
  import TocLink from './toc-link.svelte';
  import './toc.css';

  /** zero-handwritten-id mode: derive the link tree from a content
   *  root's headings (the toc-outline lib). Client-side derivation —
   *  SSR renders the empty rail that fills on hydration (the DECLARED
   *  exception; the manual composed tree is SSR-complete). */
  /** a manual ToC section: { id, label } — what +page.ts toc arrays
      carry (the layout's and every docs page's import) */
  export interface TocSection {
    id: string;
    label: string;
  }

  export interface TocOutlineConfig {
    /** the content container whose h2/h3 (configurable) tree is the outline */
    root: string | HTMLElement;
    /** heading levels, default [2, 3] */
    levels?: readonly number[];
  }

  interface Props extends HTMLAttributes<HTMLDivElement> {
    /** AUTO mode: derive the outline from a content root's headings */
    outline?: TocOutlineConfig;
    /** the desktop rail label */
    title?: string;
    /** Scroll root for overlay-shell layouts (selector or element);
     *  defaults to the document. */
    scrollRoot?: string | HTMLElement | null;
    /** MANUAL mode: the composed TocList tree */
    children?: Snippet;
    class?: string;
  }

  let {
    outline,
    title = 'reading progress',
    scrollRoot = null,
    children,
    class: className = '',
    ...rest
  }: Props = $props();

  // outline mode: sections + extents derived on the client, refreshed by a
  // MutationObserver on the content root (add/remove/move of headings)
  let outlineSections = $state<TocOutlineSection[]>([]);
  let outlineEntries: readonly TocOutlineEntry[] = [];

  let spineFill = $state<HTMLElement | null>(null);
  let viewport = $state<HTMLElement | null>(null);
  let mobileRoot = $state<HTMLElement | null>(null);
  let open = $state(false);
  let currentPick = $state<string | null>(null);
  let rootEl = $state<HTMLElement | null>(null);

  /** the own-rail law (Codex impl-r2 P1-1): a link belongs to THIS
   *  rail when its closest rail root is rootEl — a nested Toc's links
   *  (own root element) never leak into this rail's spy or paint. */
  function ownLinks(scope: string): HTMLElement[] {
    if (!rootEl) return [];
    return [...rootEl.querySelectorAll<HTMLElement>(`${scope} a[data-jx-toc-link]`)].filter(
      (a) => a.closest('[data-jx-toc-root]') === rootEl,
    );
  }


  // Live line: WHERE pinned chrome ends. Inside the grid shell this reads
  // the body's resolved scroll-padding — the shell owns the single truth
  // (--jx-toc-line derives from the measured header height + the toc bar
  // row; website-scaffold.css). Standalone consumers (no shell) keep the
  // legacy measurement: mobile = this glass rail's bottom, desktop = the
  // header band's bottom, + 32px breathing room. The engine's line getter
  // and the anchor landing share one value, so algorithm and landing can
  // never drift.
  const tocLine = () => {
    const shellBody = document.querySelector<HTMLElement>('.jx-shell-body');
    if (shellBody) {
      const line = parseInt(getComputedStyle(shellBody).scrollPaddingTop, 10);
      if (Number.isFinite(line) && line > 0) return line;
    }
    const mobile = innerWidth < 900;
    const anchor = mobile
      ? (viewport as HTMLElement | null)
      : (document.querySelector('.jx-scaffold-header') as HTMLElement | null);
    const rect = anchor?.getBoundingClientRect();
    return rect ? Math.round(rect.bottom) + 32 : mobile ? 76 : 106;
  };

  // outline derivation (client-only; SSR renders the empty rail and this
  // fills it on hydration): derive once, then re-derive on content
  // mutations (childList subtree — attribute-only churn never re-derives).
  // The engine reads `outlineEntries` through the extents getter each
  // compute, so a re-derivation goes live without an engine restart.
  $effect(() => {
    if (!outline) return;
    const contentRoot =
      typeof outline.root === 'string'
        ? document.querySelector<HTMLElement>(outline.root)
        : outline.root;
    if (!contentRoot) return;

    const rederive = () => {
      outlineEntries = deriveTocOutline(contentRoot, { levels: outline?.levels });
      outlineSections = tocOutlineToSections(outlineEntries);
    };
    rederive();

    let raf = 0;
    const observer = new MutationObserver(() => {
      if (!raf) raf = requestAnimationFrame(rederive);
    });
    observer.observe(contentRoot, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  });

  // ── DOM-delegated rail reads ─────────────────────────────────────
  // No registration exists anywhere: every engine update re-queries the
  // rail's own subtree, so keyed {#each} reorders, conditional inserts
  // and deletions are seen live (family context contract clauses 3–4).

  /** the fragment id a rail link points at */
  const fragmentOf = (link: Element): string => {
    const href = link.getAttribute('href') ?? '';
    return href.startsWith('#') ? decodeURIComponent(href.slice(1)) : '';
  };

  /** MANUAL-mode extents: each link's target element, extent = target →
   *  the NEXT link's target (heading-to-heading, generalized from the
   *  outline lib's derivation — the composed tree IS the region list).
   *  Re-read per compute, so a changed tree goes live without a restart. */
  const treeExtents = (): readonly TocExtent[] => {
    const links = ownLinks('.jx-toc-desktop');
    const targets = links
      .map((link) => document.getElementById(fragmentOf(link)))
      .filter((el): el is HTMLElement => el !== null);
    const seen = new Set<string>();
    const extents: TocExtent[] = [];
    for (let i = 0; i < targets.length; i++) {
      const el = targets[i]!;
      if (seen.has(el.id)) continue; // a duplicated fragment owns one extent
      seen.add(el.id);
      extents.push({ id: el.id, start: el, end: targets[i + 1] ?? null });
    }
    return extents;
  };

  /** the enclosing TocItem's own link fragment — the pick's parent (the
   *  desktop parent marker). Resolved through the DOM, never an ordered
   *  registry. */
  const parentIdOf = (id: string): string | null => {
    if (!rootEl) return null;
    const link = ownLinks('.jx-toc-desktop').find(
      (a) => fragmentOf(a) === id,
    );
    const outerItem = link?.closest('li')?.parentElement?.closest('li');
    const parentLink = outerItem?.querySelector(':scope > a[data-jx-toc-link]');
    return parentLink ? fragmentOf(parentLink) : null;
  };

  $effect(() => {
    // publish the line var before any scroll/anchor logic runs so
    // scroll-padding/margin and the engine share one value from frame one
    tocLine();
    const stopEngine = createTocEngine(
      ({ weights, pick }) => {
        if (!rootEl) return; // transient null during route-swap re-render
        const parent = pick ? parentIdOf(pick) : null;
        for (const li of rootEl.querySelectorAll<HTMLElement>('.jx-toc-desktop li')) {
          const link = li.querySelector(':scope > a[data-jx-toc-link]');
          if (!link) continue;
          // own-rail law: skip nested rails' links (their root differs)
          if (link.closest('[data-jx-toc-root]') !== rootEl) continue;
          const id = fragmentOf(link);
          li.style.setProperty('--w', (weights.get(id) ?? 0).toFixed(3));
          const current = id === pick || id === parent;
          li.classList.toggle('active', current);
          if (current) link.setAttribute('aria-current', 'true');
          else link.removeAttribute('aria-current');
        }
        for (const a of ownLinks('.jx-viewport')) {
          const id = fragmentOf(a);
          a.style.setProperty('--w', (weights.get(id) ?? 0).toFixed(3));
          const isPick = id === pick;
          a.style.setProperty('--jx-cur', isPick ? '1' : '0');
          if (isPick) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
        if (!pick) return;
        currentPick = pick;
        // unified sync (Owner, 2026-08-21): ONE algorithm for both paths —
        // page scroll and expanded-click alike. Instant scrollTo on the
        // collapsed row: no smooth animation to race the height transition,
        // no snap semantics to disagree with. The 44px row shows exactly
        // the picked li, every time.
        const picked = [
          ...ownLinks('.jx-viewport'),
        ].find((a) => fragmentOf(a) === pick);
        const li = picked?.closest('li');
        if (viewport && li) {
          viewport.scrollTo({ top: (li as HTMLElement).offsetTop });
        }
      },
      {
        lineOffset: tocLine,
        scrollRoot,
        extents: outline ? () => outlineEntries : treeExtents,
      },
    );

    const root =
      typeof scrollRoot === 'string'
        ? document.querySelector<HTMLElement>(scrollRoot)
        : scrollRoot;
    const onScroll = () => {
      if (!spineFill) return; // transient null during route-swap re-render
      const max = root ? root.scrollHeight - root.clientHeight : document.documentElement.scrollHeight - innerHeight;
      const y = root ? root.scrollTop : scrollY;
      const p = max > 0 ? Math.min(1, Math.max(0, y / max)) : 0;
      spineFill.style.setProperty('--jx-progress', Math.max(0.02, p).toFixed(3));
    };
    (root ?? window).addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      stopEngine();
      (root ?? window).removeEventListener('scroll', onScroll);
    };
  });

  const syncRow = () => {
    if (!rootEl || !currentPick) return;
    const picked = ownLinks('.jx-viewport').find(
      (a) => fragmentOf(a) === currentPick,
    );
    const li = picked?.closest('li');
    if (viewport && li) viewport.scrollTo({ top: (li as HTMLElement).offsetTop });
  };

  const close = () => {
    open = false;
    // re-draw after the height transition truly ends: mid-transition the
    // viewport's clamp ceiling (scrollHeight - clientHeight) is still
    // shrinking, so an early scrollTo gets clamped and never auto-recovers.
    // transitionend fires exactly once when height reaches 44px.
    viewport?.addEventListener(
      'transitionend',
      (ev) => {
        if (ev.propertyName === 'height') syncRow();
      },
      { once: true },
    );
  };

  // mobile link taps collapse the expanded rail (delegated — the composed
  // tree is re-queried, conditional links need no wiring of their own)
  const handleViewportClick = (event: MouseEvent) => {
    const link = (event.target as Element | null)?.closest?.('a[data-jx-toc-link]');
    // own-rail law: a nested rail's tap collapses ITS rail, not ours
    if (link && link.closest('[data-jx-toc-root]') === rootEl) close();
  };
</script>

<!-- the link tree, rendered into BOTH surfaces (the snippet renders
     twice by design: desktop spine + mobile rail share one structure) -->
{#snippet tree()}
  {#if outline}
    <TocList>
      {#each outlineSections as section (section.id)}
        <TocItem>
          <TocLink href={`#${section.id}`}>{section.label}</TocLink>
          {#if section.children?.length}
            <TocList>
              {#each section.children as child (child.id)}
                <TocItem><TocLink href={`#${child.id}`}>{child.label}</TocLink></TocItem>
              {/each}
            </TocList>
          {/if}
        </TocItem>
      {/each}
    </TocList>
  {:else if children}
    {@render children()}
  {/if}
{/snippet}

<div class={cn('jx-toc', className)} data-area="toc" bind:this={rootEl} {...rest} data-jx-toc-root="">
  <nav class="jx-toc-desktop" aria-label="Table of contents">
    <span class="jx-spine"><span class="jx-spine-fill" bind:this={spineFill}></span></span>
    <p class="jx-toc-title">{title}</p>
    {@render tree()}
  </nav>

  <div class="jx-toc-mobile jx-glass" bind:this={mobileRoot} data-open={open || undefined}>
    <!-- the handler is a pointer-convenience collapse after an anchor
         tap; the links themselves are real anchors (keyboard path
         unaffected — Enter navigates, the rail stays expanded) -->
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="jx-viewport" bind:this={viewport} onclick={handleViewportClick}>
      {@render tree()}
    </div>
    <button
      type="button"
      class="jx-toggle"
      aria-expanded={open}
      aria-label="Expand table of contents"
      onclick={() => (open ? close() : (open = true))}
    >
      {@html icons.chevronDown}
    </button>
  </div>
</div>
