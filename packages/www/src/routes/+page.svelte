<!--
  UniPty overview page · en at `/` (URL stability law: the existing artifact
  URLs never move; the zh mirror lives under /zh/).
  Content-driven (2026-09-06 site-i18n-zh): the page body lives in
  lib/pages/home-page.svelte; this file injects the en dictionary and the
  locale head (canonical + hreflang en/zh/x-default).
-->
<script lang="ts">
  import HomePage from '$lib/pages/home-page.svelte'
  import { en } from '$lib/i18n/locales/en'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{en.home.meta.title}</title>
  <meta name="description" content={en.home.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/`} />
</svelte:head>

<HomePage content={en.home} locale="en" />
