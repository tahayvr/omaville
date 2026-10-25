<!-- A card of the chrome (shadcn-svelte's Card): glass with a hairline ring, placed by the page's CSS (.ow-card). -->
<script>
  import { Card } from "$lib/components/ui/card/index.js";
  import { cn } from "$lib/utils.js";
  let { class: className = "", el = $bindable(null), children, ...rest } = $props();
</script>

<Card bind:ref={el} class={cn("ow-card gap-0 py-0 text-[length:inherit] leading-[inherit] ring-border", className)} {...rest}>
  {@render children?.()}
</Card>
