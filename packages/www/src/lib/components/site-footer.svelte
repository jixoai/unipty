<!--
  Ghost footer wordmark closes the narrative — always the last element.
  The wordmark is decorative, aria-hidden, and unselectable.
-->
<script lang="ts">
  import { GITHUB_URL } from '$lib/constants'
  import release from '$lib/generated/release.json'

  const copyrightYear = new Date().getFullYear()
</script>

<footer class="mx-auto w-full max-w-[90rem] px-4 pb-10 pt-8 sm:px-6 lg:px-8">
  <p class="footer-ghost font-nav select-none" aria-hidden="true">UNIPTY</p>
  <div
    class="text-muted-foreground mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-[12.5px]"
  >
    <div class="flex flex-wrap items-center gap-x-5 gap-y-2">
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        class="hover:text-primary transition-colors motion-reduce:transition-none"
      >
        GitHub ↗
      </a>
      <a href="/catalog/catalog.json" class="hover:text-primary transition-colors motion-reduce:transition-none">
        Release catalog (byte-identical copy) ↘
      </a>
    </div>
    <p>
      Catalog sha256 <code>{release.sha256.slice(0, 12)}</code> · Copyright © {copyrightYear} UniPty
      contributors · MIT
    </p>
  </div>
</footer>

<style>
  .footer-ghost {
    font-size: clamp(3rem, 11vw, 9rem);
    line-height: 0.9;
    color: transparent;
    -webkit-text-stroke: 1px color-mix(in oklab, var(--color-border) 55%, transparent);
  }

  @supports not (-webkit-text-stroke: 1px black) {
    .footer-ghost {
      color: color-mix(in oklab, var(--color-border) 35%, transparent);
    }
  }
</style>
