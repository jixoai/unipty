<!--
  jixoai terminal footer (registry/files/ui/terminal-footer.svelte).
  The ghost wordmark closes the narrative: huge hollow brand word
  (text-stroke recipe, @supports fallback), muted meta row with links that
  transition to brand hue on hover.
-->
<script lang="ts">
  export interface FooterLink {
    label: string;
    href: string;
  }

  interface Props {
    ghost: string;
    links: FooterLink[];
    copyright?: string;
  }

  let { ghost, links, copyright }: Props = $props();
  const year = new Date().getFullYear();
</script>

<footer class="mx-auto w-full max-w-[90rem] px-4 pb-10 pt-8 sm:px-6 lg:px-8">
  <p class="jx-footer-ghost font-nav select-none" aria-hidden="true">{ghost}</p>
  <div
    class="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px] text-muted-foreground"
  >
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      {#each links as link (link.href)}
        <a
          href={link.href}
          target="_blank"
          rel="noreferrer"
          class="transition-colors hover:text-primary"
        >
          {link.label} ↗
        </a>
      {/each}
    </div>
    <span>{copyright ?? `© ${year}`}</span>
  </div>
</footer>

<style>
  .jx-footer-ghost {
    font-size: clamp(3rem, 11vw, 9rem);
    line-height: 0.9;
    color: transparent;
    -webkit-text-stroke: 1px color-mix(in oklab, var(--border) 55%, transparent);
  }
  @supports not (-webkit-text-stroke: 1px black) {
    .jx-footer-ghost {
      color: color-mix(in oklab, var(--border) 35%, transparent);
    }
  }
</style>
