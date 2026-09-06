<!--
  UniPty overview page · zh 镜像 at `/zh/`（2026-09-06 site-i18n-zh）。
  与 en 页同构（同一 home-page 组件），文案取自 README-zh.md（i18n/locales/zh.ts）；
  head 与 en 页同组 hreflang（en/zh/x-default）+ 指向 /zh/ 的 canonical。
-->
<script lang="ts">
  import HomePage from '$lib/pages/home-page.svelte'
  import { zh } from '$lib/i18n/locales/zh'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{zh.home.meta.title}</title>
  <meta name="description" content={zh.home.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/zh/`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/`} />
</svelte:head>

<HomePage content={zh.home} locale="zh" />
