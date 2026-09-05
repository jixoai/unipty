<!--
  jixoai TocList (registry/files/ui/toc/toc-list.svelte, 2026-08-25).
  The list half of the toc family: a plain <ul>. Nesting is structural —
  a TocList inside a TocItem is the level-2 mechanism (the CSS keys on
  li li descendants; anchors NEVER nest). No context, no registration:
  the rail root reads the composed tree through the DOM.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  interface Props extends HTMLAttributes<HTMLUListElement> {
    children: Snippet;
  }

  let { class: className = '', children, ...rest }: Props = $props();
</script>

<ul data-jx-toc-list="" class={cn(className)} {...rest}>
  {@render children()}
</ul>
