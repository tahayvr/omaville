<!-- How to read the city, as a dialog over the map: every kind of station has an entry here (data-kind), saying its
     signal, formula and window; scripts/check.mjs fails on a station kind with no entry. The org's own words (its
     districts, its landmarks' kinds, the newcomers' name) join the Height entry from the config. The entries are
     grouped the way the city is read: what is history, what is now, the signs and services, and the ground. -->
<script>
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { Kbd } from "$lib/components/ui/kbd/index.js";
  // portal: the app's root, so the dialog takes the city's tokens and theme
  let { ui, config = {}, portal = null } = $props();
  const own = $derived([...Object.values(config.layout?.kinds ?? {}), ...(config.layout?.districts ?? []).map((d) => d.name), config.layout?.newcomers?.name].filter(Boolean).join(","));
  const patrons = $derived(config.patrons?.site ? config.patrons.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") + (config.patrons.page ?? "").replace(/\/$/, "") : "the org's patrons page");
  const SECTIONS = [
    ["history", "Height is history", "What a building has added up to, all time. Nothing shrinks."],
    ["now", "Light and motion are now", "What moved in the last days: lamps, belts, drones and workers."],
    ["signs", "Signs and services", "Patrons, Basecamp projects, the relay's health, and the plugins."],
    ["ground", "The ground", "How the city is laid out, and what is only scenery."],
  ];
  let viewport = $state(null);
  const go = (id) => viewport?.querySelector(`#ow-leg-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
</script>

<!-- one entry's three facts: what it reads, how it is drawn, over how long -->
{#snippet facts(signal, formula, window)}
  <dl class="ow-leg-facts">
    {#if signal}<dt>Signal</dt><dd>{signal}</dd>{/if}
    {#if formula}<dt>Formula</dt><dd>{formula}</dd>{/if}
    {#if window}<dt>Window</dt><dd>{window}</dd>{/if}
  </dl>
{/snippet}

<Dialog.Root bind:open={ui.legend}>
<Dialog.Content portalProps={{ to: portal ?? "body" }} class="ow-legend flex h-[min(880px,calc(100%-2rem))] w-[min(1000px,calc(100%-2rem))] max-w-none flex-col gap-0 p-0 sm:max-w-none">
  <Dialog.Header class="ow-leg-head gap-0">
    <span class="ow-eyebrow">Fig 1 · Legend</span>
    <Dialog.Title class="ow-leg-title text-[22px] leading-7 font-semibold">How to read the city</Dialog.Title>
    <Dialog.Description class="ow-leg-lead text-[13px] leading-5">Every element is a signal, a formula and a window. Nothing is drawn without one, the same data always draws the same city, and a place once given is kept for good.</Dialog.Description>
    <div class="ow-leg-laws">
      <span><b>Height</b> is history</span><span><b>Light</b> is now</span><span><b>Scenery</b> carries no data</span>
    </div>
    <nav class="ow-leg-nav" aria-label="Sections">
      {#each SECTIONS as [id, name], i (id)}<Button variant="ghost" size="xs" class="font-mono" onclick={() => go(id)}><i>{i + 1}</i>{name}</Button>{/each}
    </nav>
  </Dialog.Header>

  <ScrollArea class="min-h-0 flex-1" bind:viewportRef={viewport}>
    <div class="ow-leg-body">
    <section id="ow-leg-history">
      <header><i>§1</i><h3>{SECTIONS[0][1]}</h3><p>{SECTIONS[0][2]}</p></header>
      <div class="ow-leg-grid">
        <article class="ow-leg-wide" data-kind="Tower,New towers,Under construction,Assembly hall,Press,Disc press,Dispatch racks,Works,Pod,{own}">
          <h4>Height</h4>
          {@render facts("Lifetime commits by people on the default branch. Bots and routine accounts are subtracted; a fork counts only what is ahead of upstream, a mirror none.", "16 + 14 · log₂(1 + commits / 8), one scale for every building, measured from the deck: the mark's strokes, or a plinth of the same height under a lot and under each block of the contributors' quarter.", "All time.")}
          <p>Nothing shrinks; a quiet building goes dark. Its windows and lamp are lit by a commit in the last 7 days.</p>
        </article>
        <article>
          <h4>One repository, one parcel</h4>
          <p>Every repository has one building, and everything about it stands on its parcel: the building, and on the dock in front its pallet, its capsules, its workers and its name. The kind of building follows the district: a workshop with a sawtooth roof (apps), a cabinet tower (themes and plugins), a lattice mast (sites), a silo (upstream), a hand-built landmark, or one of four towers on a lot. A parcel is kept for good; an unclaimed one is an outline on the deck.</p>
        </article>
        <article data-kind="Contributor">
          <h4>Contributors' quarter</h4>
          {@render facts("A person's lifetime commits to the public repositories, bots excluded.", "One building per person on the one height scale: a low-rise for a first few commits (six kinds), a tower beyond (seven kinds), the kind fixed by the login.", "All time; the lights, the last 7 days.")}
          <p>Never removed. Houses fill rings around the mark, nearest the arcology first, each block on a plinth as tall as the deck. A first contribution builds a new house, in scaffolding under a crane for its first day.</p>
        </article>
        <article>
          <h4>Plaques</h4>
          {@render facts("Releases.", "1.5 · log₂(1 + releases) plates on a post at the dock's corner.", "All time.")}
        </article>
        <article data-kind="Archive">
          <h4>Archive</h4>
          {@render facts("An archived repository's lifetime commits.", "The one height scale, drawn as an outline only, so a ghost keeps its history and hides nothing behind it.", "All time.")}
        </article>
        <article class="ow-leg-wide">
          <h4>New towers</h4>
          <p>A repository without a district, or whose district is full, claims the next free lot and keeps its district's kind of building there; with the live stream it appears the moment it is created. A lot that holds a scenery high-rise goes only to a repository at least as tall, so a claim never lowers the skyline; when the mark is full, the rings around it open, between the contributors' blocks. For its first two weeks a new building stands in scaffolding under a crane, rising as the days pass. A repository that leaves the data leaves a vacant parcel.</p>
        </article>
      </div>
    </section>

    <section id="ow-leg-now">
      <header><i>§2</i><h3>{SECTIONS[1][1]}</h3><p>{SECTIONS[1][2]}</p></header>
      <div class="ow-leg-grid">
        <article>
          <h4>Lamps</h4>
          {@render facts("Commits.", "A pulsing lamp at one or more.", "The last 7 days.")}
          <p>The arcology's crown, antennas and a site mast's ring follow the same rule.</p>
        </article>
        <article data-kind="Themes and plugins">
          <h4>Drawers</h4>
          {@render facts("Commits.", "1 + 1.5 · log₂(1 + commits) drawers stand out of a cabinet tower, in an order fixed per repository.", "The last 7 days.")}
        </article>
        <article>
          <h4>Pallets</h4>
          {@render facts("Open pull requests.", "2 · log₂(1 + open) crates, four to a layer, the exact count stencilled with the name.", "Now.")}
        </article>
        <article>
          <h4>Capsules</h4>
          {@render facts("Distinct commits that exist only on branches.", "1.4 · log₂(1 + commits) capsules plugged on a spine beside the pallet: work bolted on, not yet built in.", "The last 30 days.")}
        </article>
        <article>
          <h4>Workers</h4>
          {@render facts("People who committed to the repository.", "One each, as many as the dock holds (eight at most).", "The last 7 days.")}
          <p>The people card lists everyone who committed in the 30-day window, the org members marked, most active first.</p>
        </article>
        <article>
          <h4>Drones</h4>
          {@render facts("Commits per station.", "One drone for each of the 14 busiest stations, flying to the landing pad on the arcology, more often where the week was busier.", "The last 7 days.")}
        </article>
        <article class="ow-leg-wide">
          <h4>Belts</h4>
          {@render facts("Commits on the stations that feed the belt; commits by bots and routine accounts counted apart.", "One crate per commit by people, one low dark tote per bot or routine commit, placed at the time it landed. When a belt cannot hold them all, every k-th is shown; it runs faster where the week was busier, bots included.", "The last 7 days.")}
          <p>Bots move belts but never build: no height, no lamp, no worker. The themes and plugins, sites and upstream ship by drone.</p>
        </article>
        <article>
          <h4>Day columns</h4>
          {@render facts("Commits across the org.", "One column per calendar day (UTC), one crate per 25 commits, up to 24. An empty plate is a day with nothing landed.", "30 days.")}
        </article>
        <article>
          <h4>Ticker</h4>
          {@render facts("Commit subjects.", "The 24 latest crawl across the warehouse board in accent colour, with the window's total.", "30 days.")}
        </article>
        <article class="ow-leg-wide">
          <h4>Live</h4>
          <p>When the page is connected to the relay, every event plays once on the building it concerns, within seconds: a drone with one crate per commit flies from a push to the arcology and the authors' house lamps ring; a crate drops onto a roof for a new pull request or branch; a beam runs to the crown for a merge; magenta smoke rises from a failed build; a launch leaves the arcology's pad for a release and every lamp blinks; rings mark the rest. Effects leave nothing behind; the building the event changed is redrawn in place with its new numbers.</p>
        </article>
      </div>
    </section>

    <section id="ow-leg-signs">
      <header><i>§3</i><h3>{SECTIONS[2][1]}</h3><p>{SECTIONS[2][2]}</p></header>
      <div class="ow-leg-grid">
        <article class="ow-leg-wide" data-kind="Patron board">
          <h4>Patron boards</h4>
          {@render facts(`The corporate tiers of ${patrons}, read from ${config.patrons?.repo ? `the ${config.patrons.repo} repository` : "the org's patrons file"}.`, `The ${config.patrons?.crown?.label ?? "crown tier"}s on the four faces of the arcology's crown; the ${config.patrons?.boards?.label ?? "board tier"}s on the billboard towers, three screens each, then on gantries across the ring road along the mark's front edge.`, "Now.")}
          <p>Each screen opens its patron's card, and a new patron on the page plays an amber drop and ring on its board. Each board is a lit screen in a bezel, its name and mark in white, the wide screen's second line crawling the tier, the name and the link; a band under each tower's cap crawls the latest commits.</p>
        </article>
        <article data-kind="Basecamp ward">
          <h4>Basecamp wards</h4>
          {@render facts("The org's Basecamp projects, members only.", "One ward per project on a civic cell near the repositories it steers: the hall's windows lit by this week's events, the mast's lamp by a message this week, a lantern on the hill per tracked list, a car in the rail yard per card and a track per column, a scaffold per to-do list under way.", "Now; events, the last 7 days.")}
          <p>The public city shows the hall and mast dark and unlabelled. Height carries no count.</p>
        </article>
        <article data-kind="Water tower">
          <h4>Water tower</h4>
          {@render facts("The relay's own health, not the org's.", "The water is the snapshot's freshness: full while the last scan is within one scan interval, empty two intervals later, in eighths. The lamp is the live stream: steady while connected, pulsing while it reconnects, dark without a relay.", "Now.")}
        </article>
        <article data-kind="Capsule tower">
          <h4>Capsule tower <small>plugin</small></h4>
          {@render facts("A repository's lifetime commits, and whether it had a commit in the last 7 days.", "The city's one height scale; capsules bolted to two cores up to that height, their windows lit by this week's commits.", "Lifetime; lights, the last 7 days.")}
          <p>A plugin kit (city/plugins/kits/capsule.js), taken by a repository in city.config.json.</p>
        </article>
        <article data-kind="Stars">
          <h4>Stars <small>plugin</small></h4>
          {@render facts("A GitHub star on a repository.", "One small violet ring at its roof.", "Live.")}
          <p>A plugin effect (city/plugins/effects/star.js).</p>
        </article>
        <article class="ow-leg-wide">
          <h4>Colour</h4>
          <div class="ow-leg-swatches">
            <span><i style="background:var(--ow-accent)"></i><b>Cyan</b> what you selected or hover</span>
            <span><i style="background:var(--ow-live)"></i><b>Magenta</b> live: a pulsing lamp, a tail light</span>
            <span><i style="background:var(--ow-glow-c)"></i><i style="background:var(--ow-glow-m)"></i><i style="background:var(--ow-glow-a)"></i><i style="background:var(--ow-glow-v)"></i><b>Signage</b> patron screens, the crown, monuments and street light; never a count</span>
          </div>
        </article>
      </div>
    </section>

    <section id="ow-leg-ground">
      <header><i>§4</i><h3>{SECTIONS[3][1]}</h3><p>{SECTIONS[3][2]}</p></header>
      <div class="ow-leg-grid">
        <article>
          <h4>Blocks and streets</h4>
          <p>The quarter is cut into blocks by avenues every third cell and a ring road around the mark, with amber street lamps. A block's nine plots hold its houses; a block the quarter has not reached yet holds low scenery. About one cell in nine is civic: a stadium, a monument, a park, a plaza or a transit station. No house or repository ever takes a civic cell.</p>
        </article>
        <article>
          <h4>Scenery</h4>
          <p>Towers, cooling towers, the duct, the truck, forklifts, tanks, sheds, sky bridges, searchlights, sky cars, streets, lamps, the courtyard's boulevard, the arcology's crown deck and mast array, stadiums, monuments, parks, plazas and transit stations carry no data, have no name on the ground, and never stand taller than 60 (a building with about 70 commits).</p>
        </article>
      </div>
    </section>
    </div>
  </ScrollArea>

  <footer class="ow-leg-foot">
    <span class="ow-eyebrow">On the Omarchy mark</span>
    <span><Kbd class="ow-kbd font-mono">drag</Kbd> orbit</span>
    <span><Kbd class="ow-kbd font-mono">right-drag</Kbd> pan</span>
    <span><Kbd class="ow-kbd font-mono">scroll</Kbd> zoom</span>
    <span><Kbd class="ow-kbd font-mono">Q</Kbd><Kbd class="ow-kbd font-mono">E</Kbd> turn 45°</span>
    <span><Kbd class="ow-kbd font-mono">click</Kbd> open a station</span>
    <span><Kbd class="ow-kbd font-mono">?</Kbd> this legend</span>
  </footer>
</Dialog.Content>
</Dialog.Root>
