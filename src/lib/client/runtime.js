// The city in the browser: draws it (in a worker when the browser allows), makes the 3D map, and keeps
// it current: the live stream's deltas and each new snapshot redraw only the stations they changed, the scrubber
// and the year film show the past, the water tower shows the app's health. The page's chrome (lib/ui) reads and
// drives it through `ui` (lib/ui/city.svelte.js).
import { ISO_CSS } from "../city/kit/iso-kit.mjs";
import { stationsFor } from "../city/stations.js";
import { merge } from "./model.js";

const POLL = 120 * 1000; // how often to look for a new snapshot without the stream
const IDLE = 90 * 1000; // apply a new plan on its own after this long without input

// ---- a builder that prefers a worker and falls back to the main thread ----
function makeBuilder(input) {
  let worker = null, seq = 0;
  const waiting = new Map();
  try {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (e) => { const w = waiting.get(e.data.id); if (!w) return; waiting.delete(e.data.id); e.data.ok ? w.ok(e.data.city) : w.fail(new Error(e.data.error)); };
    worker.onerror = () => { worker = null; for (const [, w] of waiting) w.retry(); waiting.clear(); };
    worker.postMessage({ type: "data", ...input });
  } catch { worker = null; }
  const local = async (az, three) => { const { buildCity } = await import("../city/city.js"); return buildCity({ ...input, az, three }); };
  const build = (az, three = false) => new Promise((ok, fail) => {
    if (!worker) return local(az, three).then(ok, fail);
    const id = ++seq;
    waiting.set(id, { ok, fail, retry: () => local(az, three).then(ok, fail) });
    worker.postMessage({ type: "build", id, az, three });
  });
  // build.stations: the city with new data, cut down to these stations (city/stations.js)
  const localStations = async (az, three, ids) => {
    const [{ buildCity }, { stationFragments }] = await Promise.all([import("../city/city.js"), import("../city/stations.js")]);
    const c = buildCity({ ...input, az, three, only: ids }); return { fragments: stationFragments(c.svg, ids), model: c.model };
  };
  build.stations = (data, az, three, ids, layout = null) => new Promise((ok, fail) => {
    input.data = data; if (layout) input.layout = layout;
    if (!worker) return localStations(az, three, ids).then(ok, fail);
    const id = ++seq;
    waiting.set(id, { ok, fail, retry: () => localStations(az, three, ids).then(ok, fail) });
    worker.postMessage({ type: "stations", id, data, layout, az, three, ids });
  });
  return build;
}

const webgl = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };
const q = (k) => new URLSearchParams(location.search).get(k);

// stage: the map's element; ui: the chrome's state; data and layout: the city now (the page's load);
// members: the signed-in city
export async function startCity({ stage, root, ui, config, data, layout, members = false }) {
  const at = (p) => (members && /^(data\.json|layout\.json|events|film|events\/between)/.test(p) ? "/members/" + p : "/" + p);
  const getJson = async (p) => { const r = await fetch(at(p) + `?t=${Date.now()}`, { cache: "no-store", credentials: "include" }); if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.json(); };
  if (!document.getElementById("ow-iso-css")) { const style = document.createElement("style"); style.id = "ow-iso-css"; style.textContent = ISO_CSS; document.head.prepend(style); }

  let restore = null;
  try { restore = JSON.parse(sessionStorage.getItem("ow-restore") || "null"); sessionStorage.removeItem("ow-restore"); } catch {}
  // the org's clock (city.timezone, UTC by default); ?tz=local or an IANA name overrides it for this viewer
  const tzAsk = q("tz"), timeZone = tzAsk === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : tzAsk || config.timezone || "UTC";
  const still = q("motion") === "reduced" || matchMedia("(prefers-reduced-motion: reduce)").matches; // ?motion=reduced: the screensaver and the wallpaper
  const city = { data, layout, mode: "3d", timeZone, still, replaying: false, afterReplay: new Set(), restore, members };
  if (!webgl()) { ui.say("This city is drawn with WebGL, which this browser does not have", "ow-error"); throw new Error("no WebGL"); }
  const build = makeBuilder({ data, layout, config });
  city.build = build;

  // two records of the city: the faces seen from the south-east and from the north-west, merged in 3D
  const [A, B] = await Promise.all([build(72, true), build(252, true)]);
  const model = A.model;
  const { createMap } = await import("../view/map3d.js");
  const map = createMap({ container: stage, recA: A.svg, recB: B.svg, model, theme: ui.theme, still, timeZone });
  city.map = map; city.model = model;

  // ---- in place: new data redraws only the stations it changed, one patch at a time ----
  let patching = Promise.resolve();
  // opts.layout: a new layout (a repository placed live); opts.remove: the cells it claimed, whose stand-ins go
  city.patch = (next, ids, { layout: L = null, remove = [] } = {}) => {
    if (!ids.length) return patching;
    return (patching = patching.then(async () => {
      if (L) city.layout = L;
      const [a, b] = await Promise.all([build.stations(next, 72, true, ids, L), build.stations(next, 252, true, ids, L)]);
      map.replaceStations(a.fragments, b.fragments, remove.map((k) => "cell:" + k));
      merge(model, a.model); map.setModel({ runs: a.model.runs, drones: a.model.drones, ticker: a.model.ticker, roofs: a.model.roofs });
      ui.changed();
    }).catch((e) => console.error("in-place update failed", e)));
  };
  // a reload keeps where the viewer was (a new ring or landmark, or a new plan the city cannot patch)
  city.reload = () => { try { sessionStorage.setItem("ow-restore", JSON.stringify({ ...map.state(), selected: ui.selected })); } catch {} location.reload(); };
  city.setReplaying = (on) => {
    city.replaying = on; ui.replaying = on;
    if (!on && city.afterReplay.size) { const ids = [...city.afterReplay]; city.afterReplay.clear(); city.patch(city.data, ids); }
  };
  city.eventsBetween = async (a, b, kinds) => (await fetch(at(`events/between?from=${a}&to=${b}${kinds ? `&kinds=${kinds}` : ""}`), { credentials: "include" })).json();
  city.filmUrl = at("film");

  // ---- live: the app's stream; each event plays as an effect on its building, its delta redraws in place ----
  city.startLive = async (play) => {
    const { startLive } = await import("./live.js");
    const applyDelta = (d, delta) => { if (delta.placed) d.repos[delta.placed.repo] ??= { ...delta.repos[delta.placed.repo] }; for (const [n, p] of Object.entries(delta.repos ?? {})) if (d.repos[n]) Object.assign(d.repos[n], p); for (const [i, n] of Object.entries(delta.days ?? {})) if (d.days?.[i]) d.days[i].n = n; for (const [id, w] of Object.entries(delta.wards ?? {})) if (d.wards) d.wards[id] = w; return Object.keys(delta.repos ?? {}).filter((n) => d.repos[n]); };
    const ring = (k) => Math.max(...k.split(",").map((c) => Math.abs(+c - 7))) - 7;
    let queued = { repos: new Set(), days: new Set(), people: new Set(), cells: new Set(), born: [], layout: null }, flush = 0;
    const onDelta = (delta) => { // the stream's deltas, folded into the page's data and redrawn in place, a burst at a time
      if (delta.placed) { // a new repository: it gets its place live, unless it needs the city's plan redrawn
        const p = delta.placed, r = p.at && /^-?\d+,-?\d+$/.test(p.at) ? ring(p.at) : 0;
        const rings = Math.max(0, ...Object.values(city.layout?.houses ?? {}).map((v) => ring(v.split(":")[0])), ...Object.keys(city.layout?.lots ?? {}).map(ring));
        applyDelta(city.data, delta);
        if (!p.at || p.landmark || r > rings) { askReload(`${p.repo} is in town · refresh`); return; } // a new ring or a landmark: the plan grows, so the page redraws it once the viewer is idle
        city.patch(city.data, [p.repo], { layout: delta.layout, remove: [p.at] });
        return;
      }
      for (const name of applyDelta(city.data, delta)) queued.repos.add(name);
      for (const id of Object.keys(delta.wards ?? {})) queued.repos.add("ward:" + id); // a Basecamp ward's signals (the members' city)
      for (const [login, c] of Object.entries(delta.contributors ?? {})) { const list = city.data.contributors ??= []; const x = list.find((y) => y.login === login); if (x) Object.assign(x, c); else list.push({ login, ...c }); queued.people.add(login); } // a house grows, or a new one is built
      if (delta.houses?.length) { city.layout = delta.layout; queued.layout = delta.layout; for (const h of delta.houses) { queued.people.add(h.login); queued.cells.add(h.at); queued.born.push(h.login); } }
      for (const i of Object.keys(delta.days ?? {})) queued.days.add(+i);
      clearTimeout(flush);
      flush = setTimeout(flushNow, 1200);
    };
    function flushNow() { // a hidden tab keeps the data current and holds its patches until it shows again
        if (document.hidden) return;
        const ids = [...stationsFor([...queued.repos], [...queued.days]), ...[...queued.people].map((l) => "person:" + l)];
        // a new house in a block that had none takes its block's stand-in away (the block's scenery, data-cell)
        const remove = [...queued.cells].filter((cell) => !Object.entries(city.layout?.houses ?? {}).some(([l, w]) => w.startsWith(cell + ":") && !queued.born.includes(l)));
        const born = queued.born, L = queued.layout;
        queued = { repos: new Set(), days: new Set(), people: new Set(), cells: new Set(), born: [], layout: null };
        if (city.replaying && !L) { ids.forEach((id) => city.afterReplay.add(id)); return; } // the scrubber shows the past: redraw on the way back
        city.patch(city.data, ids, { layout: L, remove }).then(() => { for (const login of born) play([{ t: "drop", at: model.homes?.[login], hue: "a" }, { t: "ring", at: model.homes?.[login], hue: "a", r: 12, delay: 0.5 }].filter((p) => p.at)); }); // contributor.new
    }
    document.addEventListener("visibilitychange", () => { if (!document.hidden && (queued.repos.size || queued.days.size || queued.people.size || queued.cells.size)) flushNow(); });
    city.live = startLive({ url: at("events"), config, model, modelOf: () => model, onDelta, onSnapshot: () => check(), generatedAt: () => city.data.generatedAt, announce: (t) => ui.announce(t),
      play: (prims, e) => { play(prims, e); if (e.kind === "commit" && e.title) map.tick(`${e.repo} · ${e.title}`); if (e.summary) ui.lastEvent = e.summary; },
      say: (t, ms) => ui.sayFor(t, ms) });
  };

  // ---- a new snapshot: in place when the city's plan holds, else a reload when the viewer is idle or asks ----
  let pending = null, lastInput = Date.now();
  const askReload = (text) => { pending = true; ui.say(text, "ow-fresh"); }; // a reload the page cannot patch: when the viewer is idle, or on Refresh
  setInterval(() => { if (pending && Date.now() - lastInput > IDLE) city.reload(); }, 15000);
  for (const ev of ["pointerdown", "keydown", "wheel", "touchstart"]) addEventListener(ev, () => (lastInput = Date.now()), { passive: true });
  async function check() {
    if (document.hidden) return;
    try {
      const next = await getJson("data.json"), current = city.data;
      if (next.generatedAt && next.generatedAt !== current.generatedAt) {
        const L = await getJson("layout.json").catch(() => null);
        const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
        const holds = L && same(L, city.layout) && same(Object.keys(next.repos).sort(), Object.keys(current.repos).sort()) && (next.contributors?.length ?? 0) === (current.contributors?.length ?? 0) && same(next.patrons, current.patrons) && next.window?.from === current.window?.from;
        if (holds) {
          const repos = Object.keys(next.repos).filter((n) => !same(next.repos[n], current.repos[n]));
          const days = next.days.map((d, i) => (d.n !== current.days[i]?.n ? i : -1)).filter((i) => i >= 0);
          // a house follows its person (the lamp and the lit panes, this week) and its contributor record (the height); a ward its signals
          const by = (list, key) => Object.fromEntries((list ?? []).filter((x) => x[key]).map((x) => [x[key], x]));
          const P0 = by(current.people, "gh"), P1 = by(next.people, "gh"), C0 = by(current.contributors, "login"), C1 = by(next.contributors, "login");
          const houses = Object.keys(city.layout?.houses ?? {}).filter((l) => !same(P1[l], P0[l]) || !same(C1[l], C0[l])).map((l) => "person:" + l);
          const wards = Object.keys(next.wards ?? {}).filter((id) => !same(next.wards[id], current.wards?.[id])).map((id) => "ward:" + id);
          next.health = current.health; city.data = next;
          await city.patch(next, stationsFor(repos, days).concat(houses, wards));
          return;
        }
        const was = Object.values(current.repos).reduce((t, r) => t + r.c7, 0), now = Object.values(next.repos).reduce((t, r) => t + r.c7, 0);
        const added = Object.keys(next.repos).filter((n) => !current.repos[n]).length;
        askReload(added ? `${added} new ${added === 1 ? "repository" : "repositories"} in town · refresh` : now > was ? `${now - was} new commits this week · refresh` : "The city has new data · refresh");
      }
    } catch {}
    if (pending && Date.now() - lastInput > IDLE) city.reload();
  }
  city.check = check;
  city.applyPending = () => { if (pending) city.reload(); };
  setInterval(check, POLL);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) check(); });

  // ---- the water tower: the snapshot's freshness and the stream's state, in eighths; only the tower redraws ----
  let healthKey = "";
  async function health() {
    if (city.replaying) return;
    let t = city.data.generatedAt || city.data.now, every = 3600; // the scan interval, from /status (an hour by default)
    try { const s = await (await fetch("/status")).json(); t = s.scan?.ok ? s.scan.at : s.base?.generatedAt || t; if (s.scan?.every > 0) every = s.scan.every * 60; } catch {}
    const age = Date.now() / 1000 - t, level = Math.round(8 * Math.max(0, Math.min(1, 1 - (age - every) / (2 * every)))) / 8; // full within one interval, empty two intervals later
    const st = city.live?.state?.(), lamp = st === undefined ? "off" : st === 1 ? "ok" : "down";
    const key = `${level}|${lamp}|${city.data.generatedAt}`; if (key === healthKey) return;
    healthKey = key; city.data.health = { level, lamp }; city.patch(city.data, ["relay"]);
  }
  setTimeout(health, 4000); setTimeout(() => { health(); setInterval(health, 30000); }, 12000); // the second look sees the stream connected

  // ---- the arrival (a first visit or ?arrive), or for a returning visitor what happened since ----
  city.arrival = async ({ cinema }) => {
    const { arrivalOrder, catchUp } = await import("./arrival.js");
    let last = null; try { last = +localStorage.getItem("ow-last-visit") || null; localStorage.setItem("ow-last-visit", String(city.data.now)); } catch {}
    if (new URLSearchParams(location.search).has("arrive") || (!last && !restore && !cinema)) map.arrive(arrivalOrder(city.layout, city.data));
    else if (!restore && !cinema) { const line = await catchUp({ data: city.data, last, eventsBetween: (a, b) => city.eventsBetween(a, b, "commit,pr.merge,release,repo.new") }); if (line) ui.sayFor(line, 7000); }
  };

  // ---- the scrubber over the last 30 days (client/replay.js) ----
  city.startReplay = async ({ fx }) => {
    const { createReplay } = await import("./replay.js");
    city.replay = createReplay({
      onChange: (s) => (ui.replay = s), getData: () => city.data, patch: (d, ids) => city.patch(d, ids), stationsFor, timeZone,
      setClock: (d) => map.setClock?.(d), fx, modelOf: () => model,
      eventsBetween: (a, b) => city.eventsBetween(a, b), onState: (on) => city.setReplaying(on),
    });
  };
  return city;
}
