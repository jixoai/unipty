<!--
  UniPty compatibility page · en at `/compatibility.html`.
  Content-driven (2026-09-06 site-i18n-zh): body in
  lib/pages/compatibility-page.svelte; this file injects the en dictionary
  and the locale head. All catalog-derived evidence strings render verbatim
  from the build-time artifact in both locales.
-->
<script lang="ts">
  import CompatibilityPage from '$lib/pages/compatibility-page.svelte'
  import { en } from '$lib/i18n/locales/en'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{en.compatibility.meta.title}</title>
  <meta name="description" content={en.compatibility.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/compatibility.html`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/compatibility.html`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/compatibility.html`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/compatibility.html`} />
</svelte:head>

<CompatibilityPage content={en.compatibility} />
