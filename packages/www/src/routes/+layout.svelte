<script lang="ts">
  import '../app.css'
  import { page } from '$app/state'
  import SiteFooter from '$lib/components/site-footer.svelte'
  import SiteHeader from '$lib/components/site-header.svelte'
  import { installThemeSync } from '$lib/theme'
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'

  let { children }: { children: Snippet } = $props()

  onMount(() => {
    return installThemeSync()
  })
</script>

<a href="#main" class="skip-link">Skip to content</a>
<div class="bg-background text-foreground flex min-h-screen flex-col">
  <SiteHeader pathname={page.url.pathname} />
  <main id="main" class="flex-1">
    {@render children()}
  </main>
  <SiteFooter />
</div>
