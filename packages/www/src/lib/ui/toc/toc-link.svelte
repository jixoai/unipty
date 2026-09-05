<!--
  jixoai TocLink (registry/files/ui/toc/toc-link.svelte, 2026-08-25).
  The anchor half of the toc family: a real fragment <a> whose href
  target IS the scrollspy region (the rail root derives engine extents
  from these hrefs — DOM delegation, zero registration). aria-current
  is managed by the root on the pick.

  child({ props }) offered (the family context contract): the consumer
  replacement element must keep the anchor role and the fragment href —
  the rail reads both off the DOM.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLAnchorAttributes } from 'svelte/elements';
  import { cn } from '$lib/utils';

  interface Props extends HTMLAnchorAttributes {
    /** the fragment anchor — its target is the spy region */
    href: string;
    /** replacement-element escape: spread {...props} and append own
     *  classes explicitly (class={cn(props.class, 'own')}) */
    child?: Snippet<[{ props: HTMLAnchorAttributes & { class: string } }]>;
    children?: Snippet;
  }

  let { href, class: className = '', child, children, ...rest }: Props = $props();

  const props = $derived({
    ...rest,
    href,
    'data-jx-toc-link': '',
    class: cn(className),
  } as HTMLAnchorAttributes & { class: string });
</script>

{#if child}
  {@render child({ props })}
{:else}
  <a {...props}>{@render children?.()}</a>
{/if}
