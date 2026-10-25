<!-- The tools: zoom, the whole city, turning (with the compass), a clip, the year film, the scrubber,
     the tour and the legend. -->
<script>
  import IconButton from "./IconButton.svelte";
  import Icon from "./Icon.svelte";
  import Panel from "./Panel.svelte";
  import { Separator } from "$lib/components/ui/separator/index.js";
  let { ui, act, clip = null, film = null, el = $bindable(null) } = $props();
</script>

{#snippet sep(wide = false)}<Separator orientation="vertical" class={"mx-1 h-4! bg-border" + (wide ? " ow-wide" : "")} />{/snippet}

<Panel class="ow-tools flex-row" bind:el>
  <IconButton label="Zoom in" hint="+" class="ow-wide" onclick={() => act.zoom(0.7)}><Icon name="zin" /></IconButton>
  <IconButton label="Zoom out" hint="−" class="ow-wide" onclick={() => act.zoom(1.4)}><Icon name="min" /></IconButton>
  <IconButton label="Home view" hint="0" onclick={() => act.home()}><Icon name="fit" /></IconButton>
  {@render sep()}
  <IconButton label="Rotate left" hint="Q" onclick={() => act.rotate(-1)}><Icon name="rotl" /></IconButton>
  <span class="ow-compass" title="North" aria-hidden="true"><svg viewBox="0 0 16 16" style:transform="rotate({(ui.heading - 72).toFixed(1)}deg)"><path d="M8 2.5 10.5 9 8 7.8 5.5 9Z" /><path d="M8 13.5V10" /></svg></span>
  <IconButton label="Rotate right" hint="E" onclick={() => act.rotate(1)}><Icon name="rotr" /></IconButton>
  {@render sep()}
  {#if clip}
    <IconButton label="Record a 15-second clip" hint="C" class="ow-wide" aria-busy={clip.left > 0} onclick={() => act.clip()}><Icon name="clip" />{#if clip.left}<i class="ow-clip-n" aria-hidden="true">{clip.left}</i>{/if}</IconButton>
  {/if}
  {#if film}
    <IconButton label={film.error ? `The year film could not be made: ${film.error}` : "Record the year film"} hint="Y" class="ow-wide" aria-busy={film.busy} onclick={() => act.film()}><Icon name="film" /></IconButton>
  {/if}
  <IconButton label="Replay the last 30 days" hint="R" pressed={ui.replay.open} onclick={() => act.replay()}><Icon name="replay" /></IconButton>
  <IconButton label="Tour the busiest stations" hint="T" pressed={ui.touring} onclick={() => act.tour()}><Icon name={ui.touring ? "pause" : "play"} /></IconButton>
  <IconButton label={ui.theme === "dark" ? "Light mode" : "Dark mode"} onclick={() => act.theme()}><Icon name={ui.theme === "dark" ? "sun" : "moon"} /></IconButton>
  <IconButton label="How to read the map" hint="?" pressed={ui.legend} onclick={() => (ui.legend = !ui.legend)}><Icon name="help" /></IconButton>
</Panel>
