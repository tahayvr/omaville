<!-- An icon button in the chrome (shadcn-svelte's Button, ghost), with its name as a tooltip. -->
<script>
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { cn } from "$lib/utils.js";
  // label: what it does (the tooltip and the accessible name); hint: its key, shown after the label
  let { label, hint = "", size = "icon-sm", variant = "ghost", pressed = undefined, class: className = "", ref = $bindable(null), children, ...rest } = $props();
</script>

<Tooltip.Root>
  <Tooltip.Trigger>
    {#snippet child({ props })}
      <Button {...props} {...rest} bind:ref {variant} {size} aria-label={label} aria-pressed={pressed}
        class={cn("ow-btn text-muted-foreground hover:text-foreground aria-pressed:text-ring aria-pressed:bg-accent aria-busy:opacity-50", className)}>
        {@render children?.()}
      </Button>
    {/snippet}
  </Tooltip.Trigger>
  <Tooltip.Content>{label}{#if hint}<span class="ml-2 opacity-60">{hint}</span>{/if}</Tooltip.Content>
</Tooltip.Root>
