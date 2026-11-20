<!-- The board: the org's work as a diagram, beside the city (lib/board/board.js lays it out). People, one string per
     person and repository, and the repositories with what shipped, merged and waits in review; on the right a card
     with the week's digest, or the row that is selected. The rows are drawn by hand (no component draws a diagram's
     nodes); everything around them is the chrome's own. -->
<script>
  import { onMount } from "svelte";
  import { invalidateAll } from "$app/navigation";
  import { mode, toggleMode } from "mode-watcher";
  import { buildBoard, litBy, barsPath, itemsOf, COL, HILL, hillDots } from "$lib/board/board.js";
  import { fmt, day, plural } from "../client/format.js";
  import Panel from "./Panel.svelte";
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import Loading from "./Loading.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Progress } from "$lib/components/ui/progress/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";

  // data null: the relay has no snapshot yet; waiting says why, and the page opens the board once there is one
  let { config, me, data, members = false, waiting = "" } = $props();
  const org = $derived(config.org || data?.org || ""), title = $derived(config.title || `${org} city`);
  let span = $state("week"), selected = $state(null), hovered = $state(null), zoom = $state(null); // zoom null: fit the width
  let mounted = $state(false), theme = $state("light"), viewW = $state(0), barH = $state(48);

  const board = $derived(data ? buildBoard(data, { span }) : null);
  const work = $derived(data?.work?.[span] ?? null);
  const picked = $derived(board && selected && [...board.people, ...board.repos, ...board.wards].some((x) => x.key === selected) ? selected : null);
  const lit = $derived(litBy(board, hovered || picked));
  const wide = $derived(viewW >= 900);
  const fit = $derived(board && viewW ? Math.max(0.45, Math.min(1, (viewW - (wide ? 372 : 0)) / board.W)) : 1);
  const scale = $derived(zoom ?? fit);
  const stateOf = (key) => (lit.size ? (lit.has(key) ? "on" : "dim") : undefined);
  const pick = (key) => { selected = picked === key ? null : key; hovered = null; };

  // how long ago, against the snapshot's own clock: the same words on the server and in the browser
  const since = (t) => { const s = Math.max(0, (data?.now ?? 0) - t); return s < 90 ? "just now" : s < 5400 ? Math.round(s / 60) + " min ago" : s < 129600 ? Math.round(s / 3600) + " h ago" : Math.round(s / 86400) + " days ago"; };
  const label = (i) => (i.n ? `#${i.n} ${i.text}` : i.text);
  const href = (repo, i) => `https://github.com/${org}/${repo}/${i.k === "r" ? `releases/tag/${encodeURIComponent(i.tag)}` : `pull/${i.n}`}`;
  const spanWord = $derived(span === "week" ? "this week" : `in ${board?.days ?? 30} days`);

  // the card on the right: the selected person, repository or project, or the digest
  const detail = $derived.by(() => {
    if (!board || !work) return null;
    const kind = picked?.[0], name = picked?.slice(2);
    if (kind === "p") {
      const row = board.people.find((p) => p.key === picked), p = row.tail ? null : work.list.find((x) => x.n === name);
      const mine = (rows, k) => rows.map(([repo, n, text, at]) => ({ k, n, text, at, repo, meta: repo }));
      return { eyebrow: row.tail ? "People" : "Person", title: row.name, d: row.d,
        stats: row.tail ? [[fmt(row.c), "commits"], [fmt(row.m), "merged"], [String(row.r.length), "repositories"]] : [[fmt(p.c), "commits"], [fmt(p.m), "merged"], [fmt(p.o), "in review"]],
        listTitle: row.tail ? "Where they work" : "Works on", list: row.r,
        sections: row.tail ? [] : [{ title: "Merged", note: `${plural(p.m, "pull request")} ${spanWord}`, items: mine(p.M, "m") }, { title: "In review", note: `${fmt(p.o)} opened ${spanWord}, still open`, items: mine(p.O, "o") }] };
    }
    if (kind === "r") {
      const r = work.repos[name], row = board.repos.find((x) => x.key === picked), it = itemsOf(r), at = (l) => l.map((i) => ({ ...i, repo: name, meta: i.who ?? "" }));
      return { eyebrow: `Repository${row.isPrivate ? ", private" : ""}${row.isNew ? ", new" : ""}`, title: name, d: r.d, desc: data.repos?.[name]?.desc ?? "",
        stats: [[fmt(r.c), "commits"], [fmt(r.m), "merged"], [fmt(r.o), "in review"], [fmt(r.rl), "releases"], [fmt(r.p), "people"]],
        listTitle: "People", list: r.top,
        sections: [{ title: "Shipped", note: r.rl > 1 ? `${r.r0} to ${r.R[0][0]}, ${r.rl} releases` : "1 release", items: at(it.R) },
          { title: "Merged", note: `The latest of ${fmt(r.m)}${r.rt ? `, ${fmt(r.rt)} of them routine` : ""}`, items: at(it.M) },
          { title: "In review", note: `The latest of ${fmt(r.o)} opened ${spanWord}`, items: at(it.O) }] };
    }
    if (kind === "w") {
      const v = board.wards.find((x) => x.key === picked);
      return { eyebrow: "Basecamp project", title: v.name, d: null,
        stats: [[`${v.done} of ${v.total}`, "to-dos done"], [String(v.building), "lists under way"], [String(v.people), "people"]],
        listTitle: "Hill chart", list: v.hill, percent: true, sections: [] };
    }
    const D = board.digest, T = board.totals;
    return { eyebrow: span === "week" ? "This week" : `The last ${board.days} days`, title: "What is happening", d: T.d,
      stats: [[fmt(T.commits), "commits"], [fmt(T.merged), "merged"], [fmt(T.opened), "in review"], [fmt(T.releases), "releases"], [fmt(T.people), "people"], [String(D.fresh.length), "new repositories"]],
      list: [], sections: [
        { title: "Shipped", note: `${plural(T.releases, "release")} across ${plural(T.shippedRepos, "repository", "repositories")}`,
          items: D.shipped.slice(0, 8).map((i) => ({ ...i, meta: i.from ? `from ${i.from} · ${i.count} releases` : "1 release" })), more: D.shipped.length > 8 ? `and ${D.shipped.length - 8} more: ${D.shipped.slice(8).map((i) => i.repo).join(", ")}` : "" },
        { title: "Merged", note: `${plural(T.merged, "pull request")}${T.routine ? `, ${fmt(T.routine)} of them routine` : ""}`, items: D.merged.map((i) => ({ ...i, meta: `${i.repo} · ${i.who}` })) },
        { title: "In review", note: `${fmt(T.opened)} opened ${spanWord} are still open${D.busiest?.o ? `, ${fmt(D.busiest.o)} of them in ${D.busiest.name}` : ""}`, items: D.review.map((i) => ({ ...i, meta: `${i.repo} · ${i.who}` })) },
        ...(D.fresh.length ? [{ title: "New repositories", note: D.fresh.join(", "), items: [] }] : []),
      ] };
  });
  const listMax = $derived(detail?.list?.length ? Math.max(...detail.list.map((x) => x[1]), 1) : 1);

  $effect(() => { theme = mode.current === "dark" ? "dark" : "light"; });
  onMount(() => {
    theme = mode.current === "dark" ? "dark" : "light"; mounted = true;
    // a new scan redraws the board; with no snapshot yet, the page asks until there is one
    const es = typeof EventSource === "undefined" ? null : new EventSource(members ? "/members/events" : "/events");
    es?.addEventListener("snapshot", () => invalidateAll());
    const poll = setInterval(() => { if (!data) invalidateAll(); }, 5000);
    return () => { es?.close(); clearInterval(poll); };
  });
  function keydown(e) { if (e.key === "Escape" && picked) { selected = null; e.preventDefault(); } }
</script>

<svelte:window onkeydown={keydown} />

{#snippet bars(values, w, h)}<svg class="ob-bars" width={w} height={h} aria-hidden="true"><path d={barsPath(values, w, h)} /></svg>{/snippet}

<Tooltip.Provider delayDuration={300}>
<div class="iso ow-root ow-app ob-app" data-theme={theme} data-mounted={mounted || undefined} style:--ob-top="{barH + 30}px" bind:clientWidth={viewW}>
  {#if !data}<Loading {title} stage={0} error="" waiting={waiting || "the relay has no snapshot yet"} />{/if}
  <header class="ob-bar ow-bar" bind:clientHeight={barH}>
    <div class="ow-brand">
      <span class="ow-fig">Fig 2</span><b>{config.name || org}</b><span class="ow-sub">github.com/{org} · the board{members ? " · members' city" : ""}</span>
    </div>
    <nav class="ob-views" aria-label="Views">
      <Button variant="outline" size="sm" href="/">City</Button>
      <Button variant="default" size="sm" href="/board" aria-current="page">Board</Button>
    </nav>
    {#if board}
    <ToggleGroup.Root type="single" variant="outline" size="sm" aria-label="The span of days" value={span} onValueChange={(v) => { if (v) span = v; }}>
      <ToggleGroup.Item value="week" class="px-2.5 font-mono text-[11px] data-[state=on]:bg-accent data-[state=on]:text-ring">{data.work.week.days} days</ToggleGroup.Item>
      <ToggleGroup.Item value="window" class="px-2.5 font-mono text-[11px] data-[state=on]:bg-accent data-[state=on]:text-ring">{data.work.window.days} days</ToggleGroup.Item>
    </ToggleGroup.Root>
    <span class="ob-sub">{day(board.from)} to {day(board.now)}</span>
    <div class="ob-totals" role="group" aria-label="Totals">
      <span><b>{fmt(board.totals.commits)}</b>commits</span><span><b>{fmt(board.totals.merged)}</b>merged</span><span><b>{fmt(board.totals.opened)}</b>in review</span><span><b>{fmt(board.totals.releases)}</b>releases</span><span><b>{fmt(board.totals.people)}</b>people</span>
    </div>
    {/if}
  </header>

  {#if board}
  <div class="ob-view" class:ob-wide={wide}>
    <div style:width="{board.W * scale}px" style:height="{board.H * scale}px">
    <div class="ob-world" style:width="{board.W}px" style:height="{board.H}px" style:transform="scale({scale})">
      <div class="ob-colhead" style:left="{COL.people}px"><b>People</b> the {board.people.filter((p) => !p.tail).length} with the most commits{board.people.some((p) => p.tail) ? ", then the rest" : ""}</div>
      <div class="ob-colhead" style:left="{COL.repos}px"><b>Work {spanWord}</b> {plural(board.repos.length, "repository", "repositories")}, busiest first</div>
      {#if board.wards.length}<div class="ob-colhead" style:left="{COL.wards}px"><b>Basecamp projects</b> by the repositories they steer</div>{/if}

      <svg class="ob-strings" width={board.W} height={board.H} aria-hidden="true">
        <defs>
          {#each board.people as p, i (p.key)}
            <linearGradient id="ob-s-{i}" gradientUnits="userSpaceOnUse" x1={COL.people + COL.peopleW} y1="0" x2={COL.repos} y2="0">
              <stop offset="0.12" style="stop-color:hsl({p.hue} var(--ob-sl))" /><stop offset="0.95" style="stop-color:var(--ob-teal)" />
            </linearGradient>
          {/each}
        </defs>
        {#each board.links as l (l.p + l.r)}
          <path d={l.d} fill="url(#ob-s-{board.people.findIndex((p) => p.key === l.p)})" data-state={lit.size ? (lit.has(l) ? "on" : "dim") : undefined} />
        {/each}
        {#each board.wardLinks as l (l.w + l.r)}
          <path d={l.d} class="ob-wardlink" data-state={lit.size ? (lit.has(l) ? "on" : "dim") : undefined} />
        {/each}
      </svg>

      {#each board.people as p (p.key)}
        <button type="button" class="ob-row ob-person" data-state={stateOf(p.key)} aria-pressed={picked === p.key} style:left="{COL.people}px" style:top="{p.top}px" style:width="{COL.peopleW}px" style:--h={p.hue}
          onclick={() => pick(p.key)} onpointerenter={(e) => { if (e.pointerType === "mouse") hovered = p.key; }} onpointerleave={() => (hovered = null)}>
          <span class="ob-av" aria-hidden="true">{p.initial}</span>
          <span class="ob-main"><b class="ob-name">{p.name}</b><span class="ob-sub ob-clip">{plural(p.c, "commit")}{p.m ? ` · ${fmt(p.m)} merged` : ""}</span></span>
          {#if p.d}{@render bars(p.d, p.d.length > 7 ? 60 : 34, 16)}{/if}
        </button>
      {/each}

      {#each board.repos as r (r.key)}
        <button type="button" class="ob-row ob-card" data-tier={r.tier} data-state={stateOf(r.key)} aria-pressed={picked === r.key} style:left="{COL.repos}px" style:top="{r.top}px" style:width="{COL.reposW}px" style:height="{r.h + (r.tier === 2 ? 1 : 0)}px"
          onclick={() => pick(r.key)} onpointerenter={(e) => { if (e.pointerType === "mouse") hovered = r.key; }} onpointerleave={() => (hovered = null)}>
          <span class="ob-head">
            <b class="ob-name">{r.name}</b>{#if r.isPrivate}<span class="ob-private" title="A private repository">◆</span>{/if}{#if r.isNew}<span class="ob-new">New</span>{/if}
            <span class="ob-sub ob-clip ob-inline">{#if r.inline}<i class="ob-g" data-k={r.inline.k}></i>{label(r.inline)}{/if}</span>
            {@render bars(r.d, r.d.length > 7 ? 60 : 34, 14)}<span class="ob-count">{fmt(r.c)}</span>
          </span>
          {#if r.tier < 2}
            <span class="ob-sub ob-clip">{plural(r.c, "commit")} · {plural(r.p, "person", "people")} · {fmt(r.m)} merged · {fmt(r.o)} in review{r.rl ? ` · ${plural(r.rl, "release")}` : ""}</span>
            {#each r.items as i (i.k + (i.n ?? i.tag))}
              <span class="ob-item"><i class="ob-g" data-k={i.k}></i><span class="ob-clip ob-itext">{label(i)}</span><span class="ob-sub">{i.who ? `${i.who} · ` : ""}{since(i.at)}</span></span>
            {/each}
          {/if}
        </button>
      {/each}

      {#each board.wards as v (v.key)}
        <button type="button" class="ob-row ob-ward" data-state={stateOf(v.key)} aria-pressed={picked === v.key} style:left="{COL.wards}px" style:top="{v.top}px" style:width="{COL.wardsW}px" style:height="{v.h}px"
          onclick={() => pick(v.key)} onpointerenter={(e) => { if (e.pointerType === "mouse") hovered = v.key; }} onpointerleave={() => (hovered = null)}>
          <b class="ob-name">{v.name}</b>
          <svg class="ob-hill" width="196" height="40" aria-hidden="true"><path d={HILL} /><path class="ob-dots" d={hillDots(v.hill)} /></svg>
          <span class="ob-sub ob-clip">{v.hill.length ? v.hill.map((x) => x[0]).join(" · ") : "No hill chart yet"}</span>
          <span class="ob-meter"><i style:width="{v.pct}%"></i></span>
          <span class="ob-sub"><b>{v.done}</b> of {v.total} to-dos done · {v.building} lists under way</span>
          <span class="ob-sub">{v.events} events this week · {plural(v.people, "person", "people")}</span>
        </button>
      {/each}

    </div>
    </div>
    <footer class="ob-legend">
      <div>
        <span><i class="ob-g" data-k="r"></i><b>Released</b> a published release</span>
        <span><i class="ob-g" data-k="m"></i><b>Merged</b> a pull request merged in the span</span>
        <span><i class="ob-g" data-k="o"></i><b>In review</b> opened in the span, still open, not a draft</span>
        <span><svg width="28" height="12" aria-hidden="true"><path d="M0 1C14 1 14 7 28 7L28 11C14 11 14 5 0 5Z" /></svg><b>String</b> one person's commits to one repository, as wide as their square root, in the person's own colour</span>
        <span>{@render bars([3, 5, 2, 4, 6, 4, 3], 20, 12)}<b>Bars</b> commits a day, each row to its own peak, the span's total beside them</span>
      </div>
      <p>Commits are the ones that landed on a default branch. Busiest first counts a commit as one, a merged pull request as two and a release as three. Repositories with nothing in the span are left off, and so are forks and mirrors; bots are left out, and routine pull requests are counted but never listed.</p>
    </footer>
  </div>

  {#if detail}
  <Panel class="ob-panel">
    <div class="ow-card-head">
      <span class="ow-eyebrow">{detail.eyebrow}</span>
      {#if picked}<IconButton label="Clear the selection" hint="Esc" onclick={() => (selected = null)}><Icon name="close" /></IconButton>{/if}
    </div>
    <ScrollArea class="min-h-0 flex-1">
      <div class="ob-detail">
        <h2>{detail.title}</h2>
        {#if detail.desc}<p class="ob-sub">{detail.desc}</p>{/if}
        <div class="ob-stats">{#each detail.stats as [v, k] (k)}<div><b>{v}</b><span class="ob-sub">{k}</span></div>{/each}</div>
        {#if detail.d}<div class="ob-chart">{@render bars(detail.d, 306, 40)}<span class="ob-sub">Commits a day, {day(board.from)} to {day(board.now)}</span></div>{/if}
        {#if detail.list.length}
          <section>
            <h3 class="ow-eyebrow">{detail.listTitle}</h3>
            {#each detail.list.slice(0, 10) as [name, k] (name)}
              <div class="ob-li"><span class="ob-clip">{name}</span><span>{detail.percent ? `${k}%` : fmt(k)}</span><Progress value={detail.percent ? k : (k / listMax) * 100} class="h-[3px] bg-border" /></div>
            {/each}
            {#if detail.list.length > 10}<span class="ob-sub">and {detail.list.length - 10} more</span>{/if}
          </section>
        {/if}
        {#each detail.sections.filter((s) => s.items.length || s.title === "New repositories") as s (s.title)}
          <section>
            <h3 class="ow-eyebrow">{s.title}</h3><span class="ob-sub">{s.note}</span>
            {#each s.items as i (i.repo + i.k + (i.n ?? i.tag))}
              <a class="ob-entry" href={href(i.repo, i)} target="_blank" rel="noreferrer"><i class="ob-g" data-k={i.k}></i><span><span class="ob-etext">{label(i)}</span><span class="ob-sub">{i.meta ? `${i.meta} · ` : ""}{since(i.at)}</span></span></a>
            {/each}
            {#if s.more}<span class="ob-sub">{s.more}</span>{/if}
          </section>
        {/each}
      </div>
    </ScrollArea>
  </Panel>
  {/if}

  <Panel class="ob-tools flex-row">
    <IconButton label="Zoom in" onclick={() => (zoom = Math.min(1.6, scale * 1.2))}><Icon name="zin" /></IconButton>
    <IconButton label="Zoom out" onclick={() => (zoom = Math.max(0.3, scale / 1.2))}><Icon name="min" /></IconButton>
    <IconButton label="Fit the width" pressed={zoom == null} onclick={() => (zoom = null)}><Icon name="fit" /></IconButton>
    <IconButton label={theme === "dark" ? "Light mode" : "Dark mode"} onclick={() => toggleMode()}><Icon name={theme === "dark" ? "sun" : "moon"} /></IconButton>
  </Panel>
  {:else if data}
  <Panel class="ob-empty"><span class="ow-eyebrow">The board</span><p>This snapshot carries no pull requests or releases yet. They come with the relay's next scan of the org.</p></Panel>
  {/if}
</div>
</Tooltip.Provider>
