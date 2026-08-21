<!--
  jixoai theme toggle (registry/files/ui/theme-toggle.svelte).
  light / dark / system with four variants:
    full    — segmented selector: icon + label per mode, click to SET
    compact — cycling button: icon + current mode label
    icon    — cycling button: icon only (aria-label carries the mode)
    text    — cycling button: current mode label only
  Drives the shared theme contract (localStorage "theme", .dark class +
  colorScheme on the root). Pair with the no-flash inline bootstrap in
  app.html. Icons are inline SVG — no icon-library dependency.
-->
<script lang="ts">
  type Theme = 'light' | 'dark' | 'system';
  type Variant = 'full' | 'compact' | 'icon' | 'text';

  interface Props {
    variant?: Variant;
  }

  let { variant = 'compact' }: Props = $props();

  const ORDER: Theme[] = ['light', 'dark', 'system'];
  const LABEL: Record<Theme, string> = { light: 'light', dark: 'dark', system: 'system' };

  let current = $state<Theme>('system');

  const apply = (theme: Theme): void => {
    const dark =
      theme === 'dark' ||
      (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  };

  const set = (theme: Theme): void => {
    current = theme;
    localStorage.setItem('theme', theme);
    apply(theme);
  };

  const cycle = (): void => set(ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!);

  $effect(() => {
    current = (localStorage.getItem('theme') as Theme | null) ?? 'system';
    apply(current);
    const media = matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => current === 'system' && apply('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  });
</script>

{#snippet iconFor(theme: Theme)}
  {#if theme === 'light'}
    <svg class="jx-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  {:else if theme === 'dark'}
    <svg class="jx-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
    </svg>
  {:else}
    <svg class="jx-theme-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="0" />
      <path d="M8 21h8m-4-4v4" />
    </svg>
  {/if}
{/snippet}

{#if variant === 'full'}
  <div class="jx-theme-segmented font-nav" role="group" aria-label="Color theme">
    {#each ORDER as theme (theme)}
      <button
        type="button"
        onclick={() => set(theme)}
        aria-pressed={current === theme}
        class="jx-theme-seg"
        data-active={current === theme || undefined}
      >
        {@render iconFor(theme)}
        <span>{LABEL[theme]}</span>
      </button>
    {/each}
  </div>
{:else}
  <button
    type="button"
    onclick={cycle}
    class="jx-theme-btn font-nav"
    aria-label={`theme: ${current}`}
  >
    {#if variant === 'compact'}
      {@render iconFor(current)}
      <span>{LABEL[current]}</span>
    {:else if variant === 'icon'}
      {@render iconFor(current)}
    {:else}
      <span>{LABEL[current]}</span>
    {/if}
  </button>
{/if}

<style>
  .jx-theme-icon {
    width: 13px;
    height: 13px;
    flex: none;
  }
  .jx-theme-btn,
  .jx-theme-seg {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid color-mix(in oklab, currentColor 35%, transparent);
    color: inherit;
    font-size: 11px;
    padding: 4px 10px;
    cursor: pointer;
    transition: color 150ms ease-out, border-color 150ms ease-out, background-color 150ms ease-out;
  }
  .jx-theme-btn:hover {
    border-color: color-mix(in oklab, currentColor 70%, transparent);
  }
  .jx-theme-segmented {
    display: inline-flex;
  }
  .jx-theme-segmented .jx-theme-seg {
    border-right-width: 0;
    padding: 4px 9px;
  }
  .jx-theme-segmented .jx-theme-seg:last-child {
    border-right-width: 1px;
  }
  .jx-theme-seg[data-active] {
    background: color-mix(in oklab, currentColor 16%, transparent);
  }
</style>
