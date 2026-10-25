<script>
  import City from "$lib/ui/City.svelte";
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.config.title || `${data.config.org} city`}</title>
  {#if data.config.description}<meta name="description" content={data.config.description} />{/if}
</svelte:head>

<!-- a corporate patron's logo as a single-tone stencil: alpha = 2 × (opacity − luminance × opacity), so white and transparent drop out and the mark keeps one ink (the CSS sets its tone per theme) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="ow-stencil" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.4252 -1.4304 -0.1444 2 0" /></filter></svg>
<City config={data.config} me={data.me} data={data.city.data} layout={data.city.layout} members={data.members} />
