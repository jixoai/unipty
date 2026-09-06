<!--
  UniPty compatibility page · zh 镜像 at `/zh/compatibility.html`（2026-09-06
  site-i18n-zh）。与 en 页同构（同一 compatibility-page 组件）；catalog 推导
  的全部证据字符串、状态名与身份串逐字保留（产物数据，不是散文），仅
  说明性 prose 走 zh 字典。
-->
<script lang="ts">
  import CompatibilityPage from '$lib/pages/compatibility-page.svelte'
  import { zh } from '$lib/i18n/locales/zh'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{zh.compatibility.meta.title}</title>
  <meta name="description" content={zh.compatibility.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/zh/compatibility.html`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/compatibility.html`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/compatibility.html`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/compatibility.html`} />
</svelte:head>

<CompatibilityPage content={zh.compatibility} />
