<!-- The people card: everyone who committed in the window, the team roster and the org's members, most active
     first; in the members' city also Basecamp work, avatars and a team filter. -->
<script>
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import Panel from "./Panel.svelte";
  import Meter from "./Meter.svelte";
  import * as Avatar from "$lib/components/ui/avatar/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { Badge } from "$lib/components/ui/badge/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { fmt } from "../client/format.js";
  let { ui, onpick, onhover, el = $bindable(null) } = $props();
  let list = $state(null); // the scroll area's viewport
  const L = $derived((ui.rev, ui.L));
  const people = $derived(L ? L.PEOPLE : []);
  const teams = $derived(L ? L.teams() : []);
  const maxC = $derived(Math.max(1, ...people.map((p) => p.c30)));
  const maxW = $derived(Math.max(1, ...people.map((p) => p.w30 ?? 0)));
  const work = $derived(people.some((p) => p.w30 != null)); // Basecamp work (the members' city)
  const rows = $derived.by(() => {
    ui.rev;
    const s = ui.crewSort, idx = people.map((p, i) => i).filter((i) => !ui.crewTeam || (people[i].teams ?? []).includes(ui.crewTeam));
    const byName = (a, b) => people[a].n.localeCompare(people[b].n, "en", { sensitivity: "base" });
    idx.sort(s === "name" ? byName : (a, b) => people[b][s] - people[a][s] || people[b].c30 - people[a].c30 || byName(a, b));
    let rank = 0;
    return idx.map((i) => {
      const p = people[i], quiet = !p.c30 && !p.w30;
      return { i, p, quiet, rank: s === "name" || (s === "c7" ? !p.c7 : quiet) ? "" : ++rank,
        title: (p.gh ? "@" + p.gh + (p.focus ? " · " : "") : "") + (p.focus || (quiet ? "No commits in the last 30 days" : "")),
        n: quiet ? "—" : !p.c30 && p.w30 ? `${fmt(p.w30)} in Basecamp` : s === "c7" ? `${fmt(p.c7)} wk · ${fmt(p.c30)}` : `${fmt(p.c30)} · ${fmt(p.c7)} wk` };
    });
  });
  const current = (i) => !!(ui.selected && ui.selected.kind === "person" && ui.selected.id === i);
  function sortBy(by) { if (!by || by === ui.crewSort) return; ui.sort(by); if (list) list.scrollTop = 0; }
  function team(t) { t ||= null; if (t === ui.crewTeam) return; ui.crewTeam = t; if (list) list.scrollTop = 0; t ? onpick("team", t) : onpick(null); }
</script>

<Panel class="ow-crew" role="complementary" aria-label="People" bind:el hidden={!L || ui.folded.crew}>
  <div class="ow-card-head">
    <span class="ow-eyebrow"><Icon name="people" />People · <span>{people.length}</span></span>
    <ToggleGroup.Root type="single" variant="outline" size="sm" class="ow-sort" aria-label="Sort the crew" value={ui.crewSort} onValueChange={sortBy}>
      {#each [["c30", "30d", "Commits in 30 days"], ["c7", "7d", "Commits in 7 days"], ["name", "A–Z", "By name"]] as [k, label, title]}
        <ToggleGroup.Item value={k} {title} class="h-5 px-1.5 font-mono text-[10.5px] data-[state=on]:bg-accent data-[state=on]:text-ring">{label}</ToggleGroup.Item>
      {/each}
    </ToggleGroup.Root>
    <IconButton label="Collapse the people card" size="icon-xs" onclick={() => ui.fold("crew", true)}><Icon name="min" /></IconButton>
  </div>
  {#if teams.length}
    <!-- the team filter: the list narrows to a team and the city lights what it touched -->
    <ToggleGroup.Root type="single" variant="outline" size="sm" spacing={1} class="ow-teams" aria-label="Filter by team" value={ui.crewTeam ?? ""} onValueChange={team}>
      {#each ["", ...teams] as t}<ToggleGroup.Item value={t} class="h-[18px] px-2 font-mono text-[10px] tracking-wide data-[state=on]:bg-accent data-[state=on]:text-ring">{t || "all"}</ToggleGroup.Item>{/each}
    </ToggleGroup.Root>
  {/if}
  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={list}>
  <ol class="ow-people" onpointerleave={() => onhover(null)}>
    {#each rows as r (r.i)}
      <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
      <li class="ow-person" class:ow-quiet={r.quiet} role="button" tabindex="0" title={r.title} aria-current={current(r.i)}
        onclick={() => onpick("person", r.i)} onkeydown={(e) => e.key === "Enter" && onpick("person", r.i)}
        onpointerover={() => onhover({ kind: "person", id: r.i, key: "crew" })}>
        <span class="ow-rank">{r.rank}</span>
        <b>{#if r.p.av}<Avatar.Root class="ow-av size-4 rounded-none"><Avatar.Image src={r.p.av} alt="" loading="lazy" referrerpolicy="no-referrer" /><Avatar.Fallback class="rounded-none text-[8px]">{r.p.n[0]}</Avatar.Fallback></Avatar.Root>{/if}{r.p.n}{#if r.p.member}<Badge variant="outline" class="ow-org ml-1.5 h-4 border-ring px-1 font-mono text-[9px] tracking-wider text-ring uppercase" title="Member of the omacom org">org</Badge>{/if}</b>
        <em>{r.n}</em>
        <Meter value={r.p.c30} over={r.p.c7} max={maxC} accent={current(r.i)} class="ow-bar2" />
        {#if work}<Meter value={r.p.w30 ?? 0} over={r.p.w7 ?? 0} max={maxW} tone="work" class="ow-bar2 ow-work" title="Basecamp: {fmt(r.p.w30 ?? 0)} in 30 days, {fmt(r.p.w7 ?? 0)} this week" />{/if}
      </li>
    {/each}
  </ol>
  </ScrollArea>
</Panel>
<Button variant="outline" size="icon-lg" class="ow-restore ow-restore-crew" aria-label="Show the people" hidden={!L || !ui.folded.crew} onclick={() => ui.fold("crew", false)}><Icon name="people" size="1.1em" /></Button>
