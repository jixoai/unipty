<!--
  jixoai scaffold float portal (registry/files/ui/scaffold-float.svelte).
  The consumer-side half of the float provider: renders its children into
  the website scaffold's top layer (.jx-top-layer) through a real portal — the
  child nodes are created here (full Svelte ownership) and adopted into
  the provider's insertion point on mount; teardown returns them.

  The float rides the top layer's immersive hide/reveal together with
  the header by construction — it lives in the same moving plane.

  API:
    <ScaffoldFloat>
      …anything that should stick to the top plane…
    </ScaffoldFloat>
-->
<script lang="ts">
  import { getContext, onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import type { ScaffoldFloatApi } from './website-scaffold.svelte';

  interface Props {
    children: Snippet;
  }

  let { children }: Props = $props();

  const api = getContext<ScaffoldFloatApi>('jx-scaffold-float');

  let contentEl = $state<HTMLElement | null>(null);
  let anchorEl = $state<HTMLElement | null>(null);

  onMount(() => {
    if (!contentEl) return;
    const unregister = api.set(contentEl);
    return () => {
      unregister();
      // return the nodes to the anchor so Svelte teardown finds them
      anchorEl?.appendChild(contentEl);
    };
  });
</script>

<!-- hidden anchor in place (preserves the authoring DOM position) -->
<div class="jx-float-anchor" bind:this={anchorEl} aria-hidden="true"></div>

<!-- the actual float content: starts here, gets adopted into .jx-top-layer -->
<div class="jx-float-content" bind:this={contentEl}>
  {@render children()}
</div>
