<!--
  Theme switcher: light / dark / system segmented group on the terminal bar.
  The bar is always dark, so the group keeps light terminal borders.
-->
<script lang="ts">
  import SunMoon from 'lucide-svelte/icons/sun-moon'
  import { onMount } from 'svelte'
  import { applyTheme, getStoredTheme, persistTheme, type Theme } from '$lib/theme'

  const options: readonly Theme[] = ['light', 'dark', 'system']

  let theme: Theme = $state('system')

  function setTheme(nextTheme: Theme): void {
    theme = nextTheme
    persistTheme(nextTheme)
    applyTheme(nextTheme)
  }

  onMount(() => {
    theme = getStoredTheme()
    applyTheme(theme)
  })
</script>

<div class="flex items-center gap-2">
  <SunMoon class="text-terminal-foreground/72 h-3.5 w-3.5" aria-hidden="true" />
  <div
    class="border-terminal-foreground/30 bg-terminal-muted inline-flex w-fit max-w-full items-center self-start overflow-hidden border shadow-none"
    role="group"
    aria-label="Color theme"
  >
    {#each options as option (option)}
      <button
        type="button"
        aria-pressed={theme === option}
        class={[
          'px-2.5 py-1 text-xs font-medium capitalize transition-colors motion-reduce:transition-none',
          theme === option
            ? 'bg-primary text-primary-foreground'
            : 'text-terminal-foreground/72 hover:bg-terminal-hover hover:text-terminal-foreground',
        ].join(' ')}
        onclick={() => setTheme(option)}
      >
        {option}
      </button>
    {/each}
  </div>
</div>
