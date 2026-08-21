<!--
  jixoai hero section (registry/files/ui/hero-section.svelte).
  The Broadside hero, composed after the openspecui reference: large lead
  type with a primary-colored accent, badge row, a copy-command PRIMARY
  CTA (icon + command, copied feedback) plus a secondary outline slot,
  and the terminal card in the second column when the hero has room
  (min-1100px two-column, bottom-aligned; terminal falls below on
  narrower screens).

  Props:
    eyebrow      tracked label above the title (brand hue)
    titleLead    the title's plain lead
    titleAccent  the title's primary-colored tail
    summary      max-62ch lead paragraph
    badges       uppercase mono badge row
    copyCommand  the command on the primary CTA (copied to clipboard)
    copyLabel    aria affordance ("copy" / language-specific)
    terminal     snippet: the right-column demo (terminal-card)
    secondary?   snippet: extra outline CTAs after the copy button

  UniPty divergence (2026-08-20): the two import paths below were corrected
  for this site's layout — press-button lives at $lib/components/ and the
  reveal action at $lib/actions/ (registry assumes $lib/ui + $lib/reveal).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import PressButton from '$lib/components/press-button.svelte';
  import { reveal } from '$lib/actions/reveal';

  interface Props {
    eyebrow: string;
    titleLead: string;
    titleAccent: string;
    summary: string;
    badges: readonly string[];
    copyCommand: string;
    copyLabel?: string;
    terminal: Snippet;
    secondary?: Snippet;
  }

  let {
    eyebrow,
    titleLead,
    titleAccent,
    summary,
    badges,
    copyCommand,
    copyLabel = 'copy',
    terminal,
    secondary,
  }: Props = $props();

  let copied = $state(false);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const copyCommandToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(copyCommand);
    } catch {
      const area = document.createElement('textarea');
      area.value = copyCommand;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    copied = true;
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = false), 1400);
  };
</script>

<section class="mx-auto w-full max-w-[90rem] px-4 pb-10 pt-10 sm:px-6 sm:pt-14 lg:px-8">
  <div
    class="grid min-[1100px]:grid-cols-[minmax(0,1fr)_minmax(25rem,31rem)] min-[1100px]:items-end gap-10 min-[1100px]:gap-14"
  >
    <div class="min-w-0">
      <p class="font-nav text-primary text-[11px] uppercase tracking-[0.24em]" data-reveal="" use:reveal>
        {eyebrow}
      </p>
      <h1
        class="mt-4 text-[clamp(2.4rem,5vw,4.4rem)] font-bold leading-[1.2] tracking-[-0.02em] text-balance"
        data-reveal=""
        use:reveal={{ delay: 60, rise: 14 }}
      >
        {titleLead}<em class="text-primary not-italic">{titleAccent}</em>
      </h1>
      <p
        class="text-muted-foreground mt-5 max-w-[62ch] text-pretty text-[15px] leading-6 sm:text-base sm:leading-7"
        data-reveal=""
        use:reveal={{ delay: 120 }}
      >
        {summary}
      </p>
      <div
        class="text-muted-foreground font-nav mt-8 flex flex-wrap gap-x-6 gap-y-2 text-xs uppercase tracking-[0.14em]"
        data-reveal=""
        use:reveal={{ delay: 160 }}
      >
        {#each badges as badge (badge)}
          <span>{badge}</span>
        {/each}
      </div>
      <div class="mt-8 flex flex-wrap gap-3" data-reveal="" use:reveal={{ delay: 200 }}>
        <PressButton
          variant={copied ? 'copied' : 'primary'}
          onclick={copyCommandToClipboard}
          ariaLabel={`${copied ? 'copied' : copyLabel} ${copyCommand}`}
        >
          {#if copied}
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          {:else}
            <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="12" height="12" rx="0" />
              <path d="M5 15V4a1 1 0 0 1 1-1h10" />
            </svg>
          {/if}
          <span>{copyCommand}</span>
        </PressButton>
        {#if secondary}
          {@render secondary()}
        {/if}
      </div>
    </div>
    <div class="min-w-0" data-reveal="" use:reveal={{ delay: 260, rise: 12 }}>
      {@render terminal()}
    </div>
  </div>
</section>
