<script>
  import Board from "$lib/ui/Board.svelte";
  import { ISO_CSS } from "$lib/city/kit/iso-kit.mjs";
  let { data } = $props();
  const title = $derived(`${data.config.title || `${data.config.org} city`}: the board`);
  const description = $derived(`What the ${data.config.name || data.config.org} GitHub org is working on: what shipped, merged and waits in review, and who is on it.`);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={`${data.origin}/board`} />
  <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
  <meta name="theme-color" content="#0b0b0c" />
  <!-- the plate's tokens from the first paint -->
  {@html `<style id="ow-iso-css">${ISO_CSS}</style>`}
</svelte:head>

<Board config={data.config} me={data.me} data={data.data} members={data.members} waiting={data.waiting} />
