<script>
  import City from "$lib/ui/City.svelte";
  import { ISO_CSS } from "$lib/city/kit/iso-kit.mjs";
  let { data } = $props();

  // what search engines and link previews read: one canonical page, the README's screenshot as the card
  const title = $derived(data.config.title || `${data.config.org} city`);
  const description = $derived(data.config.description || `The ${data.config.name || data.config.org} GitHub org drawn as a living 3D city.`);
  const site = $derived(`${data.origin}/`);
  const image = $derived(`${data.origin}/og.png`);
  const ld = $derived(JSON.stringify({ "@context": "https://schema.org", "@type": "WebSite", name: title, description, url: site, image }).replace(/</g, "\\u003c"));
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={site} />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0b0b0c" />
  <meta property="og:type" content="website" />
  <meta property="og:site_name" content={title} />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={site} />
  <meta property="og:image" content={image} />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:image:width" content="3200" />
  <meta property="og:image:height" content="2000" />
  <meta property="og:image:alt" content={`${title}: the org's repositories as a lit 3D city at night`} />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
  {@html `<script type="application/ld+json">${ld}</script>`}
  <!-- the plate's tokens from the first paint (the runtime adds them only if missing) -->
  {@html `<style id="ow-iso-css">${ISO_CSS}</style>`}
</svelte:head>

<!-- a corporate patron's logo as a single-tone stencil: alpha = 2 × (opacity − luminance × opacity), so white and transparent drop out and the mark keeps one ink (the CSS sets its tone per theme) -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="ow-stencil" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -0.4252 -1.4304 -0.1444 2 0" /></filter></svg>
<City config={data.config} me={data.me} data={data.city?.data ?? null} layout={data.city?.layout ?? null} waiting={data.waiting} members={data.members} />
