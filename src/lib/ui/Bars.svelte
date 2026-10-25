<!-- A ranked list with a bar per row; a row with `go` opens what it names and lights it on hover. -->
<script>
  import { fmt } from "../client/format.js";
  import Meter from "./Meter.svelte";
  // rows: [name, value, sub, key]; go(key) → "kind:id" or ""
  let { rows, max, go = null, onpick, onhover } = $props();
  const target = (key) => { const g = go?.(key); if (!g) return null; const [kind, id] = g.split(/:(.*)/s); return id ? { kind, id: kind === "person" ? +id : id } : null; };
</script>

<ol class="ow-list">
  {#each rows as [n, v, sub, key], i (i)}
    {@const t = target(key ?? n)}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_to_interactive_role -->
    <li data-go={t ? "1" : undefined} role={t ? "button" : undefined} tabindex={t ? 0 : undefined} onkeydown={(e) => t && e.key === "Enter" && onpick?.(t.kind, t.id)} onclick={() => t && onpick?.(t.kind, t.id)} onpointerover={() => t && onhover?.(t)} onpointerleave={() => t && onhover?.(null)}>
      <span>{n}</span>{#if sub}<i>{sub}</i>{/if}<b>{fmt(v)}</b><Meter value={Math.max(v, max * 0.02)} {max} class="ow-mini" />
    </li>
  {/each}
</ol>
