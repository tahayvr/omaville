<!-- A thin bar (shadcn-svelte's Progress): a value on a hairline track, and optionally a second value laid over it
     (30 days and this week). tone: "data" (commits) or "work" (Basecamp, a shade lighter); accent: selected. -->
<script>
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { cn } from "$lib/utils.js";
  let { value, over = null, max, tone = "data", accent = false, class: className = "", title = undefined } = $props();
  const top = $derived(Math.max(1, max));
  // the indicator's ink, written out whole so Tailwind finds each class
  const INK = {
    lo: "[&>[data-slot=progress-indicator]]:bg-(--anatomy-lo)",
    mid: "[&>[data-slot=progress-indicator]]:bg-(--anatomy-mid)",
    hi: "[&>[data-slot=progress-indicator]]:bg-(--anatomy-hi)",
    accent: "[&>[data-slot=progress-indicator]]:bg-(--ow-accent)",
  };
  const base = "h-[3px] rounded-none bg-transparent [&>[data-slot=progress-indicator]]:transition-none";
</script>

<div class={cn("ow-meter relative bg-(--anatomy-faint)", className)} {title}>
  <Progress value={Math.min(value, top)} max={top} class={cn(base, tone === "work" ? INK.lo : INK.mid)} />
  {#if over != null}
    <Progress value={Math.min(over, top)} max={top} class={cn(base, "absolute inset-0", accent ? INK.accent : tone === "work" ? INK.mid : INK.hi)} />
  {/if}
</div>
