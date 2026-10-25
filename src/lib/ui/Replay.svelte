<!-- The scrubber's card (client/replay.js does the work): the moment, play and pause, a slider across the last 30
     days (shadcn-svelte's Slider) and the speed. It takes the days card's place while open. -->
<script>
  import IconButton from "./IconButton.svelte";
  import Icon from "./Icon.svelte";
  import Panel from "./Panel.svelte";
  import { Slider } from "$lib/components/ui/slider/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  let { ui, replay = null, el = $bindable(null) } = $props();
  const r = $derived(ui.replay);
</script>

<Panel class="ow-replay" aria-label="Replay the last 30 days" bind:el hidden={!r.open}>
  <div class="ow-card-head"><span class="ow-eyebrow">Replay · <b>{r.label}</b></span>
    <IconButton label="Back to now" hint="Esc" size="icon-xs" onclick={() => replay?.stop()}><Icon name="close" /></IconButton></div>
  <div class="ow-rp-row">
    <IconButton label={r.playing ? "Pause" : "Play"} hint="space" pressed={r.playing} onclick={() => (r.playing ? replay?.pause() : replay?.play())}><Icon name={r.playing ? "pause" : "play"} /></IconButton>
    <Slider type="single" min={0} max={1000} step={1} value={r.value} onValueChange={(v) => replay?.seek(v)} aria-label="Moment in the last 30 days" class="flex-1" />
    <Button variant="outline" size="xs" class="font-mono text-[10px] tracking-wider" onclick={() => replay?.nextSpeed()} title="Speed">{r.speed}</Button>
  </div>
  <div class="ow-rp-note">Heights, lamps, belts and days rewind; open pull requests and branch work show today's.</div>
</Panel>
