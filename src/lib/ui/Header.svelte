<!-- The header: the plate's title and who is signed in, the search, and the org's totals. -->
<script>
  import Search from "./Search.svelte";
  import Icon from "./Icon.svelte";
  import IconButton from "./IconButton.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { fmt } from "../client/format.js";
  let { ui, org = "", name = org, days = 30, idle = false, onpick, search = $bindable(null), bar = $bindable(), hud = $bindable() } = $props();
  const T = $derived((ui.rev, ui.L ? ui.L.totals() : null));
  const cells = $derived(T ? [
    [fmt(T.c30), "commits", `Commits in the ${ui.L.WIN} days to ${ui.L.TO}, across every repository`], [fmt(T.c7), "this week", "Commits in the last 7 days"],
    [fmt(T.active), "active repos", "Repositories with at least one commit in 30 days"], [fmt(T.pr), "open PRs", "Open pull requests across the org"],
    [fmt(T.un), "on branches", "Commits on branches that are not merged yet"],
  ] : []);
</script>

<header class="ow-bar" bind:this={bar}>
  <div class="ow-brand">
    <span class="ow-fig">Fig 1</span><b>{name}</b><span class="ow-sub">github.com/{org} · {days} days, live</span>
    {#if ui.me?.who}<span class="ow-auth"><b>members' city</b> · {ui.me.who}{#if !ui.me.dev} · <Button variant="link" size="xs" class="ow-signin" onclick={() => import("../client/auth.js").then((a) => a.signOut())}>sign out</Button>{/if}</span>
    {:else if ui.me?.providers?.length}<span class="ow-auth">public city · sign in with {#each ui.me.providers as p, i}{i ? " or " : ""}<Button variant="link" size="xs" class="ow-signin" onclick={() => import("../client/auth.js").then((a) => a.signIn(p))}>{p === "github" ? "GitHub" : "Basecamp"}</Button>{/each}</span>{/if}
  </div>
  {#if !idle}<!-- idle: no city yet (the loading plate waits for the first scan), so nothing to search or total -->
  <Search {ui} {onpick} bind:input={search} />
  <div class="ow-hudwrap" class:ow-folded={ui.folded.hud}>
    <div class="ow-hud" bind:this={hud} role="group" aria-label="Totals">
      {#each cells as c, i (i)}
        <Tooltip.Root>
          <Tooltip.Trigger>
            <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
            {#snippet child({ props })}<div {...props} data-hud={i} role="note" tabindex="0" aria-label="{c[0]} {c[1]}. {c[2]}"><b>{c[0]}</b><span>{c[1]}</span></div>{/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content side="bottom" class="max-w-64">{c[2]}</Tooltip.Content>
        </Tooltip.Root>
      {/each}
    </div>
    <IconButton label="Collapse the totals" class="ow-hudmin" onclick={() => ui.fold("hud", true)}><Icon name="min" /></IconButton>
    <Button variant="outline" size="icon-lg" class="ow-restore" aria-label="Show the totals" hidden={!ui.folded.hud} onclick={() => ui.fold("hud", false)}><Icon name="gauge" size="1.1em" /></Button>
  </div>
  {/if}
</header>
