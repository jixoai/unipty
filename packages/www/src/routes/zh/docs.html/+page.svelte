<!--
  UniPty documentation page · zh 镜像 at `/zh/docs.html`（2026-09-06
  site-i18n-zh）。与 en 页同构（同一 docs-page 组件）；toc 标签走 zh 字典，
  锚点 id 与 en 一致（本路由 +page.ts 返回 zh toc）。
-->
<script lang="ts">
  import DocsPage from '$lib/pages/docs-page.svelte'
  import { zh } from '$lib/i18n/locales/zh'
  import { SITE_URL } from '$lib/constants'
</script>

<svelte:head>
  <title>{zh.docs.meta.title}</title>
  <meta name="description" content={zh.docs.meta.description} />
  <link rel="canonical" href={`${SITE_URL}/zh/docs.html`} />
  <link rel="alternate" hreflang="en" href={`${SITE_URL}/docs.html`} />
  <link rel="alternate" hreflang="zh" href={`${SITE_URL}/zh/docs.html`} />
  <link rel="alternate" hreflang="x-default" href={`${SITE_URL}/docs.html`} />
</svelte:head>

<DocsPage content={zh.docs} />
