<!--
  jixoai TocItem (registry/files/ui/toc/toc-item.svelte, 2026-08-25).
  The row half of the toc family: a plain <li> carrying the weight /
  active paint surface (--w, .active — set by the rail root's engine
  callback through the DOM). Nest a TocList INSIDE to compose children;
  a TocLink direct child is the item's own anchor (the parent marker).
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  interface Props extends HTMLAttributes<HTMLLIElement> {
    children: Snippet;
  }

  let { class: className = '', children, ...rest }: Props = $props();
</script>

<li data-jx-toc-item="" class={cn(className)} {...rest}>
  {@render children()}
</li>
