<script>
  import City from "$lib/ui/City.svelte";
  import { ISO_CSS } from "$lib/city/kit/iso-kit.mjs";
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.config.title || `${data.config.org} city`}</title>
  {#if data.config.description}<meta name="description" content={data.config.description} />{/if}
  <!-- the plate's tokens from the first paint (the runtime adds them only if missing) -->
  {@html `<style id="ow-iso-css">${ISO_CSS}</style>`}
</svelte:head>

<!-- a corporate patron's logo as a single-tone stencil: alpha = 2 × (opacity − luminance × opacity), so white and transparent drop out and the mark keeps one ink (the CSS sets its tone per theme) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="ow-stencil" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.4252 -1.4304 -0.1444 2 0" /></filter></svg>
<City config={data.config} me={data.me} data={data.city?.data ?? null} layout={data.city?.layout ?? null} waiting={data.waiting} members={data.members} />
