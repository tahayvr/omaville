<!-- The tooltip: numbers for whatever is under the pointer (a station, a part of its dock, a day, a house, a total). -->
<script>
  import Spark from "./Spark.svelte";
  import { Card } from "$lib/components/ui/card/index.js";
  import { fmt, day, wday } from "../client/format.js";
  let { ui } = $props();
  let el = $state(null);
  const t = $derived(ui.tip);
  const L = $derived((ui.rev, ui.L));
  // where it goes: beside the pointer, flipped to stay inside the page (after the content is drawn)
  $effect(() => {
    if (!t || !el) return;
    info; // re-place when the content changes
    const r = el.parentElement.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight;
    let left = t.x - r.left + 18, top = t.y - r.top + 18;
    if (left + w > r.width - 10) left = t.x - r.left - w - 18;
    if (top + h > r.height - 10) top = Math.max(10, t.y - r.top - h - 18);
    el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  });
  const info = $derived.by(() => {
    if (!t || !L) return null;
    const g = t.target;
    if (g.kind === "day") return { day: L.DAYS[g.id] };
    const id = g.id, { R, ST } = L;
    if (ST[id]?.kind === "Contributor") {
      const login = id.slice("person:".length), c = L.contributor(login) || { total: 0, repos: [] }, p = L.PEOPLE.find((x) => x.gh === login);
      return { house: { login, c, p } };
    }
    const ids = L.membersOf(id), r = R[id], grp = L.isGroup(id), sum = (k) => L.sumOf(ids, k);
    const name = L.nameOf(id);
    const kind = g.role === "pallet" ? "Pallet · open pull requests of " + id : g.role === "rack" ? "Capsules · work on branches of " + id : g.role === "worker" ? "Crew at " + id : g.role === "belt" ? "Belt · carrying this week's commits from " + (grp ? L.groupName(id) : id) : grp ? "District · " + ids.length + " repos" : L.repoKind(id);
    const desc = grp ? ST[id]?.what || "" : r?.desc || ST[id]?.what || "";
    const c30 = sum("c30"), c7 = sum("c7");
    const cells = g.role === "pallet" ? [[fmt(sum("pr")), "open PRs", true], [fmt(c30), "commits · 30 d"], [fmt(sum("unmerged")), "on branches"]]
      : g.role === "rack" ? [[fmt(sum("unmerged")), "on branches", true], [fmt(c30), "commits · 30 d"], [fmt(sum("pr")), "open PRs"]]
      : [[fmt(c30), "commits · 30 d"], [fmt(c7), "last 7 days", c7 > 0], [fmt(grp ? ids.filter((x) => R[x]?.c30).length : r ? r.people : 0), grp ? "active repos" : "people"], [fmt(sum("pr")), "open PRs"]];
    return { station: { name, kind, desc, cells, c30, pr: sum("pr"), series: c30 ? L.seriesOf(ids) : null, top: L.topPeople(ids, 3), latest: L.latestOf(ids, 1)[0], worker: g.role === "worker" } };
  });
</script>

{#snippet trow(cells)}
  <div class="ow-trow">{#each cells as [b, s, hot]}<div class={hot ? "ow-hot" : ""}><b>{b}</b><span>{s}</span></div>{/each}</div>
{/snippet}

<!-- a Card that follows the pointer: no shadcn tooltip can, since the map has no element per station -->
<Card bind:ref={el} class="ow-tip gap-0 py-0 text-[length:inherit] leading-[inherit]" role="tooltip" hidden={!t}>
  {#if info?.day}
    {@const d = info.day}
    <div class="ow-kind">Output · {wday(d.at)}</div><h3>{day(d.at)} {L.YEAR}</h3>
    {@render trow([[fmt(d.n), "commits"], [d.people, "people"]])}
    <div class="ow-tline">Busiest: {#each d.repos.slice(0, 3) as [n, c], i}{i ? " · " : ""}<b>{n}</b> {c}{/each}</div>
    <div class="ow-tline">Most commits: {#each d.top.slice(0, 3) as [n, c], i}{i ? " · " : ""}<b>{n}</b> {c}{/each}</div>
    <div class="ow-hint">Click for the day</div>
  {:else if info?.house}
    {@const { login, c, p } = info.house}
    <div class="ow-kind">Contributor · one tower per person</div><h3>{login}</h3>
    {@render trow([[fmt(c.total), "commits, lifetime"], [fmt(p ? p.c7 : 0), "last 7 days", !!(p && p.c7)], [fmt(c.repos.length), "repos"]])}
    {#if c.repos.length}<div class="ow-tline">Most in: {#each c.repos.slice(0, 3) as [n, k], i}{i ? " · " : ""}<b>{n}</b> {k}{/each}</div>{/if}
    <div class="ow-hint">Click to open</div>
  {:else if info?.station}
    {@const s = info.station}
    <div class="ow-kind">{s.kind}</div><h3>{s.name}</h3>{#if s.desc}<p>{s.desc}</p>{/if}
    {@render trow(s.cells)}
    {#if s.series}<Spark series={s.series} days={L.DAYS} class="ow-tspark h-[22px]" tips={false} />{/if}
    {#if s.top.length}<div class="ow-tline">{s.worker ? "Crew" : "Most active"}: {#each s.top as [n, c], i}{i ? " · " : ""}<b>{n}</b> {c}{/each}</div>{/if}
    {#if s.latest}<div class="ow-tline">Latest: <b>{s.latest[2]}</b> · {s.latest[1]}, {day(s.latest[0])}</div>{/if}
    {#if !s.c30 && !s.pr}<div class="ow-tline">No commits in the 30-day window.</div>{/if}
    <div class="ow-hint">Click to open</div>
  {/if}
</Card>
