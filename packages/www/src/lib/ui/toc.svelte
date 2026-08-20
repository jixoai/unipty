<!--
  jixoai Combo ToC (registry/files/ui/toc.svelte).
  Desktop: Rule Tracker (spine + weight-driven level-1 nodes, flat
  weight-driven level-2 text, pick + parent markers). Mobile: Terminal Rail
  (glass single-row viewport — expand changes ONLY height; page scroll
  drives the row via the line pick; scroll-snap list). Powered by
  toc-engine (IoM weights + line algorithm + margin-downward law).

  Usage:
    - Pass the outline via `sections` (same shape as your docs model).
    - Content must mark non-overlapping leaf blocks with
      data-region="<id>" and parent section extents with
      data-family="<id>".
    - This component renders BOTH surfaces; hide rules come from toc.css.
    - Place the wrapping <aside> BEFORE main content in the DOM; position
      it with your page grid (desktop right column, sticky; mobile sticky
      with height: 0 — see README).
-->
<script lang="ts">
  import { createTocEngine } from '$lib/toc-engine';
  import '$lib/toc.css';

  export interface TocChild {
    id: string;
    label: string;
  }
  export interface TocSection {
    id: string;
    label: string;
    children?: TocChild[];
  }

  interface Props {
    sections: TocSection[];
    title?: string;
  }

  let { sections, title = 'reading progress' }: Props = $props();

  const flat = $derived(
    sections.flatMap((section, i) => [
      { id: section.id, label: section.label, level: 1 as const, index: i + 1 },
      ...(section.children ?? []).map((child) => ({
        id: child.id,
        label: child.label,
        level: 2 as const,
        index: i + 1,
      })),
    ]),
  );
  const order = $derived(flat.map((entry) => entry.id));
  const parentOf = $derived(
    new Map(sections.flatMap((section) => (section.children ?? []).map((c) => [c.id, section.id] as const))),
  );

  let desktopItems = $state<HTMLElement[]>([]);
  let mobileLinks = $state<HTMLElement[]>([]);
  let spineFill = $state<HTMLElement | null>(null);
  let viewport = $state<HTMLElement | null>(null);
  let mobileRoot = $state<HTMLElement | null>(null);
  let open = $state(false);

  const mobileLine = 44 + 32; // sticky bar bottom + 2em (equals scroll-margin-top)

  $effect(() => {
    const stopEngine = createTocEngine(
      ({ weights, pick }) => {
        for (const li of desktopItems) {
          li.style.setProperty('--w', (weights.get(li.dataset.id!) ?? 0).toFixed(3));
        }
        for (const a of mobileLinks) {
          a.style.setProperty('--w', (weights.get(a.dataset.id!) ?? 0).toFixed(3));
        }
        if (!pick) return;
        const parent = parentOf.get(pick);
        for (const li of desktopItems) {
          const current = li.dataset.id === pick || li.dataset.id === parent;
          li.classList.toggle('active', current);
        }
        for (const a of mobileLinks) {
          const isPick = a.dataset.id === pick;
          a.style.setProperty('--jx-cur', isPick ? '1' : '0');
          if (isPick) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
        // algorithmic binding: the single row scrolls to the pick entry
        const li = mobileLinks.find((a) => a.dataset.id === pick)?.closest('li');
        if (viewport && li) {
          const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
          viewport.scrollTo({ top: (li as HTMLElement).offsetTop, behavior: reduce ? 'auto' : 'smooth' });
        }
      },
      { lineOffset: innerWidth < 900 ? mobileLine : 1 },
    );

    const onScroll = () => {
      if (!spineFill) return;
      const max = document.documentElement.scrollHeight - innerHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
      spineFill.style.setProperty('--jx-progress', Math.max(0.02, p).toFixed(3));
    };
    addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      stopEngine();
      removeEventListener('scroll', onScroll);
    };
  });

  const close = () => {
    open = false;
  };
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
<div class="jx-toc">
  <nav class="jx-toc-desktop" aria-label="Table of contents">
    <span class="jx-spine"><span class="jx-spine-fill" bind:this={spineFill}></span></span>
    <p class="jx-toc-title">{title}</p>
    <ol>
      {#each flat as entry (entry.id)}
        <li
          class={entry.level === 2 ? 'lvl-2' : ''}
          data-id={entry.id}
          bind:this={desktopItems[order.indexOf(entry.id)]}
        >
          <a href={`#${entry.id}`}>{entry.label}</a>
        </li>
      {/each}
    </ol>
  </nav>

  <div class="jx-toc-mobile jx-glass" bind:this={mobileRoot} data-open={open || undefined}>
    <div class="jx-viewport" bind:this={viewport}>
      <ol>
        {#each flat as entry (entry.id)}
          <li>
            <a
              class={entry.level === 2 ? 'lvl-2' : ''}
              href={`#${entry.id}`}
              data-id={entry.id}
              onclick={close}
              bind:this={mobileLinks[order.indexOf(entry.id)]}
            >
              <span class="jx-cursor" aria-hidden="true">❯</span>
              <span>{entry.label}</span>
            </a>
          </li>
        {/each}
      </ol>
    </div>
    <button
      type="button"
      class="jx-toggle"
      aria-expanded={open}
      aria-label="Expand table of contents"
      onclick={() => (open = !open)}
    >
      ▾
    </button>
  </div>
</div>
