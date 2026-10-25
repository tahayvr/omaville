<!-- The city's page: the 3D map (lib/view) and its chrome. Picking, hovering, the keyboard, the tour, the
     cinema modes, clips and the year film are wired here; the runtime (lib/client/runtime.js) keeps the city current. -->
<script>
  import { onMount } from "svelte";
  import { CityUI } from "./city.svelte.js";
  import { startCity } from "../client/runtime.js";
  import Header from "./Header.svelte";
  import Crew from "./Crew.svelte";
  import Detail from "./Detail.svelte";
  import Days from "./Days.svelte";
  import Tools from "./Tools.svelte";
  import Tip from "./Tip.svelte";
  import Legend from "./Legend.svelte";
  import Replay from "./Replay.svelte";
  import Icon from "./Icon.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Tooltip from "$lib/components/ui/tooltip/index.js";
  import { Toaster } from "$lib/components/ui/sonner/index.js";
  import { mode, setMode, toggleMode } from "mode-watcher";

  let { config, me, data, layout, members = false } = $props();
  // the org's words (city.config.json): the city's title on captions and files, the org's name in the header
  const org = $derived(config.org || data.org || ""), title = $derived(config.title || `${org} city`), slug = $derived(title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "city");
  const ui = new CityUI({ me: (() => me)() }); // who is signed in does not change while the page is open
  let root = $state(), stage = $state(), crewEl = $state(null), detailEl = $state(null), daysEl = $state(null), toolsEl = $state(null), dockEl = $state(), bar = $state(), hud = $state(), search = $state(null);
  let replayEl = $state(null), replay = $state(null);
  let clip = $state(null), film = $state(null);
  let city = null, map = null, cinema = null;
  const q = (k) => new URLSearchParams(location.search).get(k);

  // ---- where the camera may look: the free area between the cards ----
  function pads() {
    const r = stage.getBoundingClientRect(), cs = getComputedStyle(root);
    const T = parseFloat(cs.getPropertyValue("--ow-top")) || 84, B = parseFloat(cs.getPropertyValue("--ow-bot")) || 80;
    if (r.width < 860) return { l: 12, r: 12, t: T, b: ui.selected ? r.height * 0.5 : B };
    return { l: crewEl.hidden ? 70 : crewEl.offsetWidth + 32, r: detailEl.hidden ? 70 : detailEl.offsetWidth + 32, t: T - 6, b: B };
  }

  // ---- picking and hovering: hover wins over the selection for what is lit ----
  function pick(kind, id, { fly = true } = {}) {
    ui.selected = kind == null ? null : { kind, id };
    if (kind != null && ui.folded.detail) ui.fold("detail", false);
    ui.hovered = null; ui.tip = null;
    if (!map) return;
    map.trail(ui.L.trail(ui.selected)?.points ?? []); // a person's (or team's) trail
    if (fly && ui.selected) map.focus(ui.L.idsFor(ui.selected), pads());
  }
  const choose = (kind, id) => { stopTour(); pick(kind, id); }; // the chrome's picks stop the tour
  function hover(t, at) {
    if (!t) { ui.hovered = null; ui.tip = null; return; }
    ui.hovered = t; if (at) ui.tip = { target: t, ...at };
  }
  const close = () => { pick(null); map?.home(pads()); };
  $effect(() => {
    const ids = ui.L ? ui.L.idsFor(ui.hovered || ui.selected) : [];
    ui.rev;
    map?.setLit(ids);
  });

  // ---- the map's pointer: the maps turn, pan and zoom; here only hover and click ----
  let down = null, hoverQueued = null;
  function pointerdown(e) { down = { x: e.clientX, y: e.clientY }; ui.tip = null; stopTour(); }
  function pointerup(e) {
    if (!down || !map) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y); down = null;
    if (moved > 5 || e.button > 0) return;
    const t = map.pick(e.clientX, e.clientY);
    if (t) pick(t.kind, t.id); else if (e.pointerType !== "mouse") hover(null);
  }
  function pointermove(e) {
    if (e.pointerType !== "mouse" || e.buttons) { if (e.buttons) stage.classList.add("ow-panning"); return; }
    stage.classList.remove("ow-panning");
    if (hoverQueued) { hoverQueued = e; return; }
    hoverQueued = e;
    requestAnimationFrame(() => { const ev = hoverQueued; hoverQueued = null; hoverAt(ev); });
  }
  function hoverAt(e) {
    if (!map) return;
    const t = map.pick(e.clientX, e.clientY);
    stage.classList.toggle("ow-pointing", !!t);
    if (!t) return hover(null);
    const key = t.kind + ":" + t.id + ":" + (t.role || "");
    if (ui.hovered?.key !== key) hover({ ...t, key }, { x: e.clientX, y: e.clientY });
    else if (ui.tip) ui.tip = { ...ui.tip, x: e.clientX, y: e.clientY }; // a tip cleared by a press stays cleared until the hover changes
  }
  function dblclick(e) { if (!map) return; const t = map.pick(e.clientX, e.clientY); if (t) pick(t.kind, t.id); else map.zoom(0.6); }

  // ---- the tour: the busiest stations in turn ----
  let tourAt = 0;
  $effect(() => {
    if (!ui.touring || !ui.model) return;
    const next = () => pick("station", ui.model.tour[tourAt++ % ui.model.tour.length]);
    next(); const t = setInterval(next, 4200);
    return () => clearInterval(t);
  });
  function stopTour() { if (ui.touring) ui.touring = false; }

  // ---- the tools ----
  const act = {
    zoom: (f) => map?.zoom(f),
    home: () => map?.home(pads()),
    rotate: (step) => { stopTour(); map?.orbit(step * 45); },
    tour: () => (ui.touring = !ui.touring),
    theme: () => toggleMode(),
    clip: () => clip?.go(), film: () => film?.go(),
    replay: () => replay?.toggle(),
  };

  // ---- the keyboard ----
  function keydown(e) {
    if (e.target === search || e.target.closest?.("[role=dialog]")) return; // the search and the legend sheet keep their own keys
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || e.key === "/") { e.preventDefault(); search?.focus(); return; }
    if (e.target.closest?.("input,textarea") || !map) return;
    if (e.key === "Escape") { if (ui.legend) ui.legend = false; else if (!city?.replay?.open) close(); return; }
    if (e.key === "+" || e.key === "=") return act.zoom(0.7);
    if (e.key === "-" || e.key === "_") return act.zoom(1.4);
    if (e.key === "0") return act.home();
    if (e.key === "?") { ui.legend = !ui.legend; return; }
    if (e.key === "t" || e.key === "T") return act.tour();
    if (e.key === "q" || e.key === "Q") return act.rotate(-1);
    if (e.key === "e" || e.key === "E") return act.rotate(1);
    if (!e.metaKey && !e.ctrlKey && (e.key === "c" || e.key === "C")) return act.clip();
    if (!e.metaKey && !e.ctrlKey && (e.key === "y" || e.key === "Y")) return act.film();
    if (["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(e.key) && (e.target === stage || e.target === document.body)) {
      e.preventDefault();
      const order = ui.model.order;
      let i = ui.selected?.kind === "station" ? order.indexOf(ui.selected.id) : -1;
      i = e.key === "ArrowRight" || e.key === "ArrowDown" ? (i + 1) % order.length : (i - 1 + order.length) % order.length;
      choose("station", order[i]);
    }
  }

  // ---- keep the chrome from overlapping: drop totals that don't fit, park the timeline where it fits ----
  function fitChrome() {
    if (!bar || !dockEl || !toolsEl) return;
    ui.narrow = stage.clientWidth < 860;
    const cells = [...hud.children], wrapped = getComputedStyle(bar).flexWrap === "wrap", brand = bar.firstElementChild, wrap = hud.parentElement;
    cells.forEach((c) => c.removeAttribute("data-off"));
    const tight = () => bar.scrollWidth > bar.clientWidth + 1 || (!wrapped && bar.querySelector(".ow-search").getBoundingClientRect().width < 250) || brand.scrollWidth > brand.clientWidth + 1 || (wrapped && wrap.getBoundingClientRect().top > brand.getBoundingClientRect().top + 4);
    for (let n = cells.length - 1; n > 0 && tight(); n--) cells[n].setAttribute("data-off", "");
    const W = dockEl.clientWidth, tw = toolsEl.offsetWidth, gap = 12, centre = W - 2 * (tw + gap), left = W - tw - gap;
    dockEl.dataset.fit = centre >= 300 ? "center" : left >= 260 ? "left" : "none";
    const dw = Math.min(560, dockEl.dataset.fit === "center" ? centre : left) + "px";
    if (daysEl) daysEl.style.width = dw;
    if (replayEl) replayEl.style.width = dw; // the scrubber takes the days card's place
    // cards sit between the header and the dock, whatever their heights are now
    const R0 = root.getBoundingClientRect(), top = Math.ceil(Math.max(...[...bar.children].map((c) => c.getBoundingClientRect().bottom)) - R0.top) + 12;
    const shown = [...dockEl.children].filter((c) => c.offsetParent);
    const bot = shown.length ? Math.ceil(R0.bottom - Math.min(...shown.map((c) => c.getBoundingClientRect().top))) + 12 : 80;
    root.style.setProperty("--ow-top", top + "px"); root.style.setProperty("--ow-bot", bot + "px");
  }
  $effect(() => { ui.rev; ui.folded.hud; ui.folded.days; ui.replaying; queueMicrotask(fitChrome); });

  // ---- the theme: mode-watcher (the system's, or the viewer's choice from the toolbar or ?theme=) ----
  $effect(() => { ui.theme = mode.current === "dark" ? "dark" : "light"; });
  $effect(() => { const t = ui.theme; map?.setTheme(t); }); // read the theme first: before the map exists, map?. would skip it and the effect would never rerun

  onMount(() => {
    const t = q("theme"); if (t === "dark" || t === "light") setMode(t); // the kiosk and the screensaver
    const ro = new ResizeObserver(() => fitChrome()); ro.observe(root); ro.observe(toolsEl); // the tools grow when the clip and film buttons arrive
    const cinemaMode = ["cinema", "kiosk", "screensaver"].includes(q("mode")) ? q("mode") : null;
    if (stage.clientWidth < 860) ui.folded.crew = true;
    if (stage.clientWidth < 1180 && !ui.foldsKept) { ui.folded.crew = true; ui.folded.detail = true; } // a narrow window: the city first, the cards a click away (not kept: a wider window opens them again)
    const vis = () => (document.hidden ? map?.stop() : map?.start());
    document.addEventListener("visibilitychange", vis);
    let gone = false;
    ui.say("Drawing the city…");
    const refused = q("error"); // Better Auth sends a refused sign-in back here

    (async () => {
      city = await startCity({ stage, root, ui, config, data, layout, members });
      if (gone) return;
      map = city.map;
      ui.onRefresh = () => city.applyPending();
      if (import.meta.env.DEV) window.__city = { city, ui, map }; // for inspection while developing
      ui.setModel(city.model);
      ui.say("");
      if (refused) ui.sayFor(refused === "not_invited" ? "That account is not a member or invited" : "Sign-in did not finish", 8000);
      map.onUser = () => stopTour();
      map.onFrame = () => {
        const h = map.heading(); if (Math.abs(h - ui.heading) > 0.5) { ui.heading = h; root.dataset.az = String(Math.round(h)); }
        return ui.touring;
      };
      ui.heading = map.heading(); root.dataset.az = String(Math.round(ui.heading));
      await new Promise((r) => requestAnimationFrame(r)); // the map sizes its camera to the stage first
      fitChrome();
      map.reset(pads());
      map.setLit(ui.L.idsFor(ui.selected));
      map.start();
      root.dataset.ready = "1"; // drawn (the screenshots wait for this)
      // pick up where the last visit left off (the page reloads itself for a new plan); ?house=<login> opens on that
      // person's house (the welcome comment links here)
      const r = city.restore, P = ui.model.people, ST = ui.model.stations, R = ui.model.repos;
      if (r) { map.restore(r.camera ?? r); if (r.selected && (r.selected.kind !== "person" || P[r.selected.id]) && (r.selected.kind !== "station" || ST[r.selected.id] || R[r.selected.id])) pick(r.selected.kind, r.selected.id, { fly: false }); }
      const h = q("house"); if (h && ui.L.contributor(h)) setTimeout(() => pick("station", "person:" + h), 400);
      // each event plays as an effect on its building (and cuts the cinema to it)
      const play = (prims, e) => { map.fx(prims); if (e?.repo) cinema?.onEffect([e.repo]); };
      city.startLive(play);
      city.startReplay({ fx: (p) => map.fx(p) }).then(() => (replay = city.replay));
      city.arrival({ cinema: !!cinemaMode });
      if (ui.mode === "3d") start3dExtras(cinemaMode);
    })().catch((err) => { console.error(err); ui.say("The city could not be drawn: " + err.message, "ow-error"); });
    return () => { gone = true; ro.disconnect(); document.removeEventListener("visibilitychange", vis); map?.stop(); };
  });

  // cinema and kiosk modes, clips and the year film: 3D only
  async function start3dExtras(mode) {
    const still = city.still;
    if (mode) {
      const { startCinema } = await import("../client/cinema.js");
      const none = { t: 24, r: 24, b: 24, l: 24 };
      cinema = startCinema({ mode, root, map, still, model: ui.model, data: city.data, timeZone: city.timeZone, focus: (ids, ms) => map.focus(ids, none, ms, 240), home: (ms) => map.home(none, ms) });
    }
    const { canClip, recordClip, save } = await import("../client/clip.js");
    if (!canClip()) return;
    const stamp = () => new Intl.DateTimeFormat("en-GB", { timeZone: city.timeZone || "UTC", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date()).toUpperCase();
    const named = () => (ui.selected ? " · " + (ui.selected.kind === "person" ? ui.model.people[ui.selected.id]?.n : String(ui.selected.id).replace(/^person:/, "")) : "");
    // a clip: 15 seconds of this view, captioned with the moment, the selection and the latest event
    clip = { left: 0, go: async () => {
      if (clip.left) return;
      clip.left = 15; const tick = setInterval(() => (clip.left = Math.max(1, clip.left - 1)), 1000);
      const when = () => (ui.replay.open ? ui.replay.label : stamp());
      try {
        const blob = await recordClip({ source: () => map.renderer.domElement, onFrame: (f) => map.tap(f), caption: () => [`${title.toUpperCase()} · ${when()}${named()}`, ui.lastEvent || `github.com/${org} · height is history, light is now`] });
        save(blob, `${slug}-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      } catch (e) { console.error(e); }
      clearInterval(tick); clip.left = 0;
    } };
    // the year film (client/film.js): twelve months from the log, recorded with the month as the caption
    film = { busy: false, error: "", go: async () => {
      if (film.busy || city.replaying) return;
      film.busy = true; pick(null, null, { fly: false }); // the film shows the whole city
      let lines = [`${title.toUpperCase()} · THE YEAR`, ""];
      try {
        const { playFilm } = await import("../client/film.js");
        const done = playFilm({ url: city.filmUrl, getData: () => city.data, patch: (d, ids) => city.patch(d, ids), fx: (p) => map.fx(p), modelOf: () => ui.model, home: (ms) => map.home(pads(), ms), orbit: (deg) => map.orbit(deg), timeZone: city.timeZone || "UTC", title, org, onCaption: (l) => { lines = l; }, setReplaying: (on) => city.setReplaying(on) });
        const blob = await recordClip({ source: () => map.renderer.domElement, onFrame: (f) => map.tap(f), caption: () => lines, seconds: 120, until: done });
        await done;
        save(blob, `${slug}-year-${new Date().toISOString().slice(0, 10)}.${blob.type.includes("mp4") ? "mp4" : "webm"}`);
      } catch (e) { console.error(e); film.error = e.message; }
      film.busy = false;
    } };
  }
</script>

<svelte:window onkeydown={keydown} />

<Tooltip.Provider delayDuration={300}>
<div class="iso ow-root ow-app" bind:this={root} data-theme={ui.theme}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <div class="ow-stage" bind:this={stage} tabindex="0" role="application" aria-label="{title} map. Arrow keys step between stations, Enter opens one, plus and minus zoom."
    onpointerdown={pointerdown} onpointerup={pointerup} onpointermove={pointermove} onpointerleave={() => { if (!down) hover(null); }} ondblclick={dblclick}></div>
  <Header {ui} {org} name={config.name || org} days={data.window?.days ?? 30} onpick={choose} bind:search bind:bar bind:hud />
  <Crew {ui} onpick={choose} onhover={hover} bind:el={crewEl} />
  <Detail {ui} onpick={choose} onhover={hover} onclose={close} bind:el={detailEl} />
  <Button variant="outline" size="icon-lg" class="ow-restore ow-restore-detail" aria-label="Show the detail card" hidden={!ui.model || !(ui.folded.detail || (ui.narrow && !ui.selected && !ui.wantOverview))}
    onclick={() => { ui.fold("detail", false); ui.wantOverview = true; }}><Icon name="detail" size="1.1em" /><i class="ow-dot" hidden={!ui.selected}></i></Button>
  <div class="ow-dock" bind:this={dockEl}>
    <Days {ui} onpick={choose} onhover={hover} bind:el={daysEl} />
    <Replay {ui} {replay} bind:el={replayEl} />
    <Tools {ui} {act} {clip} {film} bind:el={toolsEl} />
  </div>
  <Legend {ui} {config} portal={root} />
  <Tip {ui} />
  <Toaster position="top-center" offset={64} />
  <div class="ow-sr" aria-live="polite">{ui.live}</div>
</div>
</Tooltip.Provider>
