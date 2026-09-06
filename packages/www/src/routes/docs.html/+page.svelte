<!--
  UniPty documentation page · en at `/docs.html`.
  Content-driven (2026-09-06 site-i18n-zh): body in lib/pages/docs-page.svelte;
  this file injects the en dictionary and the locale head. The toc data comes
  from this route's +page.ts load() (the layout's chrome snippet composes the
  rail from it).
-->
<script lang="ts">
  import DocsPage from '$lib/pages/docs-page.svelte'
  import { en } from '$lib/i18n/locales/en'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{en.docs.meta.title}</title>
  <meta name="description" content={en.docs.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/docs.html`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/docs.html`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/docs.html`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/docs.html`} />
</svelte:head>

<DocsPage content={en.docs} />
