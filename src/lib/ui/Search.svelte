<!-- Find a repository, a person, a district, a team, a house, a patron's board or (members) a ward (shadcn-svelte's
     Command, ranked by the city: a name that starts with the query first, then busier). "/" or ⌘K focuses it. -->
<script>
  import * as Command from "$lib/components/ui/command/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  let { ui, onpick, input = $bindable(null) } = $props();
  let q = $state(""), open = $state(false), value = $state("");
  const index = $derived((ui.rev, ui.L ? ui.L.index() : []));
  const hits = $derived.by(() => {
    const s = q.trim().toLowerCase(); if (!s) return [];
    return index.filter((x) => x.label.toLowerCase().includes(s) || x.sub.toLowerCase().includes(s))
      .map((x) => { const l = x.label.toLowerCase(); return [x, l.startsWith(s) ? 3 : l.split(/[-\s.]/).some((w) => w.startsWith(s)) ? 2 : l.includes(s) ? 1 : 0]; })
      .sort((a, b) => b[1] - a[1] || b[0].score - a[0].score).map((p) => p[0]).slice(0, 8);
  });
  $effect(() => { value = hits[0] ? `${hits[0].kind}:${hits[0].id}` : ""; }); // the best hit is highlighted as the query changes
  function choose(x) { q = ""; open = false; input?.blur(); onpick(x.kind, x.id); }
  function key(e) { if (e.key === "Escape") { q = ""; open = false; input?.blur(); } }
</script>

<Command.Root shouldFilter={false} bind:value class="ow-search overflow-visible bg-transparent" label="Find a repo or person">
  <Command.Input bind:ref={input} bind:value={q} placeholder="Find a repo or person" autocomplete="off" spellcheck="false"
    class="text-[13px]" oninput={() => (open = true)} onfocus={() => (open = true)} onkeydown={key} onblur={() => setTimeout(() => (open = false), 150)} />
  <Kbd class="ow-kbd font-mono">/</Kbd>
  {#if open && q.trim()}
    <Command.List class="ow-results max-h-none">
      <Command.Empty class="ow-empty">Nothing matches “{q}”.</Command.Empty>
      {#each hits as x (x.kind + ":" + x.id)}
        <Command.Item class="ow-result" value={`${x.kind}:${x.id}`} onSelect={() => choose(x)}><b>{x.label}</b><span>{x.sub.slice(0, 80)}</span><i>{x.meta}</i></Command.Item>
      {/each}
    </Command.List>
  {/if}
</Command.Root>
