<!-- Commits per day as bars (shadcn-svelte's Chart, a LayerChart bar chart): the last week in ink, or one day
     marked; with `onpick` a bar opens its day, with `onhover` the hovered day lights. -->
<script>
  import * as Chart from "$lib/components/ui/chart/index.js";
  import { BarChart } from "layerchart";
  import { cn } from "$lib/utils.js";
  import { day, wday, plural } from "../client/format.js";
  let { series, days, hiLast = 7, mark = -1, lit = -1, tips = true, class: className = "h-[46px]", onpick = null, onhover = null } = $props();
  const rows = $derived(series.map((v, i) => ({ i, v })));
  const ink = (d) => (mark >= 0 ? (d.i === mark || d.i === lit ? 1 : 0.35) : d.i === lit ? 1 : d.i >= series.length - hiLast ? 0.95 : 0.45);
  const config = { v: { label: "Commits", color: "var(--anatomy-mid)" } };
  let context = $state();
  $effect(() => { if (onhover) onhover(context?.tooltip?.data?.i ?? null); });
</script>

<Chart.Container {config} class={cn("aspect-auto w-full", className)} role="img" aria-label="Commits per day over {series.length} days">
  <BarChart bind:context data={rows} x="i" y="v" series={[{ key: "v", value: "v", color: "var(--color-v)" }]} axis={false} grid={false} rule={false}
    bandPadding={0.12} padding={{ top: 2, right: 0, bottom: 0, left: 0 }} tooltipContext={tips} props={{ bars: { fillOpacity: ink, rounded: "none", stroke: "none", strokeWidth: 0 } }}
    onBarClick={(_, { data }) => onpick?.(data.i)}>
    {#snippet tooltip()}
      {#if tips}<Chart.Tooltip hideIndicator labelFormatter={(i) => `${wday(days[i].at)} ${day(days[i].at)}`} formatter={commits} />{/if}
    {/snippet}
  </BarChart>
</Chart.Container>

{#snippet commits({ value })}<span class="font-mono">{plural(value, "commit")}</span>{/snippet}
