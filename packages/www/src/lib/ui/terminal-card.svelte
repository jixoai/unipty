<!--
  jixoai terminal card (registry/files/ui/terminal-card.svelte).
  The Broadside hero terminal, composed after the openspecui reference:
  traffic-light title bar, one large typed command line, outputs that
  surface line by line, 6px hard offset shadow. Commands type in
  character by character (one-time entrance — never looping); the cursor
  is a STATIC block (the jixoai motion law; the reference's blink
  predates it). Prerendered/no-JS shows the settled terminal; reduced
  motion renders everything instantly.

  Props:
    barTitle  window title (traffic-light bar label)
    command   the single command line (typed)
    outputs   lines surfaced sequentially after the command completes
-->
<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    barTitle: string;
    command: string;
    outputs: readonly string[];
  }

  let { barTitle, command, outputs }: Props = $props();

  // Prerendered/no-JS output shows the settled terminal; hydration
  // restarts the typing story.
  // svelte-ignore state_referenced_locally
  let typed = $state(command);
  // svelte-ignore state_referenced_locally
  let shownLines = $state(outputs.length);

  onMount(() => {
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const clear = () => clearTimeout(timer);

    typed = '';
    shownLines = 0;

    const revealOutputs = (line: number) => {
      if (cancelled) return;
      if (line >= outputs.length) return;
      shownLines = line + 1;
      timer = setTimeout(() => revealOutputs(line + 1), 110);
    };
    const typeNext = (index: number) => {
      if (cancelled) return;
      if (index <= command.length) {
        typed = command.slice(0, index);
        timer = setTimeout(() => typeNext(index + 1), 42 + Math.random() * 40);
      } else {
        timer = setTimeout(() => revealOutputs(0), 140);
      }
    };
    timer = setTimeout(() => typeNext(0), 300);

    return () => {
      cancelled = true;
      clear();
    };
  });
</script>

<div class="jx-terminal border-border bg-terminal text-terminal-foreground w-full border">
  <div
    class="text-terminal-foreground/55 flex items-center gap-1.5 border-b px-3.5 py-2 font-nav text-xs tracking-[0.1em]"
  >
    <span class="jx-light-dot" aria-hidden="true"></span>
    <span class="jx-light-dot jx-light-yellow" aria-hidden="true"></span>
    <span class="jx-light-dot jx-light-green" aria-hidden="true"></span>
    <span class="ml-2 truncate">{barTitle}</span>
  </div>
  <div class="p-4 sm:p-5">
    <p class="text-lg font-semibold tracking-tight sm:text-xl">
      <span class="text-primary mr-2">$</span><span>{typed}</span><span class="jx-cursor" aria-hidden="true"></span>
    </p>
    <div class="mt-3 space-y-1 text-[13px] leading-5">
      {#each outputs as line, index (line)}
        <p class="jx-out" class:jx-out-shown={index < shownLines}>{line}</p>
      {/each}
    </div>
  </div>
</div>

<style>
  .jx-terminal {
    box-shadow: 6px 6px 0 0 var(--shadow);
  }
  .jx-light-dot {
    width: 8px;
    height: 8px;
    flex: none;
    border: 1px solid currentColor;
    background: oklch(0.7 0.18 25);
  }
  .jx-light-yellow {
    background: oklch(0.85 0.17 95);
  }
  .jx-light-green {
    background: oklch(0.75 0.17 150);
  }
  /* static block cursor — no blink (jixoai motion law) */
  .jx-cursor {
    display: inline-block;
    width: 0.58em;
    height: 1.05em;
    background: var(--terminal-foreground);
    vertical-align: text-bottom;
    margin-left: 2px;
  }
  .jx-out {
    color: color-mix(in oklab, var(--terminal-foreground) 65%, transparent);
    opacity: 0;
    transform: translateY(5px);
  }
  .jx-out-shown {
    opacity: 1;
    transform: none;
    transition:
      opacity 150ms ease-out,
      transform 170ms ease-out;
  }
  @media (prefers-reduced-motion: reduce) {
    .jx-out,
    .jx-out-shown {
      opacity: 1;
      transform: none;
      transition: none;
    }
  }
</style>
