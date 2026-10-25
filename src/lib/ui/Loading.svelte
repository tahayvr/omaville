<!-- The loading plate: while the city is drawn (or before the relay has a first snapshot), the Omarchy mark stands
     on the stage as a small isometric model, its platforms rising in a diagonal wave, under the city's title and the
     real stage of the build. Its colours follow the page's own mode (html.dark), so it is right from the first paint,
     before the app knows its theme. Animations are transform and opacity: they keep moving while the main thread
     raises the 3D scene. -->
<script>
  import { fade } from "svelte/transition";
  import { LOGO } from "$lib/city/grid.js";

  // stage: 0 reading, 1 laying out, 2 raising, 3 lighting (the runtime moves it); error: the build failed;
  // waiting: no snapshot yet, and why (the relay's words)
  let { title = "", stage = 0, repos = 0, houses = 0, error = "", waiting = "" } = $props();

  const fmt = (n) => n.toLocaleString("en-US");
  const STEPS = $derived([
    "Reading the snapshot",
    `Laying out ${fmt(repos)} ${repos === 1 ? "repository" : "repositories"}${houses ? ` and ${fmt(houses)} ${houses === 1 ? "house" : "houses"}` : ""}`,
    "Raising the model",
    "Lighting the week",
  ]);
  const head = $derived(error ? "The city could not be drawn" : waiting ? "Waiting for the first scan" : "Drawing the city");
  const line = $derived(error || (waiting ? waiting.charAt(0).toUpperCase() + waiting.slice(1) + "." : STEPS[Math.min(stage, 3)]));

  // the mark: its raised cells as small boxes on an isometric grid, drawn back to front
  const A = 8.66, B = 5, HT = 6;
  const cells = [];
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) if (LOGO[j][i] === "#") cells.push({ i, j, x: (i - j) * A, y: (i + j) * B });
  cells.sort((p, q) => p.i + p.j - (q.i + q.j) || p.i - q.i);
  const dots = [];
  for (let j = 0; j < 15; j++) for (let i = 0; i < 15; i++) if (LOGO[j][i] === ".") dots.push({ x: (i - j) * A, y: (i + j) * B + B });
  const top = (x, y) => `M${x} ${y}L${x + A} ${y + B}L${x} ${y + 2 * B}L${x - A} ${y + B}Z`;
  const left = (x, y) => `M${x - A} ${y + B}L${x} ${y + 2 * B}L${x} ${y + 2 * B + HT}L${x - A} ${y + B + HT}Z`;
  const right = (x, y) => `M${x} ${y + 2 * B}L${x + A} ${y + B}L${x + A} ${y + B + HT}L${x} ${y + 2 * B + HT}Z`;
  // the plate the mark stands on: the 15 × 15 grid's outline, a little below the ground
  const plate = `M0 ${-B}L${15 * A + A} ${14 * B + B}L0 ${30 * B + B}L${-15 * A - A} ${14 * B + B}Z`;
</script>

<div class="ow-loader" class:ow-load-error={!!error} class:ow-load-waiting={!!waiting} role="status" aria-live="polite" out:fade={{ duration: 320 }}>
  <svg class="ow-load-mark" viewBox="-142 -22 284 196" aria-hidden="true">
    <path class="ow-load-plate" d={plate} transform="translate(0 {HT + 2})" />
    {#each dots as d (d.x + "," + d.y)}<circle class="ow-load-dot" cx={d.x} cy={d.y} r="0.7" />{/each}
    {#each cells as c (c.i + "," + c.j)}
      <g class="ow-load-cell" style="--d:{((c.i + c.j) * 0.035).toFixed(3)}s;--w:{((c.i + c.j) * 0.07).toFixed(3)}s">
        <g class="ow-load-lift">
          <path class="ow-load-l" d={left(c.x, c.y)} />
          <path class="ow-load-r" d={right(c.x, c.y)} />
          <path class="ow-load-t" d={top(c.x, c.y)} />
        </g>
      </g>
    {/each}
  </svg>
  <div class="ow-load-text">
    <span class="ow-load-eyebrow">Fig 1 · {title}</span>
    <b class="ow-load-head">{head}</b>
    <span class="ow-load-line">{line}</span><!-- no fade: raising the scene holds the main thread, and a fade-in would leave the line blank for it -->
    {#if !error && !waiting}
      <span class="ow-load-steps" aria-hidden="true">{#each STEPS as _, i (i)}<i class:on={i <= stage}></i>{/each}</span>
    {:else if waiting}
      <span class="ow-load-note">This page opens the city as soon as it is ready.</span>
    {/if}
  </div>
</div>
