<!--
  jixoai layout law: the interactive atom. Two variants, one press physics —
  lift toward the viewer on hover, press back into the page on active.
-->
<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    variant?: 'primary' | 'outline' | 'copied'
    href?: string
    /** Force external treatment; defaults to auto-detection for non-root-relative hrefs. */
    external?: boolean
    onclick?: () => void
    type?: 'button' | 'submit'
    ariaLabel?: string
    children: Snippet
  }

  let {
    variant = 'outline',
    href,
    external,
    onclick,
    type = 'button',
    ariaLabel,
    children,
  }: Props = $props()

  const base =
    'inline-flex items-center gap-2.5 border border-border px-3.5 py-2.5 text-sm font-medium transition-[transform,box-shadow,background-color] duration-150 motion-reduce:transition-none shadow-xs hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-md active:translate-x-px active:translate-y-px active:shadow-none'
  const variants = {
    primary: 'bg-primary text-primary-foreground',
    outline: 'bg-background hover:bg-muted',
    copied: 'bg-secondary text-secondary-foreground',
  } as const
  const classes = $derived(`${base} ${variants[variant]}`)
  const isExternal = $derived(external ?? (href !== undefined && !href.startsWith('/')))
</script>

{#if href}
  <a
    {href}
    target={isExternal ? '_blank' : undefined}
    rel={isExternal ? 'noreferrer' : undefined}
    aria-label={ariaLabel}
    class={classes}
  >
    {@render children()}
  </a>
{:else}
  <button {type} {onclick} aria-label={ariaLabel} class={classes}>{@render children()}</button>
{/if}
