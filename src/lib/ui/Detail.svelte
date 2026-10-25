<!-- The detail card: the overview, or whatever is selected (a repository or district, a person, a house, a day, a
     team, a patron's board or a ward). Rows that name something open it, and light it on hover. -->
<script>
  import Spark from "./Spark.svelte";
  import Bars from "./Bars.svelte";
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import Panel from "./Panel.svelte";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { fmt, day, wday, plural, ago, longDate } from "../client/format.js";
  let { ui, onpick, onhover, onclose, el = $bindable(null) } = $props();
  const L = $derived((ui.rev, ui.L));
  const sel = $derived(ui.selected);
  const stamp = $derived((ui.rev, L?.M.generatedAt ? "Updated " + ago(L.M.generatedAt) + "." : ""));
  const station = (n) => "station:" + n;
  const person = (n) => { const i = L.pidx(n); return i >= 0 ? "person:" + i : ""; };
  // a row hovered in the card lights what it names
  const hover = (t) => onhover(t ? { ...t, key: "list" } : null);
  let viewport = $state(null);
  $effect(() => { sel; if (viewport) viewport.scrollTop = 0; });
</script>

{#snippet head(kind, title, closable = true)}
  <span class="ow-hbtns">
    <IconButton label="Collapse the detail card" size="icon-xs" onclick={() => ui.fold("detail", true)}><Icon name="min" /></IconButton>
    {#if closable}<IconButton label="Close" hint="Esc" size="icon-xs" onclick={onclose}><Icon name="close" /></IconButton>{/if}
  </span>
  <div class="ow-kind">{kind}</div>
  <h2>{title}</h2>
{/snippet}
{#snippet link(href, text)}<Button {href} target="_blank" rel="noopener" variant="outline" size="xs" class="font-normal hover:border-ring hover:text-ring">{text} ↗</Button>{/snippet}
{#snippet stats(cells)}
  <div class="ow-stats">{#each cells as [b, s]}<div><b>{b}</b><span>{s}</span></div>{/each}</div>
{/snippet}
{#snippet sec(title, right, body)}
  <div class="ow-sec"><div class="ow-eyebrow"><span>{title}</span><span>{right ?? ""}</span></div>{@render body()}</div>
{/snippet}
{#snippet sparkSec(series, title = "Commits per day")}
  {#snippet body()}<Spark {series} days={L.DAYS} /><div class="ow-axis"><span>{day(L.DAYS[0].at)}</span><span>last 7 days in ink</span><span>{day(L.DAYS[29].at)}</span></div>{/snippet}
  {@render sec(title, "30 days", body)}
{/snippet}
{#snippet changes(list)}
  <ol class="ow-list">{#each list as l}<li><span>{l.text}</span><i>{l.sub}</i></li>{/each}</ol>
{/snippet}
{#snippet bars(rows, max, go)}<Bars {rows} {max} {go} {onpick} onhover={hover} />{/snippet}

{#snippet overview()}
  {@const T = L.totals()}
  {@const hot = Object.entries(L.R).filter(([, r]) => r.c7 > 0).sort((a, b) => b[1].c7 - a[1].c7).slice(0, 6)}
  {@const crew7 = L.PEOPLE.map((p, i) => [p.n, p.c7, "", i]).filter((p) => p[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)}
  {@const best = L.DAYS.reduce((a, d, i) => (d.n > L.DAYS[a].n ? i : a), 0)}
  <div class="ow-dhead">
    {@render head("Overview · this week", L.M.name, false)}
    <p>{plural(T.c7, "commit")} in the last 7 days across {plural(Object.values(L.R).filter((r) => r.c7).length, "repository", "repositories")}. The busiest day of the window was {wday(L.DAYS[best].at)} {day(L.DAYS[best].at)}, with {plural(L.DAYS[best].n, "commit")}.</p>
  </div>
  {@render stats([[fmt(T.c30), "commits, 30 days"], [fmt(T.c7), "last 7 days"], [fmt(T.pr), "open pull requests"], [fmt(T.un), "still on branches"]])}
  {@render sparkSec(L.DAYS.map((d) => d.n), "Whole plant")}
  {#snippet busy()}{@render bars(hot.map(([n, r]) => [n, r.c7, L.repoKind(n)]), hot[0] ? hot[0][1].c7 : 1, station)}{/snippet}
  {@render sec("Busiest stations", "7 days", busy)}
  {#snippet busyPeople()}{@render bars(crew7, crew7[0] ? crew7[0][1] : 1, (i) => "person:" + i)}{/snippet}
  {@render sec("Busiest people", "7 days", busyPeople)}
  <div class="ow-foot">Hover anything on the map for numbers, click to open it. {stamp}</div>
{/snippet}

<!-- a contributor's house: lifetime work, this week's work, and where it went -->
{#snippet house(id)}
  {@const login = id.slice("person:".length)}
  {@const c = L.contributor(login) || { login, total: 0, repos: [] }}
  {@const p = L.PEOPLE.find((x) => x.gh === login)}
  <div class="ow-dhead">
    {@render head("Contributor · one tower per person", login)}
    <p>A tower in the contributors' quarter for every person who contributed to the foundation's public repositories. Height follows lifetime commits on the city's one scale; the lamp is lit by a commit in the last 7 days.</p>
    {#if c.first}<p class="ow-first">First contribution: {longDate(c.first[0])}, in {c.first[1]}.</p>{/if}
    <div class="ow-links">{@render link(`https://github.com/${encodeURIComponent(login)}`, "GitHub")}</div>
  </div>
  {@render stats([[fmt(c.total), "commits, lifetime"], [fmt(p ? p.c30 : 0), `last ${L.WIN} days`], [fmt(p ? p.c7 : 0), "last 7 days"], [fmt(c.repos.length), "repositories"]])}
  {#if c.repos.length}
    {#snippet where()}{@render bars(c.repos.map(([r, n]) => [r, n, L.R[r]?.desc ?? ""]), c.repos[0][1], station)}{/snippet}
    {@render sec("Where the work went", "commits", where)}
  {/if}
  <div class="ow-foot">{stamp}</div>
{/snippet}

<!-- a station that is neither a repository nor a district: the patron boards, wards, and anything a kit adds -->
{#snippet plain(id)}
  {@const s = L.ST[id] || {}}
  <div class="ow-dhead">
    {@render head(s.kind || "Station", s.title || id)}
    {#if s.what}<p>{s.what}</p>{/if}
    {#if s.href}<div class="ow-links">{@render link(s.href, `${s.link || "Open"}`)}</div>{/if}
  </div>
  {#if s.list?.length}
    {#snippet listed()}{@render changes(s.list.map((x) => ({ text: x, sub: "" })))}{/snippet}
    {@render sec("Listed", s.list.length, listed)}
  {/if}
  <div class="ow-foot">{stamp}</div>
{/snippet}

{#snippet stationCard(id)}
  {@const ids = L.membersOf(id)}
  {@const r = L.R[id]}
  {@const grp = L.isGroup(id)}
  {@const c30 = L.sumOf(ids, "c30")}
  {@const desc = grp ? L.ST[id]?.what || "" : r?.desc || L.ST[id]?.what || ""}
  <div class="ow-dhead">
    {@render head(grp ? "District · " + ids.length + " repos" : L.repoKind(id), grp ? L.groupName(id) : id)}
    {#if desc}<p>{desc}</p>{/if}
    {#if !grp && r}<div class="ow-links">{@render link(L.ghRepo(id), "Repository")}{@render link(`${L.ghRepo(id)}/pulls`, "Pull requests")}{@render link(`${L.ghRepo(id)}/branches`, "Branches")}</div>{/if}
  </div>
  {@render stats([[fmt(c30), "commits, 30 days"], [fmt(L.sumOf(ids, "c7")), "last 7 days"], [fmt(L.sumOf(ids, "unmerged")), "still on branches"], [fmt(L.sumOf(ids, "pr")), "open pull requests"]])}
  {#if c30}{@render sparkSec(L.seriesOf(ids))}{/if}
  {#if grp}
    {@const mem = ids.map((x) => [x, L.R[x] ? L.R[x].c30 : 0, L.R[x]?.desc ?? ""]).sort((a, b) => b[1] - a[1])}
    {#snippet repos()}{@render bars(mem, Math.max(1, mem[0][1]), station)}{/snippet}
    {@render sec("Repositories", ids.length, repos)}
  {/if}
  {@const tp = L.topPeople(ids, 8)}
  {#if tp.length}
    {#snippet who()}{@render bars(tp, tp[0][1], person)}{/snippet}
    {@render sec("Who is working here", "commits", who)}
  {/if}
  {@const lt = L.latestOf(ids, 5)}
  {#if lt.length}
    {#snippet latest()}{@render changes(lt.map((l) => ({ text: l[2], sub: `${l[1]}${grp ? " · " + l[3] : ""} · ${day(l[0])}` })))}{/snippet}
    {@render sec("Latest changes", "", latest)}
  {/if}
  {#if !c30}<div class="ow-foot">No commits here in the {L.WIN} days to {L.TO}.</div>{/if}
  <div class="ow-foot">{stamp}</div>
{/snippet}

{#snippet personCard(i)}
  {@const p = L.PEOPLE[i]}
  {@const teams = (p.member ? "Org member" : p.teams?.length ? "Team" : p.bc ? "Basecamp" : "Contributor") + (p.teams?.length ? " · " + p.teams.join(", ") : "")}
  {@const reps = p.repos || []}
  {@const pdays = p.days || new Array(30).fill(0)}
  <div class="ow-dhead">
    {@render head(teams, p.n)}
    {#if p.focus}<p>{p.focus}</p>{/if}
    {#if p.gh}<div class="ow-links">{@render link(`https://github.com/${encodeURIComponent(p.gh)}`, `@${p.gh}`)}{@render link(`https://github.com/search?q=org%3A${encodeURIComponent(L.M.org)}+author%3A${encodeURIComponent(p.gh)}&type=commits`, "Commits")}</div>{/if}
  </div>
  {@render stats([[fmt(p.c30), "commits, 30 days"], [fmt(p.c7), "last 7 days"], [fmt(reps.length), "stations"], [fmt(Math.max(...pdays)), "best day"]])}
  {#if p.c30}
    {@render sparkSec(pdays)}
    {#snippet stations()}{@render bars(reps.slice(0, 8).map(([n, v]) => [n, v, L.repoKind(n)]), reps[0][1], station)}{/snippet}
    {@render sec("Stations", "commits", stations)}
  {/if}
  {#if p.wards?.length}
    {#snippet bc()}{@render bars(p.wards.slice(0, 6).map(([id, v]) => [L.ST["ward:" + id]?.title ?? "A project", v, "", "ward:" + id]), p.wards[0][1], station)}{/snippet}
    {@render sec("Basecamp", "events, 30 days", bc)}
  {/if}
  {#if p.c30 && p.latest?.length}
    {#snippet latest()}{@render changes(p.latest.map((l) => ({ text: l[2], sub: `${l[1]} · ${day(l[0])}` })))}{/snippet}
    {@render sec("Latest changes", "", latest)}
  {/if}
  {#if p.c30}<div class="ow-foot">Every station they touched is lit on the map.</div>
  {:else if p.wards?.length}<div class="ow-foot">No commits in the {L.WIN} days to {L.TO}; their Basecamp projects are lit on the map.</div>
  {:else}<div class="ow-foot">{p.member ? "A member of the org" : "On one of the org's teams"}, with no commits in the {L.WIN} days to {L.TO}. Nothing is lit on the map.</div>{/if}
{/snippet}

{#snippet dayCard(i)}
  {@const d = L.DAYS[i]}
  {@const T = L.totals()}
  <div class="ow-dhead">
    {@render head("Output · one day", `${wday(d.at)} ${day(d.at)}`)}
    <p>{plural(d.n, "commit")} by {plural(d.people, "person", "people")}. Day {i + 1} of the 30-day window.</p>
  </div>
  {@render stats([[fmt(d.n), "commits"], [fmt(d.people), "people"], [d.repos[0] ? fmt(d.repos[0][1]) : "0", "at the busiest station"], [fmt(Math.round(T.c30 / 30)), "daily average"]])}
  {#snippet plant()}<Spark series={L.DAYS.map((x) => x.n)} days={L.DAYS} mark={i} hiLast={0} /><div class="ow-axis"><span>{day(L.DAYS[0].at)}</span><span>this day in colour</span><span>{day(L.DAYS[29].at)}</span></div>{/snippet}
  {@render sec("Whole plant", "30 days", plant)}
  {#if d.repos.length}
    {#snippet busiest()}{@render bars(d.repos.map(([n, v]) => [n, v, L.repoKind(n)]), d.repos[0][1], station)}{/snippet}
    {@render sec("Busiest stations", "commits", busiest)}
  {/if}
  {#if d.top.length}
    {#snippet who()}{@render bars(d.top, d.top[0][1], person)}{/snippet}
    {@render sec("Who worked", "commits", who)}
  {/if}
  {#if d.latest.length}
    {#snippet last()}{@render changes(d.latest.map((l) => ({ text: l[3], sub: `${l[1]} · ${l[2]}` })))}{/snippet}
    {@render sec("Last changes that day", "", last)}
  {/if}
{/snippet}

<!-- a team (the members' city): its people and where they worked, their trail lit across the city -->
{#snippet teamCard(t)}
  {@const people = L.PEOPLE.filter((p) => (p.teams ?? []).includes(t))}
  {@const tr = L.trail({ kind: "team", id: t })}
  <div class="ow-dhead">
    {@render head("Team", t)}
    <p>{people.length} {people.length === 1 ? "person" : "people"}; their houses and the repositories they worked on in 30 days are lit.</p>
  </div>
  {#if people.length}
    {#snippet who()}{@render bars(people.map((p) => [p.n, p.c30, "", L.PEOPLE.indexOf(p)]).sort((a, b) => b[1] - a[1]), Math.max(1, ...people.map((p) => p.c30)), (i) => "person:" + i)}{/snippet}
    {@render sec("People", "commits · 30 d", who)}
  {/if}
  {#if tr?.counts.length}
    {#snippet where()}{@render bars(tr.counts.map(([r, n]) => [r, n, "", r]), tr.counts[0][1], station)}{/snippet}
    {@render sec("Where they worked", "commits · 30 d", where)}
  {/if}
{/snippet}

<Panel class="ow-detail" role="complementary" aria-live="polite" bind:el
  hidden={!L || ui.folded.detail || (ui.narrow && !sel && !ui.wantOverview)}>
  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={viewport}>
  {#if L}
    {#if !sel}{@render overview()}
    {:else if sel.kind === "person"}{@render personCard(sel.id)}
    {:else if sel.kind === "team"}{@render teamCard(sel.id)}
    {:else if sel.kind === "day"}{@render dayCard(sel.id)}
    {:else if !L.isGroup(sel.id) && !L.R[sel.id] && L.ST[sel.id]}
      {#if L.ST[sel.id].kind === "Contributor"}{@render house(sel.id)}{:else}{@render plain(sel.id)}{/if}
    {:else}{@render stationCard(sel.id)}{/if}
  {/if}
  </ScrollArea>
</Panel>
