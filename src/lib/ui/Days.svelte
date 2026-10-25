<!-- Commits per day across the org, one bar per day of the window; a bar opens its day. The scrubber takes this
     card's place while it is open. -->
<script>
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import Panel from "./Panel.svelte";
  import Spark from "./Spark.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { day } from "../client/format.js";
  let { ui, onpick, onhover, el = $bindable(null) } = $props();
  const L = $derived((ui.rev, ui.L));
  const days = $derived(L ? L.DAYS : []);
  // the hovered day lights its column in the city; the chart's tooltip says the day's commits
  const hover = (i) => { if (i == null) { if (ui.hovered?.key?.startsWith("strip")) onhover(null); } else if (ui.hovered?.key !== "strip" + i) onhover({ kind: "day", id: i, key: "strip" + i }); };
  const picked = $derived(ui.selected?.kind === "day" ? ui.selected.id : ui.hovered?.kind === "day" ? ui.hovered.id : -1);
</script>

<Panel class="ow-days" aria-label="Commits per day" bind:el hidden={!L || ui.folded.days || ui.replaying}>
  {#if L}
    <div class="ow-eyebrow"><span>Commits per day</span><span>{day(days[0].at)} – {day(days[days.length - 1].at)} <IconButton label="Collapse commits per day" size="icon-xs" class="-my-1 -mr-1.5" onclick={() => ui.fold("days", true)}><Icon name="min" /></IconButton></span></div>
    <div class="ow-dbars">
      <Spark series={(ui.rev, days.map((d) => d.n))} {days} hiLast={0} lit={picked} class="h-full" onpick={(i) => onpick("day", i)} onhover={hover} />
    </div>
  {/if}
</Panel>
<Button variant="outline" size="icon-lg" class="ow-restore ow-restore-days" aria-label="Show commits per day" hidden={!L || !ui.folded.days || ui.replaying} onclick={() => ui.fold("days", false)}><Icon name="days" size="1.1em" /></Button>
